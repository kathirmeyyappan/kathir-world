"""Current authoritative state derived from room messages."""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Any

from .protocol import Kart, Message, Player, Snapshot, Welcome, player, to_dict

# The least and most level a game sets one of its bots to (BOT_LEVELS, the shared package's
# modes/bots.ts).
LEVELS = (1, 5)


class WorldState:
    def __init__(self, welcome: Welcome, requested_room: str | None = None):
        self.requested_room = requested_room or welcome.room
        self._reset(welcome)

    def _reset(self, welcome: Welcome) -> None:
        self.session_room = welcome.room
        self.self_id = welcome.id
        self.tick = welcome.tick
        self.players = {value.id: value for value in welcome.players}
        self.cubes = {value.id: value for value in welcome.cubes}
        self.pickups = {value.id: value for value in welcome.pickups}
        self.karts = {value.id: value for value in welcome.karts}
        # The room's game as it was last told: its mode, where it is, and what its mode keeps of it.
        self.game = welcome.game
        # Every door by its id, and whether it stands open (sim/doors.ts), as the room last said.
        self.doors = dict(welcome.doors)

    @property
    def me(self) -> Player | None:
        return self.players.get(self.self_id)

    @property
    def kart(self) -> Kart | None:
        """The kart this bot is driving, or None on foot."""
        me = self.me
        return None if me is None or me.riding is None else self.karts.get(me.riding)

    @property
    def brought(self) -> dict[str, Any] | None:
        """This bot as the room's game brought it (its ``GameBot``, the shared package's
        modes/bots.ts): what it's set to there. None for a bot no game brought."""
        # A room still running an older server lists its bots without the players they came as:
        # none of them is this one.
        bots = self.game.get("bots") or []
        return next((bot for bot in bots if bot.get("id") == self.self_id), None)

    def rating(self, ratings: tuple[float, float], unrated: float) -> float:
        """How good the room's game asks this bot to be: ``ratings`` are what the least level a
        game sets its bots to and the most come to, the levels between evenly, and ``unrated``
        what a bot no game brought is."""
        brought = self.brought
        if brought is None:
            return unrated
        share = (float(brought["level"]) - LEVELS[0]) / (LEVELS[1] - LEVELS[0])
        return ratings[0] + (ratings[1] - ratings[0]) * share

    def nearest_player(self, *, people_only: bool = False) -> Player | None:
        """The closest living player to this bot in a straight line (someone a floor above isn't
        next to us), leaving out bots when ``people_only``. A ghost is nobody: in the room, and
        not in the world."""
        me = self.me
        if me is None:
            return None
        candidates = (
            p
            for p in self.players.values()
            if p.id != me.id and not p.dead and not p.ghost and not (people_only and p.bot)
        )
        return min(
            candidates,
            key=lambda p: math.dist((p.pos.x, p.pos.y, p.pos.z), (me.pos.x, me.pos.y, me.pos.z)),
            default=None,
        )

    def apply(self, message: Message) -> None:
        if isinstance(message, Snapshot):
            self.tick = message.tick
            self.players = {value.id: value for value in message.players}
            self.cubes = {value.id: value for value in message.cubes}
            self.pickups = {value.id: value for value in message.pickups}
            self.karts = {value.id: value for value in message.karts}
        elif isinstance(message, Welcome):
            self.requested_room = self.requested_room or message.room
            self._reset(message)
        elif message.t == "join":
            joined = player(message.data["p"])
            self.players[joined.id] = joined
        elif message.t == "leave":
            self.players.pop(message.data["id"], None)
        elif message.t == "hit":
            victim = self.players.get(message.data["victim"])
            if victim is not None:
                hearts = message.data["hearts"]
                self.players[victim.id] = replace(
                    victim,
                    hearts=hearts,
                    dead=hearts <= 0,
                )
        elif message.t == "game":
            self.game = message.data["game"]
        elif message.t == "door":
            self.doors[str(message.data["id"])] = bool(message.data["open"])
        elif message.t in ("kill", "fell", "out", "crashed"):
            victim = self.players.get(message.data["victim"])
            if victim is not None:
                self.players[victim.id] = replace(victim, dead=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "requested_room": self.requested_room,
            "session_room": self.session_room,
            "self_id": self.self_id,
            "tick": self.tick,
            "players": [to_dict(value) for value in self.players.values()],
            "cubes": [to_dict(value) for value in self.cubes.values()],
            "pickups": [to_dict(value) for value in self.pickups.values()],
        }
