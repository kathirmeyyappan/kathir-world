"""Builds a kart's model for the client (render/vehicles/) from rips of a Mario Kart 8 kart body and
of a set of its tires, each unpacked into a folder:

    pip install numpy pillow fast_simplification
    python packages/client/scripts/kart-model.py standard "path/to/Standard Kart" "path/to/Standard & Blue Standard"

A body rip is the body as an OBJ (<name>.obj, MK8's units scaled by OBJ_UNIT, y up, the nose along
+z): the body itself (material `m_Body`), its steering wheel among its pieces, and the emblem decal
on its nose (`m_Body.002`); with its albedo once for each driver (bodyk_*_<driver>_alb.png), alike
but for the two colours it's painted in, and the drivers' emblems (Emblems/<Name>.png). A tire rip
is its tires as Collada files in MK8's own units, the kart's four in TireK_<set>.dae (each a mesh
with its axle along x), with their albedo (Tire_<set>_Alb.png).

It writes, in public/assets/models/kart-<id>/, the parts in the client's format (house_mesh.py
`emit_part`): `body`, `steer` (the steering wheel, which turns), `emblem` and one `tire`, all
simplified to what reads at a kart's size; and their textures, the body's once with its two
painted colours left white (`body.png`) and where they go (`paint.png`, red the first and green
the second), so the client paints it in any driver's colours from one picture. And it writes
render/vehicles/<id>KartModel.ts: what the client needs to put it together and drive it (where
each tire stands, the wheel's middle, the axis it turns round and the grips on it, the seat and
where a driver's right foot rests) and
each driver's paint, and prints the box the sim drives it as, for its row in KARTS
(sim/vehicles/karts.ts).

The kart is sized against its drivers as MK8 sizes it, and then a tenth bigger (ROOM), so Mario
sits in it with room: MK8_METRES is the scale that stands MK8's Mario his 2 m (jointed-model.py).
The sim grows it further for a driver bigger than that (sim/vehicles/karts.ts `sizeFor`). Its frame
is the game's: x to its right, y up, z ahead, the middle of its footprint at the origin on the
ground its tires stand on.
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from glb import decimate
from house_mesh import MIRROR, MeshBuilder, emit_part
from PIL import Image

CLIENT = Path(__file__).resolve().parents[1]
NS = "{http://www.collada.org/2005/11/COLLADASchema}"

MK8_METRES = 2.0 / 15.42  # MK8's Mario, 15.42 of its units tall, stood 2 m (jointed-model.py)
# The kart written out this much bigger than MK8 builds it against Mario, so he sits in it with
# room. Everything is found on it at MK8's size, which the thresholds here are in metres of.
ROOM = 1.1
OBJ_UNIT = 0.127  # an OBJ rip's units, in MK8's
BODY_TEXTURE = 512  # px: the body's picture and its paint, each side
EMBLEM_TEXTURE = 64  # px: an emblem's picture, each side
TIRE_KEEP = 0.5  # of a tire's triangles kept: a tread's bevels are lost at its size
PAINT_DIFFERS = 24  # 0-255: a pixel some driver's albedo has this far from another's is painted
FEET_APART = 0.19  # metres each foot rests out from the middle line: on its pedal, where there are pedals
FOOT_ROOM = 0.25  # metres over the floor a foot needs: the feet go forward as far as that's clear

# The drivers whose own paint and emblem a kart they drop wears (their albedo's and emblem's
# names); anyone else's wears the first's.
DRIVERS = {
    "mario": ("mro", "Mario"),
    "luigi": ("lig", "Luigi"),
    "wario": ("wro", "Wario"),
    "waluigi": ("wlg", "Waluigi"),
    "peach": ("pch", "Peach"),
    "daisy": ("dsy", "Daisy"),
}


def read_obj(path: Path) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """An OBJ's triangles by material: each one's corners' positions and texture coordinates (v
    down the image), three a triangle."""
    positions, uvs = [], []
    by_material: dict[str, tuple[list, list]] = {}
    material = ""
    for line in path.read_text().splitlines():
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            positions.append([float(x) for x in p[1:4]])
        elif p[0] == "vt":
            uvs.append([float(p[1]), 1 - float(p[2])])
        elif p[0] == "usemtl":
            material = p[1]
        elif p[0] == "f":
            corners = [c.split("/") for c in p[1:]]
            pos, uv = by_material.setdefault(material, ([], []))
            for i in range(1, len(corners) - 1):
                for c in (corners[0], corners[i], corners[i + 1]):
                    pos.append(positions[int(c[0]) - 1])
                    uv.append(uvs[int(c[1]) - 1])
    return {m: (np.array(pos) / OBJ_UNIT * MK8_METRES, np.array(uv)) for m, (pos, uv) in by_material.items()}


def geometries(path: Path) -> list[str]:
    """The names of a Collada file's meshes."""
    return [g.get("name") or "" for g in ET.parse(path).getroot().iter(f"{NS}geometry")]


