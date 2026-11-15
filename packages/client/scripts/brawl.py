"""Reads a Super Smash Bros. Brawl fighter's files, as BrawlBox and brawllib_rs do: a model's bones
(an MDL0 in its FitXxx00.pac or .pcs) and its animations (the CHR0s in its FitXxxMotionEtc.pac).

A bone has a parent and, standing as the model was bound, a scale, a turn (degrees about x, then y,
then z) and a place in it. An animation gives some of the bones those three at every frame, 60 a
second, each as a constant or a track of keys in one of six packings; a bone it leaves out stays as
the model has it. Everything is big-endian, y up, facing +z, the fighter's left at +x.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np

FPS = 60


def u16(d: bytes, o: int) -> int:
    return int(struct.unpack_from(">H", d, o)[0])


def i16(d: bytes, o: int) -> int:
    return int(struct.unpack_from(">h", d, o)[0])


def u32(d: bytes, o: int) -> int:
    return int(struct.unpack_from(">I", d, o)[0])


def i32(d: bytes, o: int) -> int:
    return int(struct.unpack_from(">i", d, o)[0])


def f32(d: bytes, o: int) -> float:
    return float(struct.unpack_from(">f", d, o)[0])


def text(d: bytes, o: int) -> str:
    return d[o : d.index(b"\0", o)].decode("ascii", "replace")


def unpacked(d: bytes) -> bytes:
    """A file's archive: a .pcs is its .pac under Nintendo's LZ77, plain (0x10) or extended (0x11)."""
    if d[:3] == b"ARC":
        return d
    kind, size = d[0], d[1] | d[2] << 8 | d[3] << 16
    out, s, n = bytearray(size), 4, 0
    while n < size:
        control = d[s]
        s += 1
        for bit in range(7, -1, -1):
            if n >= size:
                break
            if not control & (1 << bit):
                out[n] = d[s]
                n, s = n + 1, s + 1
                continue
            count = (d[s] >> 4) + 3
            if kind == 0x11:
                nibble = d[s] >> 4
                if nibble == 1:
                    count = ((d[s] & 15) << 12 | d[s + 1] << 4 | d[s + 2] >> 4) + 0x111
                    s += 2
                elif nibble == 0:
                    count = ((d[s] & 15) << 4 | d[s + 1] >> 4) + 0x11
                    s += 1
                else:
                    count = nibble + 1
            back = ((d[s] & 15) << 8 | d[s + 1]) + 1
            s += 2
            for _ in range(min(count, size - n)):
                out[n] = out[n - back]
                n += 1
    return bytes(out)


def resources(d: bytes, o: int) -> list[tuple[str, int]]:
    """A resource group's entries: each one's name and where its data is from the group."""
    return [(text(d, o + i32(d, o + 16 * i + 16)), i32(d, o + 16 * i + 20)) for i in range(1, i32(d, o + 4) + 1)]


def tagged(d: bytes, tag: bytes) -> list[int]:
    """Where each resource of a kind (b"MDL0", b"CHR0") starts in an archive."""
    out, at = [], d.find(tag)
    while at >= 0:
        if 0 < i32(d, at + 4) <= len(d) - at and 0 <= i32(d, at + 8) < 16:
            out.append(at)
        at = d.find(tag, at + 4)
    return out


@dataclass(frozen=True)
class Bone:
    name: str
    parent: str | None
    scale: tuple[float, float, float]
    rot: tuple[float, float, float]
    at: tuple[float, float, float]


def bones(d: bytes, o: int) -> list[Bone]:
    """The bones of the model at `o`, a parent before its children."""
    group = o + i32(d, o + 0x14)
    out: list[Bone] = []

    def walk(at: int, parent: str | None) -> None:
        while True:
            name = text(d, at + i32(d, at + 8))
            v = struct.unpack_from(">9f", d, at + 0x20)
            out.append(Bone(name, parent, v[0:3], v[3:6], v[6:9]))
            child, following = i32(d, at + 0x60), i32(d, at + 0x64)
            if child:
                walk(at + child, name)
            if not following:
                return
            at += following

    walk(group + resources(d, group)[0][1], None)
    return out


@dataclass(frozen=True)
class Animation:
    name: str
    frames: int
    # Each bone it moves: its scale, its turn and its place at every frame (frames by 3), or None
    # for one it leaves at one, at none and at the parent's origin.
    bones: dict[str, tuple[np.ndarray | None, np.ndarray | None, np.ndarray | None]]


def hermite(keys: list[tuple[float, float, float]], frame: int) -> float:
    """A track of keys (each a frame, a value and a slope) at a frame: a cubic between the two round
    it. Two keys on neighbouring frames are a corner: the slope there is the straight line's."""
    before = [k for k in range(len(keys)) if keys[k][0] <= frame]
    after = [k for k in range(len(keys)) if keys[k][0] >= frame]
    if not before or not after:
        return keys[before[-1] if before else after[0]][1]
    a, b = before[-1], after[0]
    (fa, va, sa), (fb, vb, sb) = keys[a], keys[b]
    if fa == fb:
        return va
    span, off = fb - fa, frame - fa
    line = (vb - va) / span
    if span == 1 or (a > 0 and keys[a - 1][0] == fa - 1):
        sa = line
    if span == 1 or (b + 1 < len(keys) and keys[b + 1][0] == fb + 1):
        sb = line
    t = off / span
    return va + off * (t - 1) * ((t - 1) * sa + t * sb) + t * t * (3 - 2 * t) * (vb - va)


