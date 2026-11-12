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
// small text that must fit in maxW (a table column, the screen): a long line gets smaller rather than
// running into the next column or off the edge
function fitSmall(str, x, y, maxW, color = '#fff', align = 'left', size = 5) {
  const w = smallWidth(str, size);
  small(str, x, y, color, align, w > maxW ? Math.max(2.6, size * maxW / w) : size);
}
// how wide small text is (PlayStation symbols are drawn a bit bigger than the font: setText in gfx.js)
function smallWidth(str, size = 5) {
  gfx.font = `${size}px "Press Start 2P", monospace`;
  return gfx.measureText(str).width + (str.match(/[\u25a1\u25b3\u25cb\u2715]/g) || []).length * size * 0.4;
}
// one size for a whole column of small text: the size at which its longest line fits, so the rows
// match instead of each line shrinking by a different amount
function columnSize(lines, maxW, size = 5) {
  const widest = Math.max(1, ...lines.map(s => smallWidth(s, size)));
  return widest > maxW ? Math.max(3.4, size * maxW / widest) : size;
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
  return { im: art(ult ? FX_ART.ssj3Portrait : f.form === 'ssj' ? FX_ART.gokuPortrait : f.form === 'kaioken' ? FX_ART.kaioPortrait : FX_ART.gokuHead), crop: false };
}

