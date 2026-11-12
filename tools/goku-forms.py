#!/usr/bin/env python3
"""Makes Goku's other looks from his base frames.

Every move of Goku's is drawn once, for base Goku in his full gi (GOKU_MOVES in data.js). This builds
the same frames in his other looks and packs them onto one generated sheet:

  base   the frame as drawn, in the older sheet's colours (goku.png: the brighter orange with red
         shading). Frames that only the newer sheet has (goku-base.png, a duller orange) are
         recoloured to match, so everything he does is one palette.
  torn   the orange gi top recoloured to the blue undershirt (the sheet draws him like this in a few
         rows; this gives every move that look)
  ssjT   Super Saiyan, cut whole from the Super Saiyan sheet (goku-ssj-first.png, mrruben7's "first
         time" sheet, which draws him with the gi top torn; tools/sheet-rebuild.py rebuilt it from a
         shrunken preview).
  ssj    Super Saiyan in his full gi: each frame cut as drawn from the full-gi sheet (goku-super-saiyan.png,
         PeculiarDoc's, full size), where the same pose sits, lined up with the torn-gi frame. A pose
         it doesn't line up with is the torn-gi frame recoloured.
  kaio   Kaioken: the torn look in the sheet's red Kaioken colours

    python3 tools/goku-forms.py                 # writes assets/sheets/goku-forms.png and goku-forms.js
    python3 tools/goku-forms.py --preview DIR   # also writes picture sheets of every frame to look over

Needs Python 3 with pillow, numpy and scipy, and node (it runs tools/goku-refs.js for the frame list).
Afterwards bake the frames again (tools/bake.html, then tools/write-frames.js).
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET_DIR = os.path.join(ROOT, 'assets', 'sheets')
SHEETS = {'goku': 'goku.png', 'goku2': 'goku1-source.png', 'gb': 'goku-base.png', 'ss': 'goku-ssj-first.png', 'so': 'goku-super-saiyan.png'}
PAD = 14            # room round each frame for hair that stands taller than the base drawing
KEY = (255, 0, 255) # the generated sheet's background
N4, N8 = ndi.generate_binary_structure(2, 1), np.ones((3, 3), bool)


def load(name):
    return np.asarray(Image.open(os.path.join(SHEET_DIR, name)).convert('RGB')).astype(np.float32)


def is_white(a, thr=232):
    return (a[..., 0] > thr) & (a[..., 1] > thr) & (a[..., 2] > thr)


# ---- the same cutting sheets.js does ----
def slice_rows(a, gap=4, min_x=22, max_x=760):
    """sprite boxes grouped into rows, numbered the way sheets.js numbers them ("row.index")"""
    fg = ~is_white(a)
    fg[:, :min_x] = False; fg[:, max_x + 1:] = False
    lab, _ = ndi.label(ndi.binary_dilation(fg, structure=np.ones((2 * gap + 1, 2 * gap + 1), bool)))
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = fg[sl] & (lab[sl] == i)
        if m.sum() <= 40: continue
        ys, xs = np.nonzero(m)
        boxes.append([sl[1].start + int(xs.min()), sl[0].start + int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)])
    boxes.sort(key=lambda b: b[1] + b[3])
    rows = []
    for b in boxes:
        for r in rows:
            if b[1] < r['y1'] and b[1] + b[3] > r['y0']:
                r['items'].append(b); r['y0'] = min(r['y0'], b[1]); r['y1'] = max(r['y1'], b[1] + b[3]); break
        else:
            rows.append({'y0': b[1], 'y1': b[1] + b[3], 'items': [b]})
    rows.sort(key=lambda r: r['y0'])
    return [sorted(r['items'], key=lambda b: b[0]) for r in rows]


class Sheets:
    def __init__(self):
        self.img = {k: load(v) for k, v in SHEETS.items()}
        self.rows = slice_rows(self.img['goku'])

    def box(self, ref):
        """(sheet, [x, y, w, h]) for a frame reference, as Sheets.frame works it out"""
        r = {'id': ref} if isinstance(ref, str) else ref
        if 'rect' in r: return r['sheet'], list(r['rect'])
        row, i = map(int, r['id'].split('.'))
        x, y, w, h = self.rows[row][i]
        if r.get('x'): x += r['x']; w -= r['x']
        if r.get('w'): w = min(w, r['w'])
        if r.get('y'): y += r['y']; h -= r['y']
        if r.get('h'): h = min(h, r['h'])
        return 'goku', [x, y, w, h]

    def cut(self, ref):
        """the frame on a canvas PAD bigger all round: (rgb, alpha), white cleared from the crop's edges inward
        and the pale fringe a screenshot leaves peeled off, like cutOut in sheets.js"""
        sheet, (x, y, w, h) = self.box(ref)
        a = self.img[sheet][y:y + h, x:x + w]
        lab, _ = ndi.label(is_white(a), structure=N4)
        edge = (set(lab[0].tolist()) | set(lab[-1].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())) - {0}
        clear = np.isin(lab, list(edge))
        mn, mx = a.min(-1), a.max(-1)
        for _ in range(2):
            near = ndi.binary_dilation(clear, structure=N4) & ~clear
            clear |= near & (mn > 175) & (mx - mn < 45)
        rgb = np.zeros((h + 2 * PAD, w + 2 * PAD, 3), np.float32); alpha = np.zeros((h + 2 * PAD, w + 2 * PAD), bool)
        rgb[PAD:PAD + h, PAD:PAD + w] = a; alpha[PAD:PAD + h, PAD:PAD + w] = ~clear
        return rgb, alpha


def bbox(alpha):
    ys, xs = np.nonzero(alpha)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def anchor(alpha):
    """where the body's centre is (canvas x): the centre of mass of the torso band, as cutOut works it out"""
    x0, y0, x1, y1 = bbox(alpha); th = y1 - y0
    band = alpha[y0 + int(th * 0.25): y0 + int(th * 0.65) + 1]
    xs = np.nonzero(band)[1]
    return float(xs.mean()) if len(xs) else (x0 + x1) / 2


