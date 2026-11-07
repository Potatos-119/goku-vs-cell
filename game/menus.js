// ---------- menus ----------
// Screens are a stack: the pause menu opens over the fight, the move list opens over the pause
// menu, and Back pops one level. Every screen opens with an item focused, and works the same on
// keyboard (W/S or arrows, Enter, Esc) and gamepad (d-pad, A, B).
const bars = n => '|'.repeat(n) + '.'.repeat(10 - n);
const sideOfPick = () => game.pick ? 'cell' : 'goku';
const guideWho = () => game.mode === 'select' ? sideOfPick() : player.who;
function openMenu(id) { game.menu.push({ id, i: 0 }); }
function resumeCombatAudio() {
  for (const f of [player, boss]) {
    if (f.state === 'charge') sfx.chargeLoop(f);
    else if (f.state === 'kameFire') sfx.beamLoop(f);
  }
}
function closeMenu() {
  game.menu.pop();
  if (!game.menu.length && game.mode === 'paused') { game.mode = 'fight'; Audio8.music.play(); resumeCombatAudio(); }
}
function closeAllMenus() {
  game.menu = [];
  if (game.mode === 'paused') { game.mode = 'fight'; Audio8.music.play(); resumeCombatAudio(); }
}
function quitToSelect() {
  if (window.Net && Net.role === 'host') Net.drop(); // leaving an online match ends it
  const pick = game.side === 'cell' ? 1 : 0;
  reset(); game.pick = pick; game.mode = 'select'; Audio8.music.play('bg', true);
}
// Versus: two people on one keyboard (or gamepads), no boss. Both fighters start in their base form
// with the same health and evolve or transform themselves (T at full ki), as you do in story mode;
// transforming the first time heals a little (versusHeal).
const VERSUS_HP = 200;
// health back the first time each form is reached in a round: Goku has one form to reach, Cell two,
// so both can win back 40
const VERSUS_HEAL = { ssj: 40, semi: 20, perfect: 20 };
function startVersus(side) {
  reset(side); game.versus = true; Audio8.music.play('bg');
  setForm(goku, 'base'); setForm(cell, 'imperfect'); // without the boss's extra speed and damage
  for (const f of [goku, cell]) f.hp = f.maxHp = VERSUS_HP;
  startFight();
}
function startTraining(side) {
  reset(side); game.training = true; Audio8.music.play('bg');
  player.ki = 100; startFight();
}

// ---------- training settings ----------
// What the dummy does, and what refills, set from the pause menu (saved for next time):
//   stand  - stands still          block - guards everything        jump - hops up and down
//   single - walks up and throws one attack every so often (to practise blocking, perfect blocks
//            and counter hits)     fight - the full boss AI
const TRAIN = { dummy: 'stand', dummyHp: true, hp: true, ki: 'refill' };
try { Object.assign(TRAIN, JSON.parse(localStorage.getItem('training') || '{}')); } catch (e) { /* defaults */ }
const DUMMY_MODES = ['stand', 'block', 'jump', 'single', 'fight'];
const DUMMY_LABEL = { stand: 'STANDS STILL', block: 'BLOCKS', jump: 'JUMPS', single: 'SINGLE HITS', fight: 'FIGHTS BACK' };
const KI_MODES = ['refill', 'off', 'full'], KI_LABEL = { refill: 'REFILLS', off: 'NO REFILL', full: 'ALWAYS FULL' };
const onOff = v => v ? 'ON' : 'OFF';
function saveTrain() { try { localStorage.setItem('training', JSON.stringify(TRAIN)); } catch (e) { /* not saved, still works */ } }
function cycleTrain(key, list, d = 1) { TRAIN[key] = list[(list.indexOf(TRAIN[key]) + (d > 0 ? 1 : list.length - 1)) % list.length]; saveTrain(); }
function toggleTrain(key) { TRAIN[key] = !TRAIN[key]; saveTrain(); }

