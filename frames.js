// The sprite frames, ready-made: tools/bake.js cut them once (white background removed, Super Saiyan
// recolours, gold auras, anchors) and packed them into assets/frames/atlas-N.png, with
// assets/frames/frames.json saying where each one sits. No canvas is needed to load or show them: a
// frame is an element with the atlas as its background, shifted to the frame's spot.
//
// A frame is looked up by the same (sheet, ref) pair the game uses for Sheets.frame, and has
//   w, h  its size in pixels      ax  where the body's centre is, from the left edge
//   k     how much bigger to draw it (a sheet drawn smaller than the rest)
//   url, x, y  which atlas, and where in it
const Frames = {
  frames: {},
  async load(base = '') {
    const man = await (await fetch(base + 'assets/frames/frames.json')).json();
    const urls = man.atlases.map(a => base + 'assets/frames/' + a);
    // decode the atlases up front so the first frame shown doesn't flicker in
    await Promise.all(urls.map(u => { const im = new Image(); im.src = u; return im.decode(); }));
    for (const [key, f] of Object.entries(man.frames)) this.frames[key] = { ...f, url: urls[f.a] };
  },
  key: (sheet, ref) => sheet + JSON.stringify(ref),
  get(sheet, ref) {
    const f = this.frames[this.key(sheet, ref)];
    if (!f) throw new Error(`frame ${this.key(sheet, ref)} isn't baked: run tools/bake.js again`);
    return f;
  },
  // show frame f on element el (its size, and the atlas shifted so only the frame shows)
  show(el, f) {
    if (el.frame === f) return; // already showing it: touch nothing, so nothing is restyled
    el.frame = f;
    const s = el.style;
    s.width = f.w + 'px'; s.height = f.h + 'px';
    s.backgroundImage = `url(${f.url})`;
    s.backgroundPosition = `${-f.x}px ${-f.y}px`;
  },
};
window.Frames = Frames;
