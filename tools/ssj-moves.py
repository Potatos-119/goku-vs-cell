#!/usr/bin/env python3
"""Super Saiyan Goku's Instant Transmission and his full-gi transformation, cleaned up from the full-gi sheet.

assets/sheets/goku-super-saiyan.png was rebuilt from a shrunken preview (tools/sheet-rebuild.py), so its
sprites are soft. The transformation's frames are sharpened a little and then every pixel is snapped to
the nearest colour that the sharp sheets really use (goku-ssj-kame.png, goku-ssj-first.png,
goku-base.png), which gives back flat colours and solid outlines; the Instant Transmission's came out
speckled that way, so they are cut as drawn. Writes assets/sheets/goku-ssj-moves.png, one row
per move, and prints where each frame is (SX in data.js).

    python3 tools/ssj-moves.py      # then python3 tools/bake-add.py

Needs pillow, numpy and scipy.
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = os.path.join(ROOT, 'assets', 'sheets')
# on goku-super-saiyan.png (x, y, w, h)
ROWS = {
    # Instant Transmission: crouch, rising, fading out, the streak he leaves, appearing, the squat, up,
    # turning, the dash pose, the dash streak (then the Kamehameha: SK_KAME, which is sharper)
    'tele': [(63, 1072, 39, 49), (113, 1068, 33, 53), (159, 1068, 35, 53), (204, 1057, 26, 51), (244, 1059, 31, 49),
             (288, 1059, 33, 49), (333, 1056, 30, 54), (379, 1057, 31, 58), (430, 1057, 30, 58), (468, 1083, 52, 26)],
    # turning Super Saiyan in his full gi: the stance, the blue aura, the white flash, the gold flames, the stance
    'turn': [(66, 139, 32, 48), (117, 139, 45, 48), (176, 115, 65, 73), (253, 111, 62, 76), (332, 134, 53, 55),
             (403, 129, 50, 59), (472, 124, 43, 63), (535, 108, 62, 79), (616, 131, 28, 56)],
}


# the rows cleaned up (sharpened and snapped to the sharp sheets' colours); the rest are cut as they are
CLEAN = {'turn'}


def palette():
    def colours(name, box, minc):
        a = np.asarray(Image.open(os.path.join(SHEETS, name)).convert('RGB'))[box[1]:box[3], box[0]:box[2]]
        c, n = np.unique(a.reshape(-1, 3), axis=0, return_counts=True)
        c = c[n >= minc]
        return c[~(c > 232).all(1)]
    return np.unique(np.concatenate([colours('goku-ssj-kame.png', (0, 0, 330, 120), 3),
                                     colours('goku-ssj-first.png', (60, 190, 720, 1260), 6),
                                     colours('goku-base.png', (40, 100, 700, 700), 6)]), axis=0)


def main():
    pal = palette(); tree = cKDTree(pal.astype(float))
    src = Image.open(os.path.join(SHEETS, 'goku-super-saiyan.png')).convert('RGB')
    rows, Wd, y = [], 0, 6
    for name, boxes in ROWS.items():
        x, cells = 6, []
        for (bx, by, bw, bh) in boxes:
            c = src.crop((bx - 2, by - 2, bx + bw + 2, by + bh + 2))
            if name not in CLEAN:   # left as drawn: snapping these made them speckled, not sharper
                out = np.asarray(c).copy(); out[(out > 222).all(-1)] = 255
                cells.append((x, out)); x += out.shape[1] + 6
                continue
            c = c.filter(ImageFilter.UnsharpMask(radius=1.2, percent=90, threshold=2))
            a = np.asarray(c).astype(float)
            bg = (a > 222).all(-1)
            _, i = tree.query(a.reshape(-1, 3))
            out = pal[i].reshape(a.shape).astype(np.uint8); out[bg] = 255
            cells.append((x, out)); x += out.shape[1] + 6
        h = max(o.shape[0] for _, o in cells)
        rows.append((name, y, h, cells)); Wd = max(Wd, x); y += h + 6
    sheet = np.full((y, Wd, 3), 255, np.uint8)
    for name, ry, h, cells in rows:
        rects = []
        for x, o in cells:
            oy = ry + h - o.shape[0]   # feet on one line
            sheet[oy:oy + o.shape[0], x:x + o.shape[1]] = o
            rects.append(f'SX({x}, {oy}, {o.shape[1]}, {o.shape[0]})')
        print(name, '[' + ', '.join(rects) + ']')
    Image.fromarray(sheet).save(os.path.join(SHEETS, 'goku-ssj-moves.png'))


if __name__ == '__main__':
    main()
