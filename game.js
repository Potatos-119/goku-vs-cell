// Goku vs Cell. Pick a side on the select screen; the other fighter becomes the boss, with
// three phases and an AI. The world is 320x180 and is drawn at 4x.
const W = 320, H = 180, FLOOR = 162, GRAV = 1300, JUMP_V = -400;
const PLAYER_HP = 100, BOSS_HP = 300;
const canvas = document.getElementById('game');
// the world is 320x180; draw it 4x, or 8x on big/retina screens so the arena art and text stay
// sharp instead of being stretched (a multiple of 4 keeps S x zoom whole, so pixel art stays crisp)
const S = screen.width * (window.devicePixelRatio || 1) > 1900 ? 8 : 4;
canvas.width = W * S; canvas.height = H * S;
const ctx = canvas.getContext('2d');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sfx = Audio8.sfx;
const art = a => Sheets.frame(a.sheet, a.ref);

// ---------- input ----------
// Gameplay reads named actions, never raw keys. Keyboard bindings are physical key positions
// (e.code), so WASD stays in place on AZERTY/QWERTZ, and a gamepad maps onto the same actions.
const BINDINGS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'Space', 'ArrowUp'],
  block: ['KeyS', 'ArrowDown'], punch: ['KeyJ'], kick: ['KeyK'], grab: ['KeyF'], ki: ['KeyL'], beam: ['KeyU'],
  ult: ['KeyO'], charge: ['KeyI'], vanish: ['KeyQ'], transform: ['KeyT'], dash: ['ShiftLeft', 'ShiftRight'],
  pause: ['KeyP'], confirm: ['Enter', 'NumpadEnter'], back: ['Escape'], music: ['KeyM'], calm: ['KeyR'],
};
// standard-mapping gamepad buttons (A B X Y = 0 1 2 3, LB RB = 4 5, LT RT = 6 7, Back Start = 8 9,
// stick clicks = 10 11, d-pad = 12-15)
const PAD_BINDINGS = {
  jump: [0, 12], confirm: [0, 9], back: [1, 8], ki: [1], punch: [2], kick: [3], block: [4, 13], dash: [5],
  charge: [6], beam: [7], vanish: [8], pause: [9], transform: [10], ult: [11], left: [14], right: [15],
};
const CODE_ACTIONS = {};
for (const [a, codes] of Object.entries(BINDINGS)) for (const c of codes) (CODE_ACTIONS[c] = CODE_ACTIONS[c] || []).push(a);
// synthetic events (and some old browsers) carry no e.code: fall back to the key's name
const codeOf = e => e.code || { ' ': 'Space', enter: 'Enter', escape: 'Escape', shift: 'ShiftLeft', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' }[e.key.toLowerCase()] || 'Key' + e.key.toUpperCase();

const keys = {}, pressed = new Set(), lastPress = {}, kbHeld = {}, padHeld = {};
// double-tap a direction = dash. Detected as the keys are pressed (not once per frame), so two taps
// during a hit-freeze still count; the request then waits in the input buffer like any other press.
const lastTap = { dir: 0, t: -1 };
let dashReq = null;
function setHeld(src, action, down) {
  if (down && !kbHeld[action] && !padHeld[action]) {
    pressed.add(action); lastPress[action] = game ? game.ct : 0;
    if (game && (action === 'left' || action === 'right')) {
      const d = action === 'right' ? 1 : -1;
      if (lastTap.dir === d && game.ct - lastTap.t < 0.25) { dashReq = { dir: d, t: game.ct }; lastTap.dir = 0; }
      else Object.assign(lastTap, { dir: d, t: game.ct });
    }
  }
  src[action] = down;
  keys[action] = !!(kbHeld[action] || padHeld[action]);
}
addEventListener('keydown', e => {
  const acts = CODE_ACTIONS[codeOf(e)];
  if (!acts) return;
  e.preventDefault();
  if (!e.repeat) acts.forEach(a => setHeld(kbHeld, a, true));
});
addEventListener('keyup', e => (CODE_ACTIONS[codeOf(e)] || []).forEach(a => setHeld(kbHeld, a, false)));
// switching windows swallows keyup events, which would leave a key held forever
addEventListener('blur', () => { for (const a in kbHeld) setHeld(kbHeld, a, false); });
function pollGamepad() {
  const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
  if (!pad) return;
  const btn = i => pad.buttons[i] && pad.buttons[i].pressed;
  const x = pad.axes[0] || 0, y = pad.axes[1] || 0, stick = Math.hypot(x, y) > 0.35; // radial deadzone
  for (const [a, list] of Object.entries(PAD_BINDINGS)) {
    let down = list.some(btn);
    if (a === 'left') down = down || (stick && x < -0.5);
    if (a === 'right') down = down || (stick && x > 0.5);
    if (a === 'block') down = down || (stick && y > 0.6);
    setHeld(padHeld, a, down);
  }
}
const tap = a => pressed.has(a);
// input buffer: a press up to 0.12s before the fighter can act still goes through, once
const BUFFER = 0.12;
// (ages on the control clock, which stops during hit-freeze, so a press made in a freeze isn't lost)
function act(a) {
  const age = game.ct - lastPress[a];
  if (!(age >= 0 && age <= BUFFER)) return false;
  lastPress[a] = -99; return true;
}
// two buttons pressed together (both still in the buffer)
function chord(a, b) {
  const fresh = k => { const age = game.ct - lastPress[k]; return age >= 0 && age <= BUFFER; };
  if (!fresh(a) || !fresh(b)) return false;
  lastPress[a] = lastPress[b] = -99; return true;
}

// ---------- fighters ----------
class Fighter {
  constructor(who, maxHp) {
    Object.assign(this, {
      who, x: 0, y: FLOOR, vx: 0, vy: 0, facing: 1, hp: maxHp, maxHp, ki: 0, form: 'base',
      state: 'idle', anim: 'idle', at: 0, t2: 0, stun: 0, inv: 0, dmgMul: 1, speed: 1,
      visible: true, queue: [], next: null, hitDone: false, emitted: 0, blockT: 0,
      stamina: 100, staminaDelay: 0, guardBroken: false, trailT: 0, counter: false, hover: 0, big: false,
      flash: 0, sq: 0, // hit flash timer; squash (+) / stretch (-) that springs back to 0
      juggle: 0, comboTaken: 0, hitLanded: false, wallBounce: false, spiked: false,
      // Cell's sheet is drawn smaller than Goku's; 1.25 keeps pixels whole at 4x
      scale: who === 'cell' ? 1.25 : 1,
    });
  }
  A(name = this.anim) { return ANIMS[this.who][this.form][name] || ANIMS[this.who].base[name]; }
  play(anim, state = anim) { this.anim = anim; this.state = state; this.at = 0; this.hitDone = false; this.hitLanded = false; this.emitted = 0; }
  get fi() { const a = this.A(), i = Math.floor(this.at * a.fps); return a.loop ? i % a.fr.length : Math.min(i, a.fr.length - 1); }
  get animDone() { const a = this.A(); return !a.loop && this.at * a.fps >= a.fr.length; }
  get img() { return Sheets.frame(this.who, this.A().fr[this.fi]); }
  get free() { return this.state === 'idle' || this.state === 'walk'; }
  box() { return { x0: this.x - 11, x1: this.x + 11, y0: this.y - 46, y1: this.y }; }
  hand(anim) {
    const a = this.A(anim), im = Sheets.frame(this.who, a.fr[[].concat(a.emitAt ?? 0)[0]]);
    return [this.x + this.facing * (im.width - im.ax) * this.scale, this.y - a.emit * this.scale];
  }
  draw() {
    if (!this.visible) return;
    const im = this.img;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - this.hover));
    ctx.scale(this.facing * this.scale * (1 + this.sq), this.scale * (1 - this.sq));
    if (this.inv > 0 && Math.floor(this.inv * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.drawImage(im, -Math.round(im.ax), -im.height);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = settings.calm ? 0.35 : 0.75;
      ctx.drawImage(im, -Math.round(im.ax), -im.height);
    }
    ctx.restore();
  }
}

// accessibility: calm mode cuts screen shake and flashing (remembered between visits)
const settings = { calm: false };
try { settings.calm = localStorage.getItem('calmMode') === '1'; } catch (e) { /* storage blocked */ }
// Screen shake as decaying trauma: hits add to it instead of resetting it, and it eases back to rest.
function toggleCalm() {
  settings.calm = !settings.calm;
  try { localStorage.setItem('calmMode', settings.calm ? '1' : '0'); } catch (e) { /* not saved, still works */ }
}
function shake(n) { game.shake = Math.min(14, Math.max(game.shake, n) + n * 0.2); }

let goku, cell, player, boss, projs, beams, sparks, ghosts, popups, trails, zips, clash, timers, game;
const foeOf = f => f === goku ? cell : goku;
const NAME = f => f.who === 'goku'
  ? (f.state.startsWith('ult') ? 'GOKU  SSJ3' : f.form === 'ssj' ? 'GOKU  SSJ' : 'GOKU')
  : CELL_INFO[f.form].name;

// Goku as the boss gets stronger in each phase instead of changing body
const GOKU_BOSS = [{ speed: 1, dmgMul: 0.9 }, { speed: 1.15, dmgMul: 1.15 }, { speed: 1.3, dmgMul: 1.35 }];

function reset(side = (game && game.side) || 'goku') {
  goku = new Fighter('goku', side === 'goku' ? PLAYER_HP : BOSS_HP);
  cell = new Fighter('cell', side === 'cell' ? PLAYER_HP : BOSS_HP);
  player = side === 'goku' ? goku : cell;
  boss = foeOf(player);
  setForm(goku, 'base'); setForm(cell, 'imperfect');
  if (boss === goku) Object.assign(goku, GOKU_BOSS[0]);
  projs = []; beams = []; sparks = []; ghosts = []; popups = []; trails = []; zips = []; clash = null; timers = [];
  // the game clock restarts with each fight, so forget presses timed on the old clock
  for (const a in lastPress) delete lastPress[a];
  dashReq = null; lastTap.dir = 0;
  Object.assign(cam, { x: W / 2, y: H / 2, z: 1, focus: null });
  Stage.reset(); Object.assign(ai, { think: 0.8, vanishCd: 3, ultCd: 6 });
  game = { mode: 'title', comboNames: [], menu: [], training: false, dummyFight: false, ct: 0, chaseT: 0, cine: null, combo: { n: 0, t: 0, dmg: 0, moves: [], done: new Set() }, learned: (game && game.learned) || new Set(), side, pick: side === 'cell' ? 1 : 0, time: 120, freeze: 0, shake: 0, flash: 0, phase: 0, slow: 1, banner: null, dlg: null, skip: false, result: null, t: 0, kameCd: 4 };
}

function setForm(f, form) {
  f.form = form;
  if (f.who === 'cell') Object.assign(f, { speed: CELL_INFO[form].speed, dmgMul: CELL_INFO[form].dmgMul });
  else Object.assign(f, form === 'ssj' ? { speed: 1.15, dmgMul: 1.35 } : { speed: 1, dmgMul: 1 });
}

