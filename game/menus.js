// ---------- menus ----------
// Screens are a stack: the pause menu opens over the fight, the move list opens over the pause
// menu, and Back pops one level. Every screen opens with an item focused, and works the same on
// keyboard (W/S or arrows, Enter, Esc) and gamepad (d-pad, A, B).
// the move and combo lists show this many rows a page
const LIST_ROWS = 11;
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
// the fighter player 1 takes on the versus screen (player 2 gets the other one)
let vsSide = null;
const swapVsSides = () => { vsSide = (vsSide || sideOfPick()) === 'goku' ? 'cell' : 'goku'; };
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
    { label: game.versus ? 'QUIT MATCH' : 'QUIT TO CHARACTER SELECT', go: quitToSelect },
  ] }),
  mode: () => ({ title: sideOfPick().toUpperCase(), items: [
    { label: 'STORY MODE', go: () => { reset(sideOfPick()); Audio8.music.play('bg'); intro(); } },
    { label: 'TRAINING  (PRACTISE COMBOS)', go: () => startTraining(sideOfPick()) },
    { label: 'VERSUS  (2 PLAYERS)', go: () => { vsSide = sideOfPick(); openMenu('versus'); } },
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
    { label: 'KEYS & BUTTONS', go: () => openMenu('binds') },
    { label: 'BACK', go: closeMenu },
  ] }),
  // change which key or button does what (saved for next time)
  binds: () => ({ title: 'KEYS & BUTTONS', items: [
    { label: 'PLAYER 1 KEYBOARD', go: () => { game.bindWho = 'p1'; openMenu('bindList'); } },
    { label: 'PLAYER 2 KEYBOARD  (VERSUS)', go: () => { game.bindWho = 'p2'; openMenu('bindList'); } },
    { label: 'GAMEPAD BUTTONS', go: () => { game.bindWho = 'pad'; openMenu('bindList'); } },
    { label: 'RESET ALL TO DEFAULT', go: () => { resetBindings(); showToast('KEYS AND BUTTONS RESET'); } },
    { label: 'BACK', go: closeMenu },
  ] }),
  // every action and its key: pick one, then press the new key or button
  bindList: () => {
    const who = game.bindWho || 'p1';
    const name = a => binding && binding.who === who && binding.action === a ? (who === 'pad' ? 'PRESS A BUTTON...' : 'PRESS A KEY...')
      : who === 'pad' ? padActionName(a) : keysOf(TABLES[who], [a]);
    return { title: { p1: 'PLAYER 1 KEYS', p2: 'PLAYER 2 KEYS', pad: 'GAMEPAD BUTTONS' }[who], compact: true, items: [
      ...rebindable(who).map(a => ({ label: ACTION_NAMES[a] + '  ' + name(a), go: () => startBinding(who, a) })),
      { label: 'BACK', go: closeMenu },
    ] };
  },
  // left / right (or Enter) change each one
  training: () => ({ title: 'TRAINING SETTINGS', items: [
    { label: 'DUMMY  ' + DUMMY_LABEL[TRAIN.dummy], go: () => cycleTrain('dummy', DUMMY_MODES), adjust: d => cycleTrain('dummy', DUMMY_MODES, d) },
    { label: 'DUMMY HEALTH REFILL  ' + onOff(TRAIN.dummyHp), go: () => toggleTrain('dummyHp'), adjust: () => toggleTrain('dummyHp') },
    { label: 'YOUR HEALTH REFILL  ' + onOff(TRAIN.hp), go: () => toggleTrain('hp'), adjust: () => toggleTrain('hp') },
    { label: 'YOUR KI  ' + KI_LABEL[TRAIN.ki], go: () => cycleTrain('ki', KI_MODES), adjust: d => cycleTrain('ki', KI_MODES, d) },
    { label: 'BACK', go: closeMenu },
  ] }),
  moves: () => ({ title: guideWho().toUpperCase() + '  MOVE LIST', page: 'moves', pages: Math.ceil(MOVES[guideWho()].length / LIST_ROWS), items: [{ label: 'BACK', go: closeMenu }] }),
  combos: () => ({ title: guideWho().toUpperCase() + '  COMBOS', page: 'combos', pages: Math.ceil(COMBOS[guideWho()].length / LIST_ROWS), items: [{ label: 'BACK', go: closeMenu }] }),
  controls: () => ({ title: 'CONTROLS', page: 'controls', items: [{ label: 'BACK', go: closeMenu }] }),
  // the versus setup: who plays which fighter, and which player each gamepad is (left / right changes)
  versus: () => {
    const p1 = vsSide || sideOfPick(), p2 = p1 === 'goku' ? 'cell' : 'goku', pads = connectedPads();
    return { title: 'VERSUS', items: [
      { label: 'PLAYER 1   ' + p1.toUpperCase(), go: swapVsSides, adjust: swapVsSides },
      { label: 'PLAYER 2   ' + p2.toUpperCase(), go: swapVsSides, adjust: swapVsSides },
      ...pads.slice(0, 2).map((pad, i) => {
        const flip = () => { padOwners[i] = padOwner(i, pads.length) === P1 ? P2 : P1; };
        return { label: 'GAMEPAD ' + (i + 1) + (padKind(pad) === 'ps' ? ' (PLAYSTATION)' : ' (XBOX)') + '   ' + (padOwner(i, pads.length) === P1 ? 'PLAYER 1' : 'PLAYER 2'), go: flip, adjust: flip };
      }),
      { label: 'KEYS FOR EACH PLAYER', go: () => openMenu('versusKeys') },
      { label: 'START', go: () => { game.menu = []; startVersus(p1); } },
      { label: 'BACK', go: closeMenu },
    ] };
  },
  versusKeys: () => ({ title: 'VERSUS KEYS', page: 'versus', items: [{ label: 'BACK', go: closeMenu }] }),
};

