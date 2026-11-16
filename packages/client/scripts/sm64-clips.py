"""Builds render/avatars/sm64Clips.ts: how Mario moves, as Super Mario 64 moved him, which is how
his family moves wherever one of them has no clips of its own (render/avatars/sm64.ts).

    pip install numpy pillow fast_simplification
    python packages/client/scripts/sm64-clips.py path/to/mario64.glb

The source is the Nostalgia64 Project's "Mario - Super Mario 64 (Rigged, Animated)" on Sketchfab,
downloaded as a .glb: the game's own Mario on the game's own skeleton (a pelvis, a torso, a head,
and an arm and a leg a side of three bones each, every bone running along its own +x) with the
game's animations, 30 frames a second. This takes the handful a body on foot needs (CLIPS) and
writes each for a jointed body's skeleton (render/avatars/Jointed.ts), which stands in a T-pose
with every bone unturned.

The source has no T-pose, but it has an A-pose (standing, arms down and out), which is the standing
pose its bones are carried over from (clips.py says how). The jointed body's chest takes the
source's torso. A stride is turned round to start as its right foot comes down, which is where the
footsteps count a stride from.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from clips import BONES, CLIENT, T_POSE, Carrier, Frame, turn, written
from glb import accessor, read_glb

FPS = 30

# The source's bone each of the jointed body's takes (its node's name in the file).
NODES = {
    "hips": "002-rotate_36",
    "spine": "000-offset.001_35",
    "chest": "000-offset.001_35",
    "head": "000-offset.002_17",
    "armL": "000-offset.003_24",
    "forearmL": "000-offset.004_23",
    "handL": "000-offset.005_21",
    "armR": "000-offset.006_33",
    "forearmR": "000-offset.007_32",
    "handR": "000-offset.008_30",
    "legL": "000-offset.009_39",
    "shinL": "000-offset.010_38",
    "footL": "000-offset.011_37",
    "legR": "000-offset.012_46",
    "shinR": "000-offset.013_45",
    "footR": "000-offset.014_44",
}
A_POSE = "14 - A pose"


@dataclass(frozen=True)
class Clip:
    source: str | tuple[str, ...]  # the animation's name in the file, or several played end to end
    first: int  # its frames of each source's, first to last
    last: int
    every: int = 1  # every how many of them are kept
    stride: bool = False  # a walk's cycle: turned round to start as the right foot comes down
    then: tuple[tuple[str, int, int], ...] = ()  # more played after it: each an animation and its frames, first to last


CLIPS = {
    # The game's idle is three animations in turn, each a breath: the head round to the left, across
    # to the right, and back to the middle, each starting where the last left it.
    "idle": Clip(("195 - Idle head left", "196 - Idle head right", "197 - Idle head center"), 0, 29, 2),
    "walk": Clip("72 - Walking", 0, 75, 2, stride=True),
    "run": Clip("114/115 - Running/Running (unused)", 0, 71, 2, stride=True),
    "jump": Clip("77/78 - Single jump/Land from single jump", 0, 12),
    "fall": Clip("86/87 - General fall/General land", 4, 4),
    "land": Clip("77/78 - Single jump/Land from single jump", 24, 37),
    "leap": Clip("19 - Fast longjump", 0, 22),
    # A chain of jumps' second, going up and coming down, and its third, the whole flight: a
    # somersault or two.
    "double": Clip("80 - Double jump rise", 0, 5),
    "doubleFall": Clip("76 - Double jump fall", 0, 8),
    "triple": Clip("193 - Triple jump", 0, 35),
    # A ground pound: turning over in the air, into the seat it drops in; then landing sat, and (the
    # game's stop from a slide, from where it starts to rise) getting back up.
    "pound": Clip("60/61 - Start ground-pound/Ground-pound", 0, 10),
    "pounded": Clip("58 - Ground pound landing", 0, 5, then=(("142/143 - Slide motionless/Stop slide", 4, 19),)),
    # A crouch: sat low on its heels, hardly moving; crawling from it on hands and knees, a cycle of
    # its limbs from its right hand coming down, its left coming down halfway through; and the jump
    # out of it, a backward somersault, the whole flight.
    "crouch": Clip("152 - Crouching", 0, 89, 6),
    "crawl": Clip("153 - Crawling", 86, 91, 2, then=(("153 - Crawling", 0, 85),)),
    "backflip": Clip("4 - Backflip", 0, 32),
    # Dying where it stands: reeling, then over onto its back, where its last frame leaves it.
    "die": Clip("50 - Dying fall over", 0, 94, 2),
    # And of a fall: flat on its back where it landed, its head coming up and dropping.
    "fallen": Clip("3 - Dying on back", 0, 62, 2),
}


class Source:
    """The file's skeleton and animations: where each node is in the world at a frame of one."""

    def __init__(self, path: str) -> None:
        self.doc, self.blob = read_glb(Path(path).read_bytes())
        self.nodes = self.doc["nodes"]
        self.parent = {c: i for i, n in enumerate(self.nodes) for c in n.get("children", [])}
        self.named = {n.get("name"): i for i, n in enumerate(self.nodes)}
        self.animations = {a["name"]: a for a in self.doc["animations"]}
        self.keys: dict[str, dict[int, dict[str, tuple[np.ndarray, np.ndarray, str]]]] = {}

    def channels(self, name: str) -> dict[int, dict[str, tuple[np.ndarray, np.ndarray, str]]]:
        if name not in self.keys:
            animation = self.animations[name]
            out: dict[int, dict[str, tuple[np.ndarray, np.ndarray, str]]] = {}
            for channel in animation["channels"]:
                sampler = animation["samplers"][channel["sampler"]]
                out.setdefault(channel["target"]["node"], {})[channel["target"]["path"]] = (
                    accessor(self.doc, self.blob, sampler["input"]).ravel().astype(float),
                    accessor(self.doc, self.blob, sampler["output"]).astype(float),
                    sampler.get("interpolation", "LINEAR"),
                )
            self.keys[name] = out
        return self.keys[name]

    def pose(self, name: str, time: float) -> dict[str, np.ndarray]:
        """Each of the body's bones in the world (4x4, its turn's columns unit) `time` into an animation."""
        channels = self.channels(name)
        world: dict[int, np.ndarray] = {}

        def local(i: int) -> np.ndarray:
            node = self.nodes[i]
            if "matrix" in node:
                return np.array(node["matrix"], float).reshape(4, 4).T
            at = {
                "translation": np.array(node.get("translation", [0, 0, 0]), float),
                "rotation": np.array(node.get("rotation", [0, 0, 0, 1]), float),
                "scale": np.array(node.get("scale", [1, 1, 1]), float),
            }
            for path, (times, values, how) in channels.get(i, {}).items():
                k = int(np.clip(np.searchsorted(times, time, side="right") - 1, 0, len(times) - 1))
                k2 = min(len(times) - 1, k + 1)
                f = 0.0 if times[k2] == times[k] or how == "STEP" else float(np.clip((time - times[k]) / (times[k2] - times[k]), 0, 1))
                a, b = values[k], values[k2]
                if path == "rotation" and a @ b < 0:
                    b = -b
                at[path] = a + (b - a) * f
            m = np.eye(4)
            m[:3, :3] = turn(at["rotation"] / np.linalg.norm(at["rotation"])) * at["scale"]
            m[:3, 3] = at["translation"]
            return m

        def placed(i: int) -> np.ndarray:
            if i not in world:
                world[i] = placed(self.parent[i]) @ local(i) if i in self.parent else local(i)
            return world[i]

        out = {}
        for bone, node in NODES.items():
            m = placed(self.named[node]).copy()
            m[:3, :3] /= np.linalg.norm(m[:3, :3], axis=0)
            out[bone] = m
        return out


