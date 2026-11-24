"""A long way taken by kart (``bots/fighter_bot.py``): for someone on foot whose way is too far to
walk and runs along the roads.

A trip is planned (``plan``, off the event loop: it works out a racing line): from the end of a
road that the walk to it and the drive from it make the quickest, to the node of the roads nearest
where it's going. Whoever takes it walks to where it boards themselves; from there the ``Trip``
has the controls (``ride``): it gets into a kart there (``Boarding``), drives it as a racer drives
a track (``Driver``), brakes at the far end and gets out.
"""

from __future__ import annotations

import itertools
import math
import random
from dataclasses import dataclass

from .controls import TICK_RATE, Controls
from .driving import Driver, Skill
from .map.ground import Ground
from .map.karts import Karts
from .map.roads import Roads
from .map.solids import Solids
from .protocol import Kart, Player, Vec3
from .racing_line import Line, racing_line
from .state import WorldState

FAR = 150.0  # metres, as the crow flies, from which a way is one to drive
SHORT = 80.0  # metres of road under which a drive isn't worth a kart
ON_FOOT = 7.0  # m/s a walk to where it boards is reckoned at, and a drive at the kart's own speed
NEARBY = 40.0  # metres from a road that someone off the walked floor can be, to board there
# The kart it takes (KARTS, packages/shared/src/sim/vehicles/karts.ts): its id, and its command.
KART = "standard"
ASKS = "kart"
BOARD = 5.0  # metres from where its road begins that it asks for its kart from
BOARD_SECONDS = 10.0  # how long it gives itself there to be sat in one
# An empty kart is one to take that stands this near where it's to set out from, across the floor
# and up or down, with its nose within this many radians of the way it's to drive (a kart isn't
# turned round in a road's width) and nothing between: one left lying there, or the one it asked
# for, as it lands.
TAKE = 25.0
LEVEL = 1.5
AHEAD = 1.0
KART_MIDDLE = 0.5  # metres up a kart that its middle is, for what stands between
STOP = 40.0  # metres short of the road's far end that it's on the brake from
SLOW = 3.0  # m/s under which it gets out
MOST_LATE = 10  # ticks: the most its driver allows for between what it sees and its keys being taken


@dataclass(frozen=True, slots=True)
class Plan:
    """A trip as planned: where it boards (feet), the way its kart faces there, the line it drives
    and where that ends."""

    board: Vec3
    heading: float
    line: Line
    end: Vec3


def plan(roads: Roads, ground: Ground, karts: Karts, feet: Vec3, goal: Vec3, skill: Skill) -> Plan | None:
    """The trip from ``feet`` to ``goal``, or None where a kart isn't worth it: too near, no road
    near enough to board at, too short a drive, or a walk that would be as quick."""
    crow = math.hypot(goal.x - feet.x, goal.z - feet.z)
    if crow < FAR:
        return None

    def walked(spot: Vec3) -> bool:
        return ground.node_at(spot) is not None

    # Where it could set out from: on the walked floor any end of a road there, and anywhere else
    # the road it's nearly on.
    if walked(feet):
        starts = [i for i in range(len(roads.nodes)) if len(roads.ways[i]) == 1 and walked(roads.nodes[i])]
    else:
        starts = [i for i in (roads.nearest(feet),) if _apart(roads.nodes[i], feet) <= NEARBY]
    far = roads.nearest(goal)
    best: tuple[float, list[int]] | None = None
    for start in starts:
        path = roads.path(start, far, gaps=True) or []
        # It boards, and gets out, out past the walked floor: a road ends in the middle of a
        # building's grounds, under the building.
        while path and walked(roads.nodes[path[0]]):
            path = path[1:]
        while path and walked(roads.nodes[path[-1]]):
            path = path[:-1]
        if len(path) < 2:
            continue
        driven = sum(_apart(roads.nodes[a], roads.nodes[b]) for a, b in itertools.pairwise(path))
        seconds = _apart(roads.nodes[path[0]], feet) / ON_FOOT + driven / karts.of(KART).speed
        if driven >= SHORT and (best is None or seconds < best[0]):
            best = (seconds, path)
    # Between two spots on the walked floor there's a way on foot, to be beaten.
    if best is None or (walked(feet) and walked(goal) and best[0] > crow / ON_FOOT):
        return None
    path = best[1]
    first, second = roads.nodes[path[0]], roads.nodes[path[1]]
    return Plan(
        board=first,
        heading=math.atan2(second.x - first.x, second.z - first.z),
        line=racing_line(roads.way(path), skill.shape, karts.of(KART)),
        end=roads.nodes[path[-1]],
    )


