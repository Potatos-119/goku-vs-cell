// Goku vs Cell. Pick a side on the select screen; the other fighter becomes the boss, with
// three phases and an AI. The world is 320x180 and is drawn at 4x.
const W = 320, H = 180, S = 4, FLOOR = 162, GRAV = 1300, JUMP_V = -400;
const PLAYER_HP = 100, BOSS_HP = 300;
const canvas = document.getElementById('game');
canvas.width = W * S; canvas.height = H * S;
const ctx = canvas.getContext('2d');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sfx = Audio8.sfx;
const art = a => Sheets.frame(a.sheet, a.ref);

// ---------- input ----------
const keys = {}, pressed = new Set();
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!keys[k]) pressed.add(k);
  keys[k] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
// switching windows swallows keyup events, which would leave a key held forever
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const tap = k => pressed.has(k);

// ---------- fighters ----------
class Fighter {
  constructor(who, maxHp) {
    Object.assign(this, {
      who, x: 0, y: FLOOR, vx: 0, vy: 0, facing: 1, hp: maxHp, maxHp, ki: 0, form: 'base',
      state: 'idle', anim: 'idle', at: 0, t2: 0, stun: 0, inv: 0, dmgMul: 1, speed: 1,
      visible: true, queue: [], next: null, hitDone: false, emitted: 0, blockT: 0,
      stamina: 100, staminaDelay: 0, guardBroken: false, trailT: 0, counter: false, hover: 0, big: false,
      // Cell's sheet is drawn smaller than Goku's; 1.25 keeps pixels whole at 4x
      scale: who === 'cell' ? 1.25 : 1,
    });
  }
  A(name = this.anim) { return ANIMS[this.who][this.form][name] || ANIMS[this.who].base[name]; }
  play(anim, state = anim) { this.anim = anim; this.state = state; this.at = 0; this.hitDone = false; this.emitted = 0; }
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
    ctx.scale(this.facing * this.scale, this.scale);
    if (this.inv > 0 && Math.floor(this.inv * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.drawImage(im, -Math.round(im.ax), -im.height);
    ctx.restore();
  }
}

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
  Stage.reset(); Object.assign(ai, { think: 0.8, vanishCd: 3, ultCd: 6 });
  game = { mode: 'title', cine: null, side, pick: side === 'cell' ? 1 : 0, time: 120, freeze: 0, shake: 0, flash: 0, phase: 0, slow: 1, banner: null, dlg: null, skip: false, result: null, t: 0, kameCd: 4 };
}

function setForm(f, form) {
  f.form = form;
  if (f.who === 'cell') Object.assign(f, { speed: CELL_INFO[form].speed, dmgMul: CELL_INFO[form].dmgMul });
  else Object.assign(f, form === 'ssj' ? { speed: 1.15, dmgMul: 1.35 } : { speed: 1, dmgMul: 1 });
}

// ---------- combat ----------
// kind: 'melee' | 'proj' | 'beam' | 'ult' (ultimates can't be blocked or dodged)
function damage(def, src, dmg, heavy, dir, kind = 'melee') {
  if ((def.inv > 0 && kind !== 'ult') || ['down', 'knock', 'tele', 'transform', 'evolve'].includes(def.state) || def.hp <= 0 || game.mode !== 'fight') return false;
  // from phase two on, the boss sometimes vanishes right before a hit lands and counters from behind
  if (def === boss && kind !== 'ult' && kind !== 'beam' && game.phase >= 1 && ai.vanishCd <= 0
      && ['idle', 'walk', 'block', 'pose', 'dash'].includes(def.state) && Math.random() < 0.12 + 0.1 * game.phase) {
    vanish(boss, player); return false;
  }
  let blocking = kind !== 'ult' && def.state === 'block' && def.facing === -dir;
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
    sparks.push({ x: def.x - dir * 6, y: def.y - 30, t: 0, c: '#fff6b8' });
    game.freeze = heavy ? 0.12 : 0.06; game.shake = heavy ? 6 : 3;
  }
  def.hp = Math.max(0, def.hp - dmg);
  // a fighter mid-Kamehameha takes the damage but keeps firing, unless it finishes them
  const armored = def.state === 'kameFire' && def.hp > 0;
  if (!blocking && !armored) {
    def.queue = []; def.next = null;
    if (heavy || def.hp <= 0) { def.play('knock'); def.vy = -280; def.vx = dir * 160; def.y -= 1; sfx.kick(); }
    else { def.play('hurt'); def.stun = 0.3; def.vx = dir * 70; sfx.punch(); }
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
  damage(foe, f, h.dmg * f.dmgMul, h.heavy, f.facing);
}

