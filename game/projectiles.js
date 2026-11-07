// ---------- projectiles & beams ----------
// where a projectile's front is: a long beam (with an origin) is drawn from p.x forward
const tipX = p => p.ox != null ? p.x + p.dir * art(FX_ART[p.kind]).width * p.owner.scale : p.x;
function updateProjectiles(dt) {
  for (const p of projs) {
    p.x += p.vx * dt;
    const foe = foeOf(p.owner), full = art(FX_ART[p.kind]).width * p.owner.scale * (p.size || 1), b = foe.box();
    // a long beam (one with an origin) only hits with its tip
    const len = p.ox != null ? 24 : full, base = p.ox != null ? p.x + p.dir * (full - len) : p.x;
    const x0 = p.dir > 0 ? base : base - len, x1 = p.dir > 0 ? base + len : base;
    if (x1 > b.x0 && x0 < b.x1 && p.y > b.y0 && p.y < b.y1 && foe.visible) {
      const hit = damage(foe, p.owner, p.dmg, p.heavy, p.dir, 'proj', { token: p.kind, pierce: p.kind === 'cannon' });
      if (hit) p.dead = true;
      // a ki blast that connects can be cancelled like a landed punch
      if (hit && hit !== 'deflect' && p.owner.state === 'cast') p.owner.hitLanded = true;
    }
    for (const q of projs) if (q !== p && q.owner !== p.owner && Math.abs(tipX(q) - tipX(p)) < 14 && Math.abs(q.y - p.y) < 14) {
      // the Special Beam Cannon drills straight through ki blasts
      if (q.kind !== 'cannon') q.dead = true;
      if (p.kind !== 'cannon') p.dead = true;
      sparks.push({ x: p.x, y: p.y, t: 0, c: '#ffffff' }); sfx.kiHit();
    }
    // gone once it has left the screen; a long beam starts behind the hand, so only count the side it flies to
    if (p.ox != null ? (p.dir > 0 ? p.x > W + 60 : p.x < -60) : (p.x < -60 || p.x > W + 60)) {
      p.dead = true;
      const big = ['cannon', 'death'].includes(p.kind);
      if (big || (game.farT || 0) <= game.t) { game.farT = game.t + 1.2; Stage.farBlast(p.dir > 0 ? W - 30 - Math.random() * 30 : 30 + Math.random() * 30, big ? 1 : 0.45); if (big) sfx.explode(); }
    }
  }
  projs = projs.filter(p => !p.dead);
}

function beamParts(b) {
  const B = BEAMS[b.owner.who];
  return { start: art(B.start), body: art(B.body), head: art(B.head), s: B.scale * (b.big ? 1.7 : 1) };
}

