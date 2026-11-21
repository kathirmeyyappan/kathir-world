from __future__ import annotations

import dataclasses

from bots.circle_bot import BLOCKED_TICKS, ORBIT_RADIUS, SETTLE_TICKS, Circler, Stall
from common import Controls, Vec3
from common.bodies import load_bodies
from common.controls import TICK_RATE
from common.outline import Outline

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


def test_turns_back_where_the_floor_ends_ahead_and_stands_where_it_ends_both_ways() -> None:
    # A disc of floor 20 m across with the bot on its rim, circling a centre off its side.
    outline = Outline({"parts": [{"kind": "disc", "x": 0, "z": 0, "r": 10}], "insideChecks": []})
    circler = Circler(outline, load_bodies())
    controls = Controls(FakeConnection())  # type: ignore[arg-type]
    me = dataclasses.replace(FakeConnection().welcome.players[0], pos=Vec3(3, 1.7, 9.4))
    # Facing a centre out past the rim (+z), the first way round strafes it toward +x, off the
    # floor; the other way keeps it on.
    center = Vec3(3, 1.7, 9.4 + ORBIT_RADIUS)
    way = circler.way
    assert circler.step(0, me, center, controls)
    assert circler.way == -way
    assert controls.right == -way
    # Facing along a strip of floor narrower than the look ahead, neither way across has floor.
    strip = Outline(
        {"parts": [{"kind": "bridge", "ax": -5, "az": 0, "bx": 5, "bz": 0, "halfWidth": 1}], "insideChecks": []}
    )
    stuck = Circler(strip, load_bodies())
    assert not stuck.step(0, dataclasses.replace(me, pos=Vec3(0, 1.7, 0)), Vec3(ORBIT_RADIUS, 1.7, 0), controls)
    assert controls.right == 0 and controls.forward == 0
