// Goku vs Cell boss fight. The world is 384x216 and is drawn at 3x.
const W = 320, H = 180, S = 4, FLOOR = 162, GRAV = 900;
const canvas = document.getElementById('game');
canvas.width = W * S; canvas.height = H * S;
const ctx = canvas.getContext('2d');
const bg = new Image(); bg.src = 'assets/img/old-theme.jpg';

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
const tap = k => pressed.has(k);

// ---------- fighters ----------
class Fighter {
  constructor(who, x, facing, maxHp) {
    Object.assign(this, {
      who, x, y: FLOOR, vx: 0, vy: 0, facing, hp: maxHp, maxHp, ki: 0, form: 'base',
      state: 'idle', anim: 'idle', at: 0, t2: 0, stun: 0, inv: 0, dmgMul: 1, speed: 1,
      visible: true, queue: [], next: null, hitDone: false, emitted: false,
      // Cell's sheet is drawn smaller than Goku's; 1.25 keeps pixels whole at 4x
      scale: who === 'cell' ? 1.25 : 1,
    });
  }
  A(name = this.anim) { return ANIMS[this.who][this.form][name] || ANIMS[this.who].base[name]; }
  play(anim, state = anim) { this.anim = anim; this.state = state; this.at = 0; this.hitDone = false; this.emitted = false; }
  get fi() { const a = this.A(), i = Math.floor(this.at * a.fps); return a.loop ? i % a.fr.length : Math.min(i, a.fr.length - 1); }
  get animDone() { const a = this.A(); return !a.loop && this.at * a.fps >= a.fr.length; }
  get img() { return Sheets.frame(this.who, this.A().fr[this.fi]); }
  get free() { return this.state === 'idle' || this.state === 'walk'; }
  box() { return { x0: this.x - 11, x1: this.x + 11, y0: this.y - 46, y1: this.y }; }
  hand(anim) {
    const a = this.A(anim), im = Sheets.frame(this.who, a.fr[a.emitAt ?? 0]);
    return [this.x + this.facing * (im.width - im.ax) * this.scale, this.y - a.emit * this.scale];
  }
  draw() {
    if (!this.visible) return;
    const im = this.img;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.scale(this.facing * this.scale, this.scale);
    if (this.inv > 0 && Math.floor(this.inv * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.drawImage(im, -Math.round(im.ax), -im.height);
    ctx.restore();
  }
}

let goku, cell, projs, beams, sparks, ghosts, clash, timers, game;

function reset() {
  goku = new Fighter('goku', 80, 1, 100);
  cell = new Fighter('cell', 240, -1, 240);
  projs = []; beams = []; sparks = []; ghosts = []; clash = null; timers = [];
  game = { mode: 'title', time: 99, freeze: 0, shake: 0, flash: 0, phase2: false, slow: 1, banner: null, dlg: null, skip: false, result: null, t: 0, kameCd: 4 };
}

// ---------- combat ----------
function damage(def, src, dmg, heavy, dir) {
  if (def.inv > 0 || ['down', 'knock', 'tele', 'transform'].includes(def.state) || def.hp <= 0 || game.mode !== 'fight') return false;
  const blocking = def.state === 'block' && def.facing === -dir;
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
  if (!blocking) {
    def.queue = []; def.next = null;
    if (heavy || def.hp <= 0) { def.play('knock'); def.vy = -230; def.vx = dir * 160; def.y -= 1; sfx.kick(); }
    else { def.play('hurt'); def.stun = 0.3; def.vx = dir * 70; sfx.punch(); }
    if (def === goku && Math.random() < 0.3) sfx.hurt();
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

function startAttack(f, name) {
  f.play(name, 'attack'); f.vx = f.facing * 50;
}

function cast(f, name) {
  f.play(name, 'cast'); f.vx = 0;
}

function spawnProjectile(f) {
  const kind = { kiCast: 'kiBall', finger: 'finger', death: 'death' }[f.anim];
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

function startKame(f) {
  f.play('kameCharge', 'kameCharge'); f.t2 = f === goku ? 0.9 : 1.3; f.vx = 0;
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
      if (!f.emitted && f.fi >= f.A().emitAt) { f.emitted = true; spawnProjectile(f); }
      if (f.animDone) f.play('idle');
      break;
    case 'hurt': if ((f.stun -= dt) <= 0) f.play('idle'); break;
    case 'down':
      if ((f.t2 -= dt) <= 0 && f.hp > 0) { f.play('idle'); f.inv = 0.7; }
      break;
    case 'jump': if (f.vy > 0) f.play('fall', 'jump'); break;
    case 'land': if (f.animDone) f.play('idle'); break;
    case 'dash': if ((f.t2 -= dt) <= 0) { f.vx = 0; f.play('idle'); } break;
    case 'block': if (f !== goku && (f.t2 -= dt) <= 0) f.play('idle'); break;
    case 'tele':
      if ((f.t2 -= dt) <= 0 && !f.visible) {
        f.x = f.teleTo; f.visible = true; f.facing = foe.x > f.x ? 1 : -1;
        ghosts.push({ img: art(FX_ART.teleport), x: f.x, y: f.y, t: 0 });
        if (f.who === 'goku') f.play('teleIn', 'appear'); else { f.play('idle'); f.inv = 0.15; }
      } else if (f.t2 <= 0.2) f.visible = false;
      break;
    case 'appear': if (f.animDone) f.play('idle'); break;
    case 'kameCharge': if ((f.t2 -= dt) <= 0) fireKame(f); break;
    case 'kameFire':
      if ((f.t2 -= dt) <= 0 && !clash) { beams = beams.filter(b => b.owner !== f); f.play('idle'); }
      break;
    case 'transform':
      if (f.animDone) {
        f.form = 'ssj'; f.dmgMul = 1.35; f.speed = 1.15; f.play('idle');
        game.flash = 1; game.shake = 8; sfx.explode();
      }
      break;
  }
}

function landed(f) {
  if (f.state === 'knock') { f.play('down'); f.t2 = f.hp > 0 ? 0.7 : 99; f.vx = 0; game.shake = 4; sfx.kick(); }
  else if (['jump', 'airAtk'].includes(f.state)) { f.play('land'); f.vx = 0; }
}

// ---------- player ----------
const NEXT_P = { p1: 'p2', p2: 'p3', p3: 'p4', k1: 'p2', k2: 'p3' };
const NEXT_K = { p1: 'k1', p2: 'k2', p3: 'k3', k1: 'k2', k2: 'k3' };

function playerInput(dt) {
  const g = goku, dir = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  if (g.free) {
    g.facing = cell.x > g.x ? 1 : -1;
    if (keys.s) { g.play('block'); g.vx = 0; return; }
    if (keys.i) { g.play('charge'); g.vx = 0; sfx.charge(0.5); return; }
    if (tap('w') || tap(' ')) { g.play('jump'); g.vy = -370; g.vx = dir * 120; sfx.whoosh(); return; }
    if (tap('shift')) { g.play('dash'); g.t2 = 0.2; g.vx = (dir || g.facing) * 300; sfx.whoosh(); return; }
    if (tap('j')) return startAttack(g, 'p1');
    if (tap('k')) return startAttack(g, 'k1');
    if (tap('l') && g.ki >= 8) { g.ki -= 8; return cast(g, 'kiCast'); }
    if (tap('q') && g.ki >= 15) { g.ki -= 15; return teleport(g, cell); }
    if (tap('t') && g.form === 'base' && g.ki >= 100) {
      g.ki = 50; g.play('transform'); g.vx = 0; g.inv = 2; sfx.powerup(); game.shake = 5; return;
    }
    if (tap('u') && g.form === 'ssj' && g.ki >= 50) { g.ki -= 50; return startKame(g); }
    if (dir) { if (g.anim !== 'walk') g.play('walk'); g.vx = dir * 100 * g.speed; }
    else if (g.state !== 'idle') { g.play('idle'); g.vx = 0; }
  } else if (g.state === 'jump') {
    g.vx = dir * 120;
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
const ai = { think: 0.8 };
function cellAI(dt) {
  const c = cell, g = goku;
  game.kameCd -= dt;
  // dodge incoming ki blasts now and then
  for (const p of projs) if (p.owner === g && !p.seen && Math.abs(p.x - c.x) < 70) {
    p.seen = true;
    if (c.free && Math.random() < 0.3) return teleport(c, g);
  }
  if (!c.free) return;
  c.facing = g.x > c.x ? 1 : -1;
  const dist = Math.abs(g.x - c.x);
  if ((ai.think -= dt) > 0) { if (c.state === 'walk') c.vx = c.facing * 70 * c.speed; return; }
  ai.think = rand(0.25, 0.6) / c.speed;
  const r = Math.random(), p2 = game.phase2;
  if (dist < 48) {
    if (g.state === 'attack' && r < 0.35) { c.play('block'); c.t2 = 0.5; c.vx = 0; return; }
    if (r < 0.1) return teleport(c, g);
    c.queue = pick([['p2', 'k2'], ['p1', 'p2', 'k2'], ['k1', 'k2'], ['p1', 'k1']]).slice(0, p2 ? 3 : 2);
    startAttack(c, c.queue.shift());
    ai.think = rand(0.6, 1.1) / c.speed;
  } else if (dist < 140) {
    if (r < 0.45) { c.play('dash'); c.t2 = 0.24; c.vx = c.facing * 260 * c.speed; }
    else if (r < 0.65) cast(c, 'finger');
    else if (p2 && r < 0.78) cast(c, 'death');
    else { c.play('walk'); }
  } else {
    if (p2 && game.kameCd <= 0 && r < 0.4) { game.kameCd = rand(8, 12); return startKame(c); }
    if (r < 0.35) cast(c, 'finger');
    else if (r < 0.5) teleport(c, g);
    else if (p2 && r < 0.62) cast(c, 'death');
    else c.play('walk');
  }
}

// ---------- projectiles & beams ----------
function updateProjectiles(dt) {
  for (const p of projs) {
    p.x += p.vx * dt;
    const foe = p.owner === goku ? cell : goku, im = art(FX_ART[p.kind]), b = foe.box();
    const x0 = p.dir > 0 ? p.x : p.x - im.width, x1 = p.dir > 0 ? p.x + im.width : p.x;
    if (x1 > b.x0 && x0 < b.x1 && p.y > b.y0 && p.y < b.y1 && foe.visible) {
      if (damage(foe, p.owner, p.dmg, p.heavy, p.dir)) p.dead = true;
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
      damage(foe, b.owner, b.dps * 0.1 * b.owner.dmgMul, lastHit, b.dir);
      if (foe.state === 'hurt') { foe.stun = 0.15; foe.vx = b.dir * 40; }
    }
  }
  // two beams meeting head-on = beam struggle
  const gb = beams.find(b => b.owner === goku), cb = beams.find(b => b.owner === cell);
  if (gb && cb && !clash && gb.dir !== cb.dir) {
    const gTip = gb.x0 + gb.dir * gb.len, cTip = cb.x0 + cb.dir * cb.len;
    if ((gb.dir > 0 && gTip >= cTip) || (gb.dir < 0 && gTip <= cTip)) {
      clash = { m: (gTip + cTip) / 2 };
      game.banner = { text: 'MASH  J !', t: 0, dur: 99 };
    }
  }
  if (clash) {
    if (tap('j') || tap('u')) clash.m += gb.dir * 7;
    clash.m -= gb.dir * (game.phase2 ? 34 : 28) * dt;
    gb.len = Math.abs(clash.m - gb.x0); cb.len = Math.abs(clash.m - cb.x0);
    game.shake = 2;
    if (Math.random() < dt * 8) sfx.punch();
    const won = Math.abs(clash.m - cell.x) < 22, lost = Math.abs(clash.m - goku.x) < 22;
    if (won || lost) {
      const [winner, loser] = won ? [goku, cell] : [cell, goku];
      clash = null; game.banner = null;
      beams = beams.filter(b => b.owner === winner);
      winner.t2 = 0.4; loser.play('idle');
      damage(loser, winner, 38, true, winner.facing);
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
function wait(sec) { return new Promise(r => game.skip ? r() : timers.push({ t: sec, r })); }
function say(who, text) {
  return new Promise(r => {
    if (game.skip) return r();
    game.dlg = { who, text, shown: 0, done: r };
  });
}
function banner(text, dur) { game.banner = { text, t: 0, dur }; return wait(dur); }

async function intro() {
  game.mode = 'intro'; game.skip = false;
  goku.visible = false; cell.play('idle'); cell.x = 240;
  await wait(0.8);
  await say('CELL', 'So... the great Son Goku finally decided to show up.');
  goku.x = 80; goku.visible = true; goku.play('teleIn', 'appear');
  ghosts.push({ img: art(FX_ART.teleport), x: goku.x, y: FLOOR, t: 0 }); sfx.teleport();
  await wait(0.7);
  await say('GOKU', "Cell! Your little games end right here.");
  cell.play('taunt');
  await say('CELL', 'Hahaha! Then show me everything a Saiyan has, before I erase you!');
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

async function cellPowerUp() {
  game.mode = 'cut'; projs = []; beams = []; clash = null;
  for (const f of [goku, cell]) { f.vx = 0; f.queue = []; f.next = null; if (f.y >= FLOOR && f.hp > 0) f.play('idle'); }
  goku.y = FLOOR; goku.vy = 0;
  cell.play('power'); sfx.powerup(); game.shake = 6;
  await wait(0.6);
  await say('CELL', "Impressive... but playtime is over. Witness my PERFECT power!");
  sfx.explode(); game.flash = 1; game.shake = 8;
  await wait(1);
  cell.play('idle');
  Object.assign(cell, { speed: 1.25, dmgMul: 1.3 });
  game.phase2 = true; game.kameCd = 3;
  if (goku.form === 'base' && goku.ki < 100) await say('GOKU', '(I need more power... charge ki with I, then press T!)');
  game.mode = 'fight';
}

async function finish(result) {
  game.mode = 'ko'; game.result = result; clash = null; beams = []; projs = [];
  game.slow = 0.35;
  await banner(result === 'timeup' ? 'TIME!' : 'K.O.!', 1.4);
  game.slow = 1;
  const win = result === 'win' || (result === 'timeup' && goku.hp / goku.maxHp > cell.hp / cell.maxHp);
  game.result = win ? 'win' : 'lose';
  await wait(0.8);
  if (win) {
    if (goku.y >= FLOOR) goku.play('win');
    Audio8.music.winner();
    await say('GOKU', "It's over, Cell.");
  } else {
    cell.play('win');
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
  if (game.mode === 'title') {
    if (tap('enter')) { Audio8.init(); Audio8.music.play(); intro(); }
    return;
  }
  if (tap('p') && (game.mode === 'fight' || game.mode === 'paused')) game.mode = game.mode === 'fight' ? 'paused' : 'fight';
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
  timers = timers.filter(t => (t.t -= dt) > 0 || (t.r(), false));
  if (game.banner && (game.banner.t += raw) > game.banner.dur) game.banner = null;
  game.shake = Math.max(0, game.shake - raw * 20);
  game.flash = Math.max(0, game.flash - raw * 2.5);
  for (const s of sparks) s.t += raw;
  sparks = sparks.filter(s => s.t < 0.3);
  for (const gh of ghosts) gh.t += raw;
  ghosts = ghosts.filter(gh => gh.t < 0.3);
  if (game.freeze > 0) { game.freeze -= raw; return 'frozen'; }

  if (game.mode === 'fight') {
    playerInput(dt);
    if (!window.noAI) cellAI(dt);
    game.time -= dt;
    if (!game.phase2 && cell.hp <= cell.maxHp * 0.5 && cell.hp > 0 && cell.free) { cellPowerUp(); return; }
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
  ctx.imageSmoothingEnabled = true;
  if (bg.complete && bg.naturalWidth) {
    const sc = H / bg.naturalHeight, w = bg.naturalWidth * sc;
    ctx.drawImage(bg, (W - w) / 2, 0, w, H);
  } else { ctx.fillStyle = '#4a8'; ctx.fillRect(0, 0, W, H); }
  ctx.imageSmoothingEnabled = false;
  if (dim) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, W, H); }
}

function bar(x, y, w, h, v, color, flip) {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1010'; ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(v, 0, 1));
  ctx.fillStyle = color; ctx.fillRect(flip ? x + w - fw : x, y, fw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(flip ? x + w - fw : x, y, fw, 1);
}

function drawHUD() {
  const portrait = art(FX_ART.gokuPortrait);
  ctx.drawImage(portrait, 0, 0, portrait.width, 40, 6, 5, 22, 22);
  ctx.strokeStyle = '#000'; ctx.strokeRect(5.5, 4.5, 23, 23);
  const head = art(FX_ART.cellHead);
  ctx.save(); ctx.translate(W - 6, 5); ctx.scale(-1, 1); ctx.drawImage(head, 0, 0, 22, 22 * head.height / head.width); ctx.restore();
  bar(32, 7, 100, 7, goku.hp / goku.maxHp, goku.hp / goku.maxHp > 0.3 ? '#ffd23a' : '#ff4a3a');
  bar(W - 132, 7, 100, 7, cell.hp / cell.maxHp, game.phase2 ? '#c27aff' : '#7be05a', true);
  const kiFull = goku.ki >= 100 && Math.floor(game.t * 6) % 2;
  bar(32, 17, 70, 4, goku.ki / 100, kiFull ? '#ffffff' : '#4fd2ff');
  text(goku.form === 'ssj' ? 'GOKU  SSJ' : 'GOKU', 32, 22, 9, '#fff');
  text(game.phase2 ? 'PERFECT CELL' : 'CELL', W - 32, 16, 9, '#fff', 'right');
  text(String(Math.max(0, Math.ceil(game.time))), W / 2, 4, 16, '#ffe04a', 'center');
  let hint = '';
  if (goku.form === 'base' && goku.ki >= 100) hint = 'PRESS T  -  SUPER SAIYAN!';
  else if (goku.form === 'ssj' && goku.ki >= 50) hint = 'PRESS U  -  KAMEHAMEHA!';
  if (hint && game.mode === 'fight' && !beams.length) text(hint, W / 2, 32, 8, '#9ff', 'center');
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
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 112, W, 60);
  ctx.font = '5px "Press Start 2P", monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  [
    'A/D MOVE   W JUMP   S BLOCK   SHIFT DASH',
    'J PUNCH   K KICK   (CHAIN THEM!)   L KI BLAST',
    'HOLD I CHARGE KI   Q TELEPORT   T SUPER SAIYAN',
    'U KAMEHAMEHA (SSJ)   P PAUSE   ESC SKIP INTRO',
  ].forEach((l, i) => ctx.fillText(l, W / 2, 120 + i * 12));
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
window.__game = () => ({ goku, cell, game, beams, projs, startKame, cellPowerUp });
