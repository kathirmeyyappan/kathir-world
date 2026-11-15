"""Builds render/avatars/sahurModel.ts: Tung Tung Tung Sahur as the parts the avatar moves, each a
closed mesh that turns about a joint sunk inside its neighbour, so no pose opens a hole.

    pip install numpy trimesh fast-simplification
    python packages/client/scripts/sahur-model.py [path/to/tungtungtungsahur.stl]

The sculpt (an STL, z up, facing -y, standing on a display base) is a log with a face, its arms a
relief down the log's sides, on two thin legs. Only the log and the legs are taken from it:

  log   the sculpt's own triangles from LOG_FOOT up, less the sectors of its side the arms'
        relief lies in, which are skinned over afresh: the log's radius is read at every level and
        bearing (rays cast out from its axis), those sectors filled in from the bark round them,
        and the gap closed with triangles on that surface. Its foot is closed flat.
  legs  the sculpt's, cut level at LEG_CUT, the sole closed, and the thigh carried on up into the
        log, ending in a dome about the hip.

The rest is drawn here, as tubes of rings along a line: an arm at each shoulder (a ball sunk in the
log's side, a slight elbow, a fist) and the bat, its handle through the left fist, to the sculpt's
proportions. With no STL the log and the legs are read back from the model already written, so
the limbs can be redrawn without the sculpt.

Vertices are written in millimetres relative to each part's pivot, with a cavity shade per vertex
(how deep a crease it sits in: mouth lines, eye sockets, the sides of the nose), base64-encoded.
Skin colour and normals are worked out when the avatar is built, and the eyeballs are the avatar's
own, at EYES.
"""

from __future__ import annotations

import base64
import re
import sys
from pathlib import Path
from typing import Callable, NamedTuple

import numpy as np

HEIGHT = 3.2  # metres, feet to the top of the head
SCULPT_TRIANGLES = 2500  # what the sculpt is thinned to
BASE_TOP = 8.05  # sculpt units: the top of the display base the figure stands on
HIP_Z = 44.5  # sculpt units: the sculpt's faces below this (and not its bat) are its legs
SCULPT_HAND = np.array([-10.5, 5.0, 44.0])  # sculpt units: the hand on the sculpt's bat
SCULPT_BAT_TIP = np.array([-15.0, -22.0, 10.0])
EYES = [np.array([-7.0, 2.4, 104.5]), np.array([7.0, 2.4, 104.5])]  # sculpt units: eyeball centres
EYE_RADIUS = 4.0

# The log, in the avatar's frame (metres, y up, facing +z, its axis x and z 0).
LOG_FOOT = 1.12  # the log's lower rim: under it the sculpt is hands and the tops of the legs
LOG_SIDE_TOP = 3.14  # the highest level the log's side is whole at: its top surface dips this low
ROW = 0.01  # metres between the levels the side's radius is read at
BEARINGS = 180  # readings round the log at each level
# The sectors the arms' relief lies in, degrees round the axis from the front (toward the avatar's
# right), and the level its shoulders reach.
ARM_SECTORS = ((-106.0, -44.0), (32.0, 108.0))
ARM_TOP = 2.08
PATCH_EDGE = 0.1  # metres: the longest edge the skin over a gap in the log's side is drawn with

# The legs.
LEG_CUT = 0.86  # the level the sculpt's legs are cut at: above it they run into its hands and hips
HIP = LOG_FOOT + 0.05  # the hips' level, inside the log: where each leg turns
DOME = (40.0, 70.0)  # degrees up the dome over each hip its rings sit at

# The arms: a line from the shoulder down through the elbow to the fist, in metres from the
# shoulder (y down the arm, z forward), and the tube's radius at points along it. A fist's rings
# are ovals (across, front to back).
SHOULDER_LEVEL = 2.0
SHOULDER_BALL = 0.06  # the radius of the ball at the shoulder
SHOULDER_SINK = 0.035  # metres of it inside the log's side
ARM_CLEAR = 0.012  # metres the hanging arm keeps off the log
ARM_SIDES = 8
ARM_PROFILE: list[tuple[tuple[float, float], float | tuple[float, float]]] = [
    ((0.06, 0.0), 0.0),
    ((0.045, 0.0), 0.04),
    ((0.02, 0.0), 0.056),
    ((0.0, 0.0), SHOULDER_BALL),
    ((-0.035, 0.0), 0.052),
    ((-0.08, -0.004), 0.042),
    ((-0.28, -0.02), 0.039),
    ((-0.44, -0.033), 0.038),
    ((-0.5, -0.036), 0.043),  # the elbow
    ((-0.56, -0.033), 0.037),
    ((-0.76, -0.014), 0.034),
    ((-0.95, 0.0), 0.03),  # the wrist
    ((-0.975, 0.004), (0.048, 0.054)),
    ((-1.03, 0.01), (0.064, 0.074)),  # the fist's middle
    ((-1.075, 0.012), (0.058, 0.066)),
    ((-1.105, 0.012), (0.034, 0.04)),
    ((-1.115, 0.012), 0.0),
]
FIST = (-1.03, 0.01)  # the fist's middle on that line: where it holds