function cycleArena(d) {
  const all = Stage.arenas;
  Stage.setArena(all[(all.indexOf(Stage.arena) + (d > 0 ? 1 : all.length - 1)) % all.length]);
}

// in local versus either player can work the menus (online, the host does)
const tapM = a => tap(a) || (game.versus && !(window.Net && Net.role) && P2.pressed.has(a));
function menuInput() {
  if (binding) return; // KEYS & BUTTONS is waiting for a key or button
  const top = game.menu[game.menu.length - 1], m = MENUS[top.id]();
  // the pause button (Start / Options on a gamepad, which also confirms) always closes the menu first
  if (tapM('pause') || (tapM('back') && !tapM('confirm'))) { sfx.blip(); closeMenu(); return; }
  if (tapM('up')) { top.i = (top.i + m.items.length - 1) % m.items.length; sfx.blip(); }
  if (tapM('down')) { top.i = (top.i + 1) % m.items.length; sfx.blip(); }
  const it = m.items[top.i];
  if (it.adjust && (tapM('left') || tapM('right'))) it.adjust(tapM('right') ? 1 : -1);
  else if (m.pages > 1 && (tapM('left') || tapM('right'))) { top.page = ((top.page || 0) + (tapM('right') ? 1 : -1) + m.pages) % m.pages; sfx.blip(); }
  else if ((tapM('confirm') || tapM('punch')) && it.go) { sfx.blip(); it.go(); }
}

