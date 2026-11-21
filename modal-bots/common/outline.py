"""Where the floor ends: the parts of the world's floor (``WorldPart`` in
``packages/shared/src/sim/ground.ts``), from the map's outline stage, a few KB. Past them is the
drop to the ground outside, where a walker dies, so a bot that keeps to the floor without the whole
map (the circle bot) asks this before it steps. The stage's own checks pin it to the sim's answers.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

from .stages import read_stage


@dataclass(frozen=True, slots=True)
class Part:
    """A part of the floor: a ``disc`` of radius ``r`` round (x, z); a ``sector`` of it from bearing
    ``start`` round to ``end`` (radians from +x toward +z); a ``bend``, everything within
    ``half_width`` of the arc of radius ``r`` round (x, z) between those bearings; or a ``bridge``,
    everything within ``half_width`` of the segment from (ax, az) to (bx, bz), cut straight across
    at its ends where it's ``square``."""

    kind: str
    x: float = 0
    z: float = 0
    r: float = 0
    start: float = 0
    end: float = 0
    ax: float = 0
    az: float = 0
    bx: float = 0
    bz: float = 0
    half_width: float = 0
    square: bool = False

    def bounds(self) -> tuple[float, float, float, float]:
        """A box round it, least x, most x, least z, most z: a disc's round any slice or bend of it."""
        if self.kind == "bridge":
            w = self.half_width
            return (
                min(self.ax, self.bx) - w,
                max(self.ax, self.bx) + w,
                min(self.az, self.bz) - w,
                max(self.az, self.bz) + w,
            )
        r = self.r + (self.half_width if self.kind == "bend" else 0)
        return self.x - r, self.x + r, self.z - r, self.z + r

    def holds(self, x: float, z: float) -> bool:
        if self.kind == "disc":
            return math.hypot(x - self.x, z - self.z) < self.r
        if self.kind == "sector":
            return math.hypot(x - self.x, z - self.z) <= self.r and self._round(x, z) <= self.end - self.start
        if self.kind == "bend":
            out = math.hypot(x - self.x, z - self.z)
            return abs(out - self.r) < self.half_width and self._round(x, z) <= self.end - self.start
        vx, vz = self.bx - self.ax, self.bz - self.az
        length2 = vx * vx + vz * vz
        along = ((x - self.ax) * vx + (z - self.az) * vz) / length2 if length2 > 0 else 0.0
        if self.square:
            across = ((z - self.az) * vx - (x - self.ax) * vz) / math.sqrt(length2)
            return 0 < along < 1 and abs(across) < self.half_width
        t = max(0.0, min(1.0, along))
        return math.hypot(x - (self.ax + vx * t), z - (self.az + vz * t)) < self.half_width

    def _round(self, x: float, z: float) -> float:
        """Radians round from ``start`` to (x, z)'s bearing from the middle, 0 to 2π."""
        return (math.atan2(z - self.z, x - self.x) - self.start) % (2 * math.pi)


class Outline:
    def __init__(self, outline: Mapping[str, Any]):
        self.parts = tuple(_part(p) for p in outline["parts"])
        self._boxes = tuple((*p.bounds(), p) for p in self.parts)
        # Spots the sim answered for: x, z and whether it's on the floor.
        self.checks = tuple((float(x), float(z), bool(inside)) for x, z, inside in outline["insideChecks"])

    def inside(self, x: float, z: float) -> bool:
        """Whether (x, z) is on the floor (``Ground.inside``)."""
        return any(
            min_x <= x <= max_x and min_z <= z <= max_z and p.holds(x, z)
            for min_x, max_x, min_z, max_z, p in self._boxes
        )


@cache
def load_outline() -> Outline:
    """The outline, read once per process and shared by every bot in it."""
    return Outline(read_stage("outline"))


def _part(p: Mapping[str, Any]) -> Part:
    number = {key: float(p[key]) for key in ("x", "z", "r", "ax", "az", "bx", "bz") if key in p}
    return Part(
        kind=str(p["kind"]),
        start=float(p.get("from", 0)),
        end=float(p.get("to", 0)),
        half_width=float(p.get("halfWidth", 0)),
        square=bool(p.get("square", False)),
        **number,
    )
