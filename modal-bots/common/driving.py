"""Driving a kart along a racing line: the keys to hold each tick, from the kart as the room last
told of it.

A driver steers for a point of its line a little way ahead, holds the pace its line can be taken
at (slower into a bend a boost would slide it wide of, and over a crest that would throw it where
the line turns), drifts through the bends a drift would last to a spark in and lets go on a spark
for the boost, tricks off whatever puts it in the air, and gets itself going again: backed off
what it's wedged against, and from wherever Lakitu sets it down.

What a bot sees is a few ticks old by the time its keys are taken, so a driver goes by where its
kart will be by then, and keeps for itself what it has pressed: a drift is a hop and then the
drift it lands in, begun and let go on its own count rather than on a snapshot that hasn't caught
up with its last key.

How well it does all that is its ``Skill``, anywhere from the least there is to the most
(``skill``), and no two drivers of one skill drive alike: each has dice of its own, which say
which of the bends it could drift it does, which flights it tricks in and when its attention
lapses, and a mood it's told each tick (-1 cold to 1 hot) that lifts or lowers all of those and
its pace, so a driver has good stretches of a race and bad ones.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .controls import TICK_SECONDS
from .map.karts import Driven
from .protocol import Kart
from .racing_line import Line, Shape

BRAKING = 10.0  # m/s² a driver counts on slowing at, a way short of what the brake gives
THROWN = 1.5  # metres off its line a flight may bring it down and still be taken
CREST_SHARE = 0.8  # of the speed a crest would throw it at that it's taken at, where a flight isn't
LOST = 25.0  # metres off its line from which a driver looks for where it is afresh
FALLEN = 4.0  # metres under its line's road that a kart on the ground has fallen off it
STUCK_TICKS = 40  # ticks all but still before it backs off
BACK_TICKS = 30  # ticks it backs off for
# A drift is begun for a bend the line turns into at this share of the kart's full turn or more,
# and held while the line still turns its way by HOLDS just ahead, or by HOLDS_ON a little further.
BEGINS = 0.25
LASTS = 0.2
HOLDS = 0.18
HOLDS_ON = 0.25
TOO_LATE = 0.5  # of its full turn the line already takes, from which a hop would run it wide
NEARLY = 0.45  # seconds short of a spark that a drift is held on for, the bend over or not
SPARE = 0.1  # seconds over a spark's that a bend has to last for a drift to be begun for it
AT_SPEED = 11.0  # m/s the least a drift is begun at
MOOD_PACE = 0.04  # of its pace that a driver's mood adds or takes at its most
MOOD_SHARE = 0.25  # and of the drifts and tricks it could do
LAPSE = (0.3, 0.9)  # seconds a lapse lasts, the least and the most: off the gas
AFTER = 40.0  # metres on from a drift let go at its last spark that no other is begun


@dataclass(frozen=True, slots=True)
class Skill:
    """How well a driver drives: the line it takes (``shape``), how much of the speed its kart has,
    on a boost or not, it uses (``pace``, a share), how much of what its tires hold it takes a
    bend at (``grip``, a share), the
    share of the bends a drift would spark in that it drifts through (``drifts``), how many sparks
    it holds a drift for before it lets go (``sparks``: 1 the first, blue, which gives the
    shortest boost), the share of its flights that it tricks in (``tricks``), and the seconds from
    one lapse of its attention to the next, on average (``lapses``)."""

    shape: Shape
    pace: float
    grip: float
    drifts: float
    sparks: int
    tricks: float
    lapses: float


def skill(rating: float) -> Skill:
    """The skill at ``rating``, from 0 (the least there is: the middle of the road, short of flat
    out, no drifts, no tricks) to 1 (the most: the whole road for its line, every boost there is,
    all but never a lapse), and everything between."""
    r = _unit01(rating)
    return Skill(
        # To the half metre, so drivers near each other in skill share a line.
        shape=Shape(width=round(2 * (3 + 5 * r)) / 2, jump=3 + r, pad=3 + 3 * r, radius=24 - 6 * r, most=8),
        pace=0.875 + 0.125 * r,
        grip=0.5 + 0.35 * r,
        drifts=_unit01((r - 0.3) / 0.6),
        sparks=1 + (r > 0.5) + (r > 0.75),
        tricks=_unit01((r - 0.15) / 0.6),
        lapses=12 + 78 * r,
    )


@dataclass(frozen=True, slots=True)
class Keys:
    """A kart's keys (``Controls.drive``)."""

    gas: float = 0
    steer: float = 0
    drift: bool = False


