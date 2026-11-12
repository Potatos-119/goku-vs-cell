#!/usr/bin/env python3
# Rebuilds a sprite sheet's original pixels from a shrunken JPEG preview of it.
#
# The two Super Saiyan sheets in assets/sheets are previews: the page they came from only shows them
# at 1024 and 828 pixels wide, and the sheets were drawn 1084 wide. Cutting sprites out of a preview
# gives blurry, speckled sprites, because every drawn pixel has been smeared over its neighbours.
#
# The sheet is pixel art in a few dozen colours, so there is one sharp picture that explains the
# preview best: this looks for it. It learns the sheet's colours, starts every pixel on the nearest
# one, then keeps changing single pixels to whichever colour makes the shrunken copy of the picture
# match the preview most closely. A pixel that differs from the pixels around it has to earn it.
#
#   python3 tools/sheet-rebuild.py preview.jpg rebuilt.png [--skip x0,y0,x1,y1 ...]
#
# --skip leaves a box of the preview (a screenshot pasted on the sheet) out of the colour learning.
# Needs pillow, numpy and scipy.
import sys, time
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter

FULL_W = 1084        # how wide the sheets were drawn (the base sheet, goku-base.png, still is)
COLOURS = 80
SMOOTH = 600.0       # what a pixel pays for each neighbour it differs from
CHROMA = 0.15        # JPEG keeps brightness far better than colour, so colour error counts for less
SWEEPS = 4
STEP = 7             # pixels this far apart don't share any preview pixel, so they can change together
BAND = 96            # preview rows solved at a time

def planes(a):
    return [Image.fromarray(np.ascontiguousarray(a[..., c], dtype=np.float32)) for c in range(a.shape[-1])]

def resize(a, size, how):
    return np.stack([np.asarray(p.resize(size, how)) for p in planes(a)], -1)

def sharpen(Y, W0, H0, rounds=6):
    # a first guess on the original grid: enlarge, then push back whatever the shrunken guess gets wrong
    H, W = Y.shape[:2]
    X = resize(Y, (W0, H0), Image.BICUBIC)
    for _ in range(rounds):
        X = np.clip(X + resize(Y - resize(X, (W, H), Image.LANCZOS), (W0, H0), Image.BICUBIC), -30, 285)
    return X

def learn_colours(Y, skips):
    A = Y.copy()
    for x0, y0, x1, y1 in skips: A[y0:y1, x0:x1] = 255
    H, W = A.shape[:2]
    X = np.clip(sharpen(A, FULL_W, round(H * FULL_W / W)), 0, 255)
    px = X[X.min(-1) < 238].astype(np.uint8)
    q = Image.fromarray(px.reshape(1, -1, 3)).quantize(COLOURS, method=Image.MEDIANCUT, kmeans=8)
    P = np.array(q.getpalette()[:COLOURS * 3], np.float32).reshape(-1, 3)
    return np.unique(np.vstack([P, [[255, 255, 255], [0, 0, 0]]]), axis=0).astype(np.float32)

def miss(d):
    l = d @ np.array([0.299, 0.587, 0.114], np.float32)
    cb, cr = d[..., 2] - l, d[..., 0] - l
    return 3 * l * l + CHROMA * (cb * cb + cr * cr)

def solve(Y, P):
    H, W = Y.shape[:2]
    k = FULL_W / W
    W0, H0 = FULL_W, round(H * k)
    shrink = lambda X: resize(X, (W, H), Image.LANCZOS)
    X = sharpen(Y, W0, H0)
    near = np.empty((H0, W0, 4), np.int64)
    for y in range(0, H0, 64):
        d = ((X[y:y + 64, :, None, :] - P[None, None]) ** 2).sum(-1)
        near[y:y + 64] = np.argsort(d, -1)[..., :4]
    L = near[..., 0].copy()
    to_preview = lambda v, n: np.clip(np.round((v + 0.5) / k - 0.5).astype(int), 0, n - 1)
    sides = ((1, 0), (-1, 0), (0, 1), (0, -1))
    for _ in range(SWEEPS):
        for py in range(STEP):
            for px in range(STEP):
                ys, xs = np.arange(py, H0, STEP), np.arange(px, W0, STEP)
                yy, xx = ys[:, None], xs[None]
                around = [L[np.clip(ys + dy, 0, H0 - 1)[:, None], np.clip(xs + dx, 0, W0 - 1)[None]] for dy, dx in sides]
                tries = [L[yy, xx]] + [near[yy, xx, j] for j in range(4)] + around
                now = P[L]
                best, cost = tries[0].copy(), None
                for j, c in enumerate(tries):
                    if j and not (c != tries[0]).any(): continue
                    guess = now.copy(); guess[yy, xx] = P[c]
                    e = uniform_filter(miss(shrink(guess) - Y), 7, mode='nearest')[to_preview(ys, H)[:, None], to_preview(xs, W)[None]] * 49
                    e = e + SMOOTH * sum((a != c) for a in around)
                    if cost is None: cost = e
                    else:
                        better = e < cost - 1e-3
                        best[better], cost[better] = c[better], e[better]
                L[yy, xx] = best
    return P[L].astype(np.uint8)

def main():
    src, out = sys.argv[1], sys.argv[2]
    skips = [tuple(int(v) for v in a.split(',')) for a in sys.argv[4::2]] if '--skip' in sys.argv else []
    Y = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    H, W = Y.shape[:2]
    k = FULL_W / W
    P = learn_colours(Y, skips)
    full = np.full((round(H * k), FULL_W, 3), 255, np.uint8)
    t, y, edge = time.time(), 0, 10
    while y < H:
        a, b = max(0, y - edge), min(H, y + BAND + edge)
        img = solve(Y[a:b], P)
        o, t0, t1 = round(a * k), round(y * k), round(min(H, y + BAND) * k)
        full[t0:t1] = img[t0 - o:t1 - o]
        y += BAND
        print(f'{min(y, H)}/{H} rows, {time.time() - t:.0f} s', flush=True)
    Image.fromarray(full).save(out)

main()
