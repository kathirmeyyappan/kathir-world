"""What the clip scripts share (sm64-clips.py, peach-clips.py): carrying a source skeleton's
poses onto a jointed body's (render/avatars/Jointed.ts), and writing them as a clips file.

A source is a skeleton in a frame of y up, facing +z, its left at +x, with a standing pose to
measure from. A bone is carried over by how far it has turned in the world from where it would be
in a T-pose: the standing pose, with each arm bone turned the short way to straight out to its
side and each leg bone to straight down. The jointed body's spine is halfway between its hips and
its chest. The hips ride where the source's do, measured from standing and in leg lengths, so a
longer-legged body bobs as far for its size, and each frame is then stood on the ground: lifted or
dropped so the foot bearing the weight is as far off the floor as the source's is, the two bodies'
legs not being cut alike.

Each clip is written as its frames' hips (x, y, z in thousandths of a leg, Int16) and bones'
turns (x, y, z, w quaternions, Int16 over 32767) in BONES' order, base64.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

import numpy as np

CLIENT = Path(__file__).resolve().parents[1]

# The jointed body's bones that a clip turns, in the order a frame lists them, each with its parent.
BONES: tuple[tuple[str, str | None], ...] = (
    ("hips", None),
    ("spine", "hips"),
    ("chest", "spine"),
    ("head", "chest"),
    ("armL", "chest"),
    ("forearmL", "armL"),
    ("handL", "forearmL"),
    ("armR", "chest"),
    ("forearmR", "armR"),
    ("handR", "forearmR"),
    ("legL", "hips"),
    ("shinL", "legL"),
    ("footL", "shinL"),
    ("legR", "hips"),
    ("shinR", "legR"),
    ("footR", "shinR"),
)
# Where the T-pose points the bones a standing pose may hold another way, in the source's frame.
T_POSE = {
    "armL": (1, 0, 0),
    "forearmL": (1, 0, 0),
    "handL": (1, 0, 0),
    "armR": (-1, 0, 0),
    "forearmR": (-1, 0, 0),
    "handR": (-1, 0, 0),
    "legL": (0, -1, 0),
    "shinL": (0, -1, 0),
    "legR": (0, -1, 0),
    "shinR": (0, -1, 0),
}

# A frame: the hips (in legs, from standing straight), each bone's turn in its parent, and how far
# off the ground the source's ankles are (metres on the jointed body), left and right.
Frame = tuple[np.ndarray, np.ndarray, tuple[float, float]]


def turn(q: np.ndarray) -> np.ndarray:
    """A quaternion (x, y, z, w) as a rotation matrix."""
    x, y, z, w = q
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def quaternion(m: np.ndarray) -> np.ndarray:
    """A rotation matrix as a quaternion (x, y, z, w), w positive."""
    w = np.sqrt(max(0.0, 1 + m[0, 0] + m[1, 1] + m[2, 2])) / 2
    x = np.sqrt(max(0.0, 1 + m[0, 0] - m[1, 1] - m[2, 2])) / 2
    y = np.sqrt(max(0.0, 1 - m[0, 0] + m[1, 1] - m[2, 2])) / 2
    z = np.sqrt(max(0.0, 1 - m[0, 0] - m[1, 1] + m[2, 2])) / 2
    x, y, z = np.copysign(x, m[2, 1] - m[1, 2]), np.copysign(y, m[0, 2] - m[2, 0]), np.copysign(z, m[1, 0] - m[0, 1])
    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)


def shortest(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """The rotation that takes unit vector `a` to unit vector `b` the short way."""
    v = np.cross(a, b)
    c = float(a @ b)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def halfway(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """The rotation halfway between two."""
    qa, qb = quaternion(a), quaternion(b)
    if qa @ qb < 0:
        qb = -qb
    return turn((qa + qb) / np.linalg.norm(qa + qb))


class Carrier:
    """Carries a source's poses onto the jointed body `model` is (its <model>Model.ts, for the
    lengths of its legs). `stood` is the source standing, each bone in the world (4x4, its turn's
    columns unit), and `along` the way each of T_POSE's bones runs in it (a unit vector)."""

    def __init__(self, model: str, stood: dict[str, np.ndarray], along: dict[str, np.ndarray]) -> None:
        text = (CLIENT / f"src/render/avatars/{model}Model.ts").read_text()
        self.pivot = {
            bone: np.array([float(v) for v in at.split(",")])
            for bone, at in re.findall(r"^    (\w+): \[([^\]]+)\],$", text, re.M)
        }
        self.thigh = float(np.linalg.norm(self.pivot["shinR"] - self.pivot["legR"]))
        self.shin = float(np.linalg.norm(self.pivot["footR"] - self.pivot["shinR"]))
        self.stood = stood
        # Each source bone's turn in the T-pose, and what a leg and standing on the ground are to it.
        self.reference = {}
        for bone, _ in BONES:
            was = stood[bone][:3, :3]
            self.reference[bone] = (
                shortest(along[bone], np.array(T_POSE[bone], float)) @ was if bone in T_POSE else was
            )
        leg = float(np.linalg.norm(stood["footR"][:3, 3] - stood["legR"][:3, 3]))
        self.ground = float(stood["footR"][1, 3])
        self.scale = (self.thigh + self.shin) / leg

    def frame(self, pose: dict[str, np.ndarray]) -> Frame:
        """A pose of the source's (each bone in the world, as `stood` has them) as a frame."""
        pivot, thigh, shin, scale = self.pivot, self.thigh, self.shin, self.scale
        # The source's left is +x and the jointed body's right is +x: a mirror in x, under which a
        # turn R is M R M.
        mirror = np.diag([-1.0, 1, 1])
        world = {bone: mirror @ pose[bone][:3, :3] @ self.reference[bone].T @ mirror for bone, _ in BONES}
        world["spine"] = halfway(world["hips"], world["chest"])
        hips = mirror @ (pose["hips"][:3, 3] - self.stood["hips"][:3, 3]) * scale
        # Stood on the ground: the foot bearing the weight as far off it as the source's is.
        wanted, error = [], []
        for side in ("L", "R"):
            ankle = (
                pivot["hips"]
                + hips
                + world["hips"] @ (pivot[f"leg{side}"] - pivot["hips"])
                + world[f"leg{side}"] @ np.array([0, -thigh, 0])
                + world[f"shin{side}"] @ np.array([0, -shin, 0])
            )
            off = (pose[f"foot{side}"][1, 3] - self.ground) * scale
            wanted.append(off)
            error.append(pivot[f"foot{side}"][1] + off - ankle[1])
        weight = np.exp(-np.array(wanted) / 0.04)
        hips[1] += float(weight @ np.array(error) / weight.sum())
        turns = np.array([quaternion(world[parent].T @ world[b] if parent else world[b]) for b, parent in BONES])
        return hips / (thigh + shin), turns, (wanted[0], wanted[1])


def written(name: str, frames: list[Frame], fps: float) -> list[str]:
    """A clip's lines in a clips file."""
    turns = np.array([f[1] for f in frames])
    for k in range(1, len(turns)):  # each bone's turn on the same side of the sphere as its last
        flip = np.sum(turns[k] * turns[k - 1], axis=1) < 0
        turns[k][flip] *= -1
    hips = np.array([f[0] for f in frames])
    print(f"{name}: {len(frames)} frames, hips {hips.min(axis=0).round(2)} to {hips.max(axis=0).round(2)} legs")
    return [
        f"  {name}: {{",
        f"    fps: {fps:g},",
        f"    frames: {len(frames)},",
        f"    hips: '{base64.b64encode(np.round(hips * 1000).astype('<i2').tobytes()).decode()}',",
        f"    turns: '{base64.b64encode(np.round(turns * 32767).astype('<i2').tobytes()).decode()}',",
        "  },",
    ]
