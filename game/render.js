// ---------- rendering ----------
function text(str, x, y, size, color, align = 'left', stroke = '#000') {
  gfx.font = `${size}px Saiyan, Impact, sans-serif`;
  gfx.textAlign = align; gfx.textBaseline = 'top';
  gfx.lineWidth = Math.max(2, size / 6); gfx.strokeStyle = stroke; gfx.lineJoin = 'round';
  gfx.strokeText(str, x, y); gfx.fillStyle = color; gfx.fillText(str, x, y);
}

function small(str, x, y, color = '#fff', align = 'center', size = 5) {
  gfx.font = `${size}px "Press Start 2P", monospace`; gfx.fillStyle = color; gfx.textAlign = align; gfx.textBaseline = 'top';
  gfx.fillText(str, x, y);
}

function drawBackground(dim) {
  Stage.drawBack(gfx, dim);
  // the sky darkens while the Spirit Bomb draws in the world's energy
  if (game.finalSky) { game.finalSky = Math.min(1, game.finalSky + 0.02); gfx.fillStyle = `rgba(20,8,40,${FINAL_SKY * game.finalSky})`; gfx.fillRect(0, 0, W, H); }
  const sb = game.spirit;
  if (sb && sb.phase !== 'boom') {
    const k = sb.phase === 'gather' ? Math.min(1, sb.t / 0.6) : 1;
    gfx.fillStyle = `rgba(14,22,60,${0.32 * k})`; gfx.fillRect(0, 0, W, H);
  }
}

function bar(x, y, w, h, v, color, flip) {
  gfx.fillStyle = '#000'; gfx.fillRect(x - 1, y - 1, w + 2, h + 2);
  gfx.fillStyle = '#3a1010'; gfx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(v, 0, 1));
  gfx.fillStyle = color; gfx.fillRect(flip ? x + w - fw : x, y, fw, h);
  gfx.fillStyle = 'rgba(255,255,255,0.35)'; gfx.fillRect(flip ? x + w - fw : x, y, fw, 1);
}

// The icon follows the fighter's form: Goku's normal head, Super Saiyan or SSJ3 portrait; Cell's head per form.
function iconOf(f) {
  if (f.who === 'cell') {
    // the sheet's portraits; Perfect Cell's turns furious when he's hurt or going all out
    const angry = f.form === 'perfect' && (f.hp < f.maxHp * 0.35 || ['kameCharge', 'kameFire', 'barrier'].includes(f.state));
    return { im: art(FX_ART.cellFace(angry ? 3 : CELL_INFO[f.form].face)), crop: false };
  }
  const ult = f.state.startsWith('ult');
  return { im: art(ult ? FX_ART.ssj3Portrait : f.form === 'ssj' ? FX_ART.gokuPortrait : FX_ART.gokuHead), crop: false };
}

function hintFor(g) {
  if (g.who === 'goku') {
    if (g.form === 'base' && g.ki >= 100) return 'T  SUPER SAIYAN     O  SPIRIT BOMB';
    if (g.form === 'ssj' && g.ki >= 100 && g.y < FLOOR - 1) return 'O  POWER DOWN + SPIRIT BOMB     S + O  SSJ SPIRIT BOMB';
    if (g.form === 'ssj' && g.ki >= 100) return 'U KAMEHAMEHA   Q + U  INSTANT KAMEHAMEHA   O DRAGON FIST';
    if (g.form === 'ssj' && g.ki >= 50) return 'U  KAMEHAMEHA  (WORKS IN THE AIR TOO)';
  } else {
    if (g.form !== 'perfect' && g.ki >= 100) return 'PRESS T  -  EVOLVE!';
    if (g.form === 'perfect' && g.ki >= 100) return 'U  KAMEHAMEHA    O  SOLAR KAMEHAMEHA!';
    if (g.ki >= 50) return 'U  KAMEHAMEHA    TOWARD + U  DEATH BEAM';
    if (g.ki >= 20) return 'PRESS U  -  DEATH BEAM';
  }
  return '';
}

