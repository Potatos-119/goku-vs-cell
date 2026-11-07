// ---------- fighters ----------
class Fighter {
  constructor(who, maxHp) {
    Object.assign(this, {
      who, x: 0, y: FLOOR, vx: 0, vy: 0, facing: 1, hp: maxHp, maxHp, ki: 0, form: 'base',
      state: 'idle', anim: 'idle', at: 0, t2: 0, stun: 0, inv: 0, dmgMul: 1, speed: 1,
      visible: true, queue: [], next: null, hitDone: false, emitted: 0, blockT: 0,
      stamina: 100, staminaDelay: 0, guardBroken: false, trailT: 0, counter: false, hover: 0, big: false,
      flash: 0, sq: 0, // hit flash timer; squash (+) / stretch (-) that springs back to 0
      juggle: 0, comboTaken: 0, hitLanded: false, wallBounce: false, spiked: false, assistCd: 0,
      // Cell's sheet is drawn smaller than Goku's; 1.25 keeps pixels whole at 4x
      scale: who === 'cell' ? 1.25 : 1,
    });
  }
  A(name = this.anim) { return ANIMS[this.who][this.form][name] || ANIMS[this.who].base[name]; }
  play(anim, state = anim) {
    if (this.state !== state && ['charge', 'kameFire', 'kiHold'].includes(this.state)) sfx.stopSustain(this);
    if (this.state !== state && ['kameCharge', 'kameFire'].includes(this.state)) sfx.stopKame(this);
    this.anim = anim; this.state = state; this.at = 0; this.hitDone = false; this.hitLanded = false; this.emitted = 0;
  }
  // loopFrom: a looping animation whose first frames play once, as an opening (the charge's small aura)
  get fi() {
    const a = this.A(), i = Math.floor(this.at * a.fps), n = a.fr.length, lf = a.loopFrom || 0;
    return a.loop ? (i < n ? i : lf + (i - lf) % (n - lf)) : Math.min(i, n - 1);
  }
  get animDone() { const a = this.A(); return !a.loop && this.at * a.fps >= a.fr.length; }
  get img() {
    // turning around while standing shows the turn frame for an instant instead of snapping over
    if (this.turnT > 0 && this.free && this.A('turn')) return Sheets.frame(this.who, this.A('turn').fr[0]);
    return Sheets.frame(this.who, this.A().fr[this.fi]);
  }
  get free() { return this.state === 'idle' || this.state === 'walk'; }
  box() { return { x0: this.x - 11, x1: this.x + 11, y0: this.y - 46, y1: this.y }; }
  hand(anim) {
    const a = this.A(anim), im = Sheets.frame(this.who, a.fr[[].concat(a.emitAt ?? 0)[0]]);
    const k = this.scale * (im.k || 1);
    return [this.x + this.facing * (im.width - im.ax) * k, this.y - a.emit * k];
  }
  draw() {
    if (!this.visible) return;
    const im = this.img;
    gfx.save();
    gfx.translate(Math.round(this.x), Math.round(this.y - this.hover));
    // a held stance breathes a little instead of standing frozen
    const breath = this.A().breathe ? Math.sin(this.at * 2.6) * 0.018 : 0;
    const k = this.scale * (im.k || 1);
    gfx.scale(this.facing * k * (1 + this.sq), k * (1 - this.sq + breath));
    if (this.inv > 0 && Math.floor(this.inv * 20) % 2) gfx.globalAlpha = 0.5;
    gfx.drawImage(im, -Math.round(im.ax), -im.height);
    if (this.flash > 0) {
      gfx.globalCompositeOperation = 'lighter'; gfx.globalAlpha = settings.calm ? 0.35 : 0.75;
      gfx.drawImage(im, -Math.round(im.ax), -im.height);
    }
    gfx.restore();
  }
}

// accessibility: calm mode cuts screen shake and flashing (remembered between visits)
const settings = { calm: false };
try { settings.calm = localStorage.getItem('calmMode') === '1'; } catch (e) { /* storage blocked */ }
// Screen shake as decaying trauma: hits add to it instead of resetting it, and it eases back to rest.
// the FPS counter in the corner (F2, or Options), remembered between visits
settings.fps = false;
try { settings.fps = localStorage.getItem('fpsCounter') === '1'; } catch (e) { /* storage blocked */ }
function toggleFps() {
  settings.fps = !settings.fps;
  try { localStorage.setItem('fpsCounter', settings.fps ? '1' : '0'); } catch (e) { /* not saved, still works */ }
}
function toggleCalm() {
  settings.calm = !settings.calm;
  try { localStorage.setItem('calmMode', settings.calm ? '1' : '0'); } catch (e) { /* not saved, still works */ }
}
// difficulty (remembered between visits): how hard the boss hits you, how often it decides what to do
// next (think) and how likely it is to answer your ki blasts (react). Normal is the game as tuned.
const DIFFICULTY = {
  easy: { label: 'EASY', taken: 0.65, think: 1.5, react: 0.55 },
  normal: { label: 'NORMAL', taken: 1, think: 1, react: 1 },
  // airExt: on Hard the boss stretches its air combos this many times per phase before finishing
  hard: { label: 'HARD', taken: 1.3, think: 0.7, react: 1.25, airExt: [1, 2, 3] },
};
const DIFF_LEVELS = Object.keys(DIFFICULTY);
settings.difficulty = 'normal';
try { const d = localStorage.getItem('difficulty'); if (DIFFICULTY[d]) settings.difficulty = d; } catch (e) { /* storage blocked */ }
const diff = () => DIFFICULTY[settings.difficulty];
function cycleDifficulty(d = 1) {
  const i = DIFF_LEVELS.indexOf(settings.difficulty);
  settings.difficulty = DIFF_LEVELS[(i + (d > 0 ? 1 : DIFF_LEVELS.length - 1)) % DIFF_LEVELS.length];
  try { localStorage.setItem('difficulty', settings.difficulty); } catch (e) { /* not saved, still works */ }
}
function shake(n) { game.shake = Math.min(14, Math.max(game.shake, n) + n * 0.2); }

