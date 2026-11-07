// Which sheet frames make up each move. Frame ids are "row.index" from the sliced sheets
// (open tools/frames.html?sheet=goku to see them numbered).
// hit: { at: frame index that lands, dmg, reach, ki, heavy (knockdown) }
// emit: height above the floor where a projectile/beam leaves the hand.

// a frame cut by exact rectangle from the bigger Goku sheet (see goku2 in sheets.js)
const G2 = (x, y, w, h) => ({ sheet: 'goku2', rect: [x, y, w, h] });
// a frame from the second Super Saiyan sheet (goku-ssj2.png), drawn 1.25x to match his size
const SJ = (x, y, w, h) => ({ sheet: 'ssj2', rect: [x, y, w, h], k: 1.25 });
const GOKU_WIN = [G2(68, 2782, 37, 46), G2(113, 2777, 31, 51), G2(156, 2775, 31, 53), G2(156, 2775, 31, 53),
  G2(221, 2776, 37, 52), G2(275, 2779, 37, 47), G2(325, 2791, 35, 37)];

const GOKU_BASE = {
  idle: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 8, loop: true },
  // the sheet has no walk cycle, so fighters float in their stance (see hover in game.js)
  walk: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 11, loop: true },
  back: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 9, loop: true },
  // dashes (double-tap a direction): the sheet's own dash run, a back-flip hop, and flying in the air
  dash: { fr: ['1.0', '1.1', '1.2', '1.3'], fps: 16, loop: false },
  // skidding out of a ground dash: the streaks he arrives in, then the low ready crouch (cosmetic:
  // he can act straight away; see then in game.js)
  dashStop: { fr: ['0.0', '0.1'], fps: 14, loop: false, then: 'idle' },
  backdash: { fr: ['1.7'], fps: 1, loop: true },
  airDash: { fr: ['1.6'], fps: 1, loop: true },
  airBack: { fr: ['1.7'], fps: 1, loop: true },
  // crouch, spring up, tuck at the top of the jump
  jump: { fr: ['2.0', '2.1', '2.2', '2.3'], fps: 12, loop: false },
  fall: { fr: ['2.4'], fps: 1, loop: true },
  land: { fr: ['2.5'], fps: 12, loop: false },
  // guard: arms come up, then he holds them there
  block: { fr: ['3.0', '3.1'], fps: 10, loop: false },
  // a hit on the guard shoves him down into a deeper crouch, then he stays braced there
  blockHit: { fr: ['3.3', '3.1'], fps: 12, loop: false },
  // a heavy hit on the guard knocks him back off his feet a little, arms still crossed
  blockHeavy: { fr: ['3.2', '3.3', '3.1'], fps: 9, loop: false },
  // blocking in the air (hold S while airborne): the same crossed-arm hop
  airBlock: { fr: ['3.2'], fps: 1, loop: true },
  // turning to face the other way: a glimpse of the three-quarter turn (see turnT in game.js)
  turn: { fr: ['0.8'], fps: 1, loop: true },
  // back on his feet after a knockdown: crouch, then rise
  getup: { fr: ['2.7', '2.8'], fps: 8, loop: false },
  p1: { fr: ['4.0', '4.1', '4.0'], fps: 16, hit: { at: 1, dmg: 4, reach: 30 } },
  p2: { fr: ['4.3', '4.4', '4.3'], fps: 16, hit: { at: 1, dmg: 5, reach: 32 } },
  p3: { fr: ['4.5', '4.6', '4.6', '4.7'], fps: 15, hit: { at: 1, dmg: 7, reach: 38 } },
  // launch: pops them straight up so you can jump after them; wallBounce: off the screen edge
  p4: { fr: ['4.8', '4.9', '4.9', '4.10', '4.11'], fps: 13, hit: { at: 1, dmg: 10, reach: 32, heavy: true, launch: true } },
  k1: { fr: ['5.4', '5.5', '5.6', '5.6', '5.4'], fps: 16, hit: { at: 2, dmg: 7, reach: 40 } },
  k2: { fr: ['5.0', '5.1', '5.2'], fps: 14, hit: { at: 1, dmg: 8, reach: 34 } },
  k3: { fr: ['5.7', '5.7', '5.8'], fps: 11, hit: { at: 0, dmg: 11, reach: 40, heavy: true, launch: true } },
  rush: { fr: ['1.2', '1.2', '4.2', '4.2', '4.3'], fps: 12, hit: { at: 2, dmg: 7, reach: 38 } },
  // Dragon Rush: a lunging grab. Slow to come out, but it goes through a block and launches
  // the sheet's grab: step in, lunge, catch and toss (frame 6.4 holds the lunge and the catch side by side)
  grab: { fr: ['6.0', '6.1', { id: '6.4', w: 37 }, { id: '6.4', x: 45 }, { id: '6.4', x: 45 }, '6.3'], fps: 13, hit: { at: 3, dmg: 6, reach: 34, grab: true, launch: true } },
  // 3.6, 5.3 and 8.1 are two sprites the slicer merged into one box: x / w keep the right one
  slash: { fr: ['3.5', { id: '3.6', x: 41, plain: true }, { id: '3.6', x: 41, plain: true }, '3.7'], fps: 11, hit: { at: 1, dmg: 10, reach: 46, heavy: true, wallBounce: true } },
  // air string: J J J in the air, ending in a spike that slams them into the ring
  // air attacks get a wind-up frame now, so a flying kick reads as a kick (they hit a frame later, a
  // little faster)
  air: { fr: ['5.0', { id: '5.3', w: 43 }, { id: '5.3', w: 43 }], fps: 16, loop: false, hit: { at: 1, dmg: 8, reach: 42 } },
  air2: { fr: ['4.5', '4.6', '4.6'], fps: 16, loop: false, hit: { at: 1, dmg: 7, reach: 42 } },
  spike: { fr: ['5.0', { id: '5.3', x: 49, plain: true }, { id: '5.3', x: 49, plain: true }, { id: '5.3', x: 49, plain: true }], fps: 11, loop: false, hit: { at: 1, dmg: 10, reach: 40, spike: true } },
  // the sheet's whole ki blast: stance, both hands flaring, draw back, thrust (the ball it throws is
  // the projectile itself, cut from the same frame, so it carries on from exactly where it was drawn)
  kiCast: { fr: ['9.0', '9.1', '9.2', { id: '9.3', w: 31 }, '9.4'], fps: 18, emitAt: 3, emit: 33 },
  // holding L: both hands flaring with ki while the blast grows (let go to throw it)
  kiHold: { fr: ['9.1'], fps: 1, loop: true, breathe: true },
  // F in the air during a combo: a rising crescent kick that sends them back up (once per combo)
  airLaunch: { fr: ['5.0', '5.1', '5.2'], fps: 14, loop: false, hit: { at: 1, dmg: 7, reach: 40, launch: true, relaunch: true } },
  // ki barrage (toward + L): both hands charge, then left, right, left, right
  barrage: { fr: ['9.1', '9.2', { id: '9.3', w: 31 }, '9.4', { id: '9.5', w: 31 }, '9.2', { id: '9.3', w: 31 }, '9.4', { id: '9.5', w: 31 }], fps: 14, emitAt: [2, 4, 6, 8], emit: 33 },
  // powering up: the small aura at his feet first, then the two big flames looping (loopFrom skips
  // the opening frame on repeats); letting go plays the small aura again as it dies down
  charge: { fr: ['10.2', '10.3', '10.4'], fps: 11, loop: true, loopFrom: 1 },
  chargeEnd: { fr: ['10.2'], fps: 9, loop: false, then: 'idle' },
  hurt: { fr: ['8.0'], fps: 1, loop: true },
  knock: { fr: [{ id: '8.1', x: 49 }, '8.2', '8.3', '8.4'], fps: 10, loop: false },
  down: { fr: ['8.5'], fps: 1, loop: true },
  // Instant Transmission. The sheet draws two Gokus side by side in frame 1.9 (solid, then
  // flickering out), so each is cropped on its own; drawn together they showed a double.
  teleIn: { fr: ['1.10', { id: '1.9', x: 37 }, { id: '1.9', w: 31 }], fps: 12, loop: false },
  teleOut: { fr: [{ id: '1.9', w: 31 }, { id: '1.9', x: 37 }, '1.10'], fps: 14, loop: false },
  transform: { fr: ['10.1', '10.2', '10.3', '10.4', '10.3', '10.4', '10.5', '10.6', '10.7', '10.8', '10.8'], fps: 7, loop: false },
  // the Super Saiyan cinematic follows the sheet's row in order: standing, the small aura, the big
  // flames looping while the music builds (ssjBuild), the rise to the flash in its last second
  // (ssjRise), then the gold flare held (ssjFlare, below) and the Super Saiyan stance
  ssjBuild: { fr: ['10.1', '10.2', '10.3', '10.4'], fps: 8, loop: true, loopFrom: 2 },
  ssjRise: { fr: ['10.4', '10.5', '10.6', '10.7'], fps: 4, loop: false },
  // Spirit Bomb (base Goku's full-ki finisher), from the bigger sheet: stance, one hand up, both
  // arms raised while the bomb gathers above them, then the throw
  // the first frame is the red swirl of energy he gathers in his hands
  spirit: { fr: [G2(68, 2143, 36, 49), G2(118, 2139, 31, 53), G2(165, 2137, 31, 55), G2(226, 2132, 44, 60)], fps: 6, loop: false },
  // the throw, then hunched over, spent, as it flies
  spiritThrow: { fr: [G2(295, 2141, 36, 51), G2(353, 2145, 33, 47)], fps: 5, loop: false },
  // facing the camera (boss Goku's taunt, and between lines in the story scenes)
  taunt: { fr: ['0.10'], fps: 1, loop: true, breathe: true },
  // the fight is won: he walks it off, gives a thumbs up, and sits down to rest (in his undershirt,
  // which is fine here: the fight is over, so it never has to come back)
  win: { fr: GOKU_WIN, fps: 5, loop: false },
};