// Dash: double-tap a direction (or Shift). On the ground it's the sheet's dash run forward or a quick
// hop back; in the air a straight burst with gravity held off, once per jump. Leaves speed lines.
function dash(f, dir) {
  const air = f.y < FLOOR - 2, fwd = dir === f.facing;
  if (air && f.airDashed) return;
  f.play(air ? (fwd ? 'airDash' : 'airBack') : (fwd ? 'dash' : 'backdash'), 'dash');
  f.t2 = air ? 0.22 : fwd ? 0.25 : 0.2;
  f.vx = dir * (fwd ? 330 : 250) * f.speed;
  f.vy = air ? 0 : fwd ? 0 : -140;
  f.dashAir = air; if (air) f.airDashed = true;
  zips.push({ im: art(f.who === 'goku' ? FX_ART.gokuZip : FX_ART.cellZip), x: f.x, y: f.y - 24 * f.scale, dir, scale: f.scale, t: 0 });
  if (!air) Stage.puff(f.x, dir);
  sfx.whoosh();
}

function startAttack(f, name) {
  f.play(name, 'attack'); f.vx = f.facing * 50;
  if (name === 'rush') f.vx = f.facing * 240;
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

function teleport(f, foe) {
  ghosts.push({ img: art(FX_ART.teleport), x: f.x, y: f.y, t: 0 });
  f.play(f.A('teleOut') ? 'teleOut' : 'idle', 'tele'); f.t2 = 0.28; f.vx = 0;
  sfx.teleport();
  f.teleTo = clamp(foe.x - foe.facing * 34, 20, W - 20);
  // in the air (either of them): reappear behind them up in the air
  f.teleY = foe.y < FLOOR - 10 ? foe.y : f.y < FLOOR - 4 ? FLOOR - 36 : FLOOR;
  f.vx = f.vy = 0;
}

// quick: answering a Kamehameha, charging fast enough to meet it in a beam clash.
// big: Cell's Solar Kamehameha, a huge beam that can't be blocked.
function startKame(f, quick = false, big = false) {
  Voice.shout(f.who, big ? 'Solar Kamehameha!' : 'Kamehameha!');
  f.big = big;
  f.play('kameCharge', 'kameCharge');
  f.t2 = quick ? Math.max(0.12, foeOf(f).t2 + 0.03) : big ? 1.6 : f.who === 'goku' ? 0.9 : 1.3;
  f.vx = 0; if (big) f.inv = f.t2;
  sfx.charge(f.t2);
}

function fireKame(f) {
  f.play('kameFire', 'kameFire'); f.t2 = f.big ? 2 : f.who === 'goku' ? 1.5 : 1.7;
  const [hx, hy] = f.hand('kameFire');
  beams.push({ owner: f, x0: hx, y: hy, dir: f.facing, len: 0, t: 0, tick: 0, big: f.big, dps: f.big ? 34 : f.who === 'goku' ? 22 : 18 });
  sfx.beam(f.t2); game.shake = f.big ? 9 : 4;
}

// Dragon Fist: power up to Super Saiyan 3, rush in, dragon
function startUlt(f) {
  f.ki = 0; f.play('ult1'); f.t2 = 1.0; f.inv = 3; f.vx = 0;
  sfx.powerup(); game.shake = 6; game.flash = 0.6;
  popups.push({ text: 'SUPER SAIYAN 3!', x: f.x, y: f.y - 70, t: 0, c: '#ffe04a' });
}

// ---------- per-fighter update ----------
function updateFighter(f, foe, dt) {
  f.at += dt;
  if (f.inv > 0) f.inv -= dt;
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
  if (airborne && f.state !== 'tele' && !f.floating && !(f.state === 'dash' && f.dashAir)) {
    f.vy += GRAV * dt; f.y += f.vy * dt;
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
    case 'airAtk': meleeCheck(f, foe); break;
    case 'cast':
      { const shots = [].concat(f.A().emitAt);
        while (f.emitted < shots.length && f.fi >= shots[f.emitted]) { f.emitted++; spawnProjectile(f); } }
      if (f.animDone) f.play('idle');
      break;
    case 'hurt':
      if ((f.stun -= dt) <= 0) { if (f.y < FLOOR) f.play('fall', 'jump'); else f.play('idle'); }
      break;
    case 'knock': keepOnScreen(f); break;
    case 'down':
      keepOnScreen(f);
      if ((f.t2 -= dt) <= 0 && f.hp > 0) { if (f.A('getup')) f.play('getup', 'appear'); else f.play('idle'); f.inv = 0.7; }
      break;
    case 'jump': if (f.vy > 0 && f.anim !== 'fall') f.play('fall', 'jump'); break;
    case 'land': if (f.animDone) f.play('idle'); break;
    case 'dash':
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
        ghosts.push({ img: art(FX_ART.teleport), x: f.x, y: f.y, t: 0 });
        if (f.y < FLOOR) {
          f.vy = -60; f.inv = 0.15;
          if (f.counter) { f.counter = false; f.play('air', 'airAtk'); } else f.play('fall', 'jump');
        } else {
          if (f.A('teleIn')) f.play('teleIn', 'appear'); else { f.play('idle'); f.inv = 0.15; }
          if (f.counter) { f.counter = false; f.queue = [f.who === 'cell' ? 'k2' : 'k3']; startAttack(f, 'p2'); }
        }
      } else if (f.t2 <= 0.2) f.visible = false;
      break;
    case 'appear': if (f.animDone) f.play('idle'); break;
    case 'kameCharge': if ((f.t2 -= dt) <= 0) fireKame(f); break;
    case 'kameFire':
      if ((f.t2 -= dt) <= 0 && !clash) { beams = beams.filter(b => b.owner !== f); f.big = false; f.play('idle'); }
      break;
    case 'transform': if (f.animDone) finishTransform(f); break;
    case 'evolve':
      if ((f.t2 -= dt) <= 0) {
        setForm(f, CELL_FORMS[CELL_FORMS.indexOf(f.form) + 1]); f.play('idle');
        game.flash = 1; game.shake = 8; sfx.explode();
        popups.push({ text: CELL_INFO[f.form].name + '!', x: f.x, y: f.y - 70, t: 0, c: '#a8e27c' });
      }
      break;
    case 'pose': if ((f.t2 -= dt) <= 0) f.play('idle'); break;
    case 'ult1': if ((f.t2 -= dt) <= 0) { f.play('ult2'); f.t2 = 0.7; sfx.whoosh(); Voice.shout('goku', 'Dragon Fist!'); } break;
    case 'ult2':
      f.facing = foe.x > f.x ? 1 : -1; f.vx = f.facing * 420;
      if (Math.abs(foe.x - f.x) < 34 || (f.t2 -= dt) <= 0) {
        f.vx = 0; f.play('ult3'); f.t2 = 1.1;
        game.flash = 1; game.shake = 10; sfx.explode();
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
  game.flash = 1; game.shake = 8; sfx.explode();
}

// Put a fighter back on the floor, visible and standing, when a cutscene or the KO takes over
// (otherwise they can be left mid-air, invisible mid-teleport or half-way through a move).
function settle(f) {
  if (f.state === 'transform') finishTransform(f);
  if (f.state === 'evolve') { f.t2 = 0; updateFighter(f, foeOf(f), 0); }
  if (f === player && f.state === 'kameCharge') f.ki = Math.min(100, f.ki + 50);
  Object.assign(f, { visible: true, x: f.state === 'tele' ? f.teleTo : f.x, y: FLOOR, vx: 0, vy: 0, queue: [], next: null, big: false });
  if (f.hp > 0) f.play('idle');
}

function landed(f) {
  if (f.state === 'knock') { Stage.crack(f.x, 1); f.play('down'); f.t2 = f.hp > 0 ? 0.7 : 99; f.vx = 0; game.shake = 4; sfx.kick(); }
  else if (['jump', 'airAtk'].includes(f.state)) { f.play('land'); f.vx = 0; }
}

// ---------- player ----------
// what J / K chain into after each attack
const CHAINS = {
  goku: { j: { p1: 'p2', p2: 'p3', p3: 'p4', k1: 'p2', k2: 'p3', rush: 'p2' }, k: { p1: 'k1', p2: 'k2', p3: 'k3', k1: 'k2', k2: 'k3', rush: 'k2' } },
  cell: { j: { p1: 'p2', k1: 'p2', rush: 'p2' }, k: { p1: 'k1', p2: 'k2', k1: 'k2', rush: 'k2' } },
};

const lastTap = { dir: 0, t: -1 };
function playerInput(dt) {
  const g = player, foe = boss, isGoku = g.who === 'goku';
  const dir = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  // double-tapping a direction within a quarter second dashes that way
  const tapDir = tap('d') || tap('arrowright') ? 1 : tap('a') || tap('arrowleft') ? -1 : 0;
  let dashDir = 0;
  if (tapDir) {
    if (tapDir === lastTap.dir && game.t - lastTap.t < 0.25) { dashDir = tapDir; lastTap.dir = 0; }
    else Object.assign(lastTap, { dir: tapDir, t: game.t });
  }
  if (tap('shift')) dashDir = dir || g.facing;
  if (g.free) {
    g.facing = foe.x > g.x ? 1 : -1;
    const toward = dir === g.facing;
    if (keys.s && !g.guardBroken) { g.play('block'); g.blockT = 0; g.vx = 0; return; }
    if (keys.i) { g.play('charge'); g.vx = 0; sfx.charge(0.5); return; }
    if (tap('w') || tap(' ')) { g.play('jump'); g.vy = JUMP_V; g.vx = dir * 120; sfx.whoosh(); return; }
    if (dashDir) return dash(g, dashDir);
    // holding toward the enemy turns J into a rushing punch and K into a heavy slash
    if (tap('j')) return startAttack(g, toward ? 'rush' : 'p1');
    if (tap('k')) return startAttack(g, toward ? 'slash' : 'k1');
    if (tap('l')) {
      if (isGoku && g.ki >= 8) { g.ki -= 8; return cast(g, 'kiCast'); }
      if (!isGoku && toward && g.form !== 'imperfect' && g.ki >= 15) { g.ki -= 15; return cast(g, 'barrage'); }
      if (!isGoku && g.ki >= 8) { g.ki -= 8; return cast(g, 'finger'); }
    }
    if (tap('q') && g.ki >= 15) { g.ki -= 15; return teleport(g, foe); }
    if (tap('t') && g.ki >= 100) {
      if (isGoku && g.form === 'base') {
        g.ki = 50; superSaiyan(g); return;
      }
      if (!isGoku && g.form !== 'perfect') {
        Voice.shout('cell', g.form === 'imperfect' ? 'Evolve!' : 'Perfection!');
        g.ki = 50; g.play('charge', 'evolve'); g.t2 = 1.2; g.inv = 1.4; g.vx = 0; sfx.powerup(); game.shake = 5; return;
      }
    }
    if (tap('u')) {
      if (isGoku && g.form === 'ssj' && g.ki >= 50) { g.ki -= 50; return startKame(g); }
      if (!isGoku && g.form === 'perfect' && g.ki >= 50) { g.ki -= 50; return startKame(g); }
      if (!isGoku && g.form === 'semi' && g.ki >= 20) { g.ki -= 20; return cast(g, 'death'); }
    }
    if (tap('o') && g.ki >= 100) {
      if (isGoku && g.form === 'ssj') return startUlt(g);
      if (!isGoku && g.form === 'perfect') { g.ki = 0; return startKame(g, false, true); }
    }
    if (dir) {
      const anim = toward ? 'walk' : 'back';
      if (g.anim !== anim) { g.play(anim, 'walk'); Stage.puff(g.x, dir); }
      g.vx += clamp(dir * (toward ? 115 : 85) * g.speed - g.vx, -900 * dt, 900 * dt);
    } else if (g.state !== 'idle') g.play('idle');
  } else if (g.state === 'jump') {
    g.vx += clamp(dir * 130 - g.vx, -600 * dt, 600 * dt);
    if (dashDir && !g.airDashed) return dash(g, dashDir);
    if (tap('q') && g.ki >= 15) { g.ki -= 15; return teleport(g, foe); }
    if (tap('u') && isGoku && g.form === 'ssj' && g.ki >= 100) return instantKame(g);
    if (tap('j') || tap('k')) g.play('air', 'airAtk');
  } else if (g.state === 'attack') {
    const chain = CHAINS[g.who];
    if (tap('j') && chain.j[g.anim]) g.next = chain.j[g.anim];
    if (tap('k') && chain.k[g.anim]) g.next = chain.k[g.anim];
  } else if (g.state === 'block' && !keys.s) g.play('idle');
  else if (g.state === 'charge') {
    if (!keys.i) g.play('idle');
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
      if (damage(foe, p.owner, p.dmg, p.heavy, p.dir, 'proj')) p.dead = true;
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
    if (!clash) b.len = Math.min(b.len + 650 * dt, b.dir > 0 ? W + 40 - b.x0 : b.x0 + 40);
    const foe = foeOf(b.owner), P = beamParts(b);
    const half = P.body.height * P.s * 0.4, tip = b.x0 + b.dir * b.len, fb = foe.box();
    const inX = b.dir > 0 ? fb.x0 < tip && fb.x1 > b.x0 : fb.x1 > tip && fb.x0 < b.x0;
    const inY = fb.y0 < b.y + half && fb.y1 > b.y - half;
    if (inX && inY && foe.visible && !clash && (b.tick -= dt) <= 0) {
      b.tick = 0.1;
      const lastHit = b.owner.t2 < 0.15;
      damage(foe, b.owner, b.dps * 0.1 * b.owner.dmgMul, lastHit, b.dir, b.big ? 'ult' : 'beam');
      if (!lastHit) game.freeze = 0; // 10 ticks a second: hit-stop on each would stall the whole game
      if (foe.state === 'hurt') { foe.stun = 0.15; foe.vx = b.dir * 40; }
    }
  }
  // two beams meeting head-on = beam struggle; the player mashes J to push
  const pb = beams.find(b => b.owner === player), bb = beams.find(b => b.owner === boss);
  if (pb && bb && !clash && pb.dir !== bb.dir) {
    const pTip = pb.x0 + pb.dir * pb.len, bTip = bb.x0 + bb.dir * bb.len;
    if ((pb.dir > 0 && pTip >= bTip) || (pb.dir < 0 && pTip <= bTip)) {
      // always start the struggle halfway between them, wherever the tips happened to meet
      clash = { m: (pb.x0 + bb.x0) / 2 };
      game.banner = { text: 'MASH  J !', t: 0, dur: 99 };
    }
  }
  if (clash) {
    if (tap('j') || tap('u')) clash.m += pb.dir * 7;
    clash.m -= pb.dir * (bb.big ? 44 : 34) * dt;
    pb.len = Math.abs(clash.m - pb.x0); bb.len = Math.abs(clash.m - bb.x0);
    game.shake = 2;
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

function drawBeam(b) {
  const P = beamParts(b), s = P.s;
  const sw = P.start.width * s, sh = P.start.height * s;
  const bh = P.body.height * s;
  const hs = (bh * 1.2) / P.head.height, hw = P.head.width * hs, hh = P.head.height * hs;
  ctx.save();
  ctx.translate(Math.round(b.x0), Math.round(b.y));
  ctx.scale(b.dir, 1);
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
  Voice.shout('goku', 'Ka... me... ha... me...'); sfx.charge(1.6); game.shake = 3;
  await wait(1.6);
  // vanish...
  ghosts.push({ img: art(FX_ART.teleport), x: f.x, y: f.y, t: 0 });
  trails.push({ im: f.img, x: f.x, y: f.y, facing: f.facing, scale: f.scale, t: 0 });
  f.visible = false; sfx.teleport();
  await wait(0.35);
  // ...and reappear right behind them (in front if they're backed against the edge)
  let x = foe.x - foe.facing * 26;
  if (x < 16 || x > W - 16) x = foe.x + foe.facing * 26;
  Object.assign(f, { x, y: FLOOR, floating: false, visible: true, facing: foe.x > x ? 1 : -1 });
  ghosts.push({ img: art(FX_ART.teleport), x: f.x, y: f.y, t: 0 }); sfx.teleport();
  foe.facing = f.x > foe.x ? 1 : -1; foe.play('hurt', 'pose'); foe.t2 = 99;
  game.slow = 0.5;
  await wait(0.3);
  game.slow = 1;
  Voice.shout('goku', 'HAAAAAAA!');
  f.big = true; fireKame(f); f.t2 = 1.3;
  game.banner = { text: 'INSTANT KAMEHAMEHA!', t: 0, dur: 1.4 };
  game.flash = 1; game.shake = 12; sfx.explode();
  foe.hp = Math.max(0, foe.hp - 60);
  foe.play('knock'); foe.vy = -320; foe.vx = f.facing * 230; foe.y -= 1;
  Stage.crack(foe.x, 2);
  await wait(1.4);
  f.inv = 0.5;
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
  ghosts.push({ img: art(FX_ART.teleport), x: goku.x, y: FLOOR, t: 0 }); sfx.teleport();
  await wait(0.7);
  await say('GOKU', "You won't get the chance, Cell! I'm stopping you right here.");
  cell.play('taunt');
  await say('CELL', 'Hahaha! Then let me taste the power of a Saiyan!');
  cell.play('power'); sfx.powerup(); game.shake = 5;
  await wait(1.6);
  cell.play('idle'); goku.play('charge'); sfx.charge(1.2); game.shake = 4;
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
  ghosts.push({ img: art(FX_ART.teleport), x: goku.x, y: FLOOR, t: 0 }); sfx.teleport();
  await wait(0.7);
  await say('GOKU', "Cell! I won't let you hurt anyone else.");
  cell.play('taunt');
  await say('CELL', 'Every blow you land teaches my cells. I will evolve... and become PERFECT.');
  goku.play('charge'); sfx.charge(1.2); game.shake = 4;
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
    game.shake = 12; game.banner = { text: 'SUPER SAIYAN!', t: 0, dur: 1.6 };
    for (let i = 0; i < 14; i++) Stage.lift(f.x);
    Stage.crack(f.x, 2);
  }
  if (c.stage === 2 && c.t >= SSJ_PEAK + 1.6) {
    f.play('idle'); f.inv = 0.5;
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
    cell.play('power'); sfx.powerup(); game.shake = 6;
    await wait(0.6);
    await say('CELL', next === 1
      ? 'Hehehe... Android 17 is part of me now. Let me show you my second form!'
      : 'With Android 18 I am finally complete... Behold my PERFECT form!');
    sfx.explode(); game.flash = 1; game.shake = 10;
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
    goku.play('charge'); sfx.powerup(); game.shake = 8;
    await say('GOKU', "I can't hold back anymore. This is everything I've got!");
    game.flash = 1; sfx.explode();
    await wait(0.8);
    goku.play('idle');
  }
  if (boss === goku) Object.assign(goku, GOKU_BOSS[next]);
  game.phase = next; game.kameCd = 3; ai.ultCd = 4;
  game.mode = 'fight';
}

async function finish(result) {
  game.mode = 'ko'; game.result = result; clash = null; beams = []; projs = [];
  game.slow = 0.35;
  await banner(result === 'timeup' ? 'TIME!' : 'K.O.!', 1.4);
  game.slow = 1;
  for (const f of [goku, cell]) if (f.hp > 0) settle(f);
  const win = result === 'win' || (result === 'timeup' && player.hp / player.maxHp > boss.hp / boss.maxHp);
  game.result = win ? 'win' : 'lose';
  await wait(0.8);
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

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  // hit-freeze frames skip input, so keep those key presses for the next real frame
  if (step(raw) !== 'frozen') pressed.clear();
  render();
  requestAnimationFrame(loop);
}

function step(raw) {
  game.t += raw;
  if (tap('v')) { Voice.on = !Voice.on; popups.push({ text: Voice.on ? 'VOICES ON' : 'VOICES OFF', x: W / 2, y: 60, t: 0, c: '#fff' }); }
  if (tap('m')) { Audio8.init(); popups.push({ text: Audio8.music.toggleMute() ? 'MUSIC OFF' : 'MUSIC ON', x: W / 2, y: 60, t: 0, c: '#fff' }); }
  if (game.mode === 'title') {
    if (tap('enter')) { Audio8.init(); Audio8.music.play('bg', true); game.mode = 'select'; sfx.blip(); }
    return;
  }
  if (game.mode === 'select') {
    if (['a', 'd', 'arrowleft', 'arrowright'].some(tap)) { game.pick = 1 - game.pick; sfx.blip(); }
    if (tap('enter')) { reset(game.pick ? 'cell' : 'goku'); Audio8.music.play('bg'); intro(); }
    return;
  }
  if (tap('p') && (game.mode === 'fight' || game.mode === 'paused')) {
    game.mode = game.mode === 'fight' ? 'paused' : 'fight';
    if (game.mode === 'paused') Audio8.music.stop(); else Audio8.music.play();
  }
  if (game.mode === 'paused') return;
  if (game.mode === 'end') {
    if (tap('enter')) { reset(); Audio8.music.play('bg', true); startFight(); }
    else if (tap('escape')) { reset(); Audio8.music.play('bg', true); game.mode = 'select'; }
  }
  if (game.mode === 'intro' && tap('escape')) { game.skip = true; timers.forEach(t => t.r()); if (game.dlg) game.dlg.done(); game.dlg = null; }

  // dialogue: Enter finishes the line, then advances
  if (game.dlg) {
    const d = game.dlg;
    d.shown += raw * 45;
    if (tap('enter')) { if (d.shown < d.text.length) d.shown = d.text.length; else { game.dlg = null; d.done(); } }
  }
  const dt = raw * game.slow;
  timers = timers.filter(t => (t.t -= t.real ? raw : dt) > 0 || (t.r(), false));
  if (game.banner && (game.banner.t += raw) > game.banner.dur) game.banner = null;
  game.shake = Math.max(0, game.shake - raw * 20);
  game.flash = Math.max(0, game.flash - raw * 2.5);
  for (const s of sparks) s.t += raw;
  sparks = sparks.filter(s => s.t < 0.3);
  for (const gh of ghosts) gh.t += raw;
  ghosts = ghosts.filter(gh => gh.t < 0.3);
  for (const pp of popups) pp.t += raw;
  popups = popups.filter(pp => pp.t < 0.9);
  if (game.cine) updateCine(raw);
  Stage.update(raw);
  for (const tr of trails) tr.t += raw;
  trails = trails.filter(tr => tr.t < 0.22);
  for (const z of zips) z.t += raw;
  zips = zips.filter(z => z.t < 0.3);
  if (game.freeze > 0) { game.freeze -= raw; return 'frozen'; }

  if (game.mode === 'fight') {
    playerInput(dt);
    if (!window.noAI) bossAI(dt);
    game.time -= dt;
    if (game.phase < 2 && boss.hp <= boss.maxHp * (2 - game.phase) / 3 && boss.hp > 0 && boss.free) { bossPhase(); return; }
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
    if (g.form === 'ssj' && g.ki >= 50) return 'PRESS U  -  KAMEHAMEHA!';
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
  text(String(Math.max(0, Math.ceil(game.time))), W / 2, 4, 16, '#ffe04a', 'center');
  const hint = hintFor(player);
  if (hint && game.mode === 'fight' && !beams.length) text(hint, W / 2, 32, 8, '#9ff', 'center');
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
  small('P PAUSE   M MUSIC ON/OFF   V VOICES ON/OFF   ESC SKIP INTRO', W / 2, 160, '#ddd');
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
  if (Math.floor(game.t * 2) % 2) small('A / D  CHOOSE     ENTER  START', W / 2, 22, '#fff');
}

function render() {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (game.mode === 'title' || game.mode === 'select') {
    if (game.mode === 'title') drawTitle(); else drawSelect();
    if (Audio8.music.muted) small('MUSIC OFF (M)', W - 4, 4, '#f99', 'right');
    return;
  }
  const sh = game.shake;
  ctx.translate(Math.round(rand(-sh, sh)), Math.round(rand(-sh, sh)));
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
  if (game.flash > 0) { ctx.fillStyle = `rgba(255,250,220,${game.flash * 0.8})`; ctx.fillRect(0, 0, W, H); }
  if (['fight', 'ready', 'ko', 'paused', 'cut'].includes(game.mode)) drawHUD();
  if (game.banner) {
    const b = game.banner, pop = Math.min(1, b.t * 6);
    text(b.text, W / 2, 62 - (1 - pop) * 10, 28, '#ffe04a', 'center', '#7a1a00');
  }
  if (game.mode === 'end') {
    text(game.result === 'win' ? 'YOU WIN!' : `${boss.who.toUpperCase()} WINS`, W / 2, 46, 28, game.result === 'win' ? '#ffe04a' : '#ff8a6a', 'center');
    if (Math.floor(game.t * 2) % 2) text('ENTER  FIGHT AGAIN      ESC  CHOOSE FIGHTER', W / 2, 82, 9, '#fff', 'center');
  }
  if (game.mode === 'paused') text('PAUSED', W / 2, 70, 28, '#fff', 'center');
  drawDialogue();
}

reset();
Sheets.load().then(() => requestAnimationFrame(loop));
window.__game = () => ({ goku, cell, player, boss, game, beams, projs, startKame, bossPhase });
