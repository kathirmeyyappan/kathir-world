"""Circle the nearest player, or the world origin when alone, at a fixed radius, turning back the
other way round when something's in the way or the floor ends ahead.

It reads only the world's outline and the bodies (a few KB), not the whole map: a wall turns it
back with a hop (over a kerb or a rail), and so it shuttles along whatever arc of the ring it can
walk."""

from __future__ import annotations

import asyncio
import math
import time
from contextlib import suppress
from typing import Any

from common import (
    Controls,
    Event,
    Player,
    RoomConnectionError,
    Vec3,
    WorldState,
    connect,
    log_death,
    log_message,
    run_input_loop,
)
from common.bodies import Bodies, load_bodies
from common.controls import TICK_RATE
from common.deployment import validate_duration
from common.outline import Outline, load_outline

ORBIT_RADIUS = 12
RADIAL_CORRECTION_DISTANCE = 6
# Metres ahead along its move the bot looks for floor: none there (the world's edge, where a step
# further drops it to its death) and it turns back, or stands if neither way has floor.
EDGE_LOOKAHEAD = 1.5
# Blocked means covering under half the commanded distance over a few ticks: a wall is soaking up
# the move. The window is long enough that one late snapshot doesn't count.
BLOCKED_PROGRESS = 0.5
BLOCKED_TICKS = 4
# After joining or a detour, the snapshots still show the old input for a round trip, so the
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
    circler = Circler(load_outline(), load_bodies())
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
    """Circling one way round, and turning back the other at a wall or the floor's end."""

    def __init__(self, outline: Outline, bodies: Bodies) -> None:
        self.outline = outline
        self.bodies = bodies
        self.stall = Stall()
        self.way = CLOCKWISE
        self.turns = 0

    def step(self, tick: int, me: Player, center: Vec3, controls: Controls) -> bool:
        """Set the controls for this snapshot; True when it turned back."""
        controls.look_at(me.pos, center)
        distance = math.hypot(me.pos.x - center.x, me.pos.z - center.z)
        way = self.way
        if self.stall.blocked(tick, me.pos, controls, self.bodies.walk_speed(me.avatar)):
            way = -way
            controls.jump()
        if not self._walkable(me, controls, distance, way):
            way = -way
            if not self._walkable(me, controls, distance, way):
                controls.stop()
                return False
        if way == self.way:
            return False
        self.way = way
        self.turns += 1
        self.stall.reset(tick)
        return True

    def _walkable(self, me: Player, controls: Controls, distance: float, way: int) -> bool:
        """Set the controls to circle ``way`` round; whether there's floor EDGE_LOOKAHEAD along
        that move. Off the outline already (up on a deck), it can't tell, and goes on."""
        _orbit(controls, distance, way)
        if not self.outline.inside(me.pos.x, me.pos.z):
            return True
        dx, dz = _world_move(controls)
        length = math.hypot(dx, dz)
        if length < 1e-6:
            return True
        return self.outline.inside(me.pos.x + dx / length * EDGE_LOOKAHEAD, me.pos.z + dz / length * EDGE_LOOKAHEAD)


# Which way round the bot circles, as the way it strafes facing the centre: right is clockwise seen
# from above.
CLOCKWISE = 1


def _orbit(controls: Controls, distance: float, way: int) -> None:
    """Strafe round the centre ``way`` round, easing in or out toward the ring."""
    radial = max(-1.0, min(1.0, (distance - ORBIT_RADIUS) / RADIAL_CORRECTION_DISTANCE))
    controls.move(forward=radial, right=way)


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


def _player_name(state: WorldState, player_id: str) -> str:
    player = state.players.get(player_id)
    return player.name if player else player_id
