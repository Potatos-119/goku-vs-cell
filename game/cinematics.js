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
  if (def === player && !game.versus) dur *= diff().window; // Easy gives you longer to answer
  const r = { def, t: 0, dur, answer: null, at: 0 };
  if (!human(def)) {
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
  const d = r.def, isP = human(d), c = ctlOf(d);
  let a = null;
  if (isP) {
    if (c.pressed.has('beam') && canKame(d) && d.ki >= COUNTER_KI) a = 'beam';
    else if (c.pressed.has('vanish') && d.ki >= 15) a = 'vanish';
    else if (c.keys.block && r.t > 0.2) a = 'block';
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
  game.flash = 1; shake(12); sfx.explode(); Stage.strike();
  if (a === 'vanish') {
    const perfect = r.dur - r.at <= REACT_PERFECT;
    await wait(0.12, true);
    // reappear behind the attacker, out of the beam's way
    const x = clamp(f.x - f.facing * 30, 20, W - 20);
    Object.assign(foe, { x, y: FLOOR, visible: true, floating: false, vx: 0, vy: 0, facing: f.x > x ? 1 : -1 });
    ghosts.push({ img: teleArt(foe), x, y: FLOOR, t: 0 }); sfx.teleport();
    if (perfect) {
      foe.play('idle', 'pose'); f.inv = 0;
      if (human(foe)) foe.ki = Math.min(100, foe.ki + 12);
      popups.push({ text: 'PERFECT DODGE!', x, y: FLOOR - 60, t: 0, c: '#ffe04a' });
      sfx.parry(); game.slow = 0.4;
      await wait(0.35, true);
      game.slow = 1;
      return; // the attacker is still firing the other way: punish them
    }
    directDamage(foe, dmg / 3);
    if (foe.hp <= 0) knock(); else foe.play('hurt', 'pose');
    popups.push({ text: 'TOO EARLY - GRAZED!', x, y: FLOOR - 60, t: 0, c: '#ff8a6a' });
    await wait(0.9, true);
    if (f.state === 'kameFire') f.t2 = Math.min(f.t2, 0.01); // already paid for it: the beam is done
    return;
  }
  if (a === 'block') {
    directDamage(foe, dmg / 2);
    if (foe.hp <= 0) { knock(); await wait(1.2, true); return; }
    Object.assign(foe, { stamina: 0, guardBroken: true, staminaDelay: 0.8, vx: f.facing * 60 });
    popups.push({ text: 'GUARD BREAK!', x: foe.x, y: foe.y - 58, t: 0, c: '#ff7a5a' });
    sfx.guardBreak();
    await wait(1.2, true);
    if (f.state === 'kameFire') f.t2 = Math.min(f.t2, 0.01); // already paid for it: the beam is done
    return;
  }
  directDamage(foe, dmg);
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
// Instant Transmission the way the full-gi Super Saiyan sheet draws it. From the ground he crouches
// and leaps up first; then, in the air, he turns and zips away. He reappears behind them (in the air
// too if they're up there; in front if they're backed against the edge), and holds the Kamehameha at
// his side, ready to fire. Only his full gi has these frames: hasTeleKame says whether he can.
const hasTeleKame = f => f.who === 'goku' && f.form === 'ssj' && !!f.A('itHold') && !(f.torn && ANIMS.goku.ssjT);
async function teleKame(f, foe, chant = true) {
  const ground = f.y >= FLOOR - 2;
  const pose = name => { f.play(name, 'pose'); f.t2 = 99; };
  const run = async name => { pose(name); const a = f.A(); await wait(a.fr.length / a.fps); };
  Object.assign(f, { vx: 0, vy: 0, visible: true, floating: true, facing: foe.x > f.x ? 1 : -1 });
  if (chant) { Voice.shout('goku', 'Ka... me... ha... me...'); if (!sfx.kameChant(f, 2.6)) sfx.charge(1.8); }
  if (ground) {
    // crouch...
    pose('itCrouch'); f.sq = 0.12; await wait(0.3);
    // ...and leap: up he goes, fast off the ground and slowing near the top
    pose('itLeap'); f.sq = -0.14; sfx.whoosh(); Stage.puff(f.x, 1); Stage.puff(f.x, -1);
    for (let i = 0; i < 12; i++) { f.y -= 9 - i * 0.6; await wait(0.03); }
  }
  // in the air (up there from his leap, or already): he turns, sets himself and zips away
  await run('itAir');
  ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 }); sfx.teleport();
  f.visible = false;
  await wait(0.3);
  // he reappears behind them, a step away so the two don't overlap (in front if they're backed
  // against the edge)
  let x = foe.x - foe.facing * 38;
  if (x < 16 || x > W - 16) x = foe.x + foe.facing * 38;
  const air = foe.y < FLOOR - 12;
  f.facing = foe.x > x ? 1 : -1;
  // right there with them: up in the air if they are, on the ring if they're standing
  Object.assign(f, { x, y: air ? foe.y : FLOOR, visible: true });
  ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 }); sfx.teleport();
  if (!air) { Stage.puff(f.x, 1); Stage.puff(f.x, -1); }
  cam.focus = { x: (f.x + foe.x) / 2, y: Math.min(FLOOR, (f.y + foe.y) / 2 + 20), z: 1.5 };
  // the Kamehameha drawn back at his side, ready
  pose('itHold'); f.floating = f.y < FLOOR - 2;
  await wait(0.25);
}

