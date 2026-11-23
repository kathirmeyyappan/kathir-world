"""The roads: their middles as a graph (``packages/shared/src/sim/botMap/roads.ts``), a node at
every end of a length of road and no more than 20 m apart along one, with the road's height there,
for a bot driving a kart by them or finding a way along them. Roads that meet share a node. Every
race track is in it too, as the roads it takes: ``track`` reads one's middle.
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from ..protocol import Vec3
from . import once, read, shortest


@dataclass(frozen=True)
class Middle:
    """A way along the roads' middles: its points in the order they're driven, and which of its
    stretches (each from a point to the next) are a gap to be jumped and which have a boost pad."""

    points: tuple[Vec3, ...]
    gap: tuple[bool, ...]
    pad: tuple[bool, ...]
    width: float  # metres across the road
    # Metres from a corner of it (where two of its roads meet, on an island or the crossroads)
    # that are floor all round: the place's own disc, off the road.
    junction: float


class Roads:
    def __init__(self, roads: Mapping[str, Any]):
        # The top of the road at its middle, there.
        self.nodes = tuple(Vec3(float(x), float(y), float(z)) for x, y, z in roads["nodes"])
        # Per node, the nodes a stretch of road joins it to, the ones across a gap from it (no road
        # between, there to be jumped at a kart's speed), and the ones a boost pad lies toward.
        self.ways = self._joined(roads["edges"])
        self.gaps = self._joined(roads["gaps"])
        self.pads = self._joined(roads["pads"])
        # Each road end to end, as its nodes in order, and each race track as the roads it takes
        # in turn: n + 1 for road n the way it's listed, -(n + 1) for it taken the other way.
        self._roads = tuple(tuple(int(i) for i in road) for road in roads["roads"])
        self._tracks = tuple(tuple(int(leg) for leg in track) for track in roads["tracks"])
        # Spots on a few tracks' middles as the sim lays them: (track, x, y, z).
        self.checks = tuple((int(track), Vec3(float(x), float(y), float(z))) for track, x, y, z in roads["checks"])
        self.width = float(roads["width"])
        self.junction = float(roads["junction"])

    def _joined(self, pairs: Sequence[Sequence[int]]) -> tuple[tuple[int, ...], ...]:
        out: list[list[int]] = [[] for _ in self.nodes]
        for a, b in pairs:
            out[int(a)].append(int(b))
            out[int(b)].append(int(a))
        return tuple(tuple(joined) for joined in out)

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

    @property
    def tracks(self) -> int:
        """How many race tracks there are: a race names its track by its place among them."""
        return len(self._tracks)

    def track(self, index: int) -> Middle:
        """The middle of race track ``index``, from the island it starts on to where it ends (by
        the first strand of a road that splits in two)."""
        nodes: list[int] = []
        for leg in self._tracks[index]:
            road = self._roads[abs(leg) - 1]
            for node in road if leg > 0 else reversed(road):
                if not nodes or nodes[-1] != node:
                    nodes.append(node)
        return self.way(nodes)

    def way(self, nodes: Sequence[int]) -> Middle:
        """The middle of a way along the roads by its nodes in turn (a ``path``'s)."""
        stretches = list(itertools.pairwise(nodes))
        return Middle(
            points=tuple(self.nodes[i] for i in nodes),
            gap=tuple(b in self.gaps[a] for a, b in stretches),
            pad=tuple(b in self.pads[a] for a, b in stretches),
            width=self.width,
            junction=self.junction,
        )


@once
def load_roads() -> Roads:
    return Roads(read("roads"))


def _apart(a: Vec3, b: Vec3) -> float:
    return math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
