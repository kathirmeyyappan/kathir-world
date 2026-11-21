from __future__ import annotations

import itertools
import math

from common import Vec3
from common.world import load_world_map

TOWER = (112.0, 0.0)  # the Tung Tung Tower's centre (ANNEX in packages/shared/src/sim/outline.ts)


def test_line_of_sight_matches_the_sim() -> None:
    world = load_world_map()
    assert len(world.sight_checks) > 0
    for ax, ay, az, bx, by, bz, clear in world.sight_checks:
        assert world.clear(Vec3(ax, ay, az), Vec3(bx, by, bz)) == bool(clear), (ax, ay, az, bx, by, bz)


def test_a_walk_from_the_main_disc_climbs_to_every_balcony() -> None:
    world = load_world_map()
    start = world.node_at(Vec3(0, 0, 0))
    assert start is not None
    for floor in (20, 40, 60):
        balcony = world.node_at(Vec3(TOWER[0] + 21.5, floor, TOWER[1]))
        assert balcony is not None
        route = world.path(start, balcony)
        assert route is not None, f"no way to the balcony at {floor} m"
        assert math.isclose(world.nodes[route[-1]].y, floor, abs_tol=0.05)
        # Up the stair and off it (over the rail, on floors 1 and 2), never higher than a jump.
        assert max(world.nodes[i].y for i in route) <= floor + 1.5


def test_a_way_takes_only_the_jumps_its_avatar_makes() -> None:
    world = load_world_map()
    gary = world.jumps_of("gary")
    # A jump the standard body makes and Gary's 0.48 m hop doesn't: his way round never takes it.
    i, j = next((i, j) for i, out in enumerate(world.jumps) for j in out if j not in gary[i])
    route = world.path(i, j, "gary")
    assert route != [i, j]
    if route is not None:
        assert all(b in world.edges[a] or b in gary[a] for a, b in itertools.pairwise(route))


def test_the_road_is_open_floor_walked_in_one_line() -> None:
    world = load_world_map()
    # Behind the Krusty Krab, from where the flyover crosses over its road to the plateau at its
    # end: one rectangle of open floor.
    near, far = Vec3(-255, 0, 0), Vec3(-320, 0, 0)
    road = world.node_at(near)
    assert road in world.areas
    assert world.node_at(far) == road
    assert world.straight(near, far)
    # Back under the flyover's deck and the skyway's two to the Krusty Krab's grounds, by the spots
    # the map has there.
    grounds = world.node_at(Vec3(-135, 0, 0))
    assert grounds is not None and world.path(road, grounds) is not None
    # And up onto the flyover's deck where it passes over the road: a deck's top is walked like
    # the floor.
    deck = world.node_at(Vec3(-232, 12.7, 0))
    assert deck is not None and world.path(grounds, deck) is not None
