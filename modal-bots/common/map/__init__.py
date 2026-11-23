"""The bots' maps of the world: a module each, beside the file ``npm run bot-map`` builds for it
from the TypeScript content and sim (``packages/shared/src/sim/botMap/``). A bot loads the ones it
needs, each read once per process and shared by every bot in it:

- ``solids``: the floor's parts and every structure, for line of sight and for where there's ground
  to stand on, anywhere in the world;
- ``ground``: a graph of where a body walks over the floor the buildings stand on, with each way of
  moving's jumps across it, for finding a way on foot;
- ``roads``: the roads' middles as a graph, for a kart to be driven by and a way along them to be
  found in, and every race track as the roads it takes;
- ``bodies``: every avatar's hitbox, eyes and walk.
"""

from __future__ import annotations

import gzip
import heapq
import json
import math
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

MAP_DIR = Path(__file__).parent


def read(name: str) -> Any:
    """The map file ``name`` as ``npm run bot-map`` wrote it."""
    with gzip.open(MAP_DIR / f"{name}.json.gz", "rt", encoding="utf-8") as f:
        return json.load(f)


def shortest(
    start: int,
    goal: int,
    steps: Callable[[int], Iterable[tuple[int, float]]],
    left: Callable[[int], float],
) -> list[int] | None:
    """The cheapest way from node ``start`` to node ``goal`` of a graph (both ends included), or
    None when there's none: ``steps(i)`` are the nodes a step from ``i`` reaches with what each
    costs, and ``left(i)`` is no more than what the rest of the way from ``i`` costs (A*)."""
    frontier = [(0.0, start)]
    cost = {start: 0.0}
    came_from: dict[int, int] = {}
    while frontier:
        _, i = heapq.heappop(frontier)
        if i == goal:
            way = [i]
            while way[-1] != start:
                way.append(came_from[way[-1]])
            return way[::-1]
        for j, step in steps(i):
            so_far = cost[i] + step
            if so_far < cost.get(j, math.inf):
                cost[j] = so_far
                came_from[j] = i
                heapq.heappush(frontier, (so_far + left(j), j))
    return None