async function instantKame(f) {
  const foe = foeOf(f), scale = comboScale(foe, 'ult'); // out of a combo, it's worth less
  f.ki = 0;
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  settle(foe);
  if (hasTeleKame(f)) {
    f.inv = 99; cam.focus = { f, z: 1.25 };
    await teleKame(f, foe);
    foe.facing = f.x > foe.x ? 1 : -1; foe.play('idle', 'pose'); foe.t2 = 99;
    return instantKameFire(f, foe, scale);
  }
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
  return instantKameFire(f, foe, scale);
}
// the moment after he reappears: they get a moment to answer, then the point-blank beam
async function instantKameFire(f, foe, scale) {
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
  await cinematicBeam(f, foe, r, 60 * scale, () => {
    foe.play('knock'); foe.vy = -320; foe.vx = f.facing * 230; foe.y -= 1; Stage.crack(foe.x, 2);
  }, 'INSTANT KAMEHAMEHA!');
  endCinematic(f, foe);
}

// The blow that wins it: Cell is down to nothing and Goku finishes him with a Kamehameha. As a
// Super Saiyan in his full gi it's the Instant Transmission one (from the ground or from the air, as
// he is); otherwise (base, Kaioken, the torn gi) the regular one, aimed at wherever Cell is.
async function winBlow(f, foe) {
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  for (const x of [f, foe]) { sfx.stopSustain(x); sfx.stopKame(x); }
  // Cell hangs where the last hit left him
  Object.assign(foe, { vx: 0, vy: 0, visible: true, floating: foe.y < FLOOR - 4 }); foe.play(foe.y < FLOOR - 4 ? 'knock' : 'hurt', 'pose'); foe.t2 = 99;
  Object.assign(f, { vx: 0, vy: 0, visible: true, inv: 99 });
  if (f.state === 'tele') f.x = f.teleTo ?? f.x;
  game.slow = 0.5; cam.focus = { f, z: 1.3 };
  if (hasTeleKame(f)) await teleKame(f, foe);
  else {
    f.facing = foe.x > f.x ? 1 : -1; f.floating = f.y < FLOOR - 2;
    f.play('kameCharge', 'pose'); f.t2 = 99;
    Voice.shout('goku', 'Ka... me... ha... me...'); if (!sfx.kameChant(f, 1)) sfx.charge(1);
    await wait(0.9);
  }
  game.slow = 1;
  Voice.shout('goku', 'HAAAAAAA!');
  f.big = true; fireKame(f); f.t2 = 1.3; f.big = false;
  // aimed up at him if he's in the air; along the ring if he's standing
  const b = beams.find(x => x.owner === f);
  if (b) b.ang = foe.y < FLOOR - 12 ? clamp(Math.atan2(foe.y - 22 - b.y, Math.max(20, Math.abs(foe.x - b.x0))), -0.9, 0.9) : 0;
  game.banner = { text: hasTeleKame(f) ? 'INSTANT KAMEHAMEHA!' : 'KAMEHAMEHA!', t: 0, dur: 1.3 };
  game.flash = 1; shake(12); sfx.explode(); Stage.strike();
  await wait(0.15, true);
  foe.floating = false; foe.play('knock'); foe.vy = -260; foe.vx = f.facing * 240; foe.y -= 1;
  await wait(1.3, true);
  for (const x of [f, foe]) { sfx.stopSustain(x); sfx.stopKame(x); }
  beams = []; f.inv = 0; cam.focus = null; game.banner = null;
  if (f.state === 'kameFire' || f.state === 'pose') f.play(f.y < FLOOR - 2 ? 'fall' : 'idle', f.y < FLOOR - 2 ? 'jump' : 'idle');
  f.floating = false;
}

