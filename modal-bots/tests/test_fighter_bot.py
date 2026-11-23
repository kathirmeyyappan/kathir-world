from __future__ import annotations

import random
from dataclasses import astuple

from bots.fighter_bot import sides_of
from common import Vec3, driving, load_ground, load_karts, load_roads, trip
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
    # Each weapon suits its own range and target: a bullet not from right on top of someone, a
    # rifle from further still, nothing past its reach, and ice only someone who isn't chilled.
    gun, rifle, flames, ice = (ARMS[arm] for arm in ("gun", "sniper", "flamethrower", "ice-blower"))
    assert gun.suits(10, False) and not gun.suits(2, False) and not gun.suits(25, False)
    assert rifle.suits(60, False) and not rifle.suits(10, False)
    assert flames.suits(2, False) and not flames.suits(25, False)
    assert ice.suits(8, False) and not ice.suits(8, True)
    assert gun.suits(15, False) and not gun.suits(15, False, 1.4), "nor with room to spare"


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


def test_a_long_way_along_the_roads_is_one_to_drive() -> None:
    maps, driver = (load_roads(), load_ground(), load_karts()), driving.skill(0.5)
    middle, keep, west, crossroads = Vec3(0, 0, 0), Vec3(-57, 0, -70), Vec3(-700, 0, 5), Vec3(-372, 0, 10)
    # From the buildings' floor to an island: boarded past the walked floor, where its road is
    # clear of the building it ends under, and driven to the island.
    out = trip.plan(*maps, middle, west, driver)
    assert out is not None and maps[1].node_at(out.board) is None
    assert out.end.x < -690 and 500 < out.line.s[-1] < 800
    assert abs(out.heading + 1.5708) < 0.2, "facing down the road it boards on"
    # Back from one, it boards where it stands; between two spots on the walked floor, or to
    # somewhere near, it walks.
    back = trip.plan(*maps, crossroads, keep, driver)
    assert back is not None and abs(back.board.x - crossroads.x) < 10
    assert trip.plan(*maps, Vec3(100, 0, 0), keep, driver) is None
    assert trip.plan(*maps, crossroads, Vec3(-300, 0, 0), driver) is None
