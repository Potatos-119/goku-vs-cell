#!/usr/bin/env python3
"""Bakes the frames the game uses that aren't in assets/frames yet, without a browser.

tools/bake.html bakes everything again in the browser. This only adds what is missing: it lists every
frame the game can ask for (as tools/bake.js does), and each one cut by an exact rectangle from a sheet
({ sheet, rect }) that frames.json doesn't have is cut the way sheets.js cutOut does it and put on an
extra atlas image (atlas-extra.png, made again each run). Frames found by "row.index" need the browser.

    python3 tools/bake-add.py

Needs pillow, numpy and scipy, and node.
"""
import json, os, re, subprocess
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FDIR = os.path.join(ROOT, 'assets', 'frames')
EXTRA = 'atlas-extra.png'
N4 = ndi.generate_binary_structure(2, 1)

LIST_JS = r"""
const fs = require('fs'), vm = require('vm'), ctx = {}; vm.createContext(ctx);
const src = f => fs.readFileSync(f, 'utf8');
vm.runInContext(src('goku-forms.js') + src('data.js') + src('sheets.js').replace(/window\.Sheets = Sheets;/, '') +
  ';this.out = { anims: ANIMS, beams: BEAMS, cfg: SHEET_CFG };', Object.assign(ctx, { window: {}, document: {} }));
const list = [], { anims, beams, cfg } = ctx.out;
for (const [who, forms] of Object.entries(anims)) for (const t of Object.values(forms)) for (const a of Object.values(t)) for (const r of a.fr || []) list.push([who, r]);
for (const B of Object.values(beams)) for (const p of ['start', 'body', 'head']) list.push([B[p].sheet, B[p].ref]);
process.stdout.write(JSON.stringify({ list: list.map(([s, r]) => [s + JSON.stringify(r), s, r]), cfg }));
"""


def cut_out(a, seed='tblr', hollow=False, bg=None, keyed=False, seal=0):
    """sheets.js cutOut: (rgba, anchor)"""
    a = a.astype(int)
    isbg = (np.abs(a - np.array(bg)).sum(-1) < 30) if bg else ((a[..., 0] > 232) & (a[..., 1] > 232) & (a[..., 2] > 232))
    if keyed or hollow:
        clear = isbg.copy()
    else:
        # seal (as sheets.js): the fill from the edges can't pass within `seal` pixels of anything drawn
        # (an outline's gaps), then grows back `seal` steps over the background it stopped short of
        fill = isbg & ~ndi.binary_dilation(~isbg, structure=N4, iterations=seal) if seal else isbg
        lab, _ = ndi.label(fill, structure=N4)
        edge = set()
        if 't' in seed: edge |= set(lab[0].tolist())
        if 'b' in seed: edge |= set(lab[-1].tolist())
        if 'l' in seed: edge |= set(lab[:, 0].tolist())
        if 'r' in seed: edge |= set(lab[:, -1].tolist())
        clear = np.isin(lab, list(edge - {0}))
        for _ in range(seal):
            near = np.zeros_like(clear)
            near[1:] |= clear[:-1]; near[:-1] |= clear[1:]; near[:, 1:] |= clear[:, :-1]; near[:, :-1] |= clear[:, 1:]
            clear = clear | (near & isbg)
    if not bg:
        mn, mx = a.min(-1), a.max(-1)
        for _ in range(2):
            near = np.zeros_like(clear)
            near[1:] |= clear[:-1]; near[:-1] |= clear[1:]; near[:, 1:] |= clear[:, :-1]; near[:, :-1] |= clear[:, 1:]
            clear = clear | (near & ~clear & (mn > 175) & (mx - mn < 45))
    ys, xs = np.nonzero(~clear)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([a, np.where(clear, 0, 255)]).astype(np.uint8)[y0:y1, x0:x1]
    th = y1 - y0
    bx = np.nonzero(~clear[y0 + int(th * 0.25): y0 + int(th * 0.65) + 1, x0:x1])[1]
    return rgba, float(bx.mean()) if len(bx) else (x1 - x0) / 2


def main():
    data = json.loads(subprocess.run(['node', '-e', LIST_JS], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    man = json.load(open(os.path.join(FDIR, 'frames.json')))
    if EXTRA in man['atlases']:   # made again from scratch: drop what the last run added
        ai = man['atlases'].index(EXTRA)
        man['frames'] = {k: v for k, v in man['frames'].items() if v['a'] != ai}
    else:
        man['atlases'].append(EXTRA); ai = len(man['atlases']) - 1
    sheets, items, seen, skipped = {}, [], set(), []
    for key, sheet, ref in data['list']:
        if key in man['frames'] or key in seen: continue
        seen.add(key)
        r = {'id': ref} if isinstance(ref, str) else ref
        name = r.get('sheet', sheet)
        if 'rect' not in r: skipped.append(key); continue
        cfg = data['cfg'][name]
        if name not in sheets: sheets[name] = np.asarray(Image.open(os.path.join(ROOT, cfg['src'])).convert('RGB'))
        x, y, w, h = r['rect']
        c, ax = cut_out(sheets[name][y:y + h, x:x + w], r.get('seed', 'tblr'), r.get('hollow'), cfg.get('bg'), cfg.get('keyed'), r.get('seal', 0))
        if r.get('ax') is not None: ax = r['ax'] * c.shape[1]
        items.append((key, c, ax, r.get('k', 1)))
    if skipped: print('needs the browser bake (tools/bake.html):', *skipped, sep='\n  ')
    W = max(1, sum(c.shape[1] + 2 for _, c, _, _ in items)); H = max([1] + [c.shape[0] for _, c, _, _ in items])
    atlas = np.zeros((H, W, 4), np.uint8); x = 0
    for key, c, ax, k in items:
        atlas[:c.shape[0], x:x + c.shape[1]] = c
        man['frames'][key] = {'a': ai, 'x': x, 'y': 0, 'w': int(c.shape[1]), 'h': int(c.shape[0]), 'ax': round(ax, 3), 'k': k}
        x += c.shape[1] + 2
    Image.fromarray(atlas).save(os.path.join(FDIR, EXTRA))
    with open(os.path.join(FDIR, 'frames.json'), 'w') as f: f.write(json.dumps(man, separators=(',', ':')) + '\n')
    print(f'added {len(items)} frames to {EXTRA}')


if __name__ == '__main__':
    main()
