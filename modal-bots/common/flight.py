"""A hop by jetpack (``bots/fighter_bot.py``): for someone on foot with no way over the ground to
where it's going, or one far longer than the hop.

A hop is straight up, straight across and straight down (``plan``): up from where it stands to
clear of whatever is between, across to over where it's going, and down onto it, with nothing in
the way of a body on any of the three. From then the ``Hop`` has the controls (``fly``): it asks
for a jetpack, climbs, crosses holding its height, comes down, and brakes before it lands.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .controls import TICK_RATE, Controls
from .map.bodies import EYE_HEIGHT
from .map.solids import Solids
from .protocol import Player, Vec3

GEAR = "jetpack"  # what it flies with, by its command (GEAR, packages/shared/src/sim/gear.ts)
# What that gives, as a hop is reckoned by: the m/s it climbs at, its seconds of fuel, and the
# share of a second's that holding a height for a second burns.
CLIMB = 9.0
FUEL = 8.0
HOVER = 0.6
CROSS = 6.0  # m/s it's reckoned to cross at: a walk's
CLEARANCES = (3.0, 7.0, 12.0)  # metres over the higher of its two ends that it may cross at: the lowest that's clear
SPARE = 1.0  # seconds of fuel a hop is planned to leave, and under which one being flown comes down
BODY = (0.45, 2.1)  # metres from its middle, and from its feet up, that a body needs clear
BESIDE = 1.5  # metres from where it's going that it may come down instead
OVER = 1.0  # metres across the floor from where it's going that count as over it
DESCENT = 12.0  # m/s it comes down at, braking whatever is over that: well under a landing that hurts
BRAKING = 0.25  # the share of a second's fuel that a second of coming down at that burns
ASK_EVERY = TICK_RATE  # ticks between its askings for a jetpack it isn't wearing yet
GIVEN = 3.0  # seconds it gives a jetpack it asked for to be on its back
LASTS = 20.0  # seconds a hop may take in all before it's given up on


def plan(solids: Solids, feet: Vec3, goal: Vec3) -> Hop | None:
    """The hop from ``feet`` to ``goal`` (feet) or to beside it, or None where there's none to be
    had: too far for a tank, or something in the way however high it's crossed at."""
    # Where it may come down: there, or a step from there on the same floor (someone at a rail
    # has the rail beside them).
    lands = [goal]
    for dx, dz in ((BESIDE, 0.0), (-BESIDE, 0.0), (0.0, BESIDE), (0.0, -BESIDE)):
        x, z = goal.x + dx, goal.z + dz
        if abs(solids.ground_at(x, z, goal.y + 0.5) - goal.y) <= 0.3:
            lands.append(Vec3(x, goal.y, z))
    for clearance in CLEARANCES:
        top = max(feet.y, goal.y) + clearance
        up = Vec3(feet.x, top, feet.z)
        if not _free(solids, feet, up):
            continue
        for land in lands:
            across = math.hypot(land.x - feet.x, land.z - feet.z)
            burnt = (top - feet.y) / CLIMB + across / CROSS * HOVER + (top - land.y) / DESCENT * BRAKING
            if burnt > FUEL - SPARE:
                continue
            over = Vec3(land.x, top, land.z)
            if _free(solids, up, over) and _free(solids, over, land):
                return Hop(land, top)
    return None


def _free(solids: Solids, a: Vec3, b: Vec3) -> bool:
    """Whether a body can pass from ``a`` to ``b`` (feet): nothing in the way of its feet, its
    head or either side of it."""
    reach, height = BODY
    dx, dz = b.x - a.x, b.z - a.z
    length = math.hypot(dx, dz)
    # Either side of the way it's going; straight up or down, all round it.
    if length < 1e-6:
        sides = [(reach, 0.0), (-reach, 0.0), (0.0, reach), (0.0, -reach)]
    else:
        sides = [(-dz / length * reach, dx / length * reach), (dz / length * reach, -dx / length * reach)]
    return all(
        solids.clear(Vec3(a.x + ox, a.y + lift, a.z + oz), Vec3(b.x + ox, b.y + lift, b.z + oz))
        for ox, oz in sides
        for lift in (0.3, height)
    )


@dataclass(slots=True)
class Hop:
    """A hop being flown: to ``goal`` (feet), crossing at ``top`` (the height of its feet)."""

    goal: Vec3
    top: float
    over: bool = False  # down again, or given up on
    _leg: str = "up"  # "up", "across" or "down"
    _began: int | None = None
    _asked: int = -ASK_EVERY

    def fly(self, solids: Solids, me: Player, tick: int, controls: Controls) -> list[str]:
        """Set the controls for this snapshot; returns the commands to send with it."""
        self._began = tick if self._began is None else self._began
        feet = Vec3(me.pos.x, me.pos.y - EYE_HEIGHT, me.pos.z)
        controls.look(math.atan2(self.goal.x - feet.x, self.goal.z - feet.z), 0)
        controls.shoot(False)
        controls.scope(False)
        controls.run(False)
        controls.stop()
        controls.thrust(False)
        if tick - self._began > LASTS * TICK_RATE:
            self.over = True
            return []
        if me.gear is None or me.gear.id != GEAR:
            # Not on its back yet: asked for, and given a moment.
            if tick - self._began > GIVEN * TICK_RATE:
                self.over = True
            elif tick - self._asked >= ASK_EVERY:
                self._asked = tick
                return [GEAR]
            return []
        under = feet.y - solids.ground_at(feet.x, feet.z, feet.y + 0.5)
        if self._leg != "down" and me.gear.fuel < SPARE:
            self._leg = "down"  # not enough left to get there: down where it is
        if self._leg == "up":
            controls.thrust(True)
            if under < 0.3:
                controls.jump()
            if feet.y >= self.top:
                self._leg = "across"
        elif self._leg == "across":
            controls.thrust(feet.y < self.top or me.vy < 0)
            controls.walk_toward(feet, self.goal)
            if math.hypot(self.goal.x - feet.x, self.goal.z - feet.z) <= OVER:
                self._leg = "down"
        else:
            controls.thrust(me.vy < -DESCENT)
            if under < 0.3 and abs(me.vy) < 0.5:
                self.over = True
        return []
