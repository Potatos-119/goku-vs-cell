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
//
// For online play the changes can be recorded (gfx.log): every new element and every attribute that
// changed, by address. GfxMirror replays them on the other player's screen, so it shows exactly this
// drawing without running the game.
const SVG_NS = 'http://www.w3.org/2000/svg';
const BLEND = CSS.supports('mix-blend-mode', 'plus-lighter') ? 'plus-lighter' : 'screen';
const TAU = Math.PI * 2;
const num = v => Math.round(v * 10) / 10; // 1 decimal (a 40th of a world pixel): fewer changed attributes, smaller online updates

// Text into an SVG <text>. The game's pixel fonts have no PlayStation button symbols (□ △ ○ ✕),
// and the system font's are small, so those get a <tspan> of their own, bigger and bold.
const PAD_SYMBOL = /[\u25a1\u25b3\u25cb\u2715]/;
function setText(el, s) {
  el._text = s;
  if (!PAD_SYMBOL.test(s)) { el.textContent = s; return; }
  el.textContent = '';
  for (const part of s.split(/([\u25a1\u25b3\u25cb\u2715])/)) {
    if (!part) continue;
    const t = document.createElementNS(SVG_NS, 'tspan'); t.textContent = part;
    if (PAD_SYMBOL.test(part)) t.setAttribute('style', 'font-family:"Segoe UI Symbol","Apple Symbols","DejaVu Sans",sans-serif;font-size:1.35em;font-weight:bold');
    el.append(t);
  }
}

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
    this.log = null; // an array while recording (online host)
    this.reset();
  }
  make(tag) { return document.createElementNS(SVG_NS, tag); }

  // drop every element: the next frame builds (and records) the whole picture from scratch, for a
  // player who just joined
  resync() {
    for (const el of [...this.els, ...this.grads, ...this.clips]) el.remove();
    this.els = []; this.grads = []; this.clips = [];
    if (this.log) this.log.push(['X']);
  }

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
    if (el._text !== String(s)) { setText(el, String(s)); if (this.log) this.log.push([el._addr, '#', String(s)]); }
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
      g.view = this.make('svg'); g.view.setAttribute('preserveAspectRatio', 'none'); g.view._a = {}; g.view._addr = g._addr + 'v';
      g.pic = this.make('image'); g.pic._a = {}; g.pic._addr = g._addr + 'p';
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
      const fresh = this.make(tag); fresh.kind = kind; fresh._a = {}; fresh._addr = 'e' + this.n;
      if (el) this.layer.replaceChild(fresh, el); else this.layer.append(fresh);
      if (this.log) this.log.push(['E', this.n, tag, kind]);
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
  attr(el, k, v) { if (el._a[k] !== v) { el._a[k] = v; el.setAttribute(k, v); if (this.log) this.log.push([el._addr, k, v]); } }

  // a colour, or a gradient written into <defs> (in the drawing's own coordinates)
  paint(p) {
    if (!(p instanceof Gradient)) return p;
    const id = 'g' + this.gn, tag = p.kind === 'linear' ? 'linearGradient' : 'radialGradient';
    let el = this.grads[this.gn++];
    if (!el || el.tagName !== tag) {
      const fresh = this.make(tag); fresh._a = {}; fresh._addr = id; fresh.setAttribute('id', id); fresh.setAttribute('gradientUnits', 'userSpaceOnUse');
      if (el) this.defs.replaceChild(fresh, el); else this.defs.append(fresh);
      if (this.log) this.log.push(['G', this.gn - 1, tag]);
      el = this.grads[this.gn - 1] = fresh;
    }
    const a = p.args.map(num);
    if (p.kind === 'linear') { this.attr(el, 'x1', a[0]); this.attr(el, 'y1', a[1]); this.attr(el, 'x2', a[2]); this.attr(el, 'y2', a[3]); }
    else { this.attr(el, 'fx', a[0]); this.attr(el, 'fy', a[1]); this.attr(el, 'fr', a[2]); this.attr(el, 'cx', a[3]); this.attr(el, 'cy', a[4]); this.attr(el, 'r', a[5]); }
    const stops = [...p.stops].sort((x, y) => x[0] - y[0]);
    if (el.children.length > stops.length) {
      while (el.children.length > stops.length) el.lastChild.remove();
      if (this.log) this.log.push(['T', this.gn - 1, stops.length]);
    }
    stops.forEach(([at, color], i) => {
      let s = el.children[i];
      if (!s) { s = this.make('stop'); s._a = {}; s._addr = el._addr + 's' + i; el.append(s); if (this.log) this.log.push(['S', this.gn - 1]); }
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
      el.shape = this.make('polygon'); el.shape._a = {}; el.shape._addr = id + 'p'; el.append(el.shape); this.defs.append(el);
      this.clips[this.cn - 1] = el;
      if (this.log) this.log.push(['C', this.cn - 1]);
    }
    this.attr(el.shape, 'points', local.map(([x, y]) => `${num(x)},${num(y)}`).join(' '));
    return id;
  }
}
window.Gfx = Gfx;

