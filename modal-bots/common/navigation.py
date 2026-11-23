"""Following a way over the ground (``map.ground``): steer at each node of a path in turn, jumping where the
map says only a jump gets there, across open floor straight for the furthest of them it can, and
opening a shut door in the way where it's told which are."""

from __future__ import annotations

import math
from collections.abc import Mapping

from .controls import TICK_RATE, Controls
from .map.bodies import EYE_HEIGHT
from .map.ground import Ground
from .map.solids import Piece
from .protocol import Vec3

ARRIVE = 0.6  # metres across the floor from a node that count as there
JUMP_FROM = 0.3  # metres from a jump's take-off a bot lines up within first (the map jumped from it)
JUMP_SETTLE_TICKS = 6  # it stands there this long before jumping, so a late snapshot can't mislead it
LINE_UP = 2.0  # metres from a take-off where it starts slowing down to stop on it
USE_EVERY = TICK_RATE // 2  # ticks between clicks on a shut door it's waiting at
STUCK_SECONDS = 2.0  # this long no closer to the next node means something's in the way
HEADWAY = 0.5  # metres closer to the next node that count as getting somewhere
# Metres along the path it steers at, as far as the path runs straight on. Steering at the very
# next node (a metre off) makes a bot that sees itself a few ticks late overshoot it, turn back
# and circle; a point further on keeps the walk smooth. Never past a turn of the path, though: the
# straight line to a node round a corner goes through whatever the path turned for.
LOOKAHEAD = 2.5
STRAIGHT_ON = 0.99  # the cosine between two steps of a path from which the second runs straight on


