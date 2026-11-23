"""A racing line through a way along the roads: the smoothest way within reach of its middle, so
every bend is taken as wide as the road gives it room for: in from the outside, by the inside,
out to the outside again.

It's found coarsely and then finer, each of its points put where the line bends there as the mean
of how it bends either side, and held within its reach of the middle. Near whatever throws a kart
into the air (a jump, a crest it's fast enough over) it keeps closer to the middle, where a flight
has room either side to come down in; over a boost pad, to the pad; and round a corner too sharp
for a kart within its reach (two roads meeting on an island), it has what room the turn takes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .map.karts import Driven
from .map.roads import Middle

FINE = 6.0  # metres between the points of the middle the line is held against
# Each spacing the line is worked out at, the coarsest first, and the sweeps over it there. Its
# points are held to the road one by one, so the last is close enough that no stretch between two
# of them cuts across the gap between two roads that meet, inside a corner of the middle.
LEVELS = ((4 * FINE, 150), (2 * FINE, 80), (FINE, 40), (FINE / 2, 20))
TAUT = 0.98  # of the bend its neighbours give it that a point takes: under 1, the line is drawn a little tight
CORNER = 0.5  # radians the middle turns by at one of its points, from which that's a corner
KERB = 0.15  # metres wider the line may go for each metre from what narrows it
NEAR_JUMP = 3  # points of the middle either side of a jump that are as narrow as it
NEAR_PAD = 1  # and of a boost pad
REACH = 14  # points of the middle either side of a line's point that it's held against
SAME_LEVEL = 1.0  # metres up or down within which a stretch of the middle is the same road as another
FLAT = 0.02  # the least a road's slope falls by for there to be a crest


@dataclass(frozen=True, slots=True)
class Shape:
    """How a line may run: metres from the middle it may go (``width``), near a jump or a crest
    (``jump``) and over a boost pad (``pad``); the tightest turn it should ask of a kart, in
    metres (``radius``), and the most it may go from the middle to keep to that round a corner
    (``most``)."""

    width: float
    jump: float
    pad: float
    radius: float
    most: float


@dataclass(frozen=True, slots=True)
class Line:
    """A line's points in the order they're driven: where each is (``x``, ``z``, and the road's
    height there, ``y``), how far along the line (``s``), how it bends there (``k``, 1/m, positive
    turning right), whether a jump begins there (``gap``), and the speed, m/s, at which the road
    falls away from under a kart there (``lift``; infinite where it doesn't)."""

    x: tuple[float, ...]
    y: tuple[float, ...]
    z: tuple[float, ...]
    s: tuple[float, ...]
    k: tuple[float, ...]
    gap: tuple[bool, ...]
    lift: tuple[float, ...]


def racing_line(middle: Middle, shape: Shape, kart: Driven) -> Line:
    """The line a kart that drives as ``kart`` takes along ``middle``."""
    px = [p.x for p in middle.points]
    py = [p.y for p in middle.points]
    pz = [p.z for p in middle.points]
    # The middle, evenly: what the line is held against, each point with where along the map's
    # own points it is.
    mx, mz, mi = _spaced(px, pz, FINE)
    my = [_at(py, i) for i in mi]
    m = len(mx)
    stretch = [min(len(middle.gap) - 1, int(i)) for i in mi]
    jumps = [middle.gap[j] for j in stretch]
    pads = [middle.pad[j] for j in stretch]
    lifts = _lifts(px, py, pz, kart)
    # The stretches a kart at its fastest is thrown into the air from.
    fastest = kart.boosted + 2
    flies = [
        any(lifts[a] < fastest for a in range(math.ceil(mi[max(0, j - 1)]), math.floor(mi[min(m - 1, j + 1)]) + 1))
        for j in range(m)
    ]
    wide = _room(mx, mz, shape)
    for j in range(m):
        for a in range(max(0, j - 10), min(m - 1, j + 10) + 1):
            if jumps[a] or flies[a]:
                wide[j] = min(wide[j], shape.jump + max(0, abs(a - j) - NEAR_JUMP) * FINE * KERB)
            if pads[a]:
                wide[j] = min(wide[j], shape.pad + max(0, abs(a - j) - NEAR_PAD) * FINE * KERB)

    def nearest(x: float, z: float, h: int, reach: int) -> tuple[float, float, float, float]:
        """The point nearest ``(x, z)`` of the middle's stretches within ``reach`` of its point
        ``h``, on that point's level (a deck is no part of the road under it): how far off it is,
        where it is, and where along the middle."""
        best = math.inf
        bx, bz, bj = mx[h], mz[h], float(h)
        for j in range(max(0, h - reach), min(m - 1, h + reach)):
            if abs(j - h) > 2 and abs(my[j] - my[h]) > SAME_LEVEL:
                continue
            ax, az = mx[j], mz[j]
            ux, uz = mx[j + 1] - ax, mz[j + 1] - az
            t = max(0.0, min(1.0, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)))
            cx, cz = ax + ux * t, az + uz * t
            d = math.hypot(x - cx, z - cz)
            if d < best:
                best, bx, bz, bj = d, cx, cz, j + t
        return best, bx, bz, bj

    def hold(x: float, z: float, home: float) -> tuple[float, float, float]:
        """``(x, z)`` held within the line's reach of the middle near ``home`` (a place along it),
        and where along the middle it then is."""
        h = round(home)
        # By its own stretches where it's well within reach of them, which is most of the time.
        best, bx, bz, bj = nearest(x, z, h, 1)
        if best > 0.5 * wide[h]:
            best, bx, bz, bj = nearest(x, z, h, REACH)
        w = min(wide[int(bj)], wide[min(m - 1, int(bj) + 1)])
        if best > w:
            x, z = bx + (x - bx) * w / best, bz + (z - bz) * w / best
        return x, z, bj

    x, z = list(mx), list(mz)
    home = [float(j) for j in range(m)]
    for step, sweeps in LEVELS:
        x, z, places = _spaced(x, z, step)
        home = [_at(home, i) for i in places]
        n = len(x)
        for sweep in range(sweeps):
            for c in range(1, n - 1):
                i = n - 1 - c if sweep % 2 else c
                # Bending here as the mean of how it bends either side (straight past its ends):
                # between its neighbours, and off the line through them by what that bend takes.
                before = _bend(x[i - 2], z[i - 2], x[i - 1], z[i - 1], x[i], z[i]) if i >= 2 else 0.0
                after = _bend(x[i], z[i], x[i + 1], z[i + 1], x[i + 2], z[i + 2]) if i <= n - 3 else 0.0
                ux, uz = x[i + 1] - x[i - 1], z[i + 1] - z[i - 1]
                half = math.hypot(ux, uz) / 2 or 1.0
                off = TAUT * (before + after) / 2 * half * half / 2
                # A turn to the right has the point to the left of the way from the one before it
                # to the one after.
                x[i], z[i], home[i] = hold(
                    (x[i - 1] + x[i + 1]) / 2 - uz / (2 * half) * off,
                    (z[i - 1] + z[i + 1]) / 2 + ux / (2 * half) * off,
                    home[i],
                )
    n = len(x)
    s = [0.0]
    for i in range(1, n):
        s.append(s[-1] + math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]))
    k = [0.0] * n
    for i in range(1, n - 1):
        turned = _wrap(math.atan2(x[i + 1] - x[i], z[i + 1] - z[i]) - math.atan2(x[i] - x[i - 1], z[i] - z[i - 1]))
        k[i] = turned / ((s[i + 1] - s[i - 1]) / 2)
    # The map's points within reach of each point of the line: where the road's slope changes.
    reach = [(_at(mi, max(0.0, h - 0.6)), _at(mi, min(m - 1.0, h + 0.6))) for h in home]
    return Line(
        x=tuple(x),
        y=tuple(_at(my, h) for h in home),
        z=tuple(z),
        s=tuple(s),
        k=tuple(k),
        gap=tuple(jumps[min(m - 1, round(h))] for h in home),
        lift=tuple(
            min((lifts[j] for j in range(math.ceil(lo), math.floor(hi) + 1)), default=math.inf) for lo, hi in reach
        ),
    )


