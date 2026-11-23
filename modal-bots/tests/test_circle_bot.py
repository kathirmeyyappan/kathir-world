from __future__ import annotations

import dataclasses

from bots.circle_bot import BLOCKED_TICKS, MIN_RADIUS, ORBIT_RADIUS, SETTLE_TICKS, Circler, Stall
from common import Controls, Vec3
from common.controls import TICK_RATE
from common.map.bodies import load_bodies
from common.map.solids import load_solids

from tests.test_controls import FakeConnection

SPEED = 3.5  # m/s at full input: a slow walker's, under half the standard body's


def test_stall_fires_once_per_settle_when_the_bot_stops_making_headway() -> None:
    controls = Controls(FakeConnection())  # type: ignore[arg-type]
    controls.look(0)  # facing +z, so moving right heads for +x
    controls.move(right=1)
    stall = Stall()
    x = 0.0
    stalls: list[int] = []
    for tick in range(120):
        if tick < 60:
            x += SPEED / TICK_RATE  # walking freely, then pinned against the edge from tick 60
        if stall.blocked(tick, Vec3(x, 1.7, 0), controls, SPEED):
            stalls.append(tick)

    assert stalls[0] - 60 <= 2 * BLOCKED_TICKS
    # Still pinned, it waits out the round trip before judging again.
    assert stalls[1] - stalls[0] >= SETTLE_TICKS


def test_keeps_off_the_road_side_tightening_its_ring_turning_back_or_sliding_along_it() -> None:
    # On the Krusty Krab's road, half a metre in from its side at z -10, far out past its grounds.
    me = dataclasses.replace(FakeConnection().welcome.players[0], pos=Vec3(-255, 1.7, -9.5))
    controls = Controls(FakeConnection())  # type: ignore[arg-type]

    # Round someone in the road's middle: the full ring runs over the side, a tighter one along it.
    circler = Circler(load_solids(), load_bodies())
    way = circler.way
    assert not circler.step(0, me, Vec3(-255, 1.7, 0), controls)
    assert circler.way == way and MIN_RADIUS < circler.radius < ORBIT_RADIUS

    # Round someone at the road's side: every ring this way runs over it, so it goes the other way.
    circler = Circler(load_solids(), load_bodies())
    assert circler.step(0, me, Vec3(-255 + ORBIT_RADIUS, 1.7, -9.5), controls)
    assert circler.way == -way and controls.right == -way

    # Toward someone far off across the drop: no ring has ground either way, so it slides along
    # the road's side rather than standing or stepping off it.
    circler = Circler(load_solids(), load_bodies())
    assert not circler.step(0, me, Vec3(-255, 1.7, -60), controls)
    assert abs(controls.forward) < 0.5 < abs(controls.right)
