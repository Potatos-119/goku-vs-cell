// Which sheet frames make up each move. Frame ids are "row.index" from the sliced sheets
// (open tools/frames.html?sheet=goku to see them numbered).
// hit: { at: frame index that lands, dmg, reach, ki, heavy (knockdown) }
// emit: height above the floor where a projectile/beam leaves the hand.

const GOKU_BASE = {
  idle: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 8, loop: true },
  // the sheet has no walk cycle, so fighters float in their stance (see hover in game.js)
  walk: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 11, loop: true },
  back: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 9, loop: true },
  // dashes (double-tap a direction): the sheet's own dash run, a back-flip hop, and flying in the air
  dash: { fr: ['1.0', '1.1', '1.2', '1.3'], fps: 16, loop: false },
  backdash: { fr: ['1.7'], fps: 1, loop: true },
  airDash: { fr: ['1.6'], fps: 1, loop: true },
  airBack: { fr: ['1.7'], fps: 1, loop: true },
  jump: { fr: ['2.1', '2.2', '2.3'], fps: 9, loop: false },
  fall: { fr: ['2.4'], fps: 1, loop: true },
  land: { fr: ['2.5'], fps: 12, loop: false },
  block: { fr: ['3.0'], fps: 1, loop: true },
  blockHit: { fr: ['3.1'], fps: 1, loop: true },
  p1: { fr: ['4.0', '4.1', '4.0'], fps: 16, hit: { at: 1, dmg: 4, reach: 30 } },
  p2: { fr: ['4.3', '4.4', '4.3'], fps: 16, hit: { at: 1, dmg: 5, reach: 32 } },
  p3: { fr: ['4.5', '4.6', '4.6', '4.7'], fps: 15, hit: { at: 1, dmg: 7, reach: 38 } },
  // launch: pops them straight up so you can jump after them; wallBounce: off the screen edge
  p4: { fr: ['4.8', '4.9', '4.9', '4.10'], fps: 12, hit: { at: 1, dmg: 10, reach: 32, heavy: true, launch: true } },
  k1: { fr: ['5.4', '5.5', '5.6', '5.6', '5.4'], fps: 16, hit: { at: 2, dmg: 7, reach: 40 } },
  k2: { fr: ['5.0', '5.1', '5.2'], fps: 14, hit: { at: 1, dmg: 8, reach: 34 } },
  k3: { fr: ['5.7', '5.7', '5.8'], fps: 11, hit: { at: 0, dmg: 11, reach: 40, heavy: true, launch: true } },
  rush: { fr: ['1.2', '1.2', '4.2', '4.2', '4.3'], fps: 12, hit: { at: 2, dmg: 7, reach: 38 } },
  // Dragon Rush: a lunging grab. Slow to come out, but it goes through a block and launches
  grab: { fr: ['1.2', '1.2', '4.2', '4.2', '4.3'], fps: 10, hit: { at: 2, dmg: 6, reach: 34, grab: true, launch: true } },
  slash: { fr: ['3.5', '3.6', '3.6', '3.7'], fps: 11, hit: { at: 1, dmg: 10, reach: 46, heavy: true, wallBounce: true } },
  // air string: J J J in the air, ending in a spike that slams them into the ring
  air: { fr: ['5.3', '5.3'], fps: 13, loop: false, hit: { at: 0, dmg: 8, reach: 42 } },
  air2: { fr: ['4.6', '4.6'], fps: 13, loop: false, hit: { at: 0, dmg: 7, reach: 42 } },
  spike: { fr: ['5.8', '5.8', '5.8'], fps: 9, loop: false, hit: { at: 0, dmg: 10, reach: 40, spike: true } },
  kiCast: { fr: ['9.0', '9.2', { id: '9.3', w: 31 }, '9.4'], fps: 13, emitAt: 2, emit: 33 },
  charge: { fr: ['10.3', '10.4'], fps: 12, loop: true },
  hurt: { fr: ['8.0'], fps: 1, loop: true },
  knock: { fr: ['8.1', '8.2', '8.3', '8.4'], fps: 10, loop: false },
  down: { fr: ['8.5'], fps: 1, loop: true },
  // Instant Transmission. The sheet draws two Gokus side by side in frame 1.9 (solid, then
  // flickering out), so each is cropped on its own; drawn together they showed a double.
  teleIn: { fr: ['1.10', { id: '1.9', x: 37 }, { id: '1.9', w: 31 }], fps: 12, loop: false },
  teleOut: { fr: [{ id: '1.9', w: 31 }, { id: '1.9', x: 37 }, '1.10'], fps: 14, loop: false },
  transform: { fr: ['10.1', '10.2', '10.3', '10.4', '10.3', '10.4', '10.5', '10.6', '10.7', '10.8', '10.8'], fps: 7, loop: false },
  // last second of the Super Saiyan cinematic, right before the music hits
  ssjRise: { fr: ['10.4', '10.5', '10.6', '10.7'], fps: 4, loop: false },
  win: { fr: ['0.10'], fps: 1, loop: true },
};