def _lifts(x: list[float], y: list[float], z: list[float], kart: Driven) -> list[float]:
    """The speed at which a kart leaves the ground at each point of a way, infinite where it
    doesn't: where the road gets less steep (a crest, a climb's top), and where a way down
    steepens under it."""

    def fall(a: int, b: int) -> float:
        return (y[a] - y[b]) / (math.hypot(x[b] - x[a], z[b] - z[a]) or 1.0)

    out = [math.inf] * len(x)
    for j in range(1, len(x) - 1):
        before, after = fall(j - 1, j), fall(j, j + 1)
        if after - before <= FLAT:
            continue
        # Coming up or along the level, it's thrown off the crest; already going down, the road
        # has to fall away from under it faster than it's falling.
        out[j] = kart.lift / (after - before) if before <= 0 else max(kart.lift / after, kart.falls / (after - before))
    return out


def _room(mx: list[float], mz: list[float], shape: Shape) -> list[float]:
    """How far from each point of the middle the line may go: its width, and round a corner of the
    middle the room an arc of its radius takes from the outside of the way in, by the inside of
    the corner, to the outside of the way out, for as far either side as that arc runs."""
    m = len(mx)
    room = [shape.width] * m
    for j in range(1, m - 1):
        turn = abs(
            _wrap(math.atan2(mx[j + 1] - mx[j], mz[j + 1] - mz[j]) - math.atan2(mx[j] - mx[j - 1], mz[j] - mz[j - 1]))
        )
        if turn < CORNER:
            continue
        w = min(shape.most, shape.radius * (1 - math.cos(turn / 2)) / 2)
        far = math.ceil((shape.radius + w / math.cos(turn / 2)) * math.sin(turn / 2) / FINE) + 2
        # And narrowing from there as gently as it does toward a jump.
        eased = far + math.ceil(max(0.0, w - shape.width) / (FINE * KERB))
        for a in range(max(0, j - eased), min(m - 1, j + eased) + 1):
            room[a] = max(room[a], w - max(0, abs(a - j) - far) * FINE * KERB)
    return room


