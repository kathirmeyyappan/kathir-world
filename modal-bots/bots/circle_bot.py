"""Circle the nearest player, or the world origin when alone, the same way round, on a ring that
tightens where a wall stops it or the ground drops away ahead, and eases back out to its full size
once there's room, so it keeps circling someone on a bridge or a road narrower than the ring. From
far off it walks straight at them. Where no ring has ground ahead it turns back the other way, and
where neither way has it slides along the edge; held at the tightest ring by a wall, it turns back.
A turn back lasts a few seconds at the least, and then it goes clockwise again once that way has
ground ahead, so two circling each other find their orbit again. It reads the solids and the
bodies, not the ground map, which is most of the memory a bot's maps take."""

from __future__ import annotations

import asyncio
import math
import time
from contextlib import suppress
from typing import Any

from common import (
    Bodies,
    Controls,
    Event,
    Player,
    RoomConnectionError,
    Solids,
    Vec3,
    WorldState,
    connect,
    load_bodies,
    load_solids,
    log_death,
    log_message,
    run_input_loop,
)
from common.controls import TICK_RATE
from common.deployment import validate_duration
from common.map.bodies import EYE_HEIGHT

ORBIT_RADIUS = 12  # metres: the ring's full size, which it never grows past
MIN_RADIUS = 3  # metres: the tightest ring, a couple of bodies clear of whoever it circles
SHRINK = 1.5  # metres the ring tightens each time a drop or a wall is in its way
GROW = 1.0  # m/s the ring eases back out toward ORBIT_RADIUS while there's ground for it
# Metres off the ring over which it eases in or out; as far again past that it still strafes round,
# less and less, and further off it walks straight at the centre.
RADIAL_CORRECTION_DISTANCE = 6
# Seconds of walking ahead the bot looks for ground along its move: its snapshot's age, its input's
# way back to the Room and a tick or two, so it stops short at its own walk however late it hears.
# Ground missing there within EDGE_DROP under its feet (the floor's edge, where a step further drops
# it to its death, or the edge of whatever it stands on) at any of the spots EDGE_SAMPLE apart, and
# it tightens the ring, turns back, or slides along the edge.
EDGE_REACTION = 0.8
EDGE_LOOKAHEAD = 1.5  # metres it looks ahead at the least
EDGE_SAMPLE = 0.5
EDGE_DROP = 1.0
# Seconds a turn back lasts at the least before it goes clockwise again, as soon as that way has
# ground ahead: every circle bot goes round clockwise, so two circling each other orbit their
# middle, and one left going the other way would walk alongside the other instead.
DETOUR_SECONDS = 3.0
# Degrees its heading is swung off to either side, nearest first, to slide along an edge where no
# ring has ground ahead either way round.
SWINGS = (30, 60, 90, 120, 150)
STEP = 0.5  # metres a walk steps up onto on its own (STEP_UP in packages/shared/src/sim/constants.ts)
# Blocked means covering under half the commanded distance over a few ticks: a wall is soaking up
# the move. The window is long enough that one late snapshot doesn't count.
BLOCKED_PROGRESS = 0.5
BLOCKED_TICKS = 4
# After joining or tightening, the snapshots still show the old input for a round trip, so the
# check waits this long before judging again.
SETTLE_TICKS = 15