// ---------- combat ----------
// kind: 'melee' | 'proj' | 'beam' | 'ult' (ultimates can't be blocked or dodged)
// opts: launch / spike / wallBounce / grab from the attack, token for combo recognition
const JUGGLE_MAX = 5;
// caught starting their own move: a counter hit, which hurts more and stuns for longer
const COUNTER_STATES = ['attack', 'airAtk', 'cast', 'kameCharge', 'windup'];
function damage(def, src, dmg, heavy, dir, kind = 'melee', opts = {}) {
  if ((def.inv > 0 && kind !== 'ult') || ['down', 'tele', 'transform', 'evolve'].includes(def.state) || def.hp <= 0 || game.mode !== 'fight') return false;
  // someone already flying can be juggled a few times, but not by beams (that would never end)
  const juggling = def.state === 'knock';
  // a Dragon Rush only catches someone standing on the ring
  if (opts.grab && (juggling || def.y < FLOOR - 6)) return false;
  // beams don't count toward the limit: they carry a flying enemy instead of re-launching them
  if (juggling && kind !== 'beam' && def.juggle >= JUGGLE_MAX) return false;
  // from phase two on, the boss sometimes vanishes right before a hit lands and counters from behind
  if (def === boss && kind !== 'ult' && kind !== 'beam' && game.phase >= 1 && ai.vanishCd <= 0
      && ['idle', 'walk', 'block', 'pose', 'dash'].includes(def.state) && Math.random() < 0.12 + 0.1 * game.phase) {
    vanish(boss, player); return false;
  }
  let blocking = kind !== 'ult' && !opts.grab && def.state === 'block' && def.facing === -dir;
  const counter = !blocking && !juggling && COUNTER_STATES.includes(def.state) && !(def.state === 'attack' && def.hitDone);
  if (blocking && def === player && kind !== 'beam' && def.blockT < PARRY_WINDOW) return perfectBlock(def, src, kind);
  // every blocked hit wears down the player's guard; when stamina runs out it breaks and the hit lands
  let broke = false;
  if (blocking && def === player && (def.stamina -= dmg * 1.6) <= 0) { guardBreak(def); blocking = false; broke = true; }
  if (blocking) {
    dmg *= 0.15; def.vx = dir * 90; def.ki = Math.min(100, def.ki + 3);
    if (def.A('blockHit')) { def.anim = 'blockHit'; def.at = 0; }
    sparks.push({ x: def.x - dir * 8, y: def.y - 28, t: 0, c: '#9fe7ff' });
    sfx.kick(); game.freeze = 0.04;
  } else {
    def.ki = Math.min(100, def.ki + 4); src.ki = Math.min(100, src.ki + 6);
    def.flash = 0.08;
    if (src === player) {
      game.combo.n++; game.combo.t = 0;
      if (counter) comboToken('counter');
      comboToken(opts.token || (kind === 'melee' ? src.anim : kind));
    }
    else Object.assign(game.combo, { n: 0, dmg: 0, moves: [], done: new Set() });
    // long combos hit softer and stun for less, so there are no infinites
    // (beams keep more of their damage: they're the combo's finisher)
    dmg *= Math.max(kind === 'beam' ? 0.75 : 0.45, 1 - 0.07 * def.comboTaken);
    def.comboTaken++;
    sparks.push({ x: def.x - dir * 6, y: def.y - 30, t: 0, c: '#fff6b8' });
    game.freeze = heavy ? 0.12 : 0.06; shake(heavy ? 6 : 3);
    if (counter) {
      dmg *= 1.25; game.freeze += 0.05;
      popups.push({ text: 'COUNTER!', x: def.x, y: def.y - 58, t: 0, c: '#ff8a3a' });
    }
    if (opts.grab) {
      popups.push({ text: 'DRAGON RUSH!', x: def.x, y: def.y - 58, t: 0, c: '#9ff' });
      game.freeze = 0.16; shake(7); sfx.explode();
    }
  }
  const hpBefore = def.hp;
  def.hp = Math.max(game.training ? 1 : 0, def.hp - dmg);
  if (src === player && !blocking) game.combo.dmg += hpBefore - def.hp;
  // a fighter mid-Kamehameha takes the damage but keeps firing, unless it finishes them
  const armored = def.state === 'kameFire' && def.hp > 0;
  if (!blocking && !armored) {
    def.queue = []; def.next = null;
    if (juggling || heavy || opts.launch || opts.spike || def.hp <= 0) {
      def.juggle = juggling ? def.juggle + (kind === 'beam' ? 0 : 1) : 0;
      def.play('knock'); def.y -= 1; sfx.kick();
      if (opts.spike) { def.vy = 420; def.vx = dir * 40; def.spiked = true; }
      else if (opts.launch) { def.vy = -390; def.vx = dir * 45; if (src === player) { comboToken('launch'); game.chaseT = 0.55; } }
      // a beam holds a flying enemy up and drives them back; its last tick blasts them away
      else if (juggling && kind === 'beam' && !heavy) { def.vy = -125; def.vx = dir * 60; }
      else if (kind === 'beam') { def.vy = -300; def.vx = dir * 210; }
      // air hits pop them up gently and lift the attacker the same, so the air string stays together
      else if (juggling && src.state === 'airAtk') { def.vy = -170; def.vx = dir * 25; }
      else if (juggling) { def.vy = -210; def.vx = dir * 70; }
      else { def.vy = -280; def.vx = dir * 160; Stage.shock(def.x, 0.8); }
      def.wallBounce = !!opts.wallBounce;
      // an air hit keeps the attacker up a moment so the string can continue
      if (src.state === 'airAtk') { src.vy = -170; src.vx = dir * 20; }
    }
    else { def.play('hurt'); def.stun = 0.3 * Math.max(0.55, 1 - 0.06 * def.comboTaken) * (counter ? 1.6 : 1); def.vx = dir * 70; sfx.punch(); }
    if (def === player && Math.random() < 0.3) sfx.hurt();
    if (broke && def.state === 'hurt') def.stun = 0.9;
  }
  return true;
}

function guardBreak(f) {
  Object.assign(f, { stamina: 0, guardBroken: true, staminaDelay: 0.8 });
  popups.push({ text: 'GUARD BREAK!', x: f.x, y: f.y - 54, t: 0, c: '#ff7a5a' });
  sfx.hurt();
  if (f.state === 'block') { f.play('hurt'); f.stun = 0.9; }
}

// Block just as a hit lands: no damage, a big ki refund, and a punch or kick leaves the attacker reeling.
const PARRY_WINDOW = 0.18;
const WINDUP = 0.28; // pause between a vanish and its counterattack
function perfectBlock(def, src, kind) {
  def.ki = Math.min(100, def.ki + 25); def.stamina = Math.min(100, def.stamina + 15); def.inv = 0.25;
  popups.push({ text: 'PERFECT!  +KI', x: def.x, y: def.y - 54, t: 0, c: '#8ff' });
  sparks.push({ x: def.x + def.facing * 10, y: def.y - 30, t: 0, c: '#ffffff' });
  game.freeze = 0.15; game.flash = 0.35; sfx.parry();
  if (kind === 'melee') {
    src.queue = []; src.next = null;
    src.play(src.A('dizzy') ? 'dizzy' : 'hurt', 'hurt'); src.stun = 1.1; src.vx = -src.facing * 60;
  }
  return true;
}

function meleeCheck(f, foe) {
  const h = f.A().hit;
  if (!h || f.hitDone || f.fi < h.at) return;
  f.hitDone = true;
  const x0 = f.facing > 0 ? f.x : f.x - h.reach, x1 = f.facing > 0 ? f.x + h.reach : f.x;
  const b = foe.box();
  if (x1 < b.x0 || x0 > b.x1 || f.y - 8 < b.y0 || f.y - 44 > b.y1) { sfx.whoosh(); return; }
  f.hitLanded = damage(foe, f, h.dmg * f.dmgMul, h.heavy, f.facing, 'melee', h);
}

// Dash: double-tap a direction (or Shift). On the ground it's the sheet's dash run forward or a quick
// hop back; in the air a straight burst with gravity held off, once per jump. Leaves speed lines.
function dash(f, dir) {
  const air = f.y < FLOOR - 2, fwd = dir === f.facing;
  if (air && f.airDashed) return;
  if (f === player) dashReq = null;
  f.play(air ? (fwd ? 'airDash' : 'airBack') : (fwd ? 'dash' : 'backdash'), 'dash');
  f.t2 = air ? 0.22 : fwd ? 0.25 : 0.2;
  f.vx = dir * (fwd ? 330 : 250) * f.speed;
  f.vy = air ? 0 : fwd ? 0 : -140;
  // in an air combo the dash homes in on the flying enemy's height
  const foe = foeOf(f);
  f.homing = air && fwd && foe.state === 'knock';
  if (f.homing) f.vy = clamp((foe.y - f.y) * 8, -240, 240);
  f.dashAir = air; if (air) f.airDashed = true;
  zips.push({ im: art(f.who === 'goku' ? FX_ART.gokuZip : FX_ART.cellZip), x: f.x, y: f.y - 24 * f.scale, dir, scale: f.scale, t: 0 });
  if (!air) Stage.puff(f.x, dir);
  sfx.whoosh();
}

function startAttack(f, name) {
  f.play(name, 'attack'); f.vx = f.facing * 50;
  if (name === 'rush') f.vx = f.facing * 240;
  if (name === 'grab') f.vx = f.facing * 200;
}

function cast(f, name) {
  f.play(name, 'cast'); f.vx = 0;
}

function spawnProjectile(f) {
  const kind = { kiCast: 'kiBall', finger: 'finger', death: 'death', barrage: 'finger' }[f.anim];
  const [hx, hy] = f.hand(f.anim);
  const stats = { kiBall: [300, 6, false], finger: [330, 8, false], death: [560, 12, true] }[kind];
  projs.push({ owner: f, kind, x: hx, y: hy, dir: f.facing, vx: stats[0] * f.facing, dmg: stats[1] * f.dmgMul, heavy: stats[2] });
  sfx.blast();
}

// the streaks a fighter leaves when vanishing (Goku's orange, Cell's green)
const teleArt = f => art(f.who === 'goku' ? FX_ART.gokuTeleport : FX_ART.teleport);

function teleport(f, foe) {
  if (f === player && game.combo.n > 0) comboToken('vanish');
  f.play(f.A('teleOut') ? 'teleOut' : 'idle', 'tele'); f.t2 = 0.28; f.vx = 0;
  sfx.teleport();
  f.teleTo = clamp(foe.x - foe.facing * 34, 20, W - 20);
  // in the air (either of them): reappear behind them up in the air
  f.teleY = foe.y < FLOOR - 10 ? foe.y : f.y < FLOOR - 4 ? FLOOR - 36 : FLOOR;
  f.vx = f.vy = 0;
}

// quick: answering a Kamehameha, charging fast enough to meet it in a beam clash.
// big: Cell's Solar Kamehameha, a huge beam that can't be blocked.
// combo: cancelled out of a landed hit, so it charges fast and the enemy is kept up in the air.
function startKame(f, quick = false, big = false, combo = false) {
  Voice.shout(f.who, big ? 'Solar Kamehameha!' : 'Kamehameha!');
  f.big = big;
  f.play('kameCharge', 'kameCharge');
  f.t2 = combo ? 0.25 : quick ? Math.max(0.12, foeOf(f).t2 + 0.03) : big ? 1.6 : f.who === 'goku' ? 0.9 : 1.3;
  const foe = foeOf(f);
  if (combo && foe.state === 'knock') foe.vy = Math.min(foe.vy, -160);
  f.vx = 0; if (big) f.inv = f.t2;
  // fired from the air: hang there until the beam is done
  if (f.y < FLOOR - 4) { f.floating = true; f.vy = 0; }
  sfx.charge(f.t2);
}

function fireKame(f) {
  f.play('kameFire', 'kameFire'); f.t2 = f.big ? 2 : f.who === 'goku' ? 1.5 : 1.7;
  const [hx, hy] = f.hand('kameFire'), foe = foeOf(f);
  // from the air the beam angles at the enemy (up to ~30 degrees up or ~40 down)
  const ang = f.floating ? clamp(Math.atan2(foe.y - 22 - hy, Math.max(20, Math.abs(foe.x - hx))), -0.5, 0.7) : 0;
  beams.push({ owner: f, x0: hx, y: hy, ang, dir: f.facing, len: 0, t: 0, tick: 0, big: f.big, dps: f.big ? 34 : f.who === 'goku' ? 22 : 18 });
  sfx.beam(f.t2); shake(f.big ? 9 : 4);
}

// Dragon Fist: power up to Super Saiyan 3, rush in, dragon
function startUlt(f) {
  f.ki = 0; f.play('ult1'); f.t2 = 1.0; f.inv = 3; f.vx = 0;
  sfx.powerup(); shake(6); game.flash = 0.6;
  popups.push({ text: 'SUPER SAIYAN 3!', x: f.x, y: f.y - 70, t: 0, c: '#ffe04a' });
}

