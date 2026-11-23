"""Small typed view of the game's JSON protocol."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import asdict, dataclass, field, fields
from typing import Any, TypeAlias, TypeVar


class ProtocolError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Vec3:
    x: float
    y: float
    z: float


@dataclass(frozen=True, slots=True)
class Item:
    id: str
    locked: bool
    fuel: float | None


@dataclass(frozen=True, slots=True)
class Gear:
    id: str
    left: float
    fuel: float


@dataclass(frozen=True, slots=True)
class Player:
    id: str
    name: str
    color: str
    pos: Vec3
    vy: float
    yaw: float
    pitch: float
    last_seq: int
    reading: str | None
    boost: float
    chilled: float
    item: Item | None
    gear: Gear | None
    scoped: bool
    firing: bool
    thrusting: bool
    avatar: str
    avatar_locked: bool
    hearts: float
    kills: int
    deaths: int
    body: int
    bot: bool
    dead: bool
    ghost: bool
    riding: str | None  # the kart they're driving, sat in its seat; None on foot


@dataclass(frozen=True, slots=True)
class Drift:
    way: int  # 1 to the right, -1 to the left
    t: float  # seconds of it on the ground: a spark at each of its kart's ``sparks`` (map.karts)


@dataclass(frozen=True, slots=True)
class Kart:
    """A kart as the room last told of it (KartState in packages/shared/src/sim/vehicles/kart.ts)."""

    id: str
    kart: str  # which kart it is (map.karts)
    driver: str | None  # the player driving it
    pos: Vec3  # the middle of its underside
    vel: Vec3
    yaw: float  # the way its nose points
    grounded: bool
    hopping: bool  # in the hop a press of the drift key gives, which a drift begins with
    drift: Drift | None
    reel: float  # seconds left of reeling from what it ran into, its tires doing nothing
    rescued: bool  # in Lakitu's hands, being set back on the road: nothing drives it meanwhile
    wrenches: float


@dataclass(frozen=True, slots=True)
class Cube:
    id: str
    x: float
    y: float
    z: float
    rx: float
    ry: float


@dataclass(frozen=True, slots=True)
class Pickup:
    """Something floating that a player takes by walking into it (a heart gives hearts back)."""

    id: str
    kind: str
    x: float
    y: float
    z: float
    ry: float


@dataclass(frozen=True, slots=True)
class Welcome:
    id: str
    room: str
    tick: int
    players: tuple[Player, ...]
    cubes: tuple[Cube, ...]
    pickups: tuple[Pickup, ...]
    karts: tuple[Kart, ...]
    # The room's game (GameState in packages/shared/src/modes/index.ts): its mode, where it is,
    # and whatever its mode keeps of it.
    game: Mapping[str, Any]
    doors: Mapping[str, bool] = field(default_factory=dict)  # every door (sim/doors.ts) and whether it stands open
    t: str = "welcome"


@dataclass(frozen=True, slots=True)
class Snapshot:
    tick: int
    players: tuple[Player, ...]
    cubes: tuple[Cube, ...]
    pickups: tuple[Pickup, ...]
    karts: tuple[Kart, ...]
    t: str = "snap"


@dataclass(frozen=True, slots=True)
class Event:
    """Any non-snapshot event, including future server message types."""

    t: str
    data: Mapping[str, Any]


Message: TypeAlias = Welcome | Snapshot | Event


def decode(payload: str | bytes) -> Message:
    try:
        data = json.loads(payload, parse_constant=_invalid_constant)
        if not isinstance(data, dict) or not isinstance(data.get("t"), str):
            raise ProtocolError("message must be an object with a string 't'")
        if data["t"] == "welcome":
            return Welcome(
                id=data["id"],
                room=data["room"],
                tick=data["tick"],
                players=tuple(player(value) for value in data["players"]),
                cubes=tuple(cube(value) for value in data["cubes"]),
                pickups=tuple(_pick(Pickup, value) for value in data["pickups"]),
                karts=tuple(kart(value) for value in data["karts"]),
                game=data["game"],
                doors={str(d["id"]): bool(d["open"]) for d in data["doors"]},
            )
        if data["t"] == "snap":
            return Snapshot(
                tick=data["tick"],
                players=tuple(player(value) for value in data["players"]),
                cubes=tuple(cube(value) for value in data["cubes"]),
                pickups=tuple(_pick(Pickup, value) for value in data["pickups"]),
                karts=tuple(kart(value) for value in data["karts"]),
            )
        return Event(t=data["t"], data=data)
    except ProtocolError:
        raise
    except (json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError, ValueError) as exc:
        raise ProtocolError("malformed server message") from exc


T = TypeVar("T")


def _pick(cls: type[T], data: Mapping[str, Any]) -> T:
    """Build a dataclass from the wire fields it knows about. Extra fields the server adds
    later are ignored; missing ones still fail, so a real protocol break is still caught."""
    return cls(**{f.name: data[f.name] for f in fields(cls)})  # type: ignore[arg-type]


def player(data: Mapping[str, Any]) -> Player:
    item_data = data["item"]
    gear_data = data["gear"]
    return Player(
        id=data["id"],
        name=data["name"],
        color=data["color"],
        pos=_pick(Vec3, data["pos"]),
        vy=data["vy"],
        yaw=data["yaw"],
        pitch=data["pitch"],
        last_seq=data["lastSeq"],
        reading=data["reading"],
        boost=data["boost"],
        chilled=data["chilled"],
        item=None if item_data is None else _pick(Item, item_data),
        gear=None if gear_data is None else _pick(Gear, gear_data),
        scoped=data["scoped"],
        firing=data["firing"],
        thrusting=data["thrusting"],
        avatar=data["avatar"],
        avatar_locked=data["avatarLocked"],
        hearts=data["hearts"],
        kills=data["kills"],
        deaths=data["deaths"],
        body=data["body"],
        bot=data["bot"],
        dead=data["dead"],
        ghost=data["ghost"],
        riding=data["riding"],
    )


def kart(data: Mapping[str, Any]) -> Kart:
    drift = data["drift"]
    return Kart(
        id=data["id"],
        kart=data["kart"],
        driver=data["driver"],
        pos=_pick(Vec3, data["pos"]),
        vel=_pick(Vec3, data["vel"]),
        yaw=data["yaw"],
        grounded=data["grounded"],
        hopping=data["hop"] is not None,
        drift=None if drift is None else Drift(way=drift["way"], t=drift["t"]),
        reel=data["reel"],
        rescued=data.get("rescue") is not None,
        wrenches=data["wrenches"],
    )


def cube(data: Mapping[str, Any]) -> Cube:
    return _pick(Cube, data)


def to_dict(value: Player | Cube | Pickup) -> dict[str, Any]:
    return asdict(value)


def _invalid_constant(value: str) -> None:
    raise ProtocolError(f"invalid JSON constant {value}")