# The bat, held in the left fist: its line from the fist in the avatar's frame, and its radius at
# metres along it from the fist's middle (the knob behind the fist, the handle, the barrel).
BAT_LINE = np.array([-0.12, -0.72, 0.68])
BAT_SIDES = 10
BAT_PROFILE = [
    (-0.125, 0.0),
    (-0.118, 0.045),
    (-0.095, 0.058),
    (-0.075, 0.045),
    (0.0, 0.041),
    (0.3, 0.052),
    (0.5, 0.066),
    (0.7, 0.082),
    (0.9, 0.099),
    (1.03, 0.109),
    (1.11, 0.106),
    (1.16, 0.085),
    (1.185, 0.05),
    (1.19, 0.0),
]

OUT = Path(__file__).resolve().parents[1] / "src/render/avatars/sahurModel.ts"


class Mesh(NamedTuple):
    points: np.ndarray  # (n, 3), metres in the avatar's frame
    faces: np.ndarray  # (m, 3) into them, wound for the model's left-handed frame
    shade: np.ndarray  # (n,) each point's cavity shade, 0 to 1


class Sculpt(NamedTuple):
    trunk: Mesh  # everything of the sculpt but its legs and its bat
    legs: dict[str, Mesh]
    eyes: list[np.ndarray]
    eye_radius: float


def main(stl: str | None) -> None:
    sculpt = from_stl(stl) if stl else from_model()
    log, radius = build_log(sculpt.trunk)
    parts: dict[str, tuple[Mesh, np.ndarray]] = {"log": (log, np.array([0.0, LOG_FOOT, 0.0]))}  # each with its pivot
    fists: dict[str, np.ndarray] = {}
    for name, side in (("armL", -1), ("armR", 1)):
        arm, shoulder, fists[name] = build_arm(radius, side)
        parts[name] = (arm, shoulder)
    bat = sweep(
        [fists["armL"] + unit(BAT_LINE) * along for along, _ in BAT_PROFILE], [r for _, r in BAT_PROFILE], BAT_SIDES
    )
    parts["bat"] = (bat, fists["armL"])
    for name, leg in sculpt.legs.items():
        parts[name] = build_leg(leg)
    emit(parts, fists, sculpt.eyes, sculpt.eye_radius)


def from_stl(stl: str) -> Sculpt:
    """The sculpt in the avatar's frame, with the display base dropped, thinned to SCULPT_TRIANGLES."""
    import fast_simplification
    import trimesh

    mesh = trimesh.load(stl)
    v, f = mesh.vertices, mesh.faces
    mesh = trimesh.Trimesh(v, f[~(v[f][:, :, 2] <= BASE_TOP).all(axis=1)], process=True)
    mesh.remove_unreferenced_vertices()
    v, f = fast_simplification.simplify(
        mesh.vertices.astype(np.float32),
        mesh.faces.astype(np.int64),
        target_reduction=1 - SCULPT_TRIANGLES / len(mesh.faces),
    )
    mesh = trimesh.Trimesh(v, f, process=True)
    v, f = mesh.vertices, mesh.faces
    centroids = v[f].mean(axis=1)

    # The bat: whatever stays joined to its tip once the faces round the gripping hand are set aside.
    near_hand = np.linalg.norm(centroids - SCULPT_HAND, axis=1) < 5
    rest = trimesh.Trimesh(v, f[~near_hand], process=False)
    joined = trimesh.graph.connected_component_labels(rest.face_adjacency, node_count=len(rest.faces))
    tip_face = int(np.argmin(np.linalg.norm(rest.triangles_center - SCULPT_BAT_TIP, axis=1)))
    bat = np.zeros(len(f), bool)
    bat[np.flatnonzero(~near_hand)[joined == joined[tip_face]]] = True
    low = (centroids[:, 2] < HIP_Z) & ~bat

    scale = HEIGHT / (v[:, 2].max() - BASE_TOP)
    centre_y = 15.0  # the log's centre line, front to back, in sculpt units

    def avatar(p: np.ndarray) -> np.ndarray:
        """Sculpt units to avatar metres: y up, facing +z, feet at 0, centred on the log. The
        sculpt's right is -x and the avatar's +x, and mirroring x also swaps right- for left-handed
        axes, so the sculpt's winding already faces out in Babylon's left-handed frame."""
        p = np.atleast_2d(p)
        return np.stack([-p[:, 0], p[:, 2] - BASE_TOP, -(p[:, 1] - centre_y)], axis=1) * scale

    points = avatar(v)
    shade = cavities(points, f)
    legs = {
        "legL": compact(Mesh(points, f[low & (centroids[:, 0] >= 0)], shade)),
        "legR": compact(Mesh(points, f[low & (centroids[:, 0] < 0)], shade)),
    }
    trunk = compact(Mesh(points, f[~bat & ~low], shade))
    return Sculpt(trunk, legs, [avatar(e)[0] for e in EYES], EYE_RADIUS * scale)


