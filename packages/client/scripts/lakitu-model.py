"""Builds Lakitu for the client (render/lakitu/) from a rip of Mario Kart 8's referee, unpacked
into a folder:

    pip install numpy pillow fast_simplification
    python packages/client/scripts/lakitu-model.py "path/to/Lakitu Referee"

The rip is one Collada file (JugemObj.dae: z up, his front along -y, a metre OBJ_UNIT of MK8's
units) of meshes skinned to joints, with no animation: Lakitu on his cloud with his arms straight
out to his sides, his face (a mesh of its own, with a picture for each of four expressions), and
each thing he holds, standing at the origin: the fishing rod, the hook on its line, the chequered
flag, the lap board, the wrong-way sign and the starting lights.

It writes, in public/assets/models/lakitu/, parts in the client's format (house_mesh.py
`emit_part`), each a pose of him or a thing of his:

- a part for each of POSES, him in that pose with what he holds in it in his fist, his joints
  turned and the skin carried along by its weights: `fishing`, the rod held out over what he
  fishes for;
- `hook`, the eye its line ties to at the origin;
- `signal`, the starting lights, as the rip stands them, which he hangs from his line at a race's
  start (render/lakitu/StartLights.ts);
- `flag`, `lap` and `reverse`, as the rip stands them, which nothing draws yet.

And their pictures: `lakitu.png` for him, his four faces, the rod and the hook, and `props.png`
for the rest (the colour of each alone: what lights up on the boards and the lights is in the
rip's `_emm` pictures, by the lap for the board's). And render/lakitu/lakituModel.ts: where the
rod's tip is in each pose, which the line hangs from.

He is sized against the karts' drivers as MK8 sizes him (MK8_METRES, kart-model.py), in the
game's frame: x to his right, y up, z ahead, the rip's own origin (the middle of him, over his
cloud) at the origin.
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from glb import Region, decimate, pack_regions
from house_mesh import MIRROR, MeshBuilder, emit_part
from PIL import Image

CLIENT = Path(__file__).resolve().parents[1]
NS = "{http://www.collada.org/2005/11/COLLADASchema}"

MK8_METRES = 2.0 / 15.42  # MK8's Mario, 15.42 of its units tall, stood 2 m (jointed-model.py)
OBJ_UNIT = 0.127  # the rip's metres, in MK8's units
BODY_TEXTURE = 256  # px: his own picture's long side
FACE_TEXTURE = 96  # px: each face's side, all but flat yellow round two eyes and a mouth
PROP_TEXTURE = 128  # px: the long side of each picture of the things he holds
KEEP = 0.6  # of his triangles kept: his cloud's lumps and his shell hold their shape with fewer

BODY = "JugemObj__m_JugemObj"
FACE = "JugemObj__m_JugemObjFace"
ROD = "JugemObjRod__m_JugemObjRod"
HOOK = "JugemObjLine__m_JugemObjRod"
ROD_HELD_AT = "LocRod_1"  # the joint in his fist the rod's foot goes on, its length along the joint's y
ROD_TIP = "LocLine_6"  # the joint at the rod's tip, where its line ties

# What each mesh is painted with: the rip's picture, by its name's stem.
PICTURES = {
    BODY: "jugemobj_alb",
    ROD: "jugemobjrod_alb",
    HOOK: "jugemobjrod_alb",
    "JugemObjFlag__m_JugemObjFlag": "jugemobjflag_alb",
    "Bake_JugemObjLap__m_JugemObjLap": "jugemobjlap_alb",
    "NoBake_JugemObjLap__m_JugemObjLapLight": "jugemobjlaplight_alb",
    "Bake_JugemObjReverse__m_JugemObjReverse": "jugemobjreverse_alb",
    "NoBake_JugemObjReverse__m_JugemObjReverseLight": "jugemobjreverselight_alb",
    "JugemObjSignal__m_Signal": "jugemobjsignal_alb",
    "JugemObjSignal__m_signal_left": "jugemobjsignal_alb",
    "JugemObjSignal__m_signal_middle": "jugemobjsignal_alb",
    "JugemObjSignal__m_signal_right": "jugemobjsignal_alb",
}
FACES = [f"jugemobjface_alb.{i}" for i in range(4)]  # calm, glad, cross, crosser

# The things he holds that nothing draws yet, each the meshes it's made of.
PROPS = {
    "flag": ["JugemObjFlag__m_JugemObjFlag"],
    "lap": ["Bake_JugemObjLap__m_JugemObjLap", "NoBake_JugemObjLap__m_JugemObjLapLight"],
    "reverse": ["Bake_JugemObjReverse__m_JugemObjReverse", "NoBake_JugemObjReverse__m_JugemObjReverseLight"],
    "signal": [
        "JugemObjSignal__m_Signal",
        "JugemObjSignal__m_signal_left",
        "JugemObjSignal__m_signal_middle",
        "JugemObjSignal__m_signal_right",
    ],
}


@dataclass
class Pose:
    """A pose of his: the joints turned, in order, each with everything hung on it, about an axis
    of the rip's frame (x to his left, y behind him, z up) through the joint, by degrees; the face
    he wears (an index into FACES); and whether the rod is in his fist."""

    turns: list[tuple[str, str, float]]
    face: int
    rod: bool


POSES = {
    # Leaning over what he fishes for: his left arm brought round in front of him with the rod
    # tipped up out of its fist, so the tip is over his middle line; his right arm let down, and
    # his head bowed to look at it.
    "fishing": Pose(
        turns=[
            ("HandL_1", "x", -40),
            ("ElbowL_1", "z", -12),
            ("ArmL_1", "z", -18),
            ("ArmR_1", "y", -50),
            ("ElbowR_1", "z", 25),
            ("Head_1", "x", 14),
        ],
        face=0,
        rod=True,
    ),
}


@dataclass
class Skin:
    """A skinned mesh as the rip binds it: its corners, three a triangle, each with its spot in the
    rip's frame, its texture coordinates (v down the image), and how much of it each of `joints`
    carries; and each joint's inverse bind matrix."""

    positions: np.ndarray
    uvs: np.ndarray
    weights: np.ndarray
    joints: list[str]
    inverse_binds: np.ndarray


