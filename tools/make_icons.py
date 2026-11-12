"""Draw the pixel-art icon (a jet over the clouds) and write ext/icons/*.png.

    python tools/make_icons.py
"""
from pathlib import Path
from PIL import Image

ART = [
    "ssssssssssssssss",
    "ssssssssssssssss",
    "sssssssJJsssssss",
    "sssssssJJsssssss",
    "ssssssJccJssssss",
    "ssssssJJJJssssss",
    "ssssJJJJJJJJssss",
    "ssJJJJJJJJJJJJss",
    "sJJJJJJJJJJJJJJs",
    "ssssssJJJJssssss",
    "sssssJJJJJJsssss",
    "ssssJJsffsJJssss",
    "sssssssttsssssss",
    "sswwwsssttswwwss",
    "swwwwwwssttwwwww",
    "wwwwwwwwwwwwwwww",
]
COL = {
    's': (52, 92, 150), 'J': (196, 210, 224), 'c': (40, 58, 76), 'f': (255, 170, 80),
    't': (220, 228, 236), 'w': (236, 240, 246),
}
out = Path(__file__).resolve().parent.parent / 'ext' / 'icons'
out.mkdir(parents=True, exist_ok=True)
base = Image.new('RGBA', (16, 16))
for y, row in enumerate(ART):
    for x, ch in enumerate(row):
        base.putpixel((x, y), COL[ch] + (255,))
for size in (16, 32, 48, 128):
    base.resize((size, size), Image.NEAREST).save(out / f'icon{size}.png')
print('wrote', out)
