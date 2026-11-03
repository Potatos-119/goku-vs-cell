// Goku vs Cell boss fight. The world is 320x180 and is drawn at 4x.
const W = 320, H = 180, S = 4, FLOOR = 162, GRAV = 900;
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
  if ([' ', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
// switching windows swallows keyup events, which would leave a key held forever
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const tap = k => pressed.has(k);

// ---------- fighters ----------
class Fighter {
  constructor(who, x, facing, maxHp) {
    Object.assign(this, {
      who, x, y: FLOOR, vx: 0, vy: 0, facing, hp: maxHp, maxHp, ki: 0, form: 'base',
      state: 'idle', anim: 'idle', at: 0, t2: 0, stun: 0, inv: 0, dmgMul: 1, speed: 1,
      visible: true, queue: [], next: null, hitDone: false, emitted: 0, blockT: 0,
      stamina: 100, staminaDelay: 0, guardBroken: false, trailT: 0, counter: false,
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
    const bob = this.state === 'walk' ? Math.round(Math.sin(this.at * 14)) : 0;
    ctx.translate(Math.round(this.x), Math.round(this.y) + bob);
    ctx.scale(this.facing * this.scale, this.scale);
    if (this.inv > 0 && Math.floor(this.inv * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.drawImage(im, -Math.round(im.ax), -im.height);
    ctx.restore();
  }
}

let goku, cell, projs, beams, sparks, ghosts, popups, trails, clash, timers, game;

function reset() {
  goku = new Fighter('goku', 80, 1, 100);
  cell = new Fighter('cell', 240, -1, 300);
  setCellForm('imperfect');
  projs = []; beams = []; sparks = []; ghosts = []; popups = []; trails = []; clash = null; timers = [];
  Stage.reset(); ai.think = 0.8; ai.vanishCd = 3;
  game = { mode: 'title', time: 120, freeze: 0, shake: 0, flash: 0, phase: 0, slow: 1, banner: null, dlg: null, skip: false, result: null, t: 0, kameCd: 4 };
}

// ---------- combat ----------
function setCellForm(form) {
  cell.form = form;
  Object.assign(cell, { speed: CELL_INFO[form].speed, dmgMul: CELL_INFO[form].dmgMul });
}

// kind: 'melee' | 'proj' | 'beam' | 'ult' (the Dragon Fist can't be blocked or dodged)
function damage(def, src, dmg, heavy, dir, kind = 'melee') {
  if ((def.inv > 0 && kind !== 'ult') || ['down', 'knock', 'tele', 'transform'].includes(def.state) || def.hp <= 0 || game.mode !== 'fight') return false;
  // from Semi-Perfect on, Cell sometimes vanishes right before a hit lands and counters from behind
  if (def === cell && kind !== 'ult' && kind !== 'beam' && game.phase >= 1 && ai.vanishCd <= 0
      && ['idle', 'walk', 'block', 'pose', 'dash'].includes(def.state) && Math.random() < 0.12 + 0.1 * game.phase) {
    vanish(cell, goku); return false;
  }
  let blocking = kind !== 'ult' && def.state === 'block' && def.facing === -dir;
  if (blocking && def === goku && kind !== 'beam' && def.blockT < PARRY_WINDOW) return perfectBlock(def, src, kind);
  // every blocked hit wears down Goku's guard; when stamina runs out the guard breaks and the hit lands
  let broke = false;
  if (blocking && def === goku && (def.stamina -= dmg * 1.6) <= 0) { guardBreak(def); blocking = false; broke = true; }
  if (blocking) {
    dmg *= 0.15; def.vx = dir * 90; def.ki = Math.min(100, def.ki + 3);
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
    if (heavy || def.hp <= 0) { def.play('knock'); def.vy = -230; def.vx = dir * 160; def.y -= 1; sfx.kick(); }
    else { def.play('hurt'); def.stun = 0.3; def.vx = dir * 70; sfx.punch(); }
    if (def === goku && Math.random() < 0.3) sfx.hurt();
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

// Block just as a hit lands: no damage, a big ki refund, and a punch or kick leaves Cell dizzy.
const PARRY_WINDOW = 0.18;
function perfectBlock(def, src, kind) {
  def.ki = Math.min(100, def.ki + 25); def.stamina = Math.min(100, def.stamina + 15); def.inv = 0.25;
  popups.push({ text: 'PERFECT!  +KI', x: def.x, y: def.y - 54, t: 0, c: '#8ff' });
  sparks.push({ x: def.x + def.facing * 10, y: def.y - 30, t: 0, c: '#ffffff' });
  game.freeze = 0.15; game.flash = 0.35; sfx.parry();
  if (kind === 'melee') { src.queue = []; src.next = null; src.play('dizzy', 'hurt'); src.stun = 1.1; src.vx = -src.facing * 60; }
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

function startAttack(f, name) {
  f.play(name, 'attack'); f.vx = f.facing * 50;
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
  f.play(f.who === 'goku' ? 'teleOut' : 'idle', 'tele'); f.t2 = 0.28; f.vx = 0;
  sfx.teleport();
  f.teleTo = clamp(foe.x - foe.facing * 34, 20, W - 20);
}

// quick: Cell answering Goku's Kamehameha charges fast enough to meet it in a beam clash
function startKame(f, quick = false) {
  Voice.shout(f.who, 'Kamehameha!');
  f.play('kameCharge', 'kameCharge'); f.t2 = quick ? Math.max(0.12, goku.t2 + 0.03) : f === goku ? 0.9 : 1.3; f.vx = 0;
  sfx.charge(f.t2);
}

function fireKame(f) {
  f.play('kameFire', 'kameFire'); f.t2 = f === goku ? 1.5 : 1.7;
  const [hx, hy] = f.hand('kameFire');
  beams.push({ owner: f, x0: hx, y: hy, dir: f.facing, len: 0, t: 0, tick: 0, dps: f === goku ? 22 : 18 });
  sfx.beam(f.t2); game.shake = 4;
}

// ---------- per-fighter update ----------
function updateFighter(f, foe, dt) {
  f.at += dt;
  if (f.inv > 0) f.inv -= dt;
  if (f.state === 'block') f.blockT += dt;
  // afterimages on fast moves, rocks lifting off the ring while powering up
  if ((['dash', 'ult2'].includes(f.state) || f.anim === 'rush') && f.visible && (f.trailT -= dt) <= 0) {
    f.trailT = 0.035; trails.push({ im: f.img, x: f.x, y: f.y, facing: f.facing, scale: f.scale, t: 0 });
  }
  if (['power', 'charge', 'transform', 'ult1', 'kameCharge'].includes(f.state) && Math.random() < dt * 14) Stage.lift(f.x);
  if (f === goku) {
    // holding block drains stamina; it refills shortly after letting go
    if (f.state === 'block') { f.stamina -= 6 * dt; f.staminaDelay = 0.6; if (f.stamina <= 0) guardBreak(f); }
    else if ((f.staminaDelay -= dt) <= 0) f.stamina = Math.min(100, f.stamina + 28 * dt);
    if (f.guardBroken && f.stamina >= 35) f.guardBroken = false;
  }
  const airborne = f.y < FLOOR || f.vy < 0;
  if (airborne) {
    f.vy += GRAV * dt; f.y += f.vy * dt;
    if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; landed(f); }
  }
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
    case 'jump': if (f.vy > 0) f.play('fall', 'jump'); break;
    case 'land': if (f.animDone) f.play('idle'); break;
    case 'dash': if ((f.t2 -= dt) <= 0) { f.vx = 0; f.play('idle'); } break;
    case 'block': if (f !== goku && (f.t2 -= dt) <= 0) f.play('idle'); break;
    case 'tele':
      if ((f.t2 -= dt) <= 0 && !f.visible) {
        f.x = f.teleTo; f.visible = true; f.facing = foe.x > f.x ? 1 : -1;
        ghosts.push({ img: art(FX_ART.teleport), x: f.x, y: f.y, t: 0 });
        if (f.who === 'goku') f.play('teleIn', 'appear');
        else {
          f.play('idle'); f.inv = 0.15;
          if (f.counter) { f.counter = false; f.queue = ['k2']; startAttack(f, 'p2'); }
        }
      } else if (f.t2 <= 0.2) f.visible = false;
      break;
    case 'appear': if (f.animDone) f.play('idle'); break;
    case 'kameCharge': if ((f.t2 -= dt) <= 0) fireKame(f); break;
    case 'kameFire':
      if ((f.t2 -= dt) <= 0 && !clash) { beams = beams.filter(b => b.owner !== f); f.play('idle'); }
      break;
    case 'transform': if (f.animDone) finishTransform(f); break;
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
  f.form = 'ssj'; f.dmgMul = 1.35; f.speed = 1.15; f.play('idle');
  game.flash = 1; game.shake = 8; sfx.explode();
}

// Put a fighter back on the floor, visible and standing, when a cutscene or the KO takes over
// (otherwise they can be left mid-air, invisible mid-teleport or half-way through a move).
function settle(f) {
  if (f.state === 'transform') finishTransform(f);
  if (f === goku && f.state === 'kameCharge') f.ki = Math.min(100, f.ki + 50);
  Object.assign(f, { visible: true, x: f.state === 'tele' ? f.teleTo : f.x, y: FLOOR, vx: 0, vy: 0, queue: [], next: null });
  if (f.hp > 0) f.play('idle');
}

function landed(f) {
  if (f.state === 'knock') { Stage.crack(f.x, 1); f.play('down'); f.t2 = f.hp > 0 ? 0.7 : 99; f.vx = 0; game.shake = 4; sfx.kick(); }
  else if (['jump', 'airAtk'].includes(f.state)) { f.play('land'); f.vx = 0; }
}

// ---------- player ----------
const NEXT_P = { p1: 'p2', p2: 'p3', p3: 'p4', k1: 'p2', k2: 'p3', rush: 'p2' };
const NEXT_K = { p1: 'k1', p2: 'k2', p3: 'k3', k1: 'k2', k2: 'k3', rush: 'k2' };

function playerInput(dt) {
  const g = goku, dir = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  if (g.free) {
    g.facing = cell.x > g.x ? 1 : -1;
    if (keys.s && !g.guardBroken) { g.play('block'); g.blockT = 0; g.vx = 0; return; }
    if (keys.i) { g.play('charge'); g.vx = 0; sfx.charge(0.5); return; }
    if (tap('w') || tap(' ')) { g.play('jump'); g.vy = -370; g.vx = dir * 120; sfx.whoosh(); return; }
    if (tap('shift')) { g.play('dash'); g.t2 = 0.2; g.vx = (dir || g.facing) * 300; sfx.whoosh(); return; }
    // holding toward Cell turns J into a rushing punch and K into a heavy slash
    if (tap('j')) { startAttack(g, dir === g.facing ? 'rush' : 'p1'); if (dir === g.facing) g.vx = g.facing * 240; return; }
    if (tap('k')) return startAttack(g, dir === g.facing ? 'slash' : 'k1');
    if (tap('l') && g.ki >= 8) { g.ki -= 8; return cast(g, 'kiCast'); }
    if (tap('q') && g.ki >= 15) { g.ki -= 15; return teleport(g, cell); }
    if (tap('t') && g.form === 'base' && g.ki >= 100) {
      Voice.shout('goku', 'Haaaaaaah!');
      g.ki = 50; g.play('transform'); g.vx = 0; g.inv = 2; sfx.powerup(); game.shake = 5; return;
    }
    if (tap('u') && g.form === 'ssj' && g.ki >= 50) { g.ki -= 50; return startKame(g); }
    if (tap('o') && g.form === 'ssj' && g.ki >= 100) {
      g.ki = 0; g.play('ult1'); g.t2 = 1.0; g.inv = 3; g.vx = 0;
      sfx.powerup(); game.shake = 6; game.flash = 0.6;
      popups.push({ text: 'SUPER SAIYAN 3!', x: g.x, y: g.y - 70, t: 0, c: '#ffe04a' });
      return;
    }
    if (dir) {
      const anim = dir === g.facing ? 'walk' : 'back';
      if (g.anim !== anim) g.play(anim, 'walk');
      g.vx += clamp(dir * (anim === 'walk' ? 115 : 85) * g.speed - g.vx, -900 * dt, 900 * dt);
    } else if (g.state !== 'idle') g.play('idle');
  } else if (g.state === 'jump') {
    g.vx += clamp(dir * 130 - g.vx, -600 * dt, 600 * dt);
    if (tap('j') || tap('k')) { g.play('air', 'airAtk'); }
  } else if (g.state === 'attack') {
    if (tap('j') && NEXT_P[g.anim]) g.next = NEXT_P[g.anim];
    if (tap('k') && NEXT_K[g.anim]) g.next = NEXT_K[g.anim];
  } else if (g.state === 'block' && !keys.s) g.play('idle');
  else if (g.state === 'charge') {
    if (!keys.i) g.play('idle');
    else { g.ki = Math.min(100, g.ki + 32 * dt); if (Math.random() < dt * 2) sfx.charge(0.5); }
  }
}

// ---------- Cell AI ----------
// Cell reads what Goku is doing: he punishes charging, whiffs and broken guards, interrupts
// a Kamehameha, anti-airs jump-ins and, from Semi-Perfect on, vanishes out of trouble.
const ai = { think: 0.8, vanishCd: 3 };
const AI_REACT = [0.42, 0.3, 0.2]; // seconds between decisions in each phase

// blink out (leaving an afterimage), reappear behind Goku and attack straight away
function vanish(c, foe) {
  ai.vanishCd = 2.4 - game.phase * 0.5;
  trails.push({ im: c.img, x: c.x, y: c.y, facing: c.facing, scale: c.scale, t: 0 });
  teleport(c, foe); c.t2 = 0.18; c.counter = true;
}

function cellAI(dt) {
  const c = cell, g = goku, ph = game.phase;
  game.kameCd -= dt; ai.vanishCd -= dt;
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
  const dashIn = () => { c.play('dash'); c.t2 = 0.24; c.vx = c.facing * 280 * c.speed; };
  const combo = () => {
    c.queue = pick([['p2', 'k2'], ['p1', 'p2', 'k2'], ['k1', 'k2'], ['p1', 'k1'], ['p1', 'p2', 'k1', 'k2']]).slice(0, ph + 2);
    startAttack(c, c.queue.shift()); ai.think = rand(0.5, 0.9) / c.speed;
  };
  const canVanish = ph >= 1 && ai.vanishCd <= 0;

  // Goku is charging ki: never let that happen for free
  if (g.state === 'charge') {
    if (close) return combo();
    if (canVanish && r < 0.5) return vanish(c, g);
    return r < 0.8 ? dashIn() : cast(c, 'finger');
  }
  // Kamehameha coming: only rush in if he can land a hit before it fires
  if (g.state === 'kameCharge') {
    if (close) return combo();
    if (canVanish) return vanish(c, g);
    if (ph >= 2 && game.kameCd <= 0) { game.kameCd = rand(7, 11); return startKame(c, true); }
    if (dist / 280 < g.t2 - 0.15) return dashIn();
    c.play('block'); c.t2 = g.t2 + 1.9; c.vx = 0; return;
  }
  // a Kamehameha only hits in front of him, so get behind it or answer with one
  if (g.state === 'kameFire') {
    if (ph >= 2 && game.kameCd <= 0) { game.kameCd = rand(7, 11); return startKame(c); }
    if (canVanish) return vanish(c, g);
    c.play('block'); c.t2 = 0.6; return;
  }
  // jumping in: kick him out of the air, or shoot him on the way down
  if (g.y < FLOOR - 20 && g.vy > 0 && dist < 70) return close ? startAttack(c, 'k2') : cast(c, 'finger');
  // openings: whiffed attack, landing, ki blast recovery, broken guard
  const open = g.guardBroken || ['land', 'cast', 'transform'].includes(g.state) || (g.state === 'attack' && g.hitDone && dist > 40);
  if (open) return close ? combo() : dist < 150 ? dashIn() : cast(c, 'finger');
  if (close) {
    if (g.state === 'attack' && r < 0.25 + ph * 0.12) { c.play('block'); c.t2 = 0.45; c.vx = 0; return; }
    // he's turtling: keep hitting if his stamina is low, otherwise step out and bait him
    if (g.state === 'block' && g.stamina > 40 && r < 0.45) { c.play('back', 'walk'); ai.think = 0.45; return; }
    return combo();
  }
  if (dist < 140) {
    if (r < 0.45) return dashIn();
    if (r < 0.62) return cast(c, 'finger');
    if (ph >= 1 && r < 0.75) return cast(c, 'death');
    if (r < 0.85) return c.play('back', 'walk');
    return c.play('walk');
  }
  if (ph >= 2 && game.kameCd <= 0 && r < 0.4) { game.kameCd = rand(7, 11); return startKame(c); }
  if (r < 0.28) return cast(c, 'finger');
  if (ph >= 1 && r < 0.45) return cast(c, 'barrage');
  if (canVanish && r < 0.58) return vanish(c, g);
  if (ph >= 1 && r < 0.68) return cast(c, 'death');
  if (ph < 2 && r < 0.75) { c.play('taunt', 'pose'); c.t2 = 0.8; return; }
  c.play('walk');
}

// ---------- projectiles & beams ----------
function updateProjectiles(dt) {
  for (const p of projs) {
    p.x += p.vx * dt;
    const foe = p.owner === goku ? cell : goku, len = art(FX_ART[p.kind]).width * p.owner.scale, b = foe.box();
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
  return { start: art(B.start), body: art(B.body), head: art(B.head), s: B.scale };
}

function updateBeams(dt) {
  beams = beams.filter(b => b.owner.state === 'kameFire');
  for (const b of beams) {
    b.t += dt;
    if (!clash) b.len = Math.min(b.len + 650 * dt, b.dir > 0 ? W + 40 - b.x0 : b.x0 + 40);
    const foe = b.owner === goku ? cell : goku, P = beamParts(b);
    const half = P.body.height * P.s * 0.4, tip = b.x0 + b.dir * b.len, fb = foe.box();
    const inX = b.dir > 0 ? fb.x0 < tip && fb.x1 > b.x0 : fb.x1 > tip && fb.x0 < b.x0;
    const inY = fb.y0 < b.y + half && fb.y1 > b.y - half;
    if (inX && inY && foe.visible && !clash && (b.tick -= dt) <= 0) {
      b.tick = 0.1;
      const lastHit = b.owner.t2 < 0.15;
      damage(foe, b.owner, b.dps * 0.1 * b.owner.dmgMul, lastHit, b.dir, 'beam');
      if (!lastHit) game.freeze = 0; // 10 ticks a second: hit-stop on each would stall the whole game
      if (foe.state === 'hurt') { foe.stun = 0.15; foe.vx = b.dir * 40; }
    }
  }
  // two beams meeting head-on = beam struggle
  const gb = beams.find(b => b.owner === goku), cb = beams.find(b => b.owner === cell);
  if (gb && cb && !clash && gb.dir !== cb.dir) {
    const gTip = gb.x0 + gb.dir * gb.len, cTip = cb.x0 + cb.dir * cb.len;
    if ((gb.dir > 0 && gTip >= cTip) || (gb.dir < 0 && gTip <= cTip)) {
      // always start the struggle halfway between them, wherever the tips happened to meet
      clash = { m: (gb.x0 + cb.x0) / 2 };
      game.banner = { text: 'MASH  J !', t: 0, dur: 99 };
    }
  }
  if (clash) {
    if (tap('j') || tap('u')) clash.m += gb.dir * 7;
    clash.m -= gb.dir * 34 * dt;
    gb.len = Math.abs(clash.m - gb.x0); cb.len = Math.abs(clash.m - cb.x0);
    game.shake = 2;
    if (Math.random() < dt * 8) sfx.punch();
    const won = Math.abs(clash.m - cell.x) < 22, lost = Math.abs(clash.m - goku.x) < 22;
    if (won || lost) {
      const [winner, loser] = won ? [goku, cell] : [cell, goku];
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

async function intro() {
  game.mode = 'intro'; game.skip = false;
  goku.visible = false; cell.play('idle'); cell.x = 240;
  await wait(0.8);
  await say('CELL', 'So... the great Son Goku. Once I absorb the androids, I will be PERFECT.');
  goku.x = 80; goku.visible = true; goku.play('teleIn', 'appear');
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
  await say('GOKU', "Here I come!");
  startFight();
}

async function startFight() {
  game.skip = false; game.dlg = null; timers = [];
  Object.assign(goku, { x: 80, y: FLOOR, visible: true, facing: 1 }); goku.play('idle');
  Object.assign(cell, { x: 240, y: FLOOR, visible: true, facing: -1 }); cell.play('idle');
  game.mode = 'ready';
  await banner('READY', 1.1);
  game.banner = { text: 'FIGHT!', t: 0, dur: 0.8 }; sfx.punch();
  game.mode = 'fight';
}

// Cell evolves at 2/3 and 1/3 health: Imperfect -> Semi-Perfect -> Perfect.
async function cellTransform() {
  const next = CELL_FORMS[game.phase + 1];
  game.mode = 'cut'; projs = []; beams = []; clash = null; game.banner = null;
  settle(goku); settle(cell);
  cell.play('power'); sfx.powerup(); game.shake = 6;
  await wait(0.6);
  await say('CELL', next === 'semi'
    ? 'Hehehe... Android 17 is part of me now. Let me show you my second form!'
    : 'With Android 18 I am finally complete... Behold my PERFECT form!');
  sfx.explode(); game.flash = 1; game.shake = 10;
  setCellForm(next); game.phase++;
  cell.play('power');
  await wait(1.2);
  cell.play('idle');
  if (next === 'perfect') {
    game.kameCd = 3;
    await say('CELL', 'Perfection! Go on, Goku. Entertain me.');
    if (goku.form === 'ssj') await say('GOKU', '(Time to go all out... fill my ki and press O!)');
  }
  if (goku.form === 'base') await say('GOKU', '(He keeps getting stronger... charge ki with I, then press T!)');
  game.mode = 'fight';
}

async function finish(result) {
  game.mode = 'ko'; game.result = result; clash = null; beams = []; projs = [];
  game.slow = 0.35;
  await banner(result === 'timeup' ? 'TIME!' : 'K.O.!', 1.4);
  game.slow = 1;
  for (const f of [goku, cell]) if (f.hp > 0) settle(f);
  const win = result === 'win' || (result === 'timeup' && goku.hp / goku.maxHp > cell.hp / cell.maxHp);
  game.result = win ? 'win' : 'lose';
  await wait(0.8);
  if (win) {
    goku.play('win');
    Audio8.music.winner();
    await say('GOKU', "It's over, Cell.");
  } else {
    cell.play('win'); Audio8.music.defeat();
    await say('CELL', 'Hahaha! Is that the best the Saiyans have? Pathetic!');
  }
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
  if (game.mode === 'title') {
    if (tap('enter')) { Audio8.init(); Audio8.music.play(); intro(); }
    return;
  }
  if (tap('p') && (game.mode === 'fight' || game.mode === 'paused')) {
    game.mode = game.mode === 'fight' ? 'paused' : 'fight';
    if (game.mode === 'paused') Audio8.music.stop(); else Audio8.music.play();
  }
  if (game.mode === 'paused') return;
  if (game.mode === 'end') { if (tap('enter')) { reset(); Audio8.music.play(); startFight(); } }
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
  Stage.update(raw);
  for (const tr of trails) tr.t += raw;
  trails = trails.filter(tr => tr.t < 0.22);
  if (game.freeze > 0) { game.freeze -= raw; return 'frozen'; }

  if (game.mode === 'fight') {
    playerInput(dt);
    if (!window.noAI) cellAI(dt);
    game.time -= dt;
    if (game.phase < 2 && cell.hp <= cell.maxHp * (2 - game.phase) / 3 && cell.hp > 0 && cell.free) { cellTransform(); return; }
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
    if (cell.hp <= 0) finish('win');
    else if (goku.hp <= 0) finish('lose');
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

function drawHUD() {
  // the icon follows Goku's form: normal head, Super Saiyan portrait, SSJ3 during the Dragon Fist
  const ult = goku.state.startsWith('ult');
  icon(art(ult ? FX_ART.ssj3Portrait : goku.form === 'ssj' ? FX_ART.gokuPortrait : FX_ART.gokuHead), 6, 5, !ult && goku.form === 'base');
  icon(art({ sheet: 'cell', ref: { id: CELL_ROW[cell.form] + '.0', h: 20 } }), W - 28, 5, true, true);
  bar(32, 7, 100, 7, goku.hp / goku.maxHp, goku.hp / goku.maxHp > 0.3 ? '#ffd23a' : '#ff4a3a');
  bar(W - 132, 7, 100, 7, cell.hp / cell.maxHp, CELL_INFO[cell.form].bar, true);
  ctx.fillStyle = '#000'; [1, 2].forEach(k => ctx.fillRect(W - 132 + Math.round(100 * k / 3), 7, 1, 7));
  const kiFull = goku.ki >= 100 && Math.floor(game.t * 6) % 2;
  bar(32, 17, 70, 4, goku.ki / 100, kiFull ? '#ffffff' : '#4fd2ff');
  const broken = goku.guardBroken && Math.floor(game.t * 8) % 2;
  bar(32, 24, 50, 2, goku.stamina / 100, broken ? '#ff5a3a' : goku.guardBroken ? '#a0503a' : '#9be36b');
  text(ult ? 'GOKU  SSJ3' : goku.form === 'ssj' ? 'GOKU  SSJ' : 'GOKU', 32, 28, 9, '#fff');
  text(CELL_INFO[cell.form].name, W - 32, 16, 9, '#fff', 'right');
  text(String(Math.max(0, Math.ceil(game.time))), W / 2, 4, 16, '#ffe04a', 'center');
  let hint = '';
  if (goku.form === 'base' && goku.ki >= 100) hint = 'PRESS T  -  SUPER SAIYAN!';
  else if (goku.form === 'ssj' && goku.ki >= 100) hint = 'U  KAMEHAMEHA    O  DRAGON FIST!';
  else if (goku.form === 'ssj' && goku.ki >= 50) hint = 'PRESS U  -  KAMEHAMEHA!';
  if (hint && game.mode === 'fight' && !beams.length) text(hint, W / 2, 32, 8, '#9ff', 'center');
}

// Icon in a dark frame. crop: draw just the top square of a tall portrait.
function icon(im, x, y, crop, flip) {
  const sw = im.width, sh = crop ? im.height : Math.min(im.height, im.width);
  const k = Math.min(22 / sw, 22 / sh);
  ctx.fillStyle = '#120c1c'; ctx.fillRect(x, y, 22, 22);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, 22, 22); ctx.clip();
  ctx.translate(x + 11, y + 22 - sh * k); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, 0, 0, sw, sh, -sw * k / 2, 0, sw * k, sh * k);
  ctx.restore();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - 0.5, 23, 23);
}

function drawDialogue() {
  const d = game.dlg; if (!d) return;
  const top = 38;
  ctx.fillStyle = 'rgba(8,6,20,0.85)'; ctx.fillRect(10, top, W - 20, 50);
  ctx.strokeStyle = d.who === 'GOKU' ? '#f2691c' : '#62bf4c'; ctx.lineWidth = 1; ctx.strokeRect(10.5, top + 0.5, W - 21, 49);
  text(d.who, 18, top + 4, 11, d.who === 'GOKU' ? '#ffb070' : '#a8e27c');
  ctx.font = '7px "Press Start 2P", monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const shown = d.text.slice(0, Math.floor(d.shown)), words = shown.split(' ');
  let line = '', y = top + 20;
  for (const w of words) {
    if (ctx.measureText(line + w).width > W - 40) { ctx.fillText(line, 18, y); line = ''; y += 10; }
    line += w + ' ';
  }
  ctx.fillText(line, 18, y);
  if (d.shown >= d.text.length && Math.floor(game.t * 3) % 2) text('ENTER', W - 16, top + 38, 8, '#ffe04a', 'right');
}

function drawTitle() {
  drawBackground(0.45);
  const p = art(FX_ART.gokuPortrait);
  ctx.drawImage(p, 14, 14, p.width * 1.3, p.height * 1.3);
  const c = Sheets.frame('cell', '12.0');
  ctx.save(); ctx.translate(W - 40, 92); ctx.scale(-1.5, 1.5); ctx.drawImage(c, -c.ax, -c.height); ctx.restore();
  text('GOKU', W / 2 - 4, 16, 30, '#ffb070', 'right');
  text('VS', W / 2, 42, 20, '#fff', 'center');
  text('CELL', W / 2 + 4, 16, 30, '#a8e27c', 'left');
  if (Math.floor(game.t * 2) % 2) text('PRESS ENTER', W / 2, 72, 14, '#ffe04a', 'center');
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 110, W, 68);
  ctx.font = '5px "Press Start 2P", monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  [
    'A/D MOVE   W JUMP   S BLOCK   SHIFT DASH',
    'J PUNCH   K KICK   (CHAIN THEM!)   L KI BLAST',
    'TOWARD CELL + J RUSH   TOWARD CELL + K SLASH',
    'TAP S RIGHT AS A HIT LANDS = PERFECT BLOCK (+KI)',
    'HOLD I CHARGE KI   Q TELEPORT   T SUPER SAIYAN',
    'U KAMEHAMEHA   O DRAGON FIST (SSJ, FULL KI)',
    'P PAUSE   V VOICES ON/OFF   ESC SKIP INTRO',
  ].forEach((l, i) => ctx.fillText(l, W / 2, 116 + i * 9));
}

function render() {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (game.mode === 'title') return drawTitle();
  const sh = game.shake;
  ctx.translate(Math.round(rand(-sh, sh)), Math.round(rand(-sh, sh)));
  drawBackground(game.mode === 'cut' ? 0.25 : 0);
  // shadows
  for (const f of [goku, cell]) if (f.visible) {
    const k = clamp(1 - (FLOOR - f.y) / 120, 0.3, 1);
    ctx.fillStyle = 'rgba(0,0,40,0.35)';
    ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 1, 13 * k, 3 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  // charging ki at the hands
  for (const f of [goku, cell]) if (f.state === 'kameCharge') {
    const [hx, hy] = f.hand('kameFire');
    FX.kiGlow(ctx, hx - f.facing * 8, hy, 2 + (1 - f.t2) * 5, game.t);
  }
  for (const tr of trails) {
    ctx.save(); ctx.globalAlpha = 0.4 * (1 - tr.t / 0.22);
    ctx.translate(Math.round(tr.x), Math.round(tr.y)); ctx.scale(tr.facing * tr.scale, tr.scale);
    ctx.drawImage(tr.im, -Math.round(tr.im.ax), -tr.im.height); ctx.restore();
  }
  const order = goku.state === 'attack' ? [cell, goku] : [goku, cell];
  order.forEach(f => f.draw());
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
    text(game.result === 'win' ? 'YOU WIN!' : 'CELL WINS', W / 2, 46, 28, game.result === 'win' ? '#ffe04a' : '#a8e27c', 'center');
    if (Math.floor(game.t * 2) % 2) text('PRESS ENTER TO FIGHT AGAIN', W / 2, 82, 10, '#fff', 'center');
  }
  if (game.mode === 'paused') text('PAUSED', W / 2, 70, 28, '#fff', 'center');
  drawDialogue();
}

reset();
Sheets.load().then(() => requestAnimationFrame(loop));
window.__game = () => ({ goku, cell, game, beams, projs, startKame, cellTransform });