let goku, cell, player, boss, projs, beams, sparks, ghosts, popups, trails, zips, minions, bursts, kiMotes, clash, timers, game;
const foeOf = f => f === goku ? cell : goku;
// who a person is playing: the player, and in versus the other fighter too (player 2)
const human = f => f === player || (game.versus && f === boss);
const ctlOf = f => f === player ? P1 : P2;
const NAME = f => f.who === 'goku'
  ? (f.state.startsWith('ult') ? 'GOKU  SSJ3' : f.form === 'ssj' ? 'GOKU  SSJ' : 'GOKU')
  : f.form === 'junior' ? `CELL JR.  x${game.juniors ? game.juniors.left : 1}` : CELL_INFO[f.form].name;

// Goku as the boss gets stronger in each phase instead of changing body
const GOKU_BOSS = [{ speed: 1.05, dmgMul: 1 }, { speed: 1.2, dmgMul: 1.2 }, { speed: 1.35, dmgMul: 1.4 }];

function reset(side = (game && game.side) || 'goku') {
  for (const f of [goku, cell]) if (f) { sfx.stopSustain(f); sfx.stopKame(f); }
  goku = new Fighter('goku', side === 'goku' ? PLAYER_HP : BOSS_HP);
  cell = new Fighter('cell', side === 'cell' ? PLAYER_HP : BOSS_HP);
  player = side === 'goku' ? goku : cell;
  boss = foeOf(player);
  setForm(goku, 'base'); setForm(cell, 'imperfect');
  if (boss === goku) Object.assign(goku, GOKU_BOSS[0]);
  projs = []; beams = []; sparks = []; ghosts = []; popups = []; trails = []; zips = []; minions = []; bursts = []; kiMotes = []; clash = null; timers = [];
  if (game) game.react = null;
  // the game clock restarts with each fight, so forget presses timed on the old clock
  for (const c of [P1, P2]) withController(c, () => { for (const a in lastPress) delete lastPress[a]; dashReq = null; lastTap.dir = 0; });
  Object.assign(cam, { x: W / 2, y: H / 2, z: 1, focus: null });
  Stage.reset(); Object.assign(ai, { think: 0.8, vanishCd: 3, ultCd: 6, spam: 0, barrierCd: 5, assistCd: 6, cannonCd: 6, rolled: 0, chase: null, airBeam: false, punishAt: -9 });
  game = { mode: 'title', comboNames: [], menu: [], training: false, ct: 0, cine: null, combo: { n: 0, t: 0, dmg: 0, moves: [], done: new Set() }, bossCombo: { moves: [], done: new Set(), names: [] }, learned: (game && game.learned) || new Set(), side, pick: side === 'cell' ? 1 : 0, time: 150, juniors: null, freeze: 0, shake: 0, flash: 0, phase: 0, slow: 1, banner: null, dlg: null, skip: false, result: null, t: 0, kameCd: 4 };
}

function setForm(f, form) {
  f.form = form;
  if (f.who === 'cell') Object.assign(f, { speed: CELL_INFO[form].speed, dmgMul: CELL_INFO[form].dmgMul, scale: CELL_INFO[form].scale || 1.25 });
  else Object.assign(f, form === 'ssj' ? { speed: 1.15, dmgMul: 1.35 } : { speed: 1, dmgMul: 1 });
  versusHeal(f, form);
}
// versus: the first time a fighter reaches a stronger form in a round, it heals a little and its guard
// refills (VERSUS_HEAL). Powering down and back up doesn't heal again.
function versusHeal(f, form) {
  if (!game || !game.versus || !VERSUS_HEAL[form] || f.hp <= 0 || ['ko', 'end'].includes(game.mode)) return;
  f.healedForms = f.healedForms || new Set();
  if (f.healedForms.has(form)) return;
  f.healedForms.add(form);
  const add = Math.min(VERSUS_HEAL[form], f.maxHp - f.hp);
  f.hp += add; f.stamina = 100; f.guardBroken = false;
  if (add > 0) popups.push({ text: '+' + Math.round(add) + ' HP', x: f.x, y: f.y - 70, t: 0, c: '#8f8' });
}