def main(glb: str) -> None:
    source = Source(glb)
    # Every bone of the source runs along its own +x.
    stood = source.pose(A_POSE, 0)
    carrier = Carrier("mario", stood, {bone: stood[bone][:3, 0] for bone in T_POSE})

    def frame(name: str, k: int) -> Frame:
        return carrier.frame(source.pose(name, k / FPS))

    lines = [
        "// Generated by packages/client/scripts/sm64-clips.py from the Nostalgia64 Project's Mario - Super Mario 64"
        " (Rigged, Animated) (Sketchfab); don't edit.",
        "// Super Mario 64's own animations, carried onto a jointed body's skeleton (Jointed.ts). Each clip is its",
        "// frames, `fps` a second: `hips` where the hips are from standing straight (Int16 x, y, z in thousandths of a",
        "// leg's length) and `turns` each bone's turn in its parent, in `bones`' order (Int16 x, y, z, w over 32767);",
        "// both base64. A stride starts as the right foot comes down, and its left comes down halfway.",
        "export const SM64_CLIPS = {",
        f"  bones: [{', '.join(repr(b) for b, _ in BONES)}],",
    ]
    for name, clip in CLIPS.items():
        sources = (clip.source,) if isinstance(clip.source, str) else clip.source
        stretches = [(source, clip.first, clip.last) for source in sources] + list(clip.then)
        frames = [frame(source, k) for source, first, last in stretches for k in range(first, last + 1)]
        if clip.stride:
            # The right foot comes down on the first frame it's on the ground after being off it.
            right = np.array([f[2][1] for f in frames])
            down = right < 0.02
            start = next(k for k in range(len(frames)) if down[k] and not down[k - 1])
            frames = frames[start:] + frames[:start]
            left = np.array([f[2][0] for f in frames]) < 0.02
            other = next(k for k in range(1, len(frames)) if left[k] and not left[k - 1])
            print(f"{name}: right foot down on frame {clip.first + start}, left {other / len(frames):.2f} of the way on")
        lines += written(name, frames[:: clip.every], FPS / clip.every)
    lines += ["} as const;", ""]
    out = CLIENT / "src/render/avatars/sm64Clips.ts"
    out.write_text("\n".join(lines))
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main(sys.argv[1])
