// Goku vs Cell. Pick a side on the select screen; the other fighter becomes the boss, with
// three phases and an AI. The world is 320x180 and is drawn at 4x.
const W = 320, H = 180, FLOOR = 162, GRAV = 1300, JUMP_V = -400;
const PLAYER_HP = 100, BOSS_HP = 300;
// Perfect Cell's own health bar once he completes himself (see bossPhase)
const PERFECT_HP = 200;
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
  ult: ['KeyO'], cannon: ['KeyY'], charge: ['KeyI'], vanish: ['KeyQ'], barrier: ['KeyG'], junior: ['KeyE'], transform: ['KeyT'], dash: ['ShiftLeft', 'ShiftRight'],
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
      juggle: 0, comboTaken: 0, hitLanded: false, wallBounce: false, spiked: false, assistCd: 0,
      // Cell's sheet is drawn smaller than Goku's; 1.25 keeps pixels whole at 4x
      scale: who === 'cell' ? 1.25 : 1,
    });
  }
  A(name = this.anim) { return ANIMS[this.who][this.form][name] || ANIMS[this.who].base[name]; }
  play(anim, state = anim) {
    if (this.state !== state && ['charge', 'kameFire'].includes(this.state)) sfx.stopSustain(this);
    if (this.state !== state && ['kameCharge', 'kameFire'].includes(this.state)) sfx.stopKame(this);
    this.anim = anim; this.state = state; this.at = 0; this.hitDone = false; this.hitLanded = false; this.emitted = 0;
  }
  get fi() { const a = this.A(), i = Math.floor(this.at * a.fps); return a.loop ? i % a.fr.length : Math.min(i, a.fr.length - 1); }
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
    return [this.x + this.facing * (im.width - im.ax) * this.scale, this.y - a.emit * this.scale];
  }
  draw() {
    if (!this.visible) return;
    const im = this.img;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y - this.hover));
    // a held stance breathes a little instead of standing frozen
    const breath = this.A().breathe ? Math.sin(this.at * 2.6) * 0.018 : 0;
    ctx.scale(this.facing * this.scale * (1 + this.sq), this.scale * (1 - this.sq + breath));
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

let goku, cell, player, boss, projs, beams, sparks, ghosts, popups, trails, zips, minions, bursts, kiMotes, clash, timers, game;
const foeOf = f => f === goku ? cell : goku;
const NAME = f => f.who === 'goku'
  ? (f.state.startsWith('ult') ? 'GOKU  SSJ3' : f.form === 'ssj' ? 'GOKU  SSJ' : 'GOKU')
  : f.form === 'junior' ? `CELL JR.  x${game.juniors ? game.juniors.left : 1}` : CELL_INFO[f.form].name;

// Goku as the boss gets stronger in each phase instead of changing body
const GOKU_BOSS = [{ speed: 1, dmgMul: 0.9 }, { speed: 1.15, dmgMul: 1.15 }, { speed: 1.3, dmgMul: 1.35 }];

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
  for (const a in lastPress) delete lastPress[a];
  dashReq = null; lastTap.dir = 0;
  Object.assign(cam, { x: W / 2, y: H / 2, z: 1, focus: null });
  Stage.reset(); Object.assign(ai, { think: 0.8, vanishCd: 3, ultCd: 6, spam: 0, barrierCd: 5, assistCd: 6, cannonCd: 6, rolled: 0 });
  game = { mode: 'title', comboNames: [], menu: [], training: false, dummyFight: false, ct: 0, chaseT: 0, cine: null, combo: { n: 0, t: 0, dmg: 0, moves: [], done: new Set() }, learned: (game && game.learned) || new Set(), side, pick: side === 'cell' ? 1 : 0, time: 150, juniors: null, freeze: 0, shake: 0, flash: 0, phase: 0, slow: 1, banner: null, dlg: null, skip: false, result: null, t: 0, kameCd: 4 };
}

function setForm(f, form) {
  f.form = form;
  if (f.who === 'cell') Object.assign(f, { speed: CELL_INFO[form].speed, dmgMul: CELL_INFO[form].dmgMul, scale: CELL_INFO[form].scale || 1.25 });
  else Object.assign(f, form === 'ssj' ? { speed: 1.15, dmgMul: 1.35 } : { speed: 1, dmgMul: 1 });
}

// ---------- combat ----------
// kind: 'melee' | 'proj' | 'beam' | 'ult' (ultimates can't be blocked or dodged)
// opts: launch / spike / wallBounce / grab from the attack, token for combo recognition
const JUGGLE_MAX = 5;
// caught starting their own move: a counter hit, which hurts more and stuns for longer
const COUNTER_STATES = ['attack', 'airAtk', 'cast', 'kameCharge', 'windup'];
function damage(def, src, dmg, heavy, dir, kind = 'melee', opts = {}) {
  if ((def.inv > 0 && kind !== 'ult') || (def.state === 'down' && !opts.otg) || ['tele', 'transform', 'evolve'].includes(def.state) || def.hp <= 0 || game.mode !== 'fight') return false;
  // a Super Dash swats ki blasts aside, and so does a boss being spammed with them while it attacks
  // or dashes in, so spam gets plowed through instead of locking it down
  if (kind === 'proj' && !opts.pierce && ((def.superDash && def.state === 'dash') || (def === boss && ai.spam >= 2 && ['attack', 'dash'].includes(def.state)))) {
    sparks.push({ x: def.x + def.facing * 10, y: def.y - 30, t: 0, c: '#ffffff' }); sfx.parry(); return 'deflect';
  }
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
  // the Special Beam Cannon drills through a guard like a grab does
  let blocking = kind !== 'ult' && !opts.grab && !opts.pierce && def.state === 'block' && def.facing === -dir;
  const counter = !blocking && !juggling && COUNTER_STATES.includes(def.state) && !(def.state === 'attack' && def.hitDone);
  if (blocking && def === player && kind !== 'beam' && def.blockT < PARRY_WINDOW) return perfectBlock(def, src, kind);
  // every blocked hit wears down the player's guard; when stamina runs out it breaks and the hit lands
  let broke = false;
  if (blocking && def === player && (def.stamina -= dmg * 1.6) <= 0) { guardBreak(def); blocking = false; broke = true; }
  if (blocking) {
    dmg *= 0.15; def.vx = dir * 90; def.ki = Math.min(100, def.ki + 3);
    if (def.A('blockHit')) { def.anim = 'blockHit'; def.at = 0; }
    sparks.push({ x: def.x - dir * 8, y: def.y - 28, t: 0, c: '#9fe7ff' });
    sfx.block(); game.freeze = 0.04;
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
      // Cell's grab is his Absorb: it drains them and heals him
      if (src.who === 'cell') {
        src.hp = Math.min(src.maxHp, src.hp + 15); def.ki = Math.max(0, def.ki - 15);
        popups.push({ text: 'ABSORB!  +HP', x: def.x, y: def.y - 58, t: 0, c: '#9f8' });
      } else popups.push({ text: 'DRAGON RUSH!', x: def.x, y: def.y - 58, t: 0, c: '#9ff' });
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
      def.play('knock'); def.y -= 1;
      if (kind === 'proj') sfx.kiHit(); else if (kind === 'beam') sfx.clash(); else sfx.smash();
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
    else {
      // a boss being spammed with ki blasts shakes them off quicker, so spam can't lock them down
      const spammed = def === boss && kind === 'proj' && ai.spam >= 2 ? 0.55 : 1;
      def.play('hurt'); def.stun = 0.3 * Math.max(0.55, 1 - 0.06 * def.comboTaken) * (counter ? 1.6 : 1) * spammed;
      def.vx = dir * 70;
      if (kind === 'proj') sfx.kiHit(); else if (kind === 'beam') sfx.clash(); else if (dmg >= 7) sfx.kick(); else sfx.punch();
    }
    if (def === player && Math.random() < 0.3) sfx.hurt();
    if (broke && def.state === 'hurt') def.stun = 0.9;
  }
  return true;
}

