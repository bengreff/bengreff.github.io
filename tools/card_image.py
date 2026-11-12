"""Make a project card image: crop to 16:10 and save a 1200x750 WebP.

Usage: uv run --with pillow python tools/card_image.py SOURCE KEY [cx cy zoom]
cx, cy: centre of the crop as fractions of the source (default 0.5 0.5); zoom >= 1 crops tighter.
Writes assets/img/KEY.webp.
"""
import sys
from PIL import Image

src, key = sys.argv[1], sys.argv[2]
cx, cy, zoom = (float(v) for v in (sys.argv[3:6] + ['0.5', '0.5', '1'][len(sys.argv[3:6]):]))
im = Image.open(src).convert('RGB')
W, H = im.size
w = min(W, H * 16 / 10) / zoom
h = w * 10 / 16
x0 = min(max(cx * W - w / 2, 0), W - w)
y0 = min(max(cy * H - h / 2, 0), H - h)
out = im.crop((round(x0), round(y0), round(x0 + w), round(y0 + h))).resize((1200, 750), Image.LANCZOS)
out.save(f'assets/img/{key}.webp', 'WEBP', quality=82, method=6)
print(key, f'{W}x{H} -> crop {round(w)}x{round(h)} at ({round(x0)},{round(y0)}) -> 1200x750')
