"""The roads out past the floor the buildings stand on: their middles as a sparse graph, a node
every 20 m or so with the road's height there (``packages/shared/src/sim/botMap/roads.ts``), for a
bot finding a way along them, on foot or in a kart. Roads that meet share a node, and a road that
starts on the floor the ground covers (``map.ground``) starts at that floor's rim.
"""

from __future__ import annotations

import math
from collections.abc import Iterator, Mapping
from functools import cache
from typing import Any

from ..protocol import Vec3
from . import read, shortest


class Roads:
    def __init__(self, roads: Mapping[str, Any]):
        # The top of the road at its middle, there.
        self.nodes = tuple(Vec3(float(x), float(y), float(z)) for x, y, z in roads["nodes"])
        # Per node, the nodes a stretch of road joins it to, and the ones across a gap from it:
        # no road between, there to be jumped at a kart's speed.
        ways: list[list[int]] = [[] for _ in self.nodes]
        gaps: list[list[int]] = [[] for _ in self.nodes]
        for joined, pairs in ((ways, roads["edges"]), (gaps, roads["gaps"])):
            for a, b in pairs:
                joined[int(a)].append(int(b))
                joined[int(b)].append(int(a))
        self.ways = tuple(tuple(out) for out in ways)
        self.gaps = tuple(tuple(out) for out in gaps)

    def nearest(self, at: Vec3) -> int:
        """The node nearest ``at``."""
        return min(range(len(self.nodes)), key=lambda i: _apart(self.nodes[i], at))

    def path(self, start: int, goal: int, gaps: bool = False) -> list[int] | None:
        """The shortest way along the roads from node ``start`` to node ``goal`` (both ends
        included), or None when there's none: across a gap only with ``gaps``, for a kart."""

        def steps(i: int) -> Iterator[tuple[int, float]]:
            for j in (*self.ways[i], *(self.gaps[i] if gaps else ())):
                yield j, _apart(self.nodes[i], self.nodes[j])

        return shortest(start, goal, steps, lambda i: _apart(self.nodes[i], self.nodes[goal]))


@cache
def load_roads() -> Roads:
    return Roads(read("roads"))


def _apart(a: Vec3, b: Vec3) -> float:
    return math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
