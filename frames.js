// The sprite frames, ready-made: tools/bake.js cut them once (white background removed, Super Saiyan
// recolours, gold auras, anchors) and packed them into assets/frames/atlas-N.png, with
// assets/frames/frames.json saying where each one sits. No canvas is needed to load or show them.
//
// A frame is looked up by the same (sheet, ref) pair the game always used, and has
//   width, height  its size in pixels      ax  where the body's centre is, from the left edge
//   k              how much bigger to draw it (a sheet drawn smaller than the rest)
//   atlas, ox, oy  which atlas image, and where in it (atlasW x atlasH)
const Frames = {
  frames: {},
  async load(base = '') {
    const man = await (await fetch(base + 'assets/frames/frames.json')).json();
    // decode the atlases up front so the first frame shown doesn't flicker in
    const atlases = await Promise.all(man.atlases.map(async a => {
      const im = new Image(); im.src = base + 'assets/frames/' + a; await im.decode();
      return { url: im.src, w: im.naturalWidth, h: im.naturalHeight };
    }));
    for (const [key, f] of Object.entries(man.frames)) {
      const at = atlases[f.a];
      this.frames[key] = { width: f.w, height: f.h, ax: f.ax, k: f.k, atlas: at.url, ox: f.x, oy: f.y, atlasW: at.w, atlasH: at.h };
    }
  },
  key: (sheet, ref) => sheet + JSON.stringify(ref),
  get(sheet, ref) {
    const f = this.frames[this.key(sheet, ref)];
    if (!f) throw new Error(`frame ${this.key(sheet, ref)} isn't baked: run tools/bake.js again`);
    return f;
  },
};
window.Frames = Frames;

// The game asks for frames through Sheets (sheets.js, which cuts them from the sheets on a canvas).
// Without sheets.js loaded, the same calls are answered from the baked frames.
if (!window.Sheets) window.Sheets = { load: base => Frames.load(base), frame: (sheet, ref) => Frames.get(sheet, ref) };