def from_model() -> Sculpt:
    """The same from the model already written: its log and its legs."""
    src = OUT.read_text()
    meshes: dict[str, Mesh] = {}
    part = re.compile(
        r"(\w+): \{\s*pivot: \[([^\]]+)\],\s*positions:\s*'([^']+)',\s*indices:\s*'([^']+)',\s*cavity:\s*'([^']+)'"
    )
    for name, pivot, positions, indices, cavity in part.findall(src):
        at = np.array([float(c) for c in pivot.split(",")])
        points = np.frombuffer(base64.b64decode(positions), "<i2").reshape(-1, 3) / 1000 + at
        faces = np.frombuffer(base64.b64decode(indices), "<u2").reshape(-1, 3).astype(np.int64)
        meshes[name] = Mesh(points, faces, np.frombuffer(base64.b64decode(cavity), np.uint8) / 255)
    pair = re.search(r"eyes: \[\s*\[([^\]]+)\],\s*\[([^\]]+)\]", src)
    radius = re.search(r"eyeRadius: ([\d.]+)", src)
    if not pair or not radius:
        raise SystemExit(f"{OUT} has no eyes to read")
    eyes = [np.array([float(c) for c in e.split(",")]) for e in pair.groups()]
    return Sculpt(meshes["log"], {name: meshes[name] for name in ("legL", "legR")}, eyes, float(radius.group(1)))


def build_log(trunk: Mesh) -> tuple[Mesh, np.ndarray]:
    """The log as a closed mesh, and its side's radius by level and bearing (rows ROW apart from
    LOG_FOOT, BEARINGS round) with the arms' relief taken off."""
    levels = np.arange(LOG_FOOT, LOG_SIDE_TOP + ROW / 2, ROW)
    bearings = np.radians(np.arange(BEARINGS) * 360 / BEARINGS - 180)
    out = np.stack([np.sin(bearings), np.zeros(BEARINGS), np.cos(bearings)], axis=1)
    y, b = np.meshgrid(levels, np.arange(BEARINGS), indexing="ij")
    origins = np.stack([np.zeros(y.size), y.ravel(), np.zeros(y.size)], axis=1)
    radius = cast(origins, out[b.ravel()], trunk.points[trunk.faces]).reshape(y.shape)
    if np.isnan(radius).any():
        raise SystemExit("the log's side has a gap: a ray from its axis met nothing")

    # The arms' sectors, filled in from the bark round them: each cell the mean of its neighbours,
    # relaxed until it settles (the surface that bends least between the sectors' edges).
    degrees = np.degrees(bearings)
    arm = (levels[:, None] < ARM_TOP) & in_sectors(degrees)[None]
    for j in np.flatnonzero(arm.any(axis=1)):
        radius[j, arm[j]] = np.interp(degrees[arm[j]], degrees[~arm[j]], radius[j, ~arm[j]])
    for _ in range(4000):
        above = np.vstack([radius[1:], radius[-1:]])
        below = np.vstack([radius[:1], radius[:-1]])
        mean = (np.roll(radius, 1, axis=1) + np.roll(radius, -1, axis=1) + above + below) / 4
        radius[arm] = mean[arm]

    def on_side(degree: float, level: float) -> np.ndarray:
        """The point of the filled-in side at a bearing and a level."""
        row = min(max((level - LOG_FOOT) / ROW, 0), len(levels) - 1)
        column = (degree + 180) * BEARINGS / 360
        j, i = min(int(row), len(levels) - 2), int(np.floor(column))
        v, u = row - j, column - i
        r = (
            radius[j, i % BEARINGS] * (1 - u) * (1 - v)
            + radius[j, (i + 1) % BEARINGS] * u * (1 - v)
            + radius[j + 1, i % BEARINGS] * (1 - u) * v
            + radius[j + 1, (i + 1) % BEARINGS] * u * v
        )
        return np.array([r * np.sin(np.radians(degree)), level, r * np.cos(np.radians(degree))])

    # The sculpt's shell from the foot up (what's left under it, the hollow of its hips, falls
    # away as a piece of its own), less every face that reaches into a sector.
    shell = largest(clip(trunk, LOG_FOOT, above=True))
    at = bearing_of(shell.points)
    inside = in_sectors(at) & (shell.points[:, 1] < ARM_TOP)
    shell = largest(compact(shell._replace(faces=shell.faces[~inside[shell.faces].any(axis=1)])))
    loops = boundary_loops(shell.faces)
    if len(loops) != 1:
        raise SystemExit(f"the log should be open along its foot and the sectors alone: {len(loops)} loops")
    points = list(shell.points)
    shades = list(shell.shade)
    faces = [(int(f[0]), int(f[1]), int(f[2])) for f in shell.faces]

    # The loop runs along the foot's rim and up round each gap the sectors left. The sculpt's
    # faces are big down here, so the gaps' edges are long: each is cut into lengths of PATCH_EDGE
    # at most, its face fanned to the new points, which changes nothing of the face's look and
    # gives the skin over the gap short edges to start from.
    of_edge = {(f[i], f[(i + 1) % 3]): n for n, f in enumerate(faces) for i in range(3)}
    loop = []
    for a, b in zip(loops[0], loops[0][1:] + loops[0][:1]):
        loop.append(a)
        length = float(np.linalg.norm(points[b] - points[a]))
        if length <= PATCH_EDGE or (points[a][1] <= LOG_FOOT + 1e-6 and points[b][1] <= LOG_FOOT + 1e-6):
            continue
        n = of_edge[(a, b)]
        apex = next(k for k in faces[n] if k not in (a, b))
        cuts = int(np.ceil(length / PATCH_EDGE))
        chain = [a]
        for t in np.arange(1, cuts) / cuts:
            chain.append(len(points))
            points.append(points[a] + (points[b] - points[a]) * t)
            shades.append(float(shades[a] + (shades[b] - shades[a]) * t))
        chain.append(b)
        faces[n] = (chain[0], chain[1], apex)
        faces += [(u, v, apex) for u, v in zip(chain[1:], chain[2:])]
        of_edge[(b, apex)] = len(faces) - 1
        loop += chain[1:-1]

    # Each gap's stretch of the loop, closed along the foot, is skinned over.
    on_rim = np.array([points[k][1] <= LOG_FOOT + 1e-6 for k in loop])
    start = next(i for i in range(len(loop)) if on_rim[i] and on_rim[i - 1])
    loop = loop[start:] + loop[:start]
    on_rim = np.concatenate([on_rim[start:], on_rim[:start]])
    rim: list[int] = []
    i = 0
    while i < len(loop):
        rim.append(loop[i])
        if i + 1 < len(loop) and not on_rim[i + 1]:
            end = next(k for k in range(i + 1, len(loop)) if on_rim[k])
            skin, along = patch(points, loop[i : end + 1], on_side)
            faces += skin
            rim += along
            i = end
        else:
            i += 1
    centre = len(points)
    points.append(np.array([0.0, LOG_FOOT, 0.0]))
    down = np.array([0.0, -1.0, 0.0])
    xyz = np.array(points)
    faces += [oriented(xyz, (rim[k], rim[(k + 1) % len(rim)], centre), down) for k in range(len(rim))]
    shade = np.concatenate([shades, np.zeros(len(xyz) - len(shades))])
    return Mesh(xyz, np.array(faces, dtype=np.int64), shade), radius