// Goku's Dragon Rush (the grab: J + K or F), in every form. Once it has hold of them: three quick blows
// (punch, kick, punch) that count in the combo, then the launcher that sends them up, and W right
// after chases them into the air (the DRAGON RUSH CHASE combo)
async function dragonRush(f, foe) {
  if (game.mode !== 'fight' || foe.hp <= 0) return;
  const dir = f.facing;
  game.mode = 'cut';
  Object.assign(foe, { vx: 0, vy: 0, y: FLOOR, floating: false, visible: true, juggle: 0 }); foe.play('hurt', 'pose'); foe.t2 = 99;
  Object.assign(f, { vx: 0, vy: 0, inv: 99, y: FLOOR });
  // one blow: he steps in, and they reel as it lands (never the knockout: the launcher can be)
  const blow = async (anim, dmg, last) => {
    f.x = clamp(foe.x - dir * 24, 14, W - 14);
    f.play(anim, 'pose'); f.t2 = 99;
    const a = f.A(); await wait(Math.max(1, (a.hit && a.hit.at) || 1) / a.fps);
    if (game.mode !== 'cut') return;
    const d = dmg * comboScale(foe);
    directDamage(foe, last ? d : Math.min(d, foe.hp - 1));
    if (f === player) { game.combo.n++; game.combo.t = 0; game.combo.dmg += d; }
    sparks.push({ x: foe.x - dir * 8, y: foe.y - 30, t: 0, c: '#fff6b8' });
    foe.flash = 0.08; shake(last ? 6 : 4); game.freeze = last ? 0.07 : 0.045;
    if (last) {
      foe.play('knock'); foe.vy = -390; foe.vx = dir * 45; foe.y -= 1; sfx.smash();
    } else { foe.play('hurt', 'pose'); foe.t2 = 99; foe.x = clamp(foe.x + dir * 3, 20, W - 20); if (anim[0] === 'k') sfx.kick(); else sfx.punch(); }
    await wait(last ? 0.1 : 0.13);
  };
  await blow('p2', 3);
  await blow('k2', 3);
  await blow('p3', 3);
  await blow('k3', 4, true);
  if (game.mode !== 'cut') return;
  f.inv = 0.15; f.play('idle');
  // the moment where a jump chases them up, as after any launcher
  if (human(f)) { f.chaseT = 0.7; f.chaseLow = false; popups.push({ text: actionLabel('jump', ctlOf(f)) + '  CHASE!', x: f.x, y: f.y - 60, t: 0, c: '#9ff' }); }
  game.mode = 'fight';
}

// ---- cutscene attacks ----
// Goku's big attacks as a Super Saiyan with his gi top torn (full ki) and in the Kaioken (SUPER_KI). He
// winds up and dashes in (see superUp and superDash in game/fighter-update.js). The dash is the part
// that can be stopped: block it, jump it or vanish. If it lands the fight stops and the rest plays
// itself out, the way the sheets draw it.
const SUPER_KI = { ssj: 100, kaioken: 50 };
function superRush(f) {
  const ssj = f.form === 'ssj';
  f.ki -= SUPER_KI[f.form]; f.vx = 0; f.facing = foeOf(f).x > f.x ? 1 : -1;
  if (ssj) { f.play('superUp', 'superUp'); f.t2 = 0.38; game.flash = Math.max(game.flash, 0.35); }
  // (the Kaioken's from the air: the dash dives down at them)
  else { f.play('superDash', 'superDash'); f.t2 = 0.5; if (f.y < FLOOR - 4) { f.floating = false; f.vy = Math.max(f.vy, 220); } }
  sfx.powerup(); shake(4);
  popups.push({ text: ssj ? 'SUPER KAMEHAMEHA!' : 'KAIOKEN FINISH!', x: f.x, y: f.y - 70, t: 0, c: ssj ? '#ffe04a' : '#ff5a5a' });
}

// The Kaioken's finish as a follow-up (O off a landed hit, or while they're bouncing off the ring or up in
// the air close by): no dash to land, he's straight on them. On the ring it's the whole finish; from the
// air or off a bounce they drop to the ring and he goes straight into the run, the flip kick and the
// Kamehameha up at them (see superScene).
function kaioFollow(f) {
  const foe = foeOf(f);
  f.ki -= SUPER_KI.kaioken; f.facing = foe.x > f.x ? 1 : -1;
  popups.push({ text: 'KAIOKEN FINISH!', x: f.x, y: f.y - 70, t: 0, c: '#ff5a5a' });
  sfx.powerup(); shake(4);
  // on the ring mid-combo it's the whole finish (the rush of punches first); only from the air, or onto
  // them bouncing off a dunk, is it the short one that starts at the kick
  const short = f.y < FLOOR - 4 || foe.spiked || foe.bounced;
  superScene(f, foe, short);
}
// they're reeling in the air or off a bounce, near enough for the Kaioken's finish to follow up
const kaioFollowable = (f, foe) => foe.hp > 0 && foe.visible && foe.state === 'knock' && Math.abs(foe.x - f.x) < 140;

// With the gi top torn, his big attacks hit harder (his last reserves): the rush into the Super
// Kamehameha, and the Spirit Bomb from the air
const TORN_POWER = 1.35;

// a beam for a cutscene: it does no damage of its own (the scene deals it), and it's aimed at them
function superBeam(f, foe, size) {
  f.play('superFire', 'kameFire'); f.t2 = 1.25;
  const [hx, hy] = f.hand('superFire');
  const ang = clamp(Math.atan2(foe.y - 22 - hy, Math.max(20, Math.abs(foe.x - hx))), -0.9, 0.5);
  beams.push({ owner: f, x0: hx, y: hy, ang, dir: f.facing, len: 0, t: 0, tick: 0, big: false, dps: 0, size });
  sfx.beam(f.t2); sfx.beamLoop(f); sfx.stopKame(f); sfx.kameBlast(f, size > 1.3);
  game.flash = 1; shake(12); Stage.strike();
}

