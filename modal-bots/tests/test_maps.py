from __future__ import annotations

import itertools
import math

import pytest
from common import Vec3
from common.map.ground import load_ground
from common.map.solids import OUTSIDE_HEIGHT, load_solids

TOWER = (112.0, 0.0)  # the Tung Tung Tower's centre (ANNEX in packages/shared/src/sim/outline.ts)


def test_the_solids_answer_as_the_sim_does() -> None:
    solids = load_solids()
    assert len(solids.sight_checks) > 0 and len(solids.ground_checks) > 0
    for ax, ay, az, bx, by, bz, clear in solids.sight_checks:
        assert solids.clear(Vec3(ax, ay, az), Vec3(bx, by, bz)) == bool(clear), (ax, ay, az, bx, by, bz)
    for x, z, reach, ground in solids.ground_checks:
        assert solids.ground_at(x, z, reach) == pytest.approx(ground, abs=1e-9), (x, z, reach)


def test_a_walk_from_the_main_disc_climbs_to_every_balcony() -> None:
    ground = load_ground()
    start = ground.node_at(Vec3(0, 0, 0))
    assert start is not None
    for floor in (20, 40, 60):
        balcony = ground.node_at(Vec3(TOWER[0] + 21.5, floor, TOWER[1]))
        assert balcony is not None
        route = ground.path(start, balcony)
        assert route is not None, f"no way to the balcony at {floor} m"
        assert math.isclose(ground.nodes[route[-1]].y, floor, abs_tol=0.05)
        # Up the stair and off it (over the rail, on floors 1 and 2), never higher than a jump.
        assert max(ground.nodes[i].y for i in route) <= floor + 1.5


def test_a_way_takes_only_the_jumps_its_avatar_makes() -> None:
    ground = load_ground()
    gary = ground.jumps_of("gary")
    # A jump the standard body makes and Gary's 0.48 m hop doesn't: his way round never takes it.
    i, j = next((i, j) for i, out in enumerate(ground.jumps) for j in out if j not in gary[i])
    route = ground.path(i, j, "gary")
    assert route != [i, j]
    if route is not None:
        assert all(b in ground.edges[a] or b in gary[a] for a, b in itertools.pairwise(route))


def test_the_ground_stops_where_the_roads_begin_and_the_solids_carry_on() -> None:
    ground, solids = load_ground(), load_solids()
    # Between the main disc and the Krusty Krab: one rectangle of open floor, walked in one line.
    near, far = Vec3(-60, 0, -40), Vec3(-70, 0, 40)
    lawn = ground.node_at(near)
    assert lawn in ground.areas
    assert ground.node_at(far) == lawn
    assert ground.straight(near, far)
    # Out on the Krusty Krab's road, past its grounds, the ground has no spot to find a way from.
    assert ground.node_at(Vec3(-255, 0, 0)) is None
    # The solids still have it all: the road's floor, the flyover's deck where it passes over it,
    # and the drop past its side, 10 m from its middle.
    assert solids.ground_at(-255, 0, 0.5) == 0
    assert solids.ground_at(-232, 0, 13) == pytest.approx(12.73, abs=0.01)
    assert solids.ground_at(-255, 12, 0.5) == OUTSIDE_HEIGHT
