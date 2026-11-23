"""The bodies there are: every avatar's hitbox, for aiming, its eyes, its walk, the way it moves
and its life (``packages/shared/src/sim/botMap/bodies.ts``)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..protocol import Player, Vec3
from . import once, read

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
    def __init__(self, bodies: Mapping[str, Any]):
        self.hitboxes = {
            avatar: Hitbox(float(h["top"]), float(h["radius"]), float(h["head"]))
            for avatar, h in bodies["hitboxes"].items()
        }
        self.eyes = {avatar: float(e) for avatar, e in bodies["eyes"].items()}
        # How fast each avatar walks at full input, m/s.
        self.walks = {avatar: float(w) for avatar, w in bodies["walks"].items()}
        # The way each avatar moves on foot (its walk and jump power): the key to its jumps over
        # the ground.
        self.moves = {str(avatar): str(move) for avatar, move in bodies["moves"].items()}
        # The hearts of each avatar's full life.
        self.lives = {str(avatar): float(hearts) for avatar, hearts in bodies["lives"].items()}

    def hitbox(self, avatar: str) -> Hitbox:
        """An avatar's hitbox, the standard one's for an avatar the map doesn't know."""
        return self.hitboxes.get(avatar, self.hitboxes["standard"])

    def walk_speed(self, avatar: str) -> float:
        """How fast an avatar walks at full input, m/s; the standard one's for an avatar the map
        doesn't know."""
        return self.walks.get(avatar, self.walks["standard"])

    def move_of(self, avatar: str) -> str:
        """The way an avatar moves; the standard body's for an avatar the map doesn't know."""
        return self.moves.get(avatar, self.moves["standard"])

    def life_of(self, avatar: str) -> float:
        """The hearts of an avatar's full life; the standard one's for an avatar the map doesn't
        know."""
        return self.lives.get(avatar, self.lives["standard"])

    def eye_of(self, p: Player) -> Vec3:
        """Where a player's avatar has its eyes, and so where its shots leave: ``pos`` is the body's
        eye point, EYE_HEIGHT up, and the avatar's own may sit higher or lower."""
        return Vec3(p.pos.x, p.pos.y - EYE_HEIGHT + self.eyes.get(p.avatar, EYE_HEIGHT), p.pos.z)


@once
def load_bodies() -> Bodies:
    return Bodies(read("bodies"))
