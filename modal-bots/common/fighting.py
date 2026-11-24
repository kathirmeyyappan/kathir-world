"""How a fighter fights (``bots/fighter_bot.py``): how good it is, what it's like, what it knows of
each weapon, and its aim.

Two things make a fighter. Its ``Skill`` is how well it does what it does, from a rating of 0 (slow
to notice anyone, slower to bring its aim round, never on the mark for long, stood still while it
shoots) to 1 (quick, steady, hard to hit). Its ``Temper`` is what it does, whatever its skill: the
weapons it carries and which it likes best, how it handles each, and how bold it is, from one that
keeps its distance and shoots from there to one that goes and finds whoever it's after. Both are
drawn from dice, so no two fighters of one rating fight alike, and a fighter is itself every time.

Nothing here misses on purpose. A fighter aims at where it believes its target is, a read a moment
old that it carries on by how they were moving, with a hand that comes round only so fast and
never holds quite still (``Aim``). Someone stood still is hit, and someone who keeps changing
their mind is where it isn't looking: how often is its skill's to say.
"""

from __future__ import annotations

import math
import random
from collections.abc import Mapping, Sequence
from dataclasses import astuple, dataclass

from .controls import MAX_PITCH, TICK_SECONDS
from .map.bodies import EYE_HEIGHT, Hitbox
from .map.ground import Ground
from .map.solids import Solids
from .protocol import Vec3

# How far anyone sees, and how far down a scope (SIGHT and SCOPED_SIGHT in
# packages/shared/src/sim/constants.ts): past it the fog has whoever is there.
SIGHT = 125.0
SCOPED_SIGHT = 560.0


@dataclass(frozen=True, slots=True)
class Arm:
    """A weapon as a fighter knows it (its ItemSpec in packages/shared/src/sim/items.ts), with the
    range it's best used from."""

    reach: float  # metres its shot reaches
    every: int  # ticks between its shots
    cone: float | None  # radians either side of the look that its spray covers; None for a bullet
    scoped: bool  # fires only down its scope, which all but stops whoever looks down it
    near: float  # metres: nearer than this a fighter backs off with it
    far: float  # and further than this it closes in
    chills: bool = False  # leaves whoever it touches chilled a while, at half their walk

    def suits(self, apart: float, chilled: bool, spare: float = 1) -> bool:
        """Whether it's the weapon for someone ``apart`` metres off: they're in its reach, a
        bullet isn't fired from right on top of them, where a spray can't miss and an aim can't
        keep up, and what chills is for someone who isn't chilled yet. With ``spare`` over 1,
        whether it is with that much room to spare, either end."""
        if apart * spare > self.reach or (self.chills and chilled):
            return False
        return self.cone is not None or apart >= self.near / 2 * spare


ARMS: Mapping[str, Arm] = {
    "gun": Arm(reach=20, every=7, cone=None, scoped=False, near=6, far=14),
    "sniper": Arm(reach=1000, every=30, cone=None, scoped=True, near=25, far=70),
    "flamethrower": Arm(reach=20, every=5, cone=math.pi / 8, scoped=False, near=4, far=11),
    "ice-blower": Arm(reach=20, every=5, cone=math.pi / 8, scoped=False, near=5, far=12, chills=True),
}


@dataclass(frozen=True, slots=True)
class Skill:
    """How well a fighter fights."""

    reaction: float  # seconds from someone coming into its sight to its going for them
    lag: float  # seconds old its read of where a target is
    lead: float  # the share of that lag it makes up, carrying a moving target on: 0 none, 1 all
    swing: float  # radians a second its aim comes round at
    slack: float  # radians its aim wanders off the mark, on a target stood still
    idle: float  # seconds, at the most, it lets a weapon that could fire wait
    dodge: float  # how much it moves in a fight: 0 stands and shoots, 1 is never still
    wits: float  # how far it thinks past its aim: the weapon for the range, a heart when it's hurt


