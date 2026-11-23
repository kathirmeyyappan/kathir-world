from __future__ import annotations

import itertools
import math
import random

from bots.racer_bot import race_of
from common import Kart, Vec3
from common.driving import Driver, Keys, skill
from common.map.karts import load_karts
from common.map.roads import load_roads
from common.racing_line import racing_line

ROAD = 10  # metres from a road's middle to its edge (ROAD_WIDTH in packages/shared/src/sim/outline.ts)


def _kart(pos: Vec3, yaw: float, speed: float, rescued: bool = False) -> Kart:
    vel = Vec3(math.sin(yaw) * speed, 0, math.cos(yaw) * speed)
    return Kart("k1", "standard", "p1", pos, vel, yaw, True, False, None, False, 0, rescued, 5)


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


def _off(x: float, z: float, a: Vec3, b: Vec3) -> float:
    ux, uz = b.x - a.x, b.z - a.z
    along = max(0.0, min(1.0, ((x - a.x) * ux + (z - a.z) * uz) / (ux * ux + uz * uz)))
    return math.hypot(x - a.x - ux * along, z - a.z - uz * along)