async function superScene(f, foe, follow = false) {
  // (out of a combo it's worth less, and the boss's hurts as much as the difficulty says)
  const ssj = f.form === 'ssj', scale = comboScale(foe, 'ult') * (foe === player && !game.versus ? diff().taken : 1), dir = f.facing;
  const torn = ssj && f.torn, power = torn ? TORN_POWER : 1;
  const from = { x: f.x, y: f.y }, foeY = foe.y;
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  Object.assign(f, { vx: 0, vy: 0, inv: 99, visible: true, y: FLOOR, floating: false });
  Object.assign(foe, { vx: 0, vy: 0, visible: true, y: FLOOR, floating: false, facing: -dir });
  cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR, z: 1.5 };
  // one blow of the string: he's on them, they reel (it never knocks them out: the beam does that)
  const blow = async (anim, dmg, dur, push) => {
    foe.x = clamp(foe.x + dir * push, 20, W - 20); f.x = clamp(foe.x - dir * 22, 14, W - 14);
    f.play(anim, 'pose'); f.t2 = 99;
    foe.play('hurt', 'pose'); foe.t2 = 99;
    directDamage(foe, Math.min(dmg * scale, foe.hp - 1));
    sparks.push({ x: foe.x - dir * 8, y: foe.y - 30, t: 0, c: '#fff6b8' });
    if (dmg >= 4) sfx.kick(); else sfx.punch();
    shake(5); game.freeze = 0.045;
    cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR, z: 1.5 };
    await wait(dur);
  };
  if (ssj) {
    // (with the gi torn: a red-gold flash as he goes all out, and every blow hits harder)
    if (torn) { game.flash = 1; shake(8); Voice.shout('goku', 'Haaaaaaah!'); }
    await blow('super1', 3 * power, 0.2, 4);
    await blow('super2', 3 * power, 0.24, 4);
    await blow('super3', 4 * power, 0.22, 6);
    // the flip kick: up they go
    await blow('super4', 5 * power, 0.08, 0);
    foe.play('knock', 'pose'); foe.t2 = 99; foe.floating = true; Stage.crack(foe.x, 1.5);
    for (let i = 0; i < 9; i++) { foe.y -= 9 - i * 0.6; foe.x = clamp(foe.x + dir * 5, 20, W - 20); await wait(0.03); }
    cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR - 30, z: 1.25 };
    f.play('superCharge', 'pose'); f.t2 = 99;
    Voice.shout('goku', 'Ka... me... ha... me...'); if (!sfx.kameChant(f, 0.8)) sfx.charge(0.8);
    await wait(0.8);
    Voice.shout('goku', 'HAAAAAAA!');
    superBeam(f, foe, torn ? 1.55 : 1.25);
  } else if (follow) {
    // the follow-up: they drop to the ring where they were knocked, and he's there in a flash
    f.visible = false; ghosts.push({ img: teleArt(f), x: from.x, y: from.y, t: 0 }); sfx.teleport();
    foe.y = foeY; foe.play('knock', 'pose'); foe.t2 = 99;
    for (let i = 1; i <= 6 && foeY < FLOOR - 2; i++) { foe.y = foeY + (FLOOR - foeY) * i / 6; await wait(0.03); }
    foe.y = FLOOR; Stage.crack(foe.x, 1.2); shake(5); sfx.impact();
    foe.play('hurt', 'pose');
    f.x = clamp(foe.x - dir * 34, 14, W - 14); f.visible = true;
    ghosts.push({ img: teleArt(f), x: f.x, y: f.y, t: 0 });
    cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR, z: 1.5 };
    await wait(0.12);
  } else {
    for (const [anim, dmg] of [['rush', 2], ['rush2', 2], ['rush', 2], ['rush2', 2], ['rush3', 3]]) await blow(anim, dmg, 0.12, 5);
  }
  if (!ssj) {
    // the sheet's own finish: he runs in, a flip kick sends them up (they only go up once his foot is
    // on them), he follows them up, the swirl gathers in his hands, and he fires up at them
    f.x = clamp(foe.x - dir * 30, 14, W - 14);
    f.play('superRun', 'pose'); f.t2 = 99; sfx.whoosh();
    for (let i = 0; i < 5; i++) { f.x = clamp(f.x + dir * 2, 14, W - 14); await wait(0.04); }
    f.play('superKick', 'pose'); f.t2 = 99;
    await wait(0.06);
    directDamage(foe, Math.min(6 * scale, foe.hp - 1));
    sparks.push({ x: foe.x - dir * 6, y: foe.y - 34, t: 0, c: '#fff6b8' });
    sfx.kick(); shake(7); game.freeze = 0.08;
    foe.play('knock', 'pose'); foe.t2 = 99; foe.floating = true; Stage.crack(foe.x, 1.2); Stage.puff(foe.x, dir);
    await wait(0.1);
    // up they go, fast off the kick and slowing near the top, while he lands from the flip
    for (let i = 0; i < 10; i++) { foe.y -= 9 - i * 0.6; foe.x = clamp(foe.x + dir * 2, 20, W - 20); await wait(0.035); }
    cam.focus = { x: (f.x + foe.x) / 2, y: FLOOR - 40, z: 1.2 };
    // hands out, then the swirl (Kamehameha chant over it), held long enough to read
    f.play('superCharge', 'pose'); f.t2 = 99;
    Voice.shout('goku', 'Ka... me... ha... me...'); if (!sfx.kameChant(f, 1)) sfx.charge(1);
    await wait(1);
    Voice.shout('goku', 'HAAAAAAA!');
    superBeam(f, foe, 1.2);
  }
  game.banner = { text: torn ? 'FULL POWER KAMEHAMEHA!' : ssj ? 'SUPER KAMEHAMEHA!' : 'KAIOKEN KAMEHAMEHA!', t: 0, dur: 1.3 };
  await wait(0.12, true);
  directDamage(foe, (ssj ? 46 * power : 45) * scale);
  foe.floating = false; foe.play('knock'); foe.vy = ssj ? -200 : -300; foe.vx = dir * 240; foe.y -= 1; sfx.explode();
  await wait(1.25, true);
  endCinematic(f, foe);
}