// The dummy, unless it's set to fight back (then the boss AI runs instead)
const dummy = { t: 1 };
function dummyAI(dt) {
  const c = boss, g = player, mode = TRAIN.dummy;
  if (!(c.free || c.state === 'block')) return;
  c.facing = g.x > c.x ? 1 : -1;
  const dist = Math.abs(g.x - c.x);
  if (mode === 'block') { if (c.state !== 'block') { c.play('block'); c.vx = 0; } c.t2 = 99; return; }
  if (c.state === 'block') c.play('idle');
  dummy.t -= dt;
  if (mode === 'jump') {
    if (c.y >= FLOOR && dummy.t <= 0) { dummy.t = 1.1; c.play('jump'); c.vy = JUMP_V; c.vx = 0; }
    return;
  }
  if (mode === 'single') {
    // walk up to striking range, then one attack, then a pause before the next
    if (dist > 42) { if (c.anim !== 'walk') c.play('walk'); c.vx = c.facing * 70 * c.speed; return; }
    if (c.state === 'walk') { c.play('idle'); c.vx = 0; }
    if (dummy.t <= 0) { dummy.t = 1.6; c.queue = []; c.next = null; startAttack(c, pick(c.who === 'cell' ? ['p1', 'p2', 'k1'] : ['p1', 'p2', 'k1', 'k2'])); }
  }
}
const MENUS = {
  pause: () => ({ title: game.training ? 'TRAINING' : 'PAUSED', items: [
    { label: 'RESUME', go: closeAllMenus },
    { label: 'MOVE LIST', go: () => openMenu('moves') },
    { label: 'COMBO LIST', go: () => openMenu('combos') },
    { label: 'CONTROLS', go: () => openMenu('controls') },
    { label: 'OPTIONS', go: () => openMenu('options') },
    ...(game.training ? [{ label: 'TRAINING SETTINGS', go: () => openMenu('training') }] : []),
    { label: 'QUIT TO CHARACTER SELECT', go: quitToSelect },
  ] }),
  mode: () => ({ title: sideOfPick().toUpperCase(), items: [
    { label: 'STORY MODE', go: () => { reset(sideOfPick()); Audio8.music.play('bg'); intro(); } },
    { label: 'TRAINING  (PRACTISE COMBOS)', go: () => startTraining(sideOfPick()) },
    { label: 'VERSUS  (2 PLAYERS)', go: () => openMenu('versus') },
    { label: 'ONLINE  (PLAY A FRIEND)', go: () => Net.open(sideOfPick()) },
    { label: 'MOVE LIST', go: () => openMenu('moves') },
    { label: 'COMBO LIST', go: () => openMenu('combos') },
    { label: 'OPTIONS', go: () => openMenu('options') },
    { label: 'BACK', go: closeMenu },
  ] }),
  // left / right change a setting; it's saved for next time
  options: () => ({ title: 'OPTIONS', items: [
    { label: 'DIFFICULTY  ' + diff().label, go: () => cycleDifficulty(1), adjust: cycleDifficulty },
    { label: 'MUSIC VOLUME  ' + bars(Audio8.vol.music), adjust: d => Audio8.setVolume('music', Audio8.vol.music + d) },
    { label: 'SOUND FX VOLUME  ' + bars(Audio8.vol.sfx), adjust: d => Audio8.setVolume('sfx', Audio8.vol.sfx + d) },
    { label: 'MUSIC  ' + (Audio8.music.muted ? 'OFF' : 'ON'), go: () => Audio8.music.toggleMute(), adjust: () => Audio8.music.toggleMute() },
    { label: 'CALM MODE  ' + (settings.calm ? 'ON' : 'OFF'), go: toggleCalm, adjust: toggleCalm },
    { label: 'FPS COUNTER  ' + (settings.fps ? 'ON' : 'OFF'), go: toggleFps, adjust: toggleFps },
    { label: 'ARENA  ' + Stage.arena.toUpperCase(), go: () => cycleArena(1), adjust: cycleArena },
    { label: 'BACK', go: closeMenu },
  ] }),
  // left / right (or Enter) change each one
  training: () => ({ title: 'TRAINING SETTINGS', items: [
    { label: 'DUMMY  ' + DUMMY_LABEL[TRAIN.dummy], go: () => cycleTrain('dummy', DUMMY_MODES), adjust: d => cycleTrain('dummy', DUMMY_MODES, d) },
    { label: 'DUMMY HEALTH REFILL  ' + onOff(TRAIN.dummyHp), go: () => toggleTrain('dummyHp'), adjust: () => toggleTrain('dummyHp') },
    { label: 'YOUR HEALTH REFILL  ' + onOff(TRAIN.hp), go: () => toggleTrain('hp'), adjust: () => toggleTrain('hp') },
    { label: 'YOUR KI  ' + KI_LABEL[TRAIN.ki], go: () => cycleTrain('ki', KI_MODES), adjust: d => cycleTrain('ki', KI_MODES, d) },
    { label: 'BACK', go: closeMenu },
  ] }),
  moves: () => ({ title: guideWho().toUpperCase() + '  MOVE LIST', page: 'moves', items: [{ label: 'BACK', go: closeMenu }] }),
  combos: () => ({ title: guideWho().toUpperCase() + '  COMBOS', page: 'combos', items: [{ label: 'BACK', go: closeMenu }] }),
  controls: () => ({ title: 'CONTROLS', page: 'controls', items: [{ label: 'BACK', go: closeMenu }] }),
  versus: () => ({ title: 'VERSUS', page: 'versus', items: [{ label: 'START', go: () => { game.menu = []; startVersus(sideOfPick()); } }, { label: 'BACK', go: closeMenu }] }),
};

