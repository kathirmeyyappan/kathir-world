from __future__ import annotations

from typing import Any


def player(
    player_id: str = "p1",
    name: str = "observer",
    *,
    hearts: float = 10,
    dead: bool = False,
) -> dict[str, Any]:
    return {
        "id": player_id,
        "name": name,
        "color": "#64b5f6",
        "pos": {"x": 1, "y": 1.7, "z": 2},
        "vy": 0,
        "yaw": 0,
        "pitch": 0,
        "lastSeq": 0,
        "reading": None,
        "boost": 0,
        "chilled": 0,
        "item": None,
        "gear": None,
        "scoped": False,
        "firing": False,
        "thrusting": False,
        "avatar": "standard",
        "avatarLocked": False,
        "hearts": hearts,
        "kills": 0,
        "deaths": 0,
        "body": 1,
        "bot": False,
        "dead": dead,
        "ghost": False,
        "riding": None,
    }


def kart(kart_id: str = "k1", driver: str | None = None) -> dict[str, Any]:
    """A kart as the room sends it: its KartState, and what the garage adds (garage.ts Kart)."""
    return {
        "id": kart_id,
        "kart": "standard",
        "size": 1,
        "pos": {"x": 4, "y": 0, "z": 6},
        "yaw": 0.5,
        "vel": {"x": 3, "y": 0, "z": 4},
        "wheel": 0,
        "gas": 1,
        "grounded": True,
        "held": True,
        "press": None,
        "down": None,
        "hop": None,
        "drift": {"way": -1, "t": 1.2, "from": 0.3},
        "trick": None,
        "turbo": None,
        "boosts": 0,
        "pad": False,
        "reel": 0,
        "paint": {"avatar": "standard", "colour": "#64b5f6"},
        "wrenches": 5,
        "driver": driver,
    }


def cube(cube_id: str = "aws") -> dict[str, Any]:
    return {
        "id": cube_id,
        "x": 5,
        "y": 3,
        "z": -4,
        "rx": 0.1,
        "ry": 0.2,
    }


def welcome() -> dict[str, Any]:
    return {
        "t": "welcome",
        "id": "p1",
        "room": "opaque-modal-session",
        "tick": 42,
        "players": [player()],
        "cubes": [cube()],
        "pickups": [],
        "karts": [],
        "game": {"mode": "freeplay", "master": None, "phase": None, "until": None, "bots": []},
        "doors": [{"id": "front", "open": False}],
    }
