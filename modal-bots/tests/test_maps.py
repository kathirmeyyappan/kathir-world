from __future__ import annotations

import itertools
import math

import pytest
from common import Vec3
from common.map.ground import load_ground
from common.map.roads import load_roads
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


def test_the_roads_reach_every_end_and_only_a_kart_crosses_a_gap() -> None:
    roads = load_roads()
    crab = roads.nearest(Vec3(-132, 0, 0))  # where the Krusty Krab's road leaves its grounds
    end = roads.nearest(Vec3(-860, 0, 0))  # the world's end
    lookout = roads.nearest(Vec3(-560, 0, -470))  # the south lookout, past a gap
    way = roads.path(crab, end)
    assert way is not None, "on foot"
    spots = [roads.nodes[i] for i in way]
    hops = [math.hypot(b.x - a.x, b.z - a.z) for a, b in itertools.pairwise(spots)]
    assert max(hops) <= 20.5, "a node every 20 m at the most"
    assert roads.path(crab, lookout) is None, "no way on foot"
    assert roads.path(crab, lookout, gaps=True) is not None, "but one in a kart"


def test_a_race_track_is_read_as_the_sim_lays_it() -> None:
    roads = load_roads()
    assert len(roads.checks) > 0
    middles = {track: roads.track(track) for track, _ in roads.checks}
    for track, spot in roads.checks:
        points = middles[track].points
        # On a stretch of the middle at its height: a bend's is the line between two of its nodes.
        off = min(
            _off(spot, a, b) for a, b in itertools.pairwise(points) if min(a.y, b.y) - 1 <= spot.y <= max(a.y, b.y) + 1
        )
        assert off < 0.5, (track, spot)
    middle = roads.track(roads.tracks - 1)
    assert len(middle.gap) == len(middle.pad) == len(middle.points) - 1
    assert any(any(roads.track(track).gap) for track in range(0, roads.tracks, 50)), "some tracks jump a gap"
    assert any(middle.pad), "and a track has boost pads along it"


def _off(p: Vec3, a: Vec3, b: Vec3) -> float:
    """Metres across the floor from ``p`` to the line from ``a`` to ``b``, ends included."""
    ux, uz = b.x - a.x, b.z - a.z
    along = max(0.0, min(1.0, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz)))
    return math.hypot(p.x - a.x - ux * along, p.z - a.z - uz * along)