async def run_circle_bot(
    room: str,
    name: str = "circle-bot",
    seconds: float = 30,
    *,
    lobby_url: str | None = None,
    direct_ws_url: str | None = None,
    spawn: Vec3 | None = None,
    avatar: str | None = None,
) -> dict[str, Any]:
    validate_duration(seconds)
    connect_started = time.monotonic()
    connection = await connect(
        lobby_url,
        room,
        name,
        direct_url=direct_ws_url,
        spawn=spawn,
        avatar=avatar,
    )
    connected_at = time.monotonic()
    state = WorldState(connection.welcome, connection.room)
    controls = Controls(connection)
    stop = asyncio.Event()
    inputs = asyncio.create_task(run_input_loop(controls, stop))
    completed = False
    target_key: str | None = None
    circler = Circler(load_solids(), load_bodies())
    observed_until = connected_at

    log_message(name, "joined room", player_id=connection.id, room=connection.room)

    try:
        async with asyncio.timeout(seconds):
            while True:
                message = await connection.receive()
                state.apply(message)
                if state.me is None:
                    break
                if state.me.dead:
                    # Input from the dead does nothing, so stop sending it and wait for the server
                    # to remove the corpse and close the connection. A shot death's kill event,
                    # naming the killer and weapon, follows the fatal hit; /kill-bots sends none.
                    stop.set()
                    if isinstance(message, Event) and message.t == "kill":
                        log_death(
                            name,
                            _player_name(state, message.data["shooter"]),
                            item=message.data["item"],
                            headshot=message.data["headshot"],
                        )
                    continue

                target = state.nearest_player()
                center = target.pos if target else Vec3(0, state.me.pos.y, 0)
                if circler.step(state.tick, state.me, center, controls):
                    log_message(name, "turned back", tick=state.tick, way=circler.way)
                next_target = target.id if target else "origin"
                if next_target != target_key:
                    target_key = next_target
                    log_message(name, "orbit target changed", target=target_key)
    except TimeoutError:
        completed = True
    except RoomConnectionError:
        pass
    finally:
        observed_until = time.monotonic()
        stop.set()
        inputs.cancel()
        with suppress(asyncio.CancelledError, RoomConnectionError):
            await inputs
        if connection.close_code is None:
            await connection.close(reason=f"{name} complete")

    observed_seconds = observed_until - connected_at
    log_message(
        name,
        "finished",
        completed=completed,
        observed_seconds=round(observed_seconds, 3),
        target=target_key,
        turns=circler.turns,
    )
    return {
        "bot": name,
        "completed": completed,
        "observed_seconds": round(observed_seconds, 6),
        "connection_seconds": round(connected_at - connect_started, 6),
        "target": target_key,
        "turns": circler.turns,
        "last_tick": state.tick,
        "final_state": state.to_dict(),
    }


class Circler:
    """Circling one way round on a ring that tightens round a wall or a drop and eases back out,
    turning back the other way only where no ring has ground ahead. Where there's ground comes
    from the solids, anywhere in the world."""

    def __init__(self, solids: Solids, bodies: Bodies) -> None:
        self.solids = solids
        self.bodies = bodies
        self.stall = Stall()
        self.way = CLOCKWISE
        self.radius: float = ORBIT_RADIUS
        self.turns = 0
        self._tick: int | None = None  # the snapshot it last stepped on
        self._turned = 0  # the snapshot it last turned back on

    def step(self, tick: int, me: Player, center: Vec3, controls: Controls) -> bool:
        """Set the controls for this snapshot; True when it turned back."""
        dt = 0.0 if self._tick is None else (tick - self._tick) / TICK_RATE
        self._tick = tick
        controls.look_at(me.pos, center)
        distance = math.hypot(me.pos.x - center.x, me.pos.z - center.z)
        turned = False
        if self.stall.blocked(tick, me.pos, controls, self.bodies.walk_speed(me.avatar)):
            if self.radius > MIN_RADIUS:
                self.radius = max(MIN_RADIUS, self.radius - SHRINK)
            else:
                turned = self._turn(tick)
        detoured = tick - self._turned >= DETOUR_SECONDS * TICK_RATE
        if self.way != CLOCKWISE and detoured and self._clear(me, controls, _heading(distance, self.radius, CLOCKWISE)):
            turned = self._turn(tick)
        wider = min(ORBIT_RADIUS, self.radius + GROW * dt)
        if wider > self.radius and self._clear(me, controls, _heading(distance, wider, self.way)):
            self.radius = wider
        for way in (self.way, -self.way):
            radius = self._ring(me, controls, distance, way)
            if radius is None:
                continue
            self.radius = radius
            return self._turn(tick) if way != self.way else turned
        # No ring has ground ahead either way round: slide along the edge, the heading swung off to
        # whichever side has ground, the nearest swing first.
        forward, right = _heading(distance, self.radius, self.way)
        for swing in SWINGS:
            for side in (self.way, -self.way):
                if self._clear(me, controls, _swung(forward, right, side * swing)):
                    return turned
        controls.stop()
        return turned

    def _turn(self, tick: int) -> bool:
        """Go round the other way."""
        self.way = -self.way
        self.turns += 1
        self._turned = tick
        self.stall.reset(tick)
        return True

    def _ring(self, me: Player, controls: Controls, distance: float, way: int) -> float | None:
        """The widest ring no wider than its own with ground ahead circling ``way`` round, the
        controls set to circle it; None where even the tightest has none."""
        radius: float = self.radius
        while not self._clear(me, controls, _heading(distance, radius, way)):
            if radius <= MIN_RADIUS:
                return None
            radius = max(MIN_RADIUS, radius - SHRINK)
        return radius

    def _clear(self, me: Player, controls: Controls, heading: tuple[float, float]) -> bool:
        """Set the controls to walk ``heading`` (forward, right); whether there's ground all along
        the way it walks in EDGE_REACTION, within EDGE_DROP under the feet."""
        forward, right = heading
        controls.move(forward=forward, right=right)
        dx, dz = _world_move(controls)
        length = math.hypot(dx, dz)
        if length < 1e-6:
            return True
        feet = _feet(me)
        ahead = max(EDGE_LOOKAHEAD, self.bodies.walk_speed(me.avatar) * EDGE_REACTION)
        steps = math.ceil(ahead / EDGE_SAMPLE)
        for i in range(1, steps + 1):
            d = ahead * i / steps
            x, z = feet.x + dx / length * d, feet.z + dz / length * d
            if feet.y - self.solids.ground_at(x, z, feet.y + STEP) > EDGE_DROP:
                return False
        return True