function updateBeams(dt) {
  beams = beams.filter(b => b.owner.state === 'kameFire');
  for (const b of beams) {
    b.t += dt;
    // the beam stays in the firer's hands even if they're shoved while firing (it used to stay where
    // it was fired from, and could be left hanging in the air)
    { const [hx, hy] = b.owner.hand('kameFire'); b.x0 = hx; b.y = hy; }
    const cos = Math.cos(b.ang), sin = Math.sin(b.ang);
    // an angled beam stops where it hits the ring (and blasts a crater there)
    const edge = (b.dir > 0 ? W + 40 - b.x0 : b.x0 + 40) / cos;
    const maxLen = sin > 0.01 ? Math.min(edge, (FLOOR + 2 - b.y) / sin) : edge;
    if (!clash) b.len = Math.min(b.len + 650 * dt, maxLen);
    if (sin > 0.01 && b.len >= maxLen - 1 && !b.cratered) { b.cratered = true; Stage.crack(b.x0 + b.dir * maxLen * cos, b.big ? 2 : 1.5); shake(8); }
    // a beam low over the ring tears it up underneath and leaves a burnt trench; one that flies off
    // the screen hits the mountains on the horizon
    const tipX = b.x0 + b.dir * b.len * cos;
    if (Math.abs(sin) < 0.3 && b.y > FLOOR - 40) {
      Stage.wake(b.x0 + b.dir * 10, tipX, dt, b.big ? 1.6 : 1);
      // the trench burns in once the beam reaches as far as it goes
      if (!b.scorched && b.len >= maxLen - 1) { b.scorched = true; Stage.scorch(b.x0 + b.dir * 12, tipX, b.big ? 1.5 : 1); }
    }
    if (!clash && !b.farBlast && Math.abs(sin) < 0.5 && b.len >= edge - 1) { b.farBlast = true; Stage.farBlast(tipX < W / 2 ? 40 : W - 40, b.big ? 1.6 : 1.1); sfx.explode(); }
    const foe = foeOf(b.owner), P = beamParts(b);
    const half = P.body.height * P.s * 0.4;
    // the enemy's middle in the beam's own frame: along it and across it
    const fx = (foe.x - b.x0) * b.dir, fy = foe.y - 23 * foe.scale - b.y;
    const along = fx * cos + fy * sin, across = -fx * sin + fy * cos;
    const inBeam = along > -8 && along < b.len + 8 && Math.abs(across) < half + 20;
    if (inBeam && foe.visible && !clash && (b.tick -= dt) <= 0) {
      b.tick = 0.1;
      const lastHit = b.owner.t2 < 0.15;
      damage(foe, b.owner, b.dps * 0.1 * b.owner.dmgMul, lastHit, b.dir, b.big ? 'ult' : 'beam');
      if (!lastHit) game.freeze = 0; // 10 ticks a second: hit-stop on each would stall the whole game
      if (foe.state === 'hurt') { foe.stun = 0.15; foe.vx = b.dir * 40; }
    }
  }
  // two beams meeting head-on = beam struggle; the player mashes J (or U) to push
  const pb = beams.find(b => b.owner === player), bb = beams.find(b => b.owner === boss);
  if (pb && bb && !clash && beamsMeet(pb, bb)) startClash(pb, bb);
  if (clash) {
    const { pb: P, bb: B } = clash;
    // the struggle is along the line between the two hands: s is how far the meeting point has
    // been pushed from the player's hands towards the boss's
    const D = Math.max(1, Math.hypot(B.x0 - P.x0, B.y - P.y));
    // each press pushes; the enemy pushes back steadily, with surges, so holding needs about
    // 5-6 presses a second and winning a few seconds of real mashing (a giant beam pushes harder)
    clash.t = (clash.t || 0) + dt;
    // Space is the mash key (jumping can't happen mid-clash, and it's the easiest key to hammer);
    // J and U still count, and so does the gamepad's A
    if (tap('jump') || tap('punch') || tap('beam')) { clash.s += 0.03; clash.pulse = 1; }
    const surge = 1 + 0.45 * Math.max(0, Math.sin(clash.t * 2.3)) * Math.sin(clash.t * 0.9 + 1);
    // and they tire as it drags on, so steady mashing always gets there in the end
    const tire = Math.max(0.75, 1 - clash.t * 0.04);
    // the AI pushes harder each phase, harder still with a giant beam, and hardest in the final clash
    // (the final clash is a fixed, fair push: about 6 presses a second hold it, a little more wins)
    const push = clash.final ? 0.19 : 0.155 + 0.015 * game.phase + (B.big ? 0.03 : 0);
    clash.s -= push * surge * tire * dt;
    clash.pulse = Math.max(0, (clash.pulse || 0) - dt * 6);
    P.len = clash.s * D; B.len = (1 - clash.s) * D;
    game.shake = Math.max(game.shake, 3); // steady rumble while the beams push
    { const mx = P.x0 + (B.x0 - P.x0) * clash.s; Stage.wake(mx - 16, mx + 16, dt, 1.4); if (Math.random() < dt * 10) Stage.lift(mx); if (!clash.cracked) { clash.cracked = true; Stage.crack(mx, 1.2); } }
    if (Math.random() < dt * 8) sfx.clash();
    // a clash can't last forever: after 14 seconds whoever is ahead breaks through
    const late = clash.t > (clash.final ? 20 : 14);
    const won = clash.s > 0.88 || (late && clash.s >= 0.5), lost = clash.s < 0.12 || (late && clash.s < 0.5);
    if (won || lost) {
      const [winner, loser] = won ? [player, boss] : [boss, player];
      const final = clash.final;
      clash = null; game.banner = null; game.clashWinner = winner;
      // the final clash's ending is played out by finalClash() itself
      // the last mashes mustn't spill into a jump or a punch once it's over
      if (final) { lastPress.punch = lastPress.beam = lastPress.jump = -99; beams = beams.filter(b => b.owner === winner); return; }
      lastPress.punch = lastPress.beam = lastPress.jump = -99;
      beams = beams.filter(b => b.owner === winner);
      winner.t2 = 0.4; loser.floating = false; loser.inv = 0;
      if (loser.hp > 0) loser.play('idle');
      blastAway(loser, winner, 38);
      game.flash = 0.8; sfx.explode();
      popups.push({ text: won ? 'CLASH WON!' : 'OVERPOWERED!', x: winner.x, y: winner.y - 60, t: 0, c: won ? '#ffe04a' : '#ff8a6a' });
    }
  }
}

