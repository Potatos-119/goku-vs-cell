// Loads the sprite sheets, finds every sprite (white background, blobs grouped into rows)
// and hands out frames by id "row.index" with the white background removed.
const SHEET_CFG = {
  goku: { src: 'assets/sheets/goku.png', gap: 4, minX: 22, maxX: 760 },
  cell: { src: 'assets/sheets/cell.png', gap: 1, minX: 0, maxX: 99999 },
  cellFaces: { src: 'assets/sheets/cell-faces.png', gap: 1, minX: 0, maxX: 99999 },
  // base Goku's HUD portrait, cut from the title of the bigger sheet (goku1-source.png)
  gokuFace: { src: 'assets/img/goku-face.png', gap: 1, minX: 0, maxX: 99999 },
  // the bigger Goku sheet: its rows are too irregular to find automatically, so frames are cut
  // from it by exact rectangles ({ sheet: 'goku2', rect: [x, y, w, h] }) and it isn't sliced
  goku2: { src: 'assets/sheets/goku1-source.png', raw: true },
};

const isBg = (d, i) => d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232;

function sliceSheet(img, cfg) {
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, W, H).data;
  const fg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    if (x >= cfg.minX && x <= cfg.maxX && !isBg(d, i * 4)) fg[i] = 1;
  }
  const g = cfg.gap, dl = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fg[y * W + x])
    for (let dy = -g; dy <= g; dy++) for (let dx = -g; dx <= g; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) dl[ny * W + nx] = 1;
    }
  const seen = new Uint8Array(W * H), boxes = [];
  for (let i = 0; i < W * H; i++) {
    if (!dl[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    const b = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 };
    while (st.length) {
      const j = st.pop(), jx = j % W, jy = (j / W) | 0;
      if (fg[j]) { if (jx < b.x0) b.x0 = jx; if (jy < b.y0) b.y0 = jy; if (jx > b.x1) b.x1 = jx; if (jy > b.y1) b.y1 = jy; b.n++; }
      if (jx + 1 < W && dl[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; st.push(j + 1); }
      if (jx > 0 && dl[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; st.push(j - 1); }
      if (jy + 1 < H && dl[j + W] && !seen[j + W]) { seen[j + W] = 1; st.push(j + W); }
      if (jy > 0 && dl[j - W] && !seen[j - W]) { seen[j - W] = 1; st.push(j - W); }
    }
    if (b.n > 40) boxes.push([b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1]);
  }
  boxes.sort((a, b) => (a[1] + a[3]) - (b[1] + b[3]));
  const rows = [];
  for (const b of boxes) {
    const r = rows.find(r => b[1] < r.y1 && b[1] + b[3] > r.y0);
    if (r) { r.items.push(b); r.y0 = Math.min(r.y0, b[1]); r.y1 = Math.max(r.y1, b[1] + b[3]); }
    else rows.push({ y0: b[1], y1: b[1] + b[3], items: [b] });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  rows.forEach(r => r.items.sort((a, b) => a[0] - b[0]));
  return { canvas: cv, rows: rows.map(r => r.items) };
}

// a sheet that is only cut by exact rectangles: just its pixels, no rows
function rawSheet(img) {
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').drawImage(img, 0, 0);
  return { canvas: cv, rows: [] };
}

// Crop a rect, clear the white that is reachable from the chosen crop sides
// (so enclosed white like beam cores survives), trim, and work out the body anchor.
function cutOut(sheet, [sx, sy, w, h], seed, ssj, frameId, aura) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(sheet.canvas, sx, sy, w, h, 0, 0, w, h);
  const img = cx.getImageData(0, 0, w, h), d = img.data;
  const clear = new Uint8Array(w * h), st = [];
  const push = (x, y) => { const i = y * w + x; if (!clear[i] && isBg(d, i * 4)) { clear[i] = 1; st.push(i); } };
  if (seed.includes('t')) for (let x = 0; x < w; x++) push(x, 0);
  if (seed.includes('b')) for (let x = 0; x < w; x++) push(x, h - 1);
  if (seed.includes('l')) for (let y = 0; y < h; y++) push(0, y);
  if (seed.includes('r')) for (let y = 0; y < h; y++) push(w - 1, y);
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    if (x + 1 < w) push(x + 1, y); if (x > 0) push(x - 1, y);
    if (y + 1 < h) push(x, y + 1); if (y > 0) push(x, y - 1);
  }
  // the sheet was a screenshot, so peel off the pale fringe left around each sprite
  for (let pass = 0; pass < 2; pass++) {
    const peel = [];
    for (let i = 0; i < w * h; i++) {
      if (clear[i]) continue;
      const x = i % w, y = (i / w) | 0;
      const near = (x > 0 && clear[i - 1]) || (x + 1 < w && clear[i + 1]) || (y > 0 && clear[i - w]) || (y + 1 < h && clear[i + w]);
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (near && Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 45) peel.push(i);
    }
    peel.forEach(i => clear[i] = 1);
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (clear[i]) { d[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const hair = ssj ? recolorHair(d, w, h, clear) : null;
  if (aura === 'gold') goldAura(d, w, h, clear);
  if (ssj) for (let i = 0; i < w * h; i++) if (!clear[i]) ssjGi(d, i * 4);
  cx.putImageData(img, 0, 0);
  const tw = Math.max(1, x1 - x0 + 1), th = Math.max(1, y1 - y0 + 1);
  // Super Saiyan hair stands up taller than the normal hair, so leave room above the head for it
  // Guard poses get a fitted spike overlay below; fallen poses keep their own silhouette so
  // the upright hair cutout cannot drift away from the head on the ground.
  const addSpikyOverlay = hair && ssj !== 'plain' && !['8.1', '8.2', '8.3', '8.4', '8.5'].includes(frameId);
  const pad = addSpikyOverlay ? SSJ_PAD : 0;
  const out = document.createElement('canvas'); out.width = tw + pad * 2; out.height = th + pad;
  const ox = out.getContext('2d');
  ox.drawImage(cv, x0, y0, tw, th, pad, pad, tw, th);
  if (addSpikyOverlay) addSsjHair(ox, hair, x0 - pad, y0 - pad, th, frameId);
  // anchor = centre of mass of the torso band, so attacks that stretch the box don't slide the body
  let sum = 0, n = 0;
  for (let y = y0 + Math.floor(th * 0.25); y <= y0 + Math.floor(th * 0.65); y++)
    for (let x = x0; x <= x1; x++) if (!clear[y * w + x]) { sum += x - x0; n++; }
  out.ax = (n ? sum / n : tw / 2) + pad;
  return out;
}

// A blue ki aura -> Super Saiyan gold, in the colours of the sheet's own SSJ aura (frame 10.8). Only
// the aura changes: it spreads from the pale blue flames through the white inside them, so the whites
// of his eyes and his blue wristbands (darker blue) are left alone.
function goldAura(d, w, h, clear) {
  const N = w * h, isFlame = i => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return r > 110 && g > 170 && b > 215 && b - r > 18; };
  const isWhite = i => d[i * 4] > 225 && d[i * 4 + 1] > 225 && d[i * 4 + 2] > 225;
  const m = new Uint8Array(N), st = [];
  for (let i = 0; i < N; i++) if (!clear[i] && isFlame(i)) { m[i] = 1; st.push(i); }
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!m[j] && !clear[j] && (isFlame(j) || isWhite(j))) { m[j] = 1; st.push(j); }
    }
  }
  // the flames' outer edge gets 10.8's orange rim, a yellow band inside it
  const edge = i => { const x = i % w, y = (i / w) | 0; return x === 0 || y === 0 || x === w - 1 || y === h - 1 || clear[i - 1] || clear[i + 1] || clear[i - w] || clear[i + w]; };
  const rim = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (m[i] && edge(i)) rim[i] = 2;
  for (let i = 0; i < N; i++) if (m[i] && !rim[i]) { const x = i % w, y = (i / w) | 0; if ((x > 0 && rim[i - 1] === 2) || (x < w - 1 && rim[i + 1] === 2) || (y > 0 && rim[i - w] === 2) || (y < h - 1 && rim[i + w] === 2)) rim[i] = 1; }
  for (let i = 0; i < N; i++) if (m[i]) {
    const L = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2];
    const c = rim[i] === 2 ? [244, 150, 16] : rim[i] === 1 ? [255, 204, 40] : L > 700 ? [255, 252, 222] : L > 620 ? [255, 236, 120] : L > 540 ? [255, 204, 40] : [244, 150, 16];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2];
  }
}