def _spaced(x: list[float], z: list[float], step: float) -> tuple[list[float], list[float], list[float]]:
    """A way's points every ``step`` metres along it, its two ends kept, each with where along the
    way's own points it is (2.5: halfway from the third to the fourth)."""
    ox, oz, oi = [x[0]], [z[0]], [0.0]
    need = step
    for i in range(len(x) - 1):
        d = math.hypot(x[i + 1] - x[i], z[i + 1] - z[i])
        gone = 0.0
        while d - gone >= need:
            gone += need
            t = gone / d
            ox.append(x[i] + (x[i + 1] - x[i]) * t)
            oz.append(z[i] + (z[i + 1] - z[i]) * t)
            oi.append(i + t)
            need = step
        need -= d - gone
    last = len(x) - 1
    if math.hypot(x[last] - ox[-1], z[last] - oz[-1]) > step / 2:
        ox.append(x[last])
        oz.append(z[last])
        oi.append(float(last))
    else:
        ox[-1], oz[-1], oi[-1] = x[last], z[last], float(last)
    return ox, oz, oi


def _at(values: list[float], i: float) -> float:
    """A value kept per point, at a place between two of them."""
    a = int(i)
    b = min(len(values) - 1, a + 1)
    return values[a] + (values[b] - values[a]) * (i - a)


def _bend(ax: float, az: float, bx: float, bz: float, cx: float, cz: float) -> float:
    """The curvature of the circle through three points, positive turning right."""
    cross = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz)
    sides = math.hypot(bx - ax, bz - az) * math.hypot(cx - bx, cz - bz) * math.hypot(cx - ax, cz - az)
    return 0.0 if sides < 1e-9 else 2 * cross / sides


def _wrap(angle: float) -> float:
    return math.atan2(math.sin(angle), math.cos(angle))
