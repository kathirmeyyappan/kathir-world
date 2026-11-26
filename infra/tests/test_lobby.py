"""The lobby's /healthz is the launcher's warm-up ping: it answers at once and boots a Room behind it."""

import asyncio
import time
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from infra.config import LAUNCHER_URL
from infra.lobby import build_api


def test_healthz_warms_a_room_without_waiting_for_it() -> None:
    started = asyncio.Event()
    release = asyncio.Event()

    async def warm() -> None:
        started.set()
        await release.wait()

    async def run() -> None:
        api = build_api(warm=warm)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api), base_url="http://lobby") as client:
            res = await client.get("/healthz")
        assert res.status_code == 200 and res.json() == {"ok": True}
        await asyncio.sleep(0)
        assert started.is_set(), "the warm-up runs in the background"
        assert not release.is_set(), "and the response never waited on it"
        release.set()

    asyncio.run(run())


def test_join_starts_a_room_only_when_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    """A person creating a room with no live session gets a fresh one; a bot, or a person joining it,
    gets turned away, and a create on a running room is too. The global room is there to join whether
    or not it's running, and never to create. A person goes back where they came from. A room is in
    its creator's game mode, which every join is handed, and the global room in none."""
    from infra import lobby

    started: list[str] = []

    class Aio:
        def __init__(self, value: str) -> None:
            self.value = value

        async def aio(self, *a: Any, **k: Any) -> str:
            return self.value

    class Server:
        get_url = Aio("https://room.test")

    sessions: dict[str, dict[str, str]] = {"taken": {"session_id": "sd-0", "token": "old"}}

    async def live_session(room_id: str, room_url: str) -> dict[str, str] | None:
        return sessions.get(room_id)

    async def start_session(room_id: str, game: str, public: str) -> dict[str, str]:
        started.append(room_id)
        sessions[room_id] = {"session_id": "sd-1", "token": "tok", "game": game, "public": public}
        return sessions[room_id]

    monkeypatch.setattr(lobby, "room_server", lambda: Server())
    monkeypatch.setattr(lobby, "live_session", live_session)
    monkeypatch.setattr(lobby, "start_session", start_session)
    monkeypatch.setattr(lobby, "lobby", type("Lobby", (), {"get_web_url": Aio("https://lobby.test")})())

    async def run() -> None:
        api = lobby.build_api(warm=lambda: asyncio.sleep(0))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api), base_url="http://lobby") as client:
            bot = await client.get("/join/late-night", params={"name": "circle-bot", "bot": "1"})
            assert bot.status_code == 409 and bot.json() == {"detail": "no one here"}
            assert started == []
            room_host = {"referer": "https://room.test/"}
            joined = await client.get("/join/late-night", params={"mode": "join"}, headers=room_host)
            assert joined.headers["location"].startswith("https://room.test/?error=room+late-night+doesn")
            # An invite opened from someone else's page goes back to the launcher, not to that page.
            elsewhere = {"referer": "https://chat.example/"}
            created = await client.get("/join/taken", params={"mode": "create"}, headers=elsewhere)
            assert (
                created.headers["location"] == f"{LAUNCHER_URL}/?error=room+taken+already+exists&tab=create&code=taken"
            )
            assert started == []
            # One opened from an app sends no referer, and is still told home is the launcher.
            person = await client.get("/join/late-night", params={"name": "kathir", "mode": "create"})
            assert person.status_code == 302 and "modal_session_token=tok" in person.headers["location"]
            assert parse_qs(urlparse(person.headers["location"]).query)["home"] == [LAUNCHER_URL]
            assert started == ["late-night"]
            taken = await client.get("/join/global", params={"mode": "create"}, headers=room_host)
            assert taken.headers["location"].startswith("https://room.test/?error=room+global+already+exists")
            everyone = await client.get("/join/global", params={"mode": "join", "game": "racing"})
            assert "modal_session_token=tok" in everyone.headers["location"]
            assert "game" not in parse_qs(urlparse(everyone.headers["location"]).query)
            assert started == ["late-night", "global"]
            made = await client.get("/join/derby", params={"mode": "create", "game": "racing"})
            joined = await client.get("/join/derby", params={"mode": "join", "game": "shootout"})
            for seated in (made, joined):
                assert parse_qs(urlparse(seated.headers["location"]).query)["game"] == ["racing"]
            # Only the join that started the room is told it made it.
            assert "made=1" in made.headers["location"] and "made" not in joined.headers["location"]
            # A room is public if its creator said so, which every join is handed; global never is.
            await client.get("/join/open", params={"mode": "create", "public": "1"})
            joined = await client.get("/join/open", params={"mode": "join"})
            assert parse_qs(urlparse(joined.headers["location"]).query)["public"] == ["1"]
            assert not sessions["derby"]["public"] and not sessions["global"]["public"]

    asyncio.run(run())


def test_rooms_lists_the_public_rooms_running_and_forgets_the_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only public rooms' servers are asked. One that says nothing is forgotten once it has had time
    to boot, so it's never asked again, and a new one is left to."""
    from infra import lobby

    kept = {
        "open": {"token": "a", "public": "1", "started": "0"},
        "closed": {"token": "b", "public": "1", "started": "0"},
        "booting": {"token": "c", "public": "1", "started": str(time.time())},
        "secret": {"token": "d", "public": "", "started": "0"},
    }
    asked: list[str] = []

    class Rooms:
        class items:
            @staticmethod
            async def aio() -> AsyncIterator[tuple[str, dict[str, str]]]:
                for item in list(kept.items()):
                    yield item

        class pop:
            @staticmethod
            async def aio(room_id: str, default: None) -> None:
                kept.pop(room_id, default)

    async def hosted_rooms(room_url: str, token: str) -> list[Any]:
        asked.append(token)
        return [{"room": "open", "game": "racing", "people": 2, "bots": 1}] if token == "a" else []

    async def get_url() -> str:
        return "https://room.test"

    monkeypatch.setattr(lobby, "rooms", Rooms)
    monkeypatch.setattr(lobby, "hosted_rooms", hosted_rooms)
    monkeypatch.setattr(lobby, "room_server", lambda: type("S", (), {"get_url": type("U", (), {"aio": get_url})})())

    async def run() -> None:
        api = lobby.build_api(warm=lambda: asyncio.sleep(0))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api), base_url="http://lobby") as client:
            first = await client.get("/rooms", headers={"origin": LAUNCHER_URL})
            again = await client.get("/rooms")
        assert first.json() == again.json() == [{"room": "open", "game": "racing", "people": 2, "bots": 1}]
        assert first.headers["access-control-allow-origin"] == "*"
        assert sorted(asked) == ["a", "b", "c"], "asked once, the second answer from the first"
        assert sorted(kept) == ["booting", "open", "secret"]

    asyncio.run(run())