# The least skilled a fighter can be, and the most.
WORST = Skill(reaction=0.9, lag=0.3, lead=0.0, swing=2.5, slack=0.1, idle=1.2, dodge=0.0, wits=0.0)
BEST = Skill(reaction=0.2, lag=0.1, lead=0.9, swing=9.0, slack=0.015, idle=0.3, dodge=0.9, wits=1.0)


def skill(rating: float) -> Skill:
    """The skill of a fighter rated ``rating``: 0 the least there is to 1 the most."""
    r = max(0.0, min(1.0, rating))
    return Skill(*(worst * (1 - r) + best * r for worst, best in zip(astuple(WORST), astuple(BEST), strict=True)))


@dataclass(frozen=True, slots=True)
class Temper:
    """What a fighter is like, whatever its skill."""

    arms: tuple[str, ...]  # the weapons it carries, the one it likes best first
    knack: Mapping[str, float]  # how it handles each, about 1: under it steadier, over it wilder
    nerve: float  # 0 keeps its distance and waits, 1 goes and finds whoever it's after
    hops: float  # how much of its moving about in a fight is jumping
    way: int  # the way round a target it would rather circle: 1 or -1


# The kinds of fighter there are, and how often each turns up: the weapons it carries, and the
# least and most nerve it has. Every kind carries a rifle, for someone out of its other weapons'
# reach.
KINDS: Sequence[tuple[float, tuple[str, ...], tuple[float, float]]] = (
    (0.3, ("gun", "sniper"), (0.3, 0.9)),
    (0.2, ("gun", "flamethrower", "sniper"), (0.6, 1.0)),
    (0.2, ("flamethrower", "gun", "sniper"), (0.7, 1.0)),
    (0.15, ("ice-blower", "gun", "sniper"), (0.5, 0.9)),
    (0.15, ("sniper", "gun"), (0.0, 0.35)),
)
KNACK = (0.75, 1.3)  # the least and most a fighter's handling of a weapon scales its aim's slack by


def temper(dice: random.Random) -> Temper:
    """A fighter's temper, by its dice."""
    _, arms, (shy, bold) = dice.choices(KINDS, weights=[kind[0] for kind in KINDS])[0]
    # It handles the weapon it likes best at least as well as anyone handles theirs.
    knack = {arm: dice.uniform(*KNACK) if i else dice.uniform(KNACK[0], 1.0) for i, arm in enumerate(arms)}
    return Temper(arms, knack, dice.uniform(shy, bold), dice.random(), dice.choice((1, -1)))


TURN = 0.4  # the share of what's left to its mark that its aim covers in a tick, its swing allowing
WANDER = 0.35  # seconds over which its aim's wandering comes and goes
# How much more its aim wanders for each radian a second its mark crosses its view at: someone
# running past up close is harder to stay on than someone a long way off.
CROSSING = 0.9
LEVEL = 0.6  # how much of its sideways wander its aim has up and down