# ---- what is what in a frame ----
def hair_mask(rgb, alpha):
    """his black hair: (hair, edge). The hair is the big thick dark blob (thin dark lines are outlines), grown
    back over its own edge pixels, out along spikes too thin to count as thick, and over dark patches
    beside it that an arm or a flicker line cut off. edge marks the pixels that stay a dark outline."""
    none = np.zeros_like(alpha)
    r, b = rgb[..., 0], rgb[..., 2]
    dark = alpha & (rgb.max(-1) < 130) & (r < b + 30)
    core = ndi.binary_erosion(dark, structure=N4)
    lab, n = ndi.label(core, structure=N4)
    if not n: return none, none
    sizes = ndi.sum(core, lab, range(1, n + 1))
    if sizes.max() < 12: return none, none
    hair = np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v >= sizes.max() * 0.35])
    edge = none.copy()
    for _ in range(2):
        grow = ndi.binary_dilation(hair, structure=N4) & dark & ~hair
        hair |= grow; edge |= grow
    ys, xs = np.nonzero(hair & ~edge)
    if not len(xs): return none, none
    hx0, hx1 = xs.min(), xs.max()
    near = none.copy(); near[max(0, ys.min() - 6): ys.max() + 3, max(0, hx0 - 12): hx1 + 13] = True
    cand = dark & (b - r < 25) & near
    spike = none.copy()
    while True:
        grow = ndi.binary_dilation(hair, structure=N8) & cand & ~hair
        if not grow.any(): break
        hair |= grow; spike |= grow
    lab, n = ndi.label(cand & ~hair, structure=N8)
    for i in range(1, n + 1):
        m = lab == i
        cx = np.nonzero(m)[1].mean()
        if m.sum() >= 6 and (cx < hx0 + 2 or cx > hx1 - 2): hair |= m; spike |= m
    # a spike pixel is outline unless hair is on at least two sides of it
    h = np.pad(hair, 1).astype(int)
    sides = h[1:-1, :-2] + h[1:-1, 2:] + h[:-2, 1:-1] + h[2:, 1:-1]
    edge = np.where(spike, sides < 2, edge)
    return hair, edge & hair


