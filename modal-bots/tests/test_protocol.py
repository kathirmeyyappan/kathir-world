from __future__ import annotations

import json

import pytest
from common.protocol import Event, ProtocolError, Snapshot, Welcome, decode, to_dict

from tests.helpers import cube, kart, player, welcome


def test_decodes_world_messages() -> None:
    joined = decode(json.dumps(welcome()))
    assert isinstance(joined, Welcome)
    assert joined.id == "p1"
    assert joined.room == "opaque-modal-session"
    assert joined.players[0].pos.y == 1.7
    assert joined.cubes[0].id == "aws"

    snap = {"t": "snap", "tick": 43, "players": [player()], "cubes": [cube()], "pickups": [], "karts": [kart()]}
    snapshot = decode(json.dumps(snap))
    assert isinstance(snapshot, Snapshot)
    assert snapshot.tick == 43
    assert to_dict(snapshot.players[0])["last_seq"] == 0
    drifting = snapshot.karts[0]
    assert (drifting.kart, drifting.vel.z, drifting.hopping, drifting.rescued) == ("standard", 4, False, False)
    assert drifting.drift is not None and (drifting.drift.way, drifting.drift.t) == (-1, 1.2)


@pytest.mark.parametrize("kind", ["join", "leave", "chat", "hit", "kill", "future"])
def test_non_snapshot_messages_are_events(kind: str) -> None:
    message = decode(json.dumps({"t": kind, "value": 1}))
    assert isinstance(message, Event)
    assert message.t == kind
    assert message.data["value"] == 1


@pytest.mark.parametrize(
    "payload",
    [
        "not json",
        "[]",
        "{}",
        '{"t":"snap","tick":1,"players":[]}',
        '{"t":"pong","at":NaN}',
    ],
)
def test_rejects_malformed_messages(payload: str) -> None:
    with pytest.raises(ProtocolError):
        decode(payload)


def test_ignores_fields_added_later() -> None:
    """A new server field on a player, item, cube or position must not break old bots."""
    data = welcome()
    data["players"][0]["armour"] = 3
    data["players"][0]["pos"]["w"] = 1
    data["players"][0]["item"] = {"id": "gun", "locked": False, "fuel": None, "ammo": 6}
    data["cubes"][0]["spin"] = 2
    joined = decode(json.dumps(data))
    assert isinstance(joined, Welcome)
    assert joined.players[0].item is not None and joined.players[0].item.id == "gun"
    assert joined.players[0].kills == 0
    assert joined.cubes[0].id == "aws"