// ---------- per-fighter update ----------
function updateFighter(f, foe, dt) {
  f.at += dt;
  if (f.inv > 0) f.inv -= dt;
  if (f.flash > 0) f.flash -= dt;
  if (f.free || f.state === 'block' || f.state === 'down') f.comboTaken = 0;
  f.sq -= f.sq * Math.min(1, dt * 12);
  if (f.state === 'block') f.blockT += dt;
  // afterimages on fast moves, rocks lifting off the ring while powering up
  if ((['dash', 'ult2'].includes(f.state) || f.anim === 'rush') && f.visible && (f.trailT -= dt) <= 0) {
    f.trailT = 0.035; trails.push({ im: f.img, x: f.x, y: f.y - f.hover, facing: f.facing, scale: f.scale, t: 0 });
  }
  if (['power', 'charge', 'transform', 'evolve', 'ult1', 'kameCharge'].includes(f.state) && Math.random() < dt * 14) Stage.lift(f.x);
  // moving is a short hover a few pixels off the ring rather than sliding on it
  const lift = f.state === 'walk' ? 3 + Math.sin(f.at * 5) : f.state === 'dash' ? 4 : 0;
  f.hover += (lift - f.hover) * Math.min(1, dt * 10);
  if (f === player) {
    // holding block drains stamina; it refills shortly after letting go
    if (f.state === 'block') { f.stamina -= 6 * dt; f.staminaDelay = 0.6; if (f.stamina <= 0) guardBreak(f); }
    else if ((f.staminaDelay -= dt) <= 0) f.stamina = Math.min(100, f.stamina + 28 * dt);
    if (f.guardBroken && f.stamina >= 35) f.guardBroken = false;
  }
  const airborne = f.y < FLOOR || f.vy < 0;
  if (f.state === 'dash' && f.dashAir) f.y = Math.min(FLOOR - 2, f.y + f.vy * dt); // air dash: no gravity
  else if (airborne && f.state !== 'tele' && !f.floating) {
    // someone being juggled falls a little slower, so air combos have room to continue
    // (and so does the attacker mid air-string, so the two stay level)
    f.vy += GRAV * ((f.state === 'knock' && f.juggle > 0) || f.state === 'airAtk' ? 0.7 : 1) * dt; f.y += f.vy * dt;
    if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; landed(f); }
  }
  if (f.y >= FLOOR) f.airDashed = false;
  f.x = clamp(f.x + f.vx * dt, 16, W - 16);
  if (!airborne && !['walk', 'dash'].includes(f.state)) f.vx -= f.vx * Math.min(1, dt * 8);

  switch (f.state) {
    case 'attack':
      meleeCheck(f, foe);
      if (f.animDone) {
        const n = f.next || f.queue.shift(); f.next = null;
        if (n) { f.facing = foe.x > f.x ? 1 : -1; startAttack(f, n); } else f.play('idle');
      }
      break;
    case 'airAtk':
      meleeCheck(f, foe);
      if (f.animDone && f.next) { f.facing = foe.x > f.x ? 1 : -1; f.play(f.next, 'airAtk'); f.next = null; }
      break;
    case 'cast':
      { const shots = [].concat(f.A().emitAt);
        while (f.emitted < shots.length && f.fi >= shots[f.emitted]) { f.emitted++; spawnProjectile(f); } }
      if (f.animDone) f.play('idle');
      break;
    case 'hurt':
      if ((f.stun -= dt) <= 0) { if (f.y < FLOOR) f.play('fall', 'jump'); else f.play('idle'); }
      break;
    case 'knock':
      if (f.wallBounce && (f.x <= 17 || f.x >= W - 17)) {
        f.wallBounce = false; f.vx = -f.vx * 0.5; f.vy = -230; f.juggle = Math.max(0, f.juggle - 1);
        sparks.push({ x: f.x, y: f.y - 30, t: 0, c: '#ffffff' }); shake(6); sfx.kick();
        popups.push({ text: 'WALL BOUNCE!', x: f.x, y: f.y - 60, t: 0, c: '#ffd23a' });
        if (f === boss) comboToken('wall');
      }
      keepOnScreen(f);
      break;
    case 'down':
      keepOnScreen(f);
      if ((f.t2 -= dt) <= 0 && f.hp > 0) { if (f.A('getup')) f.play('getup', 'appear'); else f.play('idle'); f.inv = 0.7; }
      break;
    case 'jump': if (f.vy > 0 && f.anim !== 'fall') f.play('fall', 'jump'); break;
    case 'land': if (f.animDone) f.play('idle'); break;
    case 'dash':
      // a homing air dash stops once it reaches them, instead of flying past
      if (f.homing) {
        f.vy = clamp((foe.y - f.y) * 8, -240, 240);
        if (Math.abs(foe.x - f.x) < 24 && Math.abs(foe.y - f.y) < 12) { f.t2 = 0; f.vx = 0; f.facing = foe.x > f.x ? 1 : -1; }
      }
      if ((f.t2 -= dt) <= 0) {
        if (f.y < FLOOR - 1) { f.vx *= 0.4; f.play('fall', 'jump'); } else { f.vx = 0; f.play('idle'); }
      }
      break;
    case 'block':
      if (f.anim === 'blockHit' && f.at > 0.18) { f.anim = 'block'; f.at = 0; }
      if (f !== player && (f.t2 -= dt) <= 0) f.play('idle');
      break;
    case 'tele':
      if ((f.t2 -= dt) <= 0 && !f.visible) {
        f.x = f.teleTo; f.y = f.teleY; f.visible = true; f.facing = foe.x > f.x ? 1 : -1;
        ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 });
        if (f.counter) {
          // a vanish counter flashes '!' and winds up briefly, so a quick block (or perfect block) can stop it
          f.counter = false; f.play('idle', 'windup'); f.t2 = WINDUP; f.vy = f.y < FLOOR ? -60 : 0;
          popups.push({ text: '!', x: f.x, y: f.y - 60, t: 0, c: '#ff5a3a' }); sfx.blip();
        } else if (f.y < FLOOR) { f.vy = -60; f.inv = 0.15; f.play('fall', 'jump'); }
        else if (f.A('teleIn')) f.play('teleIn', 'appear');
        else { f.play('idle'); f.inv = 0.15; }
      } else if (f.t2 <= 0.15 && f.visible) {
        // flicker out (the first frames of teleOut), then leave only the streaks behind
        f.visible = false; ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 });
      }
      break;
    case 'appear': if (f.animDone) f.play('idle'); break;
    case 'windup':
      if ((f.t2 -= dt) <= 0) {
        f.facing = foe.x > f.x ? 1 : -1;
        if (f.y < FLOOR - 4) f.play('air', 'airAtk');
        else { f.queue = [f.who === 'cell' ? 'k2' : 'k3']; startAttack(f, 'p2'); }
      }
      break;
    case 'kameCharge': if ((f.t2 -= dt) <= 0) fireKame(f); break;
    case 'kameFire':
      if ((f.t2 -= dt) <= 0 && !clash) {
        beams = beams.filter(b => b.owner !== f); f.big = false;
        if (f.floating) { f.floating = false; f.play('fall', 'jump'); } else f.play('idle');
      }
      break;
    case 'transform': if (f.animDone) finishTransform(f); break;
    case 'evolve':
      if ((f.t2 -= dt) <= 0) {
        setForm(f, CELL_FORMS[CELL_FORMS.indexOf(f.form) + 1]); f.play('idle');
        game.flash = 1; shake(8); sfx.explode();
        popups.push({ text: CELL_INFO[f.form].name + '!', x: f.x, y: f.y - 70, t: 0, c: '#a8e27c' });
      }
      break;
    case 'pose': if ((f.t2 -= dt) <= 0) f.play('idle'); break;
    case 'ult1': if ((f.t2 -= dt) <= 0) { f.play('ult2'); f.t2 = 0.7; sfx.whoosh(); Voice.shout('goku', 'Dragon Fist!'); } break;
    case 'ult2':
      f.facing = foe.x > f.x ? 1 : -1; f.vx = f.facing * 420;
      if (Math.abs(foe.x - f.x) < 34 || (f.t2 -= dt) <= 0) {
        f.vx = 0; f.play('ult3'); f.t2 = 1.1;
        game.flash = 1; shake(10); sfx.explode();
        damage(foe, f, 50, true, f.facing, 'ult'); Stage.crack(foe.x, 2);
      }
      break;
    case 'ult3': if ((f.t2 -= dt) <= 0) { f.play('idle'); f.inv = 0.3; } break;
  }
}

// A lying sprite is much wider than a standing one, so push it in from the screen edge.
function keepOnScreen(f) {
  const im = f.img, s = f.scale;
  const back = (f.facing > 0 ? im.ax : im.width - im.ax) * s, front = (f.facing > 0 ? im.width - im.ax : im.ax) * s;
  f.x = clamp(f.x, Math.min(back, W / 2), Math.max(W - front, W / 2));
}

function finishTransform(f) {
  setForm(f, 'ssj'); f.play('idle');
  Audio8.music.switchTo('ssj');
  game.flash = 1; shake(8); sfx.explode();
}

// Put a fighter back on the floor, visible and standing, when a cutscene or the KO takes over
// (otherwise they can be left mid-air, invisible mid-teleport or half-way through a move).
function settle(f) {
  if (f.state === 'transform') finishTransform(f);
  if (f.state === 'evolve') { f.t2 = 0; updateFighter(f, foeOf(f), 0); }
  if (f === player && f.state === 'kameCharge') f.ki = Math.min(100, f.ki + 50);
  Object.assign(f, { visible: true, x: f.state === 'tele' ? f.teleTo : f.x, y: FLOOR, vx: 0, vy: 0, queue: [], next: null, big: false, floating: false });
  if (f.hp > 0) f.play('idle');
}

function landed(f) {
  f.sq = f.state === 'knock' ? 0.25 : 0.16;
  if (f.state === 'knock' && f.spiked) {
    // a spike slams them into the ring and bounces them back up for one more hit
    f.spiked = false; f.y = FLOOR - 1; f.vy = -230; f.vx *= 0.5; f.juggle = Math.max(0, f.juggle - 1);
    Stage.crack(f.x, 1.6); shake(8); sfx.explode();
    return;
  }
  if (f.state === 'knock') { f.juggle = 0; Stage.crack(f.x, 1); f.play('down'); f.t2 = f.hp > 0 ? 0.7 : 99; f.vx = 0; shake(4); sfx.kick(); }
  else if (['jump', 'airAtk'].includes(f.state)) { f.play('land'); f.vx = 0; }
}

// ---------- player ----------
// what J / K chain into after each attack
const CHAINS = {
  goku: { j: { p1: 'p2', p2: 'p3', p3: 'p4', k1: 'p2', k2: 'p3', rush: 'p2' }, k: { p1: 'k1', p2: 'k2', p3: 'k3', k1: 'k2', k2: 'k3', rush: 'k2' } },
  cell: { j: { p1: 'p2', k1: 'p2', rush: 'p2' }, k: { p1: 'k1', p2: 'k2', k1: 'k2', rush: 'k2' } },
};

const AIR_CHAIN = { air: 'air2', air2: 'spike' };

// Cancels after a landed hit. Returns true when one happened.
function cancel(g, foe, dashDir) {
  const isGoku = g.who === 'goku';
  if (g.A().hit && g.A().hit.launch && act('jump')) {
    // chase them into the air
    g.play('jump'); g.sq = -0.14; g.vy = JUMP_V - 70; g.vx = g.facing * 90; sfx.whoosh(); return true;
  }
  if (dashDir) { dash(g, dashDir); return true; }
  if (!isGoku && g.form === 'perfect' && g.ki >= 100 && act('ult')) { solarKame(g); return true; }
  if (g.ki >= 15 && act('vanish')) { g.ki -= 15; teleport(g, foe); return true; }
  if (act('ki')) {
    if (isGoku && g.ki >= 8) { g.ki -= 8; cast(g, 'kiCast'); return true; }
    if (!isGoku && g.ki >= 8) { g.ki -= 8; cast(g, 'finger'); return true; }
  }
  if (act('beam')) {
    if (isGoku && g.form === 'ssj' && g.ki >= 50) { g.ki -= 50; startKame(g, false, false, true); return true; }
    if (!isGoku && g.form === 'perfect' && g.ki >= 50) { g.ki -= 50; startKame(g, false, false, true); return true; }
    if (!isGoku && g.form === 'semi' && g.ki >= 20) { g.ki -= 20; cast(g, 'death'); return true; }
  }
  return false;
}

// Combo recognition: every landed hit adds a token; a named combo fires when its steps appear in
// order within the current combo (the last step must be the hit that just landed).
function comboToken(tok) {
  const c = game.combo;
  c.moves.push(tok);
  for (const combo of COMBOS[player.who]) {
    if (c.done.has(combo.name)) continue;
    const match = (step, t) => step === t || (step === 'melee' && MELEE.includes(t));
    if (!match(combo.steps[combo.steps.length - 1], tok)) continue;
    let i = combo.steps.length - 2;
    for (let k = c.moves.length - 2; k >= 0 && i >= 0; k--) if (match(combo.steps[i], c.moves[k])) i--;
    if (i >= 0) continue;
    c.done.add(combo.name);
    game.learned.add(combo.name);
    player.ki = Math.min(100, player.ki + 8);
    game.comboNames.push({ text: combo.name + '!', t: 0 });
    sfx.parry();
  }
}

