// ---------- camera ----------
// The fight is shown whole, like a classic 2D fighter. Only cinematics move the camera, pushing in on
// a fighter or a spot (cam.focus) and easing back out. Smoothing is exponential, so it feels the same
// at any frame rate.
const cam = { x: W / 2, y: H / 2, z: 1, focus: null };
function updateCamera(raw) {
  let tx = W / 2, ty = H / 2, tz = 1;
  const live = ['fight', 'ready', 'cut', 'ko', 'end', 'intro', 'paused'].includes(game.mode);
  if (cam.focus && live) {
    const f = cam.focus.f;
    tz = cam.focus.z; tx = f ? f.x : cam.focus.x; ty = (f ? f.y - f.hover : cam.focus.y) - 26;
  }
  const kz = 1 - Math.exp(-4 * raw), kp = 1 - Math.exp(-7 * raw);
  cam.z += (tz - cam.z) * kz;
  cam.x += (tx - cam.x) * kp; cam.y += (ty - cam.y) * kp;
  // clamp so the view (not just its centre) stays on the stage
  const z = Math.round(cam.z * S) / S, hw = W / 2 / z, hh = H / 2 / z;
  cam.x = clamp(cam.x, hw, W - hw); cam.y = clamp(cam.y, hh, H - hh);
}

// ---------- main loop ----------
let last = performance.now();
// FPS counter: frames counted over half a second, plus the slowest frame in that time (one long frame
// is a visible hitch even when the average looks fine)
const fpsMeter = { frames: 0, time: 0, worst: 0, fps: 0, worstMs: 0 };
function measureFps(ms) {
  const m = fpsMeter;
  m.frames++; m.time += ms; m.worst = Math.max(m.worst, ms);
  if (m.time >= 500) { m.fps = Math.round(m.frames * 1000 / m.time); m.worstMs = Math.round(m.worst); m.frames = 0; m.time = 0; m.worst = 0; }
}
// online: the connection's round trip, in the corner of both screens (green under 80 ms, red over 200)
function drawPing() {
  if (!window.Net || Net.role !== 'host' || Net.ping == null) return;
  const p = Net.ping, color = p < 80 ? '#8f8' : p < 200 ? '#ffd23a' : '#ff6a5a';
  gfx.setTransform(S, 0, 0, S, 0, 0); gfx.globalAlpha = 1; gfx.globalCompositeOperation = 'source-over';
  gfx.fillStyle = 'rgba(0,0,0,0.55)'; gfx.fillRect(W - 52, H - 10, 50, 8);
  small(`PING ${p}MS`, W - 4, H - 8, color, 'right', 5);
}
// a short message at the top of the screen (a controller connected, keys reset...)
function drawToast() {
  if (!toast) return;
  const age = (performance.now() - toast.at) / 1000;
  if (age > 2.5) { toast = null; return; }
  gfx.setTransform(S, 0, 0, S, 0, 0); gfx.globalCompositeOperation = 'source-over'; gfx.globalAlpha = Math.min(1, (2.5 - age) * 3);
  gfx.fillStyle = 'rgba(6,5,16,0.85)'; gfx.fillRect(W / 2 - 90, H - 40, 180, 11);
  small(toast.text, W / 2, H - 37, '#9ff', 'center', 5); gfx.globalAlpha = 1; // low on the screen, clear of titles and the HUD
}
function drawFps() {
  if (!settings.fps || !fpsMeter.fps) return;
  const { fps, worstMs } = fpsMeter, color = fps >= 58 ? '#8f8' : fps >= 45 ? '#ffd23a' : '#ff6a5a';
  gfx.setTransform(S, 0, 0, S, 0, 0); gfx.globalAlpha = 1; gfx.globalCompositeOperation = 'source-over';
  gfx.fillStyle = 'rgba(0,0,0,0.55)'; gfx.fillRect(2, H - 10, 62, 8);
  small(`${fps} FPS  ${worstMs}MS`, 4, H - 8, color, 'left', 5);
}
function loop(now) {
  // online guest: this screen only shows the host's (net.js); the game here doesn't run
  if (window.Net && Net.role === 'guest') { last = now; Net.pollPad(); requestAnimationFrame(loop); return; }
  measureFps(now - last);
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  pollGamepad();
  // hit-freeze frames skip input, so keep those key presses for the next real frame
  if (step(raw) !== 'frozen') { P1.pressed.clear(); P2.pressed.clear(); }
  gfx.beginFrame(); render(); drawFps(); drawPing(); drawToast(); gfx.endFrame();
  if (window.Net) Net.flush(); // online host: send the guest what changed
  requestAnimationFrame(loop);
}