def in_sectors(degrees: np.ndarray) -> np.ndarray:
    return np.any([(degrees >= a) & (degrees <= b) for a, b in ARM_SECTORS], axis=0)


def bearing_of(p: np.ndarray) -> np.ndarray:
    """Degrees round the log's axis from its front, toward the avatar's right."""
    return np.degrees(np.arctan2(p[..., 0], p[..., 2]))


def patch(
    points: list[np.ndarray], outline: list[int], on_side: Callable[[float, float], np.ndarray]
) -> tuple[list[tuple[int, int, int]], list[int]]:
    """Triangles closing a gap in the log's side with skin on the side `on_side` gives, and the new
    points along the foot, in order. `outline` is the gap's edge, points of `points` from the foot
    up round it and back down to the foot; the foot closes it. Laid flat (distance round the log,
    level) it is cut into triangles between its own points; then the foot is cut into lengths of
    PATCH_EDGE, points PATCH_EDGE apart are set all over the inside, each splitting the triangle
    it lands in, and the edges inside are turned until the triangles are as even as they get. New
    points are added to `points`; the outline's own edges are left whole."""

    def flat(p: np.ndarray) -> np.ndarray:
        return np.array([np.radians(float(bearing_of(p))) * 0.3, p[1]])

    def add(xy: np.ndarray) -> int:
        points.append(on_side(float(np.degrees(xy[0] / 0.3)), float(xy[1])))
        at[len(points) - 1] = xy
        return len(points) - 1

    at = {k: flat(points[k]) for k in outline}
    first, last = outline[0], outline[-1]
    order = outline if polygon_area(np.array([at[k] for k in outline])) > 0 else outline[::-1]
    tris = ears(order, at)

    # The foot, from the outline's first point to its last.
    cuts = max(1, int(np.ceil(abs(at[last][0] - at[first][0]) / PATCH_EDGE)))
    foot = [add(at[first] + (at[last] - at[first]) * t) for t in np.arange(1, cuts) / cuts]
    n = next(k for k, t in enumerate(tris) if first in t and last in t)
    apex = next(k for k in tris[n] if k not in (first, last))
    chain = [first, *foot, last]
    tris[n : n + 1] = [ccw((u, v, apex), at) for u, v in zip(chain, chain[1:])]

    # The inside: a lattice of even triangles' corners, those well clear of the edge.
    edge = np.array([[at[u], at[v]] for u, v in zip(chain + outline[::-1], (chain + outline[::-1])[1:])])
    corners = np.array([at[k] for k in outline])
    low, high = corners.min(axis=0), corners.max(axis=0)
    rise = PATCH_EDGE * np.sqrt(3) / 2
    for row, level in enumerate(np.arange(low[1] + rise * 0.37, high[1], rise)):
        for along in np.arange(low[0] + PATCH_EDGE * (0.29 + 0.5 * (row % 2)), high[0], PATCH_EDGE):
            xy = np.array([along, level])
            if clearance(xy, edge) < PATCH_EDGE * 0.6:
                continue
            n = next((k for k, t in enumerate(tris) if within(xy, at[t[0]], at[t[1]], at[t[2]])), -1)
            if n < 0:
                continue  # outside the outline
            a, b, c = tris[n]
            m = add(xy)
            tris[n : n + 1] = [(a, b, m), (b, c, m), (c, a, m)]
    tris = flipped(tris, at)
    xyz = np.array(points)
    skin = [oriented(xyz, t, xyz[list(t)].mean(axis=0) * np.array([1.0, 0.0, 1.0])) for t in tris]
    return skin, foot


