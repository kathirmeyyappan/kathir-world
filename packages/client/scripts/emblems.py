"""Draws the emblems made here (render/liveries.ts): each a disc filling the picture, the shape of
Mario Kart 8's emblems (which kart-model.py takes from that game for the Mario family), with a
mark in its middle.

    pip install pillow
    python packages/client/scripts/emblems.py

It writes public/assets/textures/emblems/<emblem>.png for every row of EMBLEMS: the disc's colour
and the mark on it, a picture (`picture`) or one drawn here (`kw_mark`). A character's mark is a
picture of them or of something of theirs, cut out of its background and kept in scripts/marks/ at a few
times the size it's drawn; one is drawn only where there's nothing to go off.

The default emblem's letters are in INK, a red the client paints over with a livery's primary
(liveries.ts `emblemPixels`), so the one picture serves every colour.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

CLIENT = Path(__file__).resolve().parents[1]
OUT = CLIENT / "public" / "assets" / "textures" / "emblems"
MARKS = Path(__file__).resolve().parent / "marks"

SIZE = 64  # px: an emblem's picture, each side
FINE = 8  # times that size it's drawn at, then brought down, so its edges come out smooth
WHITE = (255, 255, 255)
DARK = (29, 29, 31)
INK = (255, 0, 0)  # what the client paints over: pure red, which nothing else in a picture is
OUTLINE = 1.25  # px of the picture: the dark line round an inked mark, which keeps a pale primary in sight
STROKE = 2.8  # grid squares (32 to the disc): how thick a drawn letter's strokes are


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


def strokes(size: tuple[float, float], unit: int, *lines: list[tuple[float, float]]) -> Image.Image:
    """A slab letter `size` grid squares across and down, as a mask: each of `lines` a stroke through
    its points, STROKE wide, cut square where it runs past the letter's top and bottom."""
    letter = Image.new("L", (round(size[0] * unit), round(size[1] * unit)), 0)
    draw = ImageDraw.Draw(letter)
    for line in lines:
        draw.line([(x * unit, y * unit) for x, y in line], fill=255, width=round(STROKE * unit), joint="curve")
    return letter


def kw_mark() -> Image.Image:
    """K over W on a diagonal, the K upper left and the W lower right, in INK with a dark line
    round them."""
    unit = SIZE * FINE // 32  # the letters are drawn on a grid of 32 to the disc
    k = strokes((9.5, 11), unit, [(1.4, -2), (1.4, 13)], [(1.4, 6.6), (8.6, -2)], [(3.2, 4.6), (8.6, 13)])
    w = strokes((13, 11), unit, [(0.6, -3), (3.6, 12.5), (6.5, 2.5), (9.4, 12.5), (12.4, -3)])
    edge = round(OUTLINE * FINE)
    shape = Image.new("L", (round(21.5 * unit) + 2 * edge, round(21.5 * unit) + 2 * edge), 0)
    shape.paste(k, (edge, edge))
    shape.paste(w, (shape.width - edge - w.width, shape.height - edge - w.height))
    mark = Image.new("RGBA", shape.size, (0, 0, 0, 0))
    mark.paste(DARK, mask=shape.filter(ImageFilter.MaxFilter(2 * edge + 1)))
    mark.paste(INK, mask=shape)
    return mark


EMBLEMS: dict[str, Emblem] = {
    "kw": Emblem(WHITE, kw_mark),  # the default: every look with no emblem of its own
    "elizabeth": Emblem(DARK, picture(CLIENT / "public" / "assets" / "elizabeth.ico", 0.74)),  # the site's logo
    "spongebob": Emblem(WHITE, picture(MARKS / "krabby-patty.png", 0.8)),  # a Krabby Patty, as the show draws it
    "krabs": Emblem(WHITE, picture(MARKS / "dollar.png", 0.86)),  # a Bikini Bottom dollar
    "squidward": Emblem(WHITE, picture(MARKS / "clarinet.png", 0.78)),  # his clarinet
    "puff": Emblem(WHITE, picture(MARKS / "puff.png", 0.84)),  # herself, cross, out of a frame of the show
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
