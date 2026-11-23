"""Driving a kart along a racing line: the keys to hold each tick, from the kart as the room last
told of it.

A driver steers for a point of its line a little way ahead, holds the pace its line can be taken
at (slower into a bend a boost would slide it wide of, and over a crest that would throw it where
the line turns), drifts through the bends a drift would last to a spark in and lets go on a spark
for the boost, tricks off whatever puts it in the air, and gets itself going again: backed off
what it's wedged against, and from wherever Lakitu sets it down.

The best chain drifts down the straights too, one after another for as long as the line runs all
but straight and no other kart is in the way: a hop, a drift at the least it turns, let go at its
first spark for the boost, which lasts until the next one's. A drift is a turn however little of
one, so each is lined up for first: the nose turned the other way by as much as the drift will
bring it back, so it comes out where its line is.

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
from collections.abc import Sequence
from dataclasses import dataclass

from .controls import TICK_SECONDS
from .map.karts import Driven
from .protocol import Kart, Vec3
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
REACHED = 0.05  # seconds past a spark's that a drift is held, so the spark is surely its own
AT_SPEED = 11.0  # m/s the least a drift is begun at
ASTRAY = -0.15  # of its full turn, against a drift's way, that its line asks before the drift is let go
# Ticks on the ground before a drift is begun: just down from a flight, a press of the key is a
# trick late (a boost at once) and no hop, and the drift would begin at that speed, wheel hard over.
SETTLED = 12
EVEN = 0.25  # of the wheel, the most it's held over as a trick is pressed: under what gives a drift a way
MOOD_PACE = 0.04  # of its pace that a driver's mood adds or takes at its most
MOOD_SHARE = 0.25  # and of the drifts and tricks it could do
LAPSE = (0.3, 0.9)  # seconds a lapse lasts, the least and the most: off the gas
# The best cut corners: from this rating up a line may leave the road where two roads meet, for
# these metres at the most, about a second off the track of the two a race allows before Lakitu comes.
CUTS = 0.7
CUT = 22.0
AFTER = 40.0  # metres on from a drift let go at its last spark that no other is begun
# A chained drift is begun where its line turns nowhere by BEGINS until the drift is let go and
# for CLEAR seconds after: time to line up for the bend that follows and to hop into it.
CLEAR = 1.0
# Metres of road a chained drift keeps either side of it: it swings out only where the road has
# that much, and comes out on its line or, where the line has less, beside it.
ROOM = 4.5
# The hop a chained drift begins with has to be this near, in seconds, to a hop on the flat: up a
# climb there's little of one or none, and where the road falls away under it, a flight.
HOP_OFF = 0.2
# Lining up for a chained drift: the nose off the way to where the drift will let go by what the
# drift's least turn takes in LINED seconds, a little over what brings it out there, since a drift
# that would come out short can be tightened and one that would come out past can't be widened;
# turned there as fast as closes the gap in the time its keys are late and QUICK seconds more; and
# lined up within LINED_UP radians of it, turning no faster than leaves it there QUICK seconds on.
LINED = 0.3
QUICK = 0.1
LINED_UP = 0.03
TIGHTER = 2.0  # times its least turn, the most a chained drift is tightened to come out on its line
# No chained drift is begun with another kart abreast of it or within TRAFFIC metres ahead: it
# would swing out into the one, or boost into the back of the other.
TRAFFIC = 15.0
ABREAST = 3.0  # metres behind its own middle that another kart's is still abreast of it


@dataclass(frozen=True, slots=True)
class Skill:
    """How well a driver drives: the line it takes (``shape``), how much of the speed its kart has,
    on a boost or not, it uses (``pace``, a share), how much of what its tires hold it takes a
    bend at (``grip``, a share), the
    share of the bends a drift would spark in that it drifts through (``drifts``), how many sparks
    it holds a drift for before it lets go (``sparks``: 1 the first, blue, which gives the
    shortest boost), the share of its flights that it tricks in (``tricks``), the seconds from
    one lapse of its attention to the next, on average (``lapses``), and the share of the drifts
    it could chain down a straight that it does (``chains``)."""

    shape: Shape
    pace: float
    grip: float
    drifts: float
    sparks: int
    tricks: float
    lapses: float
    chains: float


def skill(rating: float) -> Skill:
    """The skill at ``rating``, from 0 (the least there is: the middle of the road, short of flat
    out, no drifts, no tricks) to 1 (the most: the whole road for its line, every boost there is,
    all but never a lapse), and everything between."""
    r = _unit01(rating)
    return Skill(
        # To the half metre, so drivers near each other in skill share a line.
        shape=Shape(
            width=round(2 * (3 + 5 * r)) / 2,
            jump=3 + r,
            pad=3 + 3 * r,
            radius=24 - 6 * r,
            most=8,
            cut=CUT if r >= CUTS else 0,
        ),
        pace=0.875 + 0.125 * r,
        grip=0.5 + 0.35 * r,
        drifts=_unit01((r - 0.3) / 0.6),
        sparks=1 + (r > 0.5) + (r > 0.75),
        tricks=_unit01((r - 0.15) / 0.6),
        lapses=12 + 78 * r,
        chains=_unit01((r - 0.75) / 0.15),
    )


@dataclass(frozen=True, slots=True)
class Keys:
    """A kart's keys (``Controls.drive``)."""

    gas: float = 0
    steer: float = 0
    drift: bool = False


