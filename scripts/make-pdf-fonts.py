#!/usr/bin/env python3
"""Generate the static Frank Ruhl Libre cuts that the PDF builder embeds.

Google Fonts ships Frank Ruhl Libre only as a variable font, and the copy the
EPUB embeds is woff2 — neither of which pdf-lib can use: it embeds raw bytes
and cannot instantiate a weight axis, so a variable font would yield the
default 400 instance and no real bold.

This pins wght=400 and wght=700 into standalone TTFs so every output format
uses the same typeface. The results are committed, so this only needs re-running
when the upstream font changes.

    python scripts/make-pdf-fonts.py
"""

from __future__ import annotations

import io
import pathlib
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = (
    "https://raw.githubusercontent.com/google/fonts/main/ofl/"
    "frankruhllibre/FrankRuhlLibre%5Bwght%5D.ttf"
)
OUT_DIR = pathlib.Path("src/assets/fonts")

# Hebrew, Latin, punctuation and the marks these texts actually use. Subsetting
# here keeps the repo small; pdf-lib subsets again per document.
UNICODES = (
    "U+0020-007E,"      # basic Latin
    "U+00A0-00FF,"      # Latin-1 punctuation and symbols
    "U+0590-05FF,"      # Hebrew, including points
    "U+200C-200F,"      # ZWNJ/ZWJ and the LTR/RTL marks
    "U+2010-2027,"      # dashes, quotes, ellipsis
    "U+20AA,"           # shekel
    "U+FB1D-FB4F"       # Hebrew presentation forms
)


def build(weight: int, name: str, data: bytes) -> None:
    font = TTFont(io.BytesIO(data))
    instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True)

    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)

    # Make the instance describe itself honestly to viewers.
    style = "Bold" if weight >= 700 else "Regular"
    for record in font["name"].names:
        if record.nameID == 2:
            record.string = style
        elif record.nameID == 4:
            record.string = f"Frank Ruhl Libre {style}"
        elif record.nameID == 6:
            record.string = f"FrankRuhlLibre-{style}"
    font["OS/2"].usWeightClass = weight
    if weight >= 700:
        # BOLD and REGULAR are mutually exclusive in fsSelection.
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection | (1 << 5)) & ~(1 << 6)
        font["head"].macStyle |= 1 << 0

    out = OUT_DIR / name
    font.save(out)
    print(f"{name}: {out.stat().st_size:,} bytes (wght={weight})")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Fetching {SOURCE}")
    data = urllib.request.urlopen(SOURCE, timeout=60).read()
    print(f"variable source: {len(data):,} bytes")
    build(400, "FrankRuhlLibre-Regular.ttf", data)
    build(700, "FrankRuhlLibre-Bold.ttf", data)


if __name__ == "__main__":
    main()
