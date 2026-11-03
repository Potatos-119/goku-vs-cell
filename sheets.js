// Loads the sprite sheets, finds every sprite (white background, blobs grouped into rows)
// and hands out frames by id "row.index" with the white background removed.
const SHEET_CFG = {
  goku: { src: 'assets/sheets/goku.png', gap: 4, minX: 22, maxX: 760 },
  cell: { src: 'assets/sheets/cell.png', gap: 1, minX: 0, maxX: 99999 },
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

// Crop a rect, clear the white that is reachable from the chosen crop sides
// (so enclosed white like beam cores survives), trim, and work out the body anchor.
function cutOut(sheet, [sx, sy, w, h], seed, ssj) {
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
  if (ssj) recolorHair(d, w, h, clear, y0, y1);
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

// Black hair -> Super Saiyan gold: flood from the top of the sprite through dark, non-warm pixels.
function recolorHair(d, w, h, clear, y0, y1) {
  const limit = y0 + (y1 - y0) * 0.5;
  const dark = i => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return Math.max(r, g, b) < 120 && r < b + 30; };
  const hair = new Uint8Array(w * h), st = [];
  for (let y = y0; y < y0 + (y1 - y0) * 0.18; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!clear[i] && dark(i)) { hair[i] = 1; st.push(i); }
  }
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    for (const j of [i + 1, i - 1, i + w, i - w]) {
      const jy = (j / w) | 0;
      if (j < 0 || j >= w * h || hair[j] || clear[j] || jy > limit || Math.abs((j % w) - x) > 1) continue;
      if (dark(j)) { hair[j] = 1; st.push(j); }
    }
  }
  const ramp = [[110, 60, 0], [214, 150, 20], [246, 204, 52], [255, 240, 130]];
  for (let i = 0; i < w * h; i++) if (hair[i]) {
    const L = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    const c = ramp[L < 28 ? 0 : L < 55 ? 1 : L < 80 ? 2 : 3];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2];
  }
}

const Sheets = {
  sheets: {},
  cache: new Map(),
  async load(base = '') {
    await Promise.all(Object.entries(SHEET_CFG).map(([name, cfg]) => new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => { this.sheets[name] = sliceSheet(img, cfg); ok(); };
      img.onerror = fail;
      img.src = base + cfg.src;
    })));
  },
  box(sheet, id) {
    const [r, i] = id.split('.').map(Number);
    return this.sheets[sheet].rows[r][i];
  },
  // ref: "r.i" or { id, x, y, w, h, seed: 'tblr', ssj } to take part of a box
  // (for sprites merged with their beam) or to recolour Goku's hair.
  frame(sheet, ref) {
    const key = sheet + JSON.stringify(ref);
    if (!this.cache.has(key)) {
      const r = typeof ref === 'string' ? { id: ref } : ref;
      let [x, y, w, h] = this.box(sheet, r.id);
      if (r.x) { x += r.x; w -= r.x; }
      if (r.w) w = Math.min(w, r.w);
      if (r.y) { y += r.y; h -= r.y; }
      if (r.h) h = Math.min(h, r.h);
      this.cache.set(key, cutOut(this.sheets[sheet], [x, y, w, h], r.seed || 'tblr', r.ssj));
    }
    return this.cache.get(key);
  },
};
window.Sheets = Sheets;