def is_orange(rgb):
    """the gi's orange, down to its brown shadows (not skin: that has much more green and blue in it)"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 118) & (r > g * 1.45) & (b < g * 0.85 + 12) & (b < 100) & (g > 28) & (r - b > 0.62 * r)


def top_mask(rgb, alpha, hair):
    """the gi top: the orange nearer his head than his belt. The gi's orange falls into separate patches (the
    blue belt and the dark outlines split them), and each patch is the top or the trousers by how far down
    the body it is, measured along the line from his head through the middle of all the orange"""
    orange = alpha & is_orange(rgb)
    lab, n = ndi.label(orange, structure=N4)
    if not n or not hair.any(): return np.zeros_like(alpha)
    hy, hx = ndi.center_of_mass(hair)
    oy, ox = ndi.center_of_mass(orange)
    ax, ay = ox - hx, oy - hy; L2 = ax * ax + ay * ay
    if L2 < 16: return np.zeros_like(alpha)
    top = np.zeros_like(alpha)
    for i in range(1, n + 1):
        m = lab == i
        cy, cx = ndi.center_of_mass(m)
        t = ((cx - hx) * ax + (cy - hy) * ay) / L2
        if t < TOP_SPLIT: top |= m
    # never his face: the shadows on it are orange enough to count, and turned blue with the top
    ys, xs = np.nonzero(hair)
    face = np.zeros_like(alpha); face[:ys.max() + 6, max(0, xs.min() - 2): xs.max() + 3] = True
    return top & ~face


TOP_SPLIT = 0.86
# the undershirt's blues, dark to light (from the rows the sheet draws him in it)
NAVY = np.array([[14, 10, 40], [38, 32, 70], [63, 54, 94], [86, 78, 128]], np.float32)


def renavy(rgb, alpha):
    """a frame the newer sheet draws in its own, darker undershirt: that navy to the blue every other frame's
    undershirt is"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = alpha & (b > r + 14) & (b > g + 14) & (b < 140)
    t = np.clip((rgb.sum(-1) - 64) / 228, 0, 1) * (len(NAVY) - 1)
    i = np.clip(t.astype(int), 0, len(NAVY) - 2); k = (t - i)[..., None]
    out = rgb.copy(); out[m] = (NAVY[i] * (1 - k) + NAVY[i + 1] * k)[m]
    return out


def recolour_top(rgb, top):
    """orange gi top -> blue undershirt, keeping the drawing's light and shade"""
    out = rgb.copy()
    if not top.any(): return out
    L = rgb.sum(-1)
    # orange runs from its brown shadow (about 190) to its highlight (about 430)
    t = np.clip((L - 200) / 230, 0, 1) * (len(NAVY) - 1)
    i = np.clip(t.astype(int), 0, len(NAVY) - 2); f = (t - i)[..., None]
    out[top] = (NAVY[i] * (1 - f) + NAVY[i + 1] * f)[top]
    return out