// Super Saiyan: the sheet only has idle/kamehameha frames, so every other move reuses
// the base frames with the hair recoloured gold.
const GOKU_SSJ = Object.fromEntries(Object.entries(GOKU_BASE).map(([k, a]) => [k, {
  ...a, fr: a.fr.map(r => ({ ...(typeof r === 'string' ? { id: r } : r), ssj: true })),
}]));
Object.assign(GOKU_SSJ, {
  // standing: the sheet's Super Saiyan pose, arms down, breathing
  idle: { fr: ['10.9'], fps: 1, loop: true, breathe: true },
  // moving: the second Super Saiyan sheet's own movement (goku-ssj2.png, drawn 1.25x): its fighting
  // stance shuffle for stepping either way (the upright frames next to it on the sheet are him turning
  // round on the spot, not a walk), its dash (leaning lower and lower into a lunge), and its jump
  // (crouch, spring, arms up at the top, falling, landing)
  walk: { fr: [SJ(94, 299, 25, 39), SJ(127, 299, 25, 39), SJ(161, 300, 23, 38), SJ(193, 299, 25, 39)], fps: 11, loop: true },
  back: { fr: [SJ(94, 299, 25, 39), SJ(127, 299, 25, 39), SJ(161, 300, 23, 38), SJ(193, 299, 25, 39)], fps: 9, loop: true },
  dash: { fr: [SJ(492, 299, 26, 39), SJ(525, 303, 28, 35), SJ(560, 308, 32, 29)], fps: 16, loop: false },
  dashStop: { fr: [SJ(753, 305, 24, 33)], fps: 10, loop: false, then: 'idle' },
  jump: { fr: [SJ(620, 305, 23, 33), SJ(652, 287, 23, 44), SJ(702, 271, 21, 42)], fps: 12, loop: false },
  fall: { fr: [SJ(730, 286, 21, 44)], fps: 1, loop: true },
  land: { fr: [SJ(753, 305, 24, 33)], fps: 12, loop: false },
  // powering up: the second Super Saiyan sheet's own charge (goku-ssj2.png), a small aura at his
  // feet, then six frames of the gold flame flickering round him (drawn 1.25x to match his size)
  charge: { fr: [SJ(12, 585, 42, 43), SJ(65, 577, 47, 50), SJ(125, 574, 47, 53), SJ(189, 574, 48, 53), SJ(247, 577, 46, 50), SJ(307, 574, 46, 53), SJ(371, 574, 48, 53)], fps: 12, loop: true, loopFrom: 1 },
  chargeEnd: { fr: [SJ(12, 585, 42, 43)], fps: 9, loop: false, then: 'idle' },
  // "Ka... me... ha... me...": the sheet's whole sequence, hands sweeping round to the hip, the
  // ball of light swirling between them, pulled back; "HA!": the thrust, then the beam. The charge
  // is timed so it always reaches the last frame as the beam fires (see startKame)
  kameCharge: { fr: ['11.0', '11.1', '11.2', '11.3', '11.4'], fps: 6, loop: false },
  kameFire: { fr: ['11.5', { id: '11.6', w: 31 }], fps: 14, loop: false, emitAt: 1, emit: 23 },
  // powering back down to base: the gold aura, the flash, black hair again (the transformation backwards)
  powerDown: { fr: ['10.8', '10.7', '10.6', '10.5', '10.1'], fps: 8, loop: false },
  // the moment he turns: the full gold flare, held and breathing, before he settles into his stance
  ssjFlare: { fr: ['10.8'], fps: 1, loop: true, breathe: true },
  // up in the air (before the bigger Spirit Bomb) he powers down in the bigger sheet's mid-air frames:
  // floating gold, the burst of light, the white outline, and then he's normal Goku again
  powerDownAir: { fr: [G2(578, 2128, 50, 64), G2(454, 2114, 74, 78), G2(406, 2135, 35, 57)], fps: 7, loop: false },

  // the same victory, hair gold
  win: { fr: GOKU_WIN.map(r => ({ ...r, ssj: true })), fps: 5, loop: false },
  // Dragon Fist: power up to Super Saiyan 3, rush in, dragon
  ult1: { fr: ['12.1', '12.2', '12.3', '12.4', '12.3', '12.7', '12.5'], fps: 7, loop: false },
  // the launch into the rush, then the rising fist as the dragon bursts out
  ult2: { fr: ['13.2', '13.4'], fps: 8, loop: false },
  ult3: { fr: ['13.5', { id: '13.6', ax: 0.3 }], fps: 10, loop: false },
});