function drawHUD() {
  const pi = iconOf(player), bi = iconOf(boss);
  icon(pi.im, 6, 5, pi.crop, player.who === 'cell');
  icon(bi.im, W - 28, 5, bi.crop, boss.who === 'cell');
  bar(32, 7, 100, 7, player.hp / player.maxHp, player.hp / player.maxHp > 0.3 ? '#ffd23a' : '#ff4a3a');
  const bossBar = boss.who === 'cell' ? CELL_INFO[boss.form].bar : ['#ff9a3a', '#ffd84a', '#fff27a'][game.phase];
  bar(W - 132, 7, 100, 7, boss.hp / boss.maxHp, bossBar, true);
  if (!game.juniors && !game.versus) { gfx.fillStyle = '#000'; [1, 2].forEach(k => gfx.fillRect(W - 132 + Math.round(100 * k / 3), 7, 1, 7)); }
  const kiFull = player.ki >= 100 && Math.floor(game.t * 6) % 2;
  bar(32, 17, 70, 4, player.ki / 100, kiFull ? '#ffffff' : '#4fd2ff');
  const broken = player.guardBroken && Math.floor(game.t * 8) % 2;
  bar(32, 24, 50, 2, player.stamina / 100, broken ? '#ff5a3a' : player.guardBroken ? '#a0503a' : '#9be36b');
  text((game.versus ? 'P1  ' : '') + NAME(player), 32, 28, 9, '#fff');
  if (game.versus) {
    // player 2's ki and guard bars, mirrored on their side
    const kiFull2 = boss.ki >= 100 && Math.floor(game.t * 6) % 2;
    bar(W - 102, 17, 70, 4, boss.ki / 100, kiFull2 ? '#ffffff' : '#4fd2ff', true);
    const broken2 = boss.guardBroken && Math.floor(game.t * 8) % 2;
    bar(W - 82, 24, 50, 2, boss.stamina / 100, broken2 ? '#ff5a3a' : boss.guardBroken ? '#a0503a' : '#9be36b', true);
    text(NAME(boss) + '  P2', W - 32, 28, 9, '#fff', 'right');
  } else text(NAME(boss), W - 32, 16, 9, '#fff', 'right');
  if (game.training) text('TRAINING', W / 2, 6, 11, '#9ff', 'center');
  else text(String(Math.max(0, Math.ceil(game.time))), W / 2, 4, 16, '#ffe04a', 'center');
  if (game.combo.n >= 2) {
    const pop = Math.max(0, 0.15 - game.combo.t) * 40;
    text(`${game.combo.n} HITS!`, 8, 44, 12 + pop, '#ffd23a', 'left', '#7a1a00');
    small(`${Math.round(game.combo.dmg)} DAMAGE`, 9, 60 + pop, '#fff', 'left');
  }
  // named combos stack under the timer in screen space, newest at the bottom
  game.comboNames.filter(c => !c.boss).slice(-3).forEach((c, i) => {
    const pop = Math.max(0, 0.12 - c.t) * 40;
    gfx.globalAlpha = Math.min(1, (1.6 - c.t) * 3);
    text(c.text, W / 2, 24 + i * 12, 10 + pop, '#ffd23a', 'center', '#7a1a00');
    gfx.globalAlpha = 1;
  });
  // the boss's named combos, on its side, opposite the player's hit counter
  game.comboNames.filter(c => c.boss).slice(-2).forEach((c, i) => {
    const pop = Math.max(0, 0.12 - c.t) * 40;
    gfx.globalAlpha = Math.min(1, (1.6 - c.t) * 3);
    text(c.text, W - 8, 44 + i * 12, 10 + pop, '#ff8a6a', 'right', '#5a0a00');
    gfx.globalAlpha = 1;
  });
  if (game.versus) return drawVersusHints();
  const hint = hintFor(player);
  if (hint && game.mode === 'fight' && !beams.length && !game.comboNames.length) text(hint, W / 2, 41, 8, '#9ff', 'center'); // below the name labels, which a long hint would cover
}

// Versus: each player's hint under their own name, one line per tip, in that player's keys. Online,
// the friend plays with the normal keys on their own computer; on one keyboard player 2 has their own.
const P2_KEY_NAMES = { T: ']', O: "'", U: ';', Q: '\\', S: 'DOWN' };
function drawVersusHints() {
  if (game.mode !== 'fight' || beams.length) return;
  const sides = [
    [player, 32, 'left', game.combo.n < 2],
    [boss, W - 32, 'right', !game.comboNames.some(c => c.boss)],
  ];
  for (const [f, x, align, clear] of sides) {
    let hint = hintFor(f);
    if (!hint || !clear) continue;
    if (f === boss && !(window.Net && Net.role === 'host')) hint = hint.replace(/\b[TOUQS]\b/g, k => P2_KEY_NAMES[k]);
    hint.split(/\s{3,}/).forEach((line, i) => text(line.trim(), x, 40 + i * 8, 6, '#9ff', align));
  }
}

