from __future__ import annotations

import random
from dataclasses import astuple

from bots.fighter_bot import sides_of
from common import Vec3
from common.fighting import ARMS, BEST, WORST, Aim, believed, skill, temper


def test_a_fighter_is_as_good_as_its_rating_and_its_own_kind_every_time() -> None:
    # Skill goes from the worst there is to the best with its rating, every part of it.
    assert skill(-1) == skill(0) == WORST and skill(1) == skill(2) == BEST
    ratings = [skill(r / 10) for r in range(11)]
    for i, (worst, best) in enumerate(zip(astuple(WORST), astuple(BEST), strict=True)):
        values = [astuple(s)[i] for s in ratings]
        assert values == sorted(values, reverse=worst > best), "each part of it moves one way with the rating"
    # A fighter's temper is its dice's, the same every time, and over enough of them every weapon
    # is someone's favourite and they aren't all as bold.
    assert temper(random.Random("room/bot 1")) == temper(random.Random("room/bot 1"))
    tempers = [temper(random.Random(f"room/bot {n}")) for n in range(60)]
    assert {t.arms[0] for t in tempers} == set(ARMS)
    assert all(arm in ARMS for t in tempers for arm in t.arms)
    assert min(t.nerve for t in tempers) < 0.3 and max(t.nerve for t in tempers) > 0.8


def test_its_aim_holds_someone_stood_still_and_loses_whoever_turns() -> None:
    eye, mark = Vec3(0, 1.7, 0), Vec3(0, 1.2, 12)

    def off_the_mark(of: float, seed: int) -> float:
        """How far off the mark an aim of that rating is, on average, once it has come round."""
        aim = Aim(skill(of), random.Random(seed), yaw=1.5)
        offs = []
        for tick in range(90):
            aim.swing(eye, mark)
            if tick >= 30:
                offs.append(aim.off(eye, mark))
        return sum(offs) / len(offs)

    best = sum(off_the_mark(1, seed) for seed in range(5)) / 5
    worst = sum(off_the_mark(0, seed) for seed in range(5)) / 5
    assert best < 0.02 and worst > 0.05, "on a body 12 m off for the best, and wide of it for the worst"

    # Someone walking steadily is believed where they are by whoever leads them all the way, and
    # a third of a second behind by whoever doesn't; someone who has just turned is believed
    # where they'd have been.
    steady = [{"p": Vec3(0.25 * t, 1.7, 10)} for t in range(16)]
    assert believed(steady, "p", lag=0.3, lead=1).x == steady[-1]["p"].x  # type: ignore[union-attr]
    assert believed(steady, "p", lag=0.3, lead=0).x == steady[-10]["p"].x  # type: ignore[union-attr]
    turned = [*steady[:-4], *({"p": Vec3(steady[-5]["p"].x - 0.25 * t, 1.7, 10)} for t in range(1, 5))]
    assert believed(turned, "p", lag=0.3, lead=1).x > turned[-1]["p"].x + 1  # type: ignore[union-attr]


def test_a_game_gives_it_its_side() -> None:
    # A team lists a person by their id and one of the game's bots by its key, come or not.
    bots = [{"key": "bot:0", "level": 1, "id": "p2"}, {"key": "bot:1", "level": 5, "id": None}]
    lobby = {"mode": "shootout", "phase": "lobby", "teams": [["p1", "bot:1"], ["bot:0", "p3"]], "bots": bots}
    assert sides_of(lobby) == {} == sides_of({"mode": "freeplay", "phase": None, "bots": []})
    assert sides_of({**lobby, "phase": "results"}) == {}, "its sides are the game's while it's played"
    assert sides_of({**lobby, "phase": "playing"}) == {"p1": 0, "p2": 1, "p3": 1}
