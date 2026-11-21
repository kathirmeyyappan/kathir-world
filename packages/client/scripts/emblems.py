"""Draws the emblems made here (render/liveries.ts): each a disc filling the picture, the shape of
Mario Kart 8's emblems (which kart-model.py takes from that game for the Mario family), with a
mark in its middle.

    pip install pillow
    python packages/client/scripts/emblems.py

It writes public/assets/textures/emblems/<emblem>.png for every row of EMBLEMS: the disc's colour
and the mark on it, a picture (`picture`) or one drawn here (`k_mark`).

The default emblem's K is in INK, a red the client paints over with a livery's primary
(liveries.ts `emblemPixels`), so the one picture serves every colour.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

CLIENT = Path(__file__).resolve().parents[1]
OUT = CLIENT / "public" / "assets" / "textures" / "emblems"

SIZE = 64  # px: an emblem's picture, each side
FINE = 8  # times that size it's drawn at, then brought down, so its edges come out smooth
WHITE = (255, 255, 255)
DARK = (29, 29, 31)
INK = (255, 0, 0)  # what the client paints over: pure red, which nothing else in a picture is
OUTLINE = 1.25  # px of the picture: the dark line round an inked mark, which keeps a pale primary in sight


@dataclass(frozen=True)
class Emblem:
    disc: tuple[int, int, int]
    mark: Callable[[], Image.Image]  # the mark's picture, clear round it, to centre on the disc


def picture(path: Path, share: float) -> Callable[[], Image.Image]:
    """The picture at `path`, cut to what's drawn of it, its longer side `share` of the disc across."""

    def mark() -> Image.Image:
        image = Image.open(path).convert("RGBA")
        image = image.crop(image.getbbox())
        scale = share * SIZE * FINE / max(image.size)
        return image.resize([round(side * scale) for side in image.size], Image.Resampling.LANCZOS)

    return mark


def k_mark() -> Image.Image:
    """A slab K in INK with a dark line round it: a stem and two arms, cut square top and bottom."""
    unit = SIZE * FINE // 32  # the K is drawn on a grid of 32 to the disc
    width, height = 15 * unit, 18 * unit
    shape = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(shape)
    draw.rectangle([0, 0, 5 * unit - 1, height - 1], fill=255)  # stem
    draw.line([(3 * unit, 9.5 * unit), (14 * unit, -2 * unit)], fill=255, width=5 * unit)  # upper arm
    draw.line([(4 * unit, 7.5 * unit), (14 * unit, 20 * unit)], fill=255, width=5 * unit)  # lower arm
    edge = round(OUTLINE * FINE)
    padded = Image.new("L", (width + 2 * edge, height + 2 * edge), 0)
    padded.paste(shape, (edge, edge))
    mark = Image.new("RGBA", padded.size, (0, 0, 0, 0))
    mark.paste(DARK, mask=padded.filter(ImageFilter.MaxFilter(2 * edge + 1)))
    mark.paste(INK, mask=padded)
    return mark


EMBLEMS: dict[str, Emblem] = {
    "k": Emblem(WHITE, k_mark),  # the default: every look with no emblem of its own
    "elizabeth": Emblem(DARK, picture(CLIENT / "public" / "assets" / "elizabeth.ico", 0.74)),  # the site's logo
}


def draw(emblem: Emblem) -> Image.Image:
    side = SIZE * FINE
    badge = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse([0, 0, side - 1, side - 1], fill=emblem.disc)
    mark = emblem.mark()
    badge.alpha_composite(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    return badge.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, emblem in EMBLEMS.items():
        path = OUT / f"{name}.png"
        draw(emblem).save(path, optimize=True)
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
