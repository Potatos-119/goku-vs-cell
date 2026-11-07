// The renderer: draws the game as SVG, part of the page's DOM, with no <canvas>.
//
// The game draws with the familiar 2D drawing calls (fillRect, arc, fill, drawImage, fillText,
// gradients, save/restore, transforms...). Each call that puts something on screen becomes one SVG
// element, in draw order, so what's drawn later sits on top. Elements are kept from frame to frame:
// the Nth thing drawn this frame reuses the Nth element of the last frame when it's the same kind,
// and an attribute is only written when its value changed, so a still scene touches the DOM hardly
// at all. Whatever wasn't drawn this frame is hidden.
//
// Sprites come from the baked atlas (frames.js): a frame is a window onto the atlas image.
const SVG_NS = 'http://www.w3.org/2000/svg';
const BLEND = CSS.supports('mix-blend-mode', 'plus-lighter') ? 'plus-lighter' : 'screen';
const TAU = Math.PI * 2;
const num = v => Math.round(v * 100) / 100; // 2 decimals: enough for pixel art, and fewer changed attributes

class Gradient {
  constructor(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
  addColorStop(at, color) { this.stops.push([at, color]); }
}

class Gfx {
  constructor(svg, width, height) {
    this.svg = svg;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    // 'lighter' (additive glow) is a blend mode on the element
    const style = this.make('style'); style.textContent = `.add{mix-blend-mode:${BLEND}}`; svg.append(style);
    this.defs = this.make('defs'); svg.append(this.defs);
    this.layer = this.make('g'); svg.append(this.layer);
    this.els = []; this.n = 0;   // the drawn elements, in order
    this.grads = []; this.gn = 0; // gradients used this frame
    this.clips = []; this.cn = 0; // clip shapes used this frame
    this.measureCache = new Map();
    this.reset();
  }
  make(tag) { return document.createElementNS(SVG_NS, tag); }

  // ---- frame ----
  beginFrame() { this.n = 0; this.gn = 0; this.cn = 0; this.reset(); }
  endFrame() { for (let i = this.n; i < this.els.length; i++) this.attr(this.els[i], 'display', 'none'); }
  reset() {
    this.st = {
      m: [1, 0, 0, 1, 0, 0], alpha: 1, comp: 'source-over', fill: '#000', stroke: '#000', lineWidth: 1,
      font: '10px sans-serif', align: 'start', baseline: 'alphabetic', join: 'miter', smooth: true, clip: null,
    };
    this.stack = []; this.path = ''; this.pen = null;
  }

  // ---- state, as on a 2D context ----
  get fillStyle() { return this.st.fill; } set fillStyle(v) { this.st.fill = v; }
  get strokeStyle() { return this.st.stroke; } set strokeStyle(v) { this.st.stroke = v; }
  get lineWidth() { return this.st.lineWidth; } set lineWidth(v) { this.st.lineWidth = v; }
  get globalAlpha() { return this.st.alpha; } set globalAlpha(v) { this.st.alpha = v; }
  get globalCompositeOperation() { return this.st.comp; } set globalCompositeOperation(v) { this.st.comp = v; }
  get font() { return this.st.font; } set font(v) { this.st.font = v; }
  get textAlign() { return this.st.align; } set textAlign(v) { this.st.align = v; }
  get textBaseline() { return this.st.baseline; } set textBaseline(v) { this.st.baseline = v; }
  get lineJoin() { return this.st.join; } set lineJoin(v) { this.st.join = v; }
  get imageSmoothingEnabled() { return this.st.smooth; } set imageSmoothingEnabled(v) { this.st.smooth = v; }
  set imageSmoothingQuality(v) { /* the browser picks */ }
  save() { this.stack.push({ ...this.st, m: this.st.m.slice() }); }
  restore() { if (this.stack.length) this.st = this.stack.pop(); }

  // ---- transforms ----
  setTransform(a, b, c, d, e, f) { this.st.m = [a, b, c, d, e, f]; }
  resetTransform() { this.st.m = [1, 0, 0, 1, 0, 0]; }
  transform(a, b, c, d, e, f) {
    const [A, B, C, D, E, F] = this.st.m;
    this.st.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); }

