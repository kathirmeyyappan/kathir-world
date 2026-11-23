"""Where a body walks: a graph over the floor the buildings stand on, for a bot finding a way
somewhere on foot (up the tower's stair, say).

``npm run bot-map`` builds it with the real sim (``packages/shared/src/sim/botMap/ground.ts``): the
spots a player can stand on a 1 m grid round whatever stands and the rectangles of open floor
between, joined where the sim walks between them, with the jumps of each way of moving. It stops
at the roads out of that floor: a spot beyond has no node.
"""

from __future__ import annotations

import heapq
import math
import random
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import Any

from ..protocol import Vec3
from . import once, read
from .bodies import Bodies, load_bodies
from .solids import CELL, Piece, cells_over, piece_of

OPEN_STEP = 0.5  # metres between the spots a straight walk across open floor is checked at
ONTO = 1.5  # metres at either end of a straight walk it may take to get onto open floor: a diagonal step
FLOOR = 0.6  # metres up or down from the floor that still stand on it
CHEST = 1.0  # metres up from the feet that a walk runs into a door at
BY_DOOR = 2.0  # metres round a door's slab that a spot whose ways out may go through its doorway is within
JUMP_COST = 2.0  # metres of walking a route would rather take than one jump
# How much a search for a way makes of the straight line left to its goal. Past 1 it settles for a
# way a little longer than the shortest (a fiftieth on the whole, a fifth at the worst), found over
# a fraction of the nodes: a goal up a stair is far further off than it looks from under it.
HASTE = 1.5


@dataclass(frozen=True, slots=True)
class Region:
    """A floor area (Region in packages/shared/src/sim/regions.ts): a disc of radius ``r``, or a
    ``w`` x ``d`` rectangle along the axes, centred on (x, z) at height ``y``."""

    kind: str
    x: float
    z: float
    y: float
    r: float = 0
    w: float = 0
    d: float = 0

    def covers(self, x: float, z: float) -> bool:
        """Whether the spot (x, z) is over it."""
        dx, dz = x - self.x, z - self.z
        if self.kind == "disc":
            return math.hypot(dx, dz) <= self.r
        return abs(dx) <= self.w / 2 and abs(dz) <= self.d / 2

    def random_point(self, margin: float, rng: random.Random) -> Vec3:
        """A spot on it at least ``margin`` from its edge, uniform over its area."""
        if self.kind == "disc":
            radius = max(0.0, self.r - margin) * math.sqrt(rng.random())
            angle = rng.uniform(0, 2 * math.pi)
            return Vec3(self.x + radius * math.cos(angle), self.y, self.z + radius * math.sin(angle))
        half_w, half_d = max(0.0, self.w / 2 - margin), max(0.0, self.d / 2 - margin)
        return Vec3(self.x + rng.uniform(-half_w, half_w), self.y, self.z + rng.uniform(-half_d, half_d))


@dataclass(frozen=True, slots=True)
class Area:
    """A rectangle of open floor (``openFloor`` in packages/shared/src/sim/botMap/ground.ts): its
    corner with the least x and z, and its metres along x and z. Nothing stands on it or near it,
    so a body walks straight from anywhere on it to anywhere else, and onto it from a step off it."""

    x: float
    z: float
    w: float
    d: float

    def holds(self, x: float, z: float) -> bool:
        return self.x <= x < self.x + self.w and self.z <= z < self.z + self.d

    def off(self, x: float, z: float) -> float:
        """Metres from (x, z) to the rectangle, 0 on it."""
        return math.hypot(max(self.x - x, 0, x - self.x - self.w), max(self.z - z, 0, z - self.z - self.d))


class Jumps(dict[int, frozenset[int]]):
    """Per node, the nodes only a running jump reaches from it: none, for a node it doesn't hold."""

    def __missing__(self, node: int) -> frozenset[int]:
        return _NO_JUMPS


_NO_JUMPS: frozenset[int] = frozenset()