// Super Saiyan: the sheet only has idle/kamehameha frames, so every other move reuses
// the base frames with the hair recoloured gold.
const GOKU_SSJ = Object.fromEntries(Object.entries(GOKU_BASE).map(([k, a]) => [k, {
  ...a, fr: a.fr.map(r => ({ ...(typeof r === 'string' ? { id: r } : r), ssj: true })),
}]));
Object.assign(GOKU_SSJ, {
  idle: { fr: ['11.0', '11.1', '11.2', '11.1'], fps: 6, loop: true },
  // moving uses the sheet's real Super Saiyan stance too
  walk: { fr: ['11.0', '11.1', '11.2', '11.1'], fps: 9, loop: true },
  back: { fr: ['11.0', '11.1', '11.2', '11.1'], fps: 7, loop: true },
  charge: { fr: ['10.8'], fps: 1, loop: true },
  kameCharge: { fr: ['11.3', '11.2'], fps: 8, loop: true },
  kameFire: { fr: [{ id: '11.6', w: 31 }], fps: 1, loop: true, emit: 23 },
  win: { fr: ['10.9'], fps: 1, loop: true },
  // Dragon Fist: power up to Super Saiyan 3, rush in, dragon
  ult1: { fr: ['12.1', '12.2', '12.3', '12.4', '12.3', '12.4', '12.5'], fps: 7, loop: false },
  ult2: { fr: ['13.4'], fps: 1, loop: true },
  ult3: { fr: [{ id: '13.6', ax: 0.3 }], fps: 1, loop: true },
});

// Written with Perfect Cell's rows (12-16); each form sits in the same layout 6 rows higher up.
const CELL_TEMPLATE = {
  idle: { fr: ['12.0', '13.0', '13.1', '13.0'], fps: 4, loop: true },
  walk: { fr: ['12.0', '13.0', '13.1', '13.0'], fps: 6, loop: true },
  back: { fr: ['12.0', '13.0', '13.1', '13.0'], fps: 5, loop: true },
  dash: { fr: ['13.11'], fps: 1, loop: true },
  backdash: { fr: ['12.2'], fps: 1, loop: true },
  airDash: { fr: ['13.11'], fps: 1, loop: true },
  airBack: { fr: ['12.2'], fps: 1, loop: true },
  jump: { fr: ['13.11'], fps: 1, loop: true },
  fall: { fr: ['13.11'], fps: 1, loop: true },
  land: { fr: ['13.0'], fps: 12, loop: false },
  block: { fr: ['14.3'], fps: 1, loop: true },
  blockHit: { fr: ['14.2'], fps: 1, loop: true },
  p1: { fr: ['13.1', '13.2', '13.2', '13.1'], fps: 13, hit: { at: 1, dmg: 6, reach: 32 } },
  p2: { fr: ['13.3', '13.4', '13.4'], fps: 12, hit: { at: 1, dmg: 7, reach: 34 } },
  k1: { fr: ['13.5', '13.6', '13.6', '13.5'], fps: 12, hit: { at: 1, dmg: 8, reach: 40 } },
  k2: { fr: ['13.7', '13.8', '13.8', '13.9'], fps: 10, hit: { at: 1, dmg: 11, reach: 40, heavy: true, launch: true } },
  finger: { fr: ['13.10', { id: '15.0', w: 24 }, { id: '15.0', w: 24 }], fps: 8, emitAt: 1, emit: 29 },
  death: { fr: ['13.10', { id: '15.1', w: 31 }, { id: '15.1', w: 31 }], fps: 7, emitAt: 1, emit: 33 },
  kameCharge: { fr: ['15.2', '16.3'], fps: 6, loop: true },
  kameFire: { fr: [{ id: '16.4', w: 25 }], fps: 1, loop: true, emit: 19 },
  power: { fr: ['12.6', '12.7', '12.8'], fps: 12, loop: true },
  hurt: { fr: ['14.5'], fps: 1, loop: true },
  knock: { fr: ['14.4', '14.6'], fps: 8, loop: false },
  down: { fr: ['14.9'], fps: 1, loop: true },
  dizzy: { fr: ['14.7', '14.8'], fps: 4, loop: true },
  getup: { fr: ['14.10', '14.11'], fps: 6, loop: false },
  taunt: { fr: ['12.1'], fps: 1, loop: true },
  win: { fr: ['12.1'], fps: 1, loop: true },
  barrage: { fr: ['16.1', { id: '16.0', w: 24 }, '16.1', { id: '16.0', w: 24 }, '16.1', { id: '16.0', w: 24 }], fps: 10, emitAt: [1, 3, 5], emit: 29 },
  // used when you play as Cell
  air: { fr: ['13.8', '13.8'], fps: 13, loop: false, hit: { at: 0, dmg: 8, reach: 40 } },
  air2: { fr: ['13.4', '13.4'], fps: 13, loop: false, hit: { at: 0, dmg: 7, reach: 40 } },
  spike: { fr: ['13.6', '13.6', '13.6'], fps: 9, loop: false, hit: { at: 0, dmg: 10, reach: 40, spike: true } },
  rush: { fr: ['13.11', '13.11', '13.4', '13.4'], fps: 12, hit: { at: 2, dmg: 7, reach: 38 } },
  grab: { fr: ['13.11', '13.11', '13.4', '13.4', '13.4'], fps: 10, hit: { at: 2, dmg: 6, reach: 34, grab: true, launch: true } },
  slash: { fr: ['13.7', '13.8', '13.8', '13.9'], fps: 10, hit: { at: 1, dmg: 11, reach: 44, heavy: true, wallBounce: true } },
  charge: { fr: ['12.6', '12.7', '12.8'], fps: 12, loop: true },
};