class Boarding:
    """Getting into a kart to set out in from ``at``, its nose along ``heading``: the nearest
    empty one standing by that way, anyone's, or with none there one asked for, facing that way
    (a bot is let into the kart it uses, from beside it). ``step`` has the controls of whoever is
    there until they're sat in one, or it has ``failed``."""

    def __init__(self, at: Vec3, heading: float, solids: Solids):
        self.at = at
        self.heading = heading
        self.failed = False  # there too long without one
        self._solids = solids
        self._began: int | None = None  # the tick it began
        self._faced = False
        self._asked = False  # whether it has asked for a kart of its own

    @property
    def begun(self) -> bool:
        return self._began is not None

    def step(self, state: WorldState, me: Player, controls: Controls) -> list[str]:
        """Set the controls for this snapshot; returns the commands to send with it."""
        self._began = state.tick if self._began is None else self._began
        controls.stop()
        controls.shoot(False)
        controls.scope(False)
        controls.run(False)
        if state.tick - self._began > BOARD_SECONDS * TICK_RATE:
            self.failed = True
            return []
        kart = self._takes(state, me)
        if kart is not None:
            controls.look(math.atan2(kart.pos.x - me.pos.x, kart.pos.z - me.pos.z), 0)
            controls.walk_toward(me.pos, kart.pos)
            controls.use(kart.id)
            return []
        controls.look(self.heading, 0)
        if not self._faced:
            # A kart is dropped the way its asker faces as the room last saw them: a frame that way first.
            self._faced = True
        elif not self._asked:
            self._asked = True
            return [ASKS]
        return []

    def _takes(self, state: WorldState, me: Player) -> Kart | None:
        """The kart to get into: the nearest of the empty ones standing by, with nothing between
        it and either its taker or where it's to set out from."""
        at = self.at

        def middle(spot: Vec3) -> Vec3:
            return Vec3(spot.x, spot.y + KART_MIDDLE, spot.z)

        def stands(kart: Kart) -> bool:
            if kart.driver is not None or kart.rescued or abs(kart.pos.y - at.y) > LEVEL:
                return False
            if abs((kart.yaw - self.heading + math.pi) % (2 * math.pi) - math.pi) > AHEAD:
                return False
            if math.hypot(kart.pos.x - at.x, kart.pos.z - at.z) > TAKE:
                return False
            return self._solids.clear(me.pos, middle(kart.pos)) and self._solids.clear(middle(kart.pos), middle(at))

        return min(filter(stands, state.karts.values()), key=lambda kart: _apart(kart.pos, me.pos), default=None)


class Trip:
    """A trip being taken, from where it boards on."""

    def __init__(self, planned: Plan, skill: Skill, karts: Karts, solids: Solids, dice: random.Random):
        self.plan = planned
        self.over = False  # out of its kart at the far end, or it never got one
        self.kart: str | None = None  # the kart it drove, by id
        self.leave = False  # set to have it stop and get out where it is
        self._skill = skill
        self._karts = karts
        self._dice = dice
        self._boarding = Boarding(planned.board, planned.heading, solids)
        self._driver: Driver | None = None

    def boards(self, feet: Vec3) -> bool:
        """Whether it's where it boards: the trip has the controls from here."""
        near = math.hypot(feet.x - self.plan.board.x, feet.z - self.plan.board.z) <= BOARD
        return self._boarding.begun or near

    def ride(self, state: WorldState, me: Player, controls: Controls) -> list[str]:
        """Set the controls for this snapshot; returns the commands to send with it."""
        kart = state.kart
        if kart is None:
            # Told to leave, or out of the one it was driving: the trip is over.
            if self.leave or self._driver is not None:
                self.over = True
                return []
            asks = self._boarding.step(state, me, controls)
            self.over = self._boarding.failed
            return asks
        if self._driver is None:
            self._driver = Driver(self.plan.line, self._skill, self._karts.of(kart.kart), self._dice)
            self.kart = kart.id
        late = max(0, min(MOST_LATE, controls.seq - me.last_seq))
        others = tuple(other.pos for other in state.karts.values() if other is not kart)
        keys = self._driver.keys(kart, late, 0, others)
        controls.look(kart.yaw, 0)
        if not self.leave and _apart(kart.pos, self.plan.end) > STOP:
            controls.drive(gas=keys.gas, steer=keys.steer, drift=keys.drift)
            return []
        # At the far end: on the brake until it's all but stopped, and out.
        forward = kart.vel.x * math.sin(kart.yaw) + kart.vel.z * math.cos(kart.yaw)
        controls.drive(gas=-1 if forward > SLOW else 0, steer=keys.steer)
        if abs(forward) <= SLOW and not kart.rescued:
            controls.get_out()
        return []


def _apart(a: Vec3, b: Vec3) -> float:
    return math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