// Icon in a dark frame. crop: draw just the top square of a tall portrait.
function icon(im, x, y, crop, flip, size = 22) {
  const sw = im.width, sh = crop ? im.height : Math.min(im.height, im.width);
  const k = Math.min(size / sw, size / sh);
  gfx.fillStyle = '#120c1c'; gfx.fillRect(x, y, size, size);
  gfx.save(); gfx.beginPath(); gfx.rect(x, y, size, size); gfx.clip();
  gfx.translate(x + size / 2, y + size - sh * k); if (flip) gfx.scale(-1, 1);
  gfx.drawImage(im, 0, 0, sw, sh, -sw * k / 2, 0, sw * k, sh * k);
  gfx.restore();
  gfx.strokeStyle = '#000'; gfx.lineWidth = 1; gfx.strokeRect(x - 0.5, y - 0.5, size + 1, size + 1);
}

function drawDialogue() {
  const d = game.dlg; if (!d) return;
  // Goku's side (Goku, Krillin calling from off the ring) in orange, Cell's side in green
  const top = 38, isGoku = d.who === 'GOKU' || d.who === 'KRILLIN';
  gfx.fillStyle = 'rgba(8,6,20,0.85)'; gfx.fillRect(10, top, W - 20, 50);
  gfx.strokeStyle = isGoku ? '#f2691c' : '#62bf4c'; gfx.lineWidth = 1; gfx.strokeRect(10.5, top + 0.5, W - 21, 49);
  // speaker portrait (Krillin has none: he's shouting from the crowd)
  if (d.who !== 'KRILLIN') { const sp = iconOf(isGoku ? goku : cell); icon(sp.im, 16, top + 6, sp.crop, !isGoku, 20); }
  text(d.who, 42, top + 4, 11, isGoku ? '#ffb070' : '#a8e27c');
  gfx.font = '7px "Press Start 2P", monospace'; gfx.fillStyle = '#fff'; gfx.textAlign = 'left'; gfx.textBaseline = 'top';
  const shown = d.text.slice(0, Math.floor(d.shown)), words = shown.split(' ');
  let line = '', y = top + 20;
  for (const w of words) {
    if (gfx.measureText(line + w).width > W - 66) { gfx.fillText(line, 42, y); line = ''; y += 10; }
    line += w + ' ';
  }
  gfx.fillText(line, 42, y);
  if (d.shown >= d.text.length && Math.floor(game.t * 3) % 2) text('ENTER', W - 16, top + 38, 8, '#ffe04a', 'right');
}

function drawTitle() {
  drawBackground(0.45);
  const p = art(FX_ART.gokuPortrait);
  gfx.drawImage(p, 22, 26, p.width * 1.3, p.height * 1.3);
  const c = Sheets.frame('cell', '12.0');
  gfx.save(); gfx.translate(W - 44, 110); gfx.scale(-1.6, 1.6); gfx.drawImage(c, -c.ax, -c.height); gfx.restore();
  text('GOKU', W / 2 - 4, 30, 32, '#ffb070', 'right');
  text('VS', W / 2, 58, 22, '#fff', 'center');
  text('CELL', W / 2 + 4, 30, 32, '#a8e27c', 'left');
  if (Math.floor(game.t * 2) % 2) text('PRESS ENTER', W / 2, 96, 14, '#ffe04a', 'center');
  small('P PAUSE / MENU   M MUSIC   R CALM MODE (LESS SHAKE)   ESC SKIP', W / 2, 156, '#ddd');
  small('GAMEPAD WORKS TOO: ALL ITS BUTTONS ARE IN PAUSE > CONTROLS', W / 2, 165, '#aaa');
}

