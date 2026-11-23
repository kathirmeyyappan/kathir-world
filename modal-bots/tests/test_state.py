from __future__ import annotations

import json

from common import Welcome, WorldState
from common.protocol import Message, decode

from tests.helpers import cube, kart, player, welcome


def message(payload: dict[str, object]) -> Message:
    return decode(json.dumps(payload))


def test_reduces_snapshots_and_roster_events() -> None:
    initial = message(welcome())
    assert isinstance(initial, Welcome)
    state = WorldState(initial, "public-code")

    state.apply(message({"t": "join", "p": player("p2", "alice")}))
    assert set(state.players) == {"p1", "p2"}

    state.apply(
        message(
            {
                "t": "snap",
                "tick": 43,
                "players": [{**player("p1"), "riding": "k1"}, player("p2", "alice")],
                "cubes": [cube("notion")],
                "pickups": [],
                "karts": [kart("k1", "p1"), kart("k2")],
            }
        )
    )
    assert state.tick == 43
    assert set(state.cubes) == {"notion"}
    assert state.kart is not None and state.kart.id == "k1"

    assert state.game["mode"] == "freeplay"
    state.apply(message({"t": "game", "game": {"mode": "racing", "phase": "lobby", "bots": []}}))
    assert state.game["mode"] == "racing"
    # A bot no game brought is as good as it says itself; one a game brought, as its level there.
    assert state.rating((0.2, 0.8), 0.5) == 0.5
    bots = [{"key": "bot:0", "level": 5, "id": "p9"}, {"key": "bot:1", "level": 2, "id": "p1"}]
    state.apply(message({"t": "game", "game": {"mode": "racing", "phase": "starting", "bots": bots}}))
    assert abs(state.rating((0.2, 0.8), 0.5) - 0.35) < 1e-9

    assert state.doors == {"front": False}
    state.apply(message({"t": "door", "id": "front", "open": True, "by": "p2"}))
    assert state.doors == {"front": True}

    state.apply(message({"t": "leave", "id": "p2", "name": "alice"}))
    assert set(state.players) == {"p1"}
    assert state.requested_room == "public-code"
    assert state.session_room == "opaque-modal-session"


def test_applies_combat_events_before_next_snapshot() -> None:
    initial = message(welcome())
    assert isinstance(initial, Welcome)
    state = WorldState(initial, "public-code")

    state.apply(
        message(
            {
                "t": "hit",
                "shooter": "p2",
                "victim": "p1",
                "damage": 10,
                "headshot": True,
                "hearts": 0,
            }
        )
    )
    assert state.me is not None
    assert state.me.hearts == 0
    assert state.me.dead

    report = state.to_dict()
    assert report["requested_room"] == "public-code"
    assert report["players"][0]["dead"] is True


def test_nearest_player_is_straight_line_and_can_skip_bots() -> None:
    me, bot, above, person = player("p1"), player("p2", "circle-bot"), player("p3", "up"), player("p4", "far")
    bot |= {"bot": True, "pos": {"x": 2, "y": 1.7, "z": 2}}
    above |= {"pos": {"x": 1, "y": 21.7, "z": 2}}  # right overhead, a floor up
    person |= {"pos": {"x": 9, "y": 1.7, "z": 2}}
    initial = message(welcome() | {"players": [me, bot, above, person]})
    assert isinstance(initial, Welcome)
    state = WorldState(initial)

    assert state.nearest_player() is state.players["p2"]
    assert state.nearest_player(people_only=True) is state.players["p4"]
