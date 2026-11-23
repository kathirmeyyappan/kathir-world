from __future__ import annotations

import copy
import itertools
import math
import random

from bots.racer_bot import race_of
from common import Kart, Vec3
from common.controls import TICK_SECONDS
from common.driving import Driver, Keys, skill
from common.map.karts import load_karts
from common.map.roads import load_roads
from common.protocol import Drift
from common.racing_line import Line, racing_line

ROAD = 10  # metres from a road's middle to its edge (ROAD_WIDTH in packages/shared/src/sim/outline.ts)


def _kart(pos: Vec3, yaw: float, speed: float, rescued: bool = False, drift: Drift | None = None) -> Kart:
    vel = Vec3(math.sin(yaw) * speed, 0, math.cos(yaw) * speed)
    return Kart("k1", "standard", "p1", pos, vel, yaw, True, False, drift, False, 0, rescued, 5)


def test_a_line_keeps_to_its_road_and_a_driver_follows_it() -> None:
    roads, car = load_roads(), load_karts().of("standard")
    track = roads.tracks // 2
    middle = roads.track(track)
    for skilled in (skill(0), skill(1)):
        line = racing_line(middle, skilled.shape, car)
        # On the road all the way, between its points too, but where it cuts a corner two roads
        # meet at: there, off it for no more than a second and a half's driving, of the two a race
        # allows. And shorter than the road's middle.
        ways = list(zip(line.x, line.y, line.z, strict=True))
        halfway = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2) for a, b in itertools.pairwise(ways)]
        off = [
            min(_off(x, z, a, b) for a, b in itertools.pairwise(middle.points) if abs((a.y + b.y) / 2 - y) < 4)
            for x, y, z in itertools.chain.from_iterable(zip(ways, halfway, strict=False))
        ]
        # A point or a halfway every metre and a half of the line.
        longest = 1.5 * max(
            (len(list(run)) for out, run in itertools.groupby(off, lambda d: d > ROAD - 0.5) if out), default=0
        )
        assert longest <= (1.5 * car.speed if skilled.shape.cut else 0)
        assert line.s[-1] < sum(math.dist((a.x, a.z), (b.x, b.z)) for a, b in itertools.pairwise(middle.points))

        # On its line and along it: the gas, and the wheel all but straight.
        at = len(line.x) // 3
        yaw = math.atan2(line.x[at + 1] - line.x[at], line.z[at + 1] - line.z[at])
        on = Vec3(line.x[at], line.y[at], line.z[at])
        driver = Driver(line, skilled, car, random.Random(1))
        keys = driver.keys(_kart(on, yaw, 15), 0)
        assert keys.gas == 1 and abs(keys.steer) < 0.5
        # Off to its right, it steers left for it; and in Lakitu's hands it holds nothing.
        right = Vec3(on.x + math.cos(yaw) * 4, on.y, on.z - math.sin(yaw) * 4)
        assert driver.keys(_kart(right, yaw, 15), 0).steer < keys.steer - 0.2
        assert driver.keys(_kart(right, yaw, 0, rescued=True), 0) == Keys()

    # Two racers of one rating in one lobby aren't the same driver, and each is itself every time.
    one, other = (race_of(f"lobby/{name}", track, 150, "standard", 0.5) for name in ("bot 1", "bot 2"))
    assert one.driver.skill != other.driver.skill
    assert one.driver.skill == race_of("lobby/bot 1", track, 150, "standard", 0.5).driver.skill
    # Chaining drifts goes by the rating asked for alone (a race's top level, and the one under
    # it): every racer rated to does as much of it, whatever its form, and none rated under does any.
    top, under = (
        {race_of(f"lobby/bot {n}", track, 150, "standard", rating).driver.skill.chains for n in (1, 2, 3)}
        for rating in (0.88, 0.685)
    )
    assert len(top) == 1 and min(top) > 0 and under == {0}


def test_the_best_chain_drifts_down_a_straight() -> None:
    car = load_karts().of("standard")
    # A straight road with nothing on it, the line down its middle.
    n = 100
    along = tuple(3.0 * i for i in range(n))
    line = Line(
        x=(0.0,) * n,
        y=(0.0,) * n,
        z=along,
        s=along,
        k=(0.0,) * n,
        gap=(False,) * n,
        lift=(math.inf,) * n,
        left=(ROAD,) * n,
        right=(ROAD,) * n,
    )
    at = Vec3(0, 0, 60)
    # A driver short of the best leaves the drift key be down it.
    assert Driver(line, skill(0.7), car, random.Random(1)).keys(_kart(at, 0, 15), 0) == Keys(gas=1)

    # Nor does the best with a kart close ahead of it, though one behind is no matter.
    best = Driver(line, skill(1), car, random.Random(1))
    assert best.keys(_kart(at, 0, 15), 0, 0, (Vec3(1, 0, 70),)) == Keys(gas=1)
    # It turns its nose out of a drift's way first, and hops into the drift once that's done.
    yaw, keys = 0.0, best.keys(_kart(at, 0, 15), 0, 0, (Vec3(1, 0, 50),))
    turned = keys.steer
    assert not keys.drift and turned != 0
    for _ in range(30):
        if keys.drift:
            break
        yaw += keys.steer * 15 / car.turn * TICK_SECONDS
        keys = best.keys(_kart(at, yaw, 15), 0)
    way = -1 if turned > 0 else 1
    assert keys.drift and keys.steer == way and yaw * way < 0
    # In the drift it holds the wheel out of it, and lets go at the first spark, or of a drift
    # that turns out to be the other way.
    assert best.keys(_kart(at, 0, 15, drift=Drift(way, 0.5)), 0) == Keys(gas=1, steer=-way, drift=True)
    assert not copy.deepcopy(best).keys(_kart(at, 0, 15, drift=Drift(-way, 0.6)), 0).drift
    assert not best.keys(_kart(at, 0, 15, drift=Drift(way, car.sparks[0] + 0.1)), 0).drift


def _off(x: float, z: float, a: Vec3, b: Vec3) -> float:
    ux, uz = b.x - a.x, b.z - a.z
    along = max(0.0, min(1.0, ((x - a.x) * ux + (z - a.z) * uz) / (ux * ux + uz * uz)))
    return math.hypot(x - a.x - ux * along, z - a.z - uz * along)