const CONTROLS = {
  goku: [
    'J PUNCH  K KICK  (CHAIN THEM)  L KI BLAST',
    'TOWARD + J RUSH   TOWARD + K SLASH',
    'T SUPER SAIYAN   U KAMEHAMEHA   O DRAGON FIST',
    'FULL KI (SSJ): Q THEN U, OR U THEN Q = INSTANT KAMEHAMEHA',
  ],
  cell: [
    'J PUNCH  K KICK  (CHAIN THEM)  L FINGER BEAM',
    'TOWARD + L BARRAGE   G BARRIER   E JUNIOR   J+K ABSORB',
    'T EVOLVE   U DEATH BEAM / KAMEHAMEHA   IN THE AIR: Q VANISH',
    'O SOLAR KAMEHAMEHA (PERFECT, FULL KI)',
  ],
};
const STORY = {
  goku: ['Stop Cell before he', 'absorbs the androids', 'and becomes PERFECT.'],
  cell: ['Absorb the power of', 'a Saiyan, evolve and', 'become PERFECT.'],
};

function drawSelect() {
  drawBackground(0.55);
  text('CHOOSE YOUR FIGHTER', W / 2, 3, 16, '#ffe04a', 'center');
  [['goku', 80], ['cell', 240]].forEach(([who, cx], i) => {
    const on = game.pick === i, pulse = on ? Math.floor(game.t * 4) % 2 : 0;
    gfx.fillStyle = on ? 'rgba(40,30,70,0.9)' : 'rgba(10,8,20,0.75)'; gfx.fillRect(cx - 52, 30, 104, 100);
    gfx.strokeStyle = on ? (pulse ? '#fff6b0' : '#ffd23a') : '#444'; gfx.lineWidth = on ? 2 : 1; gfx.strokeRect(cx - 52, 30, 104, 100);
    if (who === 'goku') {
      const im = art(on ? FX_ART.gokuPortrait : FX_ART.gokuHead);
      icon(im, cx - 48, 34, !on, false, 44);
      const body = Sheets.frame('goku', on ? '11.0' : '0.2');
      gfx.drawImage(body, cx + 26 - body.ax, 80 - body.height, body.width, body.height);
    } else {
      icon(art(FX_ART.cellFace(on ? 2 : 0)), cx - 48, 34, false, false, 44);
      const body = Sheets.frame('cell', on ? '12.0' : '0.0');
      gfx.save(); gfx.translate(cx + 26, 80); gfx.scale(-1.1, 1.1); gfx.drawImage(body, -body.ax, -body.height); gfx.restore();
    }
    text(who.toUpperCase(), cx - 48, 82, 16, who === 'goku' ? '#ffb070' : '#a8e27c');
    STORY[who].forEach((l, k) => small(l, cx - 48, 102 + k * 8, '#ddd', 'left'));
  });
  gfx.fillStyle = 'rgba(0,0,0,0.65)'; gfx.fillRect(0, 136, W, 44);
  CONTROLS[game.pick ? 'cell' : 'goku'].forEach((l, i) => small(l, W / 2, 140 + i * 8));
  small('A/D MOVE  DOUBLE-TAP A/D DASH (AIR TOO)  W JUMP  S BLOCK  I CHARGE  Q VANISH', W / 2, 172, '#aaa');
  if (Math.floor(game.t * 2) % 2) small('A / D  CHOOSE     ENTER  STORY / TRAINING / GUIDE', W / 2, 22, '#fff');
}