function playerInput(dt) {
  const g = player, foe = boss, isGoku = g.who === 'goku';
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let dashDir = dashReq && game.ct - dashReq.t <= BUFFER ? dashReq.dir : 0;
  if (act('dash')) dashDir = dir || g.facing;
  if (g.free) {
    g.facing = foe.x > g.x ? 1 : -1;
    const toward = dir === g.facing;
    if (keys.block && !g.guardBroken) { g.play('block'); g.blockT = 0; g.vx = 0; return; }
    if (keys.charge) { g.play('charge'); g.vx = 0; sfx.charge(0.5); return; }
    if (act('jump')) {
      g.play('jump'); g.sq = -0.14; sfx.whoosh();
      // just after a launcher, the jump chases them up
      if (game.chaseT > 0 && foe.state === 'knock') { g.vy = JUMP_V - 70; g.vx = g.facing * 90; game.chaseT = 0; }
      else { g.vy = JUMP_V; g.vx = dir * 120; }
      return;
    }
    if (dashDir) return dash(g, dashDir);
    // holding toward the enemy turns J into a rushing punch and K into a heavy slash
    if (act('grab') || chord('punch', 'kick')) return startAttack(g, 'grab');
    if (act('punch')) return startAttack(g, toward ? 'rush' : 'p1');
    if (act('kick')) return startAttack(g, toward ? 'slash' : 'k1');
    if (act('ki')) {
      if (isGoku && g.ki >= 8) { g.ki -= 8; return cast(g, 'kiCast'); }
      if (!isGoku && toward && g.form !== 'imperfect' && g.ki >= 15) { g.ki -= 15; return cast(g, 'barrage'); }
      if (!isGoku && g.ki >= 8) { g.ki -= 8; return cast(g, 'finger'); }
    }
    if (g.ki >= 15 && act('vanish')) { g.ki -= 15; return teleport(g, foe); }
    if (g.ki >= 100 && act('transform')) {
      if (isGoku && g.form === 'base') {
        g.ki = 50; superSaiyan(g); return;
      }
      if (!isGoku && g.form !== 'perfect') {
        Voice.shout('cell', g.form === 'imperfect' ? 'Evolve!' : 'Perfection!');
        g.ki = 50; g.play('charge', 'evolve'); g.t2 = 1.2; g.inv = 1.4; g.vx = 0; sfx.powerup(); shake(5); return;
      }
    }
    if (act('beam')) {
      if (isGoku && g.form === 'ssj' && g.ki >= 50) { g.ki -= 50; return startKame(g); }
      if (!isGoku && g.form === 'perfect' && g.ki >= 50) { g.ki -= 50; return startKame(g); }
      if (!isGoku && g.form === 'semi' && g.ki >= 20) { g.ki -= 20; return cast(g, 'death'); }
    }
    if (g.ki >= 100 && act('ult')) {
      if (isGoku && g.form === 'ssj') return startUlt(g);
      if (!isGoku && g.form === 'perfect') return solarKame(g);
    }
    if (dir) {
      const anim = toward ? 'walk' : 'back';
      if (g.anim !== anim) { g.play(anim, 'walk'); Stage.puff(g.x, dir); }
      g.vx += clamp(dir * (toward ? 115 : 85) * g.speed - g.vx, -900 * dt, 900 * dt);
    } else if (g.state !== 'idle') g.play('idle');
  } else if (g.state === 'jump') {
    g.vx += clamp(dir * 130 - g.vx, -600 * dt, 600 * dt);
    if (dashDir && !g.airDashed) return dash(g, dashDir);
    if (g.ki >= 15 && act('vanish')) { g.ki -= 15; return teleport(g, foe); }
    const airBeam = isGoku ? g.form === 'ssj' : g.form === 'perfect';
    if (airBeam && isGoku && g.ki >= 100 && act('beam')) return instantKame(g);
    if (airBeam && !isGoku && g.ki >= 100 && act('ult')) return solarKame(g);
    if (airBeam && g.ki >= 50 && act('beam')) { g.ki -= 50; return startKame(g); }
    if (act('punch') || act('kick')) g.play('air', 'airAtk');
  } else if (g.state === 'airAtk') {
    // after an air hit lands: vanish, air-dash to restart the string, or finish with a beam / ki blast
    if (g.hitLanded) {
      if (g.ki >= 15 && act('vanish')) { g.ki -= 15; return teleport(g, foe); }
      if (dashDir && !g.airDashed) return dash(g, dashDir);
      // full ki ends the air combo with the cinematic finisher
      if (isGoku && g.form === 'ssj' && g.ki >= 100 && act('beam')) return instantKame(g);
      if (!isGoku && g.form === 'perfect' && g.ki >= 100 && act('ult')) return solarKame(g);
      if (act('beam')) {
        if (g.ki >= 50 && (isGoku ? g.form === 'ssj' : g.form === 'perfect')) { g.ki -= 50; return startKame(g, false, false, true); }
        if (!isGoku && g.form === 'semi' && g.ki >= 20) { g.ki -= 20; return cast(g, 'death'); }
      }
      if (g.ki >= 8 && act('ki')) { g.ki -= 8; return cast(g, isGoku ? 'kiCast' : 'finger'); }
    }
    if (AIR_CHAIN[g.anim] && (act('punch') || act('kick'))) g.next = AIR_CHAIN[g.anim];
  } else if (g.state === 'attack' && !g.hitDone && g.at < 0.07 && ['p1', 'rush', 'k1', 'slash'].includes(g.anim)
      && act(['p1', 'rush'].includes(g.anim) ? 'kick' : 'punch')) {
    // the second button of J+K came a moment late: still a Dragon Rush
    startAttack(g, 'grab');
  } else if (g.state === 'attack' && g.hitLanded && cancel(g, foe, dashDir)) {
    // a landed hit can be cancelled into a special, a dash or (after a launcher) a chasing jump
  } else if (g.state === 'attack') {
    const chain = CHAINS[g.who];
    if (chain.j[g.anim] && act('punch')) g.next = chain.j[g.anim];
    if (chain.k[g.anim] && act('kick')) g.next = chain.k[g.anim];
  } else if (g.state === 'block') {
    // the guard turns to face the enemy, even when they reappear behind you
    if (!keys.block) g.play('idle'); else if (foe.visible) g.facing = foe.x > g.x ? 1 : -1;
  }
  else if (g.state === 'charge') {
    if (!keys.charge) g.play('idle');
    else { g.ki = Math.min(100, g.ki + 32 * dt); if (Math.random() < dt * 2) sfx.charge(0.5); }
  }
}

// ---------- boss AI ----------
// The boss reads what the player does: it punishes charging, whiffs and broken guards, deals
// with a Kamehameha, anti-airs jump-ins and, from phase two on, vanishes out of trouble.
const ai = { think: 0.8, vanishCd: 3, ultCd: 6 };
const AI_REACT = [0.42, 0.3, 0.2]; // seconds between decisions in each phase

// blink out (leaving an afterimage), reappear behind the player and attack straight away
function vanish(c, foe) {
  ai.vanishCd = 2.4 - game.phase * 0.5;
  trails.push({ im: c.img, x: c.x, y: c.y, facing: c.facing, scale: c.scale, t: 0 });
  teleport(c, foe); c.t2 = 0.18; c.counter = true;
}

function bossAI(dt) {
  const c = boss, g = player, ph = game.phase, isCell = c.who === 'cell';
  game.kameCd -= dt; ai.vanishCd -= dt; ai.ultCd -= dt;
  for (const p of projs) if (p.owner === g && !p.seen && Math.abs(p.x - c.x) < 70) {
    p.seen = true;
    if (c.free && ph >= 1 && ai.vanishCd <= 0 && Math.random() < 0.25 + ph * 0.15) return vanish(c, g);
  }
  if (!c.free) return;
  c.facing = g.x > c.x ? 1 : -1;
  if (c.state === 'walk') c.vx = (c.anim === 'back' ? -1 : 1) * c.facing * 75 * c.speed;
  if ((ai.think -= dt) > 0) return;
  ai.think = rand(0.8, 1.2) * AI_REACT[ph] / c.speed;
  const dist = Math.abs(g.x - c.x), close = dist < 48, r = Math.random();
  const dashIn = () => { c.play('dash'); c.t2 = 0.24; c.vx = c.facing * 280 * c.speed; Stage.puff(c.x, c.facing); };
  const combo = () => {
    const list = isCell
      ? [['p2', 'k2'], ['p1', 'p2', 'k2'], ['k1', 'k2'], ['p1', 'k1'], ['p1', 'p2', 'k1', 'k2']]
      : [['p1', 'p2', 'p3', 'p4'], ['p1', 'k1', 'k2', 'k3'], ['k1', 'k2', 'p3'], ['p1', 'p2', 'k3'], ['rush', 'p2', 'p3']];
    c.queue = pick(list).slice(0, ph + 2);
    startAttack(c, c.queue.shift()); ai.think = rand(0.5, 0.9) / c.speed;
  };
  const shoot = () => cast(c, isCell ? 'finger' : 'kiCast');
  const bigShot = () => isCell ? cast(c, ph >= 1 && r < 0.5 ? 'death' : 'barrage') : shoot();
  const canBeam = isCell ? ph >= 2 : c.form === 'ssj';
  const canVanish = ph >= 1 && ai.vanishCd <= 0;

  // Goku's finishers once he's all out: Instant Kamehameha on a weakened enemy, or the Dragon Fist
  if (!isCell && ph >= 2 && ai.ultCd <= 0 && g.hp < g.maxHp * 0.35 && r < 0.35) { ai.ultCd = rand(16, 20); return instantKame(c); }
  if (!isCell && ph >= 2 && ai.ultCd <= 0 && dist < 170 && r < 0.3) { ai.ultCd = rand(12, 16); return startUlt(c); }
  // Perfect Cell's finisher: the Solar Kamehameha from the sky
  if (isCell && c.form === 'perfect' && ai.ultCd <= 0 && g.hp < g.maxHp * 0.35 && r < 0.35) { ai.ultCd = rand(16, 20); return solarKame(c); }
  // the player is charging ki: never let that happen for free
  if (g.state === 'charge') {
    if (close) return combo();
    if (canVanish && r < 0.5) return vanish(c, g);
    return r < 0.8 ? dashIn() : shoot();
  }
  // Kamehameha coming: only rush in if a hit can land before it fires
  if (g.state === 'kameCharge') {
    if (close) return combo();
    if (canVanish && !g.big) return vanish(c, g);
    if (canBeam && game.kameCd <= 0) { game.kameCd = rand(7, 11); return startKame(c, true); }
    if (dist / 280 < g.t2 - 0.15) return dashIn();
    c.play('block'); c.t2 = g.t2 + 1.9; c.vx = 0; return;
  }
  // a beam only hits in front, so get behind it or answer with one
  if (g.state === 'kameFire') {
    if (canBeam && game.kameCd <= 0) { game.kameCd = rand(7, 11); return startKame(c); }
    if (canVanish) return vanish(c, g);
    c.play('block'); c.t2 = 0.6; return;
  }
  // jumping in: kick them out of the air, or shoot them on the way down
  if (g.y < FLOOR - 20 && g.vy > 0 && dist < 70) return close ? startAttack(c, isCell ? 'k2' : 'k3') : shoot();
  // openings: whiffed attack, landing, ki blast recovery, broken guard
  const open = g.guardBroken || ['land', 'cast', 'transform', 'evolve'].includes(g.state) || (g.state === 'attack' && g.hitDone && dist > 40);
  if (open) return close ? combo() : dist < 150 ? dashIn() : shoot();
  if (close) {
    // a turtling player gets grabbed through the guard
    if (g.state === 'block' && r < 0.25 + ph * 0.1) return startAttack(c, 'grab');
    if (g.state === 'attack' && r < 0.25 + ph * 0.12) { c.play('block'); c.t2 = 0.45; c.vx = 0; return; }
    // turtling: keep hitting if their stamina is low, otherwise step out and bait
    if (g.state === 'block' && g.stamina > 40 && r < 0.45) { if (r < 0.25) dash(c, -c.facing); else c.play('back', 'walk'); ai.think = 0.45; return; }
    return combo();
  }
  if (dist < 140) {
    if (r < 0.45) return dashIn();
    if (r < 0.62) return shoot();
    if (ph >= 1 && r < 0.75) return bigShot();
    if (r < 0.78) return dash(c, -c.facing);
    if (r < 0.88) return c.play('back', 'walk');
    return c.play('walk');
  }
  if (canBeam && game.kameCd <= 0 && r < 0.4) { game.kameCd = rand(7, 11); return startKame(c); }
  if (r < 0.28) return shoot();
  if (ph >= 1 && r < 0.45) return bigShot();
  if (canVanish && r < 0.58) return vanish(c, g);
  if (isCell && ph < 2 && r < 0.68) { c.play('taunt', 'pose'); c.t2 = 0.8; return; }
  c.play('walk');
}

