"""Race: whenever the room's game is a race and this bot is sat in a kart on its grid, drive it
down the track to the line, as well as the game rates it (``common.driving``): from keeping to the
middle of the road, short of flat out, to the whole road for its line, a drift through every bend
and a trick off every flight.

No two racers of one rating race alike. Each has a talent of its own, the same all through a
lobby, that sets it a little above or below its rating, so one of them is the one to beat; a day
it's having, from one race to the next; a mood that warms and cools through a race, and with it
its pace and how many of its chances it takes; a line a little its own; and its own time off the
lights. All of it comes from dice seeded by where it is and what it's called, so a race could be
run again as it was.

The room seats its racers and holds them on the grid, lets them go, sets a kart that leaves the
track back on it, and takes them out of their karts once they're over the line, so the bot only
drives: a frame for every snapshot, which keeps its keys a tick behind what it sees. A track's line
is worked out off the event loop, once for every bot in the process that takes the same one.
"""

from __future__ import annotations

import asyncio
import math
import random
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, replace
from functools import lru_cache
from typing import Any

from common import (
    Controls,
    RoomConnectionError,
    Snapshot,
    Vec3,
    WorldState,
    connect,
    load_karts,
    load_roads,
    log_message,
)
from common.controls import TICK_RATE
from common.deployment import validate_duration
from common.driving import Driver, Keys, skill
from common.racing_line import Line, Shape, racing_line

MOST_LATE = 10  # ticks: the most a driver allows for between what it sees and its keys being taken
UNRATED = 0.5  # the rating of a racer its game gives none
# Of the whole range of skill: how far a racer's talent sets it from its rating, and how far the
# day it's having sets it from that.
TALENT = 0.1
DAY = 0.05
NARROWER = (0, 0.5, 1)  # metres its line may keep nearer the middle than its skill's
REACTION = 0.4  # seconds from the lights to the gas, at the most, for the least of racers
# A mood is two waves, a long one and a short one over it: the seconds each takes, least and most.
LONG = (14, 26)
SHORT = (5, 9)

_building = threading.Lock()


@lru_cache(maxsize=64)
def _line(track: int, shape: Shape, kart: str) -> Line:
    return racing_line(load_roads().track(track), shape, load_karts().of(kart))


def line_of(track: int, shape: Shape, kart: str) -> Line:
    """The line of ``shape`` along race track ``track`` for a kart of that kind, worked out once
    however many ask for it at once: the bots of a race all want theirs as it's set up."""
    with _building:
        return _line(track, shape, kart)


@dataclass(frozen=True, slots=True)
class Race:
    """A race as one racer drives it: its driver, the tick it gets on the gas, and its mood's two
    waves, each the seconds it takes and where in it the race begins."""

    driver: Driver
    off: int
    waves: tuple[tuple[float, float], tuple[float, float]]

    def mood(self, tick: int) -> float:
        """Its mood at ``tick``, from -1 (cold) to 1 (hot)."""
        t = (tick - self.off) / TICK_RATE
        (long, a), (short, b) = self.waves
        return 0.6 * math.sin(2 * math.pi * (t / long + a)) + 0.4 * math.sin(2 * math.pi * (t / short + b))


def race_of(seed: str, track: int, go: int, kart: str, rating: float) -> Race:
    """The race the racer seeded ``seed`` (where it is and what it's called) drives on race track
    ``track``, let go at tick ``go``, rated ``rating`` (0 the least there is to 1 the most)."""
    dice = random.Random(f"{seed}/{track}/{go}")
    rating += random.Random(seed).uniform(-TALENT, TALENT) + dice.uniform(-DAY, DAY)
    skilled = skill(rating)
    skilled = replace(skilled, shape=replace(skilled.shape, width=skilled.shape.width - dice.choice(NARROWER)))
    waves = ((dice.uniform(*LONG), dice.random()), (dice.uniform(*SHORT), dice.random()))
    reaction = dice.uniform(0, REACTION) * (1.2 - max(0.0, min(1.0, rating)))
    driver = Driver(line_of(track, skilled.shape, kart), skilled, load_karts().of(kart), dice)
    return Race(driver, go + round(reaction * TICK_RATE), waves)


class Racer:
    """What this bot holds each tick of the room's game: nothing unless it's sat in a kart in a
    race, and then what its driver says."""

    def __init__(self, seed: str):
        self.races = 0  # how many it has driven in
        self._seed = seed
        self._racing: tuple[int, int] | None = None  # the race it's set up for: its track, and the tick it's let go at
        self._race: asyncio.Task[Race] | None = None

    def keys(self, state: WorldState, sent: int) -> Keys:
        """The keys for the frame after number ``sent``."""
        me, kart, race = state.me, state.kart, state.game.get("round")
        if me is None or kart is None or not isinstance(race, Mapping) or race["over"] is not None:
            return Keys()
        if me.id in race["finished"] or me.id in race["out"]:
            return Keys()
        if self._racing != (race["track"], race["go"]) or self._race is None:
            self._racing = (race["track"], race["go"])
            self.races += 1
            rated = next((r.get("rating") for r in state.game["racers"] if r["id"] == me.id), None)
            rating = UNRATED if rated is None else float(rated)
            self._race = asyncio.create_task(
                asyncio.to_thread(race_of, self._seed, race["track"], race["go"], kart.kart, rating)
            )
        if not self._race.done():
            return Keys()
        mine = self._race.result()
        late = max(0, min(MOST_LATE, sent - me.last_seq))
        if state.tick + late < mine.off:
            return Keys()
        return mine.driver.keys(kart, late, mine.mood(state.tick))


async def run_racer_bot(
    room: str,
    name: str = "racer-bot",
    seconds: float = 300,
    *,
    lobby_url: str | None = None,
    direct_ws_url: str | None = None,
    spawn: Vec3 | None = None,
    avatar: str | None = None,
) -> dict[str, Any]:
    validate_duration(seconds)
    connect_started = time.monotonic()
    connection = await connect(lobby_url, room, name, direct_url=direct_ws_url, spawn=spawn, avatar=avatar)
    connected_at = time.monotonic()
    state = WorldState(connection.welcome, connection.room)
    controls = Controls(connection)
    racer = Racer(f"{room}/{name}")
    completed = False
    log_message(name, "joined room", player_id=connection.id, room=connection.room)

    try:
        async with asyncio.timeout(seconds):
            while True:
                message = await connection.receive()
                state.apply(message)
                if not isinstance(message, Snapshot):
                    continue
                keys = racer.keys(state, controls.seq)
                controls.drive(gas=keys.gas, steer=keys.steer, drift=keys.drift)
                await controls.send_input()
    except TimeoutError:
        completed = True
    except RoomConnectionError:
        pass  # the room let it go: its game is over
    finally:
        if connection.close_code is None:
            await connection.close(reason=f"{name} complete")

    observed_seconds = time.monotonic() - connected_at
    log_message(name, "finished", completed=completed, races=racer.races, observed_seconds=round(observed_seconds, 3))
    return {
        "bot": name,
        "completed": completed,
        "races": racer.races,
        "observed_seconds": round(observed_seconds, 6),
        "connection_seconds": round(connected_at - connect_started, 6),
        "last_tick": state.tick,
        "final_state": state.to_dict(),
    }