const CELL_FORMS = ['imperfect', 'semi', 'perfect'];
const CELL_ROW = { imperfect: 0, semi: 6, perfect: 12 };
const CELL_INFO = {
  imperfect: { name: 'IMPERFECT CELL', speed: 0.9, dmgMul: 0.9, bar: '#7be05a' },
  semi: { name: 'SEMI-PERFECT CELL', speed: 1.05, dmgMul: 1.1, bar: '#3fc0a0' },
  perfect: { name: 'PERFECT CELL', speed: 1.25, dmgMul: 1.3, bar: '#c27aff' },
};
function cellForm(row) {
  const shift = id => { const [r, i] = id.split('.').map(Number); return `${r - 12 + row}.${i}`; };
  return Object.fromEntries(Object.entries(CELL_TEMPLATE).map(([k, a]) => [k, {
    ...a, fr: a.fr.map(r => typeof r === 'string' ? shift(r) : { ...r, id: shift(r.id) }),
  }]));
}

const ANIMS = {
  goku: { base: GOKU_BASE, ssj: GOKU_SSJ },
  cell: Object.fromEntries(CELL_FORMS.map(f => [f, cellForm(CELL_ROW[f])])),
};
ANIMS.cell.base = ANIMS.cell.perfect;

// Projectile and beam art cut out of the sheets.
const FX_ART = {
  kiBall: { sheet: 'goku', ref: { id: '9.3', x: 32 } },
  finger: { sheet: 'cell', ref: { id: '15.0', x: 24, seed: 'tb' } },
  death: { sheet: 'cell', ref: { id: '15.1', x: 31, seed: 'tb' } },
  teleport: { sheet: 'cell', ref: '12.5' },
  gokuTeleport: { sheet: 'goku', ref: '1.10' },
  // speed lines left behind by a dash
  gokuZip: { sheet: 'goku', ref: { id: '1.4', w: 52 } },
  cellZip: { sheet: 'cell', ref: '12.4' },
  streak: { sheet: 'cell', ref: '12.4' },
  gokuPortrait: { sheet: 'goku', ref: '10.0' },
  ssj3Portrait: { sheet: 'goku', ref: { id: '12.0', w: 41 } },
  gokuHead: { sheet: 'goku', ref: { id: '0.2', h: 22 } },
};
const BEAMS = {
  goku: {
    start: { sheet: 'goku', ref: { id: '11.6', x: 31, w: 140, seed: 'tb' } },
    body: { sheet: 'goku', ref: { id: '11.6', x: 250, w: 2, seed: 'tb' } },
    head: { sheet: 'cell', ref: { id: '16.4', x: 95, seed: 'tb' } },
    scale: 0.5,
  },
  cell: {
    start: { sheet: 'cell', ref: { id: '16.4', x: 26, w: 48, seed: 'tb' } },
    body: { sheet: 'cell', ref: { id: '16.4', x: 80, w: 2, seed: 'tb' } },
    head: { sheet: 'cell', ref: { id: '16.4', x: 95, seed: 'tb' } },
    scale: 1,
  },
};

