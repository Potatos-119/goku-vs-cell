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
// The picture is drawn in sections (section()): the background, the fighters, the effects, the HUD...
// each a <g> of its own with its own numbering, so a spark or a rock appearing in one doesn't shift
// the numbers of everything drawn after it (which would make every later element look changed).
// The screen shake moves whole sections (one transform on the <g>) instead of every element in them.
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
    // sections, in the order they were first used; each keeps its drawn elements, gradients and clip
    // shapes in order (n, gn, cn: how many of each this frame)
    this.secs = []; this.secBy = {};
    this.shake = [0, 0]; // screen pixels the shaken sections are moved by this frame
    this.measureCache = new Map();
    this.log = null; // an array while recording (online host)
    this.section('main');
    this.reset();
  }
  // draw what follows into the named section; shaken ones move with the screen shake
  section(name, shaken = false) {
    let s = this.secBy[name];
    if (!s) {
      const k = this.secs.length;
      s = { k, g: this.make('g'), els: [], n: 0, grads: [], gn: 0, clips: [], cn: 0, shaken: false };
      s.g._a = {}; s.g._addr = 'L' + k;
      this.layer.append(s.g); this.secs.push(s); this.secBy[name] = s;
      if (this.log) this.log.push(['L', k]);
    }
    s.shaken = s.shaken || shaken;
    this.cur = s;
    return s;
  }
  make(tag) { return document.createElementNS(SVG_NS, tag); }

  // drop every element: the next frame builds (and records) the whole picture from scratch, for a
  // player who just joined
  resync() {
    for (const s of this.secs) for (const el of [s.g, ...s.grads, ...s.clips]) el.remove();
    this.secs = []; this.secBy = {};
    if (this.log) this.log.push(['X']);
    this.section('main');
  }

  // ---- frame ----
  beginFrame() {
    for (const s of this.secs) { s.n = s.gn = s.cn = 0; s.shaken = false; }
    this.shake = [0, 0]; this.section('main'); this.reset();
  }
  endFrame() {
    const [x, y] = this.shake;
    for (const s of this.secs) {
      for (let i = s.n; i < s.els.length; i++) this.attr(s.els[i], 'display', 'none');
      this.attr(s.g, 'transform', s.shaken && (x || y) ? `translate(${num(x)} ${num(y)})` : 'translate(0 0)');
    }
  }
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
    const s = this.cur;
    let el = s.els[s.n];
    if (!el || el.kind !== kind) {
      const fresh = this.make(tag); fresh.kind = kind; fresh._a = {}; fresh._addr = `e${s.k}.${s.n}`;
      if (el) s.g.replaceChild(fresh, el); else s.g.append(fresh);
      if (this.log) this.log.push(['E', s.k, s.n, tag, kind]);
      el = s.els[s.n] = fresh;
    }
    s.n++;
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
    const s = this.cur, i = s.gn++, id = `g${s.k}_${i}`, tag = p.kind === 'linear' ? 'linearGradient' : 'radialGradient';
    let el = s.grads[i];
    if (!el || el.tagName !== tag) {
      const fresh = this.make(tag); fresh._a = {}; fresh._addr = id; fresh.setAttribute('id', id); fresh.setAttribute('gradientUnits', 'userSpaceOnUse');
      if (el) this.defs.replaceChild(fresh, el); else this.defs.append(fresh);
      if (this.log) this.log.push(['G', s.k, i, tag]);
      el = s.grads[i] = fresh;
    }
    const a = p.args.map(num);
    if (p.kind === 'linear') { this.attr(el, 'x1', a[0]); this.attr(el, 'y1', a[1]); this.attr(el, 'x2', a[2]); this.attr(el, 'y2', a[3]); }
    else { this.attr(el, 'fx', a[0]); this.attr(el, 'fy', a[1]); this.attr(el, 'fr', a[2]); this.attr(el, 'cx', a[3]); this.attr(el, 'cy', a[4]); this.attr(el, 'r', a[5]); }
    const stops = [...p.stops].sort((x, y) => x[0] - y[0]);
    if (el.children.length > stops.length) {
      while (el.children.length > stops.length) el.lastChild.remove();
      if (this.log) this.log.push(['T', s.k, i, stops.length]);
    }
    stops.forEach(([at, color], j) => {
      let stop = el.children[j];
      if (!stop) { stop = this.make('stop'); stop._a = {}; stop._addr = el._addr + 's' + j; el.append(stop); if (this.log) this.log.push(['S', s.k, i]); }
      this.attr(stop, 'offset', num(at)); this.attr(stop, 'stop-color', color);
    });
    return `url(#${id})`;
  }

  // a clip shape (kept in screen space) in the coordinates of the element being drawn
  clipFor(poly) {
    const [a, b, c, d, e, f] = this.st.m, det = a * d - b * c;
    const local = poly.map(([x, y]) => [(d * (x - e) - c * (y - f)) / det, (a * (y - f) - b * (x - e)) / det]);
    const s = this.cur, i = s.cn++, id = `c${s.k}_${i}`;
    let el = s.clips[i];
    if (!el) {
      el = this.make('clipPath'); el.setAttribute('id', id); el.setAttribute('clipPathUnits', 'userSpaceOnUse');
      el.shape = this.make('polygon'); el.shape._a = {}; el.shape._addr = id + 'p'; el.append(el.shape); this.defs.append(el);
      s.clips[i] = el;
      if (this.log) this.log.push(['C', s.k, i]);
    }
    this.attr(el.shape, 'points', local.map(([x, y]) => `${num(x)},${num(y)}`).join(' '));
    return id;
  }
}
window.Gfx = Gfx;