// ---------- projectiles & beams ----------
function updateProjectiles(dt) {
  for (const p of projs) {
    p.x += p.vx * dt;
    const foe = foeOf(p.owner), len = art(FX_ART[p.kind]).width * p.owner.scale, b = foe.box();
    const x0 = p.dir > 0 ? p.x : p.x - len, x1 = p.dir > 0 ? p.x + len : p.x;
    if (x1 > b.x0 && x0 < b.x1 && p.y > b.y0 && p.y < b.y1 && foe.visible) {
      if (damage(foe, p.owner, p.dmg, p.heavy, p.dir, 'proj', { token: p.kind })) p.dead = true;
    }
    for (const q of projs) if (q !== p && q.owner !== p.owner && Math.abs(q.x - p.x) < 14 && Math.abs(q.y - p.y) < 14) {
      p.dead = q.dead = true; sparks.push({ x: p.x, y: p.y, t: 0, c: '#ffffff' }); sfx.punch();
    }
    if (p.x < -60 || p.x > W + 60) p.dead = true;
  }
  projs = projs.filter(p => !p.dead);
}

function beamParts(b) {
  const B = BEAMS[b.owner.who];
  return { start: art(B.start), body: art(B.body), head: art(B.head), s: B.scale * (b.big ? 1.7 : 1) };
}

function updateBeams(dt) {
  beams = beams.filter(b => b.owner.state === 'kameFire');
  for (const b of beams) {
    b.t += dt;
    const cos = Math.cos(b.ang), sin = Math.sin(b.ang);
    // an angled beam stops where it hits the ring (and blasts a crater there)
    const edge = (b.dir > 0 ? W + 40 - b.x0 : b.x0 + 40) / cos;
    const maxLen = sin > 0.01 ? Math.min(edge, (FLOOR + 2 - b.y) / sin) : edge;
    if (!clash) b.len = Math.min(b.len + 650 * dt, maxLen);
    if (sin > 0.01 && b.len >= maxLen - 1 && !b.cratered) { b.cratered = true; Stage.crack(b.x0 + b.dir * maxLen * cos, b.big ? 2 : 1.5); shake(8); }
    const foe = foeOf(b.owner), P = beamParts(b);
    const half = P.body.height * P.s * 0.4;
    // the enemy's middle in the beam's own frame: along it and across it
    const fx = (foe.x - b.x0) * b.dir, fy = foe.y - 23 * foe.scale - b.y;
    const along = fx * cos + fy * sin, across = -fx * sin + fy * cos;
    const inBeam = along > -8 && along < b.len + 8 && Math.abs(across) < half + 20;
    if (inBeam && foe.visible && !clash && (b.tick -= dt) <= 0) {
      b.tick = 0.1;
      const lastHit = b.owner.t2 < 0.15;
      damage(foe, b.owner, b.dps * 0.1 * b.owner.dmgMul, lastHit, b.dir, b.big ? 'ult' : 'beam');
      if (!lastHit) game.freeze = 0; // 10 ticks a second: hit-stop on each would stall the whole game
      if (foe.state === 'hurt') { foe.stun = 0.15; foe.vx = b.dir * 40; }
    }
  }
  // two beams meeting head-on = beam struggle; the player mashes J to push
  const pb = beams.find(b => b.owner === player), bb = beams.find(b => b.owner === boss);
  if (pb && bb && !clash && pb.dir !== bb.dir && !pb.ang && !bb.ang) {
    const pTip = pb.x0 + pb.dir * pb.len, bTip = bb.x0 + bb.dir * bb.len;
    if ((pb.dir > 0 && pTip >= bTip) || (pb.dir < 0 && pTip <= bTip)) {
      // always start the struggle halfway between them, wherever the tips happened to meet
      clash = { m: (pb.x0 + bb.x0) / 2 };
      game.banner = { text: 'MASH  J !', t: 0, dur: 99 };
    }
  }
  if (clash) {
    if (tap('punch') || tap('beam')) clash.m += pb.dir * 7;
    clash.m -= pb.dir * (bb.big ? 44 : 34) * dt;
    pb.len = Math.abs(clash.m - pb.x0); bb.len = Math.abs(clash.m - bb.x0);
    game.shake = Math.max(game.shake, 3); // steady rumble while the beams push
    if (Math.random() < dt * 8) sfx.punch();
    const won = Math.abs(clash.m - boss.x) < 22, lost = Math.abs(clash.m - player.x) < 22;
    if (won || lost) {
      const [winner, loser] = won ? [player, boss] : [boss, player];
      clash = null; game.banner = null;
      beams = beams.filter(b => b.owner === winner);
      winner.t2 = 0.4; loser.play('idle');
      damage(loser, winner, 38, true, winner.facing, 'beam');
      game.flash = 0.8; sfx.explode();
    }
  }
}

// beams light up the ring under them
function beamLight(b) {
  const L = b.len, mx = b.x0 + b.dir * L * 0.5 * Math.cos(b.ang);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(mx, FLOOR, 2, mx, FLOOR, Math.max(30, L * 0.6));
  g.addColorStop(0, `rgba(90,170,255,${b.big ? 0.35 : 0.22})`); g.addColorStop(1, 'rgba(90,170,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(mx, FLOOR, Math.max(30, L * 0.6), 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBeam(b) {
  const P = beamParts(b), s = P.s;
  const sw = P.start.width * s, sh = P.start.height * s;
  const bh = P.body.height * s;
  const hs = (bh * 1.2) / P.head.height, hw = P.head.width * hs, hh = P.head.height * hs;
  ctx.save();
  ctx.translate(Math.round(b.x0), Math.round(b.y));
  ctx.scale(b.dir, 1);
  ctx.rotate(b.ang);
  const L = b.len, wob = Math.floor(b.t * 30) % 2;
  const headX = Math.max(Math.min(sw, L) - hw * 0.3, L - hw * 0.7);
  if (headX > sw) ctx.drawImage(P.body, 0, 0, P.body.width, P.body.height, sw - 2, -bh / 2 - wob, headX - sw + 6, bh + wob * 2);
  const cut = Math.min(sw, L);
  ctx.drawImage(P.start, 0, 0, cut / s, P.start.height, 0, -sh / 2, cut, sh);
  ctx.drawImage(P.head, headX, -hh / 2 - wob, hw, hh + wob * 2);
  ctx.restore();
}

// A ki barrier in front of a blocking fighter; it flares white when a hit lands on it.
function drawGuard(f) {
  const flare = f.anim === 'blockHit', s = f.scale;
  const cx = f.x + f.facing * 13 * s, cy = f.y - 24 * s;
  ctx.save();
  ctx.globalAlpha = (flare ? 0.75 : 0.35) + 0.08 * Math.sin(game.t * 20);
  ctx.beginPath(); ctx.ellipse(cx, cy, 6, 23 * s, 0, -Math.PI / 2, Math.PI / 2, f.facing < 0);
  ctx.fillStyle = flare ? 'rgba(255,255,255,0.45)' : 'rgba(120,210,255,0.22)'; ctx.fill();
  ctx.strokeStyle = flare ? '#ffffff' : '#8fe3ff'; ctx.lineWidth = flare ? 2 : 1.2; ctx.stroke();
  ctx.restore();
}

// Instant Kamehameha: charge it floating in the air, vanish, reappear right behind the enemy and
// fire point-blank. A cinematic, so it can't be blocked or dodged; it deals 60 and launches them.
async function instantKame(f) {
  const foe = foeOf(f);
  f.ki = 0;
  game.mode = 'cut'; projs = []; beams = []; clash = null; game.banner = null;
  settle(foe);
  Object.assign(f, { vx: 0, vy: 0, visible: true, inv: 99, floating: true });
  f.y = Math.min(f.y, FLOOR - 40);
  f.facing = foe.x > f.x ? 1 : -1;
  f.play('kameCharge', 'pose'); f.t2 = 99;
  cam.focus = { f, z: 1.25 };
  Voice.shout('goku', 'Ka... me... ha... me...'); sfx.charge(1.6); shake(3);
  await wait(1.6);
  // vanish (flicker out, leaving only the streaks)...
  f.play('teleOut', 'pose'); sfx.teleport();
  await wait(0.14);
  ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 });
  f.visible = false;
  await wait(0.25);
  // ...and reappear right behind them (in front if they're backed against the edge)
  let x = foe.x - foe.facing * 26;
  if (x < 16 || x > W - 16) x = foe.x + foe.facing * 26;
  Object.assign(f, { x, y: FLOOR, floating: false, visible: true, facing: foe.x > x ? 1 : -1 });
  ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 }); sfx.teleport();
  f.play('teleIn', 'pose');
  foe.facing = f.x > foe.x ? 1 : -1; foe.play('hurt', 'pose'); foe.t2 = 99;
  cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR, z: 1.5 };
  game.slow = 0.5;
  await wait(0.3);
  game.slow = 1;
  Voice.shout('goku', 'HAAAAAAA!');
  f.big = true; fireKame(f); f.t2 = 1.3;
  game.banner = { text: 'INSTANT KAMEHAMEHA!', t: 0, dur: 1.4 };
  game.flash = 1; shake(12); sfx.explode();
  foe.hp = Math.max(game.training ? 1 : 0, foe.hp - 60);
  foe.play('knock'); foe.vy = -320; foe.vx = f.facing * 230; foe.y -= 1;
  Stage.crack(foe.x, 2);
  await wait(1.4);
  f.inv = 0.5; cam.focus = null;
  game.mode = 'fight';
}

// Solar Kamehameha: Perfect Cell's finisher. He flares his aura, vanishes, reappears high above
// the enemy and fires a huge Kamehameha down into the ring. A cinematic: it can't be blocked or
// dodged, deals 60 and blasts them away.
async function solarKame(f) {
  const foe = foeOf(f);
  f.ki = 0;
  game.mode = 'cut'; projs = []; beams = []; clash = null; game.banner = null;
  settle(foe); settle(f);
  f.inv = 99; f.facing = foe.x > f.x ? 1 : -1;
  f.play('power', 'pose'); f.t2 = 99;
  cam.focus = { f, z: 1.5 };
  Voice.shout('cell', 'Perfect power!'); sfx.powerup(); shake(6); game.flash = 0.35;
  for (let i = 0; i < 4; i++) Stage.lift(f.x + (i - 1.5) * 14);
  await wait(1.2);
  // vanish...
  f.visible = false; sfx.teleport();
  ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 });
  await wait(0.3);
  // ...and reappear high up, on whichever side has more room
  const x = clamp(foe.x + (foe.x < W / 2 ? 1 : -1) * 84, 24, W - 24);
  Object.assign(f, { x, y: FLOOR - 74, floating: true, visible: true, facing: foe.x > x ? 1 : -1 });
  ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 }); sfx.teleport();
  foe.facing = f.x > foe.x ? 1 : -1; foe.play('hurt', 'pose'); foe.t2 = 99;
  f.play('kameCharge', 'pose');
  cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR - 40, z: 1 };
  Voice.shout('cell', 'Solar... Kamehameha!'); sfx.charge(1); shake(4);
  await wait(1);
  f.big = true; fireKame(f); f.t2 = 1.5;
  game.banner = { text: 'SOLAR KAMEHAMEHA!', t: 0, dur: 1.4 };
  game.flash = 1; shake(12); sfx.explode();
  foe.hp = Math.max(game.training ? 1 : 0, foe.hp - 60);
  foe.play('knock'); foe.vy = -220; foe.vx = f.facing * 200; foe.y -= 1;
  Stage.crack(foe.x, 2.5);
  await wait(1.5);
  f.inv = 0.5; cam.focus = null;
  game.mode = 'fight';
}

// ---------- cutscenes ----------
// real: count in real seconds even while the KO slow-motion is on
function wait(sec, real = false) { return new Promise(r => game.skip ? r() : timers.push({ t: sec, r, real })); }
function say(who, text) {
  return new Promise(r => {
    if (game.skip) return r();
    game.dlg = { who, text, shown: 0, done: r };
    if (!text.startsWith('(')) Voice.speak(who.toLowerCase(), text);
  });
}
function banner(text, dur) { game.banner = { text, t: 0, dur }; return wait(dur, true); }

function place() {
  Object.assign(player, { x: 80, y: FLOOR, visible: true, facing: 1 }); player.play('idle');
  Object.assign(boss, { x: 240, y: FLOOR, visible: true, facing: -1 }); boss.play('idle');
}

// Goku's story: stop Cell before he becomes perfect.
async function introGoku() {
  goku.visible = false;
  await wait(0.8);
  await say('CELL', 'So... the great Son Goku. Once I absorb the androids, I will be PERFECT.');
  goku.visible = true; goku.play('teleIn', 'appear');
  ghosts.push({ img: teleArt(goku), x: goku.x, y: FLOOR, t: 0 }); sfx.teleport();
  await wait(0.7);
  await say('GOKU', "You won't get the chance, Cell! I'm stopping you right here.");
  cell.play('taunt');
  await say('CELL', 'Hahaha! Then let me taste the power of a Saiyan!');
  cell.play('power'); sfx.powerup(); shake(5);
  await wait(1.6);
  cell.play('idle'); goku.play('charge'); sfx.charge(1.2); shake(4);
  await wait(1.2);
  goku.play('idle');
  await say('GOKU', 'Here I come!');
}