# Which way round the bot circles, as the way it strafes facing the centre: right is clockwise seen
# from above.
CLOCKWISE = 1


def _heading(distance: float, radius: float, way: int) -> tuple[float, float]:
    """The move (forward, right, facing the centre) that strafes ``way`` round it, easing in or out
    toward a ring of ``radius``; from far off, straight at it."""
    off = distance - radius
    radial = max(-1.0, min(1.0, off / RADIAL_CORRECTION_DISTANCE))
    strafe = max(0.0, min(1.0, 2 - off / RADIAL_CORRECTION_DISTANCE))
    return radial, way * strafe


def _swung(forward: float, right: float, degrees: float) -> tuple[float, float]:
    """A move (forward, right) turned ``degrees`` toward the right."""
    a = math.radians(degrees)
    return forward * math.cos(a) - right * math.sin(a), right * math.cos(a) + forward * math.sin(a)


class Stall:
    """Whether the bot has stopped making headway on the move it's commanding."""

    def __init__(self) -> None:
        self._settle_until: int | None = None
        # Where the window started: tick, position, and the commanded move in world metres per
        # second at full speed.
        self._start: tuple[int, float, float, float, float] | None = None

    def reset(self, tick: int) -> None:
        self._settle_until = tick + SETTLE_TICKS
        self._start = None

    def blocked(self, tick: int, pos: Vec3, controls: Controls, speed: float) -> bool:
        """Judge the move commanded so far against where the bot got to, walking at ``speed`` m/s
        at full input."""
        if self._settle_until is None:
            self._settle_until = tick + SETTLE_TICKS
        dx, dz = _world_move(controls)
        if tick < self._settle_until or self._start is None:
            self._start = (tick, pos.x, pos.z, dx, dz)
            return False
        start_tick, x, z, sdx, sdz = self._start
        elapsed = tick - start_tick
        if elapsed < BLOCKED_TICKS:
            return False
        self._start = (tick, pos.x, pos.z, dx, dz)
        wanted = sdx * sdx + sdz * sdz
        if wanted < 1e-6:
            return False
        # Metres along the commanded line, scaled up as if the command had been full speed.
        made = ((pos.x - x) * sdx + (pos.z - z) * sdz) / wanted
        if made >= BLOCKED_PROGRESS * speed * elapsed / TICK_RATE:
            return False
        self._settle_until = tick + SETTLE_TICKS
        return True


# The commanded move in world x/z, as the sim turns an input frame's mx/my into motion
# (stepPlayer in packages/shared/src/sim/player.ts).
def _world_move(controls: Controls) -> tuple[float, float]:
    sin_y = math.sin(controls.yaw)
    cos_y = math.cos(controls.yaw)
    return (
        sin_y * controls.forward + cos_y * controls.right,
        cos_y * controls.forward - sin_y * controls.right,
    )


def _feet(p: Player) -> Vec3:
    return Vec3(p.pos.x, p.pos.y - EYE_HEIGHT, p.pos.z)


def _player_name(state: WorldState, player_id: str) -> str:
    player = state.players.get(player_id)
    return player.name if player else player_id
