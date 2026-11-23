"""The karts there are: how each drives, as much of it as a bot driving one plans by
(``packages/shared/src/sim/botMap/karts.ts``)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

from . import read


@dataclass(frozen=True, slots=True)
class Driven:
    """How a kart drives (sim/vehicles/kart.ts)."""

    speed: float  # m/s flat out on the gas
    boosted: float  # and at the full of a boost
    turn: float  # metres: the radius of its turn with the wheel full over, at any speed
    air_turn: float  # of that turn, what it has in the air
    grip: float  # m/s² its tires hold across it: a turn that asks more slides wide
    lift: float  # m/s faster upward than the ground past a crest carries it, at which it leaves the ground
    hop: float  # seconds the hop a drift begins with is in the air
    drift_from: float  # m/s: the least a drift begins or carries on at
    # The share of its full turn a drift turns at, with the wheel held out of its way, let be, and
    # held into it.
    drift_wide: float
    drift_neutral: float
    drift_tight: float
    sparks: tuple[float, ...]  # seconds of a drift on the ground to each spark


class Karts:
    def __init__(self, karts: Mapping[str, Any]):
        self.karts = {
            str(kart): Driven(
                speed=float(d["speed"]),
                boosted=float(d["boosted"]),
                turn=float(d["turn"]),
                air_turn=float(d["airTurn"]),
                grip=float(d["grip"]),
                lift=float(d["lift"]),
                hop=float(d["hop"]),
                drift_from=float(d["drift"]["from"]),
                drift_wide=float(d["drift"]["wide"]),
                drift_neutral=float(d["drift"]["neutral"]),
                drift_tight=float(d["drift"]["tight"]),
                sparks=tuple(float(t) for t in d["drift"]["sparks"]),
            )
            for kart, d in karts["karts"].items()
        }

    def of(self, kart: str) -> Driven:
        """How a kart drives; the standard one's for a kart the map doesn't know."""
        return self.karts.get(kart, self.karts["standard"])


@cache
def load_karts() -> Karts:
    return Karts(read("karts"))
