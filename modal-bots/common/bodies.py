"""Each avatar's body as the bots need it: its hitbox, its eyes, its walk and how it moves (the map's
bodies stage, ``BodiesMap`` in ``packages/shared/src/sim/botMap.ts``)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

from .protocol import Player, Vec3
from .stages import read_stage

EYE_HEIGHT = 1.7  # metres from feet to eyes (EYE_HEIGHT in packages/shared/src/sim/constants.ts)


@dataclass(frozen=True, slots=True)
class Hitbox:
    """What a shot has to land in (Hitbox in packages/shared/src/sim/avatars.ts): an upright capsule
    from the feet up to ``top`` metres, ``radius`` round its axis, whose top ``head`` metres are the
    head."""

    top: float
    radius: float
    head: float


class Bodies:
    """Every avatar's body; an avatar the map doesn't know is the standard one."""

    def __init__(self, bodies: Mapping[str, Any]):
        self.hitboxes = {
            avatar: Hitbox(float(h["top"]), float(h["radius"]), float(h["head"]))
            for avatar, h in bodies["hitboxes"].items()
        }
        self.eyes = {avatar: float(e) for avatar, e in bodies["eyes"].items()}
        # How fast each avatar walks at full input, m/s.
        self.walks = {avatar: float(w) for avatar, w in bodies["walks"].items()}
        # Which way of moving each avatar's is, the key to its jumps in the moves stage.
        self.moves = {str(avatar): str(move) for avatar, move in bodies["moves"].items()}

    def hitbox(self, avatar: str) -> Hitbox:
        return self.hitboxes.get(avatar, self.hitboxes["standard"])

    def walk_speed(self, avatar: str) -> float:
        """How fast an avatar walks at full input, m/s."""
        return self.walks.get(avatar, self.walks["standard"])

    def move(self, avatar: str) -> str:
        return self.moves.get(avatar, self.moves["standard"])

    def eye_of(self, p: Player) -> Vec3:
        """Where a player's avatar has its eyes, and so where its shots leave: ``pos`` is the body's
        eye point, EYE_HEIGHT up, and the avatar's own may sit higher or lower."""
        return Vec3(p.pos.x, p.pos.y - EYE_HEIGHT + self.eyes.get(p.avatar, EYE_HEIGHT), p.pos.z)


@cache
def load_bodies() -> Bodies:
    """The bodies, read once per process and shared by every bot in it."""
    return Bodies(read_stage("bodies"))
