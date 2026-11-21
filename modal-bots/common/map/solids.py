"""What's solid, anywhere in the world: the floor's parts and every structure, the same lists the
server collides with (``packages/shared/src/sim/botMap/solids.ts``), for a bot that needs to see
past walls or know where there's ground to stand on.

``clear`` mirrors the sim's line of sight (``Structures.clear``) and ``ground_at`` its ground
(``Structures.groundAt``); the map carries the sim's own answers to a few of each, which the tests
hold these to.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

from ..protocol import Vec3
from . import read

CELL = 8.0  # metres per side of the grid that pieces and the floor's parts are looked up in
RAY_STEP = 0.05  # metres between samples where a sight line crosses a sloped top (collision.ts)
OUTSIDE_HEIGHT = -10.0  # metres the ground past the floor's edge stands above it (ground.ts)


@dataclass(frozen=True, slots=True)
class Piece:
    """One structure placed in the world: a w x d footprint turned by yaw, from ``base`` up to
    ``top(lx, lz)`` above it at each local point."""

    x: float
    z: float
    cos: float
    sin: float
    hw: float
    hd: float
    base: float
    height: float
    top: Callable[[float, float], float]

    def local(self, x: float, z: float) -> tuple[float, float]:
        dx = x - self.x
        dz = z - self.z
        return dx * self.cos - dz * self.sin, dx * self.sin + dz * self.cos

    def hit(self, o: Vec3, d: tuple[float, float, float], max_t: float) -> bool:
        """Whether the ray from ``o`` along unit ``d`` enters the piece within ``max_t`` (the sim's
        ``Structures.raycast``)."""
        ox, oz = self.local(o.x, o.z)
        dx = d[0] * self.cos - d[2] * self.sin
        dz = d[0] * self.sin + d[2] * self.cos
        t0, t1 = 0.0, max_t
        spans = (
            (ox, dx, -self.hw, self.hw),
            (oz, dz, -self.hd, self.hd),
            (o.y, d[1], self.base, self.base + self.height),
        )
        for v, dv, lo, hi in spans:
            if abs(dv) < 1e-12:
                if v < lo or v > hi:
                    return False
                continue
            a = (lo - v) / dv
            b = (hi - v) / dv
            t0 = max(t0, min(a, b))
            t1 = min(t1, max(a, b))
        t = t0
        while t <= t1:
            lx = max(-self.hw, min(self.hw, ox + dx * t))
            lz = max(-self.hd, min(self.hd, oz + dz * t))
            if o.y + d[1] * t <= self.base + self.top(lx, lz) + 1e-9:
                return True
            t += RAY_STEP
        return False


class Solids:
    def __init__(self, solids: Mapping[str, Any]):
        self.pieces = tuple(piece_of(s) for s in solids["structures"])
        self.sight_checks = tuple(tuple(float(v) for v in check) for check in solids["sightChecks"])
        self.ground_checks = tuple(tuple(float(v) for v in check) for check in solids["groundChecks"])
        self._cells: dict[tuple[int, int], list[int]] = {}
        for i, p in enumerate(self.pieces):
            r = math.hypot(p.hw, p.hd)
            for key in cells_over(p.x - r, p.z - r, p.x + r, p.z + r):
                self._cells.setdefault(key, []).append(i)
        # Each part of the floor as whether a spot is on it, by the cells its box covers.
        self._floor: dict[tuple[int, int], list[Callable[[float, float], bool]]] = {}
        for part in solids["floor"]:
            box, inside = _part(part)
            for key in cells_over(*box):
                self._floor.setdefault(key, []).append(inside)

    def clear(self, a: Vec3, b: Vec3) -> bool:
        """Whether nothing stands between ``a`` and ``b``: a shot from one reaches the other."""
        length = math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
        if length < 1e-9:
            return True
        d = ((b.x - a.x) / length, (b.y - a.y) / length, (b.z - a.z) / length)
        return all(not self.pieces[i].hit(a, d, length) for i in self._along(a, b))

    def on_floor(self, x: float, z: float) -> bool:
        """Whether (x, z) is over the floor: inside the world's edge (``Ground.inside``)."""
        return any(inside(x, z) for inside in self._floor.get(_cell(x, z), ()))

    def ground_at(self, x: float, z: float, reach: float) -> float:
        """The height of the highest surface under (x, z) that is no higher than ``reach``, as far
        up as feet there step: a structure's top, the floor at 0, or past the floor's edge the
        ground down at OUTSIDE_HEIGHT."""
        best = 0.0 if self.on_floor(x, z) else OUTSIDE_HEIGHT
        for i in self._cells.get(_cell(x, z), ()):
            p = self.pieces[i]
            lx, lz = p.local(x, z)
            if abs(lx) > p.hw or abs(lz) > p.hd:
                continue
            top = p.base + p.top(lx, lz)
            if best < top <= reach:
                best = top
        return best

    def _along(self, a: Vec3, b: Vec3) -> Iterator[int]:
        """Each piece whose grid cells the segment's ground track crosses, once."""
        seen: set[int] = set()
        for key in _cells_on_segment(a.x, a.z, b.x, b.z):
            for i in self._cells.get(key, ()):
                if i not in seen:
                    seen.add(i)
                    yield i


@cache
def load_solids() -> Solids:
    return Solids(read("solids"))


