"""Draws the emblems of the looks that no game gives a badge (render/liveries.ts): each the off-white
disc of Mario Kart 8's emblems, which kart-model.py takes from that game for the Mario family,
filling the picture, with the look's mark in its middle.

    pip install pillow
    python packages/client/scripts/emblems.py

It writes public/assets/textures/emblems/<emblem>.png for every row of EMBLEMS. A mark is a picture
to set on the disc (`picture`), or drawn here (`standard_mark`): a new one is a row.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from PIL import Image, ImageDraw

CLIENT = Path(__file__).resolve().parents[1]
OUT = CLIENT / "public" / "assets" / "textures" / "emblems"

SIZE = 64  # px: an emblem's picture, each side
FINE = 8  # times that size it's drawn at, then brought down, so its edges come out smooth
DISC = (203, 204, 203)  # the off-white of Mario Kart 8's badges
INK = (29, 29, 31)  # the black a mark drawn here is in

Mark = Callable[[], Image.Image]  # a mark's picture, clear round it, to centre on the disc


def picture(path: Path, share: float) -> Mark:
    """The picture at `path`, cut to what's drawn of it, its longer side `share` of the disc across."""

    def mark() -> Image.Image:
        image = Image.open(path).convert("RGBA")
        image = image.crop(image.getbbox())
        scale = share * SIZE * FINE / max(image.size)
        return image.resize([round(side * scale) for side in image.size], Image.Resampling.LANCZOS)

    return mark


def standard_mark() -> Image.Image:
    """The standard body from the front, as a mark: its square head with the visor across it, over
    its chest and its arms."""
    unit = SIZE * FINE // 32  # the mark is drawn on a grid of 32 to the disc
    mark = Image.new("RGBA", (18 * unit, 20 * unit), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mark)
    box = lambda x0, y0, x1, y1, ink: draw.rectangle([x0 * unit, y0 * unit, x1 * unit - 1, y1 * unit - 1], fill=ink)
    box(5, 0, 13, 8, INK)  # head
    box(6, 2, 12, 4, DISC)  # visor
    box(4, 9, 14, 20, INK)  # chest
    box(0, 9, 3, 18, INK)  # arms
    box(15, 9, 18, 18, INK)
    return mark


EMBLEMS: dict[str, Mark] = {
    "standard": standard_mark,
    "elizabeth": picture(CLIENT / "public" / "assets" / "elizabeth.ico", 0.74),  # the site's logo
}


def emblem(mark: Mark) -> Image.Image:
    side = SIZE * FINE
    badge = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse([0, 0, side - 1, side - 1], fill=DISC)
    drawn = mark()
    badge.alpha_composite(drawn, ((side - drawn.width) // 2, (side - drawn.height) // 2))
    return badge.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, mark in EMBLEMS.items():
        path = OUT / f"{name}.png"
        emblem(mark).save(path, optimize=True)
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
