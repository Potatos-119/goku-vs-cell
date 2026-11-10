// ---------- per-fighter update ----------
function updateFighter(f, foe, dt) {
  f.at += dt;
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
  const auraOn = ['power', 'charge', 'transform', 'ult1', 'kameCharge'].includes(f.state);
  f.aura = (f.aura || 0) + ((auraOn ? 1 : 0) - (f.aura || 0)) * Math.min(1, dt * (auraOn ? 5 : 6));
  if (auraOn) f.auraPeak = ['transform', 'ult1'].includes(f.state) ? 0.9 : f.state === 'kameCharge' ? 0.72 : 0.5;
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
        game.flash = 1; shake(8); sfx.explode(); Stage.strike();
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
  const im = f.img, s = f.scale * (im.k || 1);
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
  if (f.A('powerDownAir')) f.play('powerDownAir', 'powerDown');
  const foe = foeOf(f);
  if (combo && foe.state === 'hurt') foe.stun = Math.max(foe.stun, 0.5 + SPIRIT_COMBO_GATHER + 0.4);
  Voice.shout('goku', "This isn't a job for a Super Saiyan...");
}

function finishTransform(f) {
  setForm(f, 'ssj'); f.play('idle'); Stage.cloud(f.x, 1.6); Stage.strike();
  Audio8.music.switchTo('ssj');
  game.flash = 1; shake(8); sfx.explode();
}

// Put a fighter back on the floor, visible and standing, when a cutscene or the KO takes over
// (otherwise they can be left mid-air, invisible mid-teleport or half-way through a move).
function settle(f) {
  if (f.state === 'transform') finishTransform(f);
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
