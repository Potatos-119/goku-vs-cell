// ---------- player ----------
// what J / K chain into after each attack
const CHAINS = {
  goku: { j: { p1: 'p2', p2: 'p3', p3: 'p4', k1: 'p2', k2: 'p3', rush: 'p2' }, k: { p1: 'k1', p2: 'k2', p3: 'k3', k1: 'k2', k2: 'k3', rush: 'k2' } },
  cell: { j: { p1: 'p2', p2: 'p3', k1: 'p2', rush: 'p2' }, k: { p1: 'k1', p2: 'k2', k1: 'k2', rush: 'k2' } },
};

const AIR_CHAIN = { air: 'air2', air2: 'spike' };
// the hop that follows someone up off a ground bounce
const CHASE_LOW_V = -300;

// Cancels after a landed hit. Returns true when one happened.
// Cell's Death Beam (every form): toward + U, so it stays reachable now that U is his Kamehameha
// (with under 50 ki, U alone fires it too)
const deathBeamFirst = g => g.who === 'cell' && g.ki >= 20
  && ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) === g.facing;
function cancel(g, foe, dashDir) {
  const isGoku = g.who === 'goku';
  if (g.A().hit && (g.A().hit.launch || g.A().hit.spike) && act('jump')) {
    // chase them into the air (after a slam, a lower hop up to where the bounce takes them)
    g.play('jump'); g.sq = -0.14; g.vy = g.A('jump') && g.chaseLow ? CHASE_LOW_V : JUMP_V - 70; g.vx = g.facing * 90; g.chaseT = 0; sfx.whoosh(); return true;
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
// order within the current combo (the last step must be the hit that just landed). The player's are
// ticked off in the combo list and give ki; the boss's are named on screen, on its side.
function comboToken(tok, src = player) {
  const mine = src === player, c = mine ? game.combo : game.bossCombo;
  c.moves.push(tok);
  for (const combo of COMBOS[src.who]) {
    if (c.done.has(combo.name)) continue;
    const match = (step, t) => step === t || (step === 'melee' && MELEE.includes(t));
    if (!match(combo.steps[combo.steps.length - 1], tok)) continue;
    let i = combo.steps.length - 2;
    for (let k = c.moves.length - 2; k >= 0 && i >= 0; k--) if (match(combo.steps[i], c.moves[k])) i--;
    if (i >= 0) continue;
    c.done.add(combo.name);
    if (!mine) {
      c.names.push({ name: combo.name }); game.comboNames.push({ text: combo.name + '!', t: 0, boss: true });
      if (game.versus) src.ki = Math.min(100, src.ki + 5); // player 2 earns ki for combos too
      continue;
    }
    game.learned.add(combo.name); game.stats.named++;
    player.ki = Math.min(100, player.ki + 5);
    game.comboNames.push({ text: combo.name + '!', t: 0 });
    sfx.parry();
  }
}

// g: the fighter being controlled (the player, or in versus player 2's fighter), with the current
// controller's keys
function playerInput(dt, g = player, foe = boss) {
  const isGoku = g.who === 'goku';
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
    if (keys.block && !g.guardBroken) { raiseGuard(g); g.vx = 0; return; }
    if (keys.charge) {
      if (g.state !== 'charge') { g.play('charge'); sfx.chargeLoop(g); }
      g.vx = 0; return;
    }
    if (act('jump')) {
      g.play('jump'); g.sq = -0.14; sfx.whoosh();
      // just after a launcher, the jump chases them up
      if (g.chaseT > 0 && foe.state === 'knock') { g.vy = g.chaseLow ? CHASE_LOW_V : JUMP_V - 70; g.vx = g.facing * 90; g.chaseT = 0; }
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
      if (!isGoku && g.form === 'semi') { g.ki = 50; return cellPerfectScene(g); }
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
    // the dunk: S + J (or K) in the air slams straight down at them
    if (keys.block && (act('punch') || act('kick'))) { g.facing = foe.x > g.x ? 1 : -1; return g.play('spike', 'airAtk'); }
    // F (or punch + kick together) in the air: the re-launch (it only finds them once they're up)
    if (act('grab') || chord('punch', 'kick')) return g.play('airLaunch', 'airAtk');
    if (pairPending()) return;
    if (act('punch') || act('kick')) g.play('air', 'airAtk');
    // holding S in the air: an air guard (arms crossed), until you land or let go
    else if (keys.block && !g.guardBroken && g.A('airBlock')) raiseGuard(g, 'airBlock');
  } else if (g.state === 'airAtk') {
    // after an air hit lands: vanish, air-dash to restart the string, or finish with a beam / ki blast
    if (g.hitLanded) {
      if (airCancel(g, foe, dashDir)) return;
    }
    // F (or punch + kick together) mid-string: the re-launch next (straight away, once a hit has landed)
    if (act('grab') || chord('punch', 'kick')) { if (g.hitLanded) { g.facing = foe.x > g.x ? 1 : -1; return g.play('airLaunch', 'airAtk'); } g.next = 'airLaunch'; }
    // S + J mid-string goes straight to the dunk
    else if (AIR_CHAIN[g.anim] && !pairPending() && (act('punch') || act('kick'))) g.next = keys.block ? 'spike' : AIR_CHAIN[g.anim];
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
    const inAir = g.y < FLOOR - 2;
    // out of a ground guard Cell can still call a Junior or fire the Special Beam Cannon (on a gamepad
    // those are guard + kick and guard + beam)
    if (!inAir && !isGoku && g.form === 'perfect' && g.ki >= 35 && g.assistCd <= 0 && act('junior')) { g.ki -= 35; g.assistCd = 3; return callJunior(g); }
    if (!inAir && !isGoku && g.ki >= CANNON_KI && act('cannon')) { g.ki -= CANNON_KI; return specialBeamCannon(g); }
    // from an air guard: S + J dunks, and S + O is still the Super Saiyan Spirit Bomb
    if (inAir && (act('punch') || act('kick'))) { g.facing = foe.x > g.x ? 1 : -1; return g.play('spike', 'airAtk'); }
    if (inAir && isGoku && g.form === 'ssj' && g.ki >= 100 && act('ult')) return spiritBomb(g);
    // the guard turns to face the enemy, even when they reappear behind you
    if (!keys.block) g.play(inAir ? 'fall' : 'idle', inAir ? 'jump' : 'idle'); else if (foe.visible) g.facing = foe.x > g.x ? 1 : -1;
  }
  else if (g.state === 'charge') {
    if (!keys.charge) g.play(g.A('chargeEnd') ? 'chargeEnd' : 'idle', 'idle');
    else g.ki = Math.min(100, g.ki + 32 * dt);
  }
}
