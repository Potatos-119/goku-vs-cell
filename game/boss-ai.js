// ---------- boss AI ----------
// The boss reads what the player does: it punishes charging, whiffs and broken guards, deals
// with a Kamehameha, anti-airs jump-ins and, from phase two on, vanishes out of trouble.
const ai = { think: 0.8, vanishCd: 3, ultCd: 6, spam: 0, barrierCd: 5, assistCd: 6, cannonCd: 6, rolled: 0 }; // spam: how hard the player is spamming ki blasts
const AI_REACT = [0.42, 0.3, 0.2]; // seconds between decisions in each phase

// blink out (leaving an afterimage), reappear behind the player and attack straight away
function vanish(c, foe) {
  // boss Goku can Instant Transmission from the start, just less often before he goes Super Saiyan
  ai.vanishCd = game.phase === 0 ? 4.5 : 2.4 - game.phase * 0.5;
  trails.push({ im: c.img, x: c.x, y: c.y, facing: c.facing, scale: c.scale, t: 0 });
  teleport(c, foe); c.t2 = 0.18; c.counter = true;
}

// Super Dash: a flying charge straight at the player that swats ki blasts aside on the way in
function superDash(c) {
  c.facing = player.x > c.x ? 1 : -1;
  c.play('dash'); c.superDash = true; c.t2 = clamp((Math.abs(player.x - c.x) - 30) / 340, 0.12, 0.5);
  c.vx = c.facing * 340 * c.speed; ai.think = 0;
  Stage.puff(c.x, c.facing); sfx.whoosh();
}

// shots it reacts to, per phase (more often the more the player spams them)
const SHOT_REACT = [0.6, 0.75, 0.9];

// Boss Goku fights the way the player can: launchers chased into air combos and finished with a
// Meteor Smash or (Super Saiyan) an air Kamehameha; ground strings ended with the wall-bounce slash, a
// launcher, a ki blast or a Kamehameha; attacks he blocks punished. It runs every frame (combos need
// frame timing), before bossAI's slower decisions, and returns true when it has taken over.
const GOKU_CHASE = [0.5, 0.75, 0.9], GOKU_CANCEL = [0.45, 0.65, 0.8], GOKU_PUNISH = [0.35, 0.55, 0.75];
function gokuFlow(c, g, dt, ph) {
  const dist = Math.abs(g.x - c.x), close = dist < 46, ssjBeam = canKame(c) && game.kameCd <= 0;
  if (c.state !== 'attack') c.aiRolled = false;
  // the air Kamehameha he jumped for: fire from the top of the jump
  if (ai.airBeam) {
    if (c.state === 'jump' && c.vy > -60) { ai.airBeam = false; c.facing = g.x > c.x ? 1 : -1; startKame(c); return true; }
    if (c.state !== 'jump') ai.airBeam = false;
  }
  // a launcher landed: go after them (or not, the earlier in the fight the less often)
  const hit = c.A().hit;
  if (c.state === 'attack' && c.hitLanded && hit && hit.launch && !ai.chase && g.state === 'knock') {
    ai.chase = { t: 0, go: Math.random() < GOKU_CHASE[ph] };
    if (ai.chase.go) { c.queue = []; c.next = null; }
  }
  if (ai.chase) {
    const ch = ai.chase;
    ch.t += dt;
    if (!ch.go || ch.t > 2.2 || ['down', 'getup', 'appear'].includes(g.state) || (ch.jumped && c.y >= FLOOR && c.state !== 'airAtk')) { ai.chase = null; return false; }
    if (!ch.jumped && c.free) {
      c.facing = g.x > c.x ? 1 : -1;
      c.play('jump'); c.sq = -0.14; c.vy = JUMP_V - 70; c.vx = c.facing * 90; sfx.whoosh(); ch.jumped = true; return true;
    }
    if (c.state === 'jump' && ch.jumped) {
      c.facing = g.x > c.x ? 1 : -1;
      if (dist < 34 && Math.abs(g.y - c.y) < 30) { c.play('air', 'airAtk'); return true; }
      if (dist > 48 && !c.airDashed && c.vy > -200) { dash(c, c.facing); return true; }
      return true;
    }
    if (c.state === 'airAtk' && c.hitLanded && !c.next) {
      // the second air hit landed: Super Saiyan finishes with a Kamehameha down at them, otherwise
      // the chain ends in the Meteor Smash
      if (c.anim === 'air2' && ssjBeam && Math.random() < 0.35 + ph * 0.2) { game.kameCd = rand(6, 9); ai.chase = null; startKame(c, false, false, true); return true; }
      // or dunk them straight away after the first air hit
      if (c.anim === 'air' && Math.random() < 0.25 + ph * 0.1) c.next = 'spike';
      // or send them back up once and keep going
      else if (c.anim === 'air2' && !g.relaunched && Math.random() < 0.3 + ph * 0.1) c.next = 'airLaunch';
      else if (c.anim === 'airLaunch') { ai.chase.t = 0; c.next = 'air'; }
      else if (AIR_CHAIN[c.anim]) c.next = AIR_CHAIN[c.anim];
    }
    return c.state !== 'idle' && c.state !== 'walk';
  }
  // the last hit of a ground string landed: cancel it into something
  if (c.state === 'attack' && c.hitLanded && !c.queue.length && !c.next && !c.aiRolled && !(hit && hit.launch)) {
    c.aiRolled = true;
    if (Math.random() < GOKU_CANCEL[ph]) {
      const r = Math.random(), atWall = g.x < 46 || g.x > W - 46;
      c.facing = g.x > c.x ? 1 : -1;
      if (atWall && r < 0.5) { startAttack(c, 'slash'); return true; }
      if (ssjBeam && r < 0.35) { game.kameCd = rand(6, 9); startKame(c, false, false, true); return true; }
      if (r < 0.65) { startAttack(c, Math.random() < 0.5 ? 'p4' : 'k3'); return true; }
      cast(c, 'kiCast'); return true;
    }
  }
  // blocked their attack and they're still recovering: hit back
  if (c.state === 'block' && g.state === 'attack' && g.hitDone && close && game.t - (ai.punishAt || -9) > 0.8) {
    ai.punishAt = game.t;
    if (Math.random() < GOKU_PUNISH[ph]) {
      c.facing = g.x > c.x ? 1 : -1; c.queue = ['p2', 'p3', 'p4']; startAttack(c, 'p1'); ai.think = 0.5; return true;
    }
  }
  return false;
}