// Cell's story: the androids got away, so Goku's power will have to do.
async function introCell() {
  goku.visible = false;
  await wait(0.8);
  await say('CELL', 'The androids slipped through my fingers... No matter. A Saiyan will do nicely.');
  goku.visible = true; goku.play('teleIn', 'appear');
  ghosts.push({ img: teleArt(goku), x: goku.x, y: FLOOR, t: 0 }); sfx.teleport();
  await wait(0.7);
  await say('GOKU', "Cell! I won't let you hurt anyone else.");
  cell.play('taunt');
  await say('CELL', 'Every blow you land teaches my cells. I will evolve... and become PERFECT.');
  goku.play('charge'); sfx.charge(1.2); shake(4);
  await say('GOKU', "Then I'll finish this before you get the chance!");
  goku.play('idle');
  await say('CELL', '(Fill my ki with I, then press T to evolve. Perfection awaits.)');
}

async function intro() {
  game.mode = 'intro'; game.skip = false;
  place();
  if (game.side === 'goku') await introGoku(); else await introCell();
  startFight();
}

async function startFight() {
  game.skip = false; game.dlg = null; timers = [];
  place();
  game.mode = 'ready';
  await banner('READY', 1.1);
  game.banner = { text: 'FIGHT!', t: 0, dur: 0.8 }; sfx.punch();
  game.mode = 'fight';
}

// Super Saiyan cinematic, timed to assets/audio/ssj-transform.mp3: Goku powers up while the music
// builds, and his hair turns gold exactly on the hit SSJ_PEAK seconds in. It follows the track's own
// clock, so a slow start of the audio can't knock it out of sync; if the audio is blocked or stalls
// more than a second behind, the game clock takes over so the scene never hangs.
const SSJ_PEAK = 5.05;
function superSaiyan(f) {
  return new Promise(done => {
    projs = []; beams = []; clash = null; game.banner = null;
    settle(goku); settle(cell);
    game.cine = { f, t: 0, clock: 0, stage: 0, back: game.mode, done };
    game.mode = 'cut';
    f.play('charge', 'pose'); f.t2 = 99; f.inv = 99;
    cam.focus = { f, z: 1.5 };
    Audio8.music.switchTo('ssj');
    Voice.shout('goku', 'Haaaaaaah!');
  });
}

function updateCine(raw) {
  const c = game.cine, f = c.f, mt = Audio8.music.time('ssj');
  c.clock += raw;
  c.t = mt !== null ? Math.max(mt, c.clock - 1) : c.clock;
  if (c.stage < 2) {
    // the build-up: ground shaking harder and rocks rising as the music climbs
    game.shake = Math.max(game.shake, 1 + 5 * Math.min(1, c.t / SSJ_PEAK));
    if (Math.random() < raw * 30) Stage.lift(f.x);
  }
  if (c.stage === 0 && c.t >= SSJ_PEAK - 1) { c.stage = 1; f.play('ssjRise', 'pose'); sfx.powerup(); }
  if (c.stage === 1 && c.t >= SSJ_PEAK) {
    c.stage = 2; c.hitAt = mt;
    finishTransform(f); f.play('charge', 'pose'); f.t2 = 99;
    shake(12); game.banner = { text: 'SUPER SAIYAN!', t: 0, dur: 1.6 };
    for (let i = 0; i < 14; i++) Stage.lift(f.x);
    Stage.crack(f.x, 2);
  }
  if (c.stage === 2 && c.t >= SSJ_PEAK + 1.6) {
    f.play('idle'); f.inv = 0.5; cam.focus = null;
    game.mode = c.back; game.cine = null; c.done();
  }
}

// The boss powers up at 2/3 and 1/3 health. Cell evolves: Imperfect -> Semi-Perfect -> Perfect.
// Goku goes Super Saiyan, then all out (and starts using the Dragon Fist).
async function bossPhase() {
  const next = game.phase + 1;
  game.mode = 'cut'; projs = []; beams = []; clash = null; game.banner = null;
  settle(goku); settle(cell);
  if (boss === cell) {
    cell.play('power'); sfx.powerup(); shake(6);
    cam.focus = { f: cell, z: 1.5 };
    await wait(0.6);
    await say('CELL', next === 1
      ? 'Hehehe... Android 17 is part of me now. Let me show you my second form!'
      : 'With Android 18 I am finally complete... Behold my PERFECT form!');
    sfx.explode(); game.flash = 1; shake(10);
    setForm(cell, CELL_FORMS[next]);
    cell.play('power');
    await wait(1.2);
    cell.play('idle');
    if (next === 2) {
      await say('CELL', 'Perfection! Go on, Goku. Entertain me.');
      if (goku.form === 'ssj') await say('GOKU', '(Time to go all out... fill my ki and press O!)');
    }
    if (goku.form === 'base') await say('GOKU', '(He keeps getting stronger... charge ki with I, then press T!)');
  } else if (next === 1) {
    await say('GOKU', "You're stronger than I thought, Cell... Time to get serious!");
    await superSaiyan(goku);
    await say('CELL', 'The legendary Super Saiyan... Excellent. Your power will make me perfect!');
    if (cell.form === 'imperfect') await say('CELL', '(I must evolve... charge ki with I, then press T!)');
  } else {
    goku.play('charge'); sfx.powerup(); shake(8);
    await say('GOKU', "I can't hold back anymore. This is everything I've got!");
    game.flash = 1; sfx.explode();
    await wait(0.8);
    goku.play('idle');
  }
  cam.focus = null;
  if (boss === goku) Object.assign(goku, GOKU_BOSS[next]);
  game.phase = next; game.kameCd = 3; ai.ultCd = 4;
  game.mode = 'fight';
}

async function finish(result) {
  game.mode = 'ko'; game.result = result; clash = null; beams = []; projs = [];
  game.slow = 0.35;
  // push in on whoever went down
  const fallen = player.hp <= 0 ? player : boss.hp <= 0 ? boss : null;
  if (fallen) cam.focus = { f: fallen, z: 1.5 };
  await banner(result === 'timeup' ? 'TIME!' : 'K.O.!', 1.4);
  game.slow = 1;
  for (const f of [goku, cell]) if (f.hp > 0) settle(f);
  const win = result === 'win' || (result === 'timeup' && player.hp / player.maxHp > boss.hp / boss.maxHp);
  game.result = win ? 'win' : 'lose';
  await wait(0.8);
  cam.focus = null;
  const winner = win ? player : boss;
  winner.play('win');
  if (win) Audio8.music.winner(); else Audio8.music.defeat();
  const LINES = {
    goku: winner === goku ? "It's over, Cell." : 'Hahaha! Is that the best the Saiyans have? Pathetic!',
    cell: winner === cell ? 'PERFECT! Now nothing in this universe can stop me!' : "You were strong, Cell... but you'll never be perfect.",
  };
  await say(winner.who.toUpperCase(), LINES[game.side]);
  game.mode = 'end';
}

// ---------- menus ----------
// Screens are a stack: the pause menu opens over the fight, the move list opens over the pause
// menu, and Back pops one level. Every screen opens with an item focused, and works the same on
// keyboard (W/S or arrows, Enter, Esc) and gamepad (d-pad, A, B).
const bars = n => '|'.repeat(n) + '.'.repeat(10 - n);
const sideOfPick = () => game.pick ? 'cell' : 'goku';
const guideWho = () => game.mode === 'select' ? sideOfPick() : player.who;
function openMenu(id) { game.menu.push({ id, i: 0 }); }
function closeMenu() {
  game.menu.pop();
  if (!game.menu.length && game.mode === 'paused') { game.mode = 'fight'; Audio8.music.play(); }
}
function closeAllMenus() {
  game.menu = [];
  if (game.mode === 'paused') { game.mode = 'fight'; Audio8.music.play(); }
}
function quitToSelect() {
  const pick = game.side === 'cell' ? 1 : 0;
  reset(); game.pick = pick; game.mode = 'select'; Audio8.music.play('bg', true);
}
function startTraining(side) {
  reset(side); game.training = true; Audio8.music.play('bg');
  player.ki = 100; startFight();
}
const MENUS = {
  pause: () => ({ title: game.training ? 'TRAINING' : 'PAUSED', items: [
    { label: 'RESUME', go: closeAllMenus },
    { label: 'MOVE LIST', go: () => openMenu('moves') },
    { label: 'COMBO LIST', go: () => openMenu('combos') },
    { label: 'CONTROLS', go: () => openMenu('controls') },
    { label: 'OPTIONS', go: () => openMenu('options') },
    ...(game.training ? [{ label: 'DUMMY: ' + (game.dummyFight ? 'FIGHTS BACK' : 'STANDS STILL'), go: () => { game.dummyFight = !game.dummyFight; } }] : []),
    { label: 'QUIT TO CHARACTER SELECT', go: quitToSelect },
  ] }),
  mode: () => ({ title: sideOfPick().toUpperCase(), items: [
    { label: 'STORY MODE', go: () => { reset(sideOfPick()); Audio8.music.play('bg'); intro(); } },
    { label: 'TRAINING  (PRACTISE COMBOS)', go: () => startTraining(sideOfPick()) },
    { label: 'MOVE LIST', go: () => openMenu('moves') },
    { label: 'COMBO LIST', go: () => openMenu('combos') },
    { label: 'OPTIONS', go: () => openMenu('options') },
    { label: 'BACK', go: closeMenu },
  ] }),
  // left / right change a setting; it's saved for next time
  options: () => ({ title: 'OPTIONS', items: [
    { label: 'MUSIC VOLUME  ' + bars(Audio8.vol.music), adjust: d => Audio8.setVolume('music', Audio8.vol.music + d) },
    { label: 'SOUND FX VOLUME  ' + bars(Audio8.vol.sfx), adjust: d => Audio8.setVolume('sfx', Audio8.vol.sfx + d) },
    { label: 'MUSIC  ' + (Audio8.music.muted ? 'OFF' : 'ON'), go: () => Audio8.music.toggleMute(), adjust: () => Audio8.music.toggleMute() },
    { label: 'CALM MODE  ' + (settings.calm ? 'ON' : 'OFF'), go: toggleCalm, adjust: toggleCalm },
    { label: 'ARENA  ' + Stage.arena.toUpperCase(), go: () => cycleArena(1), adjust: cycleArena },
    { label: 'BACK', go: closeMenu },
  ] }),
  moves: () => ({ title: guideWho().toUpperCase() + '  MOVE LIST', page: 'moves', items: [{ label: 'BACK', go: closeMenu }] }),
  combos: () => ({ title: guideWho().toUpperCase() + '  COMBOS', page: 'combos', items: [{ label: 'BACK', go: closeMenu }] }),
  controls: () => ({ title: 'CONTROLS', page: 'controls', items: [{ label: 'BACK', go: closeMenu }] }),
};

function cycleArena(d) {
  const all = Stage.arenas;
  Stage.setArena(all[(all.indexOf(Stage.arena) + (d > 0 ? 1 : all.length - 1)) % all.length]);
}

function menuInput() {
  const top = game.menu[game.menu.length - 1], m = MENUS[top.id]();
  if (tap('jump')) { top.i = (top.i + m.items.length - 1) % m.items.length; sfx.blip(); }
  if (tap('block')) { top.i = (top.i + 1) % m.items.length; sfx.blip(); }
  const it = m.items[top.i];
  if (it.adjust && (tap('left') || tap('right'))) it.adjust(tap('right') ? 1 : -1);
  else if ((tap('confirm') || tap('punch')) && it.go) { sfx.blip(); it.go(); }
  else if (tap('back') || tap('pause')) { sfx.blip(); closeMenu(); }
}

