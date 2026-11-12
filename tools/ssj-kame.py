#!/usr/bin/env python3
"""Super Saiyan Goku's Kamehameha (full gi), from a sharp strip of the sprite sheet: seven poses and the beam.

The strip draws him smaller than the rest of his frames (42 px tall against about 52), so the poses are
scaled up 1.25x with Scale2x (twice, then sampled down), which keeps the pixel-art edges sharp instead of
blurring them. The beam is kept at its own size; the game scales it (BEAMS.gokuSsj in data.js).

    python3 tools/ssj-kame.py STRIP.png   # writes assets/sheets/goku-ssj-kame.png

Then bake its frames: python3 tools/bake-add.py (or the browser bake, tools/bake.html).
Needs pillow and numpy.
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sheets', 'goku-ssj-kame.png')
UP = 1.25
# on the strip (x, y, w, h): the swing back, the swirl gathering, the thrust; then the beam's three parts
POSES = [(30, 41, 30, 42), (70, 41, 27, 42), (112, 41, 25, 42), (143, 33, 54, 51), (207, 42, 27, 41), (252, 42, 31, 41), (298, 44, 31, 39)]
BEAM = {'start': (329, 8, 104, 103), 'body': (460, 36, 40, 48), 'head': (525, 8, 104, 103)}


def scale2x(a):
    h, w, _ = a.shape
    p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
    B, D, F, H, E = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 2:], p[2:, 1:-1], p[1:-1, 1:-1]
    eq = lambda x, y: (x == y).all(-1)
    c = (~eq(B, H) & ~eq(D, F))[..., None]
    out = np.zeros((h * 2, w * 2, 3), a.dtype)
    out[0::2, 0::2] = np.where(c & eq(D, B)[..., None], D, E)
    out[0::2, 1::2] = np.where(c & eq(B, F)[..., None], F, E)
    out[1::2, 0::2] = np.where(c & eq(D, H)[..., None], D, E)
    out[1::2, 1::2] = np.where(c & eq(H, F)[..., None], F, E)
    return out


def upscale(a, k):
    big = scale2x(scale2x(a))
    h, w = round(a.shape[0] * k), round(a.shape[1] * k)
    ys = np.minimum((np.arange(h) + 0.5) * big.shape[0] / h, big.shape[0] - 1).astype(int)
    xs = np.minimum((np.arange(w) + 0.5) * big.shape[1] / w, big.shape[1] - 1).astype(int)
    return big[ys][:, xs]


def white(a):
    return (a[..., 0] > 232) & (a[..., 1] > 232) & (a[..., 2] > 232)


def main():
    strip = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
    pieces = []
    for (x, y, w, h) in POSES:
        part = strip[y:y + h, x:x + w].copy()
        part[white(part)] = 255
        pieces.append(('pose', upscale(part, UP)))
    for name, (x, y, w, h) in BEAM.items():
        pieces.append((name, strip[y:y + h, x:x + w].copy()))
    # one row on white, 6 px apart
    H = max(p.shape[0] for _, p in pieces) + 12
    Wd = sum(p.shape[1] + 6 for _, p in pieces) + 6
    sheet = np.full((H, Wd, 3), 255, np.uint8)
    rects, x = [], 6
    for name, p in pieces:
        y = H - 6 - p.shape[0]
        sheet[y:y + p.shape[0], x:x + p.shape[1]] = p
        rects.append((name, [x, y, p.shape[1], p.shape[0]]))
        x += p.shape[1] + 6
    Image.fromarray(sheet).save(OUT)
    print('wrote', OUT)
    for name, r in rects: print(name, r)


if __name__ == '__main__':
    main()