function hintFor(g) {
  if (g.who === 'goku') {
    if (g.form === 'base' && g.ki >= 100) return 'T  SUPER SAIYAN     O  SPIRIT BOMB     E  KAIOKEN';
    if (g.form === 'base' && g.ki >= 50) return g.kaioCd > 0 ? 'U  KAMEHAMEHA' : 'U  KAMEHAMEHA     E  KAIOKEN';
    if (g.form === 'base' && g.ki >= KAIO_COST && g.kaioCd <= 0) return 'E  KAIOKEN';
    if (g.form === 'kaioken' && g.ki >= 100) return 'T  SUPER SAIYAN     U  KAMEHAMEHA';
    if (g.form === 'kaioken') return g.ki >= SUPER_KI.kaioken ? 'O  KAIOKEN FINISH     U  KAMEHAMEHA' : 'E  POWER DOWN';
    if (g.form === 'ssj' && g.ki >= 100 && g.y < FLOOR - 1) return 'O  POWER DOWN + SPIRIT BOMB';
    if (g.form === 'ssj' && g.ki >= 100) return g.torn ? 'U  KAMEHAMEHA     O  SUPER KAMEHAMEHA RUSH' : 'U KAMEHAMEHA   Q + U  INSTANT KAMEHAMEHA   O DRAGON FIST';
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
    // long combos hit softer: what the next hit is worth
    const worth = Math.round(comboScale(boss) * 100);
    if (worth < 100) small(`NEXT HIT ${worth}%`, 9, 68 + pop, worth <= 50 ? '#ff9a7a' : '#bbb', 'left', 4);
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
  if (hint && game.mode === 'fight' && !beams.length && !game.comboNames.length) text(promptKeys(hint), W / 2, 41, 8, '#9ff', 'center'); // below the name labels, which a long hint would cover
}

// Versus: each player's hint under their own name, one line per tip, in that player's keys. Online,
// the friend plays with the normal keys on their own computer; on one keyboard player 2 has their own.
function drawVersusHints() {
  if (game.mode !== 'fight' || beams.length) return;
  const sides = [
    [player, 32, 'left', game.combo.n < 2],
    [boss, W - 32, 'right', !game.comboNames.some(c => c.boss)],
  ];
  for (const [f, x, align, clear] of sides) {
    let hint = hintFor(f);
    if (!hint || !clear) continue;
    hint = promptKeys(hint, ctlOf(f)); // that player's keys or gamepad buttons
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
  if (d.shown >= d.text.length && Math.floor(game.t * 3) % 2) text(promptKeys('ENTER'), W - 16, top + 38, 8, '#ffe04a', 'right');
}

// ---------- title and fighter select ----------
// a filled shape from its corners
function poly(pts, fill) {
  gfx.beginPath(); pts.forEach(([x, y], i) => i ? gfx.lineTo(x, y) : gfx.moveTo(x, y)); gfx.closePath();
  gfx.fillStyle = fill; gfx.fill();
}
// a bar leaning to the right (its top edge is lean further right than its bottom): the shape the menus,
// name plates and panels are cut from
const slantBar = (x, y, w, h, lean, fill) => poly([[x + lean, y], [x + w + lean, y], [x + w, y + h], [x, y + h]], fill);
// draw() clipped to a leaning panel
function slantClip(x, y, w, h, lean, draw) {
  gfx.save();
  const m = gfx.st.m.slice();
  gfx.transform(1, 0, -lean / h, 1, x + lean, y); gfx.beginPath(); gfx.rect(0, 0, w, h); gfx.clip();
  gfx.st.m = m; draw(); gfx.restore();
}
const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
// one frame of a cut-in's strip, as a picture for a panel (null until the image has loaded)
// crop: the part of the frame to keep, as shares of it [x, y, width, height]
function cutinFrame(id, i, crop = [0, 0, 1, 1]) {
  const C = CUTINS[id];
  if (!C.img.complete || !C.img.naturalWidth) return null;
  const [sx, sy] = C.cells ? C.cells[i] : [(i % C.cols) * C.w, Math.floor(i / C.cols) * C.h];
  return { img: C.img, sx: sx + crop[0] * C.w, sy: sy + crop[1] * C.h, w: C.w * crop[2], h: C.h * crop[3] };
}
// the close-up each fighter's panel shows: Goku's glare, Perfect Cell's smirk (his face is on the right
// of that frame, past the hand he's lowering)
const FACE_ART = { goku: ['gokuSsj', 2], cell: ['cellPerfect', 33, [0.5, 0, 0.5, 0.8]] };
const SIDE_COLOR = { goku: ['#ff9a3a', '#ffcf7a', 'rgba(255,120,20,'], cell: ['#62d04c', '#b8f29a', 'rgba(60,200,90,'] };
// a fighter's panel: the close-up filling it, tinted in their colour, darker towards the bottom, with a
// bright edge. on: 0..1, how lit it is (the fighter not picked is dimmed)
function facePanel(who, x, y, w, h, lean, on = 1, drift = 0) {
  const f = cutinFrame(...FACE_ART[who]), [edge, , tint] = SIDE_COLOR[who];
  slantClip(x, y, w, h, lean, () => {
    gfx.fillStyle = '#0c0a18'; gfx.fillRect(x - 2, y, w + lean + 4, h);
    if (f) {
      // fill the panel's width (it's wider than it is tall), drifting slowly so it isn't a still
      const k = Math.max((w + lean + 10) / f.w, h / f.h) * 1.06, dw = f.w * k, dh = f.h * k;
      gfx.globalAlpha = 0.35 + 0.65 * on; gfx.imageSmoothingEnabled = true;
      gfx.drawImage(f.img, f.sx, f.sy, f.w, f.h, x + (w + lean - dw) / 2 + drift, y + (h - dh) / 2, dw, dh);
      gfx.globalAlpha = 1; gfx.imageSmoothingEnabled = false;
    }
    gfx.fillStyle = tint + (0.1 + 0.12 * on) + ')'; gfx.fillRect(x - 2, y, w + lean + 4, h);
    const g = gfx.createLinearGradient(0, y + h * 0.35, 0, y + h);
    g.addColorStop(0, 'rgba(8,6,20,0)'); g.addColorStop(1, 'rgba(8,6,20,0.92)');
    gfx.fillStyle = g; gfx.fillRect(x - 2, y, w + lean + 4, h);
    // speed lines racing across it
    gfx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 6; i++) {
      const ly = y + 6 + ((i * 37) % (h - 12)), lx = x - 40 + ((game.t * (90 + i * 23) + i * 71) % (w + lean + 80));
      gfx.fillRect(lx, ly, 14 + (i % 3) * 9, 1);
    }
  });
  // its edge, lit in the fighter's colour
  gfx.strokeStyle = edge; gfx.lineWidth = 1; gfx.globalAlpha = 0.35 + 0.65 * on;
  gfx.beginPath(); gfx.moveTo(x + lean, y); gfx.lineTo(x + w + lean, y); gfx.lineTo(x + w, y + h); gfx.lineTo(x, y + h); gfx.closePath(); gfx.stroke();
  gfx.globalAlpha = 1;
}
// a fighter standing in their stance, k times life size, feet at (x, y)
function standing(who, form, x, y, k, facing = 1, alpha = 1) {
  const A = ANIMS[who][form].idle, im = Sheets.frame(who, A.fr[Math.floor(game.t * A.fps) % A.fr.length]);
  const s = k * (who === 'cell' ? 1.25 : 1), breath = A.breathe ? Math.sin(game.t * 2.6) * 0.018 : 0;
  gfx.fillStyle = 'rgba(0,0,20,0.4)'; gfx.beginPath(); gfx.ellipse(x, y + 1, 12 * k, 2.5 * k, 0, 0, Math.PI * 2); gfx.fill();
  gfx.save(); gfx.globalAlpha = alpha; gfx.translate(Math.round(x), Math.round(y)); gfx.scale(facing * s, s * (1 + breath));
  gfx.drawImage(im, -Math.round(im.ax), -im.height); gfx.restore();
}

function drawTitle() {
  const t = game.t, inK = easeOut(t / 0.55), off = (1 - inK) * 170;
  drawBackground(0.7);
  gfx.fillStyle = 'rgba(6,5,16,0.55)'; gfx.fillRect(0, 0, W, H);
  // the two of them, face to face across a slash of light
  facePanel('goku', -22 - off, 16, 168, 104, 26, 1, Math.sin(t * 0.5) * 2);
  facePanel('cell', 174 + off, 16, 168, 104, 26, 1, -Math.sin(t * 0.5) * 2);
  const slash = 0.55 + 0.45 * Math.sin(t * 5);
  poly([[172, 16], [176, 16], [150, 120], [146, 120]], `rgba(255,236,150,${0.5 + 0.4 * slash})`);
  poly([[166, 16], [168, 16], [142, 120], [140, 120]], 'rgba(255,255,255,0.35)');
  poly([[180, 16], [182, 16], [156, 120], [154, 120]], 'rgba(255,255,255,0.35)');
  // the ring they stand on, and the fighters themselves
  const g = gfx.createLinearGradient(0, 118, 0, H);
  g.addColorStop(0, 'rgba(6,5,16,0)'); g.addColorStop(0.35, 'rgba(6,5,16,0.9)'); g.addColorStop(1, '#06050f');
  gfx.fillStyle = g; gfx.fillRect(0, 108, W, H - 108);
  standing('goku', 'base', 40 - off * 0.6, 156, 1.6, 1, inK);
  standing('cell', 'perfect', W - 40 + off * 0.6, 156, 1.6, -1, inK);
  // the names, slamming in
  const pop = 1 + (1 - easeOut((t - 0.25) / 0.3)) * 0.8, show = t > 0.25;
  if (show) {
    slantBar(84, 96, 152, 30, 8, 'rgba(6,5,16,0.82)');
    slantBar(84, 96, 152, 1, 8, '#ffd23a'); slantBar(76.5, 125, 152, 1, 0, '#ffd23a');
    text('GOKU', 144, 97, 26 * pop, '#ffb070', 'right', '#5a1a00');
    text('CELL', 180, 97, 26 * pop, '#a8e27c', 'left', '#0c3a10');
    text('VS', 162, 94 - (pop - 1) * 6, 32 * pop, '#ffffff', 'center', '#c8102e');
    small('THE  CELL  GAMES', W / 2, 129, '#ffe9a8', 'center', 5);
  }
  if (t > 0.8) {
    // the prompt, on a bar that breathes
    const beat = 0.5 + 0.5 * Math.sin(t * 4.2);
    slantBar(108, 142, 100, 13, 4, `rgba(255,210,58,${0.72 + 0.28 * beat})`);
    text(promptKeys('PRESS ENTER'), W / 2 + 2, 143, 11, '#1b1030', 'center', 'none');
    small(promptKeys('P PAUSE    M MUSIC    R CALM MODE    ESC SKIP A SCENE'), W / 2, 162, '#b9b4d8', 'center', 4);
    small('KEYBOARD OR GAMEPAD   -   STORY, TRAINING, VERSUS AND ONLINE', W / 2, 170, '#77739a', 'center', 4);
  }
  // top strip
  slantBar(-4, 3, 118, 9, 3, 'rgba(6,5,16,0.8)'); small('A DRAGON BALL FAN GAME', 6, 5, '#ffd23a', 'left', 4);
  if (t < 0.25) { gfx.fillStyle = `rgba(255,250,220,${(0.25 - t) * 3})`; gfx.fillRect(0, 0, W, H); }
}

// What each fighter is about, for the select screen: their forms left to right, and what they play like
const ROSTER = {
  goku: { forms: [['BASE', () => FX_ART.gokuHead], ['KAIOKEN', () => FX_ART.kaioPortrait], ['SUPER SAIYAN', () => FX_ART.gokuPortrait]],
    line: 'KAIOKEN FOR SPEED, SUPER SAIYAN FOR POWER', story: 'STOP CELL BEFORE HE BECOMES PERFECT',
    stats: [['POWER', 4], ['SPEED', 5], ['RANGE', 3]], show: 'base' },
  cell: { forms: [['IMPERFECT', () => FX_ART.cellFace(0)], ['SEMI-PERFECT', () => FX_ART.cellFace(1)], ['PERFECT', () => FX_ART.cellFace(2)]],
    line: 'ABSORB, EVOLVE, CALL THE CELL JUNIORS', story: 'TAKE A SAIYAN\'S POWER AND BECOME PERFECT',
    stats: [['POWER', 5], ['SPEED', 3], ['RANGE', 4]], show: 'imperfect' },
};

function drawSelect() {
  const t = game.t;
  drawBackground(0.72);
  gfx.fillStyle = 'rgba(6,5,16,0.6)'; gfx.fillRect(0, 0, W, H);
  // header (a menu opened over this screen brings its own)
  const bare = game.menu.length > 0;
  if (!bare) {
    slantBar(-6, 5, 150, 15, 5, '#ffd23a'); slantBar(146, 5, 6, 15, 5, 'rgba(255,210,58,0.45)'); slantBar(155, 5, 3, 15, 5, 'rgba(255,210,58,0.25)');
    text('CHOOSE YOUR FIGHTER', 8, 6, 12, '#1b1030', 'left', 'none');
    small(promptKeys('A / D  CHOOSE      ENTER  SELECT'), W - 6, 10, '#d8d4f0', 'right', 4);
  }
  [['goku', 12], ['cell', 166]].forEach(([who, x], i) => {
    const on = game.pick === i, R = ROSTER[who], [edge, pale] = SIDE_COLOR[who];
    const lit = on ? 1 : 0.25, y = on ? 26 : 30, h = on ? 122 : 114, w = 130;
    // the card: their close-up up top, fading into the dark their details sit on
    facePanel(who, x, y, w, h, 12, lit, on ? Math.sin(t * 0.6) * 2 : 0);
    if (on) { gfx.strokeStyle = Math.floor(t * 4) % 2 ? '#ffffff' : edge; gfx.lineWidth = 1.5; gfx.beginPath(); gfx.moveTo(x + 12, y); gfx.lineTo(x + w + 12, y); gfx.lineTo(x + w, y + h); gfx.lineTo(x, y + h); gfx.closePath(); gfx.stroke(); }
    // the fighter, in the form they start in (the one picked flexes through their forms)
    const forms = who === 'goku' ? ['base', 'kaioken', 'ssj'] : ['imperfect', 'semi', 'perfect'];
    const fi = on ? Math.floor(t / 1.6) % 3 : 0;
    standing(who, forms[fi], x + (who === 'goku' ? 100 : 104), y + h - 44, on ? 1.5 : 1.2, who === 'goku' ? -1 : 1, on ? 1 : 0.55);
    gfx.globalAlpha = on ? 1 : 0.5;
    text(who.toUpperCase(), x + 8, y + h - 76, 20, on ? pale : '#999', 'left');
    // their forms, the one on show lit
    R.forms.forEach(([name, artOf], k) => {
      const ix = x + 8 + k * 19, iy = y + h - 54;
      icon(art(artOf()), ix, iy, false, false, 16);
      if (on && k === fi) { gfx.strokeStyle = '#ffd23a'; gfx.lineWidth = 1; gfx.strokeRect(ix - 0.5, iy - 0.5, 17, 17); }
    });
    small(on ? R.forms[fi][0] : R.forms[0][0], x + 8, y + h - 34, on ? '#ffd23a' : '#888', 'left', 4);
    // what they're like
    R.stats.forEach(([name, n], k) => {
      const sy = y + h - 26 + k * 6;
      small(name, x + 5, sy, '#b9b4d8', 'left', 4);
      for (let b = 0; b < 5; b++) slantBar(x + 34 + b * 8, sy, 6, 3.5, 1, b < n ? edge : 'rgba(255,255,255,0.14)');
    });
    gfx.globalAlpha = 1;
    if (on) { slantBar(x + 78, y + h - 9, 44, 9, 2, edge); small('PLAYER 1', x + 101, y + h - 7, '#1b1030', 'center', 4); }
  });
  if (bare) return;
  // footer: what the picked fighter is about
  const R = ROSTER[sideOfPick()];
  gfx.fillStyle = 'rgba(6,5,16,0.86)'; gfx.fillRect(0, 153, W, 27); slantBar(-4, 152, W + 8, 1, 0, '#ffd23a');
  text(R.story, W / 2, 155, 9, '#fff', 'center');
  fitSmall(R.line + '     ' + promptKeys(sideOfPick() === 'goku' ? 'E KAIOKEN   T SUPER SAIYAN   U KAMEHAMEHA   G SOLAR FLARE   Y DISC' : 'T EVOLVE   U KAMEHAMEHA   G BARRIER   E JUNIOR'), W / 2, 167, W - 10, '#ffd9a0', 'center', 4);
  fitSmall(promptKeys('J PUNCH  K KICK  L KI BLAST  S BLOCK  I CHARGE  Q VANISH  -  THE FULL MOVE LIST IS ONE ENTER AWAY'), W / 2, 174, W - 10, '#8f8bb0', 'center', 4);
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
  // (it moves the world's sections as a whole, so online only the shake itself is sent, not every element)
  gfx.shake = [Math.round(amp * Math.sin(game.t * 47)) * k, Math.round(amp * 0.7 * Math.sin(game.t * 59 + 1.3)) * k];
  // each part of the picture in a section of its own (see gfx.js): particles coming and going in one
  // don't disturb the others
  gfx.section('back', true);
  drawBackground(game.mode === 'cut' ? 0.25 : 0);
  gfx.section('world', true);
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
    FX.kiAura(gfx, goku.x, goku.y - goku.hover, goku.scale, game.t, (goku.auraPeak || 0.5) * (0.6 + 0.4 * goku.aura), auraOf(goku), settings.calm, goku.aura);
  }
  for (const m of kiMotes) {
    gfx.save(); gfx.globalAlpha = Math.max(0, 1 - m.t / m.life); gfx.fillStyle = m.c;
    const r = m.big ? 2 : m.t < 0.12 ? 1.4 : 0.8; gfx.fillRect(Math.round(m.x), Math.round(m.y), r, r); gfx.restore();
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
  gfx.section('fighters', true);
  const order = player.state === 'attack' ? [boss, player] : [player, boss];
  order.forEach(f => f.draw());
  for (const m of minions) {
    const im = Sheets.frame('cell', JR_FRAMES[m.state] || JR_FRAMES.in);
    gfx.fillStyle = 'rgba(0,0,40,0.3)'; gfx.beginPath(); gfx.ellipse(m.x, FLOOR + 1, 9, 2, 0, 0, Math.PI * 2); gfx.fill();
    gfx.save(); gfx.translate(Math.round(m.x), Math.round(m.y)); gfx.scale(m.dir, 1);
    gfx.drawImage(im, -Math.round(im.ax), -im.height); gfx.restore();
  }
  gfx.section('fx', true);
  // Barrier bursts: a bright sphere that swells and fades
  for (const b of bursts) {
    if (b.flare) {
      // a Solar Flare going off: the streak of light across his forehead, and the ring spreading from it
      const k = b.t / 0.35, ring = art(FX_ART.flareRing), fl = art(FX_ART.flareFlash), s = 0.5 + k * 2.2;
      gfx.save(); gfx.globalCompositeOperation = 'lighter'; gfx.globalAlpha = (1 - k) * (settings.calm ? 0.4 : 1);
      gfx.drawImage(fl, b.x - fl.width * (0.5 + k * 0.5), b.y - fl.height / 2, fl.width * (1 + k), fl.height);
      gfx.drawImage(ring, b.x - ring.width * s / 2, b.y - ring.height * s / 2, ring.width * s, ring.height * s);
      gfx.restore(); continue;
    }
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
    // (the disc spins: its two frames in turn)
    const im = art(p.kind === 'disc' && Math.floor(game.t * 16) % 2 ? FX_ART.disc2 : FX_ART[p.kind]);
    const ps = p.owner.scale;
    const pz = ps * (p.size || 1);
    gfx.save(); gfx.translate(Math.round(p.x), Math.round(p.y)); gfx.scale(p.dir * pz, pz);
    // nothing behind the hand it came out of
    if (p.ox != null) { gfx.beginPath(); gfx.rect((p.ox - p.x) * p.dir / ps, -im.height, 9999, im.height * 2); gfx.clip(); }
    gfx.drawImage(im, 0, -im.height / 2); gfx.restore();
  }
  for (const gh of ghosts) { gfx.globalAlpha = 1 - gh.t / 0.3; gfx.drawImage(gh.img, Math.round(gh.x - gh.img.width / 2), gh.y - gh.img.height); gfx.globalAlpha = 1; }
  for (const s of sparks) FX.spark(gfx, s.x, s.y, s.t, s.c);
  gfx.section('front', true);
  Stage.drawFront(gfx);
  gfx.section('popups', true);
  // kept on screen: a popup over someone at the edge would be cut in half
  gfx.font = '9px Saiyan, Impact, sans-serif';
  for (const pp of popups) {
    const half = gfx.measureText(pp.text).width / 2 + 3;
    text(pp.text, Math.round(clamp(pp.x, half, W - half)), Math.round(Math.max(10, pp.y - pp.t * 18)), 9, pp.c, 'center');
  }
  gfx.section('hud');
  gfx.setTransform(S, 0, 0, S, 0, 0);
  if (game.flash > 0) { gfx.fillStyle = `rgba(255,250,220,${game.flash * (settings.calm ? 0.25 : 0.8)})`; gfx.fillRect(0, 0, W, H); }
  // the final clash is played without the HUD: it's a cinematic, and Cell is up where the bars are
  if (['fight', 'ready', 'ko', 'paused', 'cut'].includes(game.mode) && !game.finalSky) drawHUD();
  if (game.banner) {
    const b = game.banner, pop = Math.min(1, b.t * 6);
    text(b.text, W / 2, 62 - (1 - pop) * 10, 28, '#ffe04a', 'center', '#7a1a00');
  }
  if (game.mode === 'end') {
    // the verdict up top, the score sheet under it, and the prompt along the bottom: everything clear of
    // the ring, where the winner is playing out their victory (the sheet used to sit right on top of them)
    const verdict = game.result === 'draw' ? 'DRAW!' : game.versus ? (game.result === 'win' ? 'P1 WINS!' : 'P2 WINS!') : game.result === 'win' ? 'YOU WIN!' : `${boss.who.toUpperCase()} WINS`;
    text(verdict, W / 2, game.report ? 2 : 40, 26, game.result === 'draw' ? '#ffffff' : game.result === 'win' ? '#ffe04a' : '#ff8a6a', 'center');
    slantBar(60, 167, 200, 11, 3, 'rgba(6,5,16,0.8)');
    if (Math.floor(game.t * 2) % 2) text(promptKeys('ENTER  RETRY      ESC  CHOOSE FIGHTER'), W / 2 + 1, 168, 8, '#fff', 'center');
    drawResults();
  }
  if (game.cutin) drawCutin();
  if (game.react && human(game.react.def) && !game.react.answer) drawReactPrompt(game.react);
  if (game.training && game.mode === 'fight') drawChecklist();
  drawDialogue();
  drawMenu();
}