def clearance(xy: np.ndarray, segments: np.ndarray) -> float:
    """The distance from a flat point to the nearest of `segments` (n, 2, 2)."""
    a, b = segments[:, 0], segments[:, 1]
    along = np.clip(((xy - a) * (b - a)).sum(axis=1) / ((b - a) ** 2).sum(axis=1).clip(1e-12), 0, 1)
    return float(np.linalg.norm(a + (b - a) * along[:, None] - xy, axis=1).min())


def ears(order: list[int], at: dict[int, np.ndarray]) -> list[tuple[int, int, int]]:
    """A counter-clockwise loop laid flat, cut into triangles between its own points (ear clipping)."""
    left = list(order)
    tris: list[tuple[int, int, int]] = []
    while len(left) > 3:
        for k in range(len(left)):
            a, b, c = left[k - 1], left[k], left[(k + 1) % len(left)]
            if polygon_area(np.array([at[a], at[b], at[c]])) <= 1e-12:
                continue
            if any(within(at[d], at[a], at[b], at[c]) for d in left if d not in (a, b, c)):
                continue
            tris.append((a, b, c))
            del left[k]
            break
        else:
            raise SystemExit("a sector's outline crosses itself laid flat")
    tris.append((left[0], left[1], left[2]))
    return tris


def flipped(tris: list[tuple[int, int, int]], at: dict[int, np.ndarray]) -> list[tuple[int, int, int]]:
    """The triangles with every edge inside them turned to the other diagonal of its two
    triangles wherever that leaves their smallest angle bigger, until none is."""
    for _ in range(200):
        sides: dict[tuple[int, int], list[int]] = {}
        for n, t in enumerate(tris):
            for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                sides.setdefault((min(a, b), max(a, b)), []).append(n)
        touched: set[int] = set()
        for (a, b), pair in sides.items():
            if len(pair) != 2 or touched & set(pair):
                continue
            c = next(k for k in tris[pair[0]] if k not in (a, b))
            d = next(k for k in tris[pair[1]] if k not in (a, b))
            # Only where the four make a quad that bulges at every corner (the new diagonal has
            # the old one's ends on opposite sides of it), so the turn folds nothing.
            if polygon_area(np.array([at[c], at[d], at[a]])) * polygon_area(np.array([at[c], at[d], at[b]])) >= 0:
                continue
            was = min(sharpest((a, b, c), at), sharpest((a, b, d), at))
            now = min(sharpest((c, d, a), at), sharpest((c, d, b), at))
            if now > was + 1e-9:
                tris[pair[0]], tris[pair[1]] = ccw((c, d, a), at), ccw((c, d, b), at)
                touched |= set(pair)
        if not touched:
            break
    return tris


def sharpest(t: tuple[int, int, int], at: dict[int, np.ndarray]) -> float:
    """The smallest angle of a flat triangle, radians."""
    p = [at[k] for k in t]
    angles = []
    for i in range(3):
        u, v = p[(i + 1) % 3] - p[i], p[(i + 2) % 3] - p[i]
        angles.append(np.arccos(np.clip(u @ v / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-12), -1, 1)))
    return float(min(angles))


def ccw(t: tuple[int, int, int], at: dict[int, np.ndarray]) -> tuple[int, int, int]:
    return t if polygon_area(np.array([at[k] for k in t])) > 0 else (t[0], t[2], t[1])