@dataclass(frozen=True, slots=True)
class _Now:
    """What a driver goes by for a tick's keys: its kart as last seen, and where that puts it by
    the time the keys take hold, on as it was going and turning as it was turning."""

    kart: Kart
    late: int  # ticks from what was seen to the keys taking hold
    x: float
    z: float
    yaw: float
    spin: float  # rad/s its nose was turning at
    s: float  # metres along its line
    side: float  # metres to the right of its line
    bearing: float  # the way its line runs there
    pacing: float  # m/s along its nose, taken for no less than 12
    lock: float  # the turn that takes it to its line, as a share of its tightest
    pace: float  # m/s it's making for
    mood: float
    others: Sequence[Vec3]  # where the other karts were last seen

    @property
    def lag(self) -> float:
        return self.late * TICK_SECONDS

    @property
    def swift(self) -> float:
        """m/s it will be going once a hop begun now lands: a boost just begun has it there."""
        return max(self.pacing, self.pace)

    @property
    def flying(self) -> bool:
        """In the air other than by the hop a drift begins with."""
        return not self.kart.grounded and not self.kart.hopping


class Driver:
    def __init__(self, line: Line, skill: Skill, kart: Driven, dice: random.Random):
        self.line = line
        self.skill = skill
        self.kart = kart
        self.dice = dice
        self.pace = _pace(line, skill, kart)
        self._lapse_in = dice.expovariate(1 / skill.lapses)  # seconds to its next lapse
        self._lapsing = 0.0  # seconds left of the one it's in
        # How far along the line no drift is begun before: the end of a bend it chose not to
        # drift, or of the drift down a straight it chose not to chain.
        self._passed = -1.0
        self._at = 0  # the stretch of the line it's on, from that point of it to the next
        self._lost = True  # set down somewhere, or far off its line: where it is has to be found
        self._yaw: float | None = None  # its nose as last seen, for how fast it's turning
        self._still = 0  # ticks it has stood all but still
        self._back = 0  # ticks left of backing off what it's wedged against
        # The way of the drift it holds the key down for (1 right, -1 left), a hop and then the
        # drift it lands in; 0 with the key up. And the ticks since it went down, or came up.
        self._key = 0
        self._since = 99
        # The way of the chained drift it's lining up for, or holds the key down for; 0 for none.
        self._chain = 0
        self._air = 0  # ticks it has been seen in a flight
        self._down = 99  # ticks it has been seen on the ground since
        self._tricks = False  # whether it tricks in the flight it's in

    def keys(self, kart: Kart, late: int, mood: float = 0, others: Sequence[Vec3] = ()) -> Keys:
        """The keys to hold now for ``kart``, seen ``late`` ticks before they'll be taken, by a
        driver in ``mood`` (-1 cold to 1 hot), with the other karts in the race at ``others``."""
        if kart.rescued:
            self._lost = True
            self._key = self._chain = 0
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
        s, side, bearing = self._place(x, kart.pos.y, z)
        i = self._at
        # Down on the ground past the road's edge, there's no driving back up: Lakitu's to wait for.
        if kart.grounded and kart.pos.y < line.y[i] - FALLEN:
            self._key = self._chain = 0
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
            self._key = self._chain = 0
            return Keys(gas=-1, steer=_unit(-lock * 3))
        self._down = self._down + 1 if kart.grounded else 0
        now = _Now(kart, late, x, z, yaw, spin, s, side, bearing, max(forward, 12.0), lock, pace, mood, others)
        steer, drift = _unit(lock), False
        self._since += 1
        if self._key != 0:
            # The drift key is down: a hop its way, then the drift it lands in.
            if kart.drift is None:
                steer, drift = self._hopping(now)
            elif kart.drift.way != self._key:
                # A drift the other way is none it began: its own died, too slow, and the key,
                # still down, began this one by where the wheel was. Let go of it.
                drift = False
            elif self._chain != 0:
                steer, drift = self._chaining(now, kart.drift.t + lag)
            else:
                steer, drift = self._rounding(now, kart.drift.t + lag)
            if not drift:
                self._key, self._since, self._chain = 0, 0, 0
        if self._key == 0:
            # It's up: down again as a bend to drift through begins, or once the kart is lined up
            # for a drift down the straight it's on.
            on = kart.grounded and not kart.hopping and kart.reel == 0 and forward > AT_SPEED
            on = on and self._down > late + SETTLED
            free = on and kart.drift is None and self._since > late + 3
            way = self._bend(now) if free and self.skill.drifts > 0 else 0
            fits, run = self._fits(now) if on and way == 0 and self.skill.chains > 0 else (0, 0.0)
            if fits == 0 or self._chain != 0:
                self._chain = fits
            elif s >= self._passed:
                if self._takes(self.skill.chains, mood):
                    self._chain = fits
                else:
                    self._passed = s + run
            if self._chain != 0:
                steer, lined = self._lining(now, run)
                if free and lined:
                    way = self._chain
            if way != 0:
                self._key, self._since = way, 0
                steer, drift = float(way), True
        # In a flight (off a ramp, a crest, a ledge): a tap of the key is a trick, and a boost as it lands.
        self._air = self._air + 1 if now.flying else 0
        if self._air == 2:
            self._tricks = self._takes(self.skill.tricks, mood)
        if self._tricks and self._key == 0 and self._air in (2, 3):
            # The wheel all but straight, so the key, still down as it lands, begins no drift.
            drift, steer = True, max(-EVEN, min(EVEN, steer))
        return Keys(gas=gas, steer=steer, drift=drift)

    def _takes(self, share: float, mood: float) -> bool:
        """Whether it takes this one of the chances it takes ``share`` of: more of them hot, fewer
        cold, and none where it takes none."""
        return share > 0 and self.dice.random() < share + MOOD_SHARE * mood

    def _place(self, x: float, y: float, z: float) -> tuple[float, float, float]:
        """Finds the stretch of the line the kart is on, onward from the last, or afresh once it
        has been set down or is far off; returns how far along the line it is, how far to the
        right of it, and the way the line runs there."""
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
        ux, uz = line.x[a + 1] - line.x[a], line.z[a + 1] - line.z[a]
        side = math.copysign(best, (x - line.x[a]) * uz - (z - line.z[a]) * ux)
        return line.s[a] + (line.s[a + 1] - line.s[a]) * share, side, math.atan2(ux, uz)

    def _turns(self, s: float, d: float) -> float:
        """The turn the line itself takes ``d`` metres on from ``s`` metres along it, as a share
        of the kart's tightest."""
        line = self.line
        return _along(line.s, line.k, self._at, min(line.s[-1], s + d)) * self.kart.turn

    def _flight(self, s: float, d: float) -> bool:
        """Whether anything within ``d`` metres on from ``s`` metres along the line would put the
        kart in the air."""
        line = self.line
        a = self._at
        while a < len(line.s) and line.s[a] - s < d:
            if line.gap[a] or line.lift[a] < self.kart.boosted + 2:
                return True
            a += 1
        return False

    def _hopping(self, now: _Now) -> tuple[float, bool]:
        """The wheel through the hop a drift begins with, and whether the key stays down: over the
        drift's way as it goes up, which gives the hop that way, then as its line asks, or for a
        chained drift let be, its nose kept as it was lined up."""
        way, car = self._key, self.kart
        steer = float(way) if self._since <= 1 else 0.0 if self._chain != 0 else _unit(now.lock / car.air_turn)
        # Never seen to land in a drift: it didn't take (too slow, knocked off its line).
        return steer, now.kart.hopping or self._since <= car.hop / TICK_SECONDS + now.late + 5

    def _rounding(self, now: _Now, t: float) -> tuple[float, bool]:
        """The wheel ``t`` seconds into a bend's drift, and whether the key stays down: held while
        the line still bends its way, and on to the next spark where that's a moment off."""
        way, car, s, pacing = self._key, self.kart, now.s, now.pacing
        want = now.lock * way
        spread = (
            car.drift_tight - car.drift_neutral if want >= car.drift_neutral else car.drift_neutral - car.drift_wide
        )
        steer = way * _unit((want - car.drift_neutral) / spread)
        spark = next((after for after in car.sparks[: self.skill.sparks] if after > t - REACHED), None)
        bends = self._turns(s, pacing * 0.15) * way > HOLDS or self._turns(s, pacing * 0.35) * way > HOLDS_ON
        nearly = spark is not None and spark - t < NEARLY and want > -0.4
        # Let go as well where its line is the other way from where the drift takes it: the
        # least a drift turns is still a turn, and too far inside a bend it only goes further in.
        if spark is None or not (bends or nearly) or self._flight(s, pacing * 0.6) or now.flying or want < ASTRAY:
            # Let go on the last spark it holds for, it takes the rest of the bend as it comes.
            if spark is None:
                self._passed = s + AFTER
            return steer, False
        return steer, True

    def _chaining(self, now: _Now, t: float) -> tuple[float, bool]:
        """The wheel ``t`` seconds into a chained drift, and whether the key stays down: held out
        of the drift, which is the least it turns, or less far out where only a tighter turn has
        it back where it's coming out by the time it lets go, at its first spark."""
        way, car, s = self._key, self.kart, now.s
        left = car.sparks[0] + REACHED - t  # seconds until it lets go
        if left <= 0 or now.flying or self._flight(s, now.pacing * 0.6):
            return -float(way), False
        run = now.pacing * left
        # How far short of there the turn it has would leave it, and the turn that makes it up.
        short = way * (self._beside(s + run) - now.side) - run * math.sin(way * _wrap(now.yaw - now.bearing))
        turn = self._turns(s, run / 2) * way + 2 * short * car.turn / (run * run)
        turn = max(car.drift_wide, min(TIGHTER * car.drift_wide, turn))
        return way * (turn - car.drift_neutral) / (car.drift_neutral - car.drift_wide), True

    def _bend(self, now: _Now) -> int:
        """The way of a bend coming that a drift would last to a spark through (1 right, -1 left),
        to hop into now, as it begins; 0 for none, or for one it doesn't take."""
        s, pacing = now.s, now.pacing
        if s < self._passed:
            return 0
        car = self.kart
        land = pacing * (car.hop + 0.03)
        begins, way = -1.0, 0
        d = 0.0
        while d <= land + 3 and begins < 0:
            turn = self._turns(s, d)
            if abs(turn) >= BEGINS:
                begins, way = d, 1 if turn > 0 else -1
            d += 3
        if begins < 0 or abs(self._turns(s, 0)) >= TOO_LATE:
            return 0
        until = max(begins, land)
        while until < 200 and self._turns(s, until) * way > LASTS:
            until += 3
        lasts = (until - max(begins, land)) / pacing
        if lasts <= car.sparks[0] + SPARE or self._flight(s, until + 10):
            return 0
        if not self._takes(self.skill.drifts, now.mood):
            self._passed = s + until
            return 0
        return way

    def _fits(self, now: _Now) -> tuple[int, float]:
        """The way of a chained drift that fits here (1 right, -1 left; 0 where none does) and the
        metres on to where it would let go. One fits where the hop it begins with is a hop like
        any, the line turns nowhere by what a bend's drift is begun for until it's let go and
        CLEAR seconds after, with nothing there to fly off, and the road has ROOM on the side it
        swings out to, the other side from its way. Its way is the way its line bends, however
        little, or with no room for that, the other, against a bend of no more than half a
        drift's least turn. And none fits in traffic."""
        car, line, s, swift = self.kart, self.line, now.s, now.swift
        for other in now.others:
            dx, dy, dz = other.x - now.x, other.y - now.kart.pos.y, other.z - now.z
            ahead = dx * math.sin(now.yaw) + dz * math.cos(now.yaw)
            if ahead > -ABREAST and math.hypot(dx, dy, dz) < TRAFFIC:
                return 0, 0.0
        air = self._hop(now, swift)
        if abs(air - car.hop) > HOP_OFF:
            return 0, 0.0
        run = swift * (air + car.sparks[0])
        turns: list[float] = []  # the line's, at each of its points the drift passes
        left = right = math.inf  # the least road those points have either side
        a = self._at
        while a < len(line.s) and line.s[a] - s <= run + swift * CLEAR:
            turn = line.k[a] * car.turn
            if abs(turn) >= BEGINS or line.gap[a] or line.lift[a] < car.boosted + 2:
                return 0, 0.0
            if line.s[a] - s <= run:
                turns.append(turn)
                left, right = min(left, line.left[a]), min(right, line.right[a])
            a += 1
        bend = sum(turns) / len(turns)
        into = 1 if bend > 0 else -1
        for way in (into, -into) if abs(bend) <= car.drift_wide / 2 else (into,):
            # A drift to the right swings out to the left first, and the other way about.
            if (left if way > 0 else right) + min(0.0, way * now.side) >= ROOM:
                return way, run
        return 0, 0.0

    def _hop(self, now: _Now, speed: float) -> float:
        """Seconds a hop begun now, at ``speed``, is in the air: longer where the road falls away
        under it, shorter up a climb, and none where the climb is as fast as the hop."""
        car, line = self.kart, self.line
        up = car.hop * car.gravity / 2
        y = now.kart.pos.y
        level = y - _along(line.s, line.y, self._at, now.s)
        t = 0.0
        while t < 2 * car.hop:
            t += TICK_SECONDS
            road = _along(line.s, line.y, self._at, min(line.s[-1], now.s + speed * t))
            if y + up * t - car.gravity * t * t / 2 <= road + level:
                return t - TICK_SECONDS
        return t

    def _beside(self, at: float) -> float:
        """Metres to the right of its line that a chained drift comes out, ``at`` metres along
        it: none where the line has ROOM of road either side."""
        line, i = self.line, self._at
        return max(0.0, ROOM - _along(line.s, line.left, i, at)) - max(0.0, ROOM - _along(line.s, line.right, i, at))

    def _lining(self, now: _Now, run: float) -> tuple[float, bool]:
        """The wheel to line the kart up for the chained drift it means to begin, which lets go
        ``run`` metres on, and whether it's lined up."""
        car, line, way, swift = self.kart, self.line, self._chain, now.swift
        out = min(line.s[-1], now.s + run)
        ox, oz = _along(line.s, line.x, self._at, out), _along(line.s, line.z, self._at, out)
        aim = (
            math.atan2(ox - now.x, oz - now.z)
            + self._beside(out) / run
            - way * LINED * swift * car.drift_wide / car.turn
        )
        astray = _wrap(aim - now.yaw)
        steer = _unit(astray * car.turn / (swift * (now.lag + QUICK)))
        return steer, abs(astray) < LINED_UP and abs(now.spin) * QUICK < LINED_UP


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