function render() {
  gfx.setTransform(S, 0, 0, S, 0, 0);
  gfx.imageSmoothingEnabled = false;
  if (game.mode === 'title' || game.mode === 'select') {
    if (game.mode === 'title') drawTitle(); else drawSelect();
    if (Audio8.music.muted) small('MUSIC OFF (M)', W - 4, 4, '#f99', 'right');
    drawMenu();
    return;
  }
  // camera: zoom in whole-pixel steps (S x zoom stays an integer, so the pixel art stays crisp)
  const z = Math.round(cam.z * S) / S, k = S * z;
  gfx.setTransform(k, 0, 0, k, Math.round((W / 2 / z - cam.x) * k), Math.round((H / 2 / z - cam.y) * k));
  // shake rides on top of the camera: a smooth wave scaled by trauma squared
  const tr = Math.min(1, game.shake / 12), amp = tr * tr * 12 * (settings.calm ? 0.3 : 1);
  gfx.translate(Math.round(amp * Math.sin(game.t * 47)), Math.round(amp * 0.7 * Math.sin(game.t * 59 + 1.3)));
  drawBackground(game.mode === 'cut' ? 0.25 : 0);
  // during the Juniors, Semi-Perfect Cell watches from the back of the ring in his stance (his
  // front-facing pose is too rough to show)
  if (game.juniors) {
    const im = Sheets.frame('cell', ANIMS.cell.semi.idle.fr[0]);
    gfx.save(); gfx.globalAlpha = 0.9; gfx.translate(W - 26, FLOOR - 21); gfx.scale(-1, 1);
    gfx.drawImage(im, -Math.round(im.ax), -im.height); gfx.restore();
  }
  // shadows
  for (const f of [goku, cell]) if (f.visible) {
    const k = clamp(1 - (FLOOR - f.y + f.hover) / 120, 0.3, 1);
    gfx.fillStyle = 'rgba(0,0,40,0.35)';
    gfx.beginPath(); gfx.ellipse(f.x, FLOOR + 1, 13 * k, 3 * k, 0, 0, Math.PI * 2); gfx.fill();
  }
  // charging ki at the hands
  // the Special Beam Cannon charging at Cell's fingertip
  if (cell.anim === 'cannon' && cell.visible && cell.fi < 4) {
    const [hx, hy] = cell.hand('cannon'), k = Math.min(1, cell.at / 0.5);
    FX.kiGlow(gfx, hx, hy - cell.hover, 1.5 + k * 3.5, game.t, ['#ffffff', '#fff6b0', '#ffd23a', '#e08a10']);
  }
  for (const f of [goku, cell]) if (f.state === 'kiHold' && f.visible) {
    const [hx, hy] = f.hand(f.who === 'goku' ? 'kiCast' : 'death'), lv = f.chargeLv || 0;
    const pal = f.who === 'goku' ? ['#ffffff', '#fff3b0', '#ffd23a', '#e08a10'] : ['#ffffff', '#f3c8ff', '#c65cff', '#7a1fb0'];
    FX.kiGlow(gfx, hx - f.facing * 2, hy - f.hover, 1.5 + lv * (f.who === 'goku' ? 6 : 4), game.t, pal);
  }
  for (const f of [goku, cell]) if (f.anim === 'kameCharge' && f.visible) {
    const [hx, hy] = f.hand('kameFire');
    const grow = f.state === 'kameCharge' ? 1 - f.t2 : Math.min(1, f.at / 1.6);
    FX.kiGlow(gfx, hx - f.facing * 8, hy - f.hover, (2 + grow * 5) * (f.big ? 2 : 1), game.t);
  }
  // Goku's signature pressure aura; keep it behind the sprite so the pose stays readable.
  if (goku.visible && goku.aura > 0.02) {
    FX.kiAura(gfx, goku.x, goku.y - goku.hover, goku.scale, game.t, (goku.auraPeak || 0.5) * (0.6 + 0.4 * goku.aura), goku.form === 'ssj' || goku.state === 'transform' || goku.state === 'ult1', settings.calm, goku.aura);
  }
  for (const m of kiMotes) {
    gfx.save(); gfx.globalAlpha = Math.max(0, 1 - m.t / m.life); gfx.fillStyle = m.c;
    const r = m.t < 0.12 ? 1.4 : 0.8; gfx.fillRect(Math.round(m.x), Math.round(m.y), r, r); gfx.restore();
  }
  for (const z of zips) {
    gfx.save(); gfx.globalAlpha = 0.85 * (1 - z.t / 0.3);
    gfx.translate(Math.round(z.x), Math.round(z.y)); gfx.scale(z.dir * z.scale, z.scale);
    gfx.drawImage(z.im, -z.im.width - 4, -z.im.height / 2); gfx.restore();
  }
  for (const tr of trails) {
    gfx.save(); gfx.globalAlpha = 0.4 * (1 - tr.t / 0.22);
    gfx.translate(Math.round(tr.x), Math.round(tr.y)); gfx.scale(tr.facing * tr.scale, tr.scale);
    gfx.drawImage(tr.im, -Math.round(tr.im.ax), -tr.im.height); gfx.restore();
  }
  const order = player.state === 'attack' ? [boss, player] : [player, boss];
  order.forEach(f => f.draw());
  for (const m of minions) {
    const im = Sheets.frame('cell', JR_FRAMES[m.state] || JR_FRAMES.in);
    gfx.fillStyle = 'rgba(0,0,40,0.3)'; gfx.beginPath(); gfx.ellipse(m.x, FLOOR + 1, 9, 2, 0, 0, Math.PI * 2); gfx.fill();
    gfx.save(); gfx.translate(Math.round(m.x), Math.round(m.y)); gfx.scale(m.dir, 1);
    gfx.drawImage(im, -Math.round(im.ax), -im.height); gfx.restore();
  }
  // Barrier bursts: a bright sphere that swells and fades
  for (const b of bursts) {
    const k = b.t / 0.35, r = 10 + k * 52;
    gfx.save(); gfx.globalCompositeOperation = 'lighter'; gfx.globalAlpha = (1 - k) * (settings.calm ? 0.4 : 0.8);
    const g = gfx.createRadialGradient(b.x, b.y, r * 0.5, b.x, b.y, r);
    g.addColorStop(0, 'rgba(214,168,255,0)'); g.addColorStop(0.8, 'rgba(230,200,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    gfx.fillStyle = g; gfx.beginPath(); gfx.arc(b.x, b.y, r, 0, Math.PI * 2); gfx.fill(); gfx.restore();
  }
  for (const f of order) if ((f.state === 'block' || (f.state === 'pose' && f.anim === 'block')) && f.visible) drawGuard(f);
  if (game.react && human(game.react.def) && !game.react.answer) drawReactRing(game.react);
  for (const b of beams) beamLight(b);
  for (const b of beams) drawBeam(b);
  if (clash) drawClashBall();
  drawSpirit();
  if (game.bean) drawBean(game.bean);
  for (const p of projs) {
    const im = art(FX_ART[p.kind]);
    const ps = p.owner.scale;
    const pz = ps * (p.size || 1);
    gfx.save(); gfx.translate(Math.round(p.x), Math.round(p.y)); gfx.scale(p.dir * pz, pz);
    // nothing behind the hand it came out of
    if (p.ox != null) { gfx.beginPath(); gfx.rect((p.ox - p.x) * p.dir / ps, -im.height, 9999, im.height * 2); gfx.clip(); }
    gfx.drawImage(im, 0, -im.height / 2); gfx.restore();
  }
  for (const gh of ghosts) { gfx.globalAlpha = 1 - gh.t / 0.3; gfx.drawImage(gh.img, Math.round(gh.x - gh.img.width / 2), gh.y - gh.img.height); gfx.globalAlpha = 1; }
  for (const s of sparks) FX.spark(gfx, s.x, s.y, s.t, s.c);
  Stage.drawFront(gfx);
  // kept on screen: a popup over someone at the edge would be cut in half
  gfx.font = '9px Saiyan, Impact, sans-serif';
  for (const pp of popups) {
    const half = gfx.measureText(pp.text).width / 2 + 3;
    text(pp.text, Math.round(clamp(pp.x, half, W - half)), Math.round(Math.max(10, pp.y - pp.t * 18)), 9, pp.c, 'center');
  }
  gfx.setTransform(S, 0, 0, S, 0, 0);
  if (game.flash > 0) { gfx.fillStyle = `rgba(255,250,220,${game.flash * (settings.calm ? 0.25 : 0.8)})`; gfx.fillRect(0, 0, W, H); }
  // the final clash is played without the HUD: it's a cinematic, and Cell is up where the bars are
  if (['fight', 'ready', 'ko', 'paused', 'cut'].includes(game.mode) && !game.finalSky) drawHUD();
  if (game.banner) {
    const b = game.banner, pop = Math.min(1, b.t * 6);
    text(b.text, W / 2, 62 - (1 - pop) * 10, 28, '#ffe04a', 'center', '#7a1a00');
  }
  if (game.mode === 'end') {
    text(game.versus ? (game.result === 'win' ? 'P1 WINS!' : 'P2 WINS!') : game.result === 'win' ? 'YOU WIN!' : `${boss.who.toUpperCase()} WINS`, W / 2, 46, 28, game.result === 'win' ? '#ffe04a' : '#ff8a6a', 'center');
    if (Math.floor(game.t * 2) % 2) text('ENTER  FIGHT AGAIN      ESC  CHOOSE FIGHTER', W / 2, 82, 9, '#fff', 'center');
  }
  if (game.cutin) drawCutin();
  if (game.react && human(game.react.def) && !game.react.answer) drawReactPrompt(game.react);
  if (game.training && game.mode === 'fight') drawChecklist();
  drawDialogue();
  drawMenu();
}
