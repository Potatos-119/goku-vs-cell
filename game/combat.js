// ---------- combat ----------
// kind: 'melee' | 'proj' | 'beam' | 'ult' (ultimates can't be blocked or dodged)
// opts: launch / spike / wallBounce / grab from the attack, token for combo recognition
const JUGGLE_MAX = 5;
// combo damage scaling for hits on the player (see the scaling below), and how long a gap still
// keeps the boss's hits in one combo
const PLAYER_SCALING = { step: 0.09, min: 0.35, beamMin: 0.6 };
const BOSS_COMBO_GAP = 1.5;
// caught starting their own move: a counter hit, which hurts more and stuns for longer
const COUNTER_STATES = ['attack', 'airAtk', 'cast', 'kameCharge', 'windup'];
function damage(def, src, dmg, heavy, dir, kind = 'melee', opts = {}) {
  if ((def.inv > 0 && kind !== 'ult') || (def.state === 'down' && !opts.otg) || ['tele', 'transform', 'evolve'].includes(def.state) || def.hp <= 0 || game.mode !== 'fight') return false;
  if (def === player) dmg *= diff().taken;
  // a Super Dash swats ki blasts aside, and so does a boss being spammed with them while it attacks
  // or dashes in, so spam gets plowed through instead of locking it down
  if (kind === 'proj' && !opts.pierce && ((def.superDash && def.state === 'dash') || (def === boss && ai.spam >= 2 && ['attack', 'dash'].includes(def.state)))) {
    sparks.push({ x: def.x + def.facing * 10, y: def.y - 30, t: 0, c: '#ffffff' }); sfx.parry(); return 'deflect';
  }
  // someone already flying can be juggled a few times, but not by beams (that would never end)
  const juggling = def.state === 'knock';
  // the air re-launch (F) sends them back up once per combo, and buys the juggle a little room;
  // used again in the same combo it's just an air hit
  if (opts.relaunch && juggling) {
    if (def.relaunched) opts = { ...opts, launch: false, relaunch: false };
    else { def.relaunched = true; def.juggle = Math.max(0, def.juggle - 2); }
  }
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
    // the guard takes it differently by what it is: a light hit drives them into a crouch, a heavy
    // one (or a launcher) knocks them back off their feet, and in the air it just pushes them away
    if (def.y < FLOOR - 2 && def.A('airBlock')) { def.anim = 'airBlock'; def.at = 0; def.vx = dir * 130; def.vy = Math.min(def.vy, -70); }
    else if ((heavy || opts.launch) && def.A('blockHeavy')) { def.anim = 'blockHeavy'; def.at = 0; def.vx = dir * 170; def.vy = -110; def.y -= 1; Stage.puff(def.x, -dir); }
    else if (def.A('blockHit')) { def.anim = 'blockHit'; def.at = 0; }
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
    else {
      Object.assign(game.combo, { n: 0, dmg: 0, moves: [], done: new Set() });
      // the boss's hits on the player, read the same way (a fresh combo when the player was free)
      if (def === player) {
        // a combo is hits less than BOSS_COMBO_GAP apart, so a Vanish Strike or a Cell Junior arriving
        // a moment later still counts as part of it
        if (game.t - (game.bossCombo.last ?? -9) > BOSS_COMBO_GAP) Object.assign(game.bossCombo, { moves: [], done: new Set(), dmg: 0 });
        game.bossCombo.last = game.t;
        if (counter) comboToken('counter', src);
        comboToken(opts.token || (kind === 'melee' ? src.anim : kind), src);
      }
    }
    // long combos hit softer and stun for less, so there are no infinites
    // (beams keep more of their damage: they're the combo's finisher)
    // the boss's combos on the player scale down harder (PLAYER_SCALING), so one long combo can't take
    // most of your health
    const sc = def === player ? PLAYER_SCALING : { step: 0.07, min: 0.45, beamMin: 0.75 };
    dmg *= Math.max(kind === 'beam' ? sc.beamMin : sc.min, 1 - sc.step * def.comboTaken);
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
  else if (def === player && !blocking) game.bossCombo.dmg = (game.bossCombo.dmg || 0) + hpBefore - def.hp;
  // a fighter mid-Kamehameha takes the damage but keeps firing, unless it finishes them
  const armored = def.state === 'kameFire' && def.hp > 0;
  // chip damage through the guard can finish someone too: then they go down like any K.O., instead
  // of being left standing in their guard
  if (blocking && def.hp <= 0) blocking = false;
  if (!blocking && !armored) {
    def.queue = []; def.next = null;
    if (juggling || heavy || opts.launch || opts.spike || def.hp <= 0) {
      def.juggle = juggling ? def.juggle + (kind === 'beam' ? 0 : 1) : 0;
      def.play('knock'); def.y -= 1;
      if (kind === 'proj') sfx.kiHit(); else if (kind === 'beam') sfx.clash(); else sfx.smash();
      if (opts.spike) { def.vy = 420; def.vx = dir * 40; def.spiked = true; }
      else if (opts.launch) { def.vy = -390; def.vx = dir * 45; if (src === player) { comboToken('launch'); game.chaseT = 0.55; } else if (def === player) comboToken('launch', src); }
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
      // the re-launch carries the attacker up after them, with their air dash back
      if (opts.relaunch && src.state === 'airAtk') {
        src.vy = -340; src.airDashed = false; def.vy = -330;
        popups.push({ text: 'RE-LAUNCH!', x: def.x, y: def.y - 60, t: 0, c: '#9ff' }); Stage.shock(def.x, 0.6);
      }
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
  // a dunk (spike) comes down from above, so it reaches further below his feet
  const below = h.spike ? 34 : -8;
  if (x1 < b.x0 || x0 > b.x1 || f.y + below < b.y0 || f.y - 44 > b.y1) { sfx.whoosh(); return; }
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
  if (name === 'p3' && f.who === 'cell') f.vx = f.facing * 150; // the lunge carries him in
  if (name === 'grab') f.vx = f.facing * 200;
}

function cast(f, name) {
  f.play(name, 'cast'); f.vx = 0; f.charged = false; f.chargeLv = 0;
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
  const p = { owner: f, kind, x: hx, y: hy, dir: f.facing, vx: stats[0] * f.facing, dmg: stats[1] * f.dmgMul, heavy: stats[2], size: 1 };
  // a charged one (held L): bigger, harder and a little slower
  const lv = f.charged ? f.chargeLv || 0 : 0;
  if (lv > 0) {
    if (kind === 'kiBall') { p.dmg = (6 + 14 * lv) * f.dmgMul; p.size = 1 + 0.9 * lv; p.vx *= 1 - 0.15 * lv; p.heavy = lv >= 0.7; }
    if (kind === 'death') { p.dmg = (8 + 16 * lv) * f.dmgMul; p.size = 1 + 0.5 * lv; p.heavy = lv >= 0.5; }
    f.charged = false; f.chargeLv = 0;
    if (lv > 0.6) { sfx.smash(); Stage.puff(f.x, -f.facing); }
  }
  // the Special Beam Cannon is long: it starts with its tip at the finger and shoots out of it
  if (kind === 'cannon') { p.ox = hx; p.x = hx - f.facing * art(FX_ART.cannon).width * f.scale; }
  projs.push(p);
  // a barrage is one rapid volley of sound, started with its first shot
  if (kind === 'cannon') { (sfx.cannon || sfx.beam)(); shake(4); }
  else if (f.anim === 'barrage') { if (f.emitted === 1) sfx.barrage(); }
  else sfx.blast();
}

// Holding L: Goku holds both hands full of ki, Cell holds his Death Beam at his fingertip. Let go and
// it fires, bigger and stronger the longer it was held (full after HOLD_FULL seconds: Goku's ki blast
// up to 20 damage and twice the size, Cell's Death Beam up to 24; both knock down near full).
const HOLD_FULL = 1.0;
function startHold(f) {
  f.play(f.who === 'goku' ? 'kiHold' : 'deathHold', 'kiHold'); f.vx = 0; f.holdT = 0; f.chargeLv = 0;
  if (f.y < FLOOR - 4) f.vy = Math.min(f.vy, -40);
  sfx.chargeLoop(f);
}
function releaseHold(f) {
  const goku = f.who === 'goku', name = goku ? 'kiCast' : 'death', A = ANIMS[f.who][f.form][name] || ANIMS[f.who].base[name];
  const lv = f.chargeLv;
  f.play(name, 'cast'); f.charged = true; f.chargeLv = lv;
  // straight to the throw: the frame the blast leaves on
  f.at = ([].concat(A.emitAt)[0] + 0.01) / A.fps;
  if (lv > 0.6) { shake(3 + lv * 4); Voice.shout(f.who, goku ? 'Haaa!' : 'Die!'); }
}

// the streaks a fighter leaves when vanishing (Goku's orange, Cell's green)
const teleArt = f => art(f.who === 'goku' ? FX_ART.gokuTeleport : FX_ART.teleport);

function teleport(f, foe) {
  if (f === player && game.combo.n > 0) comboToken('vanish');
  else if (f === boss && player.comboTaken > 0) comboToken('vanish', boss);
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
  // the charge animation is timed to reach its last frame (hands pulled back) as the beam fires: a
  // quick one starts part-way through it
  { const A = f.A(); if (!A.loop) f.at = Math.max(0, A.fr.length / A.fps - f.t2); }
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
  sfx.spiritGather(gather); shake(3);
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
      sb.phase = 'fly'; sb.t = 0; sfx.spiritThrow(); shake(5);
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
  gfx.save(); gfx.globalCompositeOperation = 'lighter';
  if (sb.phase === 'boom') {
    // the explosion: its two rings, swelling and fading out
    const k = sb.t / 0.6;
    [[FX_ART.spiritRing1, 0.5 + k * 0.7], [FX_ART.spiritRing2, 0.3 + k * 1.1]].forEach(([a, sc]) => {
      const im = art(a), w = im.width * sc * 0.6, h = im.height * sc * 0.6;
      gfx.globalAlpha = Math.max(0, 1 - k); gfx.drawImage(im, sb.x - w / 2, sb.y - h / 2, w, h);
    });
  } else {
    const im = art(FX_ART.spiritBall), fade = sb.phase === 'fizzle' ? Math.max(0, 1 - sb.t / 0.3) : 1;
    const r = sb.r * (sb.phase === 'fizzle' ? 1 + sb.t * 2 : 1) * (1 + 0.04 * Math.sin(game.t * 25));
    const g = gfx.createRadialGradient(sb.x, sb.y, r * 0.5, sb.x, sb.y, r * 1.8);
    g.addColorStop(0, `rgba(120,230,255,${0.5 * fade})`); g.addColorStop(1, 'rgba(60,160,255,0)');
    gfx.fillStyle = g; gfx.beginPath(); gfx.arc(sb.x, sb.y, r * 1.8, 0, Math.PI * 2); gfx.fill();
    gfx.globalAlpha = fade; gfx.drawImage(im, sb.x - r, sb.y - r, r * 2, r * 2);
  }
  gfx.restore();
}

function startUlt(f) {
  f.ki = 0; f.play('ult1'); f.t2 = 1.0; f.inv = 3; f.vx = 0;
  sfx.powerup(); shake(6); game.flash = 0.6;
  popups.push({ text: 'SUPER SAIYAN 3!', x: f.x, y: f.y - 70, t: 0, c: '#ffe04a' });
}