// The Spirit Bomb that turns him (base Goku, O in the air at full ki):
//  1. it lands on them: the camera on the bomb, Goku still in his throw's follow-through
//  2. to Goku: everyone's energy pours through him and he turns Super Saiyan, the same transformation as
//     T (in his full gi, or in his undershirt if he's hurt enough), ending in its last pose, held
//  3. then, close on the bomb, it goes off
async function spiritSaiyan(sb, f, foe) {
  const scale = comboScale(foe, 'ult') * (foe === player && !game.versus ? diff().taken : 1), dir = sb.vx >= 0 ? 1 : -1;
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null;
  sb.phase = 'hold'; sb.t = 0;
  // he turns in his full gi unless he's hurt enough for it to be torn (then in his undershirt); a gi
  // torn earlier (the Kaioken's) comes back with the gold if his health is still up
  f.torn = f.hp <= f.maxHp * TORN_AT;
  Object.assign(foe, { vx: 0, vy: 0, visible: true, floating: foe.y < FLOOR - 4 }); foe.play('hurt', 'pose'); foe.t2 = 99;
  Object.assign(f, { vx: 0, vy: 0, inv: 99, visible: true, floating: f.y < FLOOR - 4 });
  // 1. it lands
  f.play('spiritHit', 'pose'); f.t2 = 99;
  cam.focus = { x: sb.x, y: Math.min(FLOOR - 30, sb.y), z: 1.3 };
  shake(6);
  await wait(0.7);
  // 2. he turns, the way T turns him, and holds the pose it ends in
  cam.focus = { f, z: 1.5 };
  f.play('transform', 'pose'); f.t2 = 99; sfx.powerup(); shake(5); Voice.shout('goku', 'Haaaaaaah!');
  { const a = f.A(); await wait(a.fr.length / a.fps); }
  // (the music carries on: a change mid-bomb sounded wrong)
  // (he keeps the transformation's last frame, still: no stance breathing, no second boom before the bomb's)
  setForm(f, 'ssj'); Stage.cloud(f.x, 1.6); Stage.strike(); game.flash = 1; shake(8);
  game.wentSsj = true; if (f.torn) game.wentSsjTorn = true;
  // (under him: above, with the camera in close, it ran into the timer)
  popups.push({ text: 'SUPER SAIYAN!', x: f.x, y: Math.min(FLOOR - 4, f.y + 16), t: 0, c: '#ffe04a' });
  await wait(0.8, true);
  // 3. then it goes off, close up
  cam.focus = { x: sb.x, y: Math.min(FLOOR - 30, sb.y), z: 1.6 };
  sb.phase = 'boom'; sb.t = 0;
  game.flash = 1; shake(12); sfx.explode(); Stage.crack(sb.x, 2.5); Stage.cloud(sb.x, 3);
  directDamage(foe, SPIRIT_DMG * 1.2 * (f.torn ? TORN_POWER : 1) * scale);
  foe.floating = false; foe.play('knock'); foe.vy = -300; foe.vx = dir * 200; foe.y -= 1;
  await wait(1.1, true);
  cam.focus = null;
  if (f.y < FLOOR - 1) { f.floating = false; f.play('fall', 'jump'); } else turnedPose(f);
  endCinematic(f, foe);
}

// Solar Kamehameha: Perfect Cell's finisher. He flares his aura, vanishes, reappears high above
// the enemy and fires a huge Kamehameha down into the ring. The enemy gets a moment to answer
// (see reactWindow); unanswered it deals 60 and blasts them away.
async function solarKame(f) {
  const foe = foeOf(f), scale = comboScale(foe, 'ult');
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
  await cinematicBeam(f, foe, r, 60 * scale, () => {
    foe.play('knock'); foe.vy = -220; foe.vx = f.facing * 200; foe.y -= 1; Stage.crack(foe.x, 2.5);
  }, 'SOLAR KAMEHAMEHA!');
  endCinematic(f, foe);
}