// The sheet's real Super Saiyan colours: its gi is a yellower orange than normal Goku's.
function ssjGi(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  if (r > 140 && r > g * 1.6 && b < g + 30) { d[i + 1] = Math.min(255, Math.round(g * 1.38)); d[i + 2] = Math.round(b * 0.7); }
}

// Spiky Super Saiyan hair cut from the sheet's own SSJ frame (11.0), laid over the recoloured hair
// so moves that only exist for normal Goku still get the real SSJ silhouette. Upright frames only:
// on flips, falls and knockdowns the head is tilted, and those keep the recolour alone.
const SSJ_PAD = 6;
let ssjHairTemplate = null;
function ssjHairFromSheet() {
  const f = Sheets.frame('goku', '11.0'), w = f.width, h = f.height;
  const d = f.getContext('2d').getImageData(0, 0, w, h).data;
  const isHair = i => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    return d[i * 4 + 3] && ((r > 200 && g >= 145 && b < 200) || (r > 240 && g > 225 && b > 170 && b < 245));
  };
  const lim = Math.floor(h * 0.48), m = new Uint8Array(w * h), st = [];
  for (let y = 0; y < h * 0.33; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (isHair(i)) { m[i] = 1; st.push(i); } }
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx >= 0 && ny >= 0 && nx < w && ny < lim && !m[j] && isHair(j)) { m[j] = 1; st.push(j); }
    }
  }
  // keep the dark outline around the spikes
  const keep = new Uint8Array(m);
  for (let y = 0; y < lim; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (m[i] || !d[i * 4 + 3] || Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) >= 110) continue;
    if ((x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || m[i + w]) keep[i] = 1;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) if (keep[i]) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
  const cx = c.getContext('2d'), img = cx.createImageData(c.width, c.height);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (!keep[i]) continue;
    img.data.set([d[i * 4], d[i * 4 + 1], d[i * 4 + 2], 255], ((y - y0) * c.width + (x - x0)) * 4);
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// hair: recoloured hair box in crop coordinates; (sx, sy): crop -> output offset
function addSsjHair(ctx, hair, sx, sy, th, frameId) {
  const hw = hair.x1 - hair.x0 + 1, hh = hair.y1 - hair.y0 + 1;
  const upright = hair.y0 - (sy + SSJ_PAD) <= th * 0.2 && hw <= hh * 2.2;
  // the guard pose tucks the head down, but the spikes still sit right on it
  const guard = frameId === '3.0' || frameId === '3.1';
  if (!upright && !guard) return;
  ssjHairTemplate = ssjHairTemplate || ssjHairFromSheet();
  const t = ssjHairTemplate;
  // line the front of the spikes up with the front of his hair, a little above its top
  ctx.drawImage(t, hair.x1 - sx - t.width + 2, hair.y0 - sy - 3);
}