// Two beams meet when they point at each other (straight across, or one down from the sky and
// one up from the ring) and their tips have crossed.
function beamsMeet(p, b) {
  const up = (x) => [x.dir * Math.cos(x.ang), Math.sin(x.ang)];
  const [px, py] = up(p), [bx, by] = up(b);
  if (px * bx + py * by > -0.6) return false;
  const dx = b.x0 - p.x0, dy = b.y - p.y, D = Math.hypot(dx, dy);
  // either one's hands must lie close to the line of the other's beam
  if (Math.abs(dx * py - dy * px) > 18 && Math.abs(dx * by - dy * bx) > 18) return false;
  return p.len + b.len >= D;
}

// Lock two beams into a struggle: each one re-aims straight at the other's hands and they meet
// halfway, whatever angle they were fired at.
function startClash(pb, bb) {
  const aim = (b, tx, ty) => {
    const dx = tx - b.x0, dy = ty - b.y;
    if (Math.abs(dx) > 1) b.dir = Math.sign(dx);
    b.ang = Math.atan2(dy, Math.max(1, Math.abs(dx)));
  };
  aim(pb, bb.x0, bb.y); aim(bb, pb.x0, pb.y);
  // nobody is untouchable in a clash: whoever loses it takes the hit
  pb.owner.inv = bb.owner.inv = 0;
  clash = { s: 0.5, pb, bb, pulse: 0 };
  game.banner = { text: 'MASH  SPACE !', t: 0, dur: 99 };
  popups.push({ text: 'BEAM CLASH!', x: (pb.x0 + bb.x0) / 2, y: Math.min(pb.y, bb.y) - 20, t: 0, c: '#9ff' });
  game.flash = Math.max(game.flash, 0.5); shake(8); sfx.explode();
}

// Big blast that throws someone across the ring. In a fight it's a normal heavy hit; inside a
// cinematic (where damage() is switched off) the damage and the knock are applied directly.
function blastAway(f, src, dmg) {
  if (game.mode === 'fight') return damage(f, src, dmg, true, src.facing, 'beam');
  f.hp = Math.max(game.training ? 1 : 0, f.hp - dmg);
  f.floating = false; f.play('knock'); f.vy = -260; f.vx = (f.x > src.x ? 1 : -1) * 180; f.y -= 1;
  Stage.crack(f.x, 1.5);
  return true;
}