function cycleArena(d) {
  const all = Stage.arenas;
  Stage.setArena(all[(all.indexOf(Stage.arena) + (d > 0 ? 1 : all.length - 1)) % all.length]);
}

function menuInput() {
  const top = game.menu[game.menu.length - 1], m = MENUS[top.id]();
  // the pause button (Start / Options on a gamepad, which also confirms) always closes the menu first
  if (tap('pause') || (tap('back') && !tap('confirm'))) { sfx.blip(); closeMenu(); return; }
  if (tap('up')) { top.i = (top.i + m.items.length - 1) % m.items.length; sfx.blip(); }
  if (tap('down')) { top.i = (top.i + 1) % m.items.length; sfx.blip(); }
  const it = m.items[top.i];
  if (it.adjust && (tap('left') || tap('right'))) it.adjust(tap('right') ? 1 : -1);
  else if ((tap('confirm') || tap('punch')) && it.go) { sfx.blip(); it.go(); }
}

function drawMenu() {
  if (!game.menu.length) return;
  const top = game.menu[game.menu.length - 1], m = MENUS[top.id](), who = guideWho();
  gfx.setTransform(S, 0, 0, S, 0, 0);
  gfx.fillStyle = m.page ? 'rgba(6,5,16,0.96)' : 'rgba(6,5,16,0.86)'; gfx.fillRect(0, 0, W, H);
  text(m.title, W / 2, 6, 15, '#ffe04a', 'center');
  let y = 28;
  if (m.page === 'moves') {
    const step = Math.min(7, 128 / MOVES[who].length);
    for (const [input, what] of MOVES[who]) { small(input, 14, y, '#ffd23a', 'left', 5); small(what, 118, y, '#fff', 'left', 5); y += step; }
  } else if (m.page === 'combos') {
    const step = Math.min(9, 124 / COMBOS[who].length);
    for (const c of COMBOS[who]) {
      const got = game.learned.has(c.name);
      small(got ? '[X]' : '[ ]', 12, y, got ? '#8f8' : '#888', 'left', 5);
      small(c.name, 32, y, got ? '#8f8' : '#ffd23a', 'left', 5); small(c.how, 140, y, '#ddd', 'left', 5); y += step;
    }
    small('LAND A COMBO IN A FIGHT OR IN TRAINING TO TICK IT OFF  (+8 KI EACH TIME)', W / 2, y + 2, '#9ff');
  } else if (m.page === 'versus') {
    small('P1 PLAYS ' + sideOfPick().toUpperCase() + ', P2 THE OTHER ONE.  NO BOSS, SAME HEALTH', W / 2, y - 6, '#ddd'); y += 6;
    small('ACTION', 14, y, '#9ff', 'left'); small('PLAYER 1', 130, y, '#9ff', 'left'); small('PLAYER 2', 230, y, '#9ff', 'left'); y += 10;
    for (const [a, k, p] of VERSUS_ROWS) { small(a, 14, y, '#ffd23a', 'left'); small(k, 130, y, '#fff', 'left'); small(p, 230, y, '#fff', 'left'); y += 9; }
    small('ONE GAMEPAD PLAYS AS P2.  WITH TWO, ONE EACH', W / 2, y + 2, '#9ff');
  } else if (m.page === 'controls') {
    small('ACTION', 14, y, '#9ff', 'left'); small('KEYBOARD', 120, y, '#9ff', 'left'); small('GAMEPAD', 230, y, '#9ff', 'left'); y += 10;
    for (const [a, k, p] of CONTROL_ROWS) { small(a, 14, y, '#ffd23a', 'left'); small(k, 120, y, '#fff', 'left'); small(padLabel(p), 230, y, '#fff', 'left'); y += 9; }
  }
  // items (focused one highlighted); info pages show just BACK at the bottom
  const iy = m.page === 'versus' ? H - 34 : m.page ? H - 18 : 44;
  m.items.forEach((it, k) => {
    const on = k === top.i;
    text((on ? '> ' : '') + it.label, W / 2, iy + k * 15, on ? 12 : 10, on ? '#ffe04a' : '#ccc', 'center');
  });
  small(m.items.some(i => i.adjust) ? 'W / S  MOVE     A / D  CHANGE     ESC  BACK' : 'W / S  MOVE     ENTER  SELECT     ESC  BACK', W / 2, H - 6, '#888');
}

