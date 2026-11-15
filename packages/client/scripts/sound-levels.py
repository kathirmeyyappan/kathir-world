"""Audits how loud the game's sounds are beside each other: every sound in audio/Sfx.ts SOUNDS, by
the set it belongs to, with a flag on any that stands out from its set.

    pip install numpy          (and ffmpeg on the path)
    python packages/client/scripts/sound-levels.py

A sound's loudness is taken over its sounding part alone: the file through the K-weighting filter
of ITU-R BS.1770 (which weighs it as hearing does), in 50 ms blocks, counting only the blocks within
10 dB of the mean of all of them, so the silence round a clip, a gap inside it and a long tail don't
drag it down as they do a plain mean. What it plays at is that plus its `volume`.

A set is the sounds a player hears as one kind of thing and so compares: one character's hit cry
beside another's, one footstep beside the next. Within a set every sound should play within
TOLERANCE of the set's middle; the script exits 1 if one doesn't. Level a new clip's file to its
set's loudness and give it the set's `volume`: a `volume` of its own to make up for a quiet file is
what this catches. Sounds that are meant to differ from their neighbours (a soft landing and a hard
one, the two guns, the light and heavy plop of a tentacle) are in no set and only listed.
"""

from __future__ import annotations

import math
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

CLIENT = Path(__file__).resolve().parents[1]
RATE = 48000
TOLERANCE = 1.5  # dB a sound may play from the middle of its set
# BS.1770's K-weighting at 48 kHz: the shelf, then the high-pass, each as (b, a).
SHELF = ((1.53512485958697, -2.69169618940638, 1.19839281085285), (1.0, -1.69065929318241, 0.73248077421585))
HIGH = ((1.0, -2.0, 1.0), (1.0, -1.99004745483398, 0.99007225036621))
VOICE = re.compile(r"[a-z]+-(jump|leap|hurt|kill|enter|death)(-\d+)?$")  # a character's line (audio/voices.ts)
SETS = {  # a set's name, and the sounds in it
    "footstep": re.compile(r"step-\d$"),
    "sand step": re.compile(r"crunch-\d$"),
    "near miss": re.compile(r"whiz-\d$"),
    "roar": re.compile(r"(colgera-)?roar-\d$"),
    "roar from afar": re.compile(r"colgera-roar-far-\d$"),
}


def biquad(b: tuple[float, ...], a: tuple[float, ...], x: np.ndarray) -> np.ndarray:
    y = np.zeros(len(x))
    x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        out = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        x2, x1, y2, y1 = x1, v, y1, out
        y[i] = out
    return y


def samples(path: Path, seconds: float = 20) -> np.ndarray:
    """A file's first `seconds`, mono at RATE."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-t", str(seconds), "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def loudness(x: np.ndarray) -> float:
    """The loudness of the sounding part of `x`, dB."""
    k = biquad(*HIGH, biquad(*SHELF, x))
    size, hop = RATE // 20, RATE // 100
    blocks = np.array([np.mean(k[i : i + size] ** 2) for i in range(0, max(1, len(k) - size + 1), hop)])
    blocks = blocks[blocks > 1e-7]
    return float(10 * np.log10(np.mean(blocks[blocks > np.mean(blocks) / 10])))


def set_of(sound: str) -> str | None:
    voiced = VOICE.match(sound)
    if voiced:
        return f"voice: {voiced.group(1)}"
    return next((name for name, pattern in SETS.items() if pattern.match(sound)), None)


def main() -> int:
    source = (CLIENT / "src/audio/Sfx.ts").read_text()
    table = source[source.index("const SOUNDS") :]
    table = table[: table.index("\n};")]
    sets: dict[str | None, list[tuple[str, float, float, float]]] = defaultdict(list)
    for sound, spec in re.findall(r"^  '?([\w-]+)'?: \{(.*?)\}", table, re.S | re.M):
        file = re.search(r"file: '([^']+)'", spec)
        volume = re.search(r"volume: ([\d.]+)", spec)
        assert file and volume, sound
        level = loudness(samples(CLIENT / "public/assets/sounds" / file.group(1)))
        sets[set_of(sound)].append((sound, level, float(volume.group(1)), level + 20 * math.log10(float(volume.group(1)))))
    off = 0
    for name in sorted(sets, key=lambda n: (n is None, n or "")):
        rows = sets[name]
        middle = float(np.median([played for *_, played in rows]))
        print(f"\n{name or 'in no set'}" + ("" if name is None else f" (plays at {middle:.1f} dB)"))
        for sound, level, volume, played in rows:
            out = name is not None and abs(played - middle) > TOLERANCE
            off += out
            print(f"  {sound:22s} file {level:6.1f} dB  volume {volume:<5}  plays {played:6.1f} dB" + ("   <-- stands out" if out else ""))
    print(f"\n{off} stand out" if off else "\nevery set is level")
    return 1 if off else 0


if __name__ == "__main__":
    sys.exit(main())