def floats(element: ET.Element | None) -> np.ndarray:
    assert element is not None
    return np.array([float(x) for x in (element.text or "").split()])


def read_joints(doc: ET.Element) -> tuple[dict[str, np.ndarray], dict[str, list[str]]]:
    """Every joint's matrix in the rip's frame as it rests, and the joints hung on each."""
    world: dict[str, np.ndarray] = {}
    children: dict[str, list[str]] = {}

    def walk(node: ET.Element, parent: np.ndarray, above: str | None) -> None:
        matrix = node.find(f"{NS}matrix")
        here = parent @ (floats(matrix).reshape(4, 4) if matrix is not None else np.eye(4))
        name = above
        if node.get("type") == "JOINT":
            name = node.get("sid") or ""
            world[name] = here
            children[name] = []
            if above is not None:
                children[above].append(name)
        for child in node.findall(f"{NS}node"):
            walk(child, here, name)

    for scene in doc.iter(f"{NS}visual_scene"):
        for node in scene.findall(f"{NS}node"):
            walk(node, np.eye(4), None)
    return world, children


def read_skin(doc: ET.Element, name: str) -> Skin:
    """The mesh named `name` and the skin that binds it."""
    controller = next(
        c for c in doc.iter(f"{NS}controller") if (c.find(f"{NS}skin").get("source") or "") == f"#{name}-mesh"
    )
    skin = controller.find(f"{NS}skin")
    geometry = next(g for g in doc.iter(f"{NS}geometry") if g.get("id") == f"{name}-mesh")
    mesh = geometry.find(f"{NS}mesh")
    assert skin is not None and mesh is not None
    source = lambda of, ref: next(s for s in of.findall(f"{NS}source") if s.get("id") == (ref or "")[1:])

    vertices = mesh.find(f"{NS}vertices/{NS}input[@semantic='POSITION']")
    assert vertices is not None
    spots = floats(source(mesh, vertices.get("source")).find(f"{NS}float_array")).reshape(-1, 3)
    bind_shape = floats(skin.find(f"{NS}bind_shape_matrix")).reshape(4, 4)
    spots = spots @ bind_shape[:3, :3].T + bind_shape[:3, 3]

    at = lambda of, semantic: of.find(f"{NS}input[@semantic='{semantic}']")
    binds = skin.find(f"{NS}joints")
    assert binds is not None
    joints = (source(skin, at(binds, "JOINT").get("source")).findtext(f"{NS}Name_array") or "").split()
    inverse_binds = floats(source(skin, at(binds, "INV_BIND_MATRIX").get("source")).find(f"{NS}float_array")).reshape(
        -1, 4, 4
    )
    influences = skin.find(f"{NS}vertex_weights")
    assert influences is not None
    amounts = floats(source(skin, at(influences, "WEIGHT").get("source")).find(f"{NS}float_array"))
    counts = np.array((influences.findtext(f"{NS}vcount") or "").split(), dtype=int)
    pairs = np.array((influences.findtext(f"{NS}v") or "").split(), dtype=int).reshape(-1, 2)
    weights = np.zeros((len(spots), len(joints)))
    np.add.at(weights, (np.repeat(np.arange(len(spots)), counts), pairs[:, 0]), amounts[pairs[:, 1]])
    weights /= weights.sum(axis=1, keepdims=True)

    faces = mesh.find(f"{NS}polylist")
    assert faces is not None and set((faces.findtext(f"{NS}vcount") or "").split()) == {"3"}
    inputs = faces.findall(f"{NS}input")
    stride = max(int(i.get("offset") or 0) for i in inputs) + 1
    corners = np.array((faces.findtext(f"{NS}p") or "").split(), dtype=int).reshape(-1, stride)
    vertex = corners[:, int(at(faces, "VERTEX").get("offset") or 0)]
    texcoord = at(faces, "TEXCOORD")
    assert texcoord is not None
    coords = floats(source(mesh, texcoord.get("source")).find(f"{NS}float_array")).reshape(-1, 2)
    uvs = coords[corners[:, int(texcoord.get("offset") or 0)]] * [1, -1] + [0, 1]
    return Skin(spots[vertex], uvs, weights[vertex], joints, inverse_binds)