// beams light up the ring under them
function beamLight(b) {
  const L = b.len, mx = b.x0 + b.dir * L * 0.5 * Math.cos(b.ang);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(mx, FLOOR, 2, mx, FLOOR, Math.max(30, L * 0.6));
  g.addColorStop(0, `rgba(90,170,255,${b.big ? 0.35 : 0.22})`); g.addColorStop(1, 'rgba(90,170,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(mx, FLOOR, Math.max(30, L * 0.6), 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBeam(b) {
  const P = beamParts(b), s = P.s;
  const sw = P.start.width * s, sh = P.start.height * s;
  const bh = P.body.height * s;
  const hs = (bh * 1.2) / P.head.height, hw = P.head.width * hs, hh = P.head.height * hs;
  ctx.save();
  ctx.translate(Math.round(b.x0), Math.round(b.y));
  ctx.scale(b.dir, 1);
  ctx.rotate(b.ang);
  const L = b.len, wob = Math.floor(b.t * 30) % 2;
  // in a clash the beam runs right up to the meeting point and the clash ball covers its end
  const clashing = clash && (b === clash.pb || b === clash.bb);
  // still shorter than its muzzle flare (just fired, or held short in a clash): the whole flare is
  // squeezed into the length so far (it bursts out of the hands) instead of being cut off with a hard
  // edge, and the head overlaps its end so there's no seam between them
  const grown = L >= sw;
  const headX = clashing ? L : grown ? Math.max(sw - hw * 0.3, L - hw * 0.7) : L - hw * 0.45;
  if (headX > sw) ctx.drawImage(P.body, 0, 0, P.body.width, P.body.height, sw - 2, -bh / 2 - wob, headX - sw + 6, bh + wob * 2);
  ctx.drawImage(P.start, 0, -sh / 2, Math.max(1, Math.min(sw, L)), sh);
  // energy on top: a soft glow pulsing round it, a white-hot core, and streaks rushing along it, so
  // it reads as a stream of ki pouring out rather than a flat band
  const run0 = sw * 0.45, run1 = clashing ? L : headX + hw * 0.3;
  if (run1 > run0) {
    const pulse = 0.5 + 0.5 * Math.sin(b.t * 28);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(110,190,255,${(0.14 + 0.1 * pulse) * (settings.calm ? 0.5 : 1)})`;
    ctx.fillRect(run0, -bh * 0.8, run1 - run0, bh * 1.6);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.25 * pulse})`;
    ctx.fillRect(run0, -Math.max(1, bh * 0.1), run1 - run0, Math.max(2, bh * 0.2));
    ctx.fillStyle = 'rgba(235,250,255,0.9)';
    for (let i = 0; i < 7; i++) {
      const len = 6 + (i % 3) * 4, span = run1 - run0 - len;
      if (span <= 0) break;
      const x = run0 + ((b.t * 420 + i * 53) % span), y = (((i * 37) % 9) / 9 - 0.5) * bh * 0.7;
      ctx.fillRect(Math.round(x), Math.round(y), len, 1);
    }
    ctx.restore();
  }
  if (!clashing) ctx.drawImage(P.head, headX, -hh / 2 - wob, hw, hh + wob * 2);
  ctx.restore();
}

// The reaction window around the player: a ring closing in on them. It turns gold for the last
// moment, when a vanish is a perfect dodge.
function drawReactRing(r) {
  const f = r.def, left = r.dur - r.t, perfect = left <= REACT_PERFECT;
  const k = Math.max(0, (left - REACT_PERFECT) / (r.dur - REACT_PERFECT));
  const cx = f.x, cy = f.y - 24 * f.scale, rad = 14 + 46 * k;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = perfect ? '#ffe04a' : '#ffffff'; ctx.lineWidth = perfect ? 2.5 : 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
  // the target the ring closes onto
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffe04a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawReactPrompt(r) {
  const f = r.def, flash = Math.floor(game.t * 8) % 2;
  text('ANSWER IT!', W / 2, 92, 14, flash ? '#ffe04a' : '#ffffff', 'center');
  const opts = [
    ['U  COUNTER BEAM', canKame(f) && f.ki >= COUNTER_KI],
    ['Q  VANISH', f.ki >= 15],
    ['S  BLOCK', true],
  ];
  opts.forEach(([label, ok], i) => text(label, W / 2 + (i - 1) * 92, 108, 8, ok ? '#ffffff' : '#777777', 'center'));
  if (!canKame(f)) text('(COUNTER BEAM NEEDS SUPER SAIYAN)', W / 2, 120, 6, '#aaaaaa', 'center');
}

// The Senzu Bean, tossed in a high arc from the edge of the ring
function drawBean(b) {
  const k = Math.min(1, b.t / b.dur), x = b.x0 + (b.x1 - b.x0) * k, y = b.y0 + (b.y1 - b.y0) * k - Math.sin(k * Math.PI) * 30;
  ctx.save(); ctx.translate(x, y); ctx.rotate(b.t * 12);
  ctx.fillStyle = '#2f7d1e'; ctx.beginPath(); ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fd85a'; ctx.beginPath(); ctx.ellipse(-0.6, -0.5, 1.6, 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Where two beams meet: a ball of energy that swells with every press, throwing off sparks.
function drawClashBall() {
  const { pb, bb, s: k } = clash;
  const x = pb.x0 + (bb.x0 - pb.x0) * k, y = pb.y + (bb.y - pb.y) * k;
  const r = (bb.big ? 15 : 12) + 3 * (clash.pulse || 0) + 1.5 * Math.sin(game.t * 40);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(160,230,255,0.7)'); g.addColorStop(1, 'rgba(60,140,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
  // crackling rays
  ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const a = game.t * 9 + i * 0.9 + Math.sin(game.t * 23 + i) * 0.6, l = r * (1.3 + 0.9 * Math.abs(Math.sin(game.t * 17 + i * 2)));
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(game.t * 31 + i));
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.restore();
  FX.kiGlow(ctx, x, y, r * 0.75, game.t);
}

// A ki barrier in front of a blocking fighter; it flares white when a hit lands on it.
function drawGuard(f) {
  const flare = f.anim === 'blockHit', s = f.scale;
  const cx = f.x + f.facing * 13 * s, cy = f.y - 24 * s;
  ctx.save();
  ctx.globalAlpha = (flare ? 0.75 : 0.35) + 0.08 * Math.sin(game.t * 20);
  ctx.beginPath(); ctx.ellipse(cx, cy, 6, 23 * s, 0, -Math.PI / 2, Math.PI / 2, f.facing < 0);
  ctx.fillStyle = flare ? 'rgba(255,255,255,0.45)' : 'rgba(120,210,255,0.22)'; ctx.fill();
  ctx.strokeStyle = flare ? '#ffffff' : '#8fe3ff'; ctx.lineWidth = flare ? 2 : 1.2; ctx.stroke();
  ctx.restore();
}