function bossAI(dt) {
  const c = boss, g = player, ph = game.phase, isCell = c.who === 'cell';
  game.kameCd -= dt; ai.cannonCd -= dt; ai.vanishCd -= dt; ai.ultCd -= dt; ai.barrierCd -= dt; ai.assistCd -= dt;
  ai.spam = Math.max(0, ai.spam - dt * 0.6);
  // Cell bursts out of a long combo with his Barrier (one roll per hit taken)
  if (isCell && c.state === 'hurt' && c.comboTaken >= 3 && c.comboTaken !== ai.rolled) {
    ai.rolled = c.comboTaken;
    if (ai.barrierCd <= 0 && Math.random() < 0.2 + ph * 0.15) { ai.barrierCd = rand(7, 10); c.ki = Math.max(c.ki, 30); return barrier(c); }
  }
  // ki blasts on the way: vanish, Super Dash through them, jump over or block
  for (const p of projs) {
    if (p.owner !== g || p.seen) continue;
    const gap = (c.x - p.x) * Math.sign(p.vx), eta = gap / Math.abs(p.vx);
    if (gap < 0 || eta > 0.38) continue;
    p.seen = true;
    if (!c.free || Math.random() > SHOT_REACT[ph] * diff().react + ai.spam * 0.05) continue;
    const dist = Math.abs(g.x - c.x), r = Math.random();
    c.facing = g.x > c.x ? 1 : -1;
    if (ph >= 1 && ai.vanishCd <= 0 && r < 0.2) return vanish(c, g);
    if (dist > 70 && (ai.spam >= 2 || r < 0.45)) return superDash(c);
    if (dist > 90 && r < 0.7) { c.play('jump'); c.vy = JUMP_V; c.vx = c.facing * 170; return; }
    c.play('block'); c.t2 = eta + 0.2; c.vx = 0; return;
  }
  if (!isCell && gokuFlow(c, g, dt, ph)) return;
  // jumped over a shot (or in): come down with an air attack
  if (c.state === 'jump' && c.vy > 0 && Math.abs(g.x - c.x) < 40 && g.y - c.y < 40) { c.facing = g.x > c.x ? 1 : -1; return c.play('air', 'airAtk'); }
  if (!c.free) return;
  c.facing = g.x > c.x ? 1 : -1;
  if (c.state === 'walk') c.vx = (c.anim === 'back' ? -1 : 1) * c.facing * 75 * c.speed;
  // reflex, not a decision: against ki blast spam it acts the moment it's free. Up close a jab beats
  // the next blast's startup (a counter hit); further out it Super Dashes in through them.
  if (ai.spam >= 1.5 && g.state === 'cast' && g.y >= FLOOR - 4) {
    const d = Math.abs(g.x - c.x);
    if (d < 46) { c.queue = isCell ? ['p2', 'k2'] : ['p2', 'p3', 'k3']; ai.think = 0.6; return startAttack(c, 'p1'); }
    if (d < 220) return superDash(c);
  }
  if ((ai.think -= dt) > 0) return;
  ai.think = rand(0.8, 1.2) * AI_REACT[ph] / c.speed * (isCell ? 1 : 0.85) * diff().think;
  const dist = Math.abs(g.x - c.x), close = dist < 48, r = Math.random();
  const dashIn = () => { c.superDash = false; c.play('dash'); c.t2 = 0.24; c.vx = c.facing * 280 * c.speed; Stage.puff(c.x, c.facing); };
  const combo = () => {
    const list = isCell
      ? [['p2', 'k2'], ['p1', 'p2', 'k2'], ['k1', 'k2'], ['p1', 'k1'], ['p1', 'p2', 'k1', 'k2']]
      : [['p1', 'p2', 'p3', 'p4'], ['p1', 'k1', 'k2', 'k3'], ['k1', 'k2', 'p3'], ['p1', 'p2', 'k3'], ['rush', 'p2', 'p3']];
    c.queue = pick(list).slice(0, ph + 2);
    startAttack(c, c.queue.shift()); ai.think = rand(0.5, 0.9) / c.speed;
  };
  const shoot = () => cast(c, isCell ? 'finger' : 'kiCast');
  const bigShot = () => {
    // sometimes a held, charged shot instead (a charged ki blast, or a charged Death Beam)
    if (Math.random() < 0.25) { startHold(c); c.aiHold = rand(0.5, 1.1); c.charged = false; return; }
    return isCell ? cast(c, c.form === 'imperfect' || r < 0.5 ? 'death' : 'barrage') : cast(c, Math.random() < 0.6 ? 'barrage' : 'kiCast');
  };
  const canBeam = canKame(c);
  const canVanish = (ph >= 1 || !isCell) && ai.vanishCd <= 0;
  // from range, Cell sometimes fires the Special Beam Cannon (most of all at a turtling player)
  if (isCell && c.form !== 'junior' && ai.cannonCd <= 0 && dist > 70 && r < (g.state === 'block' ? 0.5 : 0.12)) {
    ai.cannonCd = rand(6, 10); return specialBeamCannon(c);
  }

  // Goku's finishers once he's all out: Instant Kamehameha on a weakened enemy, or the Dragon Fist
  if (!isCell && ph >= 1 && ai.ultCd <= 0 && g.hp < g.maxHp * (ph >= 2 ? 0.35 : 0.25) && r < (ph >= 2 ? 0.35 : 0.2)) { ai.ultCd = rand(16, 20); return instantKame(c); }
  if (!isCell && ph >= 2 && ai.ultCd <= 0 && dist < 170 && r < 0.3) { ai.ultCd = rand(12, 16); return startUlt(c); }
  // Perfect Cell calls in a Cell Junior from range
  if (isCell && c.form === 'perfect' && ai.assistCd <= 0 && dist > 50 && r < 0.3) { ai.assistCd = rand(7, 11); return callJunior(c); }
  // Perfect Cell's finisher: the Solar Kamehameha from the sky
  if (isCell && c.form === 'perfect' && ai.ultCd <= 0 && g.hp < g.maxHp * 0.35 && r < 0.35) { ai.ultCd = rand(16, 20); return solarKame(c); }
  // the player is charging ki: never let that happen for free
  // the Spirit Bomb: stop him while it gathers, get out of its way once it's thrown
  if (game.spirit && game.spirit.owner === g) {
    // a ki blast is the quickest way to reach him from range (more and more likely the further into
    // the fight); otherwise he braces behind his guard, which a Spirit Bomb goes straight through
    if (game.spirit.phase === 'gather') {
      if (close) return combo();
      if (r < 0.2 + 0.06 * ph) return shoot();
      c.play('block'); c.t2 = 0.5; c.vx = 0; return;
    }
    if (game.spirit.phase === 'fly') { if (canVanish && r < 0.5) return vanish(c, g); return dash(c, -c.facing); }
  }
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
    if (canBeam && game.kameCd <= 0) { game.kameCd = rand(7, 11); return startKame(c, true); }
    if (canVanish) return vanish(c, g);
    c.play('block'); c.t2 = 0.6; return;
  }
  // jumping in: kick them out of the air, or shoot them on the way down
  if (g.y < FLOOR - 20 && g.vy > 0 && dist < 70) return close ? startAttack(c, isCell ? 'k2' : 'k3') : shoot();
  // openings: whiffed attack, landing, ki blast recovery, broken guard
  const open = g.guardBroken || ['land', 'cast', 'kiHold', 'transform', 'evolve'].includes(g.state) || (g.state === 'attack' && g.hitDone && dist > 40);
  // shooting from far away gets Super Dashed once they've been at it a while
  if (open) return close ? combo() : dist < 150 ? dashIn() : g.state === 'cast' && ai.spam >= 1 ? superDash(c) : shoot();
  if (close) {
    // a turtling player gets grabbed through the guard
    if (g.state === 'block' && r < 0.25 + ph * 0.1) return startAttack(c, 'grab');
    if (g.state === 'attack' && r < 0.25 + ph * 0.12) { c.play('block'); c.t2 = 0.45; c.vx = 0; return; }
    // turtling: keep hitting if their stamina is low, otherwise step out and bait
    if (g.state === 'block' && g.stamina > 40 && r < 0.45) { if (r < 0.25) dash(c, -c.facing); else c.play('back', 'walk'); ai.think = 0.45; return; }
    return combo();
  }
  if (!isCell && dist > 50) {
    const r2 = Math.random();
    // jump in and come down with an air attack (the jump-in rule above swings it)
    if (r2 < 0.12) { c.play('jump'); c.vy = JUMP_V; c.vx = c.facing * 150 * c.speed; return; }
    // Super Saiyan: jump and fire a Kamehameha down at them from the top of it
    if (canBeam && game.kameCd <= 0 && dist > 90 && r2 < 0.2) { game.kameCd = rand(7, 11); ai.airBeam = true; c.play('jump'); c.vy = JUMP_V; c.vx = 0; return; }
    // a ki barrage from the start (Cell's big shots wait for his later forms)
    if (ph === 0 && dist > 80 && r2 < 0.28) return bigShot();
    // at a distance, early on, he squares up to you (an opening, if you're quick)
    if (ph === 0 && dist > 130 && r2 < 0.34) { c.play('taunt', 'pose'); c.t2 = 0.7; return; }
  }
  if (dist < 140) {
    if (r < 0.45) return dashIn();
    if (r < 0.62) return shoot();
    if (ph >= 1 && r < 0.75) return bigShot();
    if (r < 0.78) return dash(c, -c.facing);
    if (r < 0.88) return c.play('back', 'walk');
    return c.play('walk');
  }
  if (canBeam && game.kameCd <= 0 && r < 0.25 + 0.08 * ph) { game.kameCd = rand(7, 11); return startKame(c); }
  if (r < 0.28) return shoot();
  // from far away, a held, charged shot now and then (it can be seen coming: punish it)
  if (r < 0.4) { startHold(c); c.aiHold = rand(0.5, 1.1); c.charged = false; return; }
  if (ph >= 1 && r < 0.45) return bigShot();
  if (canVanish && r < 0.58) return vanish(c, g);
  if (isCell && ph < 2 && r < 0.68) { c.play('taunt', 'pose'); c.t2 = 0.8; return; }
  c.play('walk');
}
