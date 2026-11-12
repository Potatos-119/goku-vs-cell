// Records the README's GIFs from the real game: it opens index.html in a hidden Chrome (puppeteer), sets
// up each scene the way tools/checks.js does, steps the game 1/60 s at a time and screenshots the
// screen every other frame, then packs the shots into a GIF at 30 frames a second, twice the game's
// size with hard pixel edges (python3 with Pillow does the packing).
//
//   node tools/record-gifs.js                 # every scene
//   node tools/record-gifs.js kaioken         # only the scenes with "kaioken" in their name
//
// Needs puppeteer (npm i -g puppeteer, or npx once) and python3 with Pillow. Run it from a normal
// terminal: Chrome can't start inside a sandboxed shell.
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let puppeteer;
for (const p of ['puppeteer', path.join(os.homedir(), '.npm/_npx/4b4c857f6efdfb61/node_modules/puppeteer')]) {
  try { puppeteer = require(p); break; } catch (e) { /* try the next */ }
}
if (!puppeteer) { console.log('puppeteer not found: run  npm i -g puppeteer  (or  npx puppeteer browsers install chrome)'); process.exit(1); }

// each scene: what to set up in the page (with __scene, as in tools/checks.js), and how many seconds to film
const SCENES = {
  kaioken: { secs: 7.5, setup: `__scene(70); goku.ki = 100; goKaioken(goku);
    __after(2.4, () => { goku.ki = 100; goku.play('superDash', 'superDash'); superScene(goku, cell); });` },
  'ssj-combo': { secs: 4.5, setup: `__scene(40); goku.ki = 100; goku.facing = 1; startAttack(goku, 'p1');
    __after(0.2, () => comboTransform(goku, cell));` },
  'instant-transmission': { secs: 7, setup: `__scene(120); setForm(goku, 'ssj'); goku.ki = 100; instantKame(goku);` },
};

const PAGE_HELPERS = `
  window.__timers = [];
  window.__after = (t, fn) => __timers.push({ t, fn });
  window.__scene = gap => {
    reset('goku'); game.menu = []; timers = []; place();
    game.mode = 'fight'; game.skip = false; game.versus = false; game.training = false;
    player.x = W / 2 - gap / 2; boss.x = W / 2 + gap / 2; window.noAI = true;
  };
  window.__frame = async () => {
    for (let i = 0; i < 2; i++) {
      for (const t of __timers) if ((t.t -= 1 / 60) <= 0 && !t.done) { t.done = true; t.fn(); }
      window.__realStep(1 / 60); P1.pressed.clear(); P2.pressed.clear();
      for (let k = 0; k < 6; k++) await null;   // let the cutscenes' promises run
    }
    gfx.beginFrame(); render(); gfx.endFrame();
  };
`;

(async () => {
  const only = process.argv[2] || '';
  const browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360 });
  page.on('pageerror', e => console.log('page error:', e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.Sheets && typeof render === 'function' && typeof game !== 'undefined', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));   // the atlases decode
  // the page's own loop only draws from here on: the recorder moves the game
  await page.evaluate(() => { window.__realStep = window.step; window.step = () => 'frozen'; });
  await page.evaluate(PAGE_HELPERS);
  const el = await page.$('#game');
  for (const [name, sc] of Object.entries(SCENES)) {
    if (!name.includes(only)) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gif-'));
    await page.evaluate(sc.setup);
    const n = Math.round(sc.secs * 30);
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => window.__frame());
      await el.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png') });
    }
    const out = path.join(ROOT, 'assets', 'gifs', name + '.gif');
    execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
fr = [Image.open(os.path.join(d, f)).convert('RGB') for f in sorted(os.listdir(d))]
fr = [f.resize((640, 360), Image.NEAREST) for f in fr]
# one palette for the whole clip (no colour flicker), no dithering noise
strip = Image.new('RGB', (640, 360 * len(fr)))
for i, f in enumerate(fr): strip.paste(f, (0, i * 360))
pal = strip.resize((320, 180 * len(fr)), Image.NEAREST).quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in fr]
q[0].save(out, save_all=True, append_images=q[1:], duration=33, loop=0, optimize=True)
`, dir, out]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('wrote', path.relative(ROOT, out));
  }
  await browser.close();
})();
