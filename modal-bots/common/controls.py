"""High-level bot controls over the game's input protocol."""

from __future__ import annotations

import asyncio
import math

from .connection import Connection
from .protocol import Cube, Vec3

TICK_RATE = 30
TICK_SECONDS = 1 / TICK_RATE
MAX_PITCH = math.pi / 2 - 0.1


class Controls:
    """Persistent input intent; call ``send_input`` once per game tick."""

    def __init__(self, connection: Connection):
        self.connection = connection
        me = next(player for player in connection.welcome.players if player.id == connection.id)
        self.seq = me.last_seq
        self.right = 0.0
        self.forward = 0.0
        self.yaw = me.yaw
        self.pitch = me.pitch
        self.reading: str | None = None
        self._jump = False
        self._use: str | None = None
        self._shoot = False
        self._shoot_once = False
        self._shot_look: tuple[float, float] | None = None
        self._scope = False
        self._thrust = False
        self._run = False
        self._drift = False
        self._exit = False

    def move(self, *, forward: float = 0, right: float = 0) -> None:
        if not math.isfinite(forward) or not math.isfinite(right):
            raise ValueError("movement must be finite")
        length = math.hypot(forward, right)
        scale = max(1.0, length)
        self.forward = forward / scale
        self.right = right / scale

    def stop(self) -> None:
        self.move()

    def walk_toward(self, origin: Vec3, target: Vec3, speed: float = 1) -> None:
        """Move across the floor from ``origin`` toward ``target`` at ``speed`` (0 to 1), whichever
        way the bot is looking: ``move`` is relative to the look, so call this after ``look``."""
        dx = target.x - origin.x
        dz = target.z - origin.z
        length = math.hypot(dx, dz)
        if length < 1e-6:
            self.stop()
            return
        # The inverse of how the sim turns (mx, my) into world motion (stepPlayer).
        sin_y, cos_y = math.sin(self.yaw), math.cos(self.yaw)
        dx, dz = dx / length * speed, dz / length * speed
        self.move(forward=sin_y * dx + cos_y * dz, right=cos_y * dx - sin_y * dz)

    def drive(self, *, gas: float = 0, steer: float = 0, drift: bool = False) -> None:
        """The keys of the kart the bot is sat in (sim/vehicles/kart.ts), each held until changed:
        the gas (1) or the brake (-1, which backs it up once it has stopped), the wheel (-1 full
        left to 1 full right), and the drift key, whose press hops it into a drift on the ground
        and tricks it in the air."""
        if not math.isfinite(gas) or not math.isfinite(steer):
            raise ValueError("a kart's keys must be finite")
        self.forward = max(-1.0, min(1.0, gas))
        self.right = max(-1.0, min(1.0, steer))
        self._drift = drift

    def look(self, yaw: float, pitch: float = 0) -> None:
        if not math.isfinite(yaw) or not math.isfinite(pitch):
            raise ValueError("look angles must be finite")
        self.yaw = yaw
        self.pitch = max(-MAX_PITCH, min(MAX_PITCH, pitch))

    def look_at(self, origin: Vec3, target: Vec3) -> None:
        dx = target.x - origin.x
        dy = target.y - origin.y
        dz = target.z - origin.z
        self.look(math.atan2(dx, dz), -math.atan2(dy, math.hypot(dx, dz)))

    def get_out(self) -> None:
        """One frame of the key that gets a driver out of their kart, where the room's game lets
        them out."""
        self._exit = True

    def jump(self) -> None:
        self._jump = True

    def use(self, door: str) -> None:
        """Click the door the bot is looking at, as a person does, for one frame: the room swings it
        if it's ``door`` and within reach along the look (``DOOR_REACH``, sim/doors.ts)."""
        self._use = door

    def shoot(self, held: bool = True) -> None:
        self._shoot = held

    def fire_once(self) -> None:
        """One press frame, aimed where the bot is looking now: a ``look`` before that frame goes
        out turns the bot but not the shot."""
        self._shoot_once = True
        self._shot_look = (self.yaw, self.pitch)

    def scope(self, enabled: bool = True) -> None:
        self._scope = enabled

    def thrust(self, held: bool = True) -> None:
        """Hold the worn jetpack's thrust (``/jetpack``) on every frame until released."""
        self._thrust = held

    def run(self, held: bool = True) -> None:
        """Hold the run on every frame until released: the walk faster, except down a scope."""
        self._run = held

    def read_cube(self, cube: Cube | str | None) -> None:
        self.reading = cube.id if isinstance(cube, Cube) else cube

    async def respawn(self) -> None:
        """Ask to be brought back from the dead now, as the death screen's button does: the room
        answers only where its game gives the dead that screen."""
        await self.connection.send({"t": "respawn"})

    async def chat(self, text: str) -> None:
        await self.connection.send({"t": "chat", "text": text})

    async def command(self, command: str) -> None:
        await self.chat(command if command.startswith("/") else f"/{command}")

    async def send_input(self) -> None:
        self.seq += 1
        actions: list[str] = []
        if self._shoot or self._shoot_once:
            actions.append("shoot")
        if self._scope:
            actions.append("scope")
        if self._thrust:
            actions.append("thrust")
        if self._run:
            actions.append("run")
        if self._drift:
            actions.append("drift")
        if self._exit:
            actions.append("exit")
        yaw, pitch = self._shot_look or (self.yaw, self.pitch)
        frame = {
            "seq": self.seq,
            "mx": self.right,
            "my": self.forward,
            "yaw": yaw,
            "pitch": pitch,
            "jump": self._jump,
            "reading": self.reading,
            "actions": actions,
            "use": self._use,
        }
        # The tick this bot is aiming at; the server judges its shots there (lag compensation).
        if self.connection.view_tick is not None:
            frame["view"] = self.connection.view_tick
        await self.connection.send({"t": "input", "f": frame})
        self._jump = False
        self._exit = False
        self._use = None
        self._shoot_once = False
        self._shot_look = None


async def run_input_loop(controls: Controls, stop: asyncio.Event) -> None:
    """Send current intent at 30 Hz until ``stop`` is set."""

    loop = asyncio.get_running_loop()
    next_tick = loop.time()
    while not stop.is_set():
        await controls.send_input()
        next_tick += TICK_SECONDS
        now = loop.time()
        next_tick = max(next_tick, now)
        await asyncio.sleep(next_tick - now)
