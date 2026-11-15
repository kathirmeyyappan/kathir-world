"""Builds render/avatars/<name>Model.ts and the avatar's texture for a jointed body (render/avatars/
Jointed.ts) from a rip of the character's model, unpacked into a folder:

    pip install numpy pillow fast_simplification
    python packages/client/scripts/jointed-model.py mario path/to/Mario
    python packages/client/scripts/jointed-model.py luigi path/to/Luigi
    python packages/client/scripts/jointed-model.py wario path/to/Wario
    python packages/client/scripts/jointed-model.py waluigi path/to/Waluigi

A rip is the character's own model in Collada (<name>.dae): a body and a face skinned over a rig of
34 joints (a hip the legs hang from by a knee and a foot, two joints of spine, a head with its cap,
hair, mouth and mustache, and from a clavicle each side an arm with an elbow, a hand, two finger
joints and two of thumb), standing in a T-pose with its feet on the ground, z up, facing -y, in a
unit of its own. Mario's, Luigi's, Wario's and Waluigi's are on that one rig, joint for joint (a joint's name
ends in a number that differs from rip to rip, which is dropped), and any other rip on it goes
through as it is; the ones here are Mystie's rips at the Models Resource (CHARACTERS says
which game each is from). The pupils are meshes of their own floating over the face, for the game
to move; the face's texture has the eyes painted in already, so they are left out.

This folds the rig onto the jointed body's bones (Jointed.ts: every joint a body moves on its own
walking, running and jumping), each vertex keeping the weights it had on each bone's joints so the
skin bends at a knee or an elbow, and turns it into the avatar's frame (y up, facing +z, x to its
right, feet at 0, `height` tall). The body's texture and the face's are packed into one atlas. It
writes what avatar-model.py writes, in the same layout (render/avatars/skinned.ts SkinnedModel), and
the reach of a shoe's sole, for standing the feet on the ground.
"""

from __future__ import annotations

import base64
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from glb import pack_regions, textured
from PIL import Image

CLIENT = Path(__file__).resolve().parents[1]
NS = "{http://www.collada.org/2005/11/COLLADASchema}"

# The avatar's bones, a parent before its children, and the rig joints each takes: itself and every
# joint under it that no other bone does. The first is the root, which takes whatever is left.
BONES: tuple[tuple[str, str], ...] = (
    ("hips", "Hip"),
    ("spine", "Spine1"),
    ("chest", "Spine2"),  # the clavicles with it: the shoulders don't shrug
    ("head", "Head"),
    ("armL", "ArmL"),
    ("forearmL", "ElbowL"),
    ("handL", "HandL"),
    ("fingersL", "Finger1L"),
    ("thumbL", "Thumb1L"),
    ("armR", "ArmR"),
    ("forearmR", "ElbowR"),
    ("handR", "HandR"),
    ("fingersR", "Finger1R"),
    ("thumbR", "Thumb1R"),
    ("legL", "LegL"),
    ("shinL", "KneeL"),
    ("footL", "FootL"),
    ("legR", "LegR"),
    ("shinR", "KneeR"),
    ("footR", "FootR"),
)
# Bones only some rigs have, after the rest: what hangs off a body and moves by itself (Jointed.ts
# `SoftBone`). Peach's skirt is three rings down from her hips, and her ponytail three joints back
# from her head.
SOFT: tuple[tuple[str, str], ...] = (
    ("skirt1", "Skirt1"),
    ("skirt2", "Skirt2"),
    ("skirt3", "Skirt3"),
    ("hair1", "Hair1"),
    ("hair2", "Hair2"),
    ("hair3", "Hair3"),
)
TORSO = ("hips", "spine", "chest")
PALM = ("HandR", "Finger1R", "Thumb1R")  # a held item goes at their middle
MESHES = ("Body__m_Body", "Body__m_Eye")  # the body and the face; the rest are the pupils
BACK_DROP = 0.2  # metres below the shoulders the tank hangs
RELIEF_CELL = 0.03  # metres between the points of the head's relief


