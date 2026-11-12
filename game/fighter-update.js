// ---------- per-fighter update ----------
// how fast a fighter's punches and kicks play: its form's tempo for a person; the boss keeps its
// tuned speed on Normal, is slower on Easy and gets its form's tempo on Hard (see DIFFICULTY)
const tempoOf = f => human(f) ? infoOf(f).tempo || 1 : diff().tempo === 'form' ? infoOf(f).tempo || 1 : diff().tempo;
// the colour of a fighter's ki aura
const auraOf = f => f.form === 'kaioken' || f.state === 'kaioUp' ? 'red' : f.form === 'ssj' || f.state === 'transform' || f.state === 'ult1' ? 'gold' : 'blue';
const AURA_MOTES = { red: ['#ffd0d0', '#ff3a4a'], gold: ['#fff0a0', '#ffb832'], blue: ['#c6f8ff', '#48b9ff'] };

function updateFighter(f, foe, dt) {
  f.at += dt * (f.state === 'attack' || f.state === 'airAtk' ? tempoOf(f) : 1);
  if (f.kaioCd > 0) f.kaioCd -= dt;
  if (f.flareCd > 0) f.flareCd -= dt;
  // the Kaioken burns ki for as long as it's held (the boss's lasts a set time instead), and ends
  // when there's none left
  if (f.form === 'kaioken' && game.mode === 'fight') {
    if (human(f)) f.ki = Math.max(0, f.ki - (game.training && f === player && TRAIN.ki !== 'off' ? 0 : KAIO_DRAIN) * dt);
    else f.kaioT = (f.kaioT || 0) - dt;
    if ((human(f) ? f.ki <= 0 : f.kaioT <= 0) && (f.free || f.state === 'charge')) endKaioken(f, true);
  }
  if (f.facing !== f.lastFacing) { if (f.lastFacing && f.free) f.turnT = 0.09; f.lastFacing = f.facing; }
  if (f.turnT > 0) f.turnT -= dt;
  if (f.inv > 0) f.inv -= dt;
  if (f.flash > 0) f.flash -= dt;
  if (f.free || f.state === 'block' || f.state === 'down') { f.comboTaken = 0; f.bounced = false; f.relaunched = false; }
  f.sq -= f.sq * Math.min(1, dt * 12);
  if (f.state === 'block') f.blockT += dt;
  // a cosmetic follow-on (like skidding out of a dash) gives way to the stance once it's played
  if (f.state === 'idle' && f.anim !== 'idle' && f.A().then && f.animDone) f.play(f.A().then);
  if (f.assistCd > 0) f.assistCd -= dt;
  // the ki aura behind him swells in over a quarter second and dies away when he stops, instead of
  // popping on and off with the state
  // (a Super Saiyan powering up, or just turned, is drawn in his own gold flames, and turning Super
  // Saiyan draws its own blue aura and flames, so he doesn't get it then: on top it doubled them)
  const flaring = f.state === 'pose' && f.anim === 'ssjFlare';
  const ownFlames = f.who === 'goku' && ((f.form === 'ssj' && (flaring || f.state === 'charge')) || f.state === 'transform');
  const auraOn = !ownFlames && ['power', 'charge', 'transform', 'ult1', 'kameCharge', 'kaioUp'].includes(f.state);
  // (the Kaioken used to keep a low red glow on him the whole time: it read as a pale egg round him.
  // Its red sparks, rising off him below, are what show it's on now)
  const auraTo = auraOn ? 1 : 0;
  f.aura = (f.aura || 0) + (auraTo - (f.aura || 0)) * Math.min(1, dt * (auraOn ? 5 : 6));
  if (auraOn) f.auraPeak = flaring || ['transform', 'ult1', 'kaioUp'].includes(f.state) ? 0.9 : f.state === 'kameCharge' ? 0.72 : f.form === 'ssj' ? 0.8 : 0.5;
  // Goku's charge aura sheds motes that spiral inward, then snap upward like sparks in a gale.
  if (f.who === 'goku' && (auraOn || f.form === 'kaioken')) {
    f.auraT = (f.auraT || 0) - dt;
    if (f.auraT <= 0) {
      f.auraT = !auraOn ? 0.16 : ['transform', 'ult1', 'kaioUp'].includes(f.state) ? 0.045 : 0.085;
      const a = Math.random() * Math.PI * 2, radius = 12 + Math.random() * 12;
      kiMotes.push({ x: f.x + Math.cos(a) * radius, y: f.y - 20 + Math.sin(a) * 12, vx: -Math.cos(a) * (12 + Math.random() * 10), vy: -(18 + Math.random() * 28), t: 0, life: 0.35 + Math.random() * 0.3, c: pick(AURA_MOTES[auraOf(f)]) });
    }
  }
  // Cell regenerates while he charges ki
  if (f.who === 'cell' && f.state === 'charge') f.hp = Math.min(f.maxHp, f.hp + 3 * dt);
  // afterimages on fast moves, rocks lifting off the ring while powering up
  // (in the Kaioken he leaves them just running)
  const quick = f.form === 'kaioken' && (f.state === 'walk' || f.state === 'attack' || f.state === 'airAtk');
  if ((['dash', 'ult2'].includes(f.state) || f.anim === 'rush' || quick) && f.visible && (f.trailT -= dt) <= 0) {
    f.trailT = 0.035; trails.push({ im: f.img, x: f.x, y: f.y - f.hover, facing: f.facing, scale: f.scale, t: 0 });
  }
  if (['power', 'charge', 'transform', 'evolve', 'ult1', 'kameCharge', 'kaioUp'].includes(f.state) && Math.random() < dt * 14) Stage.lift(f.x);
  if (['power', 'charge', 'transform', 'evolve', 'ult1', 'kaioUp'].includes(f.state) && f.y > FLOOR - 4 && Math.random() < dt * 30) Stage.wind(f.x);
  // hanging in the air is only for a beam fired from up there (or a cinematic pose): knocked out of
  // it by a hit, or out of it any other way, gravity takes over again instead of leaving them stuck
  if (f.floating && !['kameCharge', 'kameFire', 'pose', 'spirit', 'spiritThrow', 'powerDown'].includes(f.state)) f.floating = false;
  // moving is a short hover a few pixels off the ring rather than sliding on it, for those who glide
  // (base Goku and the Kaioken run on their feet)
  const runs = f.who === 'goku' && f.form !== 'ssj';
  const lift = f.state === 'walk' ? (runs ? 0 : 3 + Math.sin(f.at * 5)) : f.state === 'dash' ? (runs ? 1 : 4) : 0;
  f.hover += (lift - f.hover) * Math.min(1, dt * 10);
  if (human(f)) {
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
    // a long juggle (a launcher, a re-launch, a beam carrying them) used to lift a fighter clean off
    // the top of the screen, and whoever chased them with it
    if (f.vy < 0 && f.y < CEILING + CEILING_EASE) f.vy = Math.max(f.vy, -420 * Math.max(0, (f.y - CEILING) / CEILING_EASE));
    if (f.y < CEILING) f.y = CEILING;
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
      // still holding L when the blast would leave the hand: hold it and charge it up instead
      if (human(f) && ctlOf(f).keys.ki && !f.charged && ['kiCast', 'finger'].includes(f.anim) && f.emitted === 0 && f.fi >= [].concat(f.A().emitAt)[0]) {
        startHold(f); break;
      }
      { const shots = [].concat(f.A().emitAt);
        while (f.emitted < shots.length && f.fi >= shots[f.emitted]) { f.emitted++; spawnProjectile(f); } }
      if (f.animDone) { if (f.y < FLOOR - 1) f.play('fall', 'jump'); else f.play('idle'); }
      break;
    case 'kiHold': {
      // the blast grows over HOLD_FULL seconds, draining up to 12 more ki (the boss doesn't pay)
      if (f.chargeLv < 1) {
        const d = Math.min(dt / HOLD_FULL, 1 - f.chargeLv), cost = d * 12;
        if (!human(f) || f.ki >= cost) { if (human(f)) f.ki -= cost; f.chargeLv += d; }
      }
      f.holdT += dt;
      if (Math.random() < dt * (10 + 30 * f.chargeLv)) {
        const [hx, hy] = f.hand(f.who === 'goku' ? 'kiCast' : 'death'), a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 10;
        kiMotes.push({ x: hx + Math.cos(a) * d, y: hy + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, t: 0, life: 0.3, c: f.who === 'goku' ? '#ffe680' : '#e7a8ff' });
      }
      const holding = human(f) ? ctlOf(f).keys.ki : f.holdT < f.aiHold;
      if (!holding || f.holdT > HOLD_FULL + 0.6) releaseHold(f);
      break;
    }
    case 'hurt':
      if ((f.stun -= dt) <= 0) { if (f.y < FLOOR) f.play('fall', 'jump'); else f.play('idle'); }
      break;
    case 'knock':
      if (f.wallBounce && (f.x <= 17 || f.x >= W - 17)) {
        f.wallBounce = false; f.vx = -f.vx * 0.5; f.vy = -230; f.juggle = Math.max(0, f.juggle - 1);
        sparks.push({ x: f.x, y: f.y - 30, t: 0, c: '#ffffff' }); shake(6); sfx.smash();
        Stage.wallHit(f.x < W / 2 ? 2 : W - 2, f.y - 20);
        popups.push({ text: 'WALL BOUNCE!', x: f.x, y: f.y - 60, t: 0, c: '#ffd23a' });
        if (f === boss) comboToken('wall'); else if (f === player) { comboToken('wall', boss); ai.wallAt = game.t; }
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
        if (f.y < FLOOR - 1) { f.vx *= 0.4; f.play('fall', 'jump'); }
        else { f.vx = 0; if (f.anim === 'dash' && f.A('dashStop')) f.play('dashStop', 'idle'); else f.play('idle'); }
      }
      break;
    case 'block':
      // back to the held guard once a blocked hit has played out (or on landing from an air block)
      if (['blockHit', 'blockHeavy'].includes(f.anim) && f.animDone) { f.anim = f.y < FLOOR - 2 && f.A('airBlock') ? 'airBlock' : 'block'; f.at = 9; }
      if (f.anim === 'airBlock' && f.y >= FLOOR) { f.anim = 'block'; f.at = 9; }
      if (!human(f) && (f.t2 -= dt) <= 0) f.play('idle');
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
        // (only up in the air does he fall: on the ring a fall would never land, and he'd be stuck in it)
        if (f.y < FLOOR - 1) { f.floating = false; f.play('fall', 'jump'); } else { f.floating = false; f.play('idle'); }
      }
      break;
    case 'transform': if (f.animDone) finishTransform(f); break;
    case 'flare':
      if (!f.emitted && f.fi >= 1) { f.emitted = 1; solarFlash(f); }
      if (f.animDone) f.play('idle');
      break;
    case 'kaioUp':
      if (f.animDone) {
        setForm(f, 'kaioken'); f.play('idle'); f.inv = 0.2;
        game.flash = Math.max(game.flash, 0.7); shake(7); sfx.explode(); Stage.shock(f.x, 1.2); Stage.strike();
        popups.push({ text: 'KAIOKEN!', x: f.x, y: f.y - 70, t: 0, c: '#ff5a5a' });
      }
      break;
    case 'powerDown':
      if (f.floating) { f.vx = f.vy = 0; f.y += (FLOOR - SPIRIT_HEIGHT - f.y) * Math.min(1, dt * 3); }
      if (f.animDone) {
        const was = f.form;
        setForm(f, 'base'); f.play(f.y < FLOOR - 1 && !f.floating ? 'fall' : 'idle', f.y < FLOOR - 1 && !f.floating ? 'jump' : 'idle');
        popups.push({ text: was === 'kaioken' ? 'KAIOKEN OVER' : 'POWERED DOWN', x: f.x, y: Math.max(44, f.y - 66), t: 0, c: '#fff' });
        if (f.spiritNext) { const { combo } = f.spiritNext; f.spiritNext = null; spiritBomb(f, combo, true); }
      }
      break;
    case 'evolve':
      if ((f.t2 -= dt) <= 0) {
        setForm(f, CELL_FORMS[CELL_FORMS.indexOf(f.form) + 1]); f.play('idle');
        game.flash = 1; shake(8); sfx.explode(); Stage.strike();
        popups.push({ text: CELL_INFO[f.form].name + '!', x: f.x, y: f.y - 70, t: 0, c: '#a8e27c' });
      }
      break;
    case 'pose': if ((f.t2 -= dt) <= 0) f.play('idle'); break;
    // a cutscene attack (see superRush): the wind-up, then the dash that has to land
    case 'superUp': f.vx = 0; if ((f.t2 -= dt) <= 0) { f.play('superDash', 'superDash'); f.t2 = 0.5; sfx.whoosh(); } break;
    case 'superDash': {
      f.vx = f.facing * 430;
      const reached = foe.visible && Math.abs(foe.x - f.x) < 30 && Math.abs(foe.y - f.y) < 44;
      if (reached || (f.t2 -= dt) <= 0) {
        f.vx = 0;
        // blocked, dodged or out of reach: he skids to a stop, wide open
        if (reached && damage(foe, f, 4, false, f.facing) === true && foe.state !== 'block' && foe.hp > 0) superScene(f, foe);
        else { f.play('dashStop', 'pose'); f.t2 = 0.5; Stage.puff(f.x, f.facing); }
      }
      break;
    }
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
    // arms raised while it gathers above him: feet planted on the ring, or held where he is in the sky
    case 'spirit':
      f.t2 -= dt; f.vx = 0;
      if (f.floating) { f.vy = 0; if (f.y > FLOOR - SPIRIT_RISE) f.y += (FLOOR - SPIRIT_RISE - f.y) * Math.min(1, dt * 2.5); }
      break;
    case 'spiritThrow':
      // the Spirit Bomb that turns him: he stays up there, hunched over, until it lands (he used to fall
      // to the ring and turn Super Saiyan down there)
      if (f.floating && game.spirit && game.spirit.owner === f && game.spirit.turn && game.spirit.phase === 'fly') { f.vy = 0; f.t2 = Math.max(f.t2, 0.05); break; }
      if ((f.t2 -= dt) <= 0) { const up = f.y < FLOOR - 1; f.floating = false; f.play(up ? 'fall' : 'idle', up ? 'jump' : 'idle'); }
      break;
  }
}