def piece_of(s: Mapping[str, Any]) -> Piece:
    """A structure from a map, with its kind's top (surfaceOf in packages/shared/src/sim/structures.ts)."""
    yaw = float(s.get("yaw", 0))
    w, d = float(s["w"]), float(s["d"])
    top: Callable[[float, float], float]
    if s["kind"] in ("box", "ladder"):
        h = float(s["h"])
        height = h

        def top(_lx: float, _lz: float) -> float:
            return h
    elif s["kind"] == "ramp":
        h = float(s["h"])
        height = h

        def top(_lx: float, lz: float) -> float:
            return h * (lz / d + 0.5)
    elif s["kind"] == "terrain":
        heights = [[float(v) for v in row] for row in s["heights"]]
        height = max(0.0, *(v for row in heights for v in row))

        def top(lx: float, lz: float) -> float:
            return _bilinear(heights, w, d, lx, lz)
    else:
        raise ValueError(f"unknown structure kind {s['kind']!r}; rebuild the maps and teach solids.py about it")
    return Piece(
        x=float(s["x"]),
        z=float(s["z"]),
        cos=math.cos(yaw),
        sin=math.sin(yaw),
        hw=w / 2,
        hd=d / 2,
        base=float(s.get("y", 0)),
        height=height,
        top=top,
    )


def _bilinear(heights: list[list[float]], w: float, d: float, lx: float, lz: float) -> float:
    rows, cols = len(heights), len(heights[0])
    fx = max(0.0, min(cols - 1.0, (lx / w + 0.5) * (cols - 1)))
    fz = max(0.0, min(rows - 1.0, (lz / d + 0.5) * (rows - 1)))
    i = min(cols - 2, math.floor(fx))
    j = min(rows - 2, math.floor(fz))
    tx, tz = fx - i, fz - j

    def row(r: list[float]) -> float:
        return r[i] + (r[i + 1] - r[i]) * tx

    return row(heights[j]) + (row(heights[j + 1]) - row(heights[j])) * tz


Box = tuple[float, float, float, float]  # the least x and z, then the most


def _part(p: Mapping[str, Any]) -> tuple[Box, Callable[[float, float], bool]]:
    """A part of the floor (WorldPart in packages/shared/src/sim/ground.ts) as a box round it and
    whether a spot is on it (its ``partDistance`` under 0)."""
    kind = p["kind"]
    if kind == "bridge":
        ax, az, bx, bz, half = float(p["ax"]), float(p["az"]), float(p["bx"]), float(p["bz"]), float(p["halfWidth"])
        length = math.hypot(bx - ax, bz - az)
        ux, uz = (bx - ax) / length, (bz - az) / length
        square = bool(p.get("square", False))

        def on_bridge(x: float, z: float) -> bool:
            along = (x - ax) * ux + (z - az) * uz
            across = (z - az) * ux - (x - ax) * uz
            if square:
                return 0 < along < length and abs(across) < half
            # Its ends are round: within its half width of the nearest point of its middle.
            near = max(0.0, min(length, along))
            return math.hypot(x - ax - ux * near, z - az - uz * near) < half

        box = (min(ax, bx) - half, min(az, bz) - half, max(ax, bx) + half, max(az, bz) + half)
        return box, on_bridge
    x0, z0, r = float(p["x"]), float(p["z"]), float(p["r"])
    if kind == "disc":
        return (x0 - r, z0 - r, x0 + r, z0 + r), lambda x, z: math.hypot(x - x0, z - z0) < r
    # A pie slice, or a corridor round a bend: between two bearings from (x0, z0), a slice from
    # there out to r and a bend within its half width of r.
    start, span = float(p["from"]), float(p["to"]) - float(p["from"])
    if kind == "sector":
        inner, outer = 0.0, r
    elif kind == "bend":
        inner, outer = r - float(p["halfWidth"]), r + float(p["halfWidth"])
    else:
        raise ValueError(f"unknown part of the floor {kind!r}; rebuild the maps and teach solids.py about it")

    def on_arc(x: float, z: float) -> bool:
        turn = (math.atan2(z - z0, x - x0) - start) % (2 * math.pi)
        return 0 < turn < span and inner < math.hypot(x - x0, z - z0) < outer

    return (x0 - outer, z0 - outer, x0 + outer, z0 + outer), on_arc


def _cell(x: float, z: float) -> tuple[int, int]:
    return math.floor(x / CELL), math.floor(z / CELL)


def cells_over(min_x: float, min_z: float, max_x: float, max_z: float) -> Iterator[tuple[int, int]]:
    """The grid cells a box covers."""
    for cx in range(math.floor(min_x / CELL), math.floor(max_x / CELL) + 1):
        for cz in range(math.floor(min_z / CELL), math.floor(max_z / CELL) + 1):
            yield cx, cz


def _cells_on_segment(ax: float, az: float, bx: float, bz: float) -> Iterator[tuple[int, int]]:
    """The grid cells a segment on the ground passes through, in order (Amanatides and Woo)."""
    cx, cz = math.floor(ax / CELL), math.floor(az / CELL)
    end = (math.floor(bx / CELL), math.floor(bz / CELL))
    dx, dz = bx - ax, bz - az
    step_x = 1 if dx > 0 else -1
    step_z = 1 if dz > 0 else -1
    # Fraction of the segment to the next cell edge along each axis, and per whole cell.
    next_x = ((cx + (step_x > 0)) * CELL - ax) / dx if dx else math.inf
    next_z = ((cz + (step_z > 0)) * CELL - az) / dz if dz else math.inf
    per_x = CELL / abs(dx) if dx else math.inf
    per_z = CELL / abs(dz) if dz else math.inf
    yield cx, cz
    while (cx, cz) != end and min(next_x, next_z) <= 1:
        if next_x < next_z:
            cx += step_x
            next_x += per_x
        else:
            cz += step_z
            next_z += per_z
        yield cx, cz