@dataclass(frozen=True)
class Character:
    title: str
    game: str  # the game the rip is of
    height: float  # metres, feet to the top of the cap
    texture_size: int = 512  # px: the body's texture is scaled down to this on its long side


# Mario stands as tall as the standard body, and the rest as tall beside him as their models are
# beside his, to a tenth of a metre. Wario's is a hair the taller of his and Luigi's (2.26 m
# against 2.22), and he stands as tall as Luigi: he is nowhere drawn the taller of the two.
CHARACTERS = {
    "mario": Character("Mario", "Mario Kart 8", 2.0),
    "luigi": Character("Luigi", "Mario Kart 8", 2.2),
    "wario": Character("Wario", "Mario Kart 8", 2.2),
    "waluigi": Character("Waluigi", "Mario Kart 8", 3.1),
    "peach": Character("Peach", "Mario Kart 8", 2.5),
}


def surface(triangles: np.ndarray, step: float) -> np.ndarray:
    """Points over triangles (n by 3 corners by xyz), no further apart than `step`."""
    out = []
    for a, b, c in triangles:
        n = max(1, int(np.ceil(max(np.linalg.norm(b - a), np.linalg.norm(c - a), np.linalg.norm(c - b)) / step)))
        i, j = np.meshgrid(np.arange(n + 1), np.arange(n + 1))
        keep = i + j <= n
        out.append(a + (i[keep] / n)[:, None] * (b - a) + (j[keep] / n)[:, None] * (c - a))
    return np.vstack(out)