// ---------- the final clash ----------
// Beating the final boss doesn't end it on the spot. Cell flies up and charges a Solar Kamehameha
// big enough to take the planet with him, and Goku answers from the ring with everything he has
// left: a beam clash that's harder to win than any before it. In Goku's story, win it and Cell is
// wiped out; lose it and Goku tries one last Instant Kamehameha, point-blank, and it isn't enough.
// Cell's story is the same scene from the other side.
const FINAL_SKY = 0.4;
async function finalClash() {
  game.finalDone = true;
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null; game.react = null;
  for (const f of [goku, cell]) { sfx.stopSustain(f); sfx.stopKame(f); settle(f); f.hp = Math.max(1, f.hp); f.inv = 99; }
  const gSide = goku.x < W / 2 ? -1 : 1;
  // Goku near one edge of the ring, Cell will be far off over the other (top right, when Goku is on the left)
  goku.x = W / 2 + gSide * 95; cell.x = W / 2 - gSide * 125;
  goku.facing = -gSide; cell.facing = gSide;
  cam.focus = { f: cell, z: 1.4 };
  // he refuses to lose: up into the sky
  cell.play('power', 'pose'); cell.t2 = 99; sfx.powerup(); shake(8); game.flash = 0.5;
  await say('CELL', player === cell ? "Enough! If I can't have this planet, NO ONE WILL!" : "No... NO! I am PERFECT! If I go down, this whole planet goes with me!");
  cell.visible = false; sfx.teleport(); ghosts.push({ img: teleArt(cell), x: cell.x, y: cell.y, t: 0 });
  await wait(0.3);
  Object.assign(cell, { y: FLOOR - 92, floating: true, visible: true, big: true });
  ghosts.push({ img: teleArt(cell), x: cell.x, y: cell.y, t: 0 }); sfx.teleport();
  game.finalSky = 0.01;
  cell.play('kameCharge', 'pose'); cell.t2 = 99;
  cam.focus = { x: W / 2, y: FLOOR - 50, z: 1 };
  if (!sfx.kameChant(cell, 2.6, true)) sfx.charge(2.6);
  // Goku answers with the Kamehameha (going Super Saiyan for it if he isn't already)
  if (goku.form !== 'ssj') { setForm(goku, 'ssj'); game.flash = 1; sfx.explode(); Stage.cloud(goku.x, 1.4); popups.push({ text: 'SUPER SAIYAN!', x: goku.x, y: goku.y - 66, t: 0, c: '#ffe04a' }); }
  await say('GOKU', player === goku ? 'Then this is my everything! KA... ME...' : "I won't let you, Cell! KA... ME...");
  goku.facing = cell.x > goku.x ? 1 : -1; goku.play('kameCharge', 'pose'); goku.t2 = 99;
  if (!sfx.kameChant(goku, 1.6)) sfx.charge(1.6);
  for (let i = 0; i < 16; i++) { await wait(0.1); shake(3 + i * 0.4); Stage.lift(goku.x); Stage.lift(cell.x); }
  // both fire, and the beams lock
  Voice.shout('cell', 'Solar Kamehameha!'); Voice.shout('goku', 'HAAAAAAA!');
  fireKame(cell); fireKame(goku); cell.t2 = goku.t2 = 99;
  startClash(beams.find(b => b.owner === player), beams.find(b => b.owner === boss));
  clash.final = true;
  game.banner = { text: 'MASH  SPACE !', t: 0, dur: 99 };
  popups.push({ text: 'FINAL CLASH!', x: W / 2, y: FLOOR - 100, t: 0, c: '#ffe04a' });
  while (clash) await wait(0.05, true);
  const gokuWon = game.clashWinner === goku;
  if (gokuWon) await cellDestroyed(); else await gokuLastStand();
  game.finalSky = 0;
  finish(game.clashWinner === player ? 'win' : 'lose');
}

// Goku's beam drives Cell's back up into him and he's wiped out in the sky.
async function cellDestroyed() {
  goku.t2 = 1.6;
  cam.focus = { f: cell, z: 1.3 };
  await wait(0.5);
  game.flash = 1; shake(14); sfx.explode(); sfx.ko();
  for (let i = 0; i < 6; i++) sparks.push({ x: cell.x + rand(-14, 14), y: cell.y - rand(10, 40), t: 0, c: '#fff6b8' });
  Stage.farBlast(cell.x, 1.8);
  await wait(0.25);
  cell.visible = false; cell.hp = 0; cell.play('knock'); cell.floating = false;
  await wait(1.4);
  settle(goku); goku.play('idle', 'pose'); goku.t2 = 99;
  // he isn't drawn any more, so put him on the ring where the KO camera looks for him
  Object.assign(cell, { y: FLOOR, visible: false }); cell.play('down'); cell.t2 = 99;
}