def read_collada(path: Path, name: str) -> tuple[np.ndarray, np.ndarray]:
    """A Collada mesh's triangles (its own material's, not a layer over it), positions in metres
    and texture coordinates (v down the image), three corners a triangle."""
    doc = ET.parse(path).getroot()
    geometry = next(g for g in doc.iter(f"{NS}geometry") if g.get("name") == name)
    mesh = geometry.find(f"{NS}mesh")
    assert mesh is not None
    sources = {s.get("id"): s for s in mesh.findall(f"{NS}source")}
    floats = lambda s: np.array([float(x) for x in (s.findtext(f"{NS}float_array") or "").split()])
    vertices = mesh.find(f"{NS}vertices/{NS}input[@semantic='POSITION']")
    assert vertices is not None
    positions = floats(sources[(vertices.get("source") or "")[1:]]).reshape(-1, 3)
    pos, uv = [], []
    for triangles in mesh.findall(f"{NS}triangles"):
        inputs = triangles.findall(f"{NS}input")
        stride = max(int(i.get("offset") or 0) for i in inputs) + 1
        at = {i.get("semantic"): i for i in inputs}
        coords = floats(sources[(at["TEXCOORD"].get("source") or "")[1:]]).reshape(-1, 2)
        corners = np.array([int(x) for x in (triangles.findtext(f"{NS}p") or "").split()]).reshape(-1, stride)
        pos.append(positions[corners[:, int(at["VERTEX"].get("offset") or 0)]])
        uv.append(coords[corners[:, int(at["TEXCOORD"].get("offset") or 0)]] * [1, -1] + [0, 1])
    return np.concatenate(pos) * MK8_METRES, np.concatenate(uv)