def lining(part: dict[str, np.ndarray], skirt: list[int]) -> dict[str, np.ndarray]:
    """A skirt's lining: a disc closing the hem of `part` (a mesh in the rip's frame, z up) from
    underneath, so nothing shows up the skirt when it tips. Its rim is the outline, seen from above,
    of the lowest of what hangs on the `skirt` bones, and its middle a little higher, clear of the
    floor the hem stands on; it hangs on the last of those bones, the hem's, in the colour of the
    cloth halfway up the skirt, and is lit as if it looked up, since what lights the body is over it."""
    positions, triangles = part["positions"], part["triangles"]
    cloth = np.flatnonzero(part["bones"][:, skirt].sum(axis=1) > 0.5)
    low, high = positions[cloth, 2].min(), positions[cloth, 2].max()
    hem = cloth[positions[cloth, 2] < low + 0.03 * (high - low)]
    # The outline: the hem's corners from left to right, along the near side and back along the
    # far one, keeping only the turns that go one way round.
    spots = np.unique(np.round(positions[hem, :2], 5), axis=0)
    outline: list[np.ndarray] = []
    for side in (spots, spots[::-1]):
        half: list[np.ndarray] = []
        for spot in side:
            while len(half) >= 2:
                (ux, uy), (vx, vy) = half[-1] - half[-2], spot - half[-1]
                if ux * vy - uy * vx > 0:
                    break
                half.pop()
            half.append(spot)
        outline += half[:-1]
    rim = np.c_[np.array(outline), np.full(len(outline), low)]
    middle = np.r_[rim[:, :2].mean(axis=0), low + 0.02 * (high - low)]
    # Wound as the mesh winds a face that looks the way its corners' normals do, looking down.
    a, b, c = (positions[triangles[:, i]] for i in range(3))
    faces = np.sign(np.sum(np.cross(b - a, c - a) * part["normals"][triangles[:, 0]]))
    n, base = len(rim), len(positions)
    fan = np.array([[base + i, base + (i + 1) % n, base + n] for i in range(n)])
    if np.cross(rim[1] - rim[0], middle - rim[0])[2] * faces > 0:  # that way round looks up
        fan = fan[:, [1, 0, 2]]
    weights = np.zeros((n + 1, part["bones"].shape[1]))
    weights[:, skirt[-1]] = 1
    return {
        **part,
        "positions": np.vstack([positions, rim, middle]),
        "normals": np.vstack([part["normals"], np.tile([0.0, 0, 1], (n + 1, 1))]),
        "uvs": np.vstack([part["uvs"], np.tile(part["uvs"][cloth[np.argsort(positions[cloth, 2])[len(cloth) // 2]]], (n + 1, 1))]),
        "bones": np.vstack([part["bones"], weights]),
        "triangles": np.vstack([triangles, fan]),
    }


def bare(joint: str | None) -> str | None:
    """A joint's name without the number its rip ends it with."""
    return None if joint is None else re.sub(r"_\d+$", "", joint)


def floats(node: ET.Element) -> np.ndarray:
    return np.array((node.text or "").split(), dtype=np.float64)


def main(name: str, folder: str) -> None:
    character = CHARACTERS[name]
    rip = Path(folder)
    out = CLIENT / f"src/render/avatars/{name}Model.ts"
    texture_out = CLIENT / f"public/assets/textures/avatars/{name}.png"
    doc = ET.parse(rip / f"{name}.dae").getroot()

    # An image is named as the ripper's machine had it: the file of that name in the rip's folder,
    # whatever its path and case.
    files = {file.name.lower(): file.name for file in rip.iterdir()}
    images = {
        image.get("id"): files[Path(image.findtext(f"{NS}init_from") or "").name.lower()]
        for image in doc.iter(f"{NS}image")
    }
    # A material's picture: the first image its effect names is its colour (the next its normal map).
    pictures: dict[str, str] = {}
    for effect in doc.iter(f"{NS}effect"):
        first = effect.find(f".//{NS}surface/{NS}init_from")
        assert first is not None and first.text is not None
        pictures[(effect.get("id") or "").removesuffix("-effect")] = images[first.text] or ""

    # Each mesh in the pose it was bound in, with the joints' own places there: the rig's nodes are
    # left as the game last posed them (sat down, in these), so the bind pose is the one to read.
    geometries = {g.get("id"): g for g in doc.iter(f"{NS}geometry")}
    rigged = {bare(node.get("sid")) for node in doc.iter(f"{NS}node")}
    bones = BONES + tuple(soft for soft in SOFT if soft[1] in rigged)
    bone_names = [bone for bone, _ in bones]
    parts = []
    pivots: dict[str, np.ndarray] = {}
    joints_at: dict[str, np.ndarray] = {}
    for controller in doc.iter(f"{NS}controller"):
        skin = controller.find(f"{NS}skin")
        assert skin is not None
        geometry = geometries[(skin.get("source") or "")[1:]]
        if geometry.get("name") not in MESHES:
            continue
        sources = {s.get("id"): s for s in skin.findall(f"{NS}source")}
        cid = controller.get("id") or ""
        joints = [bare(j) for j in (sources[f"{cid}-joints"].findtext(f"{NS}Name_array") or "").split()]
        inverse_bind = floats(sources[f"{cid}-bind_poses"].find(f"{NS}float_array")).reshape(-1, 4, 4)
        weight = floats(sources[f"{cid}-weights"].find(f"{NS}float_array"))
        influences = skin.find(f"{NS}vertex_weights")
        assert influences is not None
        counts = np.array((influences.findtext(f"{NS}vcount") or "").split(), dtype=np.int64)
        pairs = np.array((influences.findtext(f"{NS}v") or "").split(), dtype=np.int64).reshape(-1, 2)
        bind_shape = floats(skin.find(f"{NS}bind_shape_matrix")).reshape(4, 4)
        if not joints_at:
            joints_at = {joint: np.linalg.inv(m)[:3, 3] for joint, m in zip(joints, inverse_bind)}
            pivots = {bone: joints_at[joint] for bone, joint in bones}

        # A joint belongs to the bone that names it or the nearest joint above it that a bone names,
        # else to the root: up the rig by the scene's nodes.
        parent = {
            bare(child.get("sid")): bare(node.get("sid"))
            for node in doc.iter(f"{NS}node")
            for child in node.findall(f"{NS}node")
            if bare(child.get("sid")) != bare(node.get("sid"))  # the pupils' joint is named as their node is
        }
        named = {joint: i for i, (_, joint) in enumerate(bones)}

        def bone_of(joint: str | None) -> int:
            while joint is not None:
                if joint in named:
                    return named[joint]
                joint = parent.get(joint)
            return 0

        joint_bone = np.array([bone_of(joint) for joint in joints])
        gid = geometry.get("id") or ""
        arrays = {s.get("id"): floats(s.find(f"{NS}float_array")) for s in geometry.iter(f"{NS}source")}
        polylist = geometry.find(f".//{NS}polylist")
        assert polylist is not None
        assert set((polylist.findtext(f"{NS}vcount") or "").split()) == {"3"}
        # A corner is an index for each of the polylist's inputs: its vertex, its normal and its
        # texture coordinate, and in some rips a colour after them.
        inputs = {i.get("semantic"): int(i.get("offset") or 0) for i in polylist.findall(f"{NS}input")}
        corners = np.array((polylist.findtext(f"{NS}p") or "").split(), dtype=np.int64).reshape(-1, len(inputs))
        corners = corners[:, [inputs["VERTEX"], inputs["NORMAL"], inputs["TEXCOORD"]]]
        positions = arrays[f"{gid}-positions"].reshape(-1, 3)
        normals = arrays[f"{gid}-normals"].reshape(-1, 3)[corners[:, 1]]
        # Collada's v runs up the image. The body's texture repeats and the face's is skin at every
        # edge, so a triangle is moved onto the image by whole tiles, and a corner still off it (a
        # face's rim, a little past the edge) is held at the edge.
        uv = arrays[f"{gid}-map-0"].reshape(-1, 2)[corners[:, 2]]
        uv = np.c_[uv[:, 0], 1 - uv[:, 1]].reshape(-1, 3, 2)
        uv = np.clip(uv - np.floor(uv.mean(axis=1, keepdims=True)), 0, 1).reshape(-1, 2)
        # The rip gives every corner texture coordinates of its own: a vertex is the corners at one
        # position that agree on the normal and the texture coordinate.
        _, first, triangles = np.unique(
            np.c_[corners[:, 0], np.round(normals, 3), np.round(uv, 5)], axis=0, return_index=True, return_inverse=True
        )
        folded = np.zeros((len(positions), len(bones)))
        np.add.at(folded, (np.repeat(np.arange(len(positions)), counts), joint_bone[pairs[:, 0]]), weight[pairs[:, 1]])
        parts.append(
            {
                "positions": (np.c_[positions, np.ones(len(positions))] @ bind_shape.T)[corners[first, 0], :3],
                "normals": normals[first] @ bind_shape[:3, :3].T,
                "uvs": uv[first],
                "bones": folded[corners[first, 0]],
                "triangles": triangles.reshape(-1, 3),
                "picture": pictures[(polylist.get("material") or "").removesuffix("-material")],
            }
        )

    skirt = [i for i, bone in enumerate(bone_names) if bone.startswith("skirt")]
    if skirt:
        parts = [lining(part, skirt) if part["bones"][:, skirt].any() else part for part in parts]

    posed = np.vstack([part["positions"] for part in parts])
    posed_normals = np.vstack([part["normals"] for part in parts])
    uv = np.vstack([part["uvs"] for part in parts])
    folded = np.vstack([part["bones"] for part in parts])
    triangles, spans, base = [], [], 0
    for part in parts:
        triangles.append(part["triangles"] + base)
        spans.append(np.arange(base, base + len(part["positions"])))
        base += len(part["positions"])
    triangles = np.vstack(triangles)

    # The rip stands z up facing -y with its left at +x; the avatar stands y up facing +z with its
    # right at +x. That is a reflection, so the triangles' winding already faces out in Babylon's
    # left-handed frame.
    turn = np.array([[-1.0, 0, 0], [0, 0, 1], [0, -1, 0]])
    feet = posed[:, 2].min()
    scale = character.height / (posed[:, 2].max() - feet)
    origin = np.array([0, pivots["hips"][1], feet])

    def avatar(p: np.ndarray) -> np.ndarray:
        return (np.atleast_2d(p) - origin) @ turn.T * scale

    posed = avatar(posed)
    posed_normals = posed_normals @ turn.T
    posed_normals /= np.linalg.norm(posed_normals, axis=1)[:, None]
    pivots = {bone: avatar(p)[0] for bone, p in pivots.items()}

    # Each vertex's four heaviest bones, their weights summing to 255.
    order = np.argsort(-folded, axis=1)[:, :4]
    bone_weights = np.take_along_axis(folded, order, axis=1)
    bone_weights /= bone_weights.sum(axis=1, keepdims=True)
    quantised = np.round(bone_weights * 255).astype(np.int64)
    quantised[:, 0] += 255 - quantised.sum(axis=1)  # the rounding error goes on the biggest weight
    print("bones per vertex:", np.bincount((bone_weights > 0.002).sum(axis=1))[1:])

    palm = avatar(np.mean([joints_at[joint] for joint in PALM], axis=0))[0]
    # The tank hangs on the back a little below the shoulders: as far back as the trunk goes there.
    shoulder_y = (pivots["armL"][1] + pivots["armR"][1]) / 2 - BACK_DROP
    trunk = np.isin(order[:, 0], [bone_names.index(b) for b in TORSO])
    back_z = posed[trunk & (abs(posed[:, 1] - shoulder_y) < 1.5 * BACK_DROP)][:, 2].min() - BACK_DROP / 4
    back = np.array([0, shoulder_y, back_z])
    # Fallen on its back, the body lies this far up: as far as anything that holds its shape (the
    # back of the head) is behind the hips.
    lie = -posed[order[:, 0] < len(BONES)][:, 2].min()
    # A shoe's sole: how far ahead of the ankle its toe reaches, and how far behind it its heel.
    shoe = posed[order[:, 0] == bone_names.index("footR")]
    sole = np.array([shoe[:, 2].max() - pivots["footR"][2], pivots["footR"][2] - shoe[:, 2].min()])

    # What a hand laid flat beside the head rests on. `temple` is where its palm's middle goes: level
    # with the head's widest point, and that far out. The head's relief is how far out the head
    # reaches, either side, at each point of a grid up and across its side (from `skull_at`, the
    # grid's low back corner from the neck): the furthest of what is nearest that point. The hand's
    # is each of its vertices from its palm's middle, palm down as the model holds it: along the
    # fingers, across, and how far under.
    heads = np.all(order[triangles, 0] == bone_names.index("head"), axis=1) | np.any(
        (order[triangles, 0] == bone_names.index("head")) & (bone_weights[triangles, 0] > 0.9), axis=1
    )
    skull = surface(posed[triangles[heads]], RELIEF_CELL / 3)
    skull[:, 0] = abs(skull[:, 0])
    temple = skull[np.argmax(skull[:, 0])]
    neck = pivots["head"]
    skull_at = np.floor((skull[:, 1:].min(0) - neck[1:]) / RELIEF_CELL) * RELIEF_CELL
    nodes = np.round((skull[:, 1:] - neck[1:] - skull_at) / RELIEF_CELL).astype(int)
    relief = np.zeros(nodes.max(0) + 1)
    np.maximum.at(relief, (nodes[:, 0], nodes[:, 1]), skull[:, 0])
    mitt = posed[np.isin(order[:, 0], [bone_names.index(b) for b in ("handR", "fingersR", "thumbR")])] - palm
    grip = np.column_stack([mitt[:, 0], mitt[:, 2], -mitt[:, 1]])
    print("temple:", np.round(temple, 3), "head relief:", relief.shape, "hand vertices:", len(grip))

    # A skirt's hem, from the top of the skirt: how far it reaches to a side, ahead and behind, and
    # how far down it is.
    hem = None
    if "skirt1" in bone_names:
        skirt = posed[np.isin(order[:, 0], [bone_names.index(b) for b in bone_names if b.startswith("skirt")])]
        hem = np.array(
            [abs(skirt[:, 0]).max(), skirt[:, 2].max(), -skirt[:, 2].min(), pivots["skirt1"][1] - skirt[:, 1].min()]
        )
        print("hem:", np.round(hem, 3))

    regions = [
        textured(Image.open(rip / part["picture"]).convert("RGB"), uv, span, character.texture_size)
        for part, span in zip(parts, spans)
    ]
    atlas, uv = pack_regions(regions, uv)

    def b64(a: np.ndarray) -> str:
        return base64.b64encode(a.tobytes()).decode()

    def vec(v: np.ndarray) -> str:
        return "[" + ", ".join(f"{c + 0.0:.4f}".replace("-0.0000", "0.0000") for c in v) + "]"

    lines = [
        f"// Generated by packages/client/scripts/jointed-model.py from Mystie's rip of {character.title} in {character.game}"
        " (the Models Resource); don't edit.",
        "// One skinned mesh in the avatar's frame (metres: feet at 0, facing +z, x to its right): vertices in",
        "// millimetres (Int16 x, y, z), unit normals (Int8), texture coordinates (Uint16 over 0 to 1, v down the",
        "// image), triangles (Uint16) and, per vertex, the four bones it follows (Uint8 indices into `bones`) and",
        "// how much (Uint8, summing to 255); all base64. `bones` is each bone's pivot in metres, in index order.",
        "// `hand` is the right palm, `back` where the tank hangs, `lie` how high the hips lie when it is on its back,",
        "// `sole` how far a shoe's toe reaches ahead of its ankle and its heel behind it. For a hand laid flat beside",
        "// the head: `temple` is the head's widest point on its right; `skull` how far out the head reaches, either",
        "// side, at the points of a grid `cell` metres apart up (rows) and ahead (`across` to a row) from `at`, metres",
        "// up and ahead of the neck (Int16 millimetres, base64); `mitt` the right hand's vertices from its palm's",
        "// middle, palm down, as Int16 millimetre triples: along the fingers, across, and how far under.",
        *(
            [
                "// `hem` is the skirt's: metres it reaches from the skirt's middle to a side, ahead and behind, and",
                "// how far below the skirt's top bone it is.",
            ]
            if hem is not None
            else []
        ),
        f"export const {name.upper()}_MODEL = {{",
        f"  height: {character.height},",
        f"  hand: {vec(palm)},",
        f"  back: {vec(back)},",
        f"  lie: {lie:.4f},",
        f"  sole: {vec(sole)},",
        f"  temple: {vec(temple)},",
        f"  skull: {{ at: {vec(skull_at)}, cell: {RELIEF_CELL}, across: {relief.shape[1]}, far: '{b64(np.round(relief * 1000).astype('<i2'))}' }},",
        f"  mitt: '{b64(np.round(grip * 1000).astype('<i2'))}',",
        *([f"  hem: {vec(hem)},"] if hem is not None else []),
        "  bones: {",
        *(f"    {bone}: {vec(pivots[bone])}," for bone in bone_names),
        "  },",
        f"  positions: '{b64(np.round(posed * 1000).astype('<i2'))}',",
        f"  normals: '{b64(np.round(posed_normals * 127).astype('i1'))}',",
        f"  uvs: '{b64(np.round(uv * 65535).astype('<u2'))}',",
        f"  indices: '{b64(triangles.astype('<u2'))}',",
        f"  boneIndices: '{b64(order.astype('u1'))}',",
        f"  boneWeights: '{b64(quantised.astype('u1'))}',",
        "} as const;",
        "",
    ]
    out.write_text("\n".join(lines))
    print(f"{len(triangles)} triangles, {len(posed)} vertices; wrote {out} ({out.stat().st_size} bytes)")

    texture_out.parent.mkdir(parents=True, exist_ok=True)
    atlas.quantize(256, dither=Image.Dither.FLOYDSTEINBERG).save(texture_out, optimize=True)
    print(f"wrote {texture_out} ({atlas.size[0]}x{atlas.size[1]}, {texture_out.stat().st_size} bytes)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