def posed(
    world: dict[str, np.ndarray], children: dict[str, list[str]], turns: list[tuple[str, str, float]]
) -> dict[str, np.ndarray]:
    """The joints' matrices with `turns` made (a Pose's)."""
    out = {name: matrix.copy() for name, matrix in world.items()}

    def under(joint: str) -> list[str]:
        return [joint] + [below for child in children[joint] for below in under(child)]

    for joint, axis, degrees in turns:
        k = "xyz".index(axis)
        i, j = (k + 1) % 3, (k + 2) % 3
        c, s = np.cos(np.radians(degrees)), np.sin(np.radians(degrees))
        turn = np.eye(4)
        turn[i, i], turn[i, j], turn[j, i], turn[j, j] = c, -s, s, c
        pivot = out[joint][:3, 3].copy()
        turn[:3, 3] = pivot - turn[:3, :3] @ pivot
        for name in under(joint):
            out[name] = turn @ out[name]
    return out


def carried(skin: Skin, joints: dict[str, np.ndarray]) -> np.ndarray:
    """The skin's corners with its joints at `joints`, each carried by the joints that hold it."""
    spots = np.concatenate([skin.positions, np.ones((len(skin.positions), 1))], axis=1)
    moved = np.zeros((len(spots), 3))
    for k, name in enumerate(skin.joints):
        held = np.flatnonzero(skin.weights[:, k] > 0)
        matrix = (joints[name] @ skin.inverse_binds[k])[:3]
        moved[held] += skin.weights[held, k : k + 1] * (spots[held] @ matrix.T)
    return moved