// Black hair -> Super Saiyan gold. The hair is the biggest *thick* dark blob: eroding the
// dark mask by one pixel removes the 1px outlines, so this works in any pose (even lying down).
function recolorHair(d, w, h, clear) {
  const N = w * h;
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    dark[i] = !clear[i] && Math.max(r, g, b) < 130 && r < b + 30 ? 1 : 0;
  }
  const at = (m, x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  const core = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    core[y * w + x] = dark[y * w + x] && at(dark, x + 1, y) && at(dark, x - 1, y) && at(dark, x, y + 1) && at(dark, x, y - 1) ? 1 : 0;
  // label the core blobs and keep the big ones (hair can be split by a highlight)
  const lab = new Int32Array(N), sizes = [0];
  for (let i = 0; i < N; i++) {
    if (!core[i] || lab[i]) continue;
    const id = sizes.length, st = [i]; lab[i] = id; let n = 0;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0; n++;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]])
        if (at(core, nx, ny) && !lab[ny * w + nx]) { lab[ny * w + nx] = id; st.push(ny * w + nx); }
    }
    sizes.push(n);
  }
  const biggest = Math.max(0, ...sizes);
  if (biggest < 12) return null;
  const hair = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (lab[i] && sizes[lab[i]] >= biggest * 0.35) hair[i] = 1;
  // grow back over the hair's own edge pixels; those stay as the dark outline
  const edge = new Uint8Array(N);
  for (let pass = 0; pass < 2; pass++) {
    const grow = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!hair[i] && dark[i] && (at(hair, x + 1, y) || at(hair, x - 1, y) || at(hair, x, y + 1) || at(hair, x, y - 1))) grow.push(i);
    }
    grow.forEach(i => { hair[i] = 1; edge[i] = 1; });
  }
  // Thin spikes too narrow to survive the erosion (and hair cut into strips by a flicker frame)
  // would stay black. Keep growing through dark, non-blue pixels around the head, and fill the
  // ones that are not on the silhouette's edge so they turn gold rather than outline.
  let hy0 = h, hy1 = -1, hx0 = w, hx1 = -1;
  for (let i = 0; i < N; i++) if (hair[i] && !edge[i]) { const x = i % w, y = (i / w) | 0; hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y); }
  const neutral = i => d[i * 4 + 2] - d[i * 4] < 25;
  const near = (x, y) => x >= hx0 - 12 && x <= hx1 + 12 && y >= hy0 - 6 && y <= hy1 + 2;
  const spike = new Uint8Array(N), st = [];
  for (let i = 0; i < N; i++) if (hair[i]) st.push(i);
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    // diagonal steps too: spikes in pixel art are often joined only at their corners
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (at(dark, nx, ny) && !hair[j] && neutral(j) && near(nx, ny)) { hair[j] = 1; spike[j] = 1; st.push(j); }
    }
  }
  // Spikes cut off from the head by an arm or a flicker line: separate dark patches beside the
  // hair (not inside its span, where the eyes are) join it too.
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (seen[i] || hair[i] || !dark[i] || !neutral(i) || !near(i % w, (i / w) | 0)) continue;
    const blob = [i], q2 = [i]; seen[i] = 1; let sx = 0;
    while (q2.length) {
      const j = q2.pop(), x = j % w, y = (j / w) | 0; sx += x;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, k = ny * w + nx;
        if (at(dark, nx, ny) && !seen[k] && !hair[k] && neutral(k) && near(nx, ny)) { seen[k] = 1; blob.push(k); q2.push(k); }
      }
    }
    const cx = sx / blob.length;
    if (blob.length >= 6 && (cx < hx0 + 2 || cx > hx1 - 2)) blob.forEach(j => { hair[j] = 1; spike[j] = 1; });
  }
  for (let i = 0; i < N; i++) if (spike[i]) {
    const x = i % w, y = (i / w) | 0;
    const inside = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at(hair, x + dx, y + dy)).length;
    edge[i] = inside >= 2 ? 0 : 1;
  }
  // Palette sampled from the sheet's own Super Saiyan frames (row 11), shadow -> highlight.
  // Pixels are ranked by brightness inside the hair so even all-black hair gets the full range.
  const ramp = [[229, 151, 10], [251, 196, 69], [254, 234, 187], [255, 250, 237]];
  const L = i => d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2];
  const inner = [];
  for (let i = 0; i < N; i++) if (hair[i] && !edge[i]) inner.push(L(i));
  inner.sort((a, b) => a - b);
  const q = f => inner[Math.min(inner.length - 1, Math.floor(inner.length * f))];
  const cut = [q(0.3), q(0.6), q(0.85)];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < N; i++) if (hair[i]) {
    const c = edge[i] ? [96, 52, 18] : ramp[L(i) <= cut[0] ? 0 : L(i) <= cut[1] ? 1 : L(i) <= cut[2] ? 2 : 3];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2];
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