def polygon_area(xy: np.ndarray) -> float:
    """Signed (shoelace) area: positive counter-clockwise."""
    x, y = xy[:, 0], xy[:, 1]
    return float(0.5 * (x @ np.roll(y, -1) - y @ np.roll(x, -1)))


def within(d: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> bool:
    """Whether `d` is strictly inside the counter-clockwise triangle a, b, c."""
    return all(polygon_area(np.array([u, v, d])) > 1e-12 for u, v in ((a, b), (b, c), (c, a)))


def build_arm(radius: np.ndarray, side: int) -> tuple[Mesh, np.ndarray, np.ndarray]:
    """An arm hanging at the log's side (`side` 1 the avatar's right, -1 its left), leant out as far
    as keeps it ARM_CLEAR off the log all the way down; with its shoulder (the pivot) and the
    middle of its fist."""
    levels = LOG_FOOT + np.arange(len(radius)) * ROW
    column = radius[:, int(round((side * 90 + 180) * BEARINGS / 360)) % BEARINGS]
    out = float(np.interp(SHOULDER_LEVEL, levels, column)) + SHOULDER_BALL - SHOULDER_SINK
    shoulder = np.array([side * out, SHOULDER_LEVEL, 0.0])
    # The lean: at each level the arm passes, far enough out to clear the log there.
    lean = 0.0
    for (down, _), r in ARM_PROFILE:
        level = SHOULDER_LEVEL + down
        if down > -0.1 or level < LOG_FOOT:
            continue
        need = float(np.interp(level, levels, column)) + (r if isinstance(r, float) else r[0]) + ARM_CLEAR
        lean = max(lean, np.arctan2(need - out, -down))
    across = np.array([side * np.cos(lean), np.sin(lean), 0.0])  # out from the log, square to the arm
    along = np.array([side * np.sin(lean), -np.cos(lean), 0.0])  # down the arm
    ahead = np.array([0.0, 0.0, 1.0])

    def place(down: float, forward: float) -> np.ndarray:
        return shoulder + along * -down + ahead * forward

    mesh = sweep([place(d, z) for (d, z), _ in ARM_PROFILE], [r for _, r in ARM_PROFILE], ARM_SIDES, across)
    return mesh, shoulder, place(*FIST)


def build_leg(leg: Mesh) -> tuple[Mesh, np.ndarray]:
    """A leg of the sculpt's as a closed part, and its hip (the pivot): cut level at LEG_CUT, its
    sole closed, and its thigh run on straight up (as good as its line in the sculpt) to a dome
    about the hip, inside the log."""
    leg = largest(clip(leg, LEG_CUT, above=False))
    points = leg.points
    loops = boundary_loops(leg.faces)
    cut = [loop for loop in loops if np.allclose(points[loop][:, 1], LEG_CUT, atol=1e-6)]
    soles = [loop for loop in loops if points[loop][:, 1].max() < 0.2]  # none on a leg closed before
    if len(cut) != 1 or len(soles) > 1 or len(loops) != 1 + len(soles):
        raise SystemExit(f"a leg should be open at its cut and its sole alone: {len(loops)} loops")
    loop = cut[0]
    centre = points[loop].mean(axis=0)
    up = np.array([0.0, 1.0, 0.0])
    hip = centre + up * (HIP - LEG_CUT)
    spokes = points[loop] - centre
    reach = float(np.linalg.norm(spokes, axis=1).mean())

    new: list[np.ndarray] = []
    added: list[tuple[int, int, int]] = []
    count = len(points)

    def ring(xyz: np.ndarray) -> list[int]:
        nonlocal count
        new.append(xyz)
        ids = list(range(count, count + len(xyz)))
        count += len(xyz)
        return ids

    rings = [list(loop), ring(hip + spokes)]
    rings += [ring(hip + spokes * np.cos(np.radians(a)) + up * reach * np.sin(np.radians(a))) for a in DOME]
    top = ring((hip + up * reach)[None])[0]
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            added += [(a[i], a[j], b[j]), (a[i], b[j], b[i])]
    added += [(rings[-1][i], rings[-1][(i + 1) % len(loop)], top) for i in range(len(loop))]
    closing: list[tuple[int, int, int]] = []
    for sole in soles:
        under = ring(points[sole].mean(axis=0)[None])[0]
        closing += [(sole[i], sole[(i + 1) % len(sole)], under) for i in range(len(sole))]

    points = np.vstack([points, *new])
    # Each new face wound to look away from the thigh's line (from a point of it a little under
    # the face, so the dome's faces over the line's end do too), the sole's down.
    fixed = []
    for t in added:
        middle = points[list(t)].mean(axis=0)
        fixed.append(oriented(points, t, middle - np.array([centre[0], middle[1] - 0.03, centre[2]])))
    fixed += [oriented(points, t, -up) for t in closing]
    faces = np.vstack([leg.faces, np.array(fixed, dtype=np.int64)])
    return Mesh(points, faces, np.concatenate([leg.shade, np.zeros(len(points) - len(leg.shade))])), hip


def cast(origins: np.ndarray, directions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """The distance along each ray to the farthest triangle it crosses, from either side; nan
    where it crosses none."""
    a = triangles[:, 0]
    e1 = triangles[:, 1] - a
    e2 = triangles[:, 2] - a
    out = np.full(len(origins), np.nan)
    for s in range(0, len(origins), 256):
        o = origins[s : s + 256, None, :]
        d = directions[s : s + 256, None, :]
        p = np.cross(d, e2[None])
        det = (e1[None] * p).sum(axis=-1)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        t = o - a[None]
        u = (t * p).sum(axis=-1) * inv
        q = np.cross(t, e1[None])
        v = (d * q).sum(axis=-1) * inv
        dist = (e2[None] * q).sum(axis=-1) * inv
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (dist > 1e-6)
        best = np.where(hit, dist, -np.inf).max(axis=1)
        out[s : s + 256] = np.where(np.isfinite(best), best, np.nan)
    return out


def sweep(
    line: list[np.ndarray],
    radii: list[float | tuple[float, float]],
    sides: int,
    across: np.ndarray = np.array([1.0, 0.0, 0.0]),
) -> Mesh:
    """A closed tube of rings round the points of `line`, each square to the line there: `radii`
    its radius at each, or (along `across`, square to it) for an oval, 0 for an end."""
    centres = np.array(line)
    points: list[np.ndarray] = []
    rings: list[np.ndarray] = []
    count = 0
    for i, (c, r) in enumerate(zip(centres, radii)):
        heading = unit(centres[min(i + 1, len(centres) - 1)] - centres[max(i - 1, 0)])
        u = unit(across - heading * float(across @ heading))
        v = np.cross(heading, u)
        ru, rv = (r, r) if isinstance(r, (int, float)) else r
        if ru == 0:
            ring = c[None]
        else:
            turn = np.arange(sides) * 2 * np.pi / sides
            ring = c + ru * np.cos(turn)[:, None] * u + rv * np.sin(turn)[:, None] * v
        points.append(ring)
        rings.append(np.arange(count, count + len(ring)))
        count += len(ring)
    # Triangles between each ring and the next, fanned to an end's one point, all wound alike;
    # then all turned to face out, the way the first on the tube's side looks away from the line.
    faces: list[tuple[int, int, int]] = []
    for a, b in zip(rings, rings[1:]):
        n = max(len(a), len(b))
        for i in range(n):
            j = (i + 1) % n
            if len(a) == 1:
                faces.append((int(a[0]), int(b[j]), int(b[i])))
            elif len(b) == 1:
                faces.append((int(a[i]), int(a[j]), int(b[0])))
            else:
                faces += [(int(a[i]), int(a[j]), int(b[j])), (int(a[i]), int(b[j]), int(b[i]))]
    xyz = np.vstack(points)
    wound = np.array(faces, dtype=np.int64)
    p, q, r3 = xyz[wound[sides]]
    if float(np.cross(q - p, r3 - p) @ ((p + q + r3) / 3 - centres[1])) > 0:
        wound = wound[:, [0, 2, 1]]
    return Mesh(xyz, wound, np.zeros(len(xyz)))


def clip(mesh: Mesh, level: float, above: bool) -> Mesh:
    """The mesh above (or below) `level`: faces that cross it are cut along it, sharing the new
    points, whose shades are read off the edges they're on. A point on the level is neither side
    of it, so a mesh already cut there comes back as it is, less whatever lay in the level."""
    points, faces, shade = mesh
    height = (points[:, 1] - level) * (1 if above else -1)
    side = np.where(np.abs(height) < 1e-6, 0, np.sign(height)).astype(int)  # 1 kept, -1 not, 0 on the level
    new: list[np.ndarray] = []
    shades: list[float] = []
    made: dict[tuple[int, int], int] = {}

    def cut(a: int, b: int) -> int:
        key = (min(a, b), max(a, b))
        if key not in made:
            t = (level - points[a, 1]) / (points[b, 1] - points[a, 1])
            p = points[a] + (points[b] - points[a]) * t
            p[1] = level
            made[key] = len(points) + len(new)
            new.append(p)
            shades.append(float(shade[a] + (shade[b] - shade[a]) * t))
        return made[key]

    kept: list[tuple[int, int, int]] = []
    for face in faces:
        if not (side[face] > 0).any():
            continue
        # The face's corners on the kept side or the level, with a new point wherever an edge
        # crosses: three or four of them, in the face's order.
        ring: list[int] = []
        for i in range(3):
            a, b = int(face[i]), int(face[(i + 1) % 3])
            if side[a] >= 0:
                ring.append(a)
            if side[a] * side[b] < 0:
                ring.append(cut(a, b))
        kept += [(ring[0], ring[i], ring[i + 1]) for i in range(1, len(ring) - 1)]
    return compact(
        Mesh(
            np.vstack([points, *new]) if new else points,
            np.array(kept, dtype=np.int64),
            np.concatenate([shade, shades]),
        )
    )


def compact(mesh: Mesh) -> Mesh:
    """The mesh with only the points its faces use."""
    used, inverse = np.unique(mesh.faces, return_inverse=True)
    return Mesh(mesh.points[used], inverse.reshape(-1, 3), mesh.shade[used])


def largest(mesh: Mesh) -> Mesh:
    """The biggest piece of the mesh that hangs together by its points."""
    faces = mesh.faces
    label = np.arange(len(mesh.points))
    while True:
        before = label.copy()
        np.minimum.at(label, faces.ravel(), np.repeat(label[faces].min(axis=1), 3))
        label = label[label]
        if (label == before).all():
            break
    of_face = label[faces[:, 0]]
    names, sizes = np.unique(of_face, return_counts=True)
    return compact(mesh._replace(faces=faces[of_face == names[np.argmax(sizes)]]))


def boundary_loops(faces: np.ndarray) -> list[list[int]]:
    """The open edges of the mesh (those with a face on one side only) chained into loops of
    points, each running the way its faces wind."""
    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    _, inverse, counts = np.unique(np.sort(edges, axis=1), axis=0, return_inverse=True, return_counts=True)
    onward = {int(a): int(b) for a, b in edges[counts[inverse.ravel()] == 1]}
    loops: list[list[int]] = []
    while onward:
        start = next(iter(onward))
        loop = [start]
        at = onward.pop(start)
        while at != start:
            loop.append(at)
            at = onward.pop(at)
        loops.append(loop)
    return loops


def oriented(points: np.ndarray, tri: tuple[int, int, int], direction: np.ndarray) -> tuple[int, int, int]:
    """`tri` wound to face along `direction`. The model's frame is left-handed, so a face reads
    outward where its cross product points in."""
    a, b, c = points[list(tri)]
    return tri if float(np.cross(b - a, c - a) @ direction) < 0 else (tri[0], tri[2], tri[1])


def unit(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def cavities(points: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """0 to 1 per point: how much its neighbours rise above its tangent plane, i.e. how deep a crease
    it sits in. Flat and bulging surface is 0."""
    import trimesh

    solid = trimesh.Trimesh(points, faces[:, [0, 2, 1]], process=False)  # wound as trimesh reads outward
    normals = solid.vertex_normals
    out = np.zeros(len(points))
    for i, neighbours in enumerate(solid.vertex_neighbors):
        if not neighbours:
            continue
        d = points[neighbours] - points[i]
        lengths = np.linalg.norm(d, axis=1) + 1e-9
        out[i] = np.mean((d @ normals[i]) / lengths)
    return np.clip(out / 0.35, 0, 1)


def emit(
    parts: dict[str, tuple[Mesh, np.ndarray]],
    fists: dict[str, np.ndarray],
    eyes: list[np.ndarray],
    eye_radius: float,
) -> None:
    """Writes the model: each part's points relative to its pivot."""

    def xyz(p: np.ndarray) -> str:
        return "[" + ", ".join(f"{c:.4f}" for c in p) + "]"

    lines = [
        "// Generated by packages/client/scripts/sahur-model.py from a sculpt of Tung Tung Tung Sahur; don't edit.",
        "// Each part: vertices in millimetres relative to its pivot (Int16 x, y, z), triangles (Uint16),",
        "// both base64. Pivots, the fists and the eyes are in metres in the avatar's frame (feet at 0, facing +z),",
        "// and `bat` is the way the bat points from the left fist there.",
        "export const SAHUR_MODEL = {",
        f"  height: {HEIGHT},",
        f"  fists: {{ left: {xyz(fists['armL'])}, right: {xyz(fists['armR'])} }},",
        f"  bat: {xyz(unit(BAT_LINE))},",
        f"  eyes: [{', '.join(xyz(e) for e in eyes)}],",
        f"  eyeRadius: {eye_radius:.4f},",
        "  parts: {",
    ]
    total = 0
    for name, (mesh, pivot) in parts.items():
        positions = np.round((mesh.points - pivot) * 1000).astype("<i2")
        shades = np.round(mesh.shade * 255).astype(np.uint8)
        lines += [
            f"    {name}: {{",
            f"      pivot: {xyz(pivot)},",
            f"      positions: '{base64.b64encode(positions.tobytes()).decode()}',",
            f"      indices: '{base64.b64encode(mesh.faces.astype('<u2').tobytes()).decode()}',",
            f"      cavity: '{base64.b64encode(shades.tobytes()).decode()}',",
            "    },",
        ]
        total += len(mesh.faces)
        open_loops = len(boundary_loops(mesh.faces))
        print(f"{name}: {len(mesh.faces)} triangles, {len(mesh.points)} vertices, {open_loops} open loops")
    lines += ["  },", "} as const;", ""]
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {total} triangles)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
