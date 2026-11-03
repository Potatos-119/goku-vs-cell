// Which sheet frames make up each move. Frame ids are "row.index" from the sliced sheets
// (open tools/frames.html?sheet=goku to see them numbered).
// hit: { at: frame index that lands, dmg, reach, ki, heavy (knockdown) }
// emit: height above the floor where a projectile/beam leaves the hand.

const GOKU_BASE = {
  idle: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 8, loop: true },
  // the sheet has no walk cycle: lean in to move forward, guard-step to back off
  walk: { fr: ['1.0'], fps: 1, loop: true },
  back: { fr: ['0.1'], fps: 1, loop: true },
  dash: { fr: ['1.2'], fps: 1, loop: true },
  jump: { fr: ['2.1', '2.2', '2.3'], fps: 9, loop: false },
  fall: { fr: ['2.4'], fps: 1, loop: true },
  land: { fr: ['2.5'], fps: 12, loop: false },
  block: { fr: ['2.7'], fps: 1, loop: true },
  p1: { fr: ['4.0', '4.1', '4.0'], fps: 16, hit: { at: 1, dmg: 4, reach: 30 } },
  p2: { fr: ['4.3', '4.4', '4.3'], fps: 16, hit: { at: 1, dmg: 5, reach: 32 } },
  p3: { fr: ['4.5', '4.6', '4.6', '4.7'], fps: 15, hit: { at: 1, dmg: 7, reach: 38 } },
  p4: { fr: ['4.8', '4.9', '4.9', '4.10'], fps: 12, hit: { at: 1, dmg: 10, reach: 32, heavy: true } },
  k1: { fr: ['5.4', '5.5', '5.6', '5.6', '5.4'], fps: 16, hit: { at: 2, dmg: 7, reach: 40 } },
  k2: { fr: ['5.0', '5.1', '5.2'], fps: 14, hit: { at: 1, dmg: 8, reach: 34 } },
  k3: { fr: ['5.7', '5.7', '5.8'], fps: 11, hit: { at: 0, dmg: 11, reach: 40, heavy: true } },
  rush: { fr: ['1.2', '1.2', '4.2', '4.2', '4.3'], fps: 12, hit: { at: 2, dmg: 7, reach: 38 } },
  slash: { fr: ['3.5', '3.6', '3.6', '3.7'], fps: 11, hit: { at: 1, dmg: 10, reach: 46, heavy: true } },
  air: { fr: ['5.3'], fps: 6, hit: { at: 0, dmg: 8, reach: 42 } },
  kiCast: { fr: ['9.0', '9.2', { id: '9.3', w: 31 }, '9.4'], fps: 13, emitAt: 2, emit: 33 },
  charge: { fr: ['10.3', '10.4'], fps: 12, loop: true },
  hurt: { fr: ['8.0'], fps: 1, loop: true },
  knock: { fr: ['8.1', '8.2', '8.3', '8.4'], fps: 10, loop: false },
  down: { fr: ['8.5'], fps: 1, loop: true },
  teleIn: { fr: ['1.10', '1.9'], fps: 9, loop: false },
  teleOut: { fr: ['1.9', '1.10'], fps: 12, loop: false },
  transform: { fr: ['10.1', '10.2', '10.3', '10.4', '10.3', '10.4', '10.5', '10.6', '10.7', '10.8', '10.8'], fps: 7, loop: false },
  win: { fr: ['0.10'], fps: 1, loop: true },
};

// Super Saiyan: the sheet only has idle/kamehameha frames, so every other move reuses
// the base frames with the hair recoloured gold.
const GOKU_SSJ = Object.fromEntries(Object.entries(GOKU_BASE).map(([k, a]) => [k, {
  ...a, fr: a.fr.map(r => ({ ...(typeof r === 'string' ? { id: r } : r), ssj: true })),
}]));
Object.assign(GOKU_SSJ, {
  idle: { fr: ['11.0', '11.1', '11.2', '11.1'], fps: 6, loop: true },
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
  walk: { fr: ['13.11'], fps: 1, loop: true },
  back: { fr: ['13.0', '13.1'], fps: 5, loop: true },
  dash: { fr: ['13.11'], fps: 1, loop: true },
  jump: { fr: ['13.11'], fps: 1, loop: true },
  fall: { fr: ['13.11'], fps: 1, loop: true },
  land: { fr: ['13.0'], fps: 12, loop: false },
  block: { fr: ['14.2'], fps: 1, loop: true },
  p1: { fr: ['13.1', '13.2', '13.2', '13.1'], fps: 13, hit: { at: 1, dmg: 6, reach: 32 } },
  p2: { fr: ['13.3', '13.4', '13.4'], fps: 12, hit: { at: 1, dmg: 7, reach: 34 } },
  k1: { fr: ['13.5', '13.6', '13.6', '13.5'], fps: 12, hit: { at: 1, dmg: 8, reach: 40 } },
  k2: { fr: ['13.7', '13.8', '13.8', '13.9'], fps: 10, hit: { at: 1, dmg: 11, reach: 40, heavy: true } },
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
