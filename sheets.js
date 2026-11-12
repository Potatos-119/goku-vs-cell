// Loads the sprite sheets, finds every sprite (white background, blobs grouped into rows)
// and hands out frames by id "row.index" with the white background removed.
const SHEET_CFG = {
  // (its frames sit where goku-rows.json says: found once on an older, noisier copy of the sheet, and kept
  // so every frame number stays the same now the sheet is clean)
  goku: { src: 'assets/sheets/goku.png', gap: 4, minX: 22, maxX: 760, rows: 'assets/sheets/goku-rows.json' },
  cell: { src: 'assets/sheets/cell.png', gap: 1, minX: 0, maxX: 99999 },
  cellFaces: { src: 'assets/sheets/cell-faces.png', gap: 1, minX: 0, maxX: 99999 },
  // base Goku's HUD portrait, cut from the title of the bigger sheet (goku1-source.png)
  gokuFace: { src: 'assets/img/goku-face.png', gap: 1, minX: 0, maxX: 99999 },
  // the bigger Goku sheets: their rows are too irregular to find automatically, so frames are cut
  // from them by exact rectangles ({ sheet: 'goku2', rect: [x, y, w, h] }) and they aren't sliced
  goku2: { src: 'assets/sheets/goku1-source.png', raw: true },
  gb: { src: 'assets/sheets/goku-base.png', raw: true },
  // Super Saiyan Goku's Kamehameha in his full gi, and its beam (tools/ssj-kame.py)
  sk: { src: 'assets/sheets/goku-ssj-kame.png', raw: true },
  // his Instant Transmission and full-gi transformation (tools/ssj-moves.py)
  sx: { src: 'assets/sheets/goku-ssj-moves.png', raw: true, bg: [255, 0, 255], keyed: true },
  // the second Super Saiyan sheet (his charge in his full gi), on its dark background
  ssj2: { src: 'assets/sheets/goku-ssj2.png', raw: true, bg: [36, 27, 2] },
  // the torn-gi Super Saiyan sheet itself, for frames used as drawn (the torn transformation)
  ss: { src: 'assets/sheets/goku-ssj-first.png', raw: true },
  // Goku's looks (base, torn gi, Super Saiyan, Kaioken), made by tools/goku-forms.py: frames on a
  // magenta background, every bit of which is see-through (keyed), wherever it is
  gf: { src: 'assets/sheets/goku-forms.png', raw: true, bg: [255, 0, 255], keyed: true },
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
// (hollow: all of the background colour goes, not just what the edges reach: an aura drawn as flames
// round a white middle)
function cutOut(sheet, [sx, sy, w, h], seed, hollow, seal = 0) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(sheet.canvas, sx, sy, w, h, 0, 0, w, h);
  const img = cx.getImageData(0, 0, w, h), d = img.data;
  const clear = new Uint8Array(w * h), st = [];
  // the background is white, unless the sheet says otherwise (then: anything close to its colour)
  const bg = sheet.bg, bgAt = bg ? (dd, k) => Math.abs(dd[k] - bg[0]) + Math.abs(dd[k + 1] - bg[1]) + Math.abs(dd[k + 2] - bg[2]) < 30 : isBg;
  // seal: an aura's white glow inside a flame outline with small gaps in it. The fill from the edges may
  // not pass within `seal` pixels of anything drawn (so it can't leak in through a gap), then grows back
  // over the background it stopped short of
  let wall = null;
  if (seal) {
    const drawn = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) drawn[i] = bgAt(d, i * 4) ? 0 : 1;
    wall = drawn;
    for (let k = 0; k < seal; k++) {
      const next = wall.slice();
      for (let i = 0; i < w * h; i++) if (wall[i]) { const x = i % w; if (x > 0) next[i - 1] = 1; if (x + 1 < w) next[i + 1] = 1; if (i >= w) next[i - w] = 1; if (i + w < w * h) next[i + w] = 1; }
      wall = next;
    }
  }
  const push = (x, y) => { const i = y * w + x; if (!clear[i] && bgAt(d, i * 4) && !(wall && wall[i])) { clear[i] = 1; st.push(i); } };
  if (sheet.keyed || hollow) for (let i = 0; i < w * h; i++) if (bgAt(d, i * 4)) clear[i] = 1;
  if (seed.includes('t')) for (let x = 0; x < w; x++) push(x, 0);
  if (seed.includes('b')) for (let x = 0; x < w; x++) push(x, h - 1);
  if (seed.includes('l')) for (let y = 0; y < h; y++) push(0, y);
  if (seed.includes('r')) for (let y = 0; y < h; y++) push(w - 1, y);
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    if (x + 1 < w) push(x + 1, y); if (x > 0) push(x - 1, y);
    if (y + 1 < h) push(x, y + 1); if (y > 0) push(x, y - 1);
  }
  for (let k = 0; k < seal; k++) {
    const grow = [];
    for (let i = 0; i < w * h; i++) if (!clear[i] && bgAt(d, i * 4)) { const x = i % w; if ((x > 0 && clear[i - 1]) || (x + 1 < w && clear[i + 1]) || (i >= w && clear[i - w]) || (i + w < w * h && clear[i + w])) grow.push(i); }
    grow.forEach(i => clear[i] = 1);
  }
  // the sheet was a screenshot, so peel off the pale fringe left around each sprite
  for (let pass = 0; pass < 2; pass++) {
    const peel = [];
    for (let i = 0; i < w * h; i++) {
      if (clear[i]) continue;
      const x = i % w, y = (i / w) | 0;
      const near = (x > 0 && clear[i - 1]) || (x + 1 < w && clear[i + 1]) || (y > 0 && clear[i - w]) || (y + 1 < h && clear[i + w]);
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (!bg && near && Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 45) peel.push(i);
    }
    peel.forEach(i => clear[i] = 1);
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (clear[i]) { d[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  cx.putImageData(img, 0, 0);
  const tw = Math.max(1, x1 - x0 + 1), th = Math.max(1, y1 - y0 + 1);
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  out.getContext('2d').drawImage(cv, x0, y0, tw, th, 0, 0, tw, th);
  // anchor = centre of mass of the torso band, so attacks that stretch the box don't slide the body
  let sum = 0, n = 0;
  for (let y = y0 + Math.floor(th * 0.25); y <= y0 + Math.floor(th * 0.65); y++)
    for (let x = x0; x <= x1; x++) if (!clear[y * w + x]) { sum += x - x0; n++; }
  out.ax = n ? sum / n : tw / 2;
  return out;
}

const Sheets = {
  sheets: {},
  cache: new Map(),
  async load(base = '') {
    await Promise.all(Object.entries(SHEET_CFG).map(([name, cfg]) => new Promise((ok, fail) => {
      const img = new Image();
      img.onload = async () => {
        this.sheets[name] = cfg.raw || cfg.rows ? rawSheet(img) : sliceSheet(img, cfg);
        if (cfg.rows) this.sheets[name].rows = await (await fetch(base + cfg.rows)).json();
        this.sheets[name].bg = cfg.bg; this.sheets[name].keyed = cfg.keyed; ok();
      };
      img.onerror = fail;
      img.src = base + cfg.src;
    })));
  },
  box(sheet, id) {
    const [r, i] = id.split('.').map(Number);
    return this.sheets[sheet].rows[r][i];
  },
  // ref: "r.i" or { id, x, y, w, h, seed: 'tblr', ax } to take part of a box (for sprites merged with
  // their beam). { sheet, rect: [x, y, w, h] } cuts an exact rectangle from another sheet instead.
  // hollow: see cutOut.
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
      const out = cutOut(this.sheets[sheet], [x, y, w, h], r.seed || 'tblr', r.hollow, r.seal);
      if (r.ax != null) out.ax = r.ax * out.width;
      out.k = r.k || 1; // drawn this much bigger (a sheet drawn at a smaller size than the rest)
      this.cache.set(key, out);
    }
    return this.cache.get(key);
  },
};
window.Sheets = Sheets;