// A lying sprite is much wider than a standing one, so push it in from the screen edge.
function keepOnScreen(f) {
  const im = f.img, s = f.scale * (im.k || 1);
  const back = (f.facing > 0 ? im.ax : im.width - im.ax) * s, front = (f.facing > 0 ? im.width - im.ax : im.ax) * s;
  f.x = clamp(f.x, Math.min(back, W / 2), Math.max(W - front, W / 2));
}

function powerDown(f) {
  f.play('powerDown', 'powerDown'); f.vx = 0; f.spiritNext = null;
  sfx.whoosh(); Stage.puff(f.x, 1); Stage.puff(f.x, -1);
}

// ---- the Kaioken ----
// Base Goku's own power-up (E, KAIO_COST ki): for as long as his ki lasts he's faster than anything
// else in the fight, his strings come out quicker, he gets a second air dash, and toward + J is a
// three-hit rush. It burns KAIO_DRAIN ki a second (landing hits keeps it fed), E again drops it, and
// it can't be used again for KAIO_REST seconds. The aura bursts his gi top off the first time.
const KAIO_COST = 25, KAIO_DRAIN = 5, KAIO_REST = 4;
function goKaioken(f) {
  const rip = !f.torn;
  if (rip) tearGi(f);
  f.play('kaioUp', 'kaioUp'); f.vx = 0; f.inv = Math.max(f.inv, 1.25);
  // the first frames are him tearing the gi top off: already in his undershirt, he skips them
  if (!rip) f.at = KAIO_RIP / f.A().fps;
  Voice.shout('goku', 'Kaioken!'); sfx.powerup(); shake(5);
}
// T at full ki just after a hit lands (base Goku, or in the Kaioken): he turns Super Saiyan in the
// middle of the combo. They're held reeling for as long as it takes, so the combo carries on in gold.
function comboTransform(f, foe) {
  // (the gi top the Kaioken tore comes back with the gold, unless he's hurt enough for it torn anyway)
  if (f.form === 'kaioken') { setForm(f, 'base'); f.kaioCd = KAIO_REST; f.torn = f.hp <= f.maxHp * TORN_AT; }
  f.ki = 50; game.wentSsj = true;
  // (an attack queued in the old form goes: the Kaioken's rush has no Super Saiyan version)
  f.next = null; f.queue = [];
  f.play('transformQuick', 'transform'); f.vx = 0;
  const a = f.A(), dur = a.fr.length / a.fps;
  if (foe.state === 'hurt') foe.stun = Math.max(foe.stun, dur + 0.3);
  game.comboNames.push({ text: 'SUPER SAIYAN COMBO!', t: 0 });
  Voice.shout('goku', 'Haaaaaaah!'); sfx.powerup(); shake(6);
}
function endKaioken(f, spent = false) {
  f.kaioCd = KAIO_REST; f.kaioT = 0;
  powerDown(f);
  // run dry, it leaves him winded for a moment
  if (spent) f.stamina = Math.min(f.stamina, 50);
}
// Hurt enough (down to TORN_AT of his health, or caught in his own Kaioken's aura), the orange gi top
// goes and he fights on in the blue undershirt: scraps of it fly off him
const TORN_AT = 0.45;
function tearGi(f) {
  f.torn = true;
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI * Math.random(), v = 50 + Math.random() * 70;
    kiMotes.push({ x: f.x + rand(-6, 6), y: f.y - 28 + rand(-6, 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v + 10, t: 0, life: 0.5 + Math.random() * 0.3, c: pick(['#ef8932', '#ba571b', '#ffb060']), big: true });
  }
}