function guardBreak(f) {
  Object.assign(f, { stamina: 0, guardBroken: true, staminaDelay: 0.8 });
  popups.push({ text: 'GUARD BREAK!', x: f.x, y: f.y - 54, t: 0, c: '#ff7a5a' });
  sfx.guardBreak();
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
  f.superDash = false;
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

// Barrier: Cell's aura bursts out and throws the enemy off. It works while he's being hit, so it
// breaks a combo.
function barrier(f) {
  const foe = foeOf(f), dir = foe.x > f.x ? 1 : -1;
  f.ki = Math.max(0, f.ki - 30);
  f.play('barrier'); Object.assign(f, { t2: 0.4, inv: 0.5, vx: 0, stun: 0, queue: [], next: null });
  bursts.push({ x: f.x, y: f.y - 26 * f.scale, t: 0 });
  Stage.shock(f.x, 1.2); sfx.explode(); shake(6); game.flash = Math.max(game.flash, 0.3);
  popups.push({ text: 'BARRIER!', x: f.x, y: f.y - 64, t: 0, c: '#d6a8ff' });
  if (foe.visible && Math.abs(foe.x - f.x) < 64 && Math.abs(foe.y - f.y) < 60
      && damage(foe, f, 5 * f.dmgMul, true, dir, 'melee', { token: 'barrier' })) foe.vx = dir * 240;
}

// A Cell Junior called in by Perfect Cell: it flies at the enemy, strikes once (a launcher) and vanishes.
const JR_FRAMES = { in: '17.0', dash: '18.10', hit: '18.7' };
function callJunior(f) {
  const x = clamp(f.x - f.facing * 14, 16, W - 16);
  minions.push({ owner: f, x, y: FLOOR, dir: f.facing, t: 0, state: 'in' });
  ghosts.push({ img: teleArt(f), x, y: FLOOR, t: 0 }); sfx.teleport();
  popups.push({ text: 'CELL JUNIOR!', x: f.x, y: f.y - 60, t: 0, c: '#7ab8ff' });
}

function updateMinions(dt) {
  for (const m of minions) {
    const foe = foeOf(m.owner);
    m.t += dt;
    if (m.state === 'in' && m.t > 0.15) { m.state = 'dash'; m.t = 0; m.dir = foe.x > m.x ? 1 : -1; sfx.whoosh(); }
    else if (m.state === 'dash') {
      // flies straight at them, up into the air too
      m.x += m.dir * 340 * dt; m.y += clamp(foe.y - m.y, -280 * dt, 280 * dt);
      if (foe.visible && Math.abs(foe.x - m.x) < 24 && Math.abs(foe.y - m.y) < 30) {
        m.state = 'hit'; m.t = 0;
        damage(foe, m.owner, 9 * m.owner.dmgMul, true, m.dir, 'melee', { launch: true, token: 'junior' });
      } else if (m.t > 0.9 || m.x < 0 || m.x > W) m.state = 'out';
    } else if (m.state === 'hit' && m.t > 0.25) m.state = 'out';
    if (m.state === 'out') { ghosts.push({ img: art(FX_ART.teleport), x: m.x, y: m.y, t: 0 }); m.dead = true; }
  }
  minions = minions.filter(m => !m.dead);
}

function startAttack(f, name) {
  f.play(name, 'attack'); f.vx = f.facing * 50;
  if (name === 'rush') f.vx = f.facing * 240;
  if (name === 'grab') f.vx = f.facing * 200;
}

function cast(f, name) {
  f.play(name, 'cast'); f.vx = 0;
  // fired in the air: hang there a moment, like an air hit
  if (f.y < FLOOR - 4) f.vy = Math.min(f.vy, -60);
}

// Cell's Special Beam Cannon: a short charge at the fingertip, then a fast drilling beam that goes
// through a guard and through ki blasts. Slow to come out, so it can be seen and dodged.
const CANNON_KI = 35;
function specialBeamCannon(f) {
  cast(f, 'cannon');
  Voice.shout('cell', 'Special Beam Cannon!');
  popups.push({ text: 'SPECIAL BEAM CANNON!', x: f.x, y: f.y - 62, t: 0, c: '#ffe04a' });
  sfx.charge(0.5);
}

function spawnProjectile(f) {
  const kind = { kiCast: 'kiBall', finger: 'finger', death: 'death', barrage: f.who === 'goku' ? 'kiBall' : 'finger', cannon: 'cannon' }[f.anim];
  const [hx, hy] = f.hand(f.anim);
  const stats = { kiBall: [300, 6, false], finger: [330, 8, false], death: [560, 12, true], cannon: [640, 14, true] }[kind];
  if (f === player && f.emitted === 1) ai.spam++; // a barrage counts once
  const p = { owner: f, kind, x: hx, y: hy, dir: f.facing, vx: stats[0] * f.facing, dmg: stats[1] * f.dmgMul, heavy: stats[2] };
  // the Special Beam Cannon is long: it starts with its tip at the finger and shoots out of it
  if (kind === 'cannon') { p.ox = hx; p.x = hx - f.facing * art(FX_ART.cannon).width * f.scale; }
  projs.push(p);
  if (kind === 'cannon') { (sfx.cannon || sfx.beam)(); shake(4); } else sfx.blast();
}

// the streaks a fighter leaves when vanishing (Goku's orange, Cell's green)
const teleArt = f => art(f.who === 'goku' ? FX_ART.gokuTeleport : FX_ART.teleport);

function teleport(f, foe) {
  if (f === player && game.combo.n > 0) comboToken('vanish');
  f.play(f.A('teleOut') ? 'teleOut' : 'idle', 'tele'); f.t2 = 0.28; f.vx = 0;
  sfx.teleport();
  // reappear on the other side of them from where you are now, whichever way they face, so a
  // second vanish before they turn around takes you back in front of them (and a third behind again)
  const side = f.x === foe.x ? -foe.facing : f.x < foe.x ? 1 : -1;
  let to = clamp(foe.x + side * 34, 20, W - 20);
  // backed against the edge there's no room on the far side: land in front instead of inside them
  if (Math.abs(to - foe.x) < 16) to = clamp(foe.x - side * 34, 20, W - 20);
  f.teleTo = to;
  // in the air (either of them): reappear behind them up in the air
  f.teleY = foe.y < FLOOR - 10 ? foe.y : f.y < FLOOR - 4 ? FLOOR - 36 : FLOOR;
  f.vx = f.vy = 0;
}

// Who can fire a Kamehameha: Super Saiyan Goku, and Cell in every form (he has Goku's cells).
const canKame = f => f.who === 'cell' || f.form === 'ssj';
// Answering a beam with your own costs less than starting one, so a clash is always on the table.
const COUNTER_KI = 30;

// quick: answering a Kamehameha, charging fast enough to meet it in a beam clash.
// big: Cell's Solar Kamehameha, a huge beam that can't be blocked.
// combo: cancelled out of a landed hit, so it charges fast and the enemy is kept up in the air.
function startKame(f, quick = false, big = false, combo = false) {
  f.kiPaid = 50;
  Voice.shout(f.who, big ? 'Solar Kamehameha!' : 'Kamehameha!');
  f.big = big;
  f.play('kameCharge', 'kameCharge');
  // a quick answer fires just after a charging enemy does, or right away into a beam already firing
  const q = foeOf(f).state === 'kameCharge' ? foeOf(f).t2 + 0.03 : 0.12;
  f.t2 = combo ? 0.25 : quick ? Math.max(0.12, q) : big ? 1.6 : f.who === 'goku' ? 0.9 : 1.3;
  // answering a beam (player or boss): their beam can't knock you out of it before yours fires
  if (quick) f.inv = Math.max(f.inv, f.t2 + 0.05);
  const foe = foeOf(f);
  if (combo && foe.state === 'knock') foe.vy = Math.min(foe.vy, -160);
  f.vx = 0; if (big) f.inv = f.t2;
  // fired from the air: hang there until the beam is done
  if (f.y < FLOOR - 4) { f.floating = true; f.vy = 0; }
  // the recorded chant (assets/audio/kamehameha.mp3), or the synth whine until the clip has loaded
  if (!sfx.kameChant(f, f.t2, big)) sfx.charge(f.t2);
}

function fireKame(f) {
  f.play('kameFire', 'kameFire'); f.t2 = f.big ? 2 : f.who === 'goku' ? 1.5 : 1.7;
  const [hx, hy] = f.hand('kameFire'), foe = foeOf(f);
  // from the air the beam angles at the enemy (up to ~30 degrees up or ~40 down)
  // fired while theirs is out (a counter beam), it aims straight at their hands so the two meet in
  // a clash, even ground against air
  const theirs = beams.find(b => b.owner === foe);
  const ang = theirs ? clamp(Math.atan2(theirs.y - hy, Math.max(20, Math.abs(theirs.x0 - hx))), -0.9, 0.9)
    : f.floating ? clamp(Math.atan2(foe.y - 22 - hy, Math.max(20, Math.abs(foe.x - hx))), -0.5, 0.7) : 0;
  beams.push({ owner: f, x0: hx, y: hy, ang, dir: f.facing, len: 0, t: 0, tick: 0, big: f.big, dps: f.big ? 34 : f.who === 'goku' ? 22 : 18 });
  sfx.beam(f.t2); sfx.beamLoop(f); sfx.stopKame(f); sfx.kameBlast(f, f.big); shake(f.big ? 9 : 4);
}

// Dragon Fist: power up to Super Saiyan 3, rush in, dragon
// Spirit Bomb: base Goku's full-ki finisher. He raises his arms and the bomb gathers above them for
// SPIRIT_GATHER seconds; he's wide open while it does, and a hit makes him lose it. Then he throws
// it: a slow, huge ball that can't be blocked (dodge it: vanish, jump, run) and bursts on impact.
const SPIRIT_GATHER = 1.5, SPIRIT_R = 24, SPIRIT_DMG = 45;
// He gathers it up in the sky: he rises to SPIRIT_HEIGHT above the ring and throws it down at them.
const SPIRIT_HEIGHT = 40;
// Out of a combo (a landed hit, then O at full ki) it's a finisher: a quick gather while the hit
// leaves them dazed, a faster throw, and it crushes them even if they're already down.
const SPIRIT_COMBO_GATHER = 0.6, SPIRIT_COMBO_SPEED = 300;
// pure: thrown right after powering down from Super Saiyan in the air: bigger and stronger, the
// payoff for the extra moment he's open while the gold fades
const SPIRIT_PURE = 1.25;
function spiritBomb(f, combo = false, pure = false) {
  const gather = combo ? SPIRIT_COMBO_GATHER : SPIRIT_GATHER;
  f.ki = 0; f.vx = 0; f.vy = 0; f.floating = true; f.play('spirit', 'spirit'); f.t2 = gather;
  // the bomb is everyone's energy, not his: a Super Saiyan doesn't make it hit any harder
  const mul = (f.form === 'ssj' ? 1 : f.dmgMul) * (pure ? SPIRIT_PURE : 1);
  game.spirit = { owner: f, x: f.x, y: f.y - 60, r: 3, vx: 0, vy: 0, phase: 'gather', t: 0, boom: 0, combo, gather,
    mul, size: SPIRIT_R * (pure ? 1.2 : 1), gold: f.form === 'ssj' };
  const foe = foeOf(f);
  if (combo && foe.state === 'hurt') {
    foe.stun = Math.max(foe.stun, gather + 0.4);
    popups.push({ text: 'DAZED!', x: foe.x, y: foe.y - 58, t: 0, c: '#ffd36a' });
  }
  Voice.shout('goku', 'Everyone... lend me your energy!');
  popups.push({ text: 'SPIRIT BOMB!', x: f.x, y: Math.max(44, f.y - 118), t: 0, c: '#9ff' });
  sfx.charge(gather); shake(3);
}

function updateSpirit(dt) {
  const sb = game.spirit;
  if (!sb) return;
  sb.t += dt;
  const f = sb.owner, foe = foeOf(f);
  if (sb.phase === 'gather') {
    // hit (or knocked out of it any other way) before it's ready: it falls apart
    if (f.state !== 'spirit') {
      popups.push({ text: 'SPIRIT BOMB LOST!', x: f.x, y: f.y - 66, t: 0, c: '#ff8a6a' });
      sb.phase = 'fizzle'; sb.t = 0; return;
    }
    const k = Math.min(1, sb.t / sb.gather);
    sb.r = 3 + (sb.size - 3) * k;
    sb.x = f.x; sb.y = f.y - 58 * f.scale - sb.r;
    // energy streams in from all around
    if (Math.random() < dt * 40) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 60;
      kiMotes.push({ x: sb.x + Math.cos(a) * d, y: sb.y + Math.sin(a) * d * 0.6, vx: -Math.cos(a) * d * 1.6, vy: -Math.sin(a) * d * 0.96, t: 0, life: 0.6, c: sb.gold ? (Math.random() < 0.5 ? '#fff2a8' : '#ffd23a') : Math.random() < 0.5 ? '#c6f8ff' : '#48d8ff' });
    }
    if (f.t2 <= 0) {
      // throw it at them
      f.play('spiritThrow', 'spiritThrow'); f.t2 = 0.55;
      const tx = foe.x, ty = foe.y - 23 * foe.scale, d = Math.max(1, Math.hypot(tx - sb.x, ty - sb.y));
      const v = sb.combo ? SPIRIT_COMBO_SPEED : 175;
      sb.vx = (tx - sb.x) / d * v; sb.vy = (ty - sb.y) / d * v;
      sb.phase = 'fly'; sb.t = 0; sfx.whoosh(); shake(5);
      Voice.shout('goku', 'HAAAAA!');
    }
  } else if (sb.phase === 'fly') {
    sb.x += sb.vx * dt; sb.y += sb.vy * dt;
    const cx = foe.x, cy = foe.y - 23 * foe.scale;
    const direct = foe.visible && Math.hypot(cx - sb.x, cy - sb.y) < sb.r + 12;
    if (direct || sb.y + sb.r * 0.4 >= FLOOR || sb.x < -40 || sb.x > W + 40) {
      if (sb.x < -40 || sb.x > W + 40) { game.spirit = null; return; }
      sb.phase = 'boom'; sb.t = 0;
      game.flash = 1; shake(12); sfx.explode(); Stage.crack(sb.x, 2.5); Stage.cloud(sb.x, 3);
      const dir = sb.vx >= 0 ? 1 : -1;
      const opts = { token: 'spirit', otg: sb.combo };
      if (direct) damage(foe, f, SPIRIT_DMG * sb.mul, true, dir, 'ult', opts);
      // a near miss still catches them in the blast
      else if (foe.visible && Math.abs(foe.x - sb.x) < 46 && foe.y > FLOOR - 40) damage(foe, f, 15 * sb.mul, true, dir, 'ult', opts);
    }
  } else if (sb.t > (sb.phase === 'boom' ? 0.6 : 0.3)) game.spirit = null;
}

