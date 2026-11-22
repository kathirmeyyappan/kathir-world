"""Draws the emblems made here (render/liveries.ts): each a disc filling the picture, the shape of
Mario Kart 8's emblems (which kart-model.py takes from that game for the Mario family), with a
mark in its middle.

    pip install pillow
    python packages/client/scripts/emblems.py

It writes public/assets/textures/emblems/<emblem>.png for every row of EMBLEMS: the disc's colour
and the mark on it, a picture (`picture`) or one drawn here (`kw_mark`, `spatula_mark`): a few
flat shapes with a dark line round them, which is all that reads at an emblem's size.

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

SIZE = 64  # px: an emblem's picture, each side
FINE = 8  # times that size it's drawn at, then brought down, so its edges come out smooth
WHITE = (255, 255, 255)
DARK = (29, 29, 31)
INK = (255, 0, 0)  # what the client paints over: pure red, which nothing else in a picture is
STEEL = (176, 184, 194)
WOOD = (168, 116, 36)
OUTLINE = 1.25  # px of the picture: the dark line round a drawn mark, which keeps a pale colour in sight
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


def outlined(*parts: tuple[Image.Image, tuple[int, int, int]]) -> Image.Image:
    """A mark of flat shapes, each a mask and its colour on one canvas, the later over the earlier,
    with a dark line OUTLINE wide round all of them."""
    edge = round(OUTLINE * FINE)
    size = parts[0][0].size
    shapes = Image.new("L", (size[0] + 2 * edge, size[1] + 2 * edge), 0)
    for mask, _ in parts:
        shapes.paste(255, (edge, edge), mask)
    mark = Image.new("RGBA", shapes.size, (0, 0, 0, 0))
    mark.paste(DARK, mask=shapes.filter(ImageFilter.MaxFilter(2 * edge + 1)))
    for mask, colour in parts:
        mark.paste(colour, (edge, edge), mask)
    return mark


def kw_mark() -> Image.Image:
    """K over W on a diagonal, the K upper left and the W lower right, in INK."""
    unit = SIZE * FINE // 32  # the letters are drawn on a grid of 32 to the disc
    k = strokes((9.5, 11), unit, [(1.4, -2), (1.4, 13)], [(1.4, 6.6), (8.6, -2)], [(3.2, 4.6), (8.6, 13)])
    w = strokes((13, 11), unit, [(0.6, -3), (3.6, 12.5), (6.5, 2.5), (9.4, 12.5), (12.4, -3)])
    letters = Image.new("L", (round(21.5 * unit),) * 2, 0)
    letters.paste(k, (0, 0))
    letters.paste(w, (letters.width - w.width, letters.height - w.height))
    return outlined((letters, INK))


def spatula_mark() -> Image.Image:
    """SpongeBob's spatula, tipped over to the right: a slotted steel blade on a neck, and a wooden
    handle."""
    unit = SIZE * FINE // 28  # drawn on a grid of 28 to the disc, upright in a square it's turned in
    side = 26 * unit
    steel, wood = Image.new("L", (side, side), 0), Image.new("L", (side, side), 0)
    at = lambda *points: [((x + 8) * unit, (y + 1) * unit) for x, y in points]  # the spatula's own squares
    blade = ImageDraw.Draw(steel)
    blade.rounded_rectangle(at((0, 0), (10, 9.5)), radius=1.6 * unit, fill=255)
    blade.polygon(at((2.6, 9), (7.4, 9), (5.9, 12), (4.1, 12)), fill=255)  # neck
    blade.rectangle(at((4.1, 11.5), (5.9, 16)), fill=255)  # shaft
    for x in (2.1, 4.4, 6.7):
        blade.rounded_rectangle(at((x, 1.8), (x + 1.2, 7.4)), radius=0.6 * unit, fill=0)  # slots
    ImageDraw.Draw(wood).rounded_rectangle(at((3.3, 15), (6.7, 24)), radius=1.5 * unit, fill=255)
    tipped = lambda mask: mask.rotate(-38, resample=Image.Resampling.BICUBIC)
    return outlined((tipped(steel), STEEL), (tipped(wood), WOOD))


EMBLEMS: dict[str, Emblem] = {
    "kw": Emblem(WHITE, kw_mark),  # the default: every look with no emblem of its own
    "elizabeth": Emblem(DARK, picture(CLIENT / "public" / "assets" / "elizabeth.ico", 0.74)),  # the site's logo
    "spongebob": Emblem(WHITE, spatula_mark),
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
