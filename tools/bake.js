// Frame baker: cuts every sprite frame the game uses (white background removed, Super Saiyan
// recolours, gold auras, anchors worked out: everything sheets.js does at load time) and packs them
// into a few atlas images, so the game can load finished frames instead of cutting them on a canvas.
//
// Serve the project folder (python3 -m http.server 8766), open http://localhost:8766/tools/bake.html
// and press Bake. It downloads frames-bake.json. Then, from the project folder:
//   node tools/write-frames.js ~/Downloads/frames-bake.json
// which writes assets/frames/atlas-N.png and assets/frames/frames.json.
//
// A frame's key is the same one sheets.js caches it under: sheet + JSON.stringify(ref).
(function () {
  const ATLAS_W = 2048, PAD = 2;

  // every frame the game can ask for
  function wanted() {
    const list = [];
    const add = (sheet, ref) => list.push([sheet, ref]);
    // fighters: ANIMS.<who>.<form>.<anim>.fr[], drawn with Sheets.frame(who, ref)
    for (const [who, forms] of Object.entries(ANIMS))
      for (const anims of Object.values(forms))
        for (const a of Object.values(anims)) for (const fr of a.fr || []) add(who, fr);
    // projectiles, portraits, effects: { sheet, ref }, and Cell's five faces
    for (const v of Object.values(FX_ART)) if (v && v.sheet) add(v.sheet, v.ref);
    for (let k = 0; k < 5; k++) { const v = FX_ART.cellFace(k); add(v.sheet, v.ref); }
    for (const B of Object.values(BEAMS)) for (const part of ['start', 'body', 'head']) add(B[part].sheet, B[part].ref);
    // frames named directly in the code (the Cell Juniors that fly in)
    for (const id of Object.values(JR_FRAMES)) add('cell', id);
    return list;
  }

  // shelf packing: tallest first, left to right, a new shelf when the row is full
  function pack(frames) {
    const order = [...frames].sort((a, b) => b.c.height - a.c.height);
    const atlases = [];
    let cur = null;
    const newAtlas = () => { cur = { shelves: [], h: 0, items: [] }; atlases.push(cur); };
    newAtlas();
    let x = 0, y = 0, rowH = 0;
    for (const f of order) {
      const w = f.c.width + PAD, h = f.c.height + PAD;
      if (x + w > ATLAS_W) { x = 0; y += rowH; rowH = 0; }
      if (y + h > ATLAS_W) { newAtlas(); x = 0; y = 0; rowH = 0; }
      f.atlas = atlases.length - 1; f.x = x; f.y = y;
      cur.items.push(f); cur.h = Math.max(cur.h, y + h);
      x += w; rowH = Math.max(rowH, h);
    }
    return atlases.map(a => {
      const cv = document.createElement('canvas'); cv.width = ATLAS_W; cv.height = a.h;
      const cx = cv.getContext('2d');
      for (const f of a.items) cx.drawImage(f.c, f.x, f.y);
      return cv.toDataURL('image/png');
    });
  }

  window.bakeFrames = async function ({ download = true, base = '../' } = {}) {
    if (!Sheets.sheets.goku) await Sheets.load(base);
    for (const [sheet, ref] of wanted()) Sheets.frame(sheet, ref);
    // everything in the cache: the list above plus anything the game has asked for while running
    const frames = [...Sheets.cache.entries()].map(([key, c]) => ({ key, c }));
    const atlases = pack(frames);
    const out = { atlasWidth: ATLAS_W, atlases, frames: {} };
    for (const f of frames.sort((a, b) => a.key < b.key ? -1 : 1)) {
      out.frames[f.key] = { a: f.atlas, x: f.x, y: f.y, w: f.c.width, h: f.c.height, ax: +f.c.ax.toFixed(3), k: f.c.k || 1 };
    }
    console.log(`baked ${frames.length} frames into ${atlases.length} atlas image(s)`);
    if (download) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
      link.download = 'frames-bake.json'; link.click();
    }
    return out;
  };
})();