// Super Saiyan in the air at full ki, O: he powers down right there in the sky, then raises his
// arms for the Spirit Bomb (a hit while the gold fades stops it, and he stays Super Saiyan)
function airSpirit(f, combo = false) {
  powerDown(f); f.vy = 0; f.floating = true; f.spiritNext = { combo };
  if (f.A('powerDownAir')) f.play('powerDownAir', 'powerDown');
  const foe = foeOf(f);
  if (combo && foe.state === 'hurt') foe.stun = Math.max(foe.stun, 0.5 + SPIRIT_COMBO_GATHER + 0.4);
  Voice.shout('goku', "This isn't a job for a Super Saiyan...");
}

function finishTransform(f, music = true) {
  setForm(f, 'ssj'); f.play('idle'); Stage.cloud(f.x, 1.6); Stage.strike();
  if (music) Audio8.music.switchTo('ssj');
  game.flash = 1; shake(8); sfx.explode();
}

// Put a fighter back on the floor, visible and standing, when a cutscene or the KO takes over
// (otherwise they can be left mid-air, invisible mid-teleport or half-way through a move).
function settle(f) {
  if (f.state === 'transform') finishTransform(f);
  if (f.state === 'kaioUp') setForm(f, 'kaioken');
  if (f.state === 'powerDown' && f.form === 'kaioken') setForm(f, 'base');
  if (f.state === 'evolve') { f.t2 = 0; updateFighter(f, foeOf(f), 0); }
  if (human(f) && f.state === 'kameCharge') f.ki = Math.min(100, f.ki + (f.kiPaid || 50));
  Object.assign(f, { visible: true, x: f.state === 'tele' ? f.teleTo : f.x, y: FLOOR, vx: 0, vy: 0, queue: [], next: null, big: false, floating: false });
  if (f.hp > 0) f.play('idle');
}

function landed(f) {
  f.sq = f.state === 'knock' ? 0.25 : 0.16;
  if (f.state === 'knock' && f.spiked && !f.bounced) {
    // a dunk (or the air string's spike) slams them into the ring and bounces them back up for one
    // more hit: once per combo, so it can't loop
    f.spiked = false; f.bounced = true; f.y = FLOOR - 1; f.vy = -260; f.vx *= 0.5; f.juggle = Math.max(0, f.juggle - 1);
    Stage.crack(f.x, 1.8); shake(9); sfx.impact(); game.freeze = Math.max(game.freeze, 0.06);
    popups.push({ text: 'GROUND BOUNCE!', x: f.x, y: f.y - 50, t: 0, c: '#ffd23a' });
    if (f === boss) comboToken('bounce'); else if (f === player) comboToken('bounce', boss);
    return;
  }
  f.spiked = false;
  if (f.state === 'knock') { f.juggle = 0; Stage.crack(f.x, 1); f.play('down'); f.t2 = f.hp > 0 ? 0.7 : 99; f.vx = 0; shake(4); sfx.impact(); }
  else if (['jump', 'airAtk'].includes(f.state)) { f.play('land'); f.vx = 0; }
}
