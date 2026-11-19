"""Reads what kart-clips.py needs of a Mario Kart 8 Deluxe driver's file (romfs/Driver/<Name>.szs):
a Yaz0-packed Switch BFRES (version 0.5.0.3) holding the driver's models, their skeleton, and its
skeletal animations, laid out as Switch Toolbox and BfresLibrary read them.

A skeleton's bones each carry their rest transform, and an animation's bones theirs where it moves
them, each channel a curve of keys or held at its base value: a scale, a rotation (XYZ Euler angles
in radians, X turned first, then Y, then Z) and a translation, in MK8's units (a tenth of a metre
or so: Mario stands 15.42 of them). `pose` stands a skeleton at a frame of an animation: every
bone's transform in the skeleton's frame.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np


def yaz0(b: bytes) -> bytes:
    """A Yaz0-packed file unpacked."""
    assert b[:4] == b"Yaz0", "not Yaz0"
    size = struct.unpack(">I", b[4:8])[0]
    out = bytearray()
    i = 16
    while len(out) < size:
        code = b[i]
        i += 1
        for bit in range(8):
            if len(out) >= size:
                break
            if code & (0x80 >> bit):
                out.append(b[i])
                i += 1
                continue
            b1, b2 = b[i], b[i + 1]
            i += 2
            back = ((b1 & 0xF) << 8 | b2) + 1
            n = b1 >> 4
            if n == 0:
                n = b[i] + 0x12
                i += 1
            else:
                n += 2
            for _ in range(n):
                out.append(out[-back])
    return bytes(out)


class Reader:
    def __init__(self, b: bytes) -> None:
        self.b = b

    def u8(self, o: int) -> int:
        return self.b[o]

    def u16(self, o: int) -> int:
        return struct.unpack_from("<H", self.b, o)[0]

    def i16(self, o: int) -> int:
        return struct.unpack_from("<h", self.b, o)[0]

    def u32(self, o: int) -> int:
        return struct.unpack_from("<I", self.b, o)[0]

    def i32(self, o: int) -> int:
        return struct.unpack_from("<i", self.b, o)[0]

    def at(self, o: int) -> int:
        return struct.unpack_from("<Q", self.b, o)[0]

    def floats(self, o: int, n: int) -> list[float]:
        return list(struct.unpack_from(f"<{n}f", self.b, o))

    def name(self, o: int) -> str:
        """The string an offset at `o` points to: a length, then its bytes."""
        at = self.at(o)
        return self.b[at + 2 : at + 2 + self.u16(at)].decode() if at else ""


@dataclass
class Bone:
    name: str
    parent: int  # index, -1 for the root
    scale: np.ndarray
    rotate: np.ndarray  # Euler XYZ, radians
    translate: np.ndarray


@dataclass
class Curve:
    channel: tuple[str, int]  # ("s", "r" or "t", and which of x, y, z)
    cubic: bool  # each key a cubic over its span, else a straight line
    frames: list[float]
    keys: list[list[float]]  # each key's coefficients, scaled and offset

    def at(self, frame: float) -> float:
        i = 0
        while i + 1 < len(self.frames) and self.frames[i + 1] <= frame:
            i += 1
        span = self.frames[i + 1] - self.frames[i] if i + 1 < len(self.frames) else 0.0
        t = (frame - self.frames[i]) / span if span > 0 else 0.0
        c = self.keys[i]
        return c[0] + c[1] * t + c[2] * t * t + c[3] * t**3 if self.cubic else c[0] + c[1] * t


@dataclass
class Moving:
    """What an animation does to a bone: its channels where they hold still, and its curves."""

    base: dict[str, list[float]]
    curves: list[Curve]


@dataclass
class Animation:
    name: str
    frames: int
    bones: dict[str, Moving]


# A curve's target, a byte offset in a bone's transform as an animation lays it out.
CHANNELS = {
    0x04: ("s", 0),
    0x08: ("s", 1),
    0x0C: ("s", 2),
    0x10: ("t", 0),
    0x14: ("t", 1),
    0x18: ("t", 2),
    0x20: ("r", 0),
    0x24: ("r", 1),
    0x28: ("r", 2),
}
EULER = 0x1000  # a skeleton's or an animation's flag: rotations are Euler angles, not quaternions


def curve(r: Reader, o: int) -> Curve:
    frames_at, keys_at = r.at(o), r.at(o + 8)
    flags, n, target = r.u16(o + 16), r.u16(o + 18), r.u32(o + 20)
    scale, offset = r.floats(o + 32, 2)
    frame_type, key_type, kind = flags & 3, (flags >> 2) & 3, (flags >> 4) & 7
    assert kind in (0, 1), f"curve kind {kind}: only cubic and linear are read"
    if frame_type == 0:
        frames = r.floats(frames_at, n)
    elif frame_type == 1:
        frames = [r.i16(frames_at + 2 * i) / 32 for i in range(n)]
    else:
        frames = [float(r.u8(frames_at + i)) for i in range(n)]
    per = 4 if kind == 0 else 2
    if key_type == 0:
        raw = r.floats(keys_at, n * per)
    elif key_type == 1:
        raw = [float(r.i16(keys_at + 2 * i)) for i in range(n * per)]
    else:
        raw = [float(struct.unpack_from("<b", r.b, keys_at + i)[0]) for i in range(n * per)]
    keys = [
        [offset + c[0] * scale] + [x * scale for x in c[1:]] for c in (raw[i * per : (i + 1) * per] for i in range(n))
    ]
    return Curve(CHANNELS[target], kind == 0, frames, keys)


def read(packed: bytes) -> tuple[list[Bone], dict[str, Animation]]:
    """A driver's file's skeleton (its body's: the model with the most bones, the rest being the
    likes of its eyes' pupils) and its skeletal animations by name."""
    b = yaz0(packed) if packed[:4] == b"Yaz0" else packed
    r = Reader(b)
    assert b[:4] == b"FRES", "not a BFRES"
    models_at, anims_at = r.at(0x28), r.at(0x38)
    n_models, n_anims = r.u16(0xBC), r.u16(0xBE)

    skeletons = [r.at(models_at + i * 0x78 + 0x20) for i in range(n_models)]
    skeleton = max(skeletons, key=lambda o: r.u16(o + 0x3C))
    assert b[skeleton : skeleton + 4] == b"FSKL"
    assert r.u32(skeleton + 0x38) & EULER, "a skeleton with quaternions"
    bones_at, n_bones = r.at(skeleton + 0x18), r.u16(skeleton + 0x3C)
    bones = []
    for i in range(n_bones):
        o = bones_at + i * 0x50
        f = r.floats(o + 0x28, 10)
        bones.append(Bone(r.name(o), r.i16(o + 0x1A), np.array(f[0:3]), np.array(f[3:6]), np.array(f[7:10])))

    anims = {}
    for k in range(n_anims):
        a = anims_at + k * 0x60
        assert b[a : a + 4] == b"FSKA"
        assert r.u32(a + 0x48) & EULER, "an animation with quaternions"
        moving = {}
        for i in range(r.u16(a + 0x58)):
            o = r.at(a + 0x30) + i * 0x28
            flags = r.u32(o + 0x18)
            base, at = {}, r.at(o + 0x10)
            for channel, bit, n in (("s", 0x8, 3), ("r", 0x10, 4), ("t", 0x20, 3)):
                if flags & bit:
                    base[channel] = r.floats(at, n)[:3]
                    at += 4 * n
            curves = [curve(r, r.at(o + 8) + j * 0x30) for j in range(r.u8(o + 0x1E))]
            moving[r.name(o)] = Moving(base, curves)
        name = r.name(a + 0x10)
        anims[name] = Animation(name, r.i32(a + 0x4C), moving)
    return bones, anims


def euler(r: np.ndarray) -> np.ndarray:
    """XYZ Euler angles as a rotation matrix: about x first, then y, then z."""
    cx, cy, cz = np.cos(r)
    sx, sy, sz = np.sin(r)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx


def pose(bones: list[Bone], anim: Animation | None, frame: float) -> dict[str, np.ndarray]:
    """Every bone placed in the skeleton's frame (4x4, scale left out) at `frame` of `anim`, or
    at rest with none: its rest transform wherever the animation doesn't move it."""
    world: list[np.ndarray] = []
    for bone in bones:
        r, t = bone.rotate.copy(), bone.translate.copy()
        moving = anim.bones.get(bone.name) if anim else None
        if moving:
            r = np.array(moving.base.get("r", r))
            t = np.array(moving.base.get("t", t))
            for c in moving.curves:
                kind, i = c.channel
                if kind == "r":
                    r[i] = c.at(frame)
                elif kind == "t":
                    t[i] = c.at(frame)
        local = np.eye(4)
        local[:3, :3] = euler(r)
        local[:3, 3] = t
        world.append(world[bone.parent] @ local if bone.parent >= 0 else local)
    return {bone.name: m for bone, m in zip(bones, world)}
