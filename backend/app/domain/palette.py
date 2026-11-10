"""Node color palette.

Extracted from paleta.jpeg (project root): the purest tone of each hue region of the blurred color wheel,
going around it from red to pink. The black center and the white background are left out because nodes
painted with them would disappear against the graph.
"""
import random

NODE_PALETTE: tuple[str, ...] = (
    "#f22452",  # red
    "#ee4818",  # red-orange
    "#f26f14",  # orange
    "#ef9012",  # amber
    "#e2bb24",  # yellow
    "#09ba2e",  # green
    "#01dba1",  # aquamarine
    "#07ebee",  # cyan
    "#3bc5f4",  # sky blue
    "#5da0e4",  # blue
    "#ff49d2",  # magenta
    "#fd3399",  # pink
)

_NORMALIZED = {color.lower() for color in NODE_PALETTE}


def random_palette_color() -> str:
    return random.choice(NODE_PALETTE)


def is_palette_color(color: str) -> bool:
    return color.lower() in _NORMALIZED
