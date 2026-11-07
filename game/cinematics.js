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
  cell.t2 = 1.0;
  goku.floating = false; goku.play('knock'); goku.vy = -260; goku.vx = (goku.x > cell.x ? 1 : -1) * 160; goku.y -= 1;
  game.flash = 0.8; shake(10); sfx.explode();
  for (let i = 0; i < 120 && goku.state !== 'down'; i++) await wait(1 / 60);
  await wait(0.8);
  goku.play('getup', 'pose'); goku.t2 = 99;
  await wait(0.5);
  await say('GOKU', player === goku ? "Not... yet...! One more!" : "Not... yet...!");
  // Instant Transmission right in front of him, up in the sky
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

// ---------- cut-ins ----------
// Full-screen anime close-ups played inside cinematics. Each is a frame atlas made from a GIF in
// assets/cutins (the .gif next to it is the original): seq lists [atlas cell, milliseconds] per frame
// in the GIF's own order and timing (repeated frames are stored once).
const CUTINS = {
  // Goku's eyes narrowing, the moment before his hair turns gold (160 x 90 pixel art, drawn 2x)
  gokuSsj: { src: 'assets/cutins/goku-ssj-eyes.png', w: 160, h: 90, cols: 3, seq: Array.from({ length: 9 }, (_, i) => [i, 100]) },
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
  const cell = C.seq[i][0], sx = (cell % C.cols) * C.w, sy = Math.floor(cell / C.cols) * C.h;
  // a quick fade at each end, so it cuts in and out like the anime rather than popping
  const a = Math.min(1, c.t / 0.08, (C.dur - c.t) / 0.1);
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(C.img, sx, sy, C.w, C.h, 0, 0, W, H);
  ctx.restore();
}