def thinned(positions: np.ndarray, uvs: np.ndarray, weights: np.ndarray, keep: float) -> tuple[np.ndarray, ...]:
    """A triangle soup with about `keep` of its triangles (glb.py `decimate`)."""
    keys = np.concatenate([np.round(positions, 5), np.round(uvs, 5)], axis=1)
    _, first, corner = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    part = {
        "positions": positions[first],
        "uvs": uvs[first],
        "normals": np.zeros((len(first), 3)),
        "bones": weights[first],
        "triangles": corner.ravel().reshape(-1, 3),
    }
    decimate(part, keep)
    order = part["triangles"].ravel()
    return part["positions"][order], part["uvs"][order], part["bones"][order]


def region(image: Image.Image, uvs: np.ndarray, corners: np.ndarray, size: int) -> Region:
    """A picture's place in an atlas for the corners it paints: the picture, no bigger than `size`
    on its long side, over just the span their coordinates cover. MK8 wraps these pictures
    mirrored (each repeat the last turned over, so half a shell's whorl at an edge is a whole
    one), so a span past an edge is laid out that way."""
    shrink = min(1.0, size / max(image.size))
    image = image.resize((round(image.width * shrink), round(image.height * shrink)), Image.Resampling.LANCZOS)
    if len(corners) == 0:
        return (image, corners, 0, 0, 1, 1)
    pixels = np.asarray(image)
    low = np.floor(uvs[corners].min(axis=0) * image.size + 1e-6).astype(int)
    high = np.ceil(uvs[corners].max(axis=0) * image.size - 1e-6).astype(int)
    # Each pixel of the span, folded back onto the picture.
    folded = [
        np.where((at // n) % 2 == 0, at % n, n - 1 - at % n)
        for at, n in ((np.arange(low[k], high[k]), image.size[k]) for k in (0, 1))
    ]
    span = Image.fromarray(pixels[folded[1]][:, folded[0]])
    u0, v0 = low / image.size
    du, dv = (high - low) / image.size
    return (span, corners, float(u0), float(v0), float(du), float(dv))


def game(spots: np.ndarray) -> np.ndarray:
    """Spots of the rip's frame in the frame the parts are written from (house_mesh.py MIRROR
    turns it into the game's): x to his left, y up, z ahead, in metres at his size here."""
    return spots[:, [0, 2, 1]] * [1, 1, -1] / OBJ_UNIT * MK8_METRES


def triangles(positions: np.ndarray, uvs: np.ndarray) -> MeshBuilder:
    """A part of these corners, three a triangle. emit_part rewinds every triangle as it mirrors it
    into the game's frame; the rip's frame is right-handed and the game's left, so the rip's
    triangles, mirrored, face outward wound as they are, and each is handed over backward."""
    mesh = MeshBuilder()
    mesh.add([tuple((positions[i + k], uvs[i + k]) for k in (2, 1, 0)) for i in range(0, len(positions), 3)])
    return mesh


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    out = CLIENT / "public/assets/models/lakitu"
    out.mkdir(parents=True, exist_ok=True)
    doc = ET.parse(src / "JugemObj.dae").getroot()
    rest, children = read_joints(doc)
    picture = lambda stem: Image.open(src / f"{stem}.png").convert("RGB")

    # Him: his body thinned as it rests, so every pose is of the same mesh, then each pose of it
    # with the face it wears and what it holds.
    body = read_skin(doc, BODY)
    before = len(body.positions) // 3
    body.positions, body.uvs, body.weights = thinned(body.positions, body.uvs, body.weights, KEEP)
    print(f"body: {before} triangles thinned to {len(body.positions) // 3}")
    face, rod, hook = read_skin(doc, FACE), read_skin(doc, ROD), read_skin(doc, HOOK)
    foot_to_fist = np.linalg.inv(rest["SklRootRod_6"])  # the rod stood at the origin, in the frame of its foot

    positions: list[np.ndarray] = []
    uvs: list[np.ndarray] = []
    painted: dict[str, list[int]] = {}  # the corners each picture paints, counted through `positions`
    spans: dict[str, tuple[int, int]] = {}  # each part's corners
    count = 0

    def add(part: str, spots: np.ndarray, coords: np.ndarray, stem: str) -> None:
        nonlocal count
        positions.append(game(spots))
        uvs.append(coords)
        painted.setdefault(stem, []).extend(range(count, count + len(spots)))
        start = spans.get(part, (count, count))[0]
        count += len(spots)
        spans[part] = (start, count)

    tips: dict[str, np.ndarray] = {}
    for name, pose in POSES.items():
        joints = posed(rest, children, pose.turns)
        add(name, carried(body, joints), body.uvs, PICTURES[BODY])
        add(name, carried(face, joints), face.uvs, FACES[pose.face])
        if pose.rod:
            in_fist = joints[ROD_HELD_AT] @ foot_to_fist
            add(name, carried(rod, {j: in_fist @ rest[j] for j in rod.joints}), rod.uvs, PICTURES[ROD])
            tips[name] = game((in_fist @ rest[ROD_TIP])[None, :3, 3])[0] * MIRROR
    # The hook hangs under the eye its line ties to, the highest of it.
    hung = carried(hook, rest)
    eye = hung[np.argmax(hung[:, 2])]
    add("hook", hung - eye, hook.uvs, PICTURES[HOOK])

    sizes = {PICTURES[BODY]: BODY_TEXTURE, PICTURES[ROD]: PROP_TEXTURE} | {stem: FACE_TEXTURE for stem in FACES}
    all_uvs = np.concatenate(uvs)
    # A face no pose wears yet keeps its place in the picture, whole, for the pose that will.
    regions = [
        region(picture(stem), all_uvs, np.array(painted.get(stem, []), dtype=int), size) for stem, size in sizes.items()
    ]
    atlas, placed = pack_regions(regions, all_uvs)
    atlas.save(out / "lakitu.png", optimize=True)
    all_positions = np.concatenate(positions)
    for part, (start, end) in spans.items():
        emit_part(out / f"{part}.bin", triangles(all_positions[start:end], placed[start:end]), {})

    # The things nothing draws yet, as the rip stands them.
    positions, uvs, painted, spans, count = [], [], {}, {}, 0
    for part, meshes in PROPS.items():
        for mesh in meshes:
            skin = read_skin(doc, mesh)
            add(part, carried(skin, rest), skin.uvs, PICTURES[mesh])
    all_uvs = np.concatenate(uvs)
    regions = [
        region(picture(stem), all_uvs, np.array(corners, dtype=int), PROP_TEXTURE) for stem, corners in painted.items()
    ]
    atlas, placed = pack_regions(regions, all_uvs)
    atlas.save(out / "props.png", optimize=True)
    all_positions = np.concatenate(positions)
    for part, (start, end) in spans.items():
        emit_part(out / f"{part}.bin", triangles(all_positions[start:end], placed[start:end]), {})

    point = lambda v: "[" + ", ".join(f"{x:.3f}" for x in v) + "]"
    poses = "\n".join(f"  {name}: {{ tip: {point(tip)} }}," for name, tip in tips.items())
    (CLIENT / "src/render/lakitu/lakituModel.ts").write_text(
        "// Lakitu's model, written by scripts/lakitu-model.py from a rip of Mario Kart 8's referee: its\n"
        "// folder of parts under /assets/models (a part for each pose of him, named for it, with what he\n"
        "// holds in it in his fist; `hook`, the eye its line ties to at its origin; all painted by\n"
        "// `lakitu.png`), and for each pose where the tip of his rod is, which the line hangs from. In his\n"
        "// own frame: x to his right, y up, z ahead, the middle of him over his cloud at the origin.\n"
        "export const LAKITU = {\n"
        "  folder: 'lakitu',\n"
        f"{poses}\n"
        "} as const;\n"
    )


if __name__ == "__main__":
    main()
