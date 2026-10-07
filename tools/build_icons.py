"""Rebuild every image derived from the OpenMobile-2 logo.

Run after replacing public/logo.png (transparent PNG, the full mark):

    python3 tools/build_icons.py

Writes  public/logo.webp            hero art, served before the PNG
        public/favicon-{16,32,512}.png
        public/favicon.ico          16, 32, 48 and 64 px
        public/apple-touch-icon.png 180x180, opaque (iOS turns transparency black)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "logo.png"
BG = (5, 12, 25)  # --bg of the dark theme in static/css/main.css


def square(img, margin):
    """Center the mark on a transparent square canvas with a relative margin."""
    img = img.crop(img.getbbox())
    side = round(max(img.size) * (1 + 2 * margin))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def build():
    logo = Image.open(SOURCE).convert("RGBA")
    logo.save(PUBLIC / "logo.webp", quality=88, method=6)

    icon = square(logo, margin=0.03)
    for px in (16, 32, 512):
        out = icon.resize((px, px), Image.LANCZOS)
        if px == 512:  # shown at <= 104 px (nav, footer, 404); a palette PNG is 1/6 the size
            out = out.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        out.save(PUBLIC / f"favicon-{px}.png", optimize=True)
    icon.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    touch = Image.new("RGBA", (180, 180), BG + (255,))
    mark = square(logo, margin=0.14).resize((180, 180), Image.LANCZOS)
    touch.alpha_composite(mark)
    touch.convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)

    for name in ("logo.webp", "favicon-16.png", "favicon-32.png", "favicon-512.png",
                 "favicon.ico", "apple-touch-icon.png"):
        print(f"  wrote public/{name:22s} {(PUBLIC / name).stat().st_size / 1024:7.1f} KB")


if __name__ == "__main__":
    build()
