"""Following a way through the world map: steer at each node of a path in turn, jumping where the
map says only a jump gets there, and across open floor straight for the furthest of them it can."""

from __future__ import annotations

import math

from .controls import TICK_RATE, Controls
from .protocol import Vec3
from .world import EYE_HEIGHT, WorldMap

ARRIVE = 0.6  # metres across the floor from a node that count as there
JUMP_FROM = 0.3  # metres from a jump's take-off a bot lines up within first (the map jumped from it)
JUMP_SETTLE_TICKS = 6  # it stands there this long before jumping, so a late snapshot can't mislead it
LINE_UP = 2.0  # metres from a take-off where it starts slowing down to stop on it
STUCK_SECONDS = 2.0  # this long no closer to the next node means something's in the way
HEADWAY = 0.5  # metres closer to the next node that count as getting somewhere
# Metres along the path it steers at. Steering at the very next node (a metre off) makes a bot
# that sees itself a few ticks late overshoot it, turn back and circle; a point further on keeps
# the walk smooth while staying close enough to the path to round corners and doorways.
LOOKAHEAD = 2.5


class Route:
    """A path from ``world.path``, for a body that moves as ``avatar`` does (the same one the path
    was found for). Call ``steer`` on every snapshot; it sets the controls' move (relative to
    whatever they're looking at, so look first) and says when the walk is over."""

    def __init__(self, world: WorldMap, path: list[int], tick: int, avatar: str = "standard"):
        self.world = world
        self.jumps = world.jumps_of(avatar)
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
        LOOKAHEAD of the bot, short of any jump (a jump has to start from its own take-off spot),
        or a jump's landing while it's on one."""
        feet = Vec3(eye.x, eye.y - EYE_HEIGHT, eye.z)
        i = min(self.next, len(self.path) - 1)
        while (
            not self._jumping
            and i + 1 < len(self.path)
            and self.path[i + 1] not in self.jumps[self.path[i]]
            and _across(feet, self.world.nodes[self.path[i + 1]]) <= LOOKAHEAD
        ):
            i += 1
        node = self.world.nodes[self.path[i]]
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
        off = _across(feet, self.world.nodes[self.path[self.next]])
        if off < self._closest - HEADWAY:
            self._closest, self._since = off, tick
        if self._jumping and not self._jumped:
            # Line up on the take-off spot and stand there a moment, then go: the map's jump
            # starts there.
            start = self.world.nodes[self.path[self.next - 1]]
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
            and self.world.straight(feet, self.world.nodes[self.path[i + 1]])
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

    @property
    def _jumping(self) -> bool:
        """Whether the way to the next node is a jump."""
        return 0 < self.next < len(self.path) and self.path[self.next] in self.jumps[self.path[self.next - 1]]

    def _reached(self, feet: Vec3) -> bool:
        """Within ARRIVE of the next node, or on it where it's a square of open floor."""
        i = self.path[self.next]
        node = self.world.nodes[i]
        if i in self.world.areas and self.world.area_at(feet) == i:
            return True
        return _across(feet, node) <= ARRIVE and abs(feet.y - node.y) <= 0.6

    def _passed(self, feet: Vec3) -> bool:
        """Beyond the next node along the way to it, at its height and not far off the line: an
        overshoot, which counts as getting there."""
        prev, node = self.world.nodes[self.path[self.next - 1]], self.world.nodes[self.path[self.next]]
        along = (feet.x - node.x) * (node.x - prev.x) + (feet.z - node.z) * (node.z - prev.z)
        return along >= 0 and _across(feet, node) <= 2 * ARRIVE and abs(feet.y - node.y) <= 0.6


def _across(a: Vec3, b: Vec3) -> float:
    return math.hypot(a.x - b.x, a.z - b.z)