function drawMenu() {
  if (!game.menu.length) return;
  const top = game.menu[game.menu.length - 1], m = MENUS[top.id](), who = guideWho();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.fillStyle = m.page ? 'rgba(6,5,16,0.96)' : 'rgba(6,5,16,0.86)'; ctx.fillRect(0, 0, W, H);
  text(m.title, W / 2, 6, 15, '#ffe04a', 'center');
  let y = 28;
  if (m.page === 'moves') {
    const step = Math.min(7, 128 / MOVES[who].length);
    for (const [input, what] of MOVES[who]) { small(input, 14, y, '#ffd23a', 'left', 5); small(what, 118, y, '#fff', 'left', 5); y += step; }
  } else if (m.page === 'combos') {
    const step = Math.min(9, 124 / COMBOS[who].length);
    for (const c of COMBOS[who]) {
      const got = game.learned.has(c.name);
      small(got ? '[X]' : '[ ]', 12, y, got ? '#8f8' : '#888', 'left', 5);
      small(c.name, 32, y, got ? '#8f8' : '#ffd23a', 'left', 5); small(c.how, 140, y, '#ddd', 'left', 5); y += step;
    }
    small('LAND A COMBO IN A FIGHT OR IN TRAINING TO TICK IT OFF  (+8 KI EACH TIME)', W / 2, y + 2, '#9ff');
  } else if (m.page === 'controls') {
    small('ACTION', 14, y, '#9ff', 'left'); small('KEYBOARD', 120, y, '#9ff', 'left'); small('GAMEPAD', 230, y, '#9ff', 'left'); y += 10;
    for (const [a, k, p] of CONTROL_ROWS) { small(a, 14, y, '#ffd23a', 'left'); small(k, 120, y, '#fff', 'left'); small(p, 230, y, '#fff', 'left'); y += 9; }
  }
  // items (focused one highlighted); info pages show just BACK at the bottom
  const iy = m.page ? H - 18 : 44;
  m.items.forEach((it, k) => {
    const on = k === top.i;
    text((on ? '> ' : '') + it.label, W / 2, iy + k * 15, on ? 12 : 10, on ? '#ffe04a' : '#ccc', 'center');
  });
  small(m.items.some(i => i.adjust) ? 'W / S  MOVE     A / D  CHANGE     ESC  BACK' : 'W / S  MOVE     ENTER  SELECT     ESC  BACK', W / 2, H - 6, '#888');
}

// Training: the dummy can't be KO'd, health refills after each combo and ki tops itself up.
function trainingRefill(dt) {
  if (!game.combo.n && boss.free) boss.hp = Math.min(boss.maxHp, boss.hp + 120 * dt);
  if (player.free) player.hp = Math.min(player.maxHp, player.hp + 40 * dt);
  player.ki = Math.min(100, player.ki + 20 * dt);
}

// Training checklist: every named combo, ticked once you've landed it; the next one to try is lit.
function drawChecklist() {
  const list = COMBOS[player.who], next = list.find(c => !game.learned.has(c.name));
  ctx.fillStyle = 'rgba(6,5,16,0.55)'; ctx.fillRect(W - 98, 30, 94, 11 + list.length * 6 + (next ? 9 : 0));
  small('COMBO CHECKLIST', W - 51, 32, '#9ff', 'center', 4);
  list.forEach((c, k) => {
    const got = game.learned.has(c.name);
    small((got ? 'X ' : '- ') + c.name, W - 95, 39 + k * 6, got ? '#8f8' : c === next ? '#ffe04a' : '#aaa', 'left', 4);
  });
  if (next) small('TRY: ' + next.how, W - 95, 41 + list.length * 6, '#ffe04a', 'left', 4);
}

// ---------- camera ----------
// Frames both fighters: pans to the middle of the fight and zooms in a little when they're close,
// back out as they separate, and never shows past the stage. Cinematics point it at a fighter
// (cam.focus). Smoothing is exponential, so it feels the same at any frame rate.
const cam = { x: W / 2, y: H / 2, z: 1, focus: null };
function updateCamera(raw) {
  let tx, ty, tz;
  const live = ['fight', 'ready', 'cut', 'ko', 'end', 'intro', 'paused'].includes(game.mode);
  if (cam.focus && live) {
    const f = cam.focus.f;
    tz = cam.focus.z; tx = f ? f.x : cam.focus.x; ty = (f ? f.y - f.hover : cam.focus.y) - 26;
  } else if (live && goku && cell) {
    const x0 = Math.min(goku.x, cell.x), x1 = Math.max(goku.x, cell.x), top = Math.min(goku.y, cell.y) - 64;
    tz = clamp(W / (x1 - x0 + 150), 1, 1.25);
    tx = (x0 + x1) / 2;
    // keep the ring's floor near the bottom of the view; rise only when someone jumps out of frame
    const viewH = H / tz;
    ty = Math.min(H - viewH / 2, top + viewH / 2);
  } else { tz = 1; tx = W / 2; ty = H / 2; }
  const kz = 1 - Math.exp(-4 * raw), kp = 1 - Math.exp(-7 * raw);
  cam.z += (tz - cam.z) * kz;
  cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp;
  // clamp so the view (not just its centre) stays on the stage
  const z = Math.round(cam.z * 4) / 4, hw = W / 2 / z, hh = H / 2 / z;
  cam.x = clamp(cam.x, hw, W - hw); cam.y = clamp(cam.y, hh, H - hh);
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  pollGamepad();
  // hit-freeze frames skip input, so keep those key presses for the next real frame
  if (step(raw) !== 'frozen') pressed.clear();
  render();
  requestAnimationFrame(loop);
}

function step(raw) {
  game.t += raw;
  if (tap('calm')) { toggleCalm(); popups.push({ text: settings.calm ? 'CALM MODE: LESS SHAKE + FLASH' : 'CALM MODE OFF', x: W / 2, y: 60, t: 0, c: '#fff' }); }
  // the heartbeat layer comes in when you're close to defeat
  Audio8.heartbeat(game.mode === 'fight' && !game.training && player.hp > 0 && player.hp < player.maxHp * 0.25);
  if (tap('music')) { Audio8.init(); popups.push({ text: Audio8.music.toggleMute() ? 'MUSIC OFF' : 'MUSIC ON', x: W / 2, y: 60, t: 0, c: '#fff' }); }
  if (game.mode === 'title') {
    if (tap('confirm')) { Audio8.init(); Audio8.music.play('bg', true); game.mode = 'select'; sfx.blip(); }
    return;
  }
  if (game.menu.length) { menuInput(); return; }
  if (game.mode === 'select') {
    if (tap('left') || tap('right')) { game.pick = 1 - game.pick; sfx.blip(); }
    if (tap('confirm')) { openMenu('mode'); sfx.blip(); }
    return;
  }
  if (tap('pause') && game.mode === 'fight') { game.mode = 'paused'; Audio8.music.stop(); openMenu('pause'); return; }
  if (game.mode === 'paused') return;
  if (game.mode === 'end') {
    if (tap('confirm')) { reset(); Audio8.music.play('bg', true); startFight(); }
    else if (tap('back')) { reset(); Audio8.music.play('bg', true); game.mode = 'select'; }
  }
  if (game.mode === 'intro' && tap('back')) { game.skip = true; timers.forEach(t => t.r()); if (game.dlg) game.dlg.done(); game.dlg = null; }

  // dialogue: Enter finishes the line, then advances
  if (game.dlg) {
    const d = game.dlg;
    d.shown += raw * 45;
    if (tap('confirm')) { if (d.shown < d.text.length) d.shown = d.text.length; else { game.dlg = null; d.done(); } }
  }
  const dt = raw * game.slow;
  timers = timers.filter(t => (t.t -= t.real ? raw : dt) > 0 || (t.r(), false));
  if (game.banner && (game.banner.t += raw) > game.banner.dur) game.banner = null;
  game.shake = Math.max(0, game.shake - raw * 16);
  if ((game.combo.t += raw) > 1.1 && game.combo.n) Object.assign(game.combo, { n: 0, dmg: 0, moves: [], done: new Set() });
  game.flash = Math.max(0, game.flash - raw * 2.5);
  for (const s of sparks) s.t += raw;
  sparks = sparks.filter(s => s.t < 0.3);
  for (const gh of ghosts) gh.t += raw;
  ghosts = ghosts.filter(gh => gh.t < 0.3);
  for (const pp of popups) pp.t += raw;
  for (const c of game.comboNames) c.t += raw;
  game.comboNames = game.comboNames.filter(c => c.t < 1.6);
  popups = popups.filter(pp => pp.t < 0.9);
  if (game.cine) updateCine(raw);
  updateCamera(raw);
  Stage.update(raw);
  for (const tr of trails) tr.t += raw;
  trails = trails.filter(tr => tr.t < 0.22);
  for (const z of zips) z.t += raw;
  zips = zips.filter(z => z.t < 0.3);
  if (game.freeze > 0) { game.freeze -= raw; return 'frozen'; }
  game.ct += raw;
  game.chaseT -= raw;

  if (game.mode === 'fight') {
    playerInput(dt);
    if (!window.noAI && (!game.training || game.dummyFight)) bossAI(dt);
    if (game.training) trainingRefill(dt);
    else game.time -= dt;
    if (!game.training && game.phase < 2 && boss.hp <= boss.maxHp * (2 - game.phase) / 3 && boss.hp > 0 && boss.free) { bossPhase(); return; }
  }
  updateFighter(goku, cell, dt);
  updateFighter(cell, goku, dt);
  // keep the two bodies from overlapping
  if (goku.visible && cell.visible && Math.abs(goku.x - cell.x) < 20 && goku.y > FLOOR - 30 && cell.y > FLOOR - 30) {
    const push = (20 - Math.abs(goku.x - cell.x)) / 2, d = goku.x < cell.x ? -1 : 1;
    goku.x = clamp(goku.x + d * push, 16, W - 16); cell.x = clamp(cell.x - d * push, 16, W - 16);
  }
  updateProjectiles(dt);
  updateBeams(dt);
  if (game.mode === 'fight') {
    if (boss.hp <= 0) finish('win');
    else if (player.hp <= 0) finish('lose');
    else if (game.time <= 0) finish('timeup');
  }
}