  // ---- paths ----
  beginPath() { this.path = ''; this.pen = null; }
  moveTo(x, y) { this.path += `M${num(x)} ${num(y)}`; this.pen = [x, y]; }
  lineTo(x, y) { this.path += (this.pen ? 'L' : 'M') + `${num(x)} ${num(y)}`; this.pen = [x, y]; }
  bezierCurveTo(a, b, c, d, x, y) { this.path += `C${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(x)} ${num(y)}`; this.pen = [x, y]; }
  quadraticCurveTo(a, b, x, y) { this.path += `Q${num(a)} ${num(b)} ${num(x)} ${num(y)}`; this.pen = [x, y]; }
  closePath() { this.path += 'Z'; }
  rect(x, y, w, h) { this.path += `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`; this.pen = [x, y]; }
  arc(x, y, r, a0, a1, ccw = false) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    const pt = a => {
      const px = rx * Math.cos(a), py = ry * Math.sin(a), c = Math.cos(rot), s = Math.sin(rot);
      return [x + px * c - py * s, y + px * s + py * c];
    };
    let d = ccw ? a0 - a1 : a1 - a0;
    const full = Math.abs(d) >= TAU - 1e-9;
    if (!full) { d %= TAU; if (d < 0) d += TAU; }
    const [sx, sy] = pt(a0);
    this.path += (this.pen ? 'L' : 'M') + `${num(sx)} ${num(sy)}`;
    const deg = num(rot * 180 / Math.PI), sweep = ccw ? 0 : 1, arcTo = (a, large) => {
      const [ex, ey] = pt(a);
      this.path += `A${num(rx)} ${num(ry)} ${deg} ${large} ${sweep} ${num(ex)} ${num(ey)}`;
      return [ex, ey];
    };
    // a whole turn can't be one SVG arc (its ends would meet): draw it as two halves
    if (full) { arcTo(a0 + (ccw ? -Math.PI : Math.PI), 0); this.pen = arcTo(a0, 0); }
    else this.pen = arcTo(ccw ? a0 - d : a0 + d, d > Math.PI ? 1 : 0);
  }
  clip() {
    // the game only clips to a rect(): keep its corners in screen space, so it holds for whatever is
    // drawn next, under any transform, until restore()
    const r = this.path.match(/^M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)/);
    if (!r) return;
    const [x, y, w, h] = r.slice(1).map(Number);
    this.st.clip = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => this.apply(px, py));
  }
  apply(x, y) { const [a, b, c, d, e, f] = this.st.m; return [a * x + c * y + e, b * x + d * y + f]; }

  // ---- drawing ----
  fill() { if (this.path) this.shape('path', { d: this.path, fill: this.paint(this.st.fill), stroke: 'none' }); }
  stroke() { if (this.path) this.shape('path', { d: this.path, fill: 'none', ...this.line() }); }
  fillRect(x, y, w, h) { this.shape('rect', { x: num(x), y: num(y), width: num(Math.abs(w)), height: num(Math.abs(h)), fill: this.paint(this.st.fill), stroke: 'none' }); }
  strokeRect(x, y, w, h) { this.shape('rect', { x: num(x), y: num(y), width: num(w), height: num(h), fill: 'none', ...this.line() }); }
  clearRect() { /* every frame starts empty */ }
  line() { return { stroke: this.paint(this.st.stroke), 'stroke-width': num(this.st.lineWidth), 'stroke-linejoin': this.st.join }; }
  createLinearGradient(...a) { return new Gradient('linear', a); }
  createRadialGradient(...a) { return new Gradient('radial', a); }

  fillText(s, x, y) { this.text(s, x, y, { fill: this.paint(this.st.fill), stroke: 'none' }); }
  strokeText(s, x, y) { this.text(s, x, y, { fill: 'none', ...this.line() }); }
  text(s, x, y, paint) {
    const anchor = { center: 'middle', right: 'end', end: 'end' }[this.st.align] || 'start';
    const base = { top: 'text-before-edge', hanging: 'hanging', middle: 'central', bottom: 'text-after-edge' }[this.st.baseline] || 'auto';
    const el = this.shape('text', { x: num(x), y: num(y), 'text-anchor': anchor, 'dominant-baseline': base, style: `font:${this.st.font};white-space:pre`, ...paint });
    if (el.textContent !== String(s)) el.textContent = s;
  }
  measureText(s) {
    const key = this.st.font + '|' + s;
    let w = this.measureCache.get(key);
    if (w == null) {
      if (!this.ruler) { this.ruler = this.make('text'); this.ruler.setAttribute('visibility', 'hidden'); this.svg.append(this.ruler); }
      this.ruler.setAttribute('style', `font:${this.st.font};white-space:pre`); this.ruler.textContent = s;
      w = this.ruler.getComputedTextLength();
      if (this.measureCache.size > 2000) this.measureCache.clear();
      this.measureCache.set(key, w);
    }
    return { width: w };
  }

  // drawImage(img, dx, dy) / (img, dx, dy, dw, dh) / (img, sx, sy, sw, sh, dx, dy, dw, dh). img is a
  // baked frame (frames.js) or a loaded <img>
  drawImage(img, ...a) {
    const iw = img.width, ih = img.height;
    let [sx, sy, sw, sh, dx, dy, dw, dh] = a.length === 8 ? a : a.length === 4 ? [0, 0, iw, ih, ...a] : [0, 0, iw, ih, a[0], a[1], iw, ih];
    if (!(sw > 0 && sh > 0 && dw && dh)) return;
    // a frame is a window onto its atlas; a plain image is its own atlas
    const src = img.atlas || img.src, ox = img.ox || 0, oy = img.oy || 0;
    const aw = img.atlasW || img.naturalWidth || iw, ah = img.atlasH || img.naturalHeight || ih;
    if (!src) return;
    const g = this.shape('g', {}, 'img');
    if (!g.view) {
      g.view = this.make('svg'); g.view.setAttribute('preserveAspectRatio', 'none'); g.view._a = {};
      g.pic = this.make('image'); g.pic._a = {};
      g.view.append(g.pic); g.append(g.view);
    }
    this.attr(g.view, 'x', num(dw < 0 ? dx + dw : dx)); this.attr(g.view, 'y', num(dh < 0 ? dy + dh : dy));
    this.attr(g.view, 'width', num(Math.abs(dw))); this.attr(g.view, 'height', num(Math.abs(dh)));
    this.attr(g.view, 'viewBox', `${num(ox + sx)} ${num(oy + sy)} ${num(sw)} ${num(sh)}`);
    this.attr(g.pic, 'href', src); this.attr(g.pic, 'width', aw); this.attr(g.pic, 'height', ah);
    this.attr(g.pic, 'style', this.st.smooth && !img.atlas ? '' : 'image-rendering:pixelated');
  }

  // ---- elements ----
  // the next element in draw order: reuse last frame's if it's the same kind, else swap in a new one
  shape(tag, attrs, kind = tag) {
    let el = this.els[this.n];
    if (!el || el.kind !== kind) {
      const fresh = this.make(tag); fresh.kind = kind; fresh._a = {};
      if (el) this.layer.replaceChild(fresh, el); else this.layer.append(fresh);
      el = this.els[this.n] = fresh;
    }
    this.n++;
    const [a, b, c, d, e, f] = this.st.m;
    this.attr(el, 'display', 'inline');
    this.attr(el, 'transform', `matrix(${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(e)} ${num(f)})`);
    this.attr(el, 'opacity', num(this.st.alpha));
    this.attr(el, 'class', this.st.comp === 'lighter' ? 'add' : '');
    this.attr(el, 'clip-path', this.st.clip ? `url(#${this.clipFor(this.st.clip)})` : 'none');
    for (const k in attrs) this.attr(el, k, attrs[k]);
    return el;
  }
  attr(el, k, v) { if (el._a[k] !== v) { el._a[k] = v; el.setAttribute(k, v); } }

  // a colour, or a gradient written into <defs> (in the drawing's own coordinates)
  paint(p) {
    if (!(p instanceof Gradient)) return p;
    const id = 'g' + this.gn, tag = p.kind === 'linear' ? 'linearGradient' : 'radialGradient';
    let el = this.grads[this.gn++];
    if (!el || el.tagName !== tag) {
      const fresh = this.make(tag); fresh._a = {}; fresh.setAttribute('id', id); fresh.setAttribute('gradientUnits', 'userSpaceOnUse');
      if (el) this.defs.replaceChild(fresh, el); else this.defs.append(fresh);
      el = this.grads[this.gn - 1] = fresh;
    }
    const a = p.args.map(num);
    if (p.kind === 'linear') { this.attr(el, 'x1', a[0]); this.attr(el, 'y1', a[1]); this.attr(el, 'x2', a[2]); this.attr(el, 'y2', a[3]); }
    else { this.attr(el, 'fx', a[0]); this.attr(el, 'fy', a[1]); this.attr(el, 'fr', a[2]); this.attr(el, 'cx', a[3]); this.attr(el, 'cy', a[4]); this.attr(el, 'r', a[5]); }
    const stops = [...p.stops].sort((x, y) => x[0] - y[0]);
    while (el.children.length > stops.length) el.lastChild.remove();
    stops.forEach(([at, color], i) => {
      let s = el.children[i];
      if (!s) { s = this.make('stop'); s._a = {}; el.append(s); }
      this.attr(s, 'offset', num(at)); this.attr(s, 'stop-color', color);
    });
    return `url(#${id})`;
  }

  // a clip shape (kept in screen space) in the coordinates of the element being drawn
  clipFor(poly) {
    const [a, b, c, d, e, f] = this.st.m, det = a * d - b * c;
    const local = poly.map(([x, y]) => [(d * (x - e) - c * (y - f)) / det, (a * (y - f) - b * (x - e)) / det]);
    const id = 'c' + this.cn;
    let el = this.clips[this.cn++];
    if (!el) {
      el = this.make('clipPath'); el.setAttribute('id', id); el.setAttribute('clipPathUnits', 'userSpaceOnUse');
      el.shape = this.make('polygon'); el.append(el.shape); this.defs.append(el);
      this.clips[this.cn - 1] = el;
    }
    el.shape.setAttribute('points', local.map(([x, y]) => `${num(x)},${num(y)}`).join(' '));
    return id;
  }
}
window.Gfx = Gfx;