// The other player's screen: applies a Gfx log (see Gfx.log) to an <svg> of its own, element for
// element, so it shows the host's drawing exactly. Log entries:
//   ['E', n, tag, kind]  the nth drawn element is new         ['G', i, tag]  gradient i is new
//   ['S', i]             gradient i gets another stop          ['T', i, n]    gradient i keeps n stops
//   ['C', i]             clip shape i is new                   ['X']          start over (resync)
//   [address, name, value]  an attribute changed ('#' is the text)
class GfxMirror {
  // gfx: this page's own renderer, whose <svg> (style, defs, layer) it takes over
  constructor(gfx) {
    gfx.resync(); this.gfx = gfx;
    this.at = {}; this.els = []; this.grads = []; this.clips = [];
  }
  make(tag, addr) { const el = document.createElementNS(SVG_NS, tag); if (addr) this.at[addr] = el; return el; }
  // the match is over: take the host's picture off this screen, so this page can draw its own again
  dispose() {
    for (const el of [...this.els, ...this.grads, ...this.clips]) el.remove();
    this.at = {}; this.els = []; this.grads = []; this.clips = [];
    this.gfx.resync();
  }
  apply(log) {
    const { layer, defs } = this.gfx;
    for (const op of log) {
      switch (op[0]) {
        case 'X':
          for (const el of [...this.els, ...this.grads, ...this.clips]) el.remove();
          this.at = {}; this.els = []; this.grads = []; this.clips = [];
          break;
        case 'E': {
          const [, n, tag, kind] = op, addr = 'e' + n, el = this.make(tag, addr);
          if (kind === 'img') {
            const view = this.make('svg', addr + 'v'), pic = this.make('image', addr + 'p');
            view.setAttribute('preserveAspectRatio', 'none'); view.append(pic); el.append(view);
          }
          if (this.els[n]) layer.replaceChild(el, this.els[n]); else layer.append(el);
          this.els[n] = el;
          break;
        }
        case 'G': {
          const [, i, tag] = op, el = this.make(tag, 'g' + i);
          el.setAttribute('id', 'g' + i); el.setAttribute('gradientUnits', 'userSpaceOnUse');
          if (this.grads[i]) defs.replaceChild(el, this.grads[i]); else defs.append(el);
          this.grads[i] = el;
          break;
        }
        case 'S': { const g = this.grads[op[1]]; g.append(this.make('stop', `g${op[1]}s${g.children.length}`)); break; }
        case 'T': { const g = this.grads[op[1]]; while (g.children.length > op[2]) g.lastChild.remove(); break; }
        case 'C': {
          const i = op[1], el = this.make('clipPath'), poly = this.make('polygon', `c${i}p`);
          el.setAttribute('id', 'c' + i); el.setAttribute('clipPathUnits', 'userSpaceOnUse');
          el.append(poly); defs.append(el); this.clips[i] = el;
          break;
        }
        default: {
          const el = this.at[op[0]];
          if (!el) break;
          if (op[1] === '#') setText(el, op[2]); else el.setAttribute(op[1], op[2]);
        }
      }
    }
  }
}
window.GfxMirror = GfxMirror;