# ---- base frames, all in the older sheet's colours ----
# The two base sheets are the same drawings in two palettes: the older one (goku.png, which the frame
# numbers in data.js come from) a brighter orange with red shading, the newer one (goku-base.png) duller.
# The game has always looked like the older one, so frames only the newer sheet has are recoloured to
# it: each older frame is found on the newer sheet by its outline, and the two compared pixel for pixel.
def outline_twin(sheet_alpha, alpha):
    """where this frame's outline sits on another sheet: (x, y, share of pixels that differ)"""
    x0, y0, x1, y1 = bbox(alpha); M = alpha[y0:y1, x0:x1].astype(np.float32)
    overlap = fftconvolve(sheet_alpha, M[::-1, ::-1], 'valid')
    area = fftconvolve(sheet_alpha, np.ones_like(M), 'valid')
    miss = (M.sum() - overlap) + (area - overlap)
    y, x = np.unravel_index(miss.argmin(), miss.shape)
    return int(x), int(y), float(miss[y, x] / M.sum())


def clear_pockets(rgb, alpha):
    """white the background removal can't reach (shut in between an arm and the body) is background too:
    a patch of it ringed mostly by dark outline, and bigger than the white of an eye"""
    lab, n = ndi.label(alpha & is_white(rgb, 228), structure=N4)
    out = alpha.copy()
    dark = alpha & (rgb.max(-1) < 105)
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < 5: continue
        ring = ndi.binary_dilation(m, structure=N8) & ~m
        if ring.sum() and (dark & ring).sum() / ring.sum() >= 0.5: out &= ~m
    return out


class Palette:
    """old sheet's colours -> newer sheet's, learned from the frames both sheets have (pixel for pixel)"""
    def __init__(self): self.sum = {}; self.n = {}

    def learn(self, old, new, both):
        o = (old[both] // 8).astype(int); v = new[both]
        for k, c in zip(map(tuple, o), v):
            self.sum[k] = self.sum.get(k, 0) + c; self.n[k] = self.n.get(k, 0) + 1

    def finish(self):
        keys = [k for k in self.n if self.n[k] >= 3]
        self.keys = np.array(keys, np.float32) * 8 + 4
        self.vals = np.array([self.sum[k] / self.n[k] for k in keys], np.float32)

    def apply(self, rgb, alpha, reach=26):
        out = rgb.copy(); px = rgb[alpha]
        if not len(px): return out
        d = ((px[:, None, :] - self.keys[None]) ** 2).sum(-1)
        j = d.argmin(1); ok = d[np.arange(len(px)), j] < reach * reach
        px = np.where(ok[:, None], self.vals[j], px); out[alpha] = px
        return out


def base_frames(S, refs):
    gb_alpha = (~is_white(S.img['gb'])).astype(np.float32)
    gb_alpha[1030:] = 0; gb_alpha[:, 800:] = 0     # the rows of base Goku in his gi
    pal = Palette(); frames = []; newer = []
    for e in refs:
        rgb, alpha = S.cut(e['ref']); sheet, _ = S.box(e['ref'])
        f = dict(key=e['key'], ref=e['ref'], anim=e['anim'], anims=set(e['anims']), ssj=e['ssj'], table=e['table'], rgb=rgb, alpha=alpha)
        if sheet == 'goku':
            x, y, miss = outline_twin(gb_alpha, alpha)
            if miss < 0.16:
                x0, y0, x1, y1 = bbox(alpha)
                nrgb, nalpha = S.cut({'sheet': 'gb', 'rect': [x, y, x1 - x0, y1 - y0]})
                new = np.zeros_like(rgb); nal = np.zeros_like(alpha)
                new[y0:y1, x0:x1] = nrgb[PAD:-PAD, PAD:-PAD]; nal[y0:y1, x0:x1] = nalpha[PAD:-PAD, PAD:-PAD]
                pal.learn(new, rgb, alpha & nal)
        elif sheet == 'gb': newer.append(f)
        frames.append(f)
    pal.finish()
    for f in newer: f['rgb'] = pal.apply(f['rgb'], f['alpha'], reach=30)
    for f in frames:
        f['alpha'] = clear_pockets(f['rgb'], f['alpha'])
        f['hair'], f['edge'] = hair_mask(f['rgb'], f['alpha'])
        f['top'] = top_mask(f['rgb'], f['alpha'], f['hair'])
        f['ax'] = anchor(f['alpha'])
    return frames, len(newer)


# ---- Super Saiyan: frames cut whole from the rebuilt Super Saiyan sheet ----
def cut_sprite(img, rect, thr=222):
    """a frame of a rebuilt sheet: (rgb, alpha). White reached from the crop's edge is background, and so
    is the pale fringe the rebuild leaves round a sprite, white shut in between an arm and the body, and
    any stray dot"""
    x, y, w, h = rect
    a = np.full((h + 2, w + 2, 3), 255, np.float32); a[1:-1, 1:-1] = img[y:y + h, x:x + w]
    lab, _ = ndi.label(is_white(a, thr), structure=N4)
    clear = lab == lab[0, 0]
    mn, mx = a.min(-1), a.max(-1)
    for _ in range(2):
        near = ndi.binary_dilation(clear, structure=N4) & ~clear
        clear |= near & (mn > 170) & (mx - mn < 40)
    alpha = clear_pockets(a, ~clear)
    lab, n = ndi.label(alpha, structure=N8)
    if n > 1:
        sizes = ndi.sum(alpha, lab, range(1, n + 1))
        alpha &= ~np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v < 3])
    return a, alpha