class Driver:
    def __init__(self, line: Line, skill: Skill, kart: Driven, dice: random.Random):
        self.line = line
        self.skill = skill
        self.kart = kart
        self.dice = dice
        self.pace = _pace(line, skill, kart)
        self._lapse_in = dice.expovariate(1 / skill.lapses)  # seconds to its next lapse
        self._lapsing = 0.0  # seconds left of the one it's in
        self._passed = -1.0  # how far along the line the bend it chose not to drift ends
        self._at = 0  # the stretch of the line it's on, from that point of it to the next
        self._lost = True  # set down somewhere, or far off its line: where it is has to be found
        self._yaw: float | None = None  # its nose as last seen, for how fast it's turning
        self._still = 0  # ticks it has stood all but still
        self._back = 0  # ticks left of backing off what it's wedged against
        # The way of the drift it holds the key down for (1 right, -1 left), a hop and then the
        # drift it lands in; 0 with the key up. And the ticks since it went down, or came up.
        self._key = 0
        self._since = 99
        self._air = 0  # ticks it has been seen in a flight
        self._tricks = False  # whether it tricks in the flight it's in

    def keys(self, kart: Kart, late: int, mood: float = 0) -> Keys:
        """The keys to hold now for ``kart``, seen ``late`` ticks before they'll be taken, by a
        driver in ``mood`` (-1 cold to 1 hot)."""
        if kart.rescued:
            self._lost = True
            self._key = 0
            return Keys()
        line, car = self.line, self.kart
        lag = late * TICK_SECONDS
        # Where it will be by the time its keys take hold: on as it's going, turning as it's turning.
        spin = 0.0 if self._yaw is None else _wrap(kart.yaw - self._yaw) / TICK_SECONDS
        self._yaw = kart.yaw
        yaw = kart.yaw + spin * lag
        x, z = kart.pos.x + kart.vel.x * lag, kart.pos.z + kart.vel.z * lag
        speed = math.hypot(kart.vel.x, kart.vel.z)
        forward = kart.vel.x * math.sin(kart.yaw) + kart.vel.z * math.cos(kart.yaw)
        s = self._place(x, kart.pos.y, z)
        i = self._at
        # Down on the ground past the road's edge, there's no driving back up: Lakitu's to wait for.
        if kart.grounded and kart.pos.y < line.y[i] - FALLEN:
            self._key = 0
            return Keys()
        total = line.s[-1]
        # The point of the line it steers for, further ahead the faster it goes, and the turn that
        # takes it there (a circle through the point), as a share of its tightest.
        ahead = min(total, s + max(6.0, min(15.0, 3 + speed * 0.4)))
        tx, tz = _along(line.s, line.x, i, ahead), _along(line.s, line.z, i, ahead)
        reach = math.hypot(tx - x, tz - z)
        off = _wrap(math.atan2(tx - x, tz - z) - yaw)
        lock = 2 * math.sin(off) * car.turn / max(reach, 1.0)
        pace = _along(line.s, self.pace, i, min(total, s + speed * (lag + 0.1)))
        has = car.boosted if kart.boosted else car.speed
        pace = min(pace, has * self.skill.pace * (1 + MOOD_PACE * mood))
        gas = 1.0 if speed < pace else -1.0 if speed > pace + 1.5 else 0.0
        # A lapse: off the gas a moment, sooner the colder its mood.
        self._lapse_in -= TICK_SECONDS * (1 - 0.5 * mood)
        if self._lapse_in <= 0:
            self._lapse_in = self.dice.expovariate(1 / self.skill.lapses)
            self._lapsing = self.dice.uniform(*LAPSE)
        if self._lapsing > 0:
            self._lapsing -= TICK_SECONDS
            gas = min(gas, 0.0)
        # Wedged against something, or pointing back the way it came: back off and round.
        self._still = self._still + 1 if abs(forward) < 1.5 and kart.grounded else 0
        if self._still > STUCK_TICKS:
            self._back = BACK_TICKS
        if abs(off) > 2 and speed < 8:
            self._back = max(self._back, BACK_TICKS // 2)
        if self._back > 0:
            self._back -= 1
            self._still = 0
            self._key = 0
            return Keys(gas=-1, steer=_unit(-lock * 3))
        steer = _unit(lock)
        flying = not kart.grounded and not kart.hopping
        pacing = max(forward, 12.0)

        def turns(d: float) -> float:
            """The turn the line itself takes ``d`` metres on, as a share of the kart's tightest."""
            return _along(line.s, line.k, i, min(total, s + d)) * car.turn

        def flight(d: float) -> bool:
            """Whether anything within ``d`` metres on would put the kart in the air."""
            a = i
            while a < len(line.s) and line.s[a] - s < d:
                if line.gap[a] or line.lift[a] < car.boosted + 2:
                    return True
                a += 1
            return False

        drift = False
        self._since += 1
        if self._key != 0:
            # The drift key is down: a hop its way, then the drift it lands in, held while the
            # line still bends that way, and on to the next spark where that's a moment off.
            way = self._key
            drift = True
            if kart.drift is not None:
                t = kart.drift.t + lag
                want = lock * way
                spread = (
                    car.drift_tight - car.drift_neutral
                    if want >= car.drift_neutral
                    else car.drift_neutral - car.drift_wide
                )
                steer = way * _unit((want - car.drift_neutral) / spread)
                spark = next((after for after in car.sparks[: self.skill.sparks] if after > t - 0.05), None)
                bends = turns(pacing * 0.15) * way > HOLDS or turns(pacing * 0.35) * way > HOLDS_ON
                nearly = spark is not None and spark - t < NEARLY and want > -0.4
                if spark is None or not (bends or nearly) or flight(pacing * 0.6) or flying:
                    drift = False
                    # Let go on the last spark it holds for, it takes the rest of the bend as it comes.
                    if spark is None:
                        self._passed = s + AFTER
            else:
                steer = float(way) if self._since <= 1 else _unit(lock / car.air_turn)
                # Never seen to land in one: it didn't take (too slow, knocked off its line).
                if self._since > car.hop / TICK_SECONDS + late + 5 and not kart.hopping:
                    drift = False
            if not drift:
                self._key, self._since = 0, 0
        elif (
            self.skill.drifts > 0
            and kart.grounded
            and not kart.hopping
            and kart.drift is None
            and kart.reel == 0
            and forward > AT_SPEED
            and self._since > late + 3
        ):
            way = self._bend(turns, flight, pacing, s, mood)
            if way != 0:
                self._key, self._since = way, 0
                drift = True
                steer = float(way)
        # In a flight (off a ramp, a crest, a ledge): a tap of the key is a trick, and a boost as it lands.
        self._air = self._air + 1 if flying else 0
        if self._air == 2:
            self._tricks = self._takes(self.skill.tricks, mood)
        if self._tricks and self._key == 0 and self._air in (2, 3):
            drift = True
        return Keys(gas=gas, steer=steer, drift=drift)

    def _takes(self, share: float, mood: float) -> bool:
        """Whether it takes this one of the chances it takes ``share`` of: more of them hot, fewer
        cold, and none where it takes none."""
        return share > 0 and self.dice.random() < share + MOOD_SHARE * mood

    def _place(self, x: float, y: float, z: float) -> float:
        """Finds the stretch of the line the kart is on, onward from the last, or afresh once it
        has been set down or is far off; returns how far along the line it is."""
        line = self.line
        n = len(line.x)
        if self._lost:
            self._at = min(
                n - 2,
                min(range(n), key=lambda a: (line.x[a] - x) ** 2 + (line.z[a] - z) ** 2 + 4 * (line.y[a] - y) ** 2),
            )
        best, share = math.inf, 0.0
        for a in range(max(0, self._at - 4), min(n - 2, self._at + 16) + 1):
            ux, uz = line.x[a + 1] - line.x[a], line.z[a + 1] - line.z[a]
            t = _unit01(((x - line.x[a]) * ux + (z - line.z[a]) * uz) / ((ux * ux + uz * uz) or 1.0))
            d = math.hypot(x - line.x[a] - ux * t, z - line.z[a] - uz * t)
            if d < best - 1e-9:
                best, share, self._at = d, t, a
        self._lost = best > LOST
        a = self._at
        return line.s[a] + (line.s[a + 1] - line.s[a]) * share

    def _bend(
        self, turns: Callable[[float], float], flight: Callable[[float], bool], pacing: float, s: float, mood: float
    ) -> int:
        """The way of a bend coming that a drift would last to a spark through (1 right, -1 left),
        to hop into now, as it begins, ``s`` metres along the line; 0 for none, or for one it
        doesn't take."""
        if s < self._passed:
            return 0
        car = self.kart
        land = pacing * (car.hop + 0.03)
        begins, way = -1.0, 0
        d = 0.0
        while d <= land + 3 and begins < 0:
            turn = turns(d)
            if abs(turn) >= BEGINS:
                begins, way = d, 1 if turn > 0 else -1
            d += 3
        if begins < 0 or abs(turns(0)) >= TOO_LATE:
            return 0
        until = max(begins, land)
        while until < 200 and turns(until) * way > LASTS:
            until += 3
        lasts = (until - max(begins, land)) / pacing
        if lasts <= car.sparks[0] + SPARE or flight(until + 10):
            return 0
        if not self._takes(self.skill.drifts, mood):
            self._passed = s + until
            return 0
        return way


def _pace(line: Line, skill: Skill, kart: Driven) -> list[float]:
    """How fast ``skill`` takes each point of a line: no faster than it holds the bend there, than
    keeps it on the ground over a crest it would be thrown wide of its line from, or than it could
    brake from for what's ahead."""
    n = len(line.x)
    grip = skill.grip * kart.grip
    fastest = kart.boosted * min(1.0, skill.pace * (1 + MOOD_PACE))
    pace = []
    for a in range(n):
        most = math.sqrt(grip / max(abs(line.k[a]), 1e-4))
        if line.lift[a] < fastest and _thrown(line, a, fastest, kart) > THROWN:
            most = min(most, line.lift[a] * CREST_SHARE)
        pace.append(most)
    for a in range(n - 2, -1, -1):
        pace[a] = min(pace[a], math.sqrt(pace[a + 1] ** 2 + 2 * BRAKING * (line.s[a + 1] - line.s[a])))
    return pace


def _thrown(line: Line, a: int, speed: float, kart: Driven) -> float:
    """How far off its line a kart thrown into the air at point ``a`` of it, at ``speed``, comes
    down: it flies on the way it was going, rising or falling as the road was, while the line
    turns under it."""
    if a == 0:
        return 0.0
    run = (line.s[a] - line.s[a - 1]) or 1.0
    ahead_x, ahead_z = (line.x[a] - line.x[a - 1]) / run, (line.z[a] - line.z[a - 1]) / run
    rising = (line.y[a] - line.y[a - 1]) / run * speed
    b = a + 1
    while b < len(line.x) - 1:
        t = (line.s[b] - line.s[a]) / speed
        if line.y[a] + rising * t - kart.gravity * t * t / 2 <= line.y[b]:
            break
        b += 1
    b = min(b, len(line.x) - 1)
    return abs((line.x[b] - line.x[a]) * ahead_z - (line.z[b] - line.z[a]) * ahead_x)


def _along(s: Sequence[float], values: Sequence[float], i: int, at: float) -> float:
    """A value kept per point of a line, ``at`` metres along it, looked for from point ``i`` on."""
    while i + 2 < len(s) and s[i + 1] < at:
        i += 1
    return values[i] + (values[i + 1] - values[i]) * _unit01((at - s[i]) / ((s[i + 1] - s[i]) or 1.0))


def _unit(v: float) -> float:
    return max(-1.0, min(1.0, v))


def _unit01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _wrap(angle: float) -> float:
    return math.atan2(math.sin(angle), math.cos(angle))