function step(raw) {
  game.t += raw;
  if (tapOnce('fps')) toggleFps();
  // H in training: the combo checklist on and off
  if (game.training && tapOnce('list')) toggleTrain('checklist');
  if (tapOnce('calm')) { toggleCalm(); popups.push({ text: settings.calm ? 'CALM MODE: LESS SHAKE + FLASH' : 'CALM MODE OFF', x: W / 2, y: 60, t: 0, c: '#fff' }); }
  // the heartbeat layer comes in when you're close to defeat
  Audio8.heartbeat(game.mode === 'fight' && !game.training && player.hp > 0 && player.hp < player.maxHp * 0.25);
  if (tapOnce('music')) { Audio8.init(); popups.push({ text: Audio8.music.toggleMute() ? 'MUSIC OFF' : 'MUSIC ON', x: W / 2, y: 60, t: 0, c: '#fff' }); }
  if (game.mode === 'title') {
    if (tap('confirm')) { Audio8.init(); Audio8.music.play('bg', true); game.mode = 'select'; sfx.blip(); }
    return;
  }
  if (game.menu.length) { menuInput(); return; }
  if (game.mode === 'select') {
    if (tap('left') || tap('right')) { game.pick = 1 - game.pick; sfx.blip(); }
    if (tap('confirm')) { openMenu('mode'); sfx.blip(); }
    return;
  }
  // player 2 can pause a local versus match too (Backspace, or Start on their gamepad)
  if ((tap('pause') || (game.versus && !(window.Net && Net.role) && P2.pressed.has('pause'))) && game.mode === 'fight') {
    game.mode = 'paused'; Audio8.music.stop(); sfx.stopSustain(player); sfx.stopSustain(boss); sfx.stopKame(player); sfx.stopKame(boss); openMenu('pause'); return;
  }
  if (game.mode === 'paused') return;
  if (game.mode === 'end') {
    if (tap('confirm')) retryFight();
    else if (tap('back')) { if (window.Net && Net.role === 'host') Net.drop(); reset(); Audio8.music.play('bg', true); game.mode = 'select'; }
  }
  if (game.mode === 'intro' && tap('back')) { game.skip = true; timers.forEach(t => t.r()); if (game.dlg) game.dlg.done(); game.dlg = null; }

  // dialogue: Enter finishes the line, then advances
  if (game.dlg) {
    const d = game.dlg;
    d.shown += raw * 45;
    if (tapOnce('confirm')) { if (d.shown < d.text.length) d.shown = d.text.length; else { game.dlg = null; d.done(); } }
  }
  const dt = raw * game.slow;
  timers = timers.filter(t => (t.t -= t.real ? raw : dt) > 0 || (t.r(), false));
  if (game.banner && (game.banner.t += raw) > game.banner.dur) game.banner = null;
  game.shake = Math.max(0, game.shake - raw * 16);
  // a Spirit Bomb thrown out of a combo keeps it going until it lands
  const bombPending = (game.spirit && game.spirit.combo && game.spirit.owner === player && ['gather', 'fly'].includes(game.spirit.phase))
    || (player && player.spiritNext && player.spiritNext.combo && player.state === 'powerDown');
  // (and while he turns Super Saiyan in the middle of a combo, the combo waits for him)
  if (bombPending || (player.state === 'transform' && game.combo.n > 0)) game.combo.t = 0;
  if ((game.combo.t += raw) > 1.1 && game.combo.n) Object.assign(game.combo, { n: 0, dmg: 0, moves: [], done: new Set() });
  game.flash = Math.max(0, game.flash - raw * 2.5);
  for (const s of sparks) s.t += raw;
  sparks = sparks.filter(s => s.t < 0.3);
  for (const m of kiMotes) { m.t += raw; m.x += m.vx * raw; m.y += m.vy * raw; m.vy += (m.big ? 260 : -5) * raw; } // (big: scraps of cloth, which fall)
  kiMotes = kiMotes.filter(m => m.t < m.life);
  for (const gh of ghosts) gh.t += raw;
  ghosts = ghosts.filter(gh => gh.t < 0.3);
  for (const pp of popups) pp.t += raw;
  for (const c of game.comboNames) c.t += raw;
  game.comboNames = game.comboNames.filter(c => c.t < 1.6);
  popups = popups.filter(pp => pp.t < 0.9);
  if (game.cine) updateCine(raw);
  updateCutin(raw);
  updateReact(raw);
  if (game.bean) game.bean.t += raw;
  updateCamera(raw);
  // the weather turns for the last stretch: the boss's final phase, or in versus once either fighter
  // is down to their last 30%
  // ...and the sky answers the big moments in any mode: someone transforming, a beam clash, a finisher
  const bigMoment = !!clash || !!game.cine || !!game.react || (game.mode === 'cut' && beams.length > 0)
    || [goku, cell].some(f => ['transform', 'evolve', 'kaioUp', 'ult1', 'ult2', 'ult3', 'spirit'].includes(f.state) || (f.state === 'pose' && ['kameCharge', 'ssjBuild', 'ssjRise', 'ssjFlare', 'power'].includes(f.anim)));
  const lastStretch = !game.training && (game.versus ? Math.min(goku.hp / goku.maxHp, cell.hp / cell.maxHp) < 0.3 : game.phase >= 2);
  Stage.setStorm(bigMoment || lastStretch, bigMoment);
  Stage.update(raw);
  for (const tr of trails) tr.t += raw;
  trails = trails.filter(tr => tr.t < 0.22);
  for (const z of zips) z.t += raw;
  zips = zips.filter(z => z.t < 0.3);
  for (const b of bursts) b.t += raw;
  bursts = bursts.filter(b => b.t < 0.35);
  if (game.freeze > 0) { game.freeze -= raw; return 'frozen'; }
  game.ct += raw;
  for (const f of [goku, cell]) f.chaseT = (f.chaseT || 0) - raw;

  if (game.mode === 'fight') {
    playerInput(dt);
    // versus: player 2 drives the other fighter with their own controller, and there's no boss AI
    if (game.versus && game.mode === 'fight') withController(P2, () => playerInput(dt, boss, player));
    // the player may have just started a cinematic: then the boss doesn't act and no phase starts
    // on top of it this frame
    if (game.versus) { /* both fighters are people */ }
    else if (game.mode === 'fight' && !window.noAI && (!game.training || TRAIN.dummy === 'fight')) bossAI(dt);
    else if (game.mode === 'fight' && game.training && !window.noAI) dummyAI(dt);
    if (game.training) trainingRefill(dt);
    else { game.time -= dt; game.stats.time += dt; }
    if (game.mode === 'fight' && !game.training && !game.versus && game.phase < 2 && !game.juniors && boss.hp <= boss.maxHp * (2 - game.phase) / 3 && boss.hp > 0 && boss.free) {
      // between Semi-Perfect and Perfect, Cell sends in the Cell Juniors first
      if (boss === cell && game.phase === 1) juniorsStart(); else bossPhase();
      return;
    }
  }
  updateFighter(goku, cell, dt);
  updateFighter(cell, goku, dt);
  // keep the two bodies from overlapping; someone lying on the ring takes up about twice the room.
  // Someone planted (firing or charging a beam, holding a charged shot, powering up) doesn't get
  // shoved: the one walking into them is pushed back instead.
  const room = goku.state === 'down' || cell.state === 'down' ? 36 : 20;
  if (goku.visible && cell.visible && Math.abs(goku.x - cell.x) < room && goku.y > FLOOR - 30 && cell.y > FLOOR - 30) {
    const planted = f => ['kameCharge', 'kameFire', 'kiHold', 'charge', 'power', 'transform', 'evolve', 'kaioUp', 'ult1', 'spirit', 'powerDown'].includes(f.state);
    const pg = planted(goku), pc = planted(cell);
    const gap = room - Math.abs(goku.x - cell.x), d = goku.x < cell.x ? -1 : 1;
    const share = pg === pc ? 0.5 : pg ? 0 : 1; // goku's share of the push
    goku.x = clamp(goku.x + d * gap * share, 16, W - 16); cell.x = clamp(cell.x - d * gap * (1 - share), 16, W - 16);
    // pinned at the edge of the screen: whatever's left goes to the other one
    const still = room - Math.abs(goku.x - cell.x);
    if (still > 0.5) { if (share === 0) cell.x = clamp(cell.x - d * still, 16, W - 16); else if (share === 1) goku.x = clamp(goku.x + d * still, 16, W - 16); }
  }
  updateProjectiles(dt);
  updateMinions(dt);
  updateBeams(dt);
  updateSpirit(dt);
  if (game.mode === 'fight') {
    // the final boss beaten: the last clash decides it (once per fight)
    if (boss.hp <= 0) { if (game.juniors) juniorDown(); else if (game.phase === 2 && !game.training && !game.finalDone) finalClash();
      // Goku finishes him with a Kamehameha (see winBlow in game/cinematics.js)
      else if (boss.who === 'cell' && player.who === 'goku' && player.hp > 0 && !game.training) winBlow(player, boss).then(() => finish('win'));
      else finish('win'); }
    else if (player.hp <= 0) finish('lose');
    else if (game.time <= 0) finish('timeup');
  }
}
