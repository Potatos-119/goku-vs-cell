// Lists the frames tools/goku-forms.py works on (it runs this), as JSON on standard output. table says
// what each is: 'moves', a frame of base Goku's moves (GOKU_MOVES in data.js), which gets every look;
// 'native', a frame the newer sheet draws in an outfit of its own, which only has its colours matched.
// 'ssj', a frame of the Super Saiyan sheet (SS in data.js), which is cut out as it is for the torn gi
// and recoloured for the full one. anims: the moves a frame is in
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8') + ';this.M = GOKU_MOVES; this.N = GB_NATIVES; this.S = SS_FRAMES;', ctx);
const seen = new Map();
const add = (r, anim, table, ssj) => {
  const k = JSON.stringify(r);
  if (!seen.has(k)) seen.set(k, { key: k, ref: r, anim, anims: [], table, ssj: false });
  const e = seen.get(k); if (anim) e.anims.push(anim); e.ssj = e.ssj || ssj;
};
for (const [name, a] of Object.entries(ctx.M)) if (!a.native) for (const r of a.fr) if (!r.ssjOf) add(r, name, 'moves', false);
for (const r of ctx.N) add(r, '', 'native', false);
for (const r of ctx.S) add(r, '', 'ssj', false);
process.stdout.write(JSON.stringify([...seen.values()]));