// Goku loses the clash: blasted down, he gets up for one last Instant Kamehameha point-blank... and
// Cell regenerates from it and finishes him.
async function gokuLastStand() {
  cell.t2 = 99;
  goku.floating = false; goku.play('knock'); goku.vy = -260; goku.vx = (goku.x > cell.x ? 1 : -1) * 160; goku.y -= 1;
  game.flash = 0.8; shake(10); sfx.explode();
  // his beam spent, Cell stays where he is, up in the sky, looking down at what's left of Goku (he used
  // to drop to the ring as it ended, so the rest of the scene, written for the sky, played on the ground)
  await wait(0.9);
  beams = beams.filter(b => b.owner !== cell); sfx.stopSustain(cell);
  Object.assign(cell, { big: false, floating: true, vx: 0, vy: 0 }); cell.play('taunt', 'pose'); cell.t2 = 99;
  for (let i = 0; i < 120 && goku.state !== 'down'; i++) await wait(1 / 60);
  await wait(0.8);
  goku.play('getup', 'pose'); goku.t2 = 99;
  await wait(0.5);
  await say('GOKU', player === goku ? "Not... yet...! One more!" : "Not... yet...!");
  // Instant Transmission up into the sky, right beside him. As a Super Saiyan it's the sheet's (from the
  // ring: the crouch, the leap, the turn and the zip; he reappears holding the Kamehameha at his side);
  // otherwise the quick flicker
  if (goku.form === 'ssj' && goku.A('itHold')) {
    cam.focus = { f: goku, z: 1.3 };
    await teleKame(goku, cell, false);
    goku.big = true;
    cam.focus = { x: (goku.x + cell.x) / 2, y: cell.y - 20, z: 1.5 };
    if (!sfx.kameChant(goku, 0.7)) sfx.charge(0.7);
    await wait(0.5);
  } else {
    goku.play('teleOut', 'pose'); sfx.teleport();
    await wait(0.15);
    ghosts.push({ img: teleArt(goku), x: goku.x, y: goku.y, t: 0 }); goku.visible = false;
    await wait(0.25);
    const side = goku.x < cell.x ? -1 : 1;
    Object.assign(goku, { x: clamp(cell.x + side * 30, 20, W - 20), y: cell.y, floating: true, visible: true, facing: -side, big: true });
    ghosts.push({ img: teleArt(goku), x: goku.x, y: goku.y, t: 0 }); sfx.teleport();
    cam.focus = { x: (goku.x + cell.x) / 2, y: cell.y - 20, z: 1.5 };
    goku.play('kameCharge', 'pose'); goku.t2 = 99;
    if (!sfx.kameChant(goku, 0.7)) sfx.charge(0.7);
    await wait(0.7);
  }
  Voice.shout('goku', 'HAAAAAAA!');
  fireKame(goku); goku.t2 = 1.2;
  game.banner = { text: 'INSTANT KAMEHAMEHA!', t: 0, dur: 1.2 };
  game.flash = 1; shake(12); sfx.explode();
  await wait(0.3);
  // Cell is blown apart...
  cell.visible = false; Stage.farBlast(cell.x, 1.2);
  for (let i = 0; i < 5; i++) sparks.push({ x: cell.x + rand(-12, 12), y: cell.y - rand(10, 40), t: 0, c: '#9ff' });
  await wait(1.2);
  goku.floating = false; settle(goku); goku.play('idle', 'pose'); goku.t2 = 99;
  cam.focus = { x: W / 2, y: FLOOR - 40, z: 1.2 };
  await wait(0.6);
  // ...and grows back
  Object.assign(cell, { visible: true, floating: false, y: FLOOR, x: clamp(cell.x, 30, W - 30) });
  cell.play('power', 'pose'); cell.t2 = 99; sfx.powerup(); shake(6); Stage.cloud(cell.x, 1.2);
  popups.push({ text: 'REGENERATED!', x: cell.x, y: cell.y - 70, t: 0, c: '#c27aff' });
  await wait(0.8);
  cell.play('idle', 'pose'); cell.facing = goku.x > cell.x ? 1 : -1; goku.facing = -cell.facing;
  await say('CELL', 'Did you forget? As long as a single cell survives, I come back. And now... goodbye, Goku.');
  cell.play('kameCharge', 'pose'); cell.big = false;
  await wait(0.5);
  fireKame(cell); cell.t2 = 0.9;
  await wait(0.2);
  goku.hp = 0; blastAway(goku, cell, 0);
  for (let i = 0; i < 120 && goku.state !== 'down'; i++) await wait(1 / 60);
  goku.hp = 0;
}