def undershirt_blues(img):
    """the blue of the undershirt as the Super Saiyan sheet draws it, dark to light"""
    a = img[190:1150, 50:700].reshape(-1, 3)
    b = a[(a[:, 2] > a[:, 0] + 35) & (a[:, 2] > a[:, 1] + 20)]
    b = b[np.argsort(b.sum(1))]
    return np.array([b[int(len(b) * q)] for q in (0.04, 0.3, 0.62, 0.93)], np.float32)


def tones(px, at=(0.05, 0.3, 0.62, 0.93)):
    """a colour's shades, dark to light: the pixels sorted by brightness, read off at four points"""
    px = px[np.argsort(px.sum(1))]
    return np.array([px[int(len(px) * q)] for q in at], np.float32)


def reshade(rgb, mask, frm, to):
    """pixels in one colour's shades -> the same shade of another colour"""
    out = rgb.copy()
    if not mask.any(): return out
    L, at = rgb.sum(-1), frm.sum(1)
    t = np.interp(L, at, np.arange(len(at)))
    i = np.clip(t.astype(int), 0, len(to) - 2); k = (t - i)[..., None]
    out[mask] = (to[i] * (1 - k) + to[i + 1] * k)[mask]
    return out


def guide_for(so, rect, alpha):
    """the full-gi sheet over the same frame (the two sheets are the same drawings in the same places),
    nudged to where the two outlines agree best, and smoothed: it's a blocky copy, good for saying
    which colour an area is and no more"""
    x, y, w, h = rect; best = None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            g = np.full(alpha.shape + (3,), 255, np.float32)
            g[1:-1, 1:-1] = so[y + dy:y + dy + h, x + dx:x + dx + w]
            miss = (is_white(g, 222) == alpha).sum()
            if best is None or miss < best[0]: best = (miss, g)
    return np.stack([ndi.median_filter(best[1][..., k], 3) for k in range(3)], -1)


def full_gi_cut(so, rect, alpha, m=2):
    """the same frame cut as drawn from the full-gi sheet (the two sheets are the same drawings in the same
    places), where its outline agrees best with this one's, on a canvas the size of this one's. None
    when no placement agrees well enough (then the frame is recoloured instead)"""
    x, y, w, h = rect; best = None
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            rgb, a = cut_sprite(so, [x + dx - m, y + dy - m, w + 2 * m, h + 2 * m])
            inner = a[m:m + h + 2, m:m + w + 2]
            miss = (inner != alpha).sum()
            if best is None or miss < best[0]: best = (miss, rgb[m:m + h + 2, m:m + w + 2], inner)
    miss, rgb, a = best
    return (rgb, a) if miss < 0.22 * alpha.sum() else None


