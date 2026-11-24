"""Someone run down by kart (``bots/fighter_bot.py``), across floor a kart drives straight over.

A charge is for someone on foot a good run away, with level floor all the way to them, nothing
standing on it, and room past them to stop in (``open_to``, ``level``). Whoever makes it gets into
a kart where they stand, its nose toward them (``trip.Boarding``), and from there the ``Charge``
has the controls (``ride``): flat out at where they'll be, the wheel over as far as they're off
its nose, until it has been at them, they're no longer there to be run at, or the floor ahead gives
out; then on the brake, and out, to fight on from there on foot.
"""

from __future__ import annotations

import math

from .controls import TICK_RATE, Controls
from .map.bodies import EYE_HEIGHT
from .map.solids import Solids
from .protocol import Player, Vec3
from .state import WorldState
from .trip import SLOW, Boarding

FROM = 35.0  # metres across the floor from which someone is worth a kart: its run up to speed
TO = 130.0  # and the furthest off they're charged from
OVERRUN = 18.0  # metres of floor past them that a charge wants, to stop in
LEVEL = 0.4  # metres the floor may rise or fall along the way
STRIDE = 2.0  # metres between its looks at the floor along the way
# Where nothing may stand in the way: how far either side of the line, and how high up it (a
# kart's middle, and its driver's head).
ABREAST = 1.0
CLEAR = (0.5, 1.4)
WHEEL = 2.5  # the wheel for each radian they're off its nose, up to full over
AT = 3.5  # metres from them that count as having been at them
PACE = 10.0  # m/s it reckons on at the least, for when it will reach them
BRAKING = 0.7  # seconds of its speed that it wants floor ahead for, and this much besides
MARGIN = 4.0
CHECK_EVERY = 5  # ticks between its looks at the floor between it and them
SECONDS = 14.0  # the longest a charge is kept up


def level(solids: Solids, start: Vec3, end: Vec3, past: float = 0) -> bool:
    """Whether a kart drives straight from ``start`` to ``end`` (both on the floor) and ``past``
    metres on: floor all the way, no higher or lower than where it sets out, and nothing standing
    in its way."""
    dx, dz = end.x - start.x, end.z - start.z
    length = math.hypot(dx, dz)
    if length < 1e-6:
        return True
    ux, uz = dx / length, dz / length
    reach = length + past
    for i in range(1, math.ceil(reach / STRIDE) + 1):
        along = min(i * STRIDE, reach)
        ground = solids.ground_at(start.x + ux * along, start.z + uz * along, start.y + LEVEL)
        if abs(ground - start.y) > LEVEL:
            return False
    return all(
        solids.clear(
            Vec3(start.x + uz * side, start.y + up, start.z - ux * side),
            Vec3(start.x + ux * reach + uz * side, start.y + up, start.z + uz * reach - ux * side),
        )
        for side in (-ABREAST, ABREAST)
        for up in CLEAR
    )


def open_to(solids: Solids, feet: Vec3, mark: Vec3) -> bool:
    """Whether someone stood at ``mark`` is to be run down by kart from ``feet`` (both feet): far
    enough off for a kart to be up to speed, not too far, and level floor to them and past them."""
    across = math.hypot(mark.x - feet.x, mark.z - feet.z)
    return FROM <= across <= TO and abs(mark.y - feet.y) <= LEVEL and level(solids, feet, mark, OVERRUN)


def in_way(start: Vec3, end: Vec3, spot: Vec3) -> bool:
    """Whether someone stood at ``spot`` is in the way of a kart driven from ``start`` to ``end``."""
    dx, dz = end.x - start.x, end.z - start.z
    length = math.hypot(dx, dz) or 1.0
    along = ((spot.x - start.x) * dx + (spot.z - start.z) * dz) / length
    aside = abs((spot.x - start.x) * dz - (spot.z - start.z) * dx) / length
    return 0 <= along <= length and aside <= 2 * ABREAST


class Charge:
    """A charge being made at ``mark`` (a player's id), from getting into the kart on."""

    def __init__(self, at: Vec3, mark: str, heading: float, solids: Solids, lead: float):
        self.mark = mark
        self.over = False  # out of its kart again, or it never got one
        self.kart: str | None = None  # the kart it drove, by id
        self._solids = solids
        self._lead = lead  # the share of how they're moving that it allows for
        self._boarding = Boarding(at, heading, solids)
        self._began = 0  # the tick it set off
        self._was: Vec3 | None = None  # where they were a tick ago
        self._way = True  # whether the floor between it and them was open, when it last looked
        self._done = False  # on the brake, to get out

    def ride(self, state: WorldState, me: Player, controls: Controls) -> list[str]:
        """Set the controls for this snapshot; returns the commands to send with it."""
        kart = state.kart
        if kart is None:
            if self.kart is not None:
                self.over = True
                return []
            asks = self._boarding.step(state, me, controls)
            self.over = self._boarding.failed
            return asks
        if self.kart is None:
            self.kart, self._began = kart.id, state.tick
        controls.look(kart.yaw, 0)
        forward = kart.vel.x * math.sin(kart.yaw) + kart.vel.z * math.cos(kart.yaw)
        mark = state.players.get(self.mark)
        if mark is None or mark.dead or mark.ghost or mark.riding is not None:
            self._done = True
        feet = kart.pos if mark is None else Vec3(mark.pos.x, mark.pos.y - EYE_HEIGHT, mark.pos.z)
        away = math.hypot(feet.x - kart.pos.x, feet.z - kart.pos.z)
        if not self._done:
            if state.tick % CHECK_EVERY == 0:
                self._way = abs(feet.y - kart.pos.y) <= 2 * LEVEL and level(self._solids, kart.pos, feet)
            spent = state.tick - self._began > SECONDS * TICK_RATE
            self._done = away <= AT or spent or not self._way
        if self._done or mark is None:
            # On the brake until it's all but stopped, and out.
            controls.drive(gas=-1 if forward > SLOW else 0, steer=0)
            if abs(forward) <= SLOW and not kart.rescued:
                controls.get_out()
            return []
        # At where they'll be by the time it's on them, as far as it allows for how they're moving.
        was, self._was = self._was or mark.pos, mark.pos
        until = away / max(forward, PACE) * self._lead * TICK_RATE
        aim = Vec3(feet.x + (mark.pos.x - was.x) * until, feet.y, feet.z + (mark.pos.z - was.z) * until)
        off = math.atan2(aim.x - kart.pos.x, aim.z - kart.pos.z) - kart.yaw
        off = (off + math.pi) % (2 * math.pi) - math.pi
        # No faster than it has floor ahead to stop on.
        ahead = max(forward, 0) * BRAKING + MARGIN
        on = Vec3(kart.pos.x + math.sin(kart.yaw) * ahead, kart.pos.y, kart.pos.z + math.cos(kart.yaw) * ahead)
        floor = level(self._solids, kart.pos, on)
        controls.drive(gas=1 if floor else -1, steer=max(-1.0, min(1.0, WHEEL * off)))
        return []
