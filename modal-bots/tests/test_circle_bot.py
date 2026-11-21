from __future__ import annotations

import dataclasses

from bots.circle_bot import BLOCKED_TICKS, ORBIT_RADIUS, SETTLE_TICKS, Circler, Stall
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


def test_turns_back_where_the_ground_drops_away_ahead() -> None:
    circler = Circler(load_solids(), load_bodies())
    controls = Controls(FakeConnection())  # type: ignore[arg-type]
    # On the Krusty Krab's road, a metre in from its side at z -10, circling a centre along it
    # (+x): strafing right heads for -z, over the side, so it goes round the other way.
    me = dataclasses.replace(FakeConnection().welcome.players[0], pos=Vec3(-255, 1.7, -9))
    way = circler.way
    assert circler.step(0, me, Vec3(-255 + ORBIT_RADIUS, 1.7, -9), controls)
    assert circler.way == -way and controls.right == -way


def test_circling_looks_for_ground_ahead_out_on_a_road() -> None:
    circler = Circler(load_solids(), load_bodies())
    controls = Controls(FakeConnection())  # type: ignore[arg-type]
    controls.look(0)  # facing +z
    # On the Krusty Krab's road, a metre in from its side at z 10, far out past its grounds.
    me = dataclasses.replace(FakeConnection().welcome.players[0], pos=Vec3(-255, 1.7, 9))
    controls.move(right=1)
    assert not circler._edge_ahead(me, controls), "along the road"
    controls.move(forward=1)
    assert circler._edge_ahead(me, controls), "over its side"