def is_undershirt(a):
    return (a[..., 2] > a[..., 0] + 25) & (a[..., 2] > a[..., 1] + 8)


def is_pale_hair(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 150) & (g > 120) & (r - g < 75) & (b < g)


def guide_warm(g):      # the gi's orange or the hair's gold, anyway not the undershirt
    return (g[..., 0] > g[..., 2] + 70) & (g[..., 0] > 140)


def guide_gold(g):      # the hair's gold, or its pale yellow highlight (skin is pinker than that)
    r, gg, b = g[..., 0], g[..., 1], g[..., 2]
    return ((r > 170) & (gg > 105) & (b < 115)) | ((r > 200) & (r - gg < 28) & (gg - b > 35))


def full_gi(rgb, alpha, g, shades):
    """a torn-gi Super Saiyan frame in his full gi: the undershirt goes orange wherever the full-gi sheet has
    the gi over it (not at the collar and sleeves), and the pale hair goes that sheet's gold"""
    blue = alpha & is_undershirt(rgb)
    if g is None:
        # a frame only the torn-gi sheet has: nothing to go by, so all of the undershirt, and whatever is as
        # pale as his hair and not as pink as his skin
        r, gg = rgb[..., 0], rgb[..., 1]
        return reshade(reshade(rgb, blue, shades['blue'], shades['orange']), alpha & is_pale_hair(rgb) & ~blue & (r - gg < 30), shades['pale'], shades['gold'])
    out = reshade(rgb, blue & guide_warm(g), shades['blue'], shades['orange'])
    return reshade(out, alpha & is_pale_hair(rgb) & ~blue & guide_gold(g), shades['pale'], shades['gold'])


# ---- Kaioken: the torn look in the sheet's own red ----
# the frames the sheet draws in Kaioken red that are the same drawing as a base frame, and which
KAIO_TWINS = [((486, 1312, 39, 47), '"1.2"'), ((603, 1305, 36, 55), '"4.0"'), ((649, 1309, 39, 49), '"4.1"'), ((699, 1308, 52, 51), '"4.2"'),
              ((760, 1307, 39, 53), '"4.9"'), ((806, 1312, 46, 43), '"4.10"'), ((864, 1313, 45, 46), '"4.11"'), ((68, 1375, 36, 55), '"0.3"'),
              ((142, 1412, 33, 52), '"5.0"')]


def kaio_palette(S, frames):
    """torn-look colours -> Kaioken colours, learned pixel for pixel from the frames the sheet draws both ways"""
    by_key = {f['key']: f for f in frames}; pal = Palette()
    for rect, key in KAIO_TWINS:
        f = by_key.get(key)
        if not f or 'torn' not in f['looks']: continue
        krgb, kal = S.cut({'sheet': 'gb', 'rect': list(rect)})
        A, B = f['alpha'].astype(np.float32), kal.astype(np.float32)
        c = fftconvolve(A, B[::-1, ::-1], 'full'); y, x = np.unravel_index(c.argmax(), c.shape)
        dy, dx = y - (B.shape[0] - 1), x - (B.shape[1] - 1)
        H, W = f['alpha'].shape; moved = np.zeros((H, W, 3), np.float32); mal = np.zeros((H, W), bool)
        ys, xs = np.nonzero(kal); ty, tx = ys + dy, xs + dx
        ok = (ty >= 0) & (ty < H) & (tx >= 0) & (tx < W)
        moved[ty[ok], tx[ok]] = krgb[ys[ok], xs[ok]]; mal[ty[ok], tx[ok]] = True
        pal.learn(f['looks']['torn'][0], moved, f['alpha'] & mal)
    pal.finish()
    return pal