// The other player's screen: applies a Gfx log (see Gfx.log) to an <svg> of its own, element for
// element, so it shows the host's drawing exactly. Log entries (k is the section):
//   ['L', k]                section k is new (a <g> after the others)
//   ['E', k, n, tag, kind]  the nth element of section k is new
//   ['G', k, i, tag]        gradient i of section k is new      ['S', k, i]  it gets another stop
//   ['T', k, i, n]          gradient i of section k keeps n stops
//   ['C', k, i]             clip shape i of section k is new    ['X']        start over (resync)
//   [address, name, value]  an attribute changed ('#' is the text)
class GfxMirror {
  // gfx: this page's own renderer, whose <svg> (style, defs, layer) it takes over
  constructor(gfx) {
    gfx.resync();
    for (const s of gfx.secs) s.g.remove(); // the host's sections take their place
    this.gfx = gfx; this.at = {}; this.secs = [];
  }
  make(tag, addr) { const el = document.createElementNS(SVG_NS, tag); if (addr) this.at[addr] = el; return el; }
  clear() {
    for (const s of this.secs) if (s) for (const el of [s.g, ...s.grads, ...s.clips]) if (el) el.remove();
    this.at = {}; this.secs = [];
  }
  // the match is over: take the host's picture off this screen, so this page can draw its own again
  dispose() { this.clear(); this.gfx.resync(); }
  apply(log) {
    const { layer, defs } = this.gfx;
    for (const op of log) {
      // one entry that doesn't fit (it shouldn't happen) mustn't stop the rest of the picture
      try { this.op(op, layer, defs); } catch (e) { /* skip it */ }
    }
  }
  op(op, layer, defs) {
    const s = this.secs[op[1]];
    switch (op[0]) {
      case 'X': this.clear(); break;
      case 'L': {
        const g = this.make('g', 'L' + op[1]);
        layer.append(g); this.secs[op[1]] = { g, els: [], grads: [], clips: [] };
        break;
      }
      case 'E': {
        const [, k, n, tag, kind] = op, addr = `e${k}.${n}`, el = this.make(tag, addr);
        if (kind === 'img') {
          const view = this.make('svg', addr + 'v'), pic = this.make('image', addr + 'p');
          view.setAttribute('preserveAspectRatio', 'none'); view.append(pic); el.append(view);
        }
        if (s.els[n]) s.g.replaceChild(el, s.els[n]); else s.g.append(el);
        s.els[n] = el;
        break;
      }
      case 'G': {
        const [, k, i, tag] = op, id = `g${k}_${i}`, el = this.make(tag, id);
        el.setAttribute('id', id); el.setAttribute('gradientUnits', 'userSpaceOnUse');
        if (s.grads[i]) defs.replaceChild(el, s.grads[i]); else defs.append(el);
        s.grads[i] = el;
        break;
      }
      case 'S': { const g = s.grads[op[2]]; g.append(this.make('stop', `${g.id}s${g.children.length}`)); break; }
      case 'T': { const g = s.grads[op[2]]; while (g.children.length > op[3]) g.lastChild.remove(); break; }
      case 'C': {
        const [, k, i] = op, id = `c${k}_${i}`, el = this.make('clipPath'), poly = this.make('polygon', id + 'p');
        el.setAttribute('id', id); el.setAttribute('clipPathUnits', 'userSpaceOnUse');
        el.append(poly); defs.append(el); s.clips[i] = el;
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
window.GfxMirror = GfxMirror;