const Sheets = {
  sheets: {},
  cache: new Map(),
  async load(base = '') {
    await Promise.all(Object.entries(SHEET_CFG).map(([name, cfg]) => new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => { this.sheets[name] = cfg.raw ? rawSheet(img) : sliceSheet(img, cfg); ok(); };
      img.onerror = fail;
      img.src = base + cfg.src;
    })));
  },
  box(sheet, id) {
    const [r, i] = id.split('.').map(Number);
    return this.sheets[sheet].rows[r][i];
  },
  // ref: "r.i" or { id, x, y, w, h, seed: 'tblr', ssj, plain, aura, ax } to take part of a box
  // (aura: 'gold' turns a blue ki aura into a Super Saiyan one)
  // (plain: Super Saiyan recolour without the spiky hair overlay, for poses it doesn't sit on)
  // (for sprites merged with their beam) or to recolour Goku's hair.
  // { sheet, rect: [x, y, w, h] } cuts an exact rectangle from another sheet instead.
  frame(sheet, ref) {
    const key = sheet + JSON.stringify(ref);
    if (!this.cache.has(key)) {
      const r = typeof ref === 'string' ? { id: ref } : ref;
      if (r.sheet) sheet = r.sheet;
      let [x, y, w, h] = r.rect || this.box(sheet, r.id);
      if (r.x) { x += r.x; w -= r.x; }
      if (r.w) w = Math.min(w, r.w);
      if (r.y) { y += r.y; h -= r.y; }
      if (r.h) h = Math.min(h, r.h);
      const out = cutOut(this.sheets[sheet], [x, y, w, h], r.seed || 'tblr', r.ssj && r.plain ? 'plain' : r.ssj, r.id, r.aura);
      if (r.ax != null) out.ax = r.ax * out.width;
      this.cache.set(key, out);
    }
    return this.cache.get(key);
  },
};
window.Sheets = Sheets;