def kaio_frame(rgb, alpha, pal):
    """every colour of his to its Kaioken red. Colours the sheet's Kaioken frames never show (a rare shade,
    the glow of a ki blast) get the nearest known one's shift, faded out with distance, so effects keep
    most of their own colour"""
    px = rgb[alpha]
    d = ((px[:, None, :] - pal.keys[None]) ** 2).sum(-1); j = d.argmin(1); dist = np.sqrt(d[np.arange(len(px)), j])
    shift = pal.vals[j] - pal.keys[j]
    w = np.clip(1.25 - dist / 60, 0, 1)[:, None]
    out = rgb.copy(); out[alpha] = np.clip(px + shift * w, 0, 255)
    return out


# ---- output ----
def to_image(rgb, alpha, bg=None):
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8))
    if bg is None: return im
    out = Image.new('RGBA', im.size, bg + (255,)); out.alpha_composite(im)
    return out.convert('RGB')


def contact(tiles, path, cols=10, zoom=3, bg=(70, 80, 110)):
    """tiles: [(label, [(rgb, alpha), ...])] -> one picture, each tile its looks side by side"""
    from PIL import ImageDraw
    cells = []
    for label, looks in tiles:
        ims = []
        for rgb, alpha in looks:
            x0, y0, x1, y1 = bbox(alpha) if alpha.any() else (0, 0, 1, 1)
            ims.append(to_image(rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1], bg))
        w = sum(i.width + 2 for i in ims); h = max(i.height for i in ims)
        cell = Image.new('RGB', (max(w, 40), h + 9), (30, 30, 46)); x = 0
        for i in ims: cell.paste(i, (x, 9 + h - i.height)); x += i.width + 2
        cell = cell.resize((cell.width * zoom, cell.height * zoom), Image.NEAREST)
        ImageDraw.Draw(cell).text((2, 1), label[:28], fill=(255, 255, 0))
        cells.append(cell)
    rows, row, w = [], [], 0
    for c in cells:
        if row and (len(row) >= cols or w + c.width > 2000): rows.append(row); row, w = [], 0
        row.append(c); w += c.width + 6
    if row: rows.append(row)
    W = max(sum(c.width + 6 for c in r) for r in rows); H = sum(max(c.height for c in r) + 6 for r in rows)
    sheet = Image.new('RGB', (W, H), (30, 30, 46)); y = 0
    for r in rows:
        x = 0; rh = max(c.height for c in r)
        for c in r: sheet.paste(c, (x, y + rh - c.height)); x += c.width + 6
        y += rh + 6
    sheet.save(path)


def pack(items, width=1024, gap=2):
    """[(look, key, rgb, alpha, ax)] -> the sheet image and {look: {key: [x, y, w, h, ax as a share of w]}}"""
    cut = []
    for look, key, rgb, alpha, ax in items:
        x0, y0, x1, y1 = bbox(alpha)
        cut.append((look, key, rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1], (ax - x0) / (x1 - x0)))
    cut.sort(key=lambda c: -c[2].shape[0])
    x = y = gap; row_h = 0; placed = []
    for c in cut:
        h, w = c[3].shape
        if x + w + gap > width: x = gap; y += row_h + gap; row_h = 0
        placed.append((c, x, y)); x += w + gap; row_h = max(row_h, h)
    sheet = np.zeros((y + row_h + gap, width, 3), np.uint8); sheet[:] = KEY
    table = {}
    for (look, key, rgb, alpha, axf), x, y in placed:
        h, w = alpha.shape
        sheet[y:y + h, x:x + w] = np.where(alpha[..., None], np.clip(rgb, 0, 255), KEY).astype(np.uint8)
        table.setdefault(look, {})[key] = [x, y, w, h, round(float(axf), 3)]
    return Image.fromarray(sheet), table