function drawSpirit() {
  const sb = game.spirit;
  if (!sb) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (sb.phase === 'boom') {
    // the explosion: its two rings, swelling and fading out
    const k = sb.t / 0.6;
    [[FX_ART.spiritRing1, 0.5 + k * 0.7], [FX_ART.spiritRing2, 0.3 + k * 1.1]].forEach(([a, sc]) => {
      const im = art(a), w = im.width * sc * 0.6, h = im.height * sc * 0.6;
      ctx.globalAlpha = Math.max(0, 1 - k); ctx.drawImage(im, sb.x - w / 2, sb.y - h / 2, w, h);
    });
  } else {
    const im = art(FX_ART.spiritBall), fade = sb.phase === 'fizzle' ? Math.max(0, 1 - sb.t / 0.3) : 1;
    const r = sb.r * (sb.phase === 'fizzle' ? 1 + sb.t * 2 : 1) * (1 + 0.04 * Math.sin(game.t * 25));
    const g = ctx.createRadialGradient(sb.x, sb.y, r * 0.5, sb.x, sb.y, r * 1.8);
    g.addColorStop(0, `rgba(120,230,255,${0.5 * fade})`); g.addColorStop(1, 'rgba(60,160,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sb.x, sb.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = fade; ctx.drawImage(im, sb.x - r, sb.y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function startUlt(f) {
  f.ki = 0; f.play('ult1'); f.t2 = 1.0; f.inv = 3; f.vx = 0;
  sfx.powerup(); shake(6); game.flash = 0.6;
  popups.push({ text: 'SUPER SAIYAN 3!', x: f.x, y: f.y - 70, t: 0, c: '#ffe04a' });
}

// ---------- per-fighter update ----------
function updateFighter(f, foe, dt) {
  f.at += dt;
  if (f.facing !== f.lastFacing) { if (f.lastFacing && f.free) f.turnT = 0.09; f.lastFacing = f.facing; }
  if (f.turnT > 0) f.turnT -= dt;
  if (f.inv > 0) f.inv -= dt;
  if (f.flash > 0) f.flash -= dt;
  if (f.free || f.state === 'block' || f.state === 'down') f.comboTaken = 0;
  f.sq -= f.sq * Math.min(1, dt * 12);
  if (f.state === 'block') f.blockT += dt;
  if (f.assistCd > 0) f.assistCd -= dt;
  // Goku's charge aura sheds motes that spiral inward, then snap upward like sparks in a gale.
  if (f.who === 'goku' && ['power', 'charge', 'transform', 'ult1', 'kameCharge'].includes(f.state)) {
    f.auraT = (f.auraT || 0) - dt;
    if (f.auraT <= 0) {
      f.auraT = f.state === 'transform' || f.state === 'ult1' ? 0.045 : 0.085;
      const ssj = f.form === 'ssj' || f.state === 'transform' || f.state === 'ult1';
      const a = Math.random() * Math.PI * 2, radius = 12 + Math.random() * 12;
      kiMotes.push({ x: f.x + Math.cos(a) * radius, y: f.y - 20 + Math.sin(a) * 12, vx: -Math.cos(a) * (12 + Math.random() * 10), vy: -(18 + Math.random() * 28), t: 0, life: 0.35 + Math.random() * 0.3, c: ssj ? (Math.random() < 0.5 ? '#fff0a0' : '#ffb832') : (Math.random() < 0.5 ? '#c6f8ff' : '#48b9ff') });
    }
  }
  // Cell regenerates while he charges ki
  if (f.who === 'cell' && f.state === 'charge') f.hp = Math.min(f.maxHp, f.hp + 3 * dt);
  // afterimages on fast moves, rocks lifting off the ring while powering up
  if ((['dash', 'ult2'].includes(f.state) || f.anim === 'rush') && f.visible && (f.trailT -= dt) <= 0) {
    f.trailT = 0.035; trails.push({ im: f.img, x: f.x, y: f.y - f.hover, facing: f.facing, scale: f.scale, t: 0 });
  }
  if (['power', 'charge', 'transform', 'evolve', 'ult1', 'kameCharge'].includes(f.state) && Math.random() < dt * 14) Stage.lift(f.x);
  if (['power', 'charge', 'transform', 'evolve', 'ult1'].includes(f.state) && f.y > FLOOR - 4 && Math.random() < dt * 30) Stage.wind(f.x);
  // hanging in the air is only for a beam fired from up there (or a cinematic pose): knocked out of
  // it by a hit, or out of it any other way, gravity takes over again instead of leaving them stuck
  if (f.floating && !['kameCharge', 'kameFire', 'pose', 'spirit', 'spiritThrow', 'powerDown'].includes(f.state)) f.floating = false;
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
    // (and so does the attacker mid air-string or air ki blast, so the two stay level)
    f.vy += GRAV * ((f.state === 'knock' && f.juggle > 0) || ['airAtk', 'cast'].includes(f.state) ? 0.7 : 1) * dt; f.y += f.vy * dt;
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
      if (f.animDone) { if (f.y < FLOOR - 1) f.play('fall', 'jump'); else f.play('idle'); }
      break;
    case 'hurt':
      if ((f.stun -= dt) <= 0) { if (f.y < FLOOR) f.play('fall', 'jump'); else f.play('idle'); }
      break;
    case 'knock':
      if (f.wallBounce && (f.x <= 17 || f.x >= W - 17)) {
        f.wallBounce = false; f.vx = -f.vx * 0.5; f.vy = -230; f.juggle = Math.max(0, f.juggle - 1);
        sparks.push({ x: f.x, y: f.y - 30, t: 0, c: '#ffffff' }); shake(6); sfx.smash();
        Stage.wallHit(f.x < W / 2 ? 2 : W - 2, f.y - 20);
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
        f.superDash = false;
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
    case 'barrier': if ((f.t2 -= dt) <= 0) { if (f.y < FLOOR - 1) f.play('fall', 'jump'); else f.play('idle'); } break;
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
    case 'powerDown':
      if (f.floating) { f.vx = f.vy = 0; f.y += (FLOOR - SPIRIT_HEIGHT - f.y) * Math.min(1, dt * 3); }
      if (f.animDone) {
        setForm(f, 'base'); f.play('idle');
        popups.push({ text: 'POWERED DOWN', x: f.x, y: Math.max(44, f.y - 66), t: 0, c: '#fff' });
        if (f.spiritNext) { const { combo } = f.spiritNext; f.spiritNext = null; spiritBomb(f, combo, true); }
      }
      break;
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
    // rising into the sky while it gathers; after the throw he drops back to the ring
    case 'spirit': f.t2 -= dt; f.vx = f.vy = 0; f.y += (FLOOR - SPIRIT_HEIGHT - f.y) * Math.min(1, dt * 3); break;
    case 'spiritThrow': if ((f.t2 -= dt) <= 0) { f.floating = false; f.play('fall', 'jump'); } break;
  }
}

// A lying sprite is much wider than a standing one, so push it in from the screen edge.
function keepOnScreen(f) {
  const im = f.img, s = f.scale;
  const back = (f.facing > 0 ? im.ax : im.width - im.ax) * s, front = (f.facing > 0 ? im.width - im.ax : im.ax) * s;
  f.x = clamp(f.x, Math.min(back, W / 2), Math.max(W - front, W / 2));
}

function powerDown(f) {
  f.play('powerDown', 'powerDown'); f.vx = 0; f.spiritNext = null;
  sfx.whoosh(); Stage.puff(f.x, 1); Stage.puff(f.x, -1);
}

// Super Saiyan in the air at full ki, O: he powers down right there in the sky, then raises his
// arms for the Spirit Bomb (a hit while the gold fades stops it, and he stays Super Saiyan)
function airSpirit(f, combo = false) {
  powerDown(f); f.vy = 0; f.floating = true; f.spiritNext = { combo };
  const foe = foeOf(f);
  if (combo && foe.state === 'hurt') foe.stun = Math.max(foe.stun, 0.5 + SPIRIT_COMBO_GATHER + 0.4);
  Voice.shout('goku', "This isn't a job for a Super Saiyan...");
}

function finishTransform(f) {
  setForm(f, 'ssj'); f.play('idle'); Stage.cloud(f.x, 1.6);
  Audio8.music.switchTo('ssj');
  game.flash = 1; shake(8); sfx.explode();
}

// Put a fighter back on the floor, visible and standing, when a cutscene or the KO takes over
// (otherwise they can be left mid-air, invisible mid-teleport or half-way through a move).
function settle(f) {
  if (f.state === 'transform') finishTransform(f);
  if (f.state === 'evolve') { f.t2 = 0; updateFighter(f, foeOf(f), 0); }
  if (f === player && f.state === 'kameCharge') f.ki = Math.min(100, f.ki + (f.kiPaid || 50));
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
  if (f.state === 'knock') { f.juggle = 0; Stage.crack(f.x, 1); f.play('down'); f.t2 = f.hp > 0 ? 0.7 : 99; f.vx = 0; shake(4); sfx.smash(); }
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
// Cell's Death Beam (every form): toward + U, so it stays reachable now that U is his Kamehameha
// (with under 50 ki, U alone fires it too)
const deathBeamFirst = g => g.who === 'cell' && g.ki >= 20
  && ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) === g.facing;
function cancel(g, foe, dashDir) {
  const isGoku = g.who === 'goku';
  if (g.A().hit && g.A().hit.launch && act('jump')) {
    // chase them into the air
    g.play('jump'); g.sq = -0.14; g.vy = JUMP_V - 70; g.vx = g.facing * 90; sfx.whoosh(); return true;
  }
  if (dashDir) { dash(g, dashDir); return true; }
  if (!isGoku && g.form === 'perfect' && g.ki >= 100 && act('ult')) { solarKame(g); return true; }
  if (isGoku && g.form === 'base' && g.ki >= 100 && act('ult')) { spiritBomb(g, true); return true; }
  if (!isGoku && g.form === 'perfect' && g.ki >= 35 && g.assistCd <= 0 && act('junior')) { g.ki -= 35; g.assistCd = 3; callJunior(g); return true; }
  if (g.ki >= 15 && act('vanish')) { g.ki -= 15; teleport(g, foe); return true; }
  if (!isGoku && g.ki >= CANNON_KI && act('cannon')) { g.ki -= CANNON_KI; specialBeamCannon(g); return true; }
  if (act('ki')) {
    if (isGoku && g.ki >= 8) { g.ki -= 8; cast(g, 'kiCast'); return true; }
    if (!isGoku && g.ki >= 8) { g.ki -= 8; cast(g, 'finger'); return true; }
  }
  if (act('beam')) {
    if (deathBeamFirst(g)) { g.ki -= 20; cast(g, 'death'); return true; }
    if (canKame(g) && g.ki >= 50) { g.ki -= 50; startKame(g, false, false, true); return true; }
    if (!isGoku && g.ki >= 20) { g.ki -= 20; cast(g, 'death'); return true; }
  }
  return false;
}

// After an air hit (or an air ki blast) lands: vanish, air-dash in to restart the string, the
// full-ki finisher, a beam or another ki blast.
function airCancel(g, foe, dashDir) {
  const isGoku = g.who === 'goku';
  if (g.ki >= 15 && act('vanish')) { g.ki -= 15; teleport(g, foe); return true; }
  if (dashDir && !g.airDashed) { dash(g, dashDir); return true; }
  if (!isGoku && g.form === 'perfect' && g.ki >= 100 && act('ult')) { solarKame(g); return true; }
  if (isGoku && g.form === 'base' && g.ki >= 100 && act('ult')) { spiritBomb(g, true); return true; }
  if (isGoku && g.form === 'ssj' && g.ki >= 100 && act('ult')) { if (keys.block) spiritBomb(g, true); else airSpirit(g, true); return true; }
  if (act('beam')) {
    if (deathBeamFirst(g)) { g.ki -= 20; cast(g, 'death'); return true; }
    if (g.ki >= 50 && canKame(g)) { g.ki -= 50; startKame(g, false, false, true); return true; }
    if (!isGoku && g.ki >= 20) { g.ki -= 20; cast(g, 'death'); return true; }
  }
  if (g.ki >= 8 && act('ki')) { g.ki -= 8; cast(g, isGoku ? 'kiCast' : 'finger'); return true; }
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
  // Cell's Barrier works out of most states, even while he's being hit
  if (!isGoku && g.ki >= 30 && ['idle', 'walk', 'block', 'hurt', 'jump', 'land'].includes(g.state) && act('barrier')) return barrier(g);
  // Instant Kamehameha (SSJ Goku, full ki), in either order: vanish (Q) and press U while he's gone,
  // or start a Kamehameha (U) and vanish (Q) while it charges. U on its own is always the regular one.
  if (isGoku && g.form === 'ssj') {
    if (g.state === 'tele' && g.ki >= 100 - 15 && act('beam')) return instantKame(g);
    if (g.state === 'kameCharge' && !g.big && g.ki >= 100 - 50 && act('vanish')) return instantKame(g);
  }
  // Counter beam: while their Kamehameha charges or fires, answer with yours, even out of a guard
  // or while it's burning you, and the two meet in a beam clash
  if (['kameCharge', 'kameFire'].includes(foe.state) && canKame(g) && g.ki >= COUNTER_KI
      && ['idle', 'walk', 'block', 'hurt', 'land', 'charge'].includes(g.state) && act('beam')) {
    g.ki -= COUNTER_KI; g.facing = foe.x > g.x ? 1 : -1;
    popups.push({ text: 'COUNTER BEAM!', x: g.x, y: g.y - 58, t: 0, c: '#9ff' });
    startKame(g, true); g.kiPaid = COUNTER_KI; return;
  }
  if (g.free) {
    g.facing = foe.x > g.x ? 1 : -1;
    const toward = dir === g.facing;
    if (keys.block && !g.guardBroken) { g.play('block'); g.blockT = 0; g.vx = 0; return; }
    if (keys.charge) {
      if (g.state !== 'charge') { g.play('charge'); sfx.chargeLoop(g); }
      g.vx = 0; return;
    }
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
      if (isGoku && toward && g.ki >= 15) { g.ki -= 15; return cast(g, 'barrage'); }
      if (isGoku && g.ki >= 8) { g.ki -= 8; return cast(g, 'kiCast'); }
      if (!isGoku && toward && g.form !== 'imperfect' && g.ki >= 15) { g.ki -= 15; return cast(g, 'barrage'); }
      if (!isGoku && g.ki >= 8) { g.ki -= 8; return cast(g, 'finger'); }
    }
    if (g.ki >= 15 && act('vanish')) { g.ki -= 15; return teleport(g, foe); }
    if (!isGoku && g.form === 'perfect' && g.ki >= 35 && g.assistCd <= 0 && act('junior')) { g.ki -= 35; g.assistCd = 3; return callJunior(g); }
    if (!isGoku && g.ki >= CANNON_KI && act('cannon')) { g.ki -= CANNON_KI; return specialBeamCannon(g); }
    // T as a Super Saiyan powers back down to base (keeping his ki, e.g. for a Spirit Bomb)
    if (isGoku && g.form === 'ssj' && act('transform')) return powerDown(g);
    if (g.ki >= 100 && act('transform')) {
      if (isGoku && g.form === 'base') {
        // the first time is the full cinematic; going back up after powering down is quick
        g.ki = 50;
        if (game.wentSsj) { g.play('transform', 'transform'); g.vx = 0; sfx.powerup(); shake(5); return; }
        game.wentSsj = true; superSaiyan(g); return;
      }
      if (!isGoku && g.form !== 'perfect') {
        Voice.shout('cell', g.form === 'imperfect' ? 'Evolve!' : 'Perfection!');
        g.ki = 50; g.play('charge', 'evolve'); g.t2 = 1.2; g.inv = 1.4; g.vx = 0; sfx.powerup(); shake(5); return;
      }
    }
    if (act('beam')) {
      if (deathBeamFirst(g)) { g.ki -= 20; return cast(g, 'death'); }
      if (canKame(g) && g.ki >= 50) { g.ki -= 50; return startKame(g); }
      if (!isGoku && g.ki >= 20) { g.ki -= 20; return cast(g, 'death'); }
    }
    if (g.ki >= 100 && act('ult')) {
      if (isGoku && g.form === 'ssj') return startUlt(g);
      if (isGoku && g.form === 'base') return spiritBomb(g);
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
    const airBeam = canKame(g);
    if (!isGoku && g.form === 'perfect' && g.ki >= 100 && act('ult')) return solarKame(g);
    if (airBeam && g.ki >= 50 && act('beam')) { g.ki -= 50; return startKame(g); }
    if (g.ki >= 8 && act('ki')) { g.ki -= 8; return cast(g, isGoku ? 'kiCast' : 'finger'); }
    if (isGoku && g.form === 'base' && g.ki >= 100 && act('ult')) return spiritBomb(g);
    // Super Saiyan: O powers down mid-air into the Spirit Bomb; S + O keeps the gold hair
    if (isGoku && g.form === 'ssj' && g.ki >= 100 && act('ult')) return keys.block ? spiritBomb(g) : airSpirit(g);
    if (act('punch') || act('kick')) g.play('air', 'airAtk');
  } else if (g.state === 'airAtk') {
    // after an air hit lands: vanish, air-dash to restart the string, or finish with a beam / ki blast
    if (g.hitLanded) {
      if (airCancel(g, foe, dashDir)) return;
    }
    if (AIR_CHAIN[g.anim] && (act('punch') || act('kick'))) g.next = AIR_CHAIN[g.anim];
  } else if (g.state === 'cast' && g.hitLanded) {
    // the ki blast hit: J rushes in after it (an air hit in the air), or cancel like a landed punch
    if (g.y < FLOOR - 1) { if (!airCancel(g, foe, dashDir) && (act('punch') || act('kick'))) g.play('air', 'airAtk'); }
    else if (!cancel(g, foe, dashDir)) {
      if (act('punch')) { g.facing = foe.x > g.x ? 1 : -1; startAttack(g, 'rush'); }
      else if (act('kick')) { g.facing = foe.x > g.x ? 1 : -1; startAttack(g, 'slash'); }
    }
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
    else g.ki = Math.min(100, g.ki + 32 * dt);
  }
}

// ---------- boss AI ----------
// The boss reads what the player does: it punishes charging, whiffs and broken guards, deals
// with a Kamehameha, anti-airs jump-ins and, from phase two on, vanishes out of trouble.
const ai = { think: 0.8, vanishCd: 3, ultCd: 6, spam: 0, barrierCd: 5, assistCd: 6, cannonCd: 6, rolled: 0 }; // spam: how hard the player is spamming ki blasts
const AI_REACT = [0.42, 0.3, 0.2]; // seconds between decisions in each phase

// blink out (leaving an afterimage), reappear behind the player and attack straight away
function vanish(c, foe) {
  ai.vanishCd = 2.4 - game.phase * 0.5;
  trails.push({ im: c.img, x: c.x, y: c.y, facing: c.facing, scale: c.scale, t: 0 });
  teleport(c, foe); c.t2 = 0.18; c.counter = true;
}

// Super Dash: a flying charge straight at the player that swats ki blasts aside on the way in
function superDash(c) {
  c.facing = player.x > c.x ? 1 : -1;
  c.play('dash'); c.superDash = true; c.t2 = clamp((Math.abs(player.x - c.x) - 30) / 340, 0.12, 0.5);
  c.vx = c.facing * 340 * c.speed; ai.think = 0;
  Stage.puff(c.x, c.facing); sfx.whoosh();
}

// shots it reacts to, per phase (more often the more the player spams them)
const SHOT_REACT = [0.6, 0.75, 0.9];

function bossAI(dt) {
  const c = boss, g = player, ph = game.phase, isCell = c.who === 'cell';
  game.kameCd -= dt; ai.cannonCd -= dt; ai.vanishCd -= dt; ai.ultCd -= dt; ai.barrierCd -= dt; ai.assistCd -= dt;
  ai.spam = Math.max(0, ai.spam - dt * 0.6);
  // Cell bursts out of a long combo with his Barrier (one roll per hit taken)
  if (isCell && c.state === 'hurt' && c.comboTaken >= 3 && c.comboTaken !== ai.rolled) {
    ai.rolled = c.comboTaken;
    if (ai.barrierCd <= 0 && Math.random() < 0.2 + ph * 0.15) { ai.barrierCd = rand(7, 10); c.ki = Math.max(c.ki, 30); return barrier(c); }
  }
  // ki blasts on the way: vanish, Super Dash through them, jump over or block
  for (const p of projs) {
    if (p.owner !== g || p.seen) continue;
    const gap = (c.x - p.x) * Math.sign(p.vx), eta = gap / Math.abs(p.vx);
    if (gap < 0 || eta > 0.38) continue;
    p.seen = true;
    if (!c.free || Math.random() > SHOT_REACT[ph] + ai.spam * 0.05) continue;
    const dist = Math.abs(g.x - c.x), r = Math.random();
    c.facing = g.x > c.x ? 1 : -1;
    if (ph >= 1 && ai.vanishCd <= 0 && r < 0.2) return vanish(c, g);
    if (dist > 70 && (ai.spam >= 2 || r < 0.45)) return superDash(c);
    if (dist > 90 && r < 0.7) { c.play('jump'); c.vy = JUMP_V; c.vx = c.facing * 170; return; }
    c.play('block'); c.t2 = eta + 0.2; c.vx = 0; return;
  }
  // jumped over a shot (or in): come down with an air attack
  if (c.state === 'jump' && c.vy > 0 && Math.abs(g.x - c.x) < 40 && g.y - c.y < 40) { c.facing = g.x > c.x ? 1 : -1; return c.play('air', 'airAtk'); }
  if (!c.free) return;
  c.facing = g.x > c.x ? 1 : -1;
  if (c.state === 'walk') c.vx = (c.anim === 'back' ? -1 : 1) * c.facing * 75 * c.speed;
  // reflex, not a decision: against ki blast spam it acts the moment it's free. Up close a jab beats
  // the next blast's startup (a counter hit); further out it Super Dashes in through them.
  if (ai.spam >= 1.5 && g.state === 'cast' && g.y >= FLOOR - 4) {
    const d = Math.abs(g.x - c.x);
    if (d < 46) { c.queue = isCell ? ['p2', 'k2'] : ['p2', 'p3', 'k3']; ai.think = 0.6; return startAttack(c, 'p1'); }
    if (d < 220) return superDash(c);
  }
  if ((ai.think -= dt) > 0) return;
  ai.think = rand(0.8, 1.2) * AI_REACT[ph] / c.speed;
  const dist = Math.abs(g.x - c.x), close = dist < 48, r = Math.random();
  const dashIn = () => { c.superDash = false; c.play('dash'); c.t2 = 0.24; c.vx = c.facing * 280 * c.speed; Stage.puff(c.x, c.facing); };
  const combo = () => {
    const list = isCell
      ? [['p2', 'k2'], ['p1', 'p2', 'k2'], ['k1', 'k2'], ['p1', 'k1'], ['p1', 'p2', 'k1', 'k2']]
      : [['p1', 'p2', 'p3', 'p4'], ['p1', 'k1', 'k2', 'k3'], ['k1', 'k2', 'p3'], ['p1', 'p2', 'k3'], ['rush', 'p2', 'p3']];
    c.queue = pick(list).slice(0, ph + 2);
    startAttack(c, c.queue.shift()); ai.think = rand(0.5, 0.9) / c.speed;
  };
  const shoot = () => cast(c, isCell ? 'finger' : 'kiCast');
  const bigShot = () => isCell ? cast(c, c.form === 'imperfect' || r < 0.5 ? 'death' : 'barrage') : cast(c, Math.random() < 0.6 ? 'barrage' : 'kiCast');
  const canBeam = canKame(c);
  const canVanish = ph >= 1 && ai.vanishCd <= 0;
  // from range, Cell sometimes fires the Special Beam Cannon (most of all at a turtling player)
  if (isCell && c.form !== 'junior' && ai.cannonCd <= 0 && dist > 70 && r < (g.state === 'block' ? 0.5 : 0.12)) {
    ai.cannonCd = rand(6, 10); return specialBeamCannon(c);
  }

  // Goku's finishers once he's all out: Instant Kamehameha on a weakened enemy, or the Dragon Fist
  if (!isCell && ph >= 2 && ai.ultCd <= 0 && g.hp < g.maxHp * 0.35 && r < 0.35) { ai.ultCd = rand(16, 20); return instantKame(c); }
  if (!isCell && ph >= 2 && ai.ultCd <= 0 && dist < 170 && r < 0.3) { ai.ultCd = rand(12, 16); return startUlt(c); }
  // Perfect Cell calls in a Cell Junior from range
  if (isCell && c.form === 'perfect' && ai.assistCd <= 0 && dist > 50 && r < 0.3) { ai.assistCd = rand(7, 11); return callJunior(c); }
  // Perfect Cell's finisher: the Solar Kamehameha from the sky
  if (isCell && c.form === 'perfect' && ai.ultCd <= 0 && g.hp < g.maxHp * 0.35 && r < 0.35) { ai.ultCd = rand(16, 20); return solarKame(c); }
  // the player is charging ki: never let that happen for free
  // the Spirit Bomb: stop him while it gathers, get out of its way once it's thrown
  if (game.spirit && game.spirit.owner === g) {
    // a ki blast is the quickest way to reach him from range (more and more likely the further into
    // the fight); otherwise he braces behind his guard, which a Spirit Bomb goes straight through
    if (game.spirit.phase === 'gather') {
      if (close) return combo();
      if (r < 0.2 + 0.06 * ph) return shoot();
      c.play('block'); c.t2 = 0.5; c.vx = 0; return;
    }
    if (game.spirit.phase === 'fly') { if (canVanish && r < 0.5) return vanish(c, g); return dash(c, -c.facing); }
  }
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
    if (canBeam && game.kameCd <= 0) { game.kameCd = rand(7, 11); return startKame(c, true); }
    if (canVanish) return vanish(c, g);
    c.play('block'); c.t2 = 0.6; return;
  }
  // jumping in: kick them out of the air, or shoot them on the way down
  if (g.y < FLOOR - 20 && g.vy > 0 && dist < 70) return close ? startAttack(c, isCell ? 'k2' : 'k3') : shoot();
  // openings: whiffed attack, landing, ki blast recovery, broken guard
  const open = g.guardBroken || ['land', 'cast', 'transform', 'evolve'].includes(g.state) || (g.state === 'attack' && g.hitDone && dist > 40);
  // shooting from far away gets Super Dashed once they've been at it a while
  if (open) return close ? combo() : dist < 150 ? dashIn() : g.state === 'cast' && ai.spam >= 1 ? superDash(c) : shoot();
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
  if (canBeam && game.kameCd <= 0 && r < 0.25 + 0.08 * ph) { game.kameCd = rand(7, 11); return startKame(c); }
  if (r < 0.28) return shoot();
  if (ph >= 1 && r < 0.45) return bigShot();
  if (canVanish && r < 0.58) return vanish(c, g);
  if (isCell && ph < 2 && r < 0.68) { c.play('taunt', 'pose'); c.t2 = 0.8; return; }
  c.play('walk');
}

// ---------- projectiles & beams ----------
// where a projectile's front is: a long beam (with an origin) is drawn from p.x forward
const tipX = p => p.ox != null ? p.x + p.dir * art(FX_ART[p.kind]).width * p.owner.scale : p.x;
function updateProjectiles(dt) {
  for (const p of projs) {
    p.x += p.vx * dt;
    const foe = foeOf(p.owner), full = art(FX_ART[p.kind]).width * p.owner.scale, b = foe.box();
    // a long beam (one with an origin) only hits with its tip
    const len = p.ox != null ? 24 : full, base = p.ox != null ? p.x + p.dir * (full - len) : p.x;
    const x0 = p.dir > 0 ? base : base - len, x1 = p.dir > 0 ? base + len : base;
    if (x1 > b.x0 && x0 < b.x1 && p.y > b.y0 && p.y < b.y1 && foe.visible) {
      const hit = damage(foe, p.owner, p.dmg, p.heavy, p.dir, 'proj', { token: p.kind, pierce: p.kind === 'cannon' });
      if (hit) p.dead = true;
      // a ki blast that connects can be cancelled like a landed punch
      if (hit && hit !== 'deflect' && p.owner.state === 'cast') p.owner.hitLanded = true;
    }
    for (const q of projs) if (q !== p && q.owner !== p.owner && Math.abs(tipX(q) - tipX(p)) < 14 && Math.abs(q.y - p.y) < 14) {
      // the Special Beam Cannon drills straight through ki blasts
      if (q.kind !== 'cannon') q.dead = true;
      if (p.kind !== 'cannon') p.dead = true;
      sparks.push({ x: p.x, y: p.y, t: 0, c: '#ffffff' }); sfx.kiHit();
    }
    // gone once it has left the screen; a long beam starts behind the hand, so only count the side it flies to
    if (p.ox != null ? (p.dir > 0 ? p.x > W + 60 : p.x < -60) : (p.x < -60 || p.x > W + 60)) {
      p.dead = true;
      const big = ['cannon', 'death'].includes(p.kind);
      if (big || (game.farT || 0) <= game.t) { game.farT = game.t + 1.2; Stage.farBlast(p.dir > 0 ? W - 30 - Math.random() * 30 : 30 + Math.random() * 30, big ? 1 : 0.45); if (big) sfx.explode(); }
    }
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
    // a beam low over the ring tears it up underneath and leaves a burnt trench; one that flies off
    // the screen hits the mountains on the horizon
    const tipX = b.x0 + b.dir * b.len * cos;
    if (Math.abs(sin) < 0.3 && b.y > FLOOR - 40) {
      Stage.wake(b.x0 + b.dir * 10, tipX, dt, b.big ? 1.6 : 1);
      // the trench burns in once the beam reaches as far as it goes
      if (!b.scorched && b.len >= maxLen - 1) { b.scorched = true; Stage.scorch(b.x0 + b.dir * 12, tipX, b.big ? 1.5 : 1); }
    }
    if (!clash && !b.farBlast && Math.abs(sin) < 0.5 && b.len >= edge - 1) { b.farBlast = true; Stage.farBlast(tipX < W / 2 ? 40 : W - 40, b.big ? 1.6 : 1.1); sfx.explode(); }
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
  // two beams meeting head-on = beam struggle; the player mashes J (or U) to push
  const pb = beams.find(b => b.owner === player), bb = beams.find(b => b.owner === boss);
  if (pb && bb && !clash && beamsMeet(pb, bb)) startClash(pb, bb);
  if (clash) {
    const { pb: P, bb: B } = clash;
    // the struggle is along the line between the two hands: s is how far the meeting point has
    // been pushed from the player's hands towards the boss's
    const D = Math.max(1, Math.hypot(B.x0 - P.x0, B.y - P.y));
    // each press pushes; the enemy pushes back steadily, with surges, so holding needs about
    // 5-6 presses a second and winning a few seconds of real mashing (a giant beam pushes harder)
    clash.t = (clash.t || 0) + dt;
    if (tap('punch') || tap('beam')) { clash.s += 0.03; clash.pulse = 1; }
    const surge = 1 + 0.45 * Math.max(0, Math.sin(clash.t * 2.3)) * Math.sin(clash.t * 0.9 + 1);
    // and they tire as it drags on, so steady mashing always gets there in the end
    const tire = Math.max(0.75, 1 - clash.t * 0.04);
    clash.s -= (B.big ? 0.18 : 0.15) * surge * tire * dt;
    clash.pulse = Math.max(0, (clash.pulse || 0) - dt * 6);
    P.len = clash.s * D; B.len = (1 - clash.s) * D;
    game.shake = Math.max(game.shake, 3); // steady rumble while the beams push
    { const mx = P.x0 + (B.x0 - P.x0) * clash.s; Stage.wake(mx - 16, mx + 16, dt, 1.4); if (Math.random() < dt * 10) Stage.lift(mx); if (!clash.cracked) { clash.cracked = true; Stage.crack(mx, 1.2); } }
    if (Math.random() < dt * 8) sfx.clash();
    // a clash can't last forever: after 14 seconds whoever is ahead breaks through
    const late = clash.t > 14;
    const won = clash.s > 0.88 || (late && clash.s >= 0.5), lost = clash.s < 0.12 || (late && clash.s < 0.5);
    if (won || lost) {
      const [winner, loser] = won ? [player, boss] : [boss, player];
      clash = null; game.banner = null;
      lastPress.punch = lastPress.beam = -99;
      beams = beams.filter(b => b.owner === winner);
      winner.t2 = 0.4; loser.floating = false; loser.inv = 0;
      if (loser.hp > 0) loser.play('idle');
      blastAway(loser, winner, 38);
      game.flash = 0.8; sfx.explode();
      popups.push({ text: won ? 'CLASH WON!' : 'OVERPOWERED!', x: winner.x, y: winner.y - 60, t: 0, c: won ? '#ffe04a' : '#ff8a6a' });
    }
  }
}

// Two beams meet when they point at each other (straight across, or one down from the sky and
// one up from the ring) and their tips have crossed.
function beamsMeet(p, b) {
  const up = (x) => [x.dir * Math.cos(x.ang), Math.sin(x.ang)];
  const [px, py] = up(p), [bx, by] = up(b);
  if (px * bx + py * by > -0.6) return false;
  const dx = b.x0 - p.x0, dy = b.y - p.y, D = Math.hypot(dx, dy);
  // either one's hands must lie close to the line of the other's beam
  if (Math.abs(dx * py - dy * px) > 18 && Math.abs(dx * by - dy * bx) > 18) return false;
  return p.len + b.len >= D;
}

// Lock two beams into a struggle: each one re-aims straight at the other's hands and they meet
// halfway, whatever angle they were fired at.
function startClash(pb, bb) {
  const aim = (b, tx, ty) => {
    const dx = tx - b.x0, dy = ty - b.y;
    if (Math.abs(dx) > 1) b.dir = Math.sign(dx);
    b.ang = Math.atan2(dy, Math.max(1, Math.abs(dx)));
  };
  aim(pb, bb.x0, bb.y); aim(bb, pb.x0, pb.y);
  // nobody is untouchable in a clash: whoever loses it takes the hit
  pb.owner.inv = bb.owner.inv = 0;
  clash = { s: 0.5, pb, bb, pulse: 0 };
  game.banner = { text: 'MASH  J !', t: 0, dur: 99 };
  popups.push({ text: 'BEAM CLASH!', x: (pb.x0 + bb.x0) / 2, y: Math.min(pb.y, bb.y) - 20, t: 0, c: '#9ff' });
  game.flash = Math.max(game.flash, 0.5); shake(8); sfx.explode();
}

// Big blast that throws someone across the ring. In a fight it's a normal heavy hit; inside a
// cinematic (where damage() is switched off) the damage and the knock are applied directly.
function blastAway(f, src, dmg) {
  if (game.mode === 'fight') return damage(f, src, dmg, true, src.facing, 'beam');
  f.hp = Math.max(game.training ? 1 : 0, f.hp - dmg);
  f.floating = false; f.play('knock'); f.vy = -260; f.vx = (f.x > src.x ? 1 : -1) * 180; f.y -= 1;
  Stage.crack(f.x, 1.5);
  return true;
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
  // in a clash the beam runs right up to the meeting point and the clash ball covers its end
  const clashing = clash && (b === clash.pb || b === clash.bb);
  const headX = clashing ? L : Math.max(Math.min(sw, L) - hw * 0.3, L - hw * 0.7);
  if (headX > sw) ctx.drawImage(P.body, 0, 0, P.body.width, P.body.height, sw - 2, -bh / 2 - wob, headX - sw + 6, bh + wob * 2);
  const cut = Math.min(sw, L);
  ctx.drawImage(P.start, 0, 0, cut / s, P.start.height, 0, -sh / 2, cut, sh);
  if (!clashing) ctx.drawImage(P.head, headX, -hh / 2 - wob, hw, hh + wob * 2);
  ctx.restore();
}

// The reaction window around the player: a ring closing in on them. It turns gold for the last
// moment, when a vanish is a perfect dodge.
function drawReactRing(r) {
  const f = r.def, left = r.dur - r.t, perfect = left <= REACT_PERFECT;
  const k = Math.max(0, (left - REACT_PERFECT) / (r.dur - REACT_PERFECT));
  const cx = f.x, cy = f.y - 24 * f.scale, rad = 14 + 46 * k;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = perfect ? '#ffe04a' : '#ffffff'; ctx.lineWidth = perfect ? 2.5 : 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
  // the target the ring closes onto
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffe04a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawReactPrompt(r) {
  const f = r.def, flash = Math.floor(game.t * 8) % 2;
  text('ANSWER IT!', W / 2, 92, 14, flash ? '#ffe04a' : '#ffffff', 'center');
  const opts = [
    ['U  COUNTER BEAM', canKame(f) && f.ki >= COUNTER_KI],
    ['Q  VANISH', f.ki >= 15],
    ['S  BLOCK', true],
  ];
  opts.forEach(([label, ok], i) => text(label, W / 2 + (i - 1) * 92, 108, 8, ok ? '#ffffff' : '#777777', 'center'));
  if (!canKame(f)) text('(COUNTER BEAM NEEDS SUPER SAIYAN)', W / 2, 120, 6, '#aaaaaa', 'center');
}

// The Senzu Bean, tossed in a high arc from the edge of the ring
function drawBean(b) {
  const k = Math.min(1, b.t / b.dur), x = b.x0 + (b.x1 - b.x0) * k, y = b.y0 + (b.y1 - b.y0) * k - Math.sin(k * Math.PI) * 30;
  ctx.save(); ctx.translate(x, y); ctx.rotate(b.t * 12);
  ctx.fillStyle = '#2f7d1e'; ctx.beginPath(); ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fd85a'; ctx.beginPath(); ctx.ellipse(-0.6, -0.5, 1.6, 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Where two beams meet: a ball of energy that swells with every press, throwing off sparks.
function drawClashBall() {
  const { pb, bb, s: k } = clash;
  const x = pb.x0 + (bb.x0 - pb.x0) * k, y = pb.y + (bb.y - pb.y) * k;
  const r = (bb.big ? 15 : 12) + 3 * (clash.pulse || 0) + 1.5 * Math.sin(game.t * 40);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(160,230,255,0.7)'); g.addColorStop(1, 'rgba(60,140,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
  // crackling rays
  ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const a = game.t * 9 + i * 0.9 + Math.sin(game.t * 23 + i) * 0.6, l = r * (1.3 + 0.9 * Math.abs(Math.sin(game.t * 17 + i * 2)));
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(game.t * 31 + i));
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.restore();
  FX.kiGlow(ctx, x, y, r * 0.75, game.t);
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

// ---------- answering a cinematic finisher ----------
// The Solar and Instant Kamehamehas play as cinematics, but whoever is on the receiving end gets a
// short window to answer before the beam fires:
//   U  counter beam (30 ki): both beams fire and meet in a beam clash
//   Q  vanish (15 ki): in the last moment (the ring turns gold) it's a clean dodge that leaves the
//      attacker wide open; too early and the beam still grazes you
//   S  block: you take half and your guard breaks
// Doing nothing takes the full hit. The boss answers too, more often the further into the fight.
const REACT_PERFECT = 0.35;
function reactWindow(def, dur) {
  const r = { def, t: 0, dur, answer: null, at: 0 };
  if (def !== player) {
    const ph = game.phase, x = Math.random();
    r.ai = x < 0.2 + 0.1 * ph && canKame(def) ? 'beam' : x < 0.5 + 0.1 * ph ? 'vanish' : x < 0.85 ? 'block' : null;
    r.aiAt = r.ai === 'vanish' ? dur - (Math.random() < 0.3 + 0.2 * ph ? 0.2 : 0.75) : rand(0.15, dur * 0.6);
  }
  game.react = r;
  return wait(dur, true).then(() => { game.react = null; return r; });
}

function updateReact(raw) {
  const r = game.react;
  if (!r) return;
  r.t += raw;
  if (r.answer) return;
  const d = r.def, isP = d === player;
  let a = null;
  if (isP) {
    if (tap('beam') && canKame(d) && d.ki >= COUNTER_KI) a = 'beam';
    else if (tap('vanish') && d.ki >= 15) a = 'vanish';
    else if (keys.block && r.t > 0.2) a = 'block';
  } else if (r.ai && r.t >= r.aiAt) a = r.ai;
  if (!a) return;
  r.answer = a; r.at = r.t;
  if (a === 'beam') {
    if (isP) d.ki -= COUNTER_KI;
    d.play('kameCharge', 'pose'); sfx.charge(Math.max(0.2, r.dur - r.t));
    popups.push({ text: 'COUNTER BEAM!', x: d.x, y: d.y - 58, t: 0, c: '#9ff' });
  } else if (a === 'vanish') {
    if (isP) d.ki -= 15;
    ghosts.push({ img: teleArt(d), x: d.x, y: d.y, t: 0 }); sfx.teleport();
    d.visible = false;
  } else d.play('block', 'pose');
}

// The finisher's beam, after the window. f fires at foe; knock throws foe on a clean hit.
async function cinematicBeam(f, foe, r, dmg, knock, title) {
  const a = r.answer;
  if (a === 'beam') {
    f.big = true; fireKame(f); foe.big = false; fireKame(foe);
    f.t2 = foe.t2 = 99;
    startClash(beams.find(b => b.owner === player), beams.find(b => b.owner === boss));
    while (clash) await wait(0.05, true);
    await wait(0.8, true);
    return;
  }
  f.big = true; fireKame(f); f.t2 = 1.3;
  game.banner = { text: title, t: 0, dur: 1.4 };
  game.flash = 1; shake(12); sfx.explode();
  if (a === 'vanish') {
    const perfect = r.dur - r.at <= REACT_PERFECT;
    await wait(0.12, true);
    // reappear behind the attacker, out of the beam's way
    const x = clamp(f.x - f.facing * 30, 20, W - 20);
    Object.assign(foe, { x, y: FLOOR, visible: true, floating: false, vx: 0, vy: 0, facing: f.x > x ? 1 : -1 });
    ghosts.push({ img: teleArt(foe), x, y: FLOOR, t: 0 }); sfx.teleport();
    if (perfect) {
      foe.play('idle', 'pose'); f.inv = 0;
      if (foe === player) foe.ki = Math.min(100, foe.ki + 20);
      popups.push({ text: 'PERFECT DODGE!', x, y: FLOOR - 60, t: 0, c: '#ffe04a' });
      sfx.parry(); game.slow = 0.4;
      await wait(0.35, true);
      game.slow = 1;
      return; // the attacker is still firing the other way: punish them
    }
    foe.hp = Math.max(game.training ? 1 : 0, foe.hp - dmg / 3);
    if (foe.hp <= 0) knock(); else foe.play('hurt', 'pose');
    popups.push({ text: 'TOO EARLY - GRAZED!', x, y: FLOOR - 60, t: 0, c: '#ff8a6a' });
    await wait(0.9, true);
    if (f.state === 'kameFire') f.t2 = Math.min(f.t2, 0.01); // already paid for it: the beam is done
    return;
  }
  if (a === 'block') {
    foe.hp = Math.max(game.training ? 1 : 0, foe.hp - dmg / 2);
    if (foe.hp <= 0) { knock(); await wait(1.2, true); return; }
    Object.assign(foe, { stamina: 0, guardBroken: true, staminaDelay: 0.8, vx: f.facing * 60 });
    popups.push({ text: 'GUARD BREAK!', x: foe.x, y: foe.y - 58, t: 0, c: '#ff7a5a' });
    sfx.guardBreak();
    await wait(1.2, true);
    if (f.state === 'kameFire') f.t2 = Math.min(f.t2, 0.01); // already paid for it: the beam is done
    return;
  }
  foe.hp = Math.max(game.training ? 1 : 0, foe.hp - dmg);
  knock();
  await wait(1.4, true);
}

// back to the fight after a finisher: nobody stays frozen in a cinematic pose
function endCinematic(f, foe) {
  for (const x of [f, foe]) if (x.state === 'pose') x.play('idle');
  foe.visible = true;
  f.inv = Math.max(f.inv > 50 ? 0 : f.inv, 0.3); cam.focus = null; game.banner = null;
  // only hand back the fight this cinematic took (never over a KO or another cutscene)
  if (game.mode === 'cut') game.mode = 'fight';
}

// Instant Kamehameha: charge it floating in the air, vanish, reappear right behind the enemy and
// fire point-blank. The enemy gets a moment to answer (see reactWindow); unanswered it deals 60
// and launches them.
async function instantKame(f) {
  const foe = foeOf(f);
  f.ki = 0;
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  settle(foe);
  Object.assign(f, { vx: 0, vy: 0, visible: true, inv: 99, floating: true });
  f.y = Math.min(f.y, FLOOR - 40);
  f.facing = foe.x > f.x ? 1 : -1;
  f.play('kameCharge', 'pose'); f.t2 = 99;
  cam.focus = { f, z: 1.25 };
  // the chant runs through the charge and the vanish, up to when he reappears behind them
  Voice.shout('goku', 'Ka... me... ha... me...'); if (!sfx.kameChant(f, 2.3)) sfx.charge(1.6); shake(3);
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
  f.play('kameCharge', 'pose');
  foe.facing = f.x > foe.x ? 1 : -1; foe.play('idle', 'pose'); foe.t2 = 99;
  cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR, z: 1.5 };
  game.slow = 0.4;
  const r = await reactWindow(foe, 0.9);
  game.slow = 1;
  // a counter beam point-blank: the blast of both throws them apart first, so the clash has room
  if (r.answer === 'beam') {
    const away = foe.x >= f.x ? 1 : -1, mid = clamp((f.x + foe.x) / 2, 64, W - 64);
    f.x = mid - away * 48; foe.x = mid + away * 48;
    f.facing = away; foe.facing = -away;
    Stage.puff(f.x, -away); Stage.puff(foe.x, away);
  }
  Voice.shout('goku', 'HAAAAAAA!');
  await cinematicBeam(f, foe, r, 60, () => {
    foe.play('knock'); foe.vy = -320; foe.vx = f.facing * 230; foe.y -= 1; Stage.crack(foe.x, 2);
  }, 'INSTANT KAMEHAMEHA!');
  endCinematic(f, foe);
}

// Solar Kamehameha: Perfect Cell's finisher. He flares his aura, vanishes, reappears high above
// the enemy and fires a huge Kamehameha down into the ring. The enemy gets a moment to answer
// (see reactWindow); unanswered it deals 60 and blasts them away.
async function solarKame(f) {
  const foe = foeOf(f);
  f.ki = 0;
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
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
  foe.facing = f.x > foe.x ? 1 : -1; foe.play('idle', 'pose'); foe.t2 = 99;
  f.play('kameCharge', 'pose');
  cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR - 40, z: 1 };
  // the chant runs through the charge and the answer window, ending as he fires
  Voice.shout('cell', 'Solar... Kamehameha!'); if (!sfx.kameChant(f, 2.8, true)) sfx.charge(1.4); shake(4);
  const r = await reactWindow(foe, 1.4);
  await cinematicBeam(f, foe, r, 60, () => {
    foe.play('knock'); foe.vy = -220; foe.vx = f.facing * 200; foe.y -= 1; Stage.crack(foe.x, 2.5);
  }, 'SOLAR KAMEHAMEHA!');
  endCinematic(f, foe);
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
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  settle(goku); settle(cell);
  if (boss === cell) {
    cell.play('power'); sfx.powerup(); shake(6);
    cam.focus = { f: cell, z: 1.5 };
    await wait(0.6);
    await say('CELL', next === 1
      ? 'Hehehe... Android 17 is part of me now. Let me show you my second form!'
      : 'My children... beaten?! Enough. With Android 18 I am complete... Behold my PERFECT form!');
    sfx.explode(); game.flash = 1; shake(10);
    setForm(cell, CELL_FORMS[next]);
    cell.play('power');
    await wait(1.2);
    cell.play('idle');
    if (next === 2) {
      // Perfect Cell regenerates completely, and has more to give than before: a fresh, bigger bar
      Object.assign(cell, { maxHp: PERFECT_HP, hp: PERFECT_HP });
      popups.push({ text: 'FULLY REGENERATED!', x: cell.x, y: cell.y - 70, t: 0, c: '#c27aff' });
      await say('CELL', 'Perfection! Go on, Goku. Entertain me.');
      if (player === goku) await senzuBean(goku);
      if (goku.form === 'ssj') await say('GOKU', '(Time to go all out... fill my ki and press O!)');
    }
    if (goku.form === 'base') await say('GOKU', '(He keeps getting stronger... charge ki with I, then press T!)');
  } else if (next === 1) {
    await say('GOKU', "You're stronger than I thought, Cell... Time to get serious!");
    game.wentSsj = true; await superSaiyan(goku);
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

// The reward for getting through the Cell Juniors: Krillin throws Goku a Senzu Bean. It heals him
// completely, fills his ki and toughens him up for Perfect Cell (a bigger health bar).
const SENZU_HP = 130;
async function senzuBean(f) {
  const from = f.x < W / 2 ? W + 12 : -12;
  cam.focus = { f, z: 1.3 };
  game.bean = { x0: from, y0: FLOOR - 100, x1: f.x, y1: f.y - 34, t: 0, dur: 0.75 };
  await say('KRILLIN', 'Goku! Catch!');
  game.bean.t = 0; sfx.whoosh();
  await wait(0.75);
  game.bean = null;
  Object.assign(f, { maxHp: Math.max(f.maxHp, SENZU_HP), ki: 100, stamina: 100, guardBroken: false });
  f.hp = f.maxHp;
  popups.push({ text: 'SENZU BEAN!  FULL HEALTH', x: f.x, y: f.y - 66, t: 0, c: '#8f8' });
  sfx.powerup(); game.flash = 0.5; f.play('charge', 'pose'); f.t2 = 0.8;
  await wait(0.9);
  f.play('idle');
  await say('GOKU', "Thanks, Krillin! Now I'm at full power.");
}

// The Cell Juniors: three of them, fought one after another, while Semi-Perfect Cell watches from the
// back of the ring. Cell's own health is kept aside and given back when the last one falls.
const JUNIORS = 3, JUNIOR_HP = 70;
async function juniorsStart() {
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  settle(goku); settle(cell);
  cam.focus = { f: cell, z: 1.5 };
  cell.play('taunt', 'pose');
  await say('CELL', 'Not bad... But before I become perfect, meet my children. The Cell Juniors!');
  cell.play('power'); sfx.powerup(); shake(5);
  await wait(0.8);
  game.juniors = { left: JUNIORS, hp: cell.hp, maxHp: cell.maxHp };
  juniorIn();
  await say('GOKU', "Little Cells?! Fine... I'll take you all on!");
  cam.focus = null;
  game.mode = 'fight';
}

// the next Junior teleports in across from Goku
function juniorIn() {
  setForm(cell, 'junior');
  const x = clamp(goku.x + (goku.x < W / 2 ? 90 : -90), 24, W - 24);
  Object.assign(cell, { hp: JUNIOR_HP, maxHp: JUNIOR_HP, x, y: FLOOR, vx: 0, vy: 0, visible: true, juggle: 0,
    comboTaken: 0, inv: 0.6, ki: 40, queue: [], next: null, floating: false, facing: goku.x > x ? 1 : -1 });
  cell.play('idle');
  ghosts.push({ img: teleArt(cell), x, y: FLOOR, t: 0 }); sfx.teleport();
}

async function juniorDown() {
  const j = game.juniors;
  game.mode = 'cut'; j.left--;
  popups.push({ text: 'CELL JR. DOWN!', x: cell.x, y: cell.y - 50, t: 0, c: '#9fd0ff' });
  game.slow = 0.4;
  await wait(0.9, true);
  game.slow = 1;
  // gone in a flash
  sparks.push({ x: cell.x, y: cell.y - 20, t: 0, c: '#9fd0ff' }); Stage.shock(cell.x, 1);
  sfx.explode(); game.flash = 0.5; cell.visible = false;
  projs = []; beams = []; minions = [];
  await wait(0.5);
  if (j.left > 0) {
    juniorIn();
    game.banner = { text: j.left === 1 ? 'LAST JUNIOR!' : j.left + ' JUNIORS LEFT', t: 0, dur: 1 };
    game.mode = 'fight';
    return;
  }
  // all down: Cell steps back in and goes Perfect
  game.juniors = null;
  setForm(cell, 'semi');
  const x = clamp(goku.x + (goku.x < W / 2 ? 90 : -90), 24, W - 24);
  Object.assign(cell, { hp: j.hp, maxHp: j.maxHp, x, y: FLOOR, visible: true, inv: 0, juggle: 0, comboTaken: 0, facing: goku.x > x ? 1 : -1 });
  cell.play('idle');
  ghosts.push({ img: teleArt(cell), x, y: FLOOR, t: 0 }); sfx.teleport();
  bossPhase();
}

async function finish(result) {
  game.mode = 'ko'; game.result = result; clash = null; beams = []; projs = []; minions = []; game.spirit = null;
  for (const f of [goku, cell]) { sfx.stopSustain(f); sfx.stopKame(f); }
  if (result !== 'timeup') sfx.ko(); // the final blow rings out under the K.O.
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
  // beaten by one of the Cell Juniors: he gets the last word
  if (game.juniors && winner === cell) await say('CELL JR.', 'Kee-hee! Papa, look! I broke the Saiyan!');
  else await say(winner.who.toUpperCase(), LINES[game.side]);
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
function resumeCombatAudio() {
  for (const f of [player, boss]) {
    if (f.state === 'charge') sfx.chargeLoop(f);
    else if (f.state === 'kameFire') sfx.beamLoop(f);
  }
}
function closeMenu() {
  game.menu.pop();
  if (!game.menu.length && game.mode === 'paused') { game.mode = 'fight'; Audio8.music.play(); resumeCombatAudio(); }
}
function closeAllMenus() {
  game.menu = [];
  if (game.mode === 'paused') { game.mode = 'fight'; Audio8.music.play(); resumeCombatAudio(); }
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
// The fight is shown whole, like a classic 2D fighter. Only cinematics move the camera, pushing in on
// a fighter or a spot (cam.focus) and easing back out. Smoothing is exponential, so it feels the same
// at any frame rate.
const cam = { x: W / 2, y: H / 2, z: 1, focus: null };
function updateCamera(raw) {
  let tx = W / 2, ty = H / 2, tz = 1;
  const live = ['fight', 'ready', 'cut', 'ko', 'end', 'intro', 'paused'].includes(game.mode);
  if (cam.focus && live) {
    const f = cam.focus.f;
    tz = cam.focus.z; tx = f ? f.x : cam.focus.x; ty = (f ? f.y - f.hover : cam.focus.y) - 26;
  }
  const kz = 1 - Math.exp(-4 * raw), kp = 1 - Math.exp(-7 * raw);
  cam.z += (tz - cam.z) * kz;
  cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp;
  // clamp so the view (not just its centre) stays on the stage
  const z = Math.round(cam.z * S) / S, hw = W / 2 / z, hh = H / 2 / z;
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
  if (tap('pause') && game.mode === 'fight') {
    game.mode = 'paused'; Audio8.music.stop(); sfx.stopSustain(player); sfx.stopSustain(boss); sfx.stopKame(player); sfx.stopKame(boss); openMenu('pause'); return;
  }
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
  // a Spirit Bomb thrown out of a combo keeps it going until it lands
  const bombPending = (game.spirit && game.spirit.combo && game.spirit.owner === player && ['gather', 'fly'].includes(game.spirit.phase))
    || (player && player.spiritNext && player.spiritNext.combo && player.state === 'powerDown');
  if (bombPending) game.combo.t = 0;
  if ((game.combo.t += raw) > 1.1 && game.combo.n) Object.assign(game.combo, { n: 0, dmg: 0, moves: [], done: new Set() });
  game.flash = Math.max(0, game.flash - raw * 2.5);
  for (const s of sparks) s.t += raw;
  sparks = sparks.filter(s => s.t < 0.3);
  for (const m of kiMotes) { m.t += raw; m.x += m.vx * raw; m.y += m.vy * raw; m.vy -= 5 * raw; }
  kiMotes = kiMotes.filter(m => m.t < m.life);
  for (const gh of ghosts) gh.t += raw;
  ghosts = ghosts.filter(gh => gh.t < 0.3);
  for (const pp of popups) pp.t += raw;
  for (const c of game.comboNames) c.t += raw;
  game.comboNames = game.comboNames.filter(c => c.t < 1.6);
  popups = popups.filter(pp => pp.t < 0.9);
  if (game.cine) updateCine(raw);
  updateReact(raw);
  if (game.bean) game.bean.t += raw;
  updateCamera(raw);
  Stage.update(raw);
  for (const tr of trails) tr.t += raw;
  trails = trails.filter(tr => tr.t < 0.22);
  for (const z of zips) z.t += raw;
  zips = zips.filter(z => z.t < 0.3);
  for (const b of bursts) b.t += raw;
  bursts = bursts.filter(b => b.t < 0.35);
  if (game.freeze > 0) { game.freeze -= raw; return 'frozen'; }
  game.ct += raw;
  game.chaseT -= raw;

  if (game.mode === 'fight') {
    playerInput(dt);
    // the player may have just started a cinematic: then the boss doesn't act and no phase starts
    // on top of it this frame
    if (game.mode === 'fight' && !window.noAI && (!game.training || game.dummyFight)) bossAI(dt);
    if (game.training) trainingRefill(dt);
    else game.time -= dt;
    if (game.mode === 'fight' && !game.training && game.phase < 2 && !game.juniors && boss.hp <= boss.maxHp * (2 - game.phase) / 3 && boss.hp > 0 && boss.free) {
      // between Semi-Perfect and Perfect, Cell sends in the Cell Juniors first
      if (boss === cell && game.phase === 1) juniorsStart(); else bossPhase();
      return;
    }
  }
  updateFighter(goku, cell, dt);
  updateFighter(cell, goku, dt);
  // keep the two bodies from overlapping; someone lying on the ring takes up about twice the room
  const room = goku.state === 'down' || cell.state === 'down' ? 36 : 20;
  if (goku.visible && cell.visible && Math.abs(goku.x - cell.x) < room && goku.y > FLOOR - 30 && cell.y > FLOOR - 30) {
    const push = (room - Math.abs(goku.x - cell.x)) / 2, d = goku.x < cell.x ? -1 : 1;
    goku.x = clamp(goku.x + d * push, 16, W - 16); cell.x = clamp(cell.x - d * push, 16, W - 16);
  }
  updateProjectiles(dt);
  updateMinions(dt);
  updateBeams(dt);
  updateSpirit(dt);
  if (game.mode === 'fight') {
    if (boss.hp <= 0) { if (game.juniors) juniorDown(); else finish('win'); }
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
  // the sky darkens while the Spirit Bomb draws in the world's energy
  const sb = game.spirit;
  if (sb && sb.phase !== 'boom') {
    const k = sb.phase === 'gather' ? Math.min(1, sb.t / 0.6) : 1;
    ctx.fillStyle = `rgba(14,22,60,${0.32 * k})`; ctx.fillRect(0, 0, W, H);
  }
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
  if (f.who === 'cell') {
    // the sheet's portraits; Perfect Cell's turns furious when he's hurt or going all out
    const angry = f.form === 'perfect' && (f.hp < f.maxHp * 0.35 || ['kameCharge', 'kameFire', 'barrier'].includes(f.state));
    return { im: art(FX_ART.cellFace(angry ? 3 : CELL_INFO[f.form].face)), crop: false };
  }
  const ult = f.state.startsWith('ult');
  return { im: art(ult ? FX_ART.ssj3Portrait : f.form === 'ssj' ? FX_ART.gokuPortrait : FX_ART.gokuHead), crop: false };
}

function hintFor(g) {
  if (g.who === 'goku') {
    if (g.form === 'base' && g.ki >= 100) return 'T  SUPER SAIYAN     O  SPIRIT BOMB';
    if (g.form === 'ssj' && g.ki >= 100 && g.y < FLOOR - 1) return 'O  POWER DOWN + SPIRIT BOMB     S + O  SSJ SPIRIT BOMB';
    if (g.form === 'ssj' && g.ki >= 100) return 'U KAMEHAMEHA   Q + U  INSTANT KAMEHAMEHA   O DRAGON FIST';
    if (g.form === 'ssj' && g.ki >= 50) return 'U  KAMEHAMEHA  (WORKS IN THE AIR TOO)';
  } else {
    if (g.form !== 'perfect' && g.ki >= 100) return 'PRESS T  -  EVOLVE!';
    if (g.form === 'perfect' && g.ki >= 100) return 'U  KAMEHAMEHA    O  SOLAR KAMEHAMEHA!';
    if (g.ki >= 50) return 'U  KAMEHAMEHA    TOWARD + U  DEATH BEAM';
    if (g.ki >= 20) return 'PRESS U  -  DEATH BEAM';
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
  if (!game.juniors) { ctx.fillStyle = '#000'; [1, 2].forEach(k => ctx.fillRect(W - 132 + Math.round(100 * k / 3), 7, 1, 7)); }
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
  if (hint && game.mode === 'fight' && !beams.length && !game.comboNames.length) text(hint, W / 2, 41, 8, '#9ff', 'center'); // below the name labels, which a long hint would cover
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
  // Goku's side (Goku, Krillin calling from off the ring) in orange, Cell's side in green
  const top = 38, isGoku = d.who === 'GOKU' || d.who === 'KRILLIN';
  ctx.fillStyle = 'rgba(8,6,20,0.85)'; ctx.fillRect(10, top, W - 20, 50);
  ctx.strokeStyle = isGoku ? '#f2691c' : '#62bf4c'; ctx.lineWidth = 1; ctx.strokeRect(10.5, top + 0.5, W - 21, 49);
  // speaker portrait (Krillin has none: he's shouting from the crowd)
  if (d.who !== 'KRILLIN') { const sp = iconOf(isGoku ? goku : cell); icon(sp.im, 16, top + 6, sp.crop, !isGoku, 20); }
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
    'FULL KI (SSJ): Q THEN U, OR U THEN Q = INSTANT KAMEHAMEHA',
  ],
  cell: [
    'J PUNCH  K KICK  (CHAIN THEM)  L FINGER BEAM',
    'TOWARD + L BARRAGE   G BARRIER   E JUNIOR   J+K ABSORB',
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
      icon(art(FX_ART.cellFace(on ? 2 : 0)), cx - 48, 34, false, false, 44);
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
  const z = Math.round(cam.z * S) / S, k = S * z;
  ctx.setTransform(k, 0, 0, k, Math.round((W / 2 / z - cam.x) * k), Math.round((H / 2 / z - cam.y) * k));
  // shake rides on top of the camera: a smooth wave scaled by trauma squared
  const tr = Math.min(1, game.shake / 12), amp = tr * tr * 12 * (settings.calm ? 0.3 : 1);
  ctx.translate(Math.round(amp * Math.sin(game.t * 47)), Math.round(amp * 0.7 * Math.sin(game.t * 59 + 1.3)));
  drawBackground(game.mode === 'cut' ? 0.25 : 0);
  // during the Juniors, Semi-Perfect Cell watches from the back of the ring in his stance (his
  // front-facing pose is too rough to show)
  if (game.juniors) {
    const im = Sheets.frame('cell', ANIMS.cell.semi.idle.fr[0]);
    ctx.save(); ctx.globalAlpha = 0.9; ctx.translate(W - 26, FLOOR - 21); ctx.scale(-1, 1);
    ctx.drawImage(im, -Math.round(im.ax), -im.height); ctx.restore();
  }
  // shadows
  for (const f of [goku, cell]) if (f.visible) {
    const k = clamp(1 - (FLOOR - f.y + f.hover) / 120, 0.3, 1);
    ctx.fillStyle = 'rgba(0,0,40,0.35)';
    ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 1, 13 * k, 3 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  // charging ki at the hands
  // the Special Beam Cannon charging at Cell's fingertip
  if (cell.anim === 'cannon' && cell.visible && cell.fi < 4) {
    const [hx, hy] = cell.hand('cannon'), k = Math.min(1, cell.at / 0.5);
    FX.kiGlow(ctx, hx, hy - cell.hover, 1.5 + k * 3.5, game.t, ['#ffffff', '#fff6b0', '#ffd23a', '#e08a10']);
  }
  for (const f of [goku, cell]) if (f.anim === 'kameCharge' && f.visible) {
    const [hx, hy] = f.hand('kameFire');
    const grow = f.state === 'kameCharge' ? 1 - f.t2 : Math.min(1, f.at / 1.6);
    FX.kiGlow(ctx, hx - f.facing * 8, hy - f.hover, (2 + grow * 5) * (f.big ? 2 : 1), game.t);
  }
  // Goku's signature pressure aura; keep it behind the sprite so the pose stays readable.
  if (goku.visible && ['power', 'charge', 'transform', 'ult1', 'kameCharge'].includes(goku.state)) {
    const peak = ['transform', 'ult1'].includes(goku.state) ? 0.9 : goku.state === 'kameCharge' ? 0.72 : 0.5;
    FX.kiAura(ctx, goku.x, goku.y - goku.hover, goku.scale, game.t, peak, goku.form === 'ssj' || goku.state === 'transform' || goku.state === 'ult1', settings.calm);
  }
  for (const m of kiMotes) {
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - m.t / m.life); ctx.fillStyle = m.c;
    const r = m.t < 0.12 ? 1.4 : 0.8; ctx.fillRect(Math.round(m.x), Math.round(m.y), r, r); ctx.restore();
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
  for (const m of minions) {
    const im = Sheets.frame('cell', JR_FRAMES[m.state] || JR_FRAMES.in);
    ctx.fillStyle = 'rgba(0,0,40,0.3)'; ctx.beginPath(); ctx.ellipse(m.x, FLOOR + 1, 9, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(Math.round(m.x), Math.round(m.y)); ctx.scale(m.dir, 1);
    ctx.drawImage(im, -Math.round(im.ax), -im.height); ctx.restore();
  }
  // Barrier bursts: a bright sphere that swells and fades
  for (const b of bursts) {
    const k = b.t / 0.35, r = 10 + k * 52;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * (settings.calm ? 0.4 : 0.8);
    const g = ctx.createRadialGradient(b.x, b.y, r * 0.5, b.x, b.y, r);
    g.addColorStop(0, 'rgba(214,168,255,0)'); g.addColorStop(0.8, 'rgba(230,200,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const f of order) if ((f.state === 'block' || (f.state === 'pose' && f.anim === 'block')) && f.visible) drawGuard(f);
  if (game.react && game.react.def === player && !game.react.answer) drawReactRing(game.react);
  for (const b of beams) beamLight(b);
  for (const b of beams) drawBeam(b);
  if (clash) drawClashBall();
  drawSpirit();
  if (game.bean) drawBean(game.bean);
  for (const p of projs) {
    const im = art(FX_ART[p.kind]);
    const ps = p.owner.scale;
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(p.dir * ps, ps);
    // nothing behind the hand it came out of
    if (p.ox != null) { ctx.beginPath(); ctx.rect((p.ox - p.x) * p.dir / ps, -im.height, 9999, im.height * 2); ctx.clip(); }
    ctx.drawImage(im, 0, -im.height / 2); ctx.restore();
  }
  for (const gh of ghosts) { ctx.globalAlpha = 1 - gh.t / 0.3; ctx.drawImage(gh.img, Math.round(gh.x - gh.img.width / 2), gh.y - gh.img.height); ctx.globalAlpha = 1; }
  for (const s of sparks) FX.spark(ctx, s.x, s.y, s.t, s.c);
  Stage.drawFront(ctx);
  // kept on screen: a popup over someone at the edge would be cut in half
  ctx.font = '9px Saiyan, Impact, sans-serif';
  for (const pp of popups) {
    const half = ctx.measureText(pp.text).width / 2 + 3;
    text(pp.text, Math.round(clamp(pp.x, half, W - half)), Math.round(Math.max(10, pp.y - pp.t * 18)), 9, pp.c, 'center');
  }
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
  if (game.react && game.react.def === player && !game.react.answer) drawReactPrompt(game.react);
  if (game.training && game.mode === 'fight') drawChecklist();
  drawDialogue();
  drawMenu();
}

reset();
Sheets.load().then(() => requestAnimationFrame(loop));
window.__game = () => ({ goku, cell, player, boss, game, beams, projs, startKame, bossPhase, instantKame, solarKame, setForm, reset, startFight });
