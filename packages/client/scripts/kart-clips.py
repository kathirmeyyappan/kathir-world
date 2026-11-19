"""Builds render/avatars/<name>KartClips.ts for each of Mario's family: how each drives a kart, as
Mario Kart 8 Deluxe has them drive.

    pip install numpy
    python packages/client/scripts/kart-clips.py path/to/Driver

The folder holds each character's driver file from MK8 Deluxe (romfs/Driver/<Name>.szs, which
bfres.py reads): its skeleton, bound in a T-pose on the rig the jointed bodies' models were ripped
on, and its animations, 60 frames a second. Retexture mods carry them whole, the animations as the
game has them: Super Mario World Mario (GameBanana 397957), the Mario Texture Pack's Luigi and
Peach (249216), Prisoner Wario (720033), Black/Purple Waluigi (307211) and Fire Daisy (560315).

Each animation in CLIPS is carried onto that character's jointed body as clips.py says, sat rather
than stood on the ground, with its hips measured from where they sit driving straight on. Most are
steered: their frames run from the wheel full over to the right, through straight ahead halfway,
to full over to the left, and are kept every STEER_EVERY of them; the rest play through.

And a trick each way, `trickL` and `trickR`: of MK8's three (KartJumpA, B and C, which it picks
from at random, none of them a way), the one whose hips spin a whole turn that way, or the one
that spins the other way, mirrored.
"""

from __future__ import annotations

import sys
from pathlib import Path

import bfres
import numpy as np
from clips import BONES, CLIENT, Carrier, Frame, written

CHARACTERS = {
    "mario": "Mario",
    "luigi": "Luigi",
    "wario": "Wario",
    "waluigi": "Waluigi",
    "peach": "Peach",
    "daisy": "Daisy",
}
# The rig's joint each of the jointed body's bones takes (jointed-model.py BONES), and for the ones
# a T-pose turns, the joint its own runs to.
JOINTS = {
    "hips": "Hip",
    "spine": "Spine1",
    "chest": "Spine2",
    "head": "Head",
    "armL": "ArmL",
    "forearmL": "ElbowL",
    "handL": "HandL",
    "armR": "ArmR",
    "forearmR": "ElbowR",
    "handR": "HandR",
    "legL": "LegL",
    "shinL": "KneeL",
    "footL": "FootL",
    "legR": "LegR",
    "shinR": "KneeR",
    "footR": "FootR",
}
ENDS = {
    "armL": "ElbowL",
    "forearmL": "HandL",
    "handL": "Finger1L",
    "armR": "ElbowR",
    "forearmR": "HandR",
    "handR": "Finger1R",
    "legL": "KneeL",
    "shinL": "FootL",
    "legR": "KneeR",
    "shinR": "FootR",
}
# Each clip: the animation it's from, and whether it's steered.
CLIPS = {
    "drive": ("KartDrive", True),  # at the wheel
    "back": ("KartBack", True),  # reversing: one hand on the wheel, looking round behind
    "driftL": ("KartDriftL", True),  # drifting to the left
    "driftR": ("KartDriftR", True),
    "dash": ("KartDash", True),  # on a boost, leaning into it
    "hop": ("KartHop", True),  # the hop into a drift
    "damage": ("KartDamage", False),  # hit, hands off the wheel
    "wait": ("KartWait", False),  # stopped, breathing
}
TRICKS = ("KartJumpA", "KartJumpB", "KartJumpC")
WHOLE_TURN = 270  # degrees the hips spin, at least, for a trick to be a turn that way
FPS = 60  # an animation's frames a second
STEER_EVERY = 3  # of a steered animation's frames, kept every this many: a turn between is mixed
EVERY = 3  # and of one played through


def posed(skeleton: list[bfres.Bone], anim: bfres.Animation | None, frame: float) -> dict[str, np.ndarray]:
    """The jointed body's bones as the rig's joints stand at `frame` of `anim`, or at rest."""
    world = bfres.pose(skeleton, anim, frame)
    return {bone: world[joint] for bone, joint in JOINTS.items()}


