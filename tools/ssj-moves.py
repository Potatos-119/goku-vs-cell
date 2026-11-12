#!/usr/bin/env python3
"""Super Saiyan Goku's Instant Transmission (in the air), cut from the full-gi sheet.

Every frame is cut as drawn from assets/sheets/goku-super-saiyan.png (the full-size full-gi sheet) onto
assets/sheets/goku-ssj-moves.png, on a magenta background (keyed out, like goku-forms.png's), and the
tool prints where each one is (SX in data.js).

    python3 tools/ssj-moves.py      # then bake the frames (tools/bake.html, or tools/bake-add.py)

Needs pillow, numpy and scipy.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

KEY = (255, 0, 255)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = os.path.join(ROOT, 'assets', 'sheets')
# on goku-super-saiyan.png (x, y, w, h)
ROWS = {
    # Instant Transmission from the air: turning, the dash pose, and the streak as he zips away
    'tele': [(333, 1056, 30, 54), (379, 1057, 31, 58), (430, 1057, 30, 58), (468, 1083, 52, 26)],
}


def cut(src, box):
    bx, by, bw, bh = box
    out = np.asarray(src.crop((bx - 2, by - 2, bx + bw + 2, by + bh + 2))).copy()
    # the background is only the near-white reachable from the crop's edges (an aura's palest pixels are
    # almost white too), and it becomes magenta
    lab, _ = ndi.label((out >= 236).all(-1))
    edge = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    out[np.isin(lab, list(edge - {0}))] = KEY
    # and the pale fringe round a sprite, peeled off as sheets.js does (greyish white next to the background)
    for _ in range(2):
        bg = (out == KEY).all(-1); near = np.zeros_like(bg)
        near[1:] |= bg[:-1]; near[:-1] |= bg[1:]; near[:, 1:] |= bg[:, :-1]; near[:, :-1] |= bg[:, 1:]
        mn, mx = out.min(-1).astype(int), out.max(-1).astype(int)
        out[near & ~bg & (mn > 175) & (mx - mn < 45)] = KEY
    return out


def main():
    src = Image.open(os.path.join(SHEETS, 'goku-super-saiyan.png')).convert('RGB')
    rows, Wd, y = [], 0, 6
    for name, boxes in ROWS.items():
        x, cells = 6, []
        for box in boxes:
            out = cut(src, box)
            cells.append((x, out)); x += out.shape[1] + 6
        h = max(o.shape[0] for _, o in cells)
        rows.append((name, y, h, cells)); Wd = max(Wd, x); y += h + 6
    sheet = np.full((y, Wd, 3), KEY, np.uint8)
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
