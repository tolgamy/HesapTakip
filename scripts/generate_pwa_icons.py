#!/usr/bin/env python3
"""Generate PWA icons from the one original vector source; no financial data accessed."""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

SVG = (PUBLIC / "favicon.svg").read_bytes()
LARGE = Image.open(BytesIO(cairosvg.svg2png(bytestring=SVG, output_width=1024, output_height=1024))).convert("RGB")
NAVY = (6, 26, 47)

def scaled(size):
    return LARGE.resize((size, size), Image.Resampling.LANCZOS)

scaled(192).save(ICONS / "icon-192.png", optimize=True)
scaled(512).save(ICONS / "icon-512.png", optimize=True)
scaled(180).save(PUBLIC / "apple-touch-icon.png", optimize=True)
scaled(32).save(PUBLIC / "favicon-32.png", optimize=True)

maskable = Image.new("RGB", (512, 512), NAVY)
# The art stays comfortably inside Android's maskable safe zone.
art = scaled(370)
maskable.paste(art, ((512-370)//2, (512-370)//2))
maskable.save(ICONS / "icon-maskable-512.png", optimize=True)

scaled(64).save(PUBLIC / "favicon.ico", sizes=[(16,16),(32,32),(48,48),(64,64)], format="ICO")
print("PWA icons created: 192, 512, maskable 512, Apple 180, favicon PNG/ICO")
