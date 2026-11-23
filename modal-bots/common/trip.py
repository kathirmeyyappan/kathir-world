"""A long way taken by kart (``bots/fighter_bot.py``): for someone on foot whose way is too far to
walk and runs along the roads.

A trip is planned (``plan``, off the event loop: it works out a racing line): from the end of a
road that the walk to it and the drive from it make the quickest, to the node of the roads nearest
where it's going. Whoever takes it walks to where it boards themselves; from there the ``Trip``
has the controls (``ride``): it faces down the road, asks for a kart, walks into it as it lands,
drives it as a racer drives a track (``Driver``), brakes at the far end and gets out.
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
from .protocol import Player, Vec3
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
BOARD_SECONDS = 4.0  # how long it gives the kart it asked for to be under it
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


class Trip:
    """A trip being taken, from where it boards on."""

    def __init__(self, planned: Plan, skill: Skill, karts: Karts, dice: random.Random):
        self.plan = planned
        self.over = False  # out of its kart at the far end, or it never got one
        self.kart: str | None = None  # the kart it drove, by id
        self.leave = False  # set to have it stop and get out where it is
        self._skill = skill
        self._karts = karts
        self._dice = dice
        self._faced = False
        self._asked: int | None = None  # the tick it asked for its kart
        self._driver: Driver | None = None

    def boards(self, feet: Vec3) -> bool:
        """Whether it's where it boards: the trip has the controls from here."""
        return self._asked is not None or math.hypot(feet.x - self.plan.board.x, feet.z - self.plan.board.z) <= BOARD

    def ride(self, state: WorldState, me: Player, controls: Controls) -> list[str]:
        """Set the controls for this snapshot; returns the commands to send with it."""
        kart = state.kart
        if kart is None:
            if self.leave:
                self.over = True
                return []
            return self._board(state.tick, controls)
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

    def _board(self, tick: int, controls: Controls) -> list[str]:
        """On foot where it boards: facing down the road, a kart asked for, and into it as it
        lands ahead. Out of one it was driving, the trip is over."""
        if self._driver is not None or (self._asked is not None and tick - self._asked > BOARD_SECONDS * TICK_RATE):
            self.over = True
            controls.stop()
            return []
        controls.look(self.plan.heading, 0)
        controls.shoot(False)
        controls.scope(False)
        controls.run(False)
        if not self._faced:
            # The kart is dropped the way it faces as the room last saw it: a frame that way first.
            self._faced = True
            controls.stop()
            return []
        if self._asked is None:
            self._asked = tick
            controls.stop()
            return [ASKS]
        controls.move(forward=1)
        return []


def _apart(a: Vec3, b: Vec3) -> float:
    return math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