class Route:
    """A path from ``ground.path``, for a body that moves as ``avatar`` does (the same one the path
    was found for). Call ``steer`` on every snapshot; it sets the controls' move (relative to
    whatever they're looking at, so look first) and says when the walk is over. Given the room's
    ``doors`` (``WorldState.doors``), it stops at a shut one in the way, turns to it and clicks it
    until it opens: for a path found with ``doors``, through doorways."""

    def __init__(
        self,
        ground: Ground,
        path: list[int],
        tick: int,
        avatar: str = "standard",
        doors: Mapping[str, bool] | None = None,
    ):
        self.ground = ground
        self.doors = doors
        self._used_at: int | None = None  # when it last clicked a shut door in the way
        self.jumps = ground.jumps_of(avatar)
        self.path = path
        self.next = 1 if len(path) > 1 else 0
        self._since = tick  # when it last made HEADWAY toward the next node
        self._closest = math.inf  # metres across from the next node at the closest it's come
        self._jumped = False
        self._settled_at: int | None = None  # when it got to a jump's take-off

    @property
    def goal(self) -> int:
        return self.path[-1]

    @property
    def done(self) -> bool:
        return self.next >= len(self.path)

    def stuck(self, tick: int) -> bool:
        """No closer to the next node for STUCK_SECONDS: plan again from where the bot is."""
        return not self.done and tick - self._since > STUCK_SECONDS * TICK_RATE

    def ahead(self, eye: Vec3) -> Vec3:
        """Where the route is steering from ``eye``, at eye height: the furthest node within
        LOOKAHEAD of the bot that the path runs straight on to, short of any jump (a jump has to
        start from its own take-off spot), or a jump's landing while it's on one."""
        feet = Vec3(eye.x, eye.y - EYE_HEIGHT, eye.z)
        i = min(self.next, len(self.path) - 1)
        while (
            not self._jumping
            and 0 < i < len(self.path) - 1
            and self.path[i + 1] not in self.jumps[self.path[i]]
            and self._shut(i + 1) is None
            and _across(feet, self.ground.nodes[self.path[i + 1]]) <= LOOKAHEAD
            and self._straight_on(i)
        ):
            i += 1
        node = self.ground.nodes[self.path[i]]
        return Vec3(node.x, node.y + EYE_HEIGHT, node.z)

    def steer(self, eye: Vec3, tick: int, controls: Controls, speed: float = 1) -> bool:
        """Move along the route (``eye`` is the bot's ``pos``); False once at the end."""
        feet = Vec3(eye.x, eye.y - EYE_HEIGHT, eye.z)
        while not self.done and (self._reached(feet) or self._passed(feet)):
            self._make_for(self.next + 1, tick)
        if self.done:
            controls.stop()
            return False
        self._cut(feet, tick)
        off = _across(feet, self.ground.nodes[self.path[self.next]])
        if off < self._closest - HEADWAY:
            self._closest, self._since = off, tick
        door = self._shut(self.next)
        if door is not None:
            # Stand where the way meets it, turn to its slab and click it, again every USE_EVERY
            # ticks until the room says it's open.
            start = self.ground.nodes[self.path[self.next - 1]]
            away = _across(feet, start)
            if away > JUMP_FROM:
                controls.walk_toward(eye, start, speed * min(1.0, away / LINE_UP))
                return True
            controls.stop()
            name, slab = door
            controls.look_at(eye, Vec3(slab.x, slab.base + slab.height / 2, slab.z))
            if self._used_at is None or tick - self._used_at >= USE_EVERY:
                controls.use(name)
                self._used_at = tick
            return True
        if self._jumping and not self._jumped:
            # Line up on the take-off spot and stand there a moment, then go: the map's jump
            # starts there.
            start = self.ground.nodes[self.path[self.next - 1]]
            off = _across(feet, start)
            if off > JUMP_FROM:
                # Slowing as it closes in, so a bot that sees itself late doesn't overshoot.
                self._settled_at = None
                controls.walk_toward(eye, start, speed * min(1.0, off / LINE_UP))
                return True
            if self._settled_at is None:
                self._settled_at = tick
            if tick - self._settled_at < JUMP_SETTLE_TICKS:
                controls.stop()
                return True
            controls.jump()
            self._jumped = True
        controls.walk_toward(eye, self.ahead(eye), speed)
        return True

    def _cut(self, feet: Vec3, tick: int) -> None:
        """On open floor, make for the furthest node still ahead that a straight walk from here
        reaches across it, short of any jump."""
        if self._jumping:
            return
        i = self.next
        while (
            i + 1 < len(self.path)
            and self.path[i + 1] not in self.jumps[self.path[i]]
            and self.ground.straight(feet, self.ground.nodes[self.path[i + 1]])
        ):
            i += 1
        if i != self.next:
            self._make_for(i, tick)

    def _make_for(self, i: int, tick: int) -> None:
        """Head for the path's node ``i`` next."""
        self.next = i
        self._since = tick
        self._closest = math.inf
        self._jumped = False
        self._settled_at = None

    def _straight_on(self, k: int) -> bool:
        """Whether the path's step from its node ``k`` to the next carries straight on from the
        step that got it to ``k``."""
        a, b, c = (self.ground.nodes[self.path[j]] for j in (k - 1, k, k + 1))
        ux, uz, vx, vz = b.x - a.x, b.z - a.z, c.x - b.x, c.z - b.z
        along = math.hypot(ux, uz) * math.hypot(vx, vz)
        return along > 1e-9 and (ux * vx + uz * vz) / along >= STRAIGHT_ON

    def _shut(self, k: int) -> tuple[str, Piece] | None:
        """The door shut across the way from the path's node ``k - 1`` to its node ``k``, if it's
        been told which are."""
        if self.doors is None or not 0 < k < len(self.path):
            return None
        found = self.ground.doorway(self.path[k - 1], self.path[k])
        return found if found is not None and not self.doors.get(found[0], True) else None

    @property
    def _jumping(self) -> bool:
        """Whether the way to the next node is a jump."""
        return 0 < self.next < len(self.path) and self.path[self.next] in self.jumps[self.path[self.next - 1]]

    def _reached(self, feet: Vec3) -> bool:
        """Within ARRIVE of the next node, or on it where it's a square of open floor."""
        i = self.path[self.next]
        node = self.ground.nodes[i]
        if i in self.ground.areas and self.ground.area_at(feet) == i:
            return True
        return _across(feet, node) <= ARRIVE and abs(feet.y - node.y) <= 0.6

    def _passed(self, feet: Vec3) -> bool:
        """Beyond the next node along the way to it, at its height and not far off the line: an
        overshoot, which counts as getting there."""
        prev, node = self.ground.nodes[self.path[self.next - 1]], self.ground.nodes[self.path[self.next]]
        along = (feet.x - node.x) * (node.x - prev.x) + (feet.z - node.z) * (node.z - prev.z)
        return along >= 0 and _across(feet, node) <= 2 * ARRIVE and abs(feet.y - node.y) <= 0.6


def _across(a: Vec3, b: Vec3) -> float:
    return math.hypot(a.x - b.x, a.z - b.z)