// Named combos: recognised while you play (name pops up, +8 ki) and listed in the pause menu and
// training mode. steps must land in this order within one combo; 'melee' matches any punch or kick.
const COMBOS = {
  goku: [
    { name: 'RUSH COMBO', steps: ['p1', 'p2', 'p3', 'p4'], how: 'J J J J' },
    { name: 'DRAGON KICKS', steps: ['k1', 'k2', 'k3'], how: 'K K K' },
    { name: 'TURTLE STRING', steps: ['p1', 'k1', 'k2', 'k3'], how: 'J K K K' },
    { name: 'SKY CHASE', steps: ['launch', 'air'], how: 'J J J J (or K K K), then W, J' },
    { name: 'METEOR SMASH', steps: ['air', 'air2', 'spike'], how: 'in the air: J J J' },
    { name: 'KI CANCEL', steps: ['melee', 'kiBall'], how: 'land a hit, then L' },
    { name: 'KAMEHAMEHA CANCEL', steps: ['melee', 'beam'], how: 'land a hit, then U (SSJ)' },
    { name: 'VANISH STRIKE', steps: ['melee', 'vanish', 'melee'], how: 'land a hit, Q, then J' },
    { name: 'WALL SPLAT', steps: ['wall', 'melee'], how: 'toward + K near the edge, hit the rebound' },
    { name: 'AIR DASH EXTEND', steps: ['air2', 'air'], how: 'air J J, double-tap, J again' },
    { name: 'AERIAL KAMEHAMEHA', steps: ['air', 'beam'], how: 'air hit, then U (SSJ)' },
    { name: 'SAIYAN SKY BLAST', steps: ['launch', 'air', 'air2', 'beam'], how: 'launcher, W, J J, then U (SSJ)' },
    { name: 'DRAGON RUSH CHASE', steps: ['grab', 'air'], how: 'J+K (or F) through a block, W, J' },
    { name: 'COUNTER STRIKE', steps: ['counter', 'melee', 'melee'], how: 'hit them as they attack, keep going' },
  ],
  cell: [
    { name: 'NIGHTMARE STRING', steps: ['p1', 'p2', 'k2'], how: 'J J K' },
    { name: 'BIO KICKS', steps: ['k1', 'k2'], how: 'K K' },
    { name: 'SKY CHASE', steps: ['launch', 'air'], how: 'J J K, then W, J' },
    { name: 'METEOR SMASH', steps: ['air', 'air2', 'spike'], how: 'in the air: J J J' },
    { name: 'FINGER CANCEL', steps: ['melee', 'finger'], how: 'land a hit, then L' },
    { name: 'DEATH BEAM CANCEL', steps: ['melee', 'death'], how: 'land a hit, then U (Semi-Perfect)' },
    { name: 'KAMEHAMEHA CANCEL', steps: ['melee', 'beam'], how: 'land a hit, then U (Perfect)' },
    { name: 'VANISH STRIKE', steps: ['melee', 'vanish', 'melee'], how: 'land a hit, Q, then J' },
    { name: 'WALL SPLAT', steps: ['wall', 'melee'], how: 'toward + K near the edge, hit the rebound' },
    { name: 'AIR DASH EXTEND', steps: ['air2', 'air'], how: 'air J J, double-tap, J again' },
    { name: 'AERIAL DEATH BEAM', steps: ['air', 'death'], how: 'air hit, then U (Semi-Perfect)' },
    { name: 'AERIAL KAMEHAMEHA', steps: ['air', 'beam'], how: 'air hit, then U (Perfect)' },
    { name: 'PERFECT SKY BLAST', steps: ['launch', 'air', 'air2', 'beam'], how: 'launcher, W, J J, then U (Perfect)' },
    { name: 'DRAGON RUSH CHASE', steps: ['grab', 'air'], how: 'J+K (or F) through a block, W, J' },
    { name: 'COUNTER STRIKE', steps: ['counter', 'melee', 'melee'], how: 'hit them as they attack, keep going' },
  ],
};
const MELEE = ['p1', 'p2', 'p3', 'p4', 'k1', 'k2', 'k3', 'rush', 'grab', 'slash', 'air', 'air2', 'spike'];