def main():
    global NAVY
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    listed = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools', 'goku-refs.js')]))
    S = Sheets()
    NAVY = undershirt_blues(S.img['ss'])
    ssj = [e for e in listed if e['table'] == 'ssj']
    frames, newer = base_frames(S, [e for e in listed if e['table'] != 'ssj'])
    print(f'{len(frames)} frames ({newer} from the newer sheet, recoloured to the older one\'s colours)')
    for f in frames:
        f['looks'] = {'base': (renavy(f['rgb'], f['alpha']) if f['table'] == 'native' else f['rgb'], f['alpha'])}
        if f['table'] != 'native': f['looks']['torn'] = (recolour_top(f['rgb'], f['top']), f['alpha'])
    cut = []
    for e in ssj:
        rgb, alpha = cut_sprite(S.img[e['ref']['sheet']], e['ref']['rect'])
        f = dict(key=e['key'], ref=e['ref'], table='ssj', rgb=rgb, alpha=alpha, ax=anchor(alpha), looks={'ssjT': (rgb, alpha)})
        f['guide'] = None if e['ref'].get('alone') else guide_for(S.img['so'], e['ref']['rect'], alpha)
        cut.append(f)
    both = [f for f in cut if f['guide'] is not None]
    every = lambda pick: np.concatenate([pick(f) for f in both])
    shades = {
        'blue': NAVY,
        'orange': tones(every(lambda f: f['rgb'][f['alpha'] & (f['rgb'][..., 0] > f['rgb'][..., 1] + 60) & (f['rgb'][..., 0] > 150) & (f['rgb'][..., 2] < 100)])),
        'pale': tones(every(lambda f: f['rgb'][f['alpha'] & is_pale_hair(f['rgb']) & guide_gold(f['guide'])])),
        'gold': tones(every(lambda f: f['guide'][f['alpha'] & is_pale_hair(f['rgb']) & guide_gold(f['guide'])])),
    }
    drawn = 0
    for f in cut:
        own = None if f['guide'] is None else full_gi_cut(S.img['so'], f['ref']['rect'], f['alpha'])
        if own: f['looks']['ssj'] = own; drawn += 1
        # (a frame the full-gi sheet doesn't draw at all, his torn-gi big attack, gets no full-gi look:
        # recoloured with nothing to go by it came out all orange, and that attack is torn-gi only)
        elif f['guide'] is not None: f['looks']['ssj'] = (full_gi(f['rgb'], f['alpha'], f['guide'], shades), f['alpha'])
    print(f'Super Saiyan: {len(cut)} frames, {drawn} cut as drawn from the full-gi sheet, the rest recoloured or torn-gi only')
    kp = kaio_palette(S, frames)
    for f in frames:
        if 'torn' in f['looks']: f['looks']['kaio'] = (kaio_frame(f['looks']['torn'][0], f['alpha'], kp), f['alpha'])
    items = [(look, f['key'], rgb, alpha, f['ax']) for f in frames + cut for look, (rgb, alpha) in f['looks'].items()]
    sheet, table = pack(items)
    sheet.save(os.path.join(SHEET_DIR, 'goku-forms.png'), optimize=True)
    with open(os.path.join(ROOT, 'goku-forms.js'), 'w') as out:
        out.write("// Written by tools/goku-forms.py: where each look of each of Goku's frames sits on the generated sheet\n"
                  '// (assets/sheets/goku-forms.png): GOKU_FORMS[look][frame] = [x, y, width, height, body centre as a share of the width]\n'
                  'const GOKU_FORMS = ' + json.dumps(table, separators=(',', ':')) + ';\n')
    print(f'{len(items)} frames on goku-forms.png {sheet.size}; ' + ', '.join(f'{k} {len(v)}' for k, v in table.items()))
    if preview:
        os.makedirs(preview, exist_ok=True)
        for look in ('ssj', 'ssjT', 'kaio', 'base', 'torn'):
            contact([(f['key'].replace('"', '')[:14], [f['looks'][look]]) for f in frames + cut if look in f['looks']], os.path.join(preview, look + '.png'), cols=19, zoom=2)
        print('previews in', preview)


if __name__ == '__main__':
    main()