// Training: the dummy can't be KO'd, health refills after each combo and ki tops itself up.
function trainingRefill(dt) {
  if (TRAIN.dummyHp && !game.combo.n && boss.free) boss.hp = Math.min(boss.maxHp, boss.hp + 120 * dt);
  if (TRAIN.hp && player.free) player.hp = Math.min(player.maxHp, player.hp + 40 * dt);
  if (TRAIN.ki === 'refill') player.ki = Math.min(100, player.ki + 20 * dt);
  else if (TRAIN.ki === 'full') player.ki = 100;
}

// Training checklist: every named combo, ticked once you've landed it; the next one to try is lit.
function drawChecklist() {
  const list = COMBOS[player.who], next = list.find(c => !game.learned.has(c.name));
  gfx.fillStyle = 'rgba(6,5,16,0.55)'; gfx.fillRect(W - 98, 30, 94, 11 + list.length * 6 + (next ? 9 : 0));
  small('COMBO CHECKLIST', W - 51, 32, '#9ff', 'center', 4);
  list.forEach((c, k) => {
    const got = game.learned.has(c.name);
    small((got ? 'X ' : '- ') + c.name, W - 95, 39 + k * 6, got ? '#8f8' : c === next ? '#ffe04a' : '#aaa', 'left', 4);
  });
  if (next) small('TRY: ' + next.how, W - 95, 41 + list.length * 6, '#ffe04a', 'left', 4);
  small('DUMMY: ' + DUMMY_LABEL[TRAIN.dummy] + '    P: TRAINING SETTINGS', 4, H - 7, '#9ff', 'left', 4);
}