// Move list shown in the pause menu and from the select screen: [input, what it does]
const MOVES = {
  goku: [
    ['J  /  K', 'Punch / kick, chain: J J J J or K K K'],
    ['TOWARD + J', 'Rush punch'],
    ['TOWARD + K', 'Heavy slash: bounces them off the wall'],
    ['J + K  /  F', 'Dragon Rush: grab through a block, launches'],
    ['J J J J  /  K K K', 'The last hit is a launcher'],
    ['W AFTER A LAUNCHER', 'Chase jump after them'],
    ['AIR: J J J', 'Air string, ends in a meteor spike'],
    ['AFTER A HIT', 'Cancel into L, U, Q or a dash'],
    ['AIR HIT + U', 'Kamehameha out of the air combo'],
    ['AIR HIT + DASH', 'Air dash, then J again for more hits'],
    ['L', 'Ki blast (8 ki)'],
    ['DOUBLE-TAP A / D', 'Dash, once in the air too'],
    ['Q', 'Vanish behind them (15 ki, air too)'],
    ['S', 'Block. Tap as a hit lands: PERFECT'],
    ['HOLD I', 'Charge ki'],
    ['T', 'Super Saiyan (full ki)'],
    ['U', 'Kamehameha (SSJ, 50 ki, air too)'],
    ['JUMP / AIR HIT + U', 'Instant Kamehameha (SSJ, full ki)'],
    ['O', 'Dragon Fist (SSJ, full ki)'],
  ],
  cell: [
    ['J  /  K', 'Punch / kick, chain: J J K or K K'],
    ['TOWARD + J', 'Rush punch'],
    ['TOWARD + K', 'Heavy slash: bounces them off the wall'],
    ['J + K  /  F', 'Dragon Rush: grab through a block, launches'],
    ['J J K  /  K K', 'The last hit is a launcher'],
    ['W AFTER A LAUNCHER', 'Chase jump after them'],
    ['AIR: J J J', 'Air string, ends in a meteor spike'],
    ['AFTER A HIT', 'Cancel into L, U, Q or a dash'],
    ['AIR HIT + U', 'Death Beam / Kamehameha out of the air combo'],
    ['AIR HIT + DASH', 'Air dash, then J again for more hits'],
    ['L', 'Finger beam (8 ki)'],
    ['TOWARD + L', 'Barrage (Semi-Perfect, 15 ki)'],
    ['DOUBLE-TAP A / D', 'Dash, once in the air too'],
    ['Q', 'Vanish behind them (15 ki, air too)'],
    ['S', 'Block. Tap as a hit lands: PERFECT'],
    ['HOLD I', 'Charge ki'],
    ['T', 'Evolve to the next form (full ki)'],
    ['U', 'Death Beam (Semi) / Kamehameha (Perfect)'],
    ['O  (AIR, AFTER A HIT TOO)', 'Solar Kamehameha finisher (Perfect, full ki)'],
  ],
};
const CONTROL_ROWS = [
  ['MOVE', 'A / D or arrows', 'Stick / d-pad'],
  ['JUMP', 'W / Space', 'A'],
  ['BLOCK', 'S', 'LB / down'],
  ['PUNCH / KICK', 'J / K', 'X / Y'],
  ['DRAGON RUSH', 'J + K / F', 'X + Y'],
  ['KI ATTACK', 'L', 'B'],
  ['BEAM / ULTIMATE', 'U / O', 'RT / R3'],
  ['CHARGE / TRANSFORM', 'I / T', 'LT / L3'],
  ['DASH / VANISH', 'Double-tap, Shift / Q', 'RB / Back'],
  ['PAUSE', 'P', 'Start'],
  ['MUSIC / CALM MODE', 'M / R', ''],
];