def channel(d: bytes, o: int, packing: int, frames: int) -> list[float]:
    """One number's track at `o`, at every frame."""
    if packing == 1:  # keys of 4 bytes: frame, step and slope
        step, base = f32(d, o + 8), f32(d, o + 12)
        keys = []
        for i in range(u16(d, o)):
            e = u32(d, o + 16 + 4 * i)
            slope = (e & 0xFFF) - (0x1000 if e & 0x800 else 0)
            keys.append((float(e >> 24), base + step * (e >> 12 & 0xFFF), slope / 32))
        return [hermite(keys, f) for f in range(frames)]
    if packing == 2:  # keys of 6 bytes
        step, base = f32(d, o + 8), f32(d, o + 12)
        keys = [
            (float(u16(d, k) >> 5), base + step * u16(d, k + 2), i16(d, k + 4) / 256)
            for k in range(o + 16, o + 16 + 6 * u16(d, o), 6)
        ]
        return [hermite(keys, f) for f in range(frames)]
    if packing == 3:  # keys of three floats
        keys = [(f32(d, k), f32(d, k + 4), f32(d, k + 8)) for k in range(o + 8, o + 8 + 12 * u16(d, o), 12)]
        return [hermite(keys, f) for f in range(frames)]
    if packing == 4:  # a byte a frame
        return [f32(d, o + 4) + f32(d, o) * d[o + 8 + f] for f in range(frames)]
    if packing == 5:  # two bytes a frame
        return [f32(d, o + 4) + f32(d, o) * u16(d, o + 8 + 2 * f) for f in range(frames)]
    return [f32(d, o + 4 * f) for f in range(frames)]  # a float a frame


def animation(d: bytes, o: int) -> Animation:
    """The animation at `o`."""
    group = o + i32(d, o + 0x10)
    frames = u16(d, o + 0x1C)
    moved = {}
    for name, off in resources(d, group):
        entry = group + off
        code = u32(d, entry + 4)
        slot = entry + 8
        tracks: list[np.ndarray | None] = []
        # For each of scale, turn and place: the bits that say it is there, is one number for all
        # three axes, is constant on each axis, and how its tracks are packed.
        for there, same, fixed, packing in ((22, 4, 13, code >> 25 & 3), (23, 5, 16, code >> 27 & 7), (24, 6, 19, code >> 30)):
            if not code >> there & 1:
                tracks.append(None)
                continue
            axes = []
            for axis in (2,) if code >> same & 1 else (0, 1, 2):
                if code >> (fixed + axis) & 1:
                    axes.append([f32(d, slot)] * frames)
                else:
                    axes.append(channel(d, entry + u32(d, slot), packing, frames))
                slot += 4
            tracks.append(np.array(axes * 3 if len(axes) == 1 else axes).T)
        moved[name] = (tracks[0], tracks[1], tracks[2])
    return Animation(text(d, o + i32(d, o + 0x14)), frames, moved)


def placed(scale: np.ndarray, rot: np.ndarray, at: np.ndarray) -> np.ndarray:
    """A bone in its parent (4x4): scaled, turned about x, then y, then z, and put in its place."""
    (sx, sy, sz), (cx, cy, cz) = np.sin(np.radians(rot)), np.cos(np.radians(rot))
    m = np.eye(4)
    m[:3, :3] = np.array(
        [
            [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
            [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
            [-sy, sx * cy, cx * cy],
        ]
    ) * np.asarray(scale)
    m[:3, 3] = at
    return m


def pose(skeleton: list[Bone], moving: Animation | None, frame: int, still: tuple[str, ...] = ()) -> dict[str, np.ndarray]:
    """Every bone in the world (4x4) at a frame of an animation, or as the model was bound with
    none; the bones in `still` go up and down but stay where they were bound across the floor (the
    bone a fighter's travel is on)."""
    world: dict[str, np.ndarray] = {}
    for bone in skeleton:
        scale, rot, at = np.array(bone.scale), np.array(bone.rot), np.array(bone.at)
        if moving and bone.name in moving.bones:
            s, r, t = moving.bones[bone.name]
            scale = np.ones(3) if s is None else s[frame]
            rot = np.zeros(3) if r is None else r[frame]
            moved = np.zeros(3) if t is None else t[frame]
            at = np.array([at[0], moved[1], at[2]]) if bone.name in still else moved
        m = placed(scale, rot, at)
        world[bone.name] = world[bone.parent] @ m if bone.parent else m
    return world