class Aim:
    """Where a fighter looks: swung each tick toward its mark, only so fast, and never quite on it."""

    def __init__(self, skill: Skill, dice: random.Random, yaw: float = 0, pitch: float = 0):
        self.skill = skill
        self.dice = dice
        self.yaw = yaw
        self.pitch = pitch
        self._off = (0.0, 0.0)  # how far off the mark it means to be, yaw and pitch: its wander
        self._bearing: float | None = None  # where its mark was last tick, to tell how fast it crosses

    def swing(self, eye: Vec3, mark: Vec3, knack: float = 1, steady: float = 1) -> None:
        """A tick of bringing the look round to ``mark`` from ``eye``, by a hand that's ``knack``
        times as wild as its skill's, ``steady`` times as wild again for how it's held."""
        yaw, pitch = bearing(eye, mark)
        crossing = 0.0 if self._bearing is None else abs(_wrap(yaw - self._bearing)) / TICK_SECONDS
        self._bearing = yaw
        slack = self.skill.slack * knack * steady * (1 + CROSSING * crossing)
        # Its wander drifts back toward the mark and is knocked off it again, a little each tick.
        pull, push = TICK_SECONDS / WANDER, math.sqrt(2 * TICK_SECONDS / WANDER)
        self._off = (
            self._off[0] * (1 - pull) + slack * push * self.dice.gauss(0, 1),
            self._off[1] * (1 - pull) + slack * LEVEL * push * self.dice.gauss(0, 1),
        )
        most = self.skill.swing * TICK_SECONDS
        self.yaw = _wrap(self.yaw + _clamp(_wrap(yaw + self._off[0] - self.yaw) * TURN, most))
        self.pitch = _clamp(self.pitch + _clamp((pitch + self._off[1] - self.pitch) * TURN, most), MAX_PITCH)

    def turn(self, eye: Vec3, toward: Vec3) -> None:
        """A tick of looking round to ``toward`` with nothing to hit there: the way it's walking,
        or where it last saw someone."""
        yaw, pitch = bearing(eye, toward)
        self._bearing = None
        most = self.skill.swing * TICK_SECONDS
        self.yaw = _wrap(self.yaw + _clamp(_wrap(yaw - self.yaw) * TURN, most))
        self.pitch = _clamp(self.pitch + _clamp((pitch - self.pitch) * TURN, most), MAX_PITCH)

    def off(self, eye: Vec3, mark: Vec3) -> float:
        """Radians between where it looks and ``mark``."""
        yaw, pitch = bearing(eye, mark)
        return math.hypot(_wrap(yaw - self.yaw) * math.cos(pitch), pitch - self.pitch)


def believed(seen: Sequence[Mapping[str, Vec3]], who: str, lag: float, lead: float) -> Vec3 | None:
    """Where a fighter believes ``who`` is: where it saw them ``lag`` seconds ago (``seen`` is
    where everyone was at each of the last ticks, the newest last), carried on by ``lead``'s share
    of how they were moving then. Where they are now for someone it hasn't seen that long."""
    ticks = max(1, round(lag / TICK_SECONDS))
    if len(seen) <= ticks + 2 or who not in seen[-1 - ticks] or who not in seen[-3 - ticks]:
        return seen[-1].get(who) if seen else None
    then, before = seen[-1 - ticks][who], seen[-3 - ticks][who]
    on = ticks * lead / 2  # ticks carried on, at the two ticks' travel
    return Vec3(
        then.x + (then.x - before.x) * on,
        then.y + (then.y - before.y) * on,
        then.z + (then.z - before.z) * on,
    )


def vantage(ground: Ground, solids: Solids, spots: Sequence[int], near: Vec3, marks: Sequence[Vec3]) -> int | None:
    """Where to shoot from: of ``spots`` (the ground's), the nearest to ``near`` (an eye point)
    whose own eye point sees one of ``marks``; None where none of them does."""

    def eye(spot: int) -> Vec3:
        node = ground.nodes[spot]
        return Vec3(node.x, node.y + EYE_HEIGHT, node.z)

    def off(spot: int) -> float:
        at = eye(spot)
        return math.dist((at.x, at.y, at.z), (near.x, near.y, near.z))

    return next((spot for spot in sorted(spots, key=off) if any(solids.clear(eye(spot), mark) for mark in marks)), None)


def mark_on(eyes: Vec3, hitbox: Hitbox, height: float) -> Vec3:
    """The spot ``height`` of the way up a body (0 its feet, 1 the top of its head) whose eye
    point is ``eyes``."""
    return Vec3(eyes.x, eyes.y - EYE_HEIGHT + hitbox.top * height, eyes.z)


def bearing(eye: Vec3, at: Vec3) -> tuple[float, float]:
    """The yaw and pitch that look from ``eye`` at ``at``."""
    dx, dy, dz = at.x - eye.x, at.y - eye.y, at.z - eye.z
    return math.atan2(dx, dz), -math.atan2(dy, math.hypot(dx, dz))


def _wrap(angle: float) -> float:
    return (angle + math.pi) % (2 * math.pi) - math.pi


def _clamp(value: float, most: float) -> float:
    return max(-most, min(most, value))