// Written with Perfect Cell's rows (12-16); each form sits in the same layout 6 rows higher up.
// The stance is each form's own default pose (the first frame of its first row), breathing gently;
// moving glides on the lean-forward / lean-back poses next to it.
const CELL_TEMPLATE = {
  idle: { fr: ['12.0'], fps: 1, loop: true, breathe: true },
  walk: { fr: ['12.3'], fps: 1, loop: true },
  back: { fr: ['12.2'], fps: 1, loop: true },
  dash: { fr: ['13.11'], fps: 1, loop: true },
  backdash: { fr: ['12.2'], fps: 1, loop: true },
  airDash: { fr: ['13.11'], fps: 1, loop: true },
  airBack: { fr: ['12.2'], fps: 1, loop: true },
  jump: { fr: ['12.3'], fps: 1, loop: true },
  fall: { fr: ['13.11'], fps: 1, loop: true },
  land: { fr: ['12.0'], fps: 12, loop: false },
  block: { fr: ['14.3'], fps: 1, loop: true },
  blockHit: { fr: ['14.2'], fps: 1, loop: true },
  blockHeavy: { fr: ['14.2', '14.0'], fps: 8, loop: false },
  airBlock: { fr: ['14.0'], fps: 1, loop: true },
  p1: { fr: ['13.1', '13.2', '13.2', '13.1'], fps: 13, hit: { at: 1, dmg: 6, reach: 32 } },
  p2: { fr: ['13.3', '13.4', '13.4'], fps: 12, hit: { at: 1, dmg: 7, reach: 34 } },
  // the third J: a lunging strike (the lunge frame, 13.11) that knocks them away and ends the string, so
  // J can't be mashed forever. It's slow to recover, so a blocked one can be punished
  p3: { fr: ['13.2', '13.11', '13.11', '13.11', '13.11'], fps: 10, hit: { at: 1, dmg: 9, reach: 40, heavy: true } },
  k1: { fr: ['13.5', '13.6', '13.6', '13.5'], fps: 12, hit: { at: 1, dmg: 8, reach: 40 } },
  k2: { fr: ['13.7', '13.8', '13.8', '13.9'], fps: 10, hit: { at: 1, dmg: 11, reach: 40, heavy: true, launch: true } },
  finger: { fr: ['13.10', { id: '15.0', w: 24 }, { id: '15.0', w: 24 }], fps: 8, emitAt: 1, emit: 29 },
  death: { fr: ['13.10', { id: '15.1', w: 31 }, { id: '15.1', w: 31 }], fps: 7, emitAt: 1, emit: 33 },
  // holding L: finger pointed, the Death Beam gathering at its tip (let go to fire it)
  deathHold: { fr: [{ id: '15.1', w: 31 }], fps: 1, loop: true, breathe: true },
  airLaunch: { fr: ['13.7', '13.8', '13.8'], fps: 12, loop: false, hit: { at: 1, dmg: 8, reach: 40, launch: true, relaunch: true } },
  // Special Beam Cannon (he has Piccolo's cells): fingers up while it charges at the tip, then the
  // drilling beam. The sheet draws it in every form, next to the finger beam (frame x.2 of row 16).
  cannon: { fr: ['13.10', '13.10', '13.10', '13.10', { id: '16.2', w: 40 }, { id: '16.2', w: 40 }, { id: '16.2', w: 40 }], fps: 8, emitAt: 4, emit: 30 },
  kameCharge: { fr: ['15.2', '16.3'], fps: 6, loop: true },
  // "HA!": the sheet's first, smaller beam frame, then the full one (the beam itself is drawn
  // separately, so both are cut down to Cell)
  kameFire: { fr: [{ id: '15.3', w: 25 }, { id: '16.4', w: 25 }], fps: 10, loop: false, emit: 19 },
  power: { fr: ['12.6', '12.7', '12.8'], fps: 12, loop: true },
  // Barrier: the aura flares into a burst that throws the enemy off
  barrier: { fr: ['12.6', '12.7', '12.8'], fps: 16, loop: true },
  hurt: { fr: ['14.5'], fps: 1, loop: true },
  knock: { fr: ['14.4', '14.6'], fps: 8, loop: false },
  down: { fr: ['14.9'], fps: 1, loop: true },
  dizzy: { fr: ['14.7', '14.8'], fps: 4, loop: true },
  getup: { fr: ['14.10', '14.11'], fps: 6, loop: false },
  taunt: { fr: ['12.1'], fps: 1, loop: true },
  // the sheet's front-facing pose (x.1) is too rough up close, so he wins flaring his aura instead
  win: { fr: ['12.6', '12.7', '12.8'], fps: 10, loop: true },
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

// the forms Cell evolves through; the Cell Juniors (rows 17-21) are fought between Semi and Perfect
const CELL_FORMS = ['imperfect', 'semi', 'perfect'];
const CELL_ROW = { imperfect: 0, semi: 6, perfect: 12, junior: 17 };
const CELL_INFO = {
  imperfect: { name: 'IMPERFECT CELL', speed: 0.9, dmgMul: 0.9, bar: '#7be05a', face: 0 },
  semi: { name: 'SEMI-PERFECT CELL', speed: 1.05, dmgMul: 1.1, bar: '#3fc0a0', face: 1 },
  perfect: { name: 'PERFECT CELL', speed: 1.25, dmgMul: 1.3, bar: '#c27aff', face: 2 },
  junior: { name: 'CELL JR.', speed: 1.4, dmgMul: 0.75, bar: '#5aa8ff', face: 4, scale: 1 },
};
// The Juniors' rows follow Perfect Cell's except where their sheet has a frame fewer (row 13: no
// knee) or splits the dizzy stars and an extra beam piece off as frames of their own.
const JUNIOR_FIX = {
  13: i => i <= 4 ? i : i === 5 ? 4 : i - 1,
  14: i => i <= 7 ? i : { 8: 9, 9: 11, 10: 12, 11: 13 }[i],
  16: i => i <= 2 ? i : i + 1,
};
function cellForm(row, fix = {}) {
  const shift = id => { const [r, i] = id.split('.').map(Number); return `${r - 12 + row}.${fix[r] ? fix[r](i) : i}`; };
  return Object.fromEntries(Object.entries(CELL_TEMPLATE).map(([k, a]) => [k, {
    ...a, fr: a.fr.map(r => typeof r === 'string' ? shift(r) : { ...r, id: shift(r.id) }),
  }]));
}

const ANIMS = {
  goku: { base: GOKU_BASE, ssj: GOKU_SSJ },
  cell: Object.fromEntries(CELL_FORMS.map(f => [f, cellForm(CELL_ROW[f])])),
};
ANIMS.cell.junior = cellForm(CELL_ROW.junior, JUNIOR_FIX);
ANIMS.cell.base = ANIMS.cell.perfect;

// the Cell Junior that Perfect Cell calls in: flying in, dashing, and hit
const JR_FRAMES = { in: '17.0', dash: '18.10', hit: '18.7' };

// Projectile and beam art cut out of the sheets.
const FX_ART = {
  kiBall: { sheet: 'goku', ref: { id: '9.3', x: 41 } }, // from x 41: just the ball, not his fingers
  finger: { sheet: 'cell', ref: { id: '15.0', x: 34, seed: 'tb' } }, // past his hand: just the beam
  death: { sheet: 'cell', ref: { id: '15.1', x: 41, seed: 'tb' } },
  cannon: { sheet: 'cell', ref: { id: '16.2', x: 41, seed: 'tb' } },
  teleport: { sheet: 'cell', ref: '12.5' },
  gokuTeleport: { sheet: 'goku', ref: '1.10' },
  // speed lines left behind by a dash
  gokuZip: { sheet: 'goku', ref: { id: '1.4', w: 52 } },
  cellZip: { sheet: 'cell', ref: '12.4' },
  streak: { sheet: 'cell', ref: '12.4' },
  gokuPortrait: { sheet: 'goku', ref: '10.0' },
  ssj3Portrait: { sheet: 'goku', ref: { id: '12.0', w: 41 } },
  gokuHead: { sheet: 'gokuFace', ref: '0.0' },
  // the Spirit Bomb and the rings of its explosion
  spiritBall: { sheet: 'goku2', ref: G2(189, 2005, 123, 125) },
  spiritRing1: { sheet: 'goku2', ref: G2(630, 2129, 124, 109) },
  spiritRing2: { sheet: 'goku2', ref: G2(765, 2118, 122, 123) },
  // Cell's portraits, side by side in one strip: Imperfect, Semi, Perfect, Perfect enraged, Junior
  cellFace: k => ({ sheet: 'cellFaces', ref: { id: '0.0', x: 42 * k, w: 41 } }),
};
const BEAMS = {
  goku: {
    // (cropped past his hand, so no piece of it rides along at the start of the beam)
    start: { sheet: 'goku', ref: { id: '11.6', x: 40, w: 131, seed: 'tb' } },
    body: { sheet: 'goku', ref: { id: '11.6', x: 250, w: 2, seed: 'tb' } },
    // the ball only: the sheet's head starts with a stretch of thin edge lines whose white core the
    // background removal leaks into, which showed as a see-through gap behind a short beam's head
    head: { sheet: 'cell', ref: { id: '16.4', x: 124, seed: 'tb' } },
    scale: 0.5,
  },
  // Cell's Kamehameha uses the same beam art as Goku's (his own sheet draws it as a flat banded slab
  // that read as a blue box on screen), a little thicker to suit his size
  cell: {
    start: { sheet: 'goku', ref: { id: '11.6', x: 40, w: 131, seed: 'tb' } },
    body: { sheet: 'goku', ref: { id: '11.6', x: 250, w: 2, seed: 'tb' } },
    // the ball only: the sheet's head starts with a stretch of thin edge lines whose white core the
    // background removal leaks into, which showed as a see-through gap behind a short beam's head
    head: { sheet: 'cell', ref: { id: '16.4', x: 124, seed: 'tb' } },
    scale: 0.6,
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
    { name: 'KI BLAST RUSH', steps: ['kiBall', 'rush'], how: 'L hits, then J to rush in after it' },
    { name: 'AERIAL KI RELAY', steps: ['air', 'kiBall', 'air'], how: 'air hit, L, double-tap, J' },
    { name: 'SPIRIT BOMB FINISH', steps: ['melee', 'spirit'], how: 'land a hit, then O at full ki (base)' },
    { name: 'SKY SPIRIT BOMB', steps: ['launch', 'air', 'spirit'], how: 'launcher, W, J, then O at full ki (base)' },
    { name: 'DUNK SHOT', steps: ['spike', 'bounce', 'melee'], how: 'in the air S + J (the dunk), hit them off the bounce' },
    { name: 'RELAUNCH', steps: ['air', 'airLaunch', 'air'], how: 'air hit, F to send them up again, J' },
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
    { name: 'COUNTER STRIKE', steps: ['counter', 'melee', 'melee'], how: 'hit them as they attack, keep going' },
    { name: 'FINGER RUSH', steps: ['finger', 'rush'], how: 'L hits, then J to rush in after it' },
    { name: 'AERIAL FINGER RELAY', steps: ['air', 'finger', 'air'], how: 'air hit, L, double-tap, J' },
    { name: 'FAMILY REUNION', steps: ['melee', 'junior'], how: 'land a hit, then E (Perfect)' },
    { name: 'ABSORPTION', steps: ['grab', 'air'], how: 'J+K (or F) through a block, W, J' },
    { name: 'DUNK SHOT', steps: ['spike', 'bounce', 'melee'], how: 'in the air S + J (the dunk), hit them off the bounce' },
    { name: 'RELAUNCH', steps: ['air', 'airLaunch', 'air'], how: 'air hit, F to send them up again, J' },
  ],
};
const MELEE = ['p1', 'p2', 'p3', 'p4', 'k1', 'k2', 'k3', 'rush', 'grab', 'slash', 'air', 'air2', 'spike', 'airLaunch'];

// Move list shown in the pause menu and from the select screen: [input, what it does]
const MOVES = {
  goku: [
    ['J  /  K', 'Punch / kick, chain: J J J J or K K K'],
    ['J J J J  /  K K K', 'Ends in a launcher: W to chase them up'],
    ['TOWARD + J  /  K', 'Rush punch / heavy slash (wall bounce)'],
    ['J + K  /  F', 'Dragon Rush: grab through a block, launches'],
    ['AIR: J J J', 'Air string, ends in a meteor spike'],
    ['AFTER A HIT', 'Cancel into L, U, Q or a dash'],
    ['AIR HIT + U  /  DASH', 'Kamehameha, or air dash and J again'],
    ['L', 'Ki blast (8 ki, air too)'],
    ['HOLD L', 'Charge a bigger ki blast: up to 20 damage, knocks down at full (up to 20 ki)'],
    ['TOWARD + L', 'Ki barrage: four blasts, left-right (15 ki)'],
    ['AFTER L HITS', 'J rushes in, or cancel into a dash, Q, U, L'],
    ['DOUBLE-TAP A / D', 'Dash, once in the air too'],
    ['Q', 'Vanish to their other side (15 ki, air too)'],
    ['S', 'Block (in the air too). Tap as a hit lands: PERFECT'],
    ['S + J IN THE AIR', 'Dunk: slam them down, they bounce off the ring'],
    ['F IN THE AIR', 'Re-launch a juggled enemy (once per combo)'],
    ['HOLD I', 'Charge ki'],
    ['T', 'Super Saiyan (full ki)'],
    ['U', 'Kamehameha (SSJ, 50 ki, air too)'],
    ['Q THEN U  /  U THEN Q', 'Instant Kamehameha (SSJ, full ki)'],
    ['O', 'Spirit Bomb (base, full ki; also right after a hit) / Dragon Fist (SSJ, full ki)'],
    ['O IN THE AIR (SSJ)', 'Power down mid-air, then a bigger Spirit Bomb (full ki)'],
    ['S + O IN THE AIR (SSJ)', 'Spirit Bomb as a Super Saiyan (full ki)'],
    ['T  (AS SSJ)', 'Power down to base, keeping your ki'],
  ],
  cell: [
    ['J  /  K', 'Punch / kick, chain: J J J, J J K or K K'],
    ['J J J', 'Ends in a lunge that knocks them away'],
    ['J J K  /  K K', 'Ends in a launcher: W to chase them up'],
    ['TOWARD + J  /  K', 'Rush punch / heavy slash (wall bounce)'],
    ['J + K  /  F', 'Absorb: grab through a block, heals you'],
    ['AIR: J J J', 'Air string, ends in a meteor spike'],
    ['AFTER A HIT', 'Cancel into L, U, Q, E or a dash'],
    ['AIR HIT + U  /  DASH', 'Death Beam / Kamehameha, or dash and J'],
    ['L', 'Finger beam (8 ki, air too)'],
    ['HOLD L', 'Charge the Death Beam: up to 24 damage, knocks down (up to 20 ki)'],
    ['AFTER L HITS', 'J rushes in, or cancel into a dash, Q, U, L'],
    ['TOWARD + L', 'Barrage (Semi-Perfect, 15 ki)'],
    ['G', 'Barrier: burst them away, even mid-combo (30 ki)'],
    ['E', 'A Cell Junior flies in and attacks (Perfect, 35 ki)'],
    ['DOUBLE-TAP A / D', 'Dash, once in the air too'],
    ['Q', 'Vanish to their other side (15 ki, air too)'],
    ['S', 'Block (in the air too). Tap as a hit lands: PERFECT'],
    ['S + J IN THE AIR', 'Dunk: slam them down, they bounce off the ring'],
    ['F IN THE AIR', 'Re-launch a juggled enemy (once per combo)'],
    ['HOLD I', 'Charge ki and regenerate'],
    ['T', 'Evolve to the next form (full ki)'],
    ['U', 'Kamehameha (50 ki). TOWARD + U: Death Beam (20 ki), any form'],
    ['Y', 'Special Beam Cannon: pierces guards (35 ki)'],
    ['O  (AIR, AFTER A HIT TOO)', 'Solar Kamehameha finisher (Perfect, full ki)'],
  ],
};
// versus: who presses what (player 2's keys are P2_BINDINGS in game/input.js)
const VERSUS_ROWS = [
  ['MOVE / JUMP / BLOCK', 'A D / W / S', 'ARROWS'],
  ['PUNCH / KICK', 'J / K', ',  /  .'],
  ['KI / BEAM / ULTIMATE', 'L / U / O', '/  ;  \''],
  ['CHARGE / TRANSFORM', 'I / T', '[  /  ]'],
  ['VANISH / DASH', 'Q / L-SHIFT', '\\  /  R-SHIFT'],
  ['GRAB', 'F', '-'],
  ['CELL SPECIALS', 'G / E / Y', '=  /  0  /  9'],
];
const CONTROL_ROWS = [
  ['MOVE', 'A / D or arrows', 'Stick / d-pad'],
  ['JUMP', 'W / Space', 'A'],
  ['BLOCK', 'S', 'LB / down'],
  ['PUNCH / KICK', 'J / K', 'X / Y'],
  ['DRAGON RUSH / ABSORB', 'J + K / F', 'X + Y'],
  ['CELL: BARRIER / JUNIOR', 'G / E', ''],
  ['KI ATTACK', 'L', 'B'],
  ['BEAM / ULTIMATE', 'U / O', 'RT / R3'],
  ['CHARGE / TRANSFORM', 'I / T', 'LT / L3'],
  ['DASH / VANISH', 'Double-tap, Shift / Q', 'RB / Back'],
  ['PAUSE', 'P', 'Start'],
  ['MUSIC / CALM / FPS', 'M / R / F2', ''],
];