def mirrored(pose: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """A pose of the jointed body's bones (each placed in the source's frame) mirrored in x: each
    bone where its twin across the body stood (armL where armR was), reflected."""
    flip = np.diag([-1.0, 1, 1, 1])
    twin = lambda bone: bone[:-1] + {"L": "R", "R": "L"}[bone[-1]] if bone[-1] in "LR" else bone
    return {bone: flip @ pose[twin(bone)] @ flip for bone in pose}


def spin(skeleton: list[bfres.Bone], anim: bfres.Animation) -> float:
    """Degrees the hips turn about the upright through `anim`, a frame at a time: a turn to the
    left positive (the source's left is +x, so a turn from +z toward it is about +y)."""
    total = 0.0
    last = bfres.pose(skeleton, anim, 0)["Hip"][:3, :3]
    for k in range(1, anim.frames + 1):
        now = bfres.pose(skeleton, anim, k)["Hip"][:3, :3]
        step = now @ last.T
        total += np.degrees(np.arctan2(step[0, 2] - step[2, 0], step[0, 0] + step[2, 2]))
        last = now
    return total


def tricks(
    skeleton: list[bfres.Bone], animations: dict[str, bfres.Animation]
) -> dict[str, tuple[bfres.Animation, bool]]:
    """Each way's trick, `trickL` and `trickR`: the animation that spins that way, and whether it's
    the other way's mirrored."""
    spins = {name: spin(skeleton, animations[name]) for name in TRICKS}
    left = next((n for n, s in spins.items() if s > WHOLE_TURN), None)
    right = next((n for n, s in spins.items() if s < -WHOLE_TURN), None)
    assert left or right, f"no trick spins a whole turn: {spins}"
    return {
        "trickL": (animations[left], False) if left else (animations[right or ""], True),
        "trickR": (animations[right], False) if right else (animations[left or ""], True),
    }


def main(folder: str) -> None:
    for model, name in CHARACTERS.items():
        skeleton, animations = bfres.read((Path(folder) / f"{name}.szs").read_bytes())
        rest = bfres.pose(skeleton, None, 0)
        along = {}
        for bone, end in ENDS.items():
            way = rest[end][:3, 3] - rest[JOINTS[bone]][:3, 3]
            along[bone] = way / np.linalg.norm(way)
        carrier = Carrier(model, posed(skeleton, None, 0), along)
        drive = animations["KartDrive"]
        sat = carrier.frame(posed(skeleton, drive, drive.frames / 2), on_feet=False)[0]

        lines = [
            f"// Generated by packages/client/scripts/kart-clips.py from {name}'s driver file in Mario Kart 8 Deluxe; don't edit.",
            f"// MK8's own animations of {name} in a kart, carried onto a jointed body's skeleton (Jointed.ts) in",
            "// the layout sm64Clips.ts has, the hips from where they sit driving straight on. A steered clip runs",
            "// from the wheel full over to the right to full over to the left; a trick plays through.",
            f"export const {model.upper()}_KART_CLIPS = {{",
            f"  bones: [{', '.join(repr(b) for b, _ in BONES)}],",
        ]
        for clip, (source, steered) in CLIPS.items():
            anim = animations[source]
            every = STEER_EVERY if steered else EVERY
            frames: list[Frame] = []
            for k in range(0, anim.frames + 1, every):
                hips, turns, off = carrier.frame(posed(skeleton, anim, k), on_feet=False)
                frames.append((hips - sat, turns, off))
            lines += written(f"{clip}", frames, FPS / every)
        for clip, (anim, flip) in tricks(skeleton, animations).items():
            frames = []
            for k in range(0, anim.frames + 1, EVERY):
                pose = posed(skeleton, anim, k)
                hips, turns, off = carrier.frame(mirrored(pose) if flip else pose, on_feet=False)
                frames.append((hips - sat, turns, off))
            print(f"{name} {clip}: {anim.name}{' mirrored' if flip else ''}")
            lines += written(clip, frames, FPS / EVERY)
        lines += ["} as const;", ""]
        out = CLIENT / f"src/render/avatars/{model}KartClips.ts"
        out.write_text("\n".join(lines))
        print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main(sys.argv[1])