def pieces(pos: np.ndarray) -> list[np.ndarray]:
    """The triangles (by index) of each piece of a triangle soup: those sharing a corner's spot."""
    spots, corner = np.unique(np.round(pos, 5), axis=0, return_inverse=True)
    corner = corner.ravel().reshape(-1, 3)
    parent = np.arange(len(spots))

    def root(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b, c in corner:
        for x in (b, c):
            ra, rx = root(a), root(x)
            if ra != rx:
                parent[ra] = rx
    roots = np.array([root(a) for a, _, _ in corner])
    return [np.flatnonzero(roots == r) for r in np.unique(roots)]


def steering_wheel(pos: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """The steering wheel among a body's pieces: the biggest ring (a piece whose corners all lie
    about one distance from its middle, across a plane), with every piece wholly inside it (its
    hub and spokes). Returns their triangles, its middle, the axis it turns round (its plane's
    normal, toward the driver: up and back) and its rim's radius."""
    best = None
    for tris in pieces(pos):
        p = pos[np.repeat(tris * 3, 3) + np.tile([0, 1, 2], len(tris))]
        middle = p.mean(axis=0)
        _, spread, axes = np.linalg.svd(p - middle)
        normal = axes[2]
        flat = (p - middle) - np.outer((p - middle) @ normal, normal)
        radius = np.linalg.norm(flat, axis=1)
        ring = spread[2] < 0.25 * spread[1] and radius.min() > 0.6 * radius.max() and len(tris) > 20
        if ring and (best is None or radius.max() > best[3]):
            best = (tris, middle, normal, float(radius.max()))
    assert best is not None, "no steering wheel among the body's pieces"
    ring, middle, normal, radius = best
    inside = [
        tris
        for tris in pieces(pos)
        if np.linalg.norm(pos[np.repeat(tris * 3, 3) + np.tile([0, 1, 2], len(tris))] - middle, axis=1).max() < radius
    ]
    if normal[1] < 0:
        normal = -normal
    return np.concatenate([ring, *inside]), middle, normal, radius


def triangles(pos: np.ndarray, uv: np.ndarray, which: np.ndarray | None = None) -> MeshBuilder:
    """A part of these triangles (all, or `which`), in the game's frame (emit_part mirrors it)."""
    mesh = MeshBuilder()
    for t in range(len(pos) // 3) if which is None else which:
        mesh.add([[(pos[3 * t + k] * MIRROR, uv[3 * t + k]) for k in range(3)]])
    return mesh


def simplified(pos: np.ndarray, uv: np.ndarray, keep: float) -> tuple[np.ndarray, np.ndarray]:
    """A triangle soup thinned to `keep` of its triangles (glb.py `decimate`)."""
    spots, corner = np.unique(np.concatenate([np.round(pos, 5), np.round(uv, 5)], axis=1), axis=0, return_inverse=True)
    part = {
        "positions": spots[:, :3],
        "uvs": spots[:, 3:],
        "normals": np.zeros((len(spots), 3)),
        "bones": np.ones((len(spots), 1)),
        "triangles": corner.ravel().reshape(-1, 3),
    }
    decimate(part, keep)
    flat = part["triangles"].ravel()
    return part["positions"][flat], part["uvs"][flat]


def paint(albedos: dict[str, Image.Image], out: Path) -> dict[str, tuple[str, str]]:
    """The body's picture with its two painted colours left white, and where they go: a pixel any
    driver's albedo has otherwise than another's is painted, the first colour where it's nearer the
    first driver's first colour than their second. Returns each driver's two colours."""
    arrays = {
        d: np.asarray(a.convert("RGB").resize((BODY_TEXTURE,) * 2, Image.Resampling.LANCZOS), float)
        for d, a in albedos.items()
    }
    stack = np.stack(list(arrays.values()))
    painted = (stack.max(axis=0) - stack.min(axis=0)).max(axis=2) > PAINT_DIFFERS
    first = arrays[next(iter(arrays))]
    # The first driver's two colours: the two most common among its painted pixels, far apart.
    colours, counts = np.unique((first[painted] // 16).astype(int), axis=0, return_counts=True)
    order = colours[np.argsort(-counts)] * 16 + 8
    one = order[0]
    two = next(c for c in order[1:] if np.abs(c - one).max() > 64)
    primary = painted & (np.linalg.norm(first - one, axis=2) < np.linalg.norm(first - two, axis=2))
    secondary = painted & ~primary
    hexes = {}
    for driver, a in arrays.items():
        c1, c2 = np.median(a[primary], axis=0), np.median(a[secondary], axis=0)
        hexes[driver] = tuple("#" + "".join(f"{int(v):02x}" for v in c) for c in (c1, c2))
    # White where painted, as light as the first driver's colour there is against its median.
    base = first.copy()
    for mask, colour in (
        (primary, np.median(first[primary], axis=0)),
        (secondary, np.median(first[secondary], axis=0)),
    ):
        base[mask] = np.clip(first[mask] / np.maximum(colour, 1), 0, 1) * 255
    Image.fromarray(base.astype(np.uint8)).save(out / "body.png", optimize=True)
    where = np.zeros((*primary.shape, 3), np.uint8)
    where[primary, 0] = 255
    where[secondary, 1] = 255
    Image.fromarray(where).save(out / "paint.png", optimize=True)
    return hexes  # type: ignore[return-value]


def main(kart_id: str, body_dir: Path, tire_dir: Path) -> None:
    out = CLIENT / "public" / "assets" / "models" / f"kart-{kart_id}"
    out.mkdir(parents=True, exist_ok=True)
    parts = read_obj(next(body_dir.glob("*.obj")))
    body_pos, body_uv = parts["m_Body"]
    emblem_pos, emblem_uv = parts["m_Body.002"]
    tires_dae = next(tire_dir.glob("TireK_*.dae"))
    tire_set = tires_dae.stem.removeprefix("TireK_")
    tire_pos, tire_uv = read_collada(tires_dae, next(n for n in geometries(tires_dae) if n.endswith("LF__m_Tire")))

    # The body's frame: its tires as MK8 makes them, each centred along it on its axle's hub (the
    # biggest round piece at its end, square to x) with its outer face flush with the body's side,
    # on the edge of its wells, and all four on the ground with their axles level with the hubs as
    # near as they all can be; the middle of its length over the origin.
    tire_middle = (tire_pos.min(axis=0) + tire_pos.max(axis=0)) / 2
    tire_pos = tire_pos - tire_middle
    tire_radius = float(tire_pos[:, 1].max())
    tire_width = float(tire_pos[:, 0].max() - tire_pos[:, 0].min())
    hubs = axle_hubs(body_pos)
    wheel, middle, axis, radius = steering_wheel(body_pos)
    rest = np.setdiff1d(np.arange(len(body_pos) // 3), wheel)
    ground = float(np.mean([h[1] for h in hubs.values()])) - tire_radius
    lo, hi = body_pos.min(axis=0), body_pos.max(axis=0)
    shift = np.array([0, -ground, -(lo[2] + hi[2]) / 2])
    body_pos = body_pos + shift
    emblem_pos = emblem_pos + shift
    middle = middle + shift
    across = np.array([1.0, 0, 0])
    grips = [middle - across * radius, middle + across * radius]
    seat = seat_of(body_pos, rest)
    feet = feet_of(body_pos, rest, middle)

    emit_part(out / "body.bin", triangles(body_pos * ROOM, body_uv, rest), {})
    emit_part(out / "steer.bin", triangles((body_pos - middle) * ROOM, body_uv, wheel), {})
    emit_part(out / "emblem.bin", triangles(emblem_pos * ROOM, emblem_uv), {})
    tire_pos, tire_uv = simplified(tire_pos, tire_uv, TIRE_KEEP)
    emit_part(out / "tire.bin", triangles(tire_pos * ROOM, tire_uv), {})

    albedos = {d: Image.open(next(body_dir.glob(f"bodyk_*_{code}_alb.png"))) for d, (code, _) in DRIVERS.items()}
    colours = paint(albedos, out)
    for driver, (_, name) in DRIVERS.items():
        emblem = Image.open(body_dir / "Emblems" / f"{name}.png").convert("RGBA")
        emblem.resize((EMBLEM_TEXTURE,) * 2, Image.Resampling.LANCZOS).save(out / f"emblem-{driver}.png", optimize=True)
    Image.open(tire_dir / f"Tire_{tire_set}_Alb.png").convert("RGB").save(out / "tire.png", optimize=True)

    side = float(hi[0])  # the body's side: it's even about the middle
    tires = [
        (np.array([s * (side - tire_width / 2), tire_radius, hub[2] + shift[2]]), end == "front")
        for (end, s), hub in sorted(hubs.items())
    ]
    width = 2 * side
    length = float(hi[2] - lo[2])
    height = float((body_pos[:, 1]).max())
    # In the game's frame, as written out: a point (a way, unscaled) and a length.
    game = lambda v: [round(float(x), 3) for x in v * MIRROR * ROOM]
    way = lambda v: [round(float(x), 3) for x in v * MIRROR]
    metres = lambda x: f"{x * ROOM:.3f}"
    lines = [
        f"// Generated by scripts/kart-model.py from the {kart_id} kart's rip of Mario Kart 8; don't edit.",
        "import type { KartModel } from './kartModel';",
        "",
        f"export const {kart_id.upper()}_KART: KartModel = {{",
        f"  folder: 'kart-{kart_id}',",
        f"  steer: {{ at: {game(middle)}, axis: {way(axis)}, radius: {metres(radius)} }},",
        "  grips: [",
        f"    {game(grips[1])},",
        f"    {game(grips[0])},",
        "  ],",
        f"  seat: {game(seat)},",
        f"  feet: {game(feet)},",
        f"  tire: {{ radius: {metres(tire_radius)}, width: {metres(tire_width)} }},",
        "  tires: [",
        *[f"    {{ at: {game(at)}, front: {'true' if front else 'false'} }}," for at, front in tires],
        "  ],",
        "  paints: {",
        *[f"    {d}: {{ colours: ['{c1}', '{c2}'], emblem: '{d}' }}," for d, (c1, c2) in colours.items()],
        "  },",
        "};",
        "",
    ]
    model_ts = CLIENT / "src" / "render" / "vehicles" / f"{kart_id}KartModel.ts"
    model_ts.write_text("\n".join(lines))
    print(f"wrote {model_ts}")
    print(
        f"its row's body in KARTS: {{ width: {width * ROOM:.2f}, length: {length * ROOM:.2f}, "
        f"height: {height * ROOM:.2f}, seat: {{ y: {seat[1] * ROOM:.2f}, z: {seat[2] * ROOM:.2f} }} }}"
    )


def axle_hubs(pos: np.ndarray) -> dict[tuple[str, int], np.ndarray]:
    """The middle of the outer face of each of the body's axle hubs, by its end ('front' or 'rear')
    and side (-1, +1 in x): the round pieces square to x on one side of the middle, the biggest at
    each end each side."""
    found: dict[tuple[str, int], tuple[float, np.ndarray]] = {}
    for tris in pieces(pos):
        p = pos[np.repeat(tris * 3, 3) + np.tile([0, 1, 2], len(tris))]
        lo, hi = p.min(axis=0), p.max(axis=0)
        size = hi - lo
        if size[0] > 1.5 * min(size[1], size[2]) or abs(size[1] - size[2]) > 0.3 * size[1] or len(tris) < 12:
            continue
        if lo[0] < 0 < hi[0]:
            continue
        middle = (lo + hi) / 2
        side = 1 if middle[0] > 0 else -1
        end = "front" if middle[2] > pos[:, 2].mean() else "rear"
        face = np.array([hi[0] if side > 0 else lo[0], middle[1], middle[2]])
        if (end, side) not in found or size[1] > found[(end, side)][0]:
            found[(end, side)] = (float(size[1]), face)
    assert len(found) == 4, f"found {len(found)} axle hubs, not 4"
    return {k: v for k, (_, v) in found.items()}


def seat_of(pos: np.ndarray, which: np.ndarray) -> np.ndarray:
    """Where a driver sits: the middle of the biggest piece's lowest wide upward face behind the
    steering wheel, the seat's cushion, by area."""
    a, b, c = pos[3 * which], pos[3 * which + 1], pos[3 * which + 2]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1) / 2
    up = (n[:, 1] / np.maximum(2 * area, 1e-12)) > 0.85
    middle = (a + b + c) / 3
    near = up & (np.abs(middle[:, 0]) < 0.25) & (middle[:, 2] < 0.2) & (middle[:, 2] > -0.6) & (middle[:, 1] > 0.15)
    assert near.any(), "no seat cushion"
    seat = (middle[near] * area[near, None]).sum(axis=0) / area[near].sum()
    return np.array([0, seat[1], seat[2]])  # on the middle line, as the body is even about it


def feet_of(pos: np.ndarray, which: np.ndarray, wheel: np.ndarray) -> np.ndarray:
    """Where a driver's right foot rests (the left's is across the middle line from it): on the
    floor, FEET_APART out from the middle, from under the steering `wheel`'s middle as far forward
    as FOOT_ROOM over the floor is clear: up against its pedal, or under the nose. The floor is the
    highest upward face a line down from the wheel crosses there; what stops the foot, any face a
    line up from the floor crosses lower than FOOT_ROOM."""
    a, b, c = pos[3 * which], pos[3 * which + 1], pos[3 * which + 2]
    up = np.cross(b - a, c - a)[:, 1]
    x = -FEET_APART  # the right, before MIRROR

    def crossed(z: float) -> tuple[np.ndarray, np.ndarray]:
        # The heights at which an upright line at (x, z) crosses each face, and whether it does.
        e0, e1 = b - a, c - a
        det = e0[:, 0] * e1[:, 2] - e0[:, 2] * e1[:, 0]
        ok = np.abs(det) > 1e-12
        safe = np.where(ok, det, 1)
        px, pz = x - a[:, 0], z - a[:, 2]
        v = (px * e1[:, 2] - pz * e1[:, 0]) / safe
        w = (pz * e0[:, 0] - px * e0[:, 2]) / safe
        inside = ok & (v >= 0) & (w >= 0) & (v + w <= 1)
        return a[:, 1] + v * e0[:, 1] + w * e1[:, 1], inside

    def floor_at(z: float) -> float:
        y, inside = crossed(z)
        under = inside & (up > 0) & (y < wheel[1])
        assert under.any(), f"no floor under the feet at z {z:.2f}"
        return float(y[under].max())

    floor = floor_at(wheel[2])
    z = float(wheel[2])
    while True:
        y, inside = crossed(z + 0.01)
        if (inside & (y > floor + 1e-3) & (y < floor + FOOT_ROOM)).any():
            return np.array([x, floor, z])
        z += 0.01


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]))