// ---------- rendering ----------
function text(str, x, y, size, color, align = 'left', stroke = '#000') {
  ctx.font = `${size}px Saiyan, Impact, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function small(str, x, y, color = '#fff', align = 'center', size = 5) {
  ctx.font = `${size}px "Press Start 2P", monospace`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

function drawBackground(dim) {
  Stage.drawBack(ctx, dim);
}

function bar(x, y, w, h, v, color, flip) {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1010'; ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(v, 0, 1));
  ctx.fillStyle = color; ctx.fillRect(flip ? x + w - fw : x, y, fw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(flip ? x + w - fw : x, y, fw, 1);
}

// The icon follows the fighter's form: Goku's normal head, Super Saiyan or SSJ3 portrait; Cell's head per form.
function iconOf(f) {
  if (f.who === 'cell') return { im: art({ sheet: 'cell', ref: { id: CELL_ROW[f.form] + '.0', h: 20 } }), crop: true };
  const ult = f.state.startsWith('ult');
  return { im: art(ult ? FX_ART.ssj3Portrait : f.form === 'ssj' ? FX_ART.gokuPortrait : FX_ART.gokuHead), crop: !ult && f.form === 'base' };
}

function hintFor(g) {
  if (g.who === 'goku') {
    if (g.form === 'base' && g.ki >= 100) return 'PRESS T  -  SUPER SAIYAN!';
    if (g.form === 'ssj' && g.ki >= 100) return 'JUMP + U  INSTANT KAMEHAMEHA    O  DRAGON FIST';
    if (g.form === 'ssj' && g.ki >= 50) return 'U  KAMEHAMEHA  (WORKS IN THE AIR TOO)';
  } else {
    if (g.form !== 'perfect' && g.ki >= 100) return 'PRESS T  -  EVOLVE!';
    if (g.form === 'perfect' && g.ki >= 100) return 'U  KAMEHAMEHA    O  SOLAR KAMEHAMEHA!';
    if (g.form === 'perfect' && g.ki >= 50) return 'PRESS U  -  KAMEHAMEHA!';
    if (g.form === 'semi' && g.ki >= 20) return 'PRESS U  -  DEATH BEAM';
  }
  return '';
}

function drawHUD() {
  const pi = iconOf(player), bi = iconOf(boss);
  icon(pi.im, 6, 5, pi.crop, player.who === 'cell');
  icon(bi.im, W - 28, 5, bi.crop, boss.who === 'cell');
  bar(32, 7, 100, 7, player.hp / player.maxHp, player.hp / player.maxHp > 0.3 ? '#ffd23a' : '#ff4a3a');
  const bossBar = boss.who === 'cell' ? CELL_INFO[boss.form].bar : ['#ff9a3a', '#ffd84a', '#fff27a'][game.phase];
  bar(W - 132, 7, 100, 7, boss.hp / boss.maxHp, bossBar, true);
  ctx.fillStyle = '#000'; [1, 2].forEach(k => ctx.fillRect(W - 132 + Math.round(100 * k / 3), 7, 1, 7));
  const kiFull = player.ki >= 100 && Math.floor(game.t * 6) % 2;
  bar(32, 17, 70, 4, player.ki / 100, kiFull ? '#ffffff' : '#4fd2ff');
  const broken = player.guardBroken && Math.floor(game.t * 8) % 2;
  bar(32, 24, 50, 2, player.stamina / 100, broken ? '#ff5a3a' : player.guardBroken ? '#a0503a' : '#9be36b');
  text(NAME(player), 32, 28, 9, '#fff');
  text(NAME(boss), W - 32, 16, 9, '#fff', 'right');
  if (game.training) text('TRAINING', W / 2, 6, 11, '#9ff', 'center');
  else text(String(Math.max(0, Math.ceil(game.time))), W / 2, 4, 16, '#ffe04a', 'center');
  if (game.combo.n >= 2) {
    const pop = Math.max(0, 0.15 - game.combo.t) * 40;
    text(`${game.combo.n} HITS!`, 8, 44, 12 + pop, '#ffd23a', 'left', '#7a1a00');
    small(`${Math.round(game.combo.dmg)} DAMAGE`, 9, 60 + pop, '#fff', 'left');
  }
  // named combos stack under the timer in screen space, newest at the bottom
  game.comboNames.slice(-3).forEach((c, i) => {
    const pop = Math.max(0, 0.12 - c.t) * 40;
    ctx.globalAlpha = Math.min(1, (1.6 - c.t) * 3);
    text(c.text, W / 2, 24 + i * 12, 10 + pop, '#ffd23a', 'center', '#7a1a00');
    ctx.globalAlpha = 1;
  });
  const hint = hintFor(player);
  if (hint && game.mode === 'fight' && !beams.length && !game.comboNames.length) text(hint, W / 2, 32, 8, '#9ff', 'center');
}

// Icon in a dark frame. crop: draw just the top square of a tall portrait.
function icon(im, x, y, crop, flip, size = 22) {
  const sw = im.width, sh = crop ? im.height : Math.min(im.height, im.width);
  const k = Math.min(size / sw, size / sh);
  ctx.fillStyle = '#120c1c'; ctx.fillRect(x, y, size, size);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  ctx.translate(x + size / 2, y + size - sh * k); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, 0, 0, sw, sh, -sw * k / 2, 0, sw * k, sh * k);
  ctx.restore();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - 0.5, size + 1, size + 1);
}

function drawDialogue() {
  const d = game.dlg; if (!d) return;
  const top = 38, isGoku = d.who === 'GOKU';
  ctx.fillStyle = 'rgba(8,6,20,0.85)'; ctx.fillRect(10, top, W - 20, 50);
  ctx.strokeStyle = isGoku ? '#f2691c' : '#62bf4c'; ctx.lineWidth = 1; ctx.strokeRect(10.5, top + 0.5, W - 21, 49);
  // speaker portrait
  const sp = iconOf(isGoku ? goku : cell);
  icon(sp.im, 16, top + 6, sp.crop, !isGoku, 20);
  text(d.who, 42, top + 4, 11, isGoku ? '#ffb070' : '#a8e27c');
  ctx.font = '7px "Press Start 2P", monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const shown = d.text.slice(0, Math.floor(d.shown)), words = shown.split(' ');
  let line = '', y = top + 20;
  for (const w of words) {
    if (ctx.measureText(line + w).width > W - 66) { ctx.fillText(line, 42, y); line = ''; y += 10; }
    line += w + ' ';
  }
  ctx.fillText(line, 42, y);
  if (d.shown >= d.text.length && Math.floor(game.t * 3) % 2) text('ENTER', W - 16, top + 38, 8, '#ffe04a', 'right');
}

function drawTitle() {
  drawBackground(0.45);
  const p = art(FX_ART.gokuPortrait);
  ctx.drawImage(p, 22, 26, p.width * 1.3, p.height * 1.3);
  const c = Sheets.frame('cell', '12.0');
  ctx.save(); ctx.translate(W - 44, 110); ctx.scale(-1.6, 1.6); ctx.drawImage(c, -c.ax, -c.height); ctx.restore();
  text('GOKU', W / 2 - 4, 30, 32, '#ffb070', 'right');
  text('VS', W / 2, 58, 22, '#fff', 'center');
  text('CELL', W / 2 + 4, 30, 32, '#a8e27c', 'left');
  if (Math.floor(game.t * 2) % 2) text('PRESS ENTER', W / 2, 96, 14, '#ffe04a', 'center');
  small('P PAUSE / MENU   M MUSIC   R CALM MODE (LESS SHAKE)   ESC SKIP', W / 2, 156, '#ddd');
  small('GAMEPAD WORKS TOO: A JUMP  X PUNCH  Y KICK  B KI  LB BLOCK  RB DASH  RT BEAM', W / 2, 165, '#aaa');
}

const CONTROLS = {
  goku: [
    'J PUNCH  K KICK  (CHAIN THEM)  L KI BLAST',
    'TOWARD + J RUSH   TOWARD + K SLASH',
    'T SUPER SAIYAN   U KAMEHAMEHA   O DRAGON FIST',
    'IN THE AIR: Q VANISH   U INSTANT KAMEHAMEHA (SSJ, FULL KI)',
  ],
  cell: [
    'J PUNCH  K KICK  (CHAIN THEM)  L FINGER BEAM',
    'TOWARD + L BARRAGE (SEMI-PERFECT+)',
    'T EVOLVE   U DEATH BEAM / KAMEHAMEHA   IN THE AIR: Q VANISH',
    'O SOLAR KAMEHAMEHA (PERFECT, FULL KI)',
  ],
};
const STORY = {
  goku: ['Stop Cell before he', 'absorbs the androids', 'and becomes PERFECT.'],
  cell: ['Absorb the power of', 'a Saiyan, evolve and', 'become PERFECT.'],
};

function drawSelect() {
  drawBackground(0.55);
  text('CHOOSE YOUR FIGHTER', W / 2, 3, 16, '#ffe04a', 'center');
  [['goku', 80], ['cell', 240]].forEach(([who, cx], i) => {
    const on = game.pick === i, pulse = on ? Math.floor(game.t * 4) % 2 : 0;
    ctx.fillStyle = on ? 'rgba(40,30,70,0.9)' : 'rgba(10,8,20,0.75)'; ctx.fillRect(cx - 52, 30, 104, 100);
    ctx.strokeStyle = on ? (pulse ? '#fff6b0' : '#ffd23a') : '#444'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(cx - 52, 30, 104, 100);
    if (who === 'goku') {
      const im = art(on ? FX_ART.gokuPortrait : FX_ART.gokuHead);
      icon(im, cx - 48, 34, !on, false, 44);
      const body = Sheets.frame('goku', on ? '11.0' : '0.2');
      ctx.drawImage(body, cx + 26 - body.ax, 80 - body.height, body.width, body.height);
    } else {
      const head = art({ sheet: 'cell', ref: { id: '12.0', h: 20 } });
      icon(head, cx - 48, 34, true, true, 44);
      const body = Sheets.frame('cell', on ? '12.0' : '0.0');
      ctx.save(); ctx.translate(cx + 26, 80); ctx.scale(-1.1, 1.1); ctx.drawImage(body, -body.ax, -body.height); ctx.restore();
    }
    text(who.toUpperCase(), cx - 48, 82, 16, who === 'goku' ? '#ffb070' : '#a8e27c');
    STORY[who].forEach((l, k) => small(l, cx - 48, 102 + k * 8, '#ddd', 'left'));
  });
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 136, W, 44);
  CONTROLS[game.pick ? 'cell' : 'goku'].forEach((l, i) => small(l, W / 2, 140 + i * 8));
  small('A/D MOVE  DOUBLE-TAP A/D DASH (AIR TOO)  W JUMP  S BLOCK  I CHARGE  Q VANISH', W / 2, 172, '#aaa');
  if (Math.floor(game.t * 2) % 2) small('A / D  CHOOSE     ENTER  STORY / TRAINING / GUIDE', W / 2, 22, '#fff');
}

function render() {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (game.mode === 'title' || game.mode === 'select') {
    if (game.mode === 'title') drawTitle(); else drawSelect();
    if (Audio8.music.muted) small('MUSIC OFF (M)', W - 4, 4, '#f99', 'right');
    drawMenu();
    return;
  }
  // camera: zoom in whole-pixel steps (S x zoom stays an integer, so the pixel art stays crisp)
  const z = Math.round(cam.z * 4) / 4, k = S * z;
  ctx.setTransform(k, 0, 0, k, Math.round((W / 2 / z - cam.x) * k), Math.round((H / 2 / z - cam.y) * k));
  // shake rides on top of the camera: a smooth wave scaled by trauma squared
  const tr = Math.min(1, game.shake / 12), amp = tr * tr * 12 * (settings.calm ? 0.3 : 1);
  ctx.translate(Math.round(amp * Math.sin(game.t * 47)), Math.round(amp * 0.7 * Math.sin(game.t * 59 + 1.3)));
  drawBackground(game.mode === 'cut' ? 0.25 : 0);
  // shadows
  for (const f of [goku, cell]) if (f.visible) {
    const k = clamp(1 - (FLOOR - f.y + f.hover) / 120, 0.3, 1);
    ctx.fillStyle = 'rgba(0,0,40,0.35)';
    ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 1, 13 * k, 3 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  // charging ki at the hands
  for (const f of [goku, cell]) if (f.anim === 'kameCharge' && f.visible) {
    const [hx, hy] = f.hand('kameFire');
    const grow = f.state === 'kameCharge' ? 1 - f.t2 : Math.min(1, f.at / 1.6);
    FX.kiGlow(ctx, hx - f.facing * 8, hy - f.hover, (2 + grow * 5) * (f.big ? 2 : 1), game.t);
  }
  for (const z of zips) {
    ctx.save(); ctx.globalAlpha = 0.85 * (1 - z.t / 0.3);
    ctx.translate(Math.round(z.x), Math.round(z.y)); ctx.scale(z.dir * z.scale, z.scale);
    ctx.drawImage(z.im, -z.im.width - 4, -z.im.height / 2); ctx.restore();
  }
  for (const tr of trails) {
    ctx.save(); ctx.globalAlpha = 0.4 * (1 - tr.t / 0.22);
    ctx.translate(Math.round(tr.x), Math.round(tr.y)); ctx.scale(tr.facing * tr.scale, tr.scale);
    ctx.drawImage(tr.im, -Math.round(tr.im.ax), -tr.im.height); ctx.restore();
  }
  const order = player.state === 'attack' ? [boss, player] : [player, boss];
  order.forEach(f => f.draw());
  for (const f of order) if (f.state === 'block' && f.visible) drawGuard(f);
  for (const b of beams) beamLight(b);
  for (const b of beams) drawBeam(b);
  for (const p of projs) {
    const im = art(FX_ART[p.kind]);
    const ps = p.owner.scale;
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(p.dir * ps, ps);
    ctx.drawImage(im, 0, -im.height / 2); ctx.restore();
  }
  for (const gh of ghosts) { ctx.globalAlpha = 1 - gh.t / 0.3; ctx.drawImage(gh.img, Math.round(gh.x - gh.img.width / 2), gh.y - gh.img.height); ctx.globalAlpha = 1; }
  for (const s of sparks) FX.spark(ctx, s.x, s.y, s.t, s.c);
  Stage.drawFront(ctx);
  for (const pp of popups) text(pp.text, Math.round(pp.x), Math.round(pp.y - pp.t * 18), 9, pp.c, 'center');
  ctx.setTransform(S, 0, 0, S, 0, 0);
  if (game.flash > 0) { ctx.fillStyle = `rgba(255,250,220,${game.flash * (settings.calm ? 0.25 : 0.8)})`; ctx.fillRect(0, 0, W, H); }
  if (['fight', 'ready', 'ko', 'paused', 'cut'].includes(game.mode)) drawHUD();
  if (game.banner) {
    const b = game.banner, pop = Math.min(1, b.t * 6);
    text(b.text, W / 2, 62 - (1 - pop) * 10, 28, '#ffe04a', 'center', '#7a1a00');
  }
  if (game.mode === 'end') {
    text(game.result === 'win' ? 'YOU WIN!' : `${boss.who.toUpperCase()} WINS`, W / 2, 46, 28, game.result === 'win' ? '#ffe04a' : '#ff8a6a', 'center');
    if (Math.floor(game.t * 2) % 2) text('ENTER  FIGHT AGAIN      ESC  CHOOSE FIGHTER', W / 2, 82, 9, '#fff', 'center');
  }
  if (game.training && game.mode === 'fight') drawChecklist();
  drawDialogue();
  drawMenu();
}

reset();
Sheets.load().then(() => requestAnimationFrame(loop));
window.__game = () => ({ goku, cell, player, boss, game, beams, projs, startKame, bossPhase, instantKame, solarKame, setForm, reset, startFight });
