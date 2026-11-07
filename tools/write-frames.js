// Writes the output of tools/bake.js into the game: node tools/write-frames.js <frames-bake.json>
//   assets/frames/atlas-N.png  the packed frames
//   assets/frames/frames.json  key -> { a: atlas, x, y, w, h, ax: body anchor, k: draw scale }
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('usage: node tools/write-frames.js <frames-bake.json>'); process.exit(1); }
const bake = JSON.parse(fs.readFileSync(src, 'utf8'));
const dir = path.join(__dirname, '..', 'assets', 'frames');
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (/^atlas-\d+\.png$/.test(f)) fs.unlinkSync(path.join(dir, f));
const atlases = bake.atlases.map((url, i) => {
  const name = `atlas-${i}.png`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
  return name;
});
fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ atlases, frames: bake.frames }) + '\n');
const kb = atlases.reduce((s, a) => s + fs.statSync(path.join(dir, a)).size, 0) / 1024;
console.log(`${Object.keys(bake.frames).length} frames, ${atlases.length} atlas(es), ${kb.toFixed(0)} KB -> assets/frames/`);
