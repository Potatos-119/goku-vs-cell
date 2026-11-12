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
// when, into the close-up, his mouth opens (its frame 10: the four glaring frames, then six of his eyes)
// (started a touch early: the recording takes a moment to get loud)
const SSJ_SCREAM_AT = (4 * 120 + 6 * 90) / 1000 - 0.15;
function superSaiyan(f) {
  return new Promise(done => {
    projs = []; beams = []; clash = null; game.banner = null;
    settle(goku); settle(cell);
    game.cine = { f, t: 0, clock: 0, stage: 0, back: game.mode, done };
    game.mode = 'cut';
    f.play('ssjBuild', 'pose'); f.t2 = 99; f.inv = 99;
    cam.focus = { f, z: 1.5 };
    Audio8.music.switchTo('ssj');
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
  // the close-up of his face cuts in on the music's last build, ending as he rises into the
  // transformation, which hits gold right on the beat; he screams as his mouth opens in it
  const ci = c.t - (SSJ_PEAK - 1 - CUTINS.gokuSsj.dur);
  game.cutin = c.stage === 0 && ci >= 0 && ci < CUTINS.gokuSsj.dur ? { id: 'gokuSsj', t: ci } : null;
  if (!c.screamed && ci >= SSJ_SCREAM_AT) { c.screamed = true; Voice.shout('goku', 'Haaaaaaah!'); }
  if (c.stage === 0 && c.t >= SSJ_PEAK - 1) { c.stage = 1; f.play('ssjRise', 'pose'); sfx.powerup(); }
  if (c.stage === 1 && c.t >= SSJ_PEAK) {
    c.stage = 2; c.hitAt = mt;
    finishTransform(f); f.play('ssjFlare', 'pose'); f.t2 = 99;
    shake(12); game.banner = { text: 'SUPER SAIYAN!', t: 0, dur: 1.6 };
    for (let i = 0; i < 14; i++) Stage.lift(f.x);
    Stage.crack(f.x, 2);
  }
  if (c.stage === 2 && c.t >= SSJ_PEAK + 1.6) {
    turnedPose(f);
    // hurt (the gi top torn): the still of him, battered and gold, cuts in before the fight goes on
    if (f.torn && REVEAL.img.naturalWidth) { c.stage = 3; c.revealAt = c.t; game.reveal = { t: 0 }; sfx.whoosh(); game.flash = Math.max(game.flash, 0.7); return; }
    c.stage = 4;
  }
  if (c.stage === 3) {
    game.reveal.t = c.t - c.revealAt;
    if (game.reveal.t >= REVEAL.dur) { game.reveal = null; c.stage = 4; }
  }
  if (c.stage === 4) {
    f.inv = 0.5; cam.focus = null;
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
    // becoming Perfect: his theme starts, the close-up of his hand and his new face plays, and he
    // appears in his Perfect form right on the music's big hit
    if (next === 2) await perfectReveal(cell);
    sfx.explode(); game.flash = 1; shake(10);
    setForm(cell, CELL_FORMS[next]);
    cell.play('power');
    await wait(1.2);
    cell.play('idle');
    if (next === 2) {
      // Perfect Cell regenerates completely, and has more to give than before: a fresh, bigger bar
      Object.assign(cell, { maxHp: Math.round(PERFECT_HP * diff().hp), hp: Math.round(PERFECT_HP * diff().hp) });
      popups.push({ text: 'FULLY REGENERATED!', x: cell.x, y: cell.y - 70, t: 0, c: '#c27aff' });
      await say('CELL', 'Perfection! Go on, Goku. Entertain me.');
      if (player === goku) await senzuBean(goku);
      if (goku.form === 'ssj') await say('GOKU', '(Time to go all out... fill my ki and press O!)');
    }
    if (goku.form === 'base') await say('GOKU', '(He keeps getting stronger... charge ki with I, then press T!)');
  } else if (next === 1) {
    // boss Goku's second stage: the Kaioken, and it stays on until he goes further
    await say('GOKU', "You're stronger than I thought, Cell... Time to get serious. Kaioken!");
    cam.focus = { f: goku, z: 1.4 };
    goKaioken(goku);
    await wait(1.6);
    setForm(goku, 'kaioken'); goku.kaioT = Infinity; goku.play('idle');
    await say('CELL', 'More power? Good. All of it will be mine.');
    if (cell.form === 'imperfect') await say('CELL', '(I must evolve... charge ki with I, then press T!)');
  } else {
    // his last: Super Saiyan, in what's left of his gi
    await say('GOKU', "I can't hold back anymore. This is everything I've got!");
    setForm(goku, 'base'); goku.kaioT = 0;
    game.wentSsj = true; if (goku.torn) game.wentSsjTorn = true; await superSaiyan(goku);
    await say('CELL', 'The legendary Super Saiyan... Excellent. Your power will make me perfect!');
  }
  cam.focus = null;
  if (boss === goku) Object.assign(goku, GOKU_BOSS[next]);
  game.phase = next; game.kameCd = 3; ai.ultCd = 4; game.time = ROUND_TIME;
  game.mode = 'fight';
}

// Perfect Cell's arrival, timed to his theme (assets/audio/perfect-cell.mp3): it starts as he flares
// his aura, the close-up of his reveal plays, and it ends right on the music's big hit, PERFECT_HIT
// seconds in, where the caller turns him Perfect. It follows the track's own clock if the music
// started late (for up to a second), so the hit and the reveal stay together.
const PERFECT_HIT = 6.1;
async function perfectReveal(f) {
  Audio8.music.switchTo('perfect');
  f.play('power', 'pose'); f.t2 = 99; sfx.powerup(); shake(6);
  await wait(PERFECT_HIT - CUTINS.cellPerfect.dur);
  await playCutin('cellPerfect', false);
  // the music started late (still loading): hold on the last frame until it reaches the hit
  const mt = Audio8.music.time('perfect');
  if (mt > 0 && mt < PERFECT_HIT - 0.03) await wait(Math.min(1, PERFECT_HIT - mt), true);
}

// Playing as Cell: evolving into Perfect Cell is a short scene with the close-up of his reveal.
async function cellPerfectScene(f) {
  game.mode = 'cut'; projs = []; beams = []; minions = []; clash = null; game.banner = null; game.spirit = null;
  settle(goku); settle(cell);
  cam.focus = { f, z: 1.5 };
  Voice.shout('cell', 'Perfection!');
  await perfectReveal(f);
  setForm(f, 'perfect'); f.play('power', 'pose');
  game.flash = 1; shake(10); sfx.explode(); Stage.cloud(f.x, 1.6); Stage.strike();
  popups.push({ text: CELL_INFO.perfect.name + '!', x: f.x, y: f.y - 70, t: 0, c: '#a8e27c' });
  await wait(0.9);
  f.play('idle'); f.inv = 0.5; cam.focus = null;
  if (game.mode === 'cut') game.mode = 'fight';
}

// The reward for getting through the Cell Juniors: Krillin throws Goku a Senzu Bean. It heals him
// completely, fills his ki and toughens him up for Perfect Cell (a bigger health bar).
const SENZU_HP = 130;
async function senzuBean(f) {
  const from = f.x < W / 2 ? W + 12 : -12;
  cam.focus = { f, z: 1.3 };
  await say('KRILLIN', 'Goku! Catch!');
  // (it used to be thrown as he started talking, so it hung in front of Goku until the line was read)
  game.bean = { x0: from, y0: FLOOR - 100, x1: f.x, y1: f.y - 34, t: 0, dur: 0.75 }; sfx.whoosh();
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
  cam.focus = null; game.time = ROUND_TIME;
  game.mode = 'fight';
}

// the next Junior teleports in across from Goku
function juniorIn() {
  setForm(cell, 'junior');
  const x = clamp(goku.x + (goku.x < W / 2 ? 90 : -90), 24, W - 24);
  const jrHp = Math.round(JUNIOR_HP * diff().hp);
  Object.assign(cell, { hp: jrHp, maxHp: jrHp, x, y: FLOOR, vx: 0, vy: 0, visible: true, juggle: 0,
    comboTaken: 0, inv: 0.6, ki: 40, queue: [], next: null, floating: false, facing: goku.x > x ? 1 : -1 });
  cell.play('idle');
  ghosts.push({ img: teleArt(cell), x, y: FLOOR, t: 0 }); sfx.teleport();
}

async function juniorDown() {
  const j = game.juniors;
  game.mode = 'cut'; j.left--; clash = null;
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
  // knocked out as a Super Saiyan, the gold flickers out of his hair as he lies there
  if (goku.hp <= 0 && goku.form === 'ssj') await koPowerDown(goku);
  for (const f of [goku, cell]) if (f.hp > 0) settle(f);
  // Time ran out. Versus: whoever has more of their health left wins, and dead even is a draw. Story:
  // the boss only has to outlast the clock, so it's a defeat (it used to be a win whenever you had the
  // bigger share of health, which ended the whole story on the spot, even in its first stage)
  const pr = player.hp / player.maxHp, br = boss.hp / boss.maxHp;
  const draw = result === 'timeup' && game.versus && Math.abs(pr - br) < 0.005;
  const win = result === 'win' || (result === 'timeup' && game.versus && pr > br);
  game.result = draw ? 'draw' : win ? 'win' : 'lose';
  await wait(0.8);
  cam.focus = null;
  if (draw) { Audio8.music.stop(); await wait(1.2); game.mode = 'end'; return; }
  const winner = win ? player : boss;
  // Goku powers down before his victory (it's played in his normal form, in his undershirt)
  if (winner === goku && goku.form === 'kaioken') { setForm(goku, 'base'); Stage.cloud(goku.x, 0.6); }
  if (winner === goku && goku.form === 'ssj') {
    goku.play('powerDown', 'pose'); goku.t2 = 99; sfx.whoosh(); Stage.puff(goku.x, 1); Stage.puff(goku.x, -1);
    await wait(0.7);
    setForm(goku, 'base'); Stage.cloud(goku.x, 0.7); game.flash = Math.max(game.flash, 0.3);
  }
  winner.play('win');
  // versus: someone always wins, and the story's last words don't fit
  if (game.versus) { Audio8.music.winner(); await wait(1.2); game.mode = 'end'; return; }
  if (win) Audio8.music.winner(); else Audio8.music.defeat();
  const LINES = {
    goku: winner === goku ? "It's over, Cell." : 'Hahaha! Is that the best the Saiyans have? Pathetic!',
    cell: winner === cell ? 'PERFECT! Now nothing in this universe can stop me!' : "You were strong, Cell... but you'll never be perfect.",
  };
  // beaten by one of the Cell Juniors: he gets the last word
  if (game.juniors && winner === cell) await say('CELL JR.', 'Kee-hee! Papa, look! I broke the Saiyan!');
  else await say(winner.who.toUpperCase(), LINES[game.side]);
  game.report = makeReport(win);
  game.mode = 'end';
}

// The gold fading out of a knocked-out Super Saiyan's hair: it flickers, then he's back to normal.
async function koPowerDown(f) {
  for (let i = 0; i < 90 && f.state !== 'down'; i++) await wait(1 / 60, true);
  await wait(0.25, true);
  for (let i = 0; i < 6; i++) { setForm(f, i % 2 ? 'ssj' : 'base'); await wait(0.07 + i * 0.02, true); }
  setForm(f, 'base'); Stage.cloud(f.x, 0.6); sfx.whoosh();
  popups.push({ text: 'POWERED DOWN', x: f.x, y: f.y - 30, t: 0, c: '#fff' });
}