// ---------- the reveal ----------
// After he turns Super Saiyan hurt for the first time, a still of him (battered, the gold flaring) slides
// in on a slanted band across the screen, holds, and slides out (see updateCine)
const REVEAL = { img: new Image(), dur: 2.1 };
REVEAL.img.src = 'assets/cutins/goku-ssj-hurt.png';
function drawReveal(r) {
  const img = REVEAL.img;
  if (!img.naturalWidth) return;
  const t = r.t, d = REVEAL.dur;
  const inK = easeOut(t / 0.35), outK = clamp((t - (d - 0.35)) / 0.35, 0, 1);
  const shown = 1 - outK;
  // the fight dims behind it
  gfx.save(); gfx.fillStyle = `rgba(4,3,12,${0.6 * Math.min(1, t / 0.2) * shown})`; gfx.fillRect(0, 0, W, H); gfx.restore();
  // the band: in from the right, out to the left
  const bh = 104, by = (H - bh) / 2, lean = 26;
  const bx = (1 - inK) * (W + lean) - outK * (W + lean);
  slantClip(bx - lean, by, W + lean * 2, bh, lean, () => {
    const k = Math.max((W + lean * 2) / img.naturalWidth, bh / img.naturalHeight) * 1.04;
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    gfx.save(); gfx.imageSmoothingEnabled = true;
    // a slow push in while it holds
    const z = 1 + 0.05 * clamp(t / d, 0, 1);
    gfx.translate(bx + W / 2, by + bh * 0.45); gfx.scale(z, z);
    gfx.drawImage(img, -dw / 2, -dh * 0.42, dw, dh);
    gfx.restore();
  });
  // gold edges along the band, glowing
  for (const [y, s] of [[by, -1], [by + bh, 1]]) {
    gfx.save(); gfx.globalCompositeOperation = 'lighter';
    gfx.fillStyle = 'rgba(255,200,60,0.35)'; gfx.fillRect(bx - lean, y - 3 + s, W + lean * 2, 4);
    gfx.fillStyle = '#ffe48a'; gfx.fillRect(bx - lean, y - 1, W + lean * 2, 2);
    gfx.restore();
  }
}

// ---------- cut-ins ----------
// Full-screen anime close-ups played inside cinematics. Each is a frame atlas made from a GIF in
// assets/cutins (the .gif next to it is the original): seq lists [atlas cell, milliseconds] per frame
// in the GIF's own order and timing (repeated frames are stored once).
const CUTINS = {
  // Goku's eyes, the rage building in them, and the scream as his hair turns gold: fifteen frames on a
  // strip that isn't an even grid, so each one's corner is listed (cells). The scream at the end loops
  gokuSsj: { src: 'assets/cutins/goku-ssj-cutins.png', w: 112, h: 63,
    cells: [...[3, 119, 235, 351, 468, 584, 700, 816, 933, 1049, 1165].map(x => [x + 1, 6]), ...[3, 119, 235, 351].map(x => [x + 1, 72])],
    seq: [...[0, 1, 2, 3].map(i => [i, 120]), ...[4, 5, 6, 7, 8, 9].map(i => [i, 90]), [10, 100], ...[11, 12, 13, 14, 11, 12, 13, 14].map(i => [i, 70])] },
  // Cell's hand clenching, then pulling away from his smirking Perfect face (its last 4 frames loop)
  cellPerfect: { src: 'assets/cutins/cell-perfect-reveal.png', w: 640, h: 360, cols: 6,
    seq: [...Array.from({ length: 35 }, (_, i) => [i, 100]), ...[31, 32, 33, 34, 31, 32, 33, 34, 31, 32, 33, 34, 31, 32, 33, 34].map(i => [i, 100]), [31, 400]] },
};
for (const c of Object.values(CUTINS)) { c.img = new Image(); c.img.src = c.src; c.dur = c.seq.reduce((a, q) => a + q[1], 0) / 1000; }
// play a cut-in on its own clock; resolves when it ends (or, if skippable, when Enter skips it)
function playCutin(id, skippable = true) {
  return new Promise(done => { if (game.skip) return done(); game.cutin = { id, t: 0, skippable, done }; });
}
function updateCutin(raw) {
  const c = game.cutin;
  if (!c || !c.done) return; // a cut-in driven by another clock (the Super Saiyan one) is left alone
  c.t += raw;
  if (c.t >= CUTINS[c.id].dur || (c.skippable && c.t > 0.3 && tap('confirm'))) { game.cutin = null; c.done(); }
}
function drawCutin() {
  const c = game.cutin, C = CUTINS[c.id];
  if (!C.img.complete || !C.img.naturalWidth) return;
  let ms = c.t * 1000, i = 0;
  while (i < C.seq.length - 1 && ms >= C.seq[i][1]) { ms -= C.seq[i][1]; i++; }
  const cell = C.seq[i][0], [sx, sy] = C.cells ? C.cells[cell] : [(cell % C.cols) * C.w, Math.floor(cell / C.cols) * C.h];
  // a quick fade at each end, so it cuts in and out like the anime rather than popping
  const a = Math.min(1, c.t / 0.08, (C.dur - c.t) / 0.1);
  gfx.save(); gfx.globalAlpha = clamp(a, 0, 1); gfx.imageSmoothingEnabled = false;
  gfx.drawImage(C.img, sx, sy, C.w, C.h, 0, 0, W, H);
  gfx.restore();
}
