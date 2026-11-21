"""Draws the emblems made here (render/liveries.ts): each the off-white disc of Mario Kart 8's
emblems, which kart-model.py takes from that game for the Mario family, filling the picture, with
a mark in its middle.

    pip install pillow
    python packages/client/scripts/emblems.py

It writes public/assets/textures/emblems/<emblem>.png for every row of EMBLEMS: the picture its
mark is, and how much of the disc it takes up.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

CLIENT = Path(__file__).resolve().parents[1]
OUT = CLIENT / "public" / "assets" / "textures" / "emblems"

SIZE = 64  # px: an emblem's picture, each side
FINE = 8  # times that size it's drawn at, then brought down, so its edges come out smooth
DISC = (203, 204, 203)  # the off-white of Mario Kart 8's badges

# Each emblem's mark: its picture, and the share of the disc's width its longer side takes.
EMBLEMS: dict[str, tuple[Path, float]] = {
    # The site's logo: the emblem of every look with none of its own.
    "elizabeth": (CLIENT / "public" / "assets" / "elizabeth.ico", 0.74),
}


def mark(path: Path, share: float) -> Image.Image:
    """The picture at `path`, cut to what's drawn of it, its longer side `share` of the disc across."""
    image = Image.open(path).convert("RGBA")
    image = image.crop(image.getbbox())
    scale = share * SIZE * FINE / max(image.size)
    return image.resize([round(side * scale) for side in image.size], Image.Resampling.LANCZOS)


def emblem(path: Path, share: float) -> Image.Image:
    side = SIZE * FINE
    badge = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse([0, 0, side - 1, side - 1], fill=DISC)
    drawn = mark(path, share)
    badge.alpha_composite(drawn, ((side - drawn.width) // 2, (side - drawn.height) // 2))
    return badge.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (picture, share) in EMBLEMS.items():
        path = OUT / f"{name}.png"
        emblem(picture, share).save(path, optimize=True)
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