function drawMenu() {
  if (!game.menu.length) return;
  const top = game.menu[game.menu.length - 1], m = MENUS[top.id](), who = guideWho();
  gfx.setTransform(S, 0, 0, S, 0, 0);
  gfx.fillStyle = m.page || m.compact ? 'rgba(6,5,16,0.96)' : 'rgba(6,5,16,0.86)'; gfx.fillRect(0, 0, W, H);
  text(m.title, W / 2, 6, 15, '#ffe04a', 'center');
  let y = 28;
  if (m.page === 'moves' || m.page === 'combos') {
    // a page of LIST_ROWS rows (left / right turns the page); each column in one size
    const page = Math.min(top.page || 0, m.pages - 1), first = page * LIST_ROWS, rowY = k => 30 + k * 11;
    if (m.page === 'moves') {
      const rows = MOVES[who].slice(first, first + LIST_ROWS).map(([i, w]) => [promptKeys(i), promptKeys(w)]);
      const s1 = columnSize(rows.map(r => r[0]), 102), s2 = columnSize(rows.map(r => r[1]), W - 124);
      rows.forEach(([i, w], k) => { small(i, 8, rowY(k), '#ffd23a', 'left', s1); small(w, 116, rowY(k), '#fff', 'left', s2); });
    } else {
      const rows = COMBOS[who].slice(first, first + LIST_ROWS), hows = rows.map(c => promptKeys(c.how));
      const s1 = columnSize(rows.map(c => c.name), 100), s2 = columnSize(hows, W - 146);
      rows.forEach((c, k) => {
        const got = game.learned.has(c.name);
        small(got ? '[X]' : '[ ]', 10, rowY(k), got ? '#8f8' : '#888', 'left', 5);
        small(c.name, 30, rowY(k), got ? '#8f8' : '#ffd23a', 'left', s1); small(hows[k], 140, rowY(k), '#ddd', 'left', s2);
      });
    }
    const note = m.page === 'combos' ? 'LAND ONE TO TICK IT OFF (+5 KI)' : '';
    fitSmall((m.pages > 1 ? 'PAGE ' + (page + 1) + ' / ' + m.pages + '   ' + promptKeys('A / D') + '  TURNS THE PAGE' + (note ? '     ' : '') : '') + note, W / 2, rowY(LIST_ROWS) + 1, W - 12, '#9ff', 'center');
  } else if (m.page === 'versus') {
    fitSmall('NO BOSS, SAME HEALTH.  CHANGE ANY KEY IN OPTIONS > KEYS & BUTTONS', W / 2, y - 6, W - 12, '#ddd', 'center'); y += 6;
    small('ACTION', 14, y, '#9ff', 'left'); small('PLAYER 1', 130, y, '#9ff', 'left'); small('PLAYER 2', 230, y, '#9ff', 'left'); y += 10;
    for (const [a, k, p] of versusRows()) { fitSmall(a, 14, y, 112, '#ffd23a'); fitSmall(k, 130, y, 96, '#fff'); fitSmall(p, 230, y, W - 234, '#fff'); y += 9; }
    small('ONE GAMEPAD PLAYS AS P2.  WITH TWO, ONE EACH', W / 2, y + 2, '#9ff');
  } else if (m.page === 'controls') {
    small('ACTION', 14, y, '#9ff', 'left'); small('KEYBOARD', 120, y, '#9ff', 'left'); small('GAMEPAD', 230, y, '#9ff', 'left'); y += 10;
    for (const [a, k, p] of controlRows()) { fitSmall(a, 14, y, 102, '#ffd23a'); fitSmall(k, 120, y, 106, '#fff'); fitSmall(p, 230, y, W - 234, '#fff'); y += 9; }
  }
  // items (focused one highlighted); info pages show just BACK at the bottom
  const iy = m.page ? H - 18 : 44, gap = Math.min(15, 112 / Math.max(1, m.items.length - 1));
  if (m.compact) {
    // a long list (KEYS & BUTTONS): small rows, the one being changed in yellow
    m.items.forEach((it, k) => { const on = k === top.i; small((on ? '> ' : '') + it.label, W / 2, 26 + k * 7.4, on ? '#ffe04a' : '#ccc', 'center', 5); });
    small(binding ? (binding.who === 'pad' ? 'PRESS THE NEW BUTTON     ESC CANCELS' : 'PRESS THE NEW KEY     ESC CANCELS') : promptKeys('W / S  MOVE     ENTER  CHANGE     ESC  BACK'), W / 2, H - 6, binding ? '#ffe04a' : '#888');
    return;
  }
  m.items.forEach((it, k) => {
    const on = k === top.i;
    text((on ? '> ' : '') + it.label, W / 2, iy + k * gap, on ? 12 : 10, on ? '#ffe04a' : '#ccc', 'center');
  });
  small(promptKeys(m.items.some(i => i.adjust) ? 'W / S  MOVE     A / D  CHANGE     ESC  BACK' : 'W / S  MOVE     ENTER  SELECT     ESC  BACK'), W / 2, H - 6, '#888');
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
  if (next) small('TRY: ' + promptKeys(next.how), W - 95, 41 + list.length * 6, '#ffe04a', 'left', 4);
  small('DUMMY: ' + DUMMY_LABEL[TRAIN.dummy] + '    P: TRAINING SETTINGS', 4, H - 7, '#9ff', 'left', 4);
}