class Ground:
    def __init__(self, ground: Mapping[str, Any], moves: Mapping[str, Any], bodies: Bodies):
        # Every door's slab where it stands shut, by the door's id (a double door has two); the
        # graph walks through each as if it stood open.
        self.doors = tuple((str(d["id"]), piece_of(d["slab"])) for d in ground["doors"])
        # Where a player can stand (feet); for each, the neighbours they can walk straight to, and
        # the ones only a running jump reaches.
        self.nodes = tuple(Vec3(float(x), float(y), float(z)) for x, y, z in ground["nodes"])
        self._at = tuple((n.x, n.y, n.z) for n in self.nodes)
        self.edges = tuple(tuple(int(j) for j in out) for out in ground["edges"])
        # The rectangles of open floor by their nodes, and by the grid cells they cover.
        self.areas = {int(i): Area(float(x), float(z), float(w), float(d)) for i, x, z, w, d in ground["areas"]}
        self._area_cells: dict[tuple[int, int], list[int]] = {}
        for i, a in self.areas.items():
            for key in cells_over(a.x, a.z, a.x + a.w, a.z + a.d):
                self._area_cells.setdefault(key, []).append(i)
        # Per node, the nodes only a running jump reaches, for each way a look on foot moves (its
        # walk and jump power); the bodies say which of those each avatar's is. ``jumps`` is the
        # standard body's.
        self._jump_sets = {
            str(move): Jumps((i, frozenset(int(j) for j in out)) for i, out in enumerate(jumps) if out)
            for move, jumps in moves["jumps"].items()
        }
        self._bodies = bodies
        self.jumps = self.jumps_of("standard")
        # Spots well up with a wide view out (the balconies and decks), all reachable on foot.
        self.lookouts = tuple(int(i) for i in ground["lookouts"])
        # The lookouts by where they are: "tower" (its balconies and roof), "building" (a building's
        # roof and the foot of its staircase) or "elsewhere" (the terrace and the ways up to it).
        self.places: dict[str, tuple[int, ...]] = {}
        for i, place in zip(self.lookouts, ground["lookoutPlaces"], strict=True):
            self.places[str(place)] = (*self.places.get(str(place), ()), i)
        # The floors indoors: the tower's four inside its wall, ground floor first, then each keep's.
        self.insides = tuple(
            Region(
                kind=str(r["kind"]),
                x=float(r["x"]),
                z=float(r["z"]),
                y=float(r["y"]),
                r=float(r.get("r", 0)),
                w=float(r.get("w", 0)),
                d=float(r.get("d", 0)),
            )
            for r in ground["insides"]
        )
        # Every node inside a building's wall, the stairs between its floors included.
        self.indoors = frozenset(int(i) for i in ground["indoors"])
        self._columns: dict[tuple[int, int], list[int]] = {}
        for i, n in enumerate(self.nodes):
            self._columns.setdefault((round(n.x), round(n.z)), []).append(i)
        self._from_main, self._to_main = self._mainland()
        # The spots by a door, whose ways out may go through its doorway, and the door each of
        # those ways goes through, as asked.
        self._by_doors = frozenset(i for _, slab in self.doors for i in self._nodes_by(slab))
        self._doorways: dict[tuple[int, int], tuple[str, Piece] | None] = {}

    def jumps_of(self, avatar: str) -> Jumps:
        """Per node, the nodes only ``avatar``'s running jump reaches; the standard body's for an
        avatar the maps don't know."""
        return self._jump_sets[self._bodies.move_of(avatar)]

    def _mainland(self) -> tuple[bytearray, bytearray]:
        """Per node, whether a body gets to it from the middle of the main disc, and whether one
        gets from it back there, by walks and by any body's jumps with every door open. Most of the
        graph is both, and the rest is where a way can't be: none leads from a spot the main floor
        reaches to one it doesn't, nor to a spot that gets back there from one that doesn't."""
        middle = self.node_at(Vec3(0, 0, 0))
        assert middle is not None
        out = [list(walks) for walks in self.edges]
        for jumps in self._jump_sets.values():
            for i, reached in jumps.items():
                out[i].extend(reached)
        back: list[list[int]] = [[] for _ in out]
        for i, onward in enumerate(out):
            for j in onward:
                back[j].append(i)
        flooded = []
        for steps in (out, back):
            got = bytearray(len(steps))
            got[middle] = 1
            edge = [middle]
            while edge:
                i = edge.pop()
                for j in steps[i]:
                    if not got[j]:
                        got[j] = 1
                        edge.append(j)
            flooded.append(got)
        return flooded[0], flooded[1]

    def area_at(self, feet: Vec3) -> int | None:
        """The node of the rectangle of open floor ``feet`` stands on, if it's on one."""
        if abs(feet.y) > FLOOR:
            return None
        cell = (math.floor(feet.x / CELL), math.floor(feet.z / CELL))
        return next((i for i in self._area_cells.get(cell, ()) if self.areas[i].holds(feet.x, feet.z)), None)

    def straight(self, a: Vec3, b: Vec3) -> bool:
        """Whether a walk straight from ``a`` to ``b`` (feet) keeps to open floor, but for a step
        onto it at either end: its middle is on it, however short it is."""
        if abs(a.y) > FLOOR or abs(b.y) > FLOOR:
            return False
        length = math.hypot(b.x - a.x, b.z - a.z)
        steps = math.ceil(length / OPEN_STEP)
        along = [k / steps for k in range(1, steps) if ONTO < length * k / steps < length - ONTO] or [0.5]
        return all(self.area_at(Vec3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t)) is not None for t in along)

    def doorway(self, i: int, j: int) -> tuple[str, Piece] | None:
        """The door, and its slab, whose doorway the way from node ``i`` to node ``j`` goes
        through: what stands across it when the door is shut."""
        if i not in self._by_doors:
            return None
        if (i, j) not in self._doorways:
            a, b = self.nodes[i], self.nodes[j]
            length = math.hypot(b.x - a.x, b.z - a.z)
            chest = Vec3(a.x, a.y + CHEST, a.z)
            d = ((b.x - a.x) / length, 0.0, (b.z - a.z) / length)
            self._doorways[(i, j)] = next(
                ((door, slab) for door, slab in self.doors if slab.hit(chest, d, length)), None
            )
        return self._doorways[(i, j)]

    def _nodes_by(self, slab: Piece) -> Iterator[int]:
        """The nodes within BY_DOOR of a door's slab, about its height."""
        span = math.ceil(math.hypot(slab.hw, slab.hd) + BY_DOOR)
        for dx in range(-span, span + 1):
            for dz in range(-span, span + 1):
                for i in self._columns.get((round(slab.x) + dx, round(slab.z) + dz), ()):
                    n = self.nodes[i]
                    lx, lz = slab.local(n.x, n.z)
                    if abs(lx) <= slab.hw + BY_DOOR and abs(lz) <= slab.hd + BY_DOOR and abs(n.y - slab.base) < FLOOR:
                        yield i

    def node_at(self, feet: Vec3, reach: float = 3) -> int | None:
        """The node nearest ``feet`` (a player's ``pos`` less EYE_HEIGHT) within ``reach`` metres,
        a rectangle of open floor as near as the nearest of it; None off the walked floor."""
        best: int | None = None
        best_distance = reach
        span = math.ceil(reach)
        cx, cz = round(feet.x), round(feet.z)
        for dx in range(-span, span + 1):
            for dz in range(-span, span + 1):
                for i in self._columns.get((cx + dx, cz + dz), ()):
                    n = self.nodes[i]
                    distance = math.dist((n.x, n.y, n.z), (feet.x, feet.y, feet.z))
                    if distance < best_distance and i not in self.areas:
                        best, best_distance = i, distance
        if abs(feet.y) <= FLOOR:
            near = {
                i
                for key in cells_over(feet.x - reach, feet.z - reach, feet.x + reach, feet.z + reach)
                for i in self._area_cells.get(key, ())
            }
            # Nearest middle first, so a spot on the line between two rectangles is the one's whose
            # middle it's nearer, whatever order they come in.
            for i in sorted(near, key=lambda i: math.hypot(self.nodes[i].x - feet.x, self.nodes[i].z - feet.z)):
                distance = self.areas[i].off(feet.x, feet.z)
                if distance < best_distance:
                    best, best_distance = i, distance
        return best

    def nodes_in(self, region: Region, rise: float = 0.6) -> list[int]:
        """Every node standing on ``region``: over it and within ``rise`` of its height."""
        return [i for i, n in enumerate(self.nodes) if abs(n.y - region.y) <= rise and region.covers(n.x, n.z)]

    def nodes_near(self, feet: Vec3, radius: float, rise: float = 3) -> list[int]:
        """Every node within ``radius`` metres across the floor of ``feet`` and ``rise`` up or down:
        the spots around a player on their own floor."""
        span = math.ceil(radius)
        cx, cz = round(feet.x), round(feet.z)
        return [
            i
            for dx in range(-span, span + 1)
            for dz in range(-span, span + 1)
            for i in self._columns.get((cx + dx, cz + dz), ())
            if math.hypot(self.nodes[i].x - feet.x, self.nodes[i].z - feet.z) <= radius
            and abs(self.nodes[i].y - feet.y) <= rise
        ]

    def path(self, start: int, goal: int, avatar: str = "standard", doors: bool = False) -> list[int] | None:
        """A way from node ``start`` to node ``goal`` (both ends included) for a body that moves as
        ``avatar`` does, all but the shortest there is (``HASTE``), or None when there's none. It
        jumps only where walking can't get there, and only where that avatar's jump does
        (``jumps_of``), and goes through a doorway only with ``doors``, for a bot whose ``Route``
        opens them. A few milliseconds across the map, tens up the tower: a bot looks for one off
        its event loop."""
        if (self._from_main[start] and not self._from_main[goal]) or (self._to_main[goal] and not self._to_main[start]):
            return None
        at, edges, jumps = self._at, self.edges, self.jumps_of(avatar)
        end = at[goal]
        frontier = [(0.0, start)]
        cost = {start: 0.0}
        came_from: dict[int, int] = {}
        settled: set[int] = set()
        while frontier:
            _, i = heapq.heappop(frontier)
            if i == goal:
                way = [i]
                while way[-1] != start:
                    way.append(came_from[way[-1]])
                return way[::-1]
            if i in settled:
                continue
            settled.add(i)
            here, so_far = at[i], cost[i]
            shut = not doors and i in self._by_doors
            for hop, reached in ((0.0, edges[i]), (JUMP_COST, jumps[i])):
                for j in reached:
                    if shut and self.doorway(i, j) is not None:
                        continue
                    there = at[j]
                    to = so_far + math.dist(here, there) + hop
                    if to < cost.get(j, math.inf):
                        cost[j] = to
                        came_from[j] = i
                        heapq.heappush(frontier, (to + HASTE * math.dist(there, end), j))
        return None


@once
def load_ground() -> Ground:
    return Ground(read("ground"), read("moves"), load_bodies())
