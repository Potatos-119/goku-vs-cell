// Which sheet frames make up each move. Frame ids are "row.index" from the sliced sheets
// (open tools/frames.html?sheet=goku to see them numbered).
// hit: { at: frame index that lands, dmg, reach, ki, heavy (knockdown) }
// emit: height above the floor where a projectile/beam leaves the hand.

// a frame cut by exact rectangle from the older big Goku sheet (see goku2 in sheets.js)
const G2 = (x, y, w, h) => ({ sheet: 'goku2', rect: [x, y, w, h] });
// a frame cut by exact rectangle from the newer base sheet (goku-base.png): his walk and run, the
// Kamehameha, the Kaioken, and everything he does with his gi top torn off
const GB = (x, y, w, h) => ({ sheet: 'gb', rect: [x, y, w, h] });
// ---- Goku's looks ----
// Every move below is drawn once, for base Goku in his full gi. His other looks are the same moves:
//   base   as drawn, in the older sheet's bright colours (frames only the newer sheet has are matched to it)
//   torn   the orange gi top torn off, down to the blue undershirt (once he's hurt)
//   kaio   the Kaioken: the torn look, in the sheet's red Kaioken colours
// Super Saiyan is drawn on a sheet of its own, pose for pose (see SS below), in two looks:
//   ssjT   as that sheet draws him, the gi top torn off (the way he first turned)
//   ssj    the same frames in his full gi, coloured from the other Super Saiyan sheet
// tools/goku-forms.py makes each look of each frame and packs them onto one generated sheet
// (assets/sheets/goku-forms.png); goku-forms.js says where each one is: GOKU_FORMS[look][frame].
const GOKU_LOOKS = typeof GOKU_FORMS === 'undefined' ? {} : GOKU_FORMS;
const tornLook = look => look === 'torn' || look === 'ssjT' || look === 'kaio';
function formFrame(r, look) {
  // AS_SSJ(frame): a Super Saiyan frame inside one of base Goku's moves, in the gi the move is played in
  if (r.ssjOf) return formFrame(r.ssjOf, tornLook(look) ? 'ssjT' : 'ssj');
  const made = GOKU_LOOKS[look] && GOKU_LOOKS[look][JSON.stringify(r)];
  return made ? { sheet: 'gf', rect: made.slice(0, 4), ax: made[4] } : null;
}
const AS_SSJ = r => ({ ssjOf: r });
// a table of moves in one look. A move the look has no frames for is left out, and Fighter.A falls
// back to base Goku's (tools/goku-forms.py lists what it couldn't make)
const formAnims = (anims, look) => Object.fromEntries(Object.entries(anims).map(([k, a]) => {
  if (a.native) return [k, a];
  const fr = a.fr.map(r => formFrame(r, look));
  return fr.includes(null) ? null : [k, { ...a, fr }];
}).filter(Boolean));
const nativeFr = (fr, o) => ({ fr, native: true, ...o });
// A frame the newer sheet draws in an outfit of its own (the torn gi, the Kaioken starting): shown as
// drawn, with its colours matched to the rest (the tool does that; until it has run, as it is)
const GB_NATIVES = [];
const GBN = (x, y, w, h) => { const r = GB(x, y, w, h); GB_NATIVES.push(r); return formFrame(r, 'base') || r; };

const GOKU_WIN = [G2(68, 2782, 37, 46), G2(113, 2777, 31, 51), G2(156, 2775, 31, 53), G2(156, 2775, 31, 53),
  G2(221, 2776, 37, 52), G2(275, 2779, 37, 47), G2(325, 2791, 35, 37)];
// ---- the Super Saiyan sheet ----
// assets/sheets/goku-ssj-first.png (mrruben7's sheet, at its full size).
// It has the same rows as base Goku's sheet, pose for pose, so each of his moves has its Super Saiyan
// frames. SS(x, y, w, h) is one frame of it; alone: the full-gi sheet has no frame like it to take colours from
const SS_FRAMES = [];
const SS = (x, y, w, h, o) => { const r = { sheet: 'ss', rect: [x, y, w, h], ...o }; SS_FRAMES.push(r); return r; };
const ssRow = (boxes, o) => boxes.map(b => SS(...b, o));
const SS_IDLE = ssRow([[64, 207, 28, 56], [108, 209, 32, 54], [156, 211, 30, 52], [227, 205, 28, 58], [268, 210, 31, 53], [353, 205, 28, 58], [400, 205, 28, 58]]);
const SS_DASH = ssRow([[67, 277, 33, 53], [109, 278, 60, 52], [184, 286, 36, 44], [223, 292, 69, 38], [307, 294, 52, 29], [364, 298, 51, 22],
  [445, 281, 41, 49], [497, 278, 36, 52], [578, 275, 29, 55], [616, 275, 30, 55], [657, 279, 28, 51]]);
const SS_JUMP = ssRow([[68, 358, 35, 47], [111, 350, 35, 55], [159, 346, 31, 49], [203, 348, 31, 55], [245, 347, 28, 58], [285, 358, 35, 47], [356, 357, 32, 48], [401, 358, 36, 47]]);
const SS_PUNCH = ssRow([[67, 425, 34, 55], [115, 429, 35, 51], [164, 432, 49, 48], [216, 429, 38, 51], [264, 429, 44, 51], [317, 425, 36, 55],
  [360, 428, 45, 52], [419, 428, 36, 52], [466, 425, 30, 55], [509, 424, 37, 52], [552, 430, 44, 44], [609, 430, 42, 43]]);
const SS_KICK = ssRow([[68, 506, 30, 53], [108, 507, 36, 53], [158, 507, 33, 53], [208, 509, 44, 46], [258, 511, 51, 44], [316, 507, 36, 53],
  [366, 506, 32, 55], [402, 506, 50, 55], [461, 507, 46, 48], [517, 503, 32, 54]]);
const SS_GRAB = ssRow([[69, 591, 33, 52], [117, 590, 30, 53], [164, 588, 29, 55], [205, 590, 34, 53], [250, 592, 37, 51], [294, 591, 40, 52]]);
const SS_GUARD = ssRow([[67, 684, 31, 53], [111, 684, 32, 53], [154, 683, 28, 54], [198, 689, 28, 48], [274, 680, 36, 57], [319, 681, 36, 55], [360, 682, 44, 55], [416, 682, 36, 55]]);
const SS_HURT = ssRow([[67, 781, 32, 53], [109, 791, 41, 43], [161, 783, 45, 51], [211, 784, 35, 48], [257, 803, 44, 31], [310, 789, 33, 41], [350, 806, 57, 31]]);
const SS_KI = ssRow([[67, 875, 34, 53], [115, 875, 54, 53], [185, 876, 43, 53], [236, 876, 38, 53], [332, 876, 43, 52], [383, 876, 38, 52]]);
// powering up: stance, stance, and the two frames of gold flames
const SS_CHARGE = ssRow([[67, 971, 31, 51], [125, 971, 32, 51], [178, 943, 63, 81], [250, 942, 70, 81]]);
// powering down: two of the stance, his hair going white, black-haired again; then worn out on one knee
const SS_DOWN = ssRow([[66, 1201, 28, 56], [107, 1201, 28, 56], [147, 1199, 26, 58], [187, 1204, 32, 54], [260, 1203, 36, 55], [311, 1208, 39, 49], [362, 1219, 36, 41], [413, 1219, 36, 39], [463, 1220, 36, 38]]);
// the sheet's big attack, in order: stance, the aura flaring, the dash in, a knee, a kick, a breath, another
// kick, the flip kick that sends them up, landing, turning, the Kamehameha swirling in his hands, and
// the Kamehameha fired up at them (cut down to him: the game draws the beam)
const SS_SUPER = ssRow([[65, 1087, 31, 51], [112, 1059, 70, 79], [197, 1098, 46, 42], [262, 1084, 42, 54], [310, 1089, 45, 49], [366, 1088, 36, 50],
  [414, 1085, 43, 53], [469, 1083, 35, 53], [518, 1083, 31, 53], [561, 1083, 33, 55], [610, 1083, 59, 57], [706, 1066, 62, 74]], { alone: true });
// his Kamehameha in his full gi, cut as drawn from the full-gi sheet (goku-super-saiyan.png, the end of
// its Instant Kamehameha row): the hands cupped at his side, the thrust, and the thrust as the beam leaves
const GS = (x, y, w, h) => ({ sheet: 'gs', rect: [x, y, w, h] });
const GS_KAME = [GS(528, 1069, 36, 54), GS(586, 1069, 41, 54), GS(645, 1069, 39, 54)];
// Instant Transmission in the air, in his full gi, cut from the full-gi sheet
// (assets/sheets/goku-ssj-moves.png, made by tools/ssj-moves.py)
const SX = (x, y, w, h) => ({ sheet: 'sx', rect: [x, y, w, h] });
// Instant Transmission from the air: turning, the dash pose, the streak as he zips away
const SX_TELE = [SX(6, 10, 34, 58), SX(46, 6, 35, 62), SX(87, 6, 34, 62), SX(127, 38, 56, 30)];
// turning Super Saiyan in his full gi, from base Goku's own sheet (goku.png, row 10: sharper than the
// full-gi Super Saiyan sheet): the stance, the aura starting, the blue aura twice, the crouch, the white
// flash, the gold swirl, the gold flames, and the Super Saiyan stance
const G10 = (x, y, w, h) => ({ sheet: 'goku', rect: [x, y, w, h] });
const TURN = [null, G10(104, 826, 32, 48), G10(151, 826, 53, 48), G10(214, 799, 65, 75), G10(290, 796, 65, 78), G10(371, 821, 53, 53),
  G10(441, 816, 50, 58), G10(509, 812, 44, 62), G10(574, 795, 63, 79), G10(656, 818, 27, 56)];
// powering up as a Super Saiyan in his full gi, from the second Super Saiyan sheet (goku-ssj2.png)
const SJ = (x, y, w, h) => ({ sheet: 'ssj2', rect: [x, y, w, h], k: 1.25 });
const SJ_CHARGE = [SJ(12, 585, 42, 43), SJ(65, 577, 47, 50), SJ(125, 574, 47, 53), SJ(189, 574, 48, 53), SJ(247, 577, 46, 50), SJ(307, 574, 46, 53), SJ(371, 574, 48, 53)];
// which Super Saiyan frame each of base Goku's frames is
const SSJ_TWIN = {};
const twins = (ids, row) => ids.forEach((id, i) => { if (id != null) SSJ_TWIN[JSON.stringify(id)] = row[i]; });
twins(['0.2', '0.4', '0.5', null, null, '0.10', '0.8'], SS_IDLE);
twins(['0.3', null, '0.1'], SS_IDLE); twins([null, null, '0.0'], SS_IDLE);
twins(['1.0', '1.1', '1.2', '1.3', null, null, '1.6', '1.7', { id: '1.9', w: 31 }, { id: '1.9', x: 37 }, '1.10'], SS_DASH);
twins(['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.7', '2.8'], SS_JUMP);
twins(['4.0', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '4.10', '4.11'], SS_PUNCH);
twins(['5.0', '5.1', '5.2', { id: '5.3', w: 43 }, { id: '5.3', x: 49 }, '5.4', '5.5', '5.6', '5.7', '5.8'], SS_KICK);
twins(['6.0', '6.1', '6.2', '6.3', { id: '6.4', w: 37 }, { id: '6.4', x: 45 }], SS_GRAB);
twins(['3.0', '3.1', '3.2', '3.3', '3.5', null, { id: '3.6', x: 41 }, '3.7'], SS_GUARD);
twins(['8.0', null, { id: '8.1', x: 49 }, '8.2', '8.3', '8.4', '8.5'], SS_HURT);
twins(['9.0', '9.1', '9.2', { id: '9.3', w: 31 }, '9.4', { id: '9.5', w: 31 }], SS_KI);

// the Kaioken's red flames (two frames), and the frames around them
// (hollow: the white inside the flames is see-through, as it is on the sheet)
// (solid: cut see-through, the middle of the flames looked patchy)
const KAIO_AURA = [{ ...GB(288, 1281, 70, 78), seal: 4 }, { ...GB(361, 1278, 70, 82), seal: 4 }];
const KAIO_STANCE = GB(441, 1310, 31, 48);
// the moment the Kaioken bursts out: a white flash of him in a red outline (the sheet's frame, its white
// middle kept: cut see-through, only broken scraps of the outline were left)
const KAIO_FLASH = GB(225, 1310, 55, 50);
const KAIO_RIP = 5;   // frames of the Kaioken starting that show him tearing the gi top off

// native: these frames are already drawn in the outfit they're for, so no other version is made of
// them (see formAnims below)
const GOKU_MOVES = {
  idle: { fr: ['0.2', '0.3', '0.4', '0.5', '0.4', '0.3'], fps: 8, loop: true },
  // moving in: the sheet's run cycle; backing off: its walk, played backwards so he steps away
  // without turning his back
  walk: { fr: [GB(239, 278, 38, 48), GB(289, 276, 33, 50), GB(331, 275, 41, 51), GB(382, 276, 33, 50)], fps: 12, loop: true },
  back: { fr: [GB(176, 273, 30, 53), GB(140, 272, 30, 52), GB(105, 272, 30, 52), GB(68, 272, 30, 52)], fps: 9, loop: true },
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
  // (the J string's last hit: quick enough that it lands before they recover from the third)
  p4: { fr: ['4.8', '4.9', '4.9', '4.10', '4.11'], fps: 16, hit: { at: 1, dmg: 10, reach: 32, heavy: true, launch: true } },
  k1: { fr: ['5.4', '5.5', '5.6', '5.6', '5.4'], fps: 16, hit: { at: 2, dmg: 7, reach: 40 } },
  k2: { fr: ['5.0', '5.1', '5.2'], fps: 14, hit: { at: 1, dmg: 8, reach: 34 } },
  k3: { fr: ['5.7', '5.7', '5.8'], fps: 11, hit: { at: 0, dmg: 11, reach: 40, heavy: true, launch: true } },
  rush: { fr: ['1.2', '1.2', '4.2', '4.2', '4.3'], fps: 12, hit: { at: 2, dmg: 7, reach: 38 } },
  // Dragon Rush: a lunging grab. Slow to come out, but it goes through a block and launches
  // the sheet's grab: step in, lunge, catch and toss (frame 6.4 holds the lunge and the catch side by side)
  grab: { fr: ['6.0', '6.1', { id: '6.4', w: 37 }, { id: '6.4', x: 45 }, { id: '6.4', x: 45 }, '6.3'], fps: 13, hit: { at: 3, dmg: 6, reach: 34, grab: true, launch: true } },
  // 3.6, 5.3 and 8.1 are two sprites the slicer merged into one box: x / w keep the right one
  slash: { fr: ['3.5', { id: '3.6', x: 41 }, { id: '3.6', x: 41 }, '3.7'], fps: 11, hit: { at: 1, dmg: 10, reach: 46, heavy: true, wallBounce: true } },
  // air string: J J J in the air, ending in a spike that slams them into the ring
  // air attacks get a wind-up frame now, so a flying kick reads as a kick (they hit a frame later, a
  // little faster)
  air: { fr: ['5.0', { id: '5.3', w: 43 }, { id: '5.3', w: 43 }], fps: 16, loop: false, hit: { at: 1, dmg: 8, reach: 42 } },
  air2: { fr: ['4.5', '4.6', '4.6'], fps: 16, loop: false, hit: { at: 1, dmg: 7, reach: 42 } },
  spike: { fr: ['5.0', { id: '5.3', x: 49 }, { id: '5.3', x: 49 }, { id: '5.3', x: 49 }], fps: 11, loop: false, hit: { at: 1, dmg: 10, reach: 40, spike: true } },
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
  // "Ka... me... ha... me...": the sheet's whole sequence, hands out, drawn back to the hip, the
  // light growing between them, the swirl as it peaks; "HA!": his hair whips back, the thrust, and
  // the frame the beam leaves on. The charge is timed so it always reaches its last frame as the beam
  // fires (see startKame)
  kameCharge: { fr: [GB(61, 956, 38, 52), GB(108, 956, 40, 52), GB(156, 956, 38, 51), GB(204, 956, 37, 50), GB(247, 945, 64, 62)], fps: 6, loop: false },
  kameFire: { fr: [GB(320, 956, 39, 52), GB(370, 956, 42, 49), GB(472, 956, 40, 50)], fps: 16, loop: false, emitAt: 2, emit: 27 },
  // Super Saiyan, the quick way (after the first time): the small aura, the big flames, the flash
  transform: { fr: ['10.1', '10.2', '10.3', '10.4', '10.3', '10.4', '10.5', '10.6', '10.7', AS_SSJ(SS_CHARGE[0]), AS_SSJ(SS_CHARGE[0])], fps: 7, loop: false },
  // the Super Saiyan cinematic follows the sheet's row in order: standing, the small aura, the big
  // flames looping while the music builds (ssjBuild), the rise to the flash in its last second
  // (ssjRise), then the gold flare held (ssjFlare, below) and the Super Saiyan stance
  ssjBuild: { fr: ['10.1', '10.2', '10.3', '10.4'], fps: 8, loop: true, loopFrom: 2 },
  ssjRise: { fr: ['10.4', '10.5', '10.6', '10.7'], fps: 4, loop: false },
  // the Kaioken: he gathers himself, crouches, the red outline bursts off him and the flames go up.
  // The sheet draws it with his gi top already gone, which is why going Kaioken tears it off
  // The first frame is him with the gi top torn off in his hand: it's held long enough to see (and
  // skipped if the top is already gone, see goKaioken)
  kaioUp: { fr: [...Array(KAIO_RIP).fill(GBN(136, 1305, 40, 55)), GBN(185, 1310, 31, 50), GBN(185, 1310, 31, 50), KAIO_FLASH,
    KAIO_FLASH, ...KAIO_AURA, ...KAIO_AURA], fps: 10, loop: false, native: true },
  // Solar Flare: hands to his forehead, and a flash that blinds whoever is looking at him
  flare: { fr: [GB(69, 1121, 36, 54), GB(118, 1124, 33, 51), GB(118, 1124, 33, 51), GB(118, 1124, 33, 51), GB(69, 1121, 36, 54)], fps: 11, loop: false },
  // Destructo Disc: the disc spinning up over his head, the swing that throws it, the follow-through
  disc: { fr: [GB(59, 1025, 52, 62), GB(116, 1025, 59, 62), GB(59, 1025, 52, 62), GB(116, 1025, 59, 62), GB(192, 1041, 45, 47), GB(250, 1038, 37, 50), GB(250, 1038, 37, 50)], fps: 10, emitAt: 4, emit: 34 },
  // Spirit Bomb (base Goku's full-ki finisher): stance, an arm going up, both arms raised while the
  // bomb gathers above them, then the throw
  spirit: { fr: [GB(88, 1768, 31, 53), GB(129, 1768, 32, 56), GB(174, 1766, 33, 56), GB(220, 1761, 35, 61)], fps: 6, loop: false },
  // the throw, then hunched over, spent, as it flies
  spiritThrow: { fr: [GB(267, 1769, 37, 54), GB(321, 1773, 33, 50)], fps: 5, loop: false },
  // facing the camera (boss Goku's taunt, and between lines in the story scenes)
  taunt: { fr: ['0.10'], fps: 1, loop: true, breathe: true },
  // the fight is won: he walks it off, gives a thumbs up, and sits down to rest (in his undershirt,
  // which is fine here: the fight is over, so it never has to come back)
  win: { fr: GOKU_WIN, fps: 5, loop: false, native: true },
};

const GOKU_BASE = formAnims(GOKU_MOVES, 'base');
// in his full gi he turns Super Saiyan the way the full-gi sheet draws it: the blue aura, the white
// flash, the gold flames (with the gi top torn, GOKU_BASE_T has the newer sheet's own)
// (the first time, in the cutscene: the stance and the blue aura while the music builds, then the
// crouch, the white flash, the gold swirl and the flames)
GOKU_BASE.ssjBuild = nativeFr([TURN[1], TURN[2], TURN[3], TURN[4]], { fps: 6, loop: true, loopFrom: 2 });
GOKU_BASE.ssjRise = nativeFr([TURN[5], TURN[6], TURN[7], TURN[8]], { fps: 5, loop: false });
// pressing T: the stance, the aura building, the blue aura three times, then the crouch, the flash, the
// swirl, and it ends in the gold flames and the Super Saiyan stance
GOKU_BASE.transform = nativeFr([TURN[1], TURN[1], TURN[2], TURN[2], TURN[3], TURN[4], TURN[3], TURN[4], TURN[3], TURN[4],
  TURN[5], TURN[6], TURN[7], TURN[8], TURN[8], TURN[9]], { fps: 8, loop: false });
// in the middle of a combo it's quicker (they're held reeling while it plays: see comboTransform)
GOKU_BASE.transformQuick = nativeFr([TURN[2], TURN[3], TURN[4], TURN[5], TURN[6], TURN[7], TURN[8], TURN[9]], { fps: 9, loop: false });

// Gi top torn off. The newer sheet draws some of it itself (the Spirit Bomb)
// turning Super Saiyan with the gi top torn, as the torn-gi Super Saiyan sheet draws it (its top row):
// seven frames of the power building, his hair going white in a gold aura, the gold swirl, and the
// gold flames twice
const SST = (x, y, w, h) => ({ sheet: 'ss', rect: [x, y, w, h] });
const TORN_TURN = [SST(61, 131, 32, 56), SST(106, 131, 34, 56), SST(161, 127, 29, 60), SST(211, 128, 28, 59), SST(261, 130, 29, 57),
  SST(311, 130, 29, 56), SST(364, 130, 36, 57), SST(417, 129, 51, 58), SST(489, 122, 45, 64), { ...SST(559, 107, 67, 80), seal: 2 }, { ...SST(637, 107, 65, 80), seal: 2 }];
const GOKU_BASE_T = formAnims(GOKU_MOVES, 'torn');
Object.assign(GOKU_BASE_T, {
  spirit: nativeFr([GBN(77, 1988, 37, 49), GBN(128, 1984, 32, 53), GBN(175, 1982, 31, 56), GBN(241, 1970, 39, 69)], { fps: 6, loop: false }),
  spiritThrow: nativeFr([GBN(305, 1985, 38, 52), GBN(361, 1990, 38, 47)], { fps: 5, loop: false }),
  transform: nativeFr([TORN_TURN[0], TORN_TURN[0], ...TORN_TURN, TORN_TURN[10]], { fps: 8, loop: false }),
  transformQuick: nativeFr([...TORN_TURN.slice(3), TORN_TURN[10]], { fps: 9, loop: false }),
  ssjBuild: nativeFr(TORN_TURN.slice(0, 7), { fps: 6, loop: true, loopFrom: 4 }),
  ssjRise: nativeFr(TORN_TURN.slice(7, 11), { fps: 5, loop: false }),
});

// Super Saiyan: every move of base Goku's whose frames the Super Saiyan sheet has, in its frames (in
// his full gi, or with the top torn). He doesn't run: he glides in his stance, a few pixels off the
// ring (see hover in game/fighter-update.js). A move with a frame missing is left out, and Fighter.A
// falls back to base Goku's
const ssjTable = look => {
  const fr = rs => rs.map(r => formFrame(r, look));
  const stance = fr([SS_IDLE[0], SS_IDLE[1], SS_IDLE[2], SS_IDLE[1]]);
  const moves = Object.entries(GOKU_MOVES).filter(([, a]) => !a.native).map(([k, a]) => [k, { ...a, fr: a.fr.map(r => SSJ_TWIN[JSON.stringify(r)] || null) }])
    .filter(([, a]) => !a.fr.includes(null)).map(([k, a]) => [k, { ...a, fr: fr(a.fr) }]);
  const t = {
    ...Object.fromEntries(moves),
    // (in his full gi: the stance he ends his transformation in, base Goku's own sheet, breathing, as it was)
    // (with the top torn too, one stance breathing: cycling the sheet's first frames switched between three
    // different stances while he stood still)
    idle: look === 'ssj' ? { fr: [TURN[9]], fps: 1, loop: true, breathe: true } : { fr: fr([SS_IDLE[0]]), fps: 1, loop: true, breathe: true },
    dashStop: { fr: fr([SS_IDLE[2]]), fps: 10, loop: false, then: 'idle' },
    walk: { fr: stance, fps: 10, loop: true },
    back: { fr: [...stance].reverse(), fps: 9, loop: true },
    // powering up, as the sheet draws it: the stance twice, then the gold flames looping
    // (in his full gi, as it was: the second Super Saiyan sheet's charge, a small aura at his feet, then
    // the gold flame flickering round him, drawn 1.25x to match his size)
    charge: look === 'ssj' ? { fr: SJ_CHARGE, fps: 12, loop: true, loopFrom: 1 } : { fr: fr(SS_CHARGE), fps: 10, loop: true, loopFrom: 2 },
    chargeEnd: { fr: look === 'ssj' ? [SJ_CHARGE[0]] : fr([SS_CHARGE[1]]), fps: 9, loop: false, then: 'idle' },
    // his Kamehameha: the turn, the swirl gathering in his hands, then the thrust
    // (in his full gi, the sheet's own Kamehameha: see GS_KAME)
    // (with the top torn too: the torn sheet's own looked wrong, so he fires it the full-gi way)
    kameCharge: { fr: [GS_KAME[0], GS_KAME[0], GS_KAME[0], GS_KAME[0], GS_KAME[0]], fps: 6, loop: false },
    kameFire: { fr: GS_KAME.slice(1), fps: 12, loop: false, emitAt: 1, emit: 29 },
    // Instant Transmission (full gi only, see teleKame in game/cinematics.js): from the ground the
    // crouch, the spring up and the fade; in the air the turn and the zip away; appearing; the
    // Kamehameha held at his side
    // From the ground (sharp frames of his own jump): the crouch and the leap; then, in the air, the
    // sheet's turn, dash pose and zip away
    // (with the top torn there are no such frames on the sheets: its own jump, stretched high, then the zip;
    // only his last stand uses it, see gokuLastStand)
    itCrouch: { fr: fr([SS_JUMP[0]]), fps: 1, loop: true },
    itLeap: { fr: fr([SS_JUMP[1], SS_JUMP[4]]), fps: 7, loop: false },
    itAir: look === 'ssj' ? { fr: SX_TELE, fps: 7, loop: false } : { fr: [...fr([SS_JUMP[4], SS_JUMP[4], SS_JUMP[2]]), SX_TELE[3]], fps: 7, loop: false },
    itHold: { fr: [GS_KAME[0]], fps: 1, loop: true },
    // the big attack (O on the ground with the gi top torn, full ki): see superRush in game/cinematics.js
    superUp: { fr: fr([SS_SUPER[0], SS_SUPER[1], SS_SUPER[1]]), fps: 8, loop: false },
    superDash: { fr: fr([SS_SUPER[2]]), fps: 1, loop: true },
    super1: { fr: fr([SS_SUPER[3]]), fps: 1, loop: true },
    super2: { fr: fr([SS_SUPER[4], SS_SUPER[5]]), fps: 9, loop: false },
    super3: { fr: fr([SS_SUPER[6]]), fps: 1, loop: true },
    super4: { fr: fr([SS_SUPER[7], SS_SUPER[8]]), fps: 7, loop: false },
    superCharge: { fr: fr([SS_SUPER[9], SS_SUPER[10]]), fps: 5, loop: false },
    superFire: { fr: fr([SS_SUPER[11]]), fps: 1, loop: true, emit: 46 },
    // the moment he turns: the flames held
    // (in his full gi, the gold flames his transformation ends in: TURN)
    // (with the top torn, the last frame of its own transformation row, held: flipping between its last two,
    // two different poses, made him wiggle)
    ssjFlare: { fr: look === 'ssj' ? [TURN[8]] : [TORN_TURN[10]], fps: 1, loop: true },
    // the last frame of turning with the top torn, held until he moves (see turnedPose)
    ...(look === 'ssjT' ? { turnHold: nativeFr([TORN_TURN[10]], { fps: 1, loop: true }) } : {}),
    // powering back down to base: his hair goes white, then black again
    powerDown: nativeFr(fr([SS_DOWN[1], SS_DOWN[2], SS_DOWN[2], SS_DOWN[3]]), { fps: 8, loop: false }),
    // Dragon Fist: power up to Super Saiyan 3, rush in, dragon
    ult1: nativeFr(['12.1', '12.2', '12.3', '12.4', '12.3', '12.7', '12.5'], { fps: 7, loop: false }),
    // the launch into the rush, then the rising fist as the dragon bursts out
    ult2: nativeFr(['13.2', '13.4'], { fps: 8, loop: false }),
    ult3: nativeFr(['13.5', { id: '13.6', ax: 0.3 }], { fps: 10, loop: false }),
    // up in the air (before the Spirit Bomb) he powers down in the sheet's mid-air frames: floating
    // gold, the burst of light, the white outline, and then he's normal Goku again
    powerDownAir: nativeFr([G2(578, 2128, 50, 64), G2(454, 2114, 74, 78), G2(406, 2135, 35, 57)], { fps: 7, loop: false }),
  };
  // until the looks have been made (tools/goku-forms.py), there are no frames to show
  return Object.fromEntries(Object.entries(t).filter(([, a]) => !a.fr.includes(null)));
};
const GOKU_SSJ = ssjTable('ssj'), GOKU_SSJ_T = ssjTable('ssjT');
// the Spirit Bomb that turns him, the moment it lands: his throw's last frame, held (see spiritSaiyan)
for (const T of [GOKU_BASE, GOKU_BASE_T]) T.spiritHit = { ...T.spiritThrow, fr: [T.spiritThrow.fr[T.spiritThrow.fr.length - 1]], fps: 1, loop: true };

// Kaioken: the torn look in red. The sheet draws its flames, its dash, a flurry that becomes his rush
// (toward + J: three hits, each stepping further in) and a Kamehameha of its own, which is the end of
// his big attack. U is the ordinary Kamehameha, in red
const GOKU_KAIO = formAnims(GOKU_MOVES, 'kaio');
Object.assign(GOKU_KAIO, {
  charge: nativeFr(KAIO_AURA, { fps: 10, loop: true }),
  chargeEnd: nativeFr([KAIO_STANCE], { fps: 9, loop: false, then: 'idle' }),
  dash: nativeFr([GB(486, 1312, 39, 47), GB(523, 1315, 75, 45), GB(523, 1315, 75, 45)], { fps: 16, loop: false }),
  rush: nativeFr([GB(486, 1312, 39, 47), GB(649, 1309, 39, 49), GB(699, 1308, 52, 51)], { fps: 15, hit: { at: 1, dmg: 5, reach: 40 } }),
  rush2: nativeFr([GB(603, 1305, 36, 55), GB(760, 1307, 39, 53), GB(760, 1307, 39, 53)], { fps: 15, hit: { at: 1, dmg: 5, reach: 38 } }),
  rush3: nativeFr([GB(806, 1312, 46, 43), GB(864, 1313, 45, 46), GB(864, 1313, 45, 46), KAIO_STANCE], { fps: 13, hit: { at: 1, dmg: 8, reach: 42, heavy: true, wallBounce: true } }),
  // the big attack (O, 50 ki): his dash in, the flurry above, then the sheet's own Kamehameha: a run-up, a
  // flip, hands out, the swirl, and a beam half as big again as anyone else's (see superRush in game/cinematics.js)
  superDash: nativeFr([GB(523, 1315, 75, 45)], { fps: 1, loop: true }),
  // the run in, the flip kick that sends them up, hands out, the swirl, and firing in mid-air (the
  // sheet's own Kamehameha and beam: BEAMS.gokuKaio)
  superRun: nativeFr([GB(142, 1412, 31, 52)], { fps: 1, loop: true }),
  superKick: nativeFr([GB(189, 1410, 35, 52)], { fps: 1, loop: true }),
  superCharge: nativeFr([GB(240, 1410, 38, 54), GB(291, 1399, 59, 65)], { fps: 2.5, loop: false }),
  superFire: nativeFr([GB(366, 1410, 37, 54)], { fps: 1, loop: true, emit: 31 }),
  // his ordinary Kamehameha (U) the same way: hands out, the swirl, and the sheet's firing pose
  kameCharge: nativeFr([GB(240, 1410, 38, 54), GB(291, 1399, 59, 65)], { fps: 2.5, loop: false }),
  kameFire: nativeFr([GB(366, 1410, 37, 54)], { fps: 1, loop: false, emit: 31 }),
  // powering back down: the flames, the outline, and he's himself again
  powerDown: nativeFr([KAIO_AURA[0], KAIO_FLASH, GBN(185, 1310, 31, 50)], { fps: 10, loop: false }),
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
  // the third J: a lunging strike (the lunge frame, 13.11) that slams them into the ring, and they bounce
  // back up off it for one more hit (the ground bounce, once per combo). It ends the string, so J can't
  // be mashed forever, and it's slow to recover, so a blocked one can be punished
  p3: { fr: ['13.2', '13.11', '13.11', '13.11', '13.11'], fps: 10, hit: { at: 1, dmg: 9, reach: 40, heavy: true, spike: true } },
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
// Each form plays differently, not just harder:
//   speed     how fast it walks and dashes       dmgMul     how hard it hits
//   tempo     how fast its punches and kicks come out and recover
//   airDashes how many times it can dash in one jump
//   absorb    health Cell's grab gives back      guardDmg   how much faster its hits wear a guard down
// Imperfect Cell lives off his tail (the grab heals most), Semi-Perfect is the heavy one (his blows
// crush a guard), Perfect is the quick one (two air dashes, the Juniors, the Solar Kamehameha).
const CELL_INFO = {
  imperfect: { name: 'IMPERFECT CELL', speed: 0.9, dmgMul: 0.9, tempo: 0.95, airDashes: 1, absorb: 22, bar: '#7be05a', face: 0 },
  semi: { name: 'SEMI-PERFECT CELL', speed: 1.05, dmgMul: 1.1, tempo: 1, airDashes: 1, guardDmg: 1.4, bar: '#3fc0a0', face: 1 },
  perfect: { name: 'PERFECT CELL', speed: 1.25, dmgMul: 1.3, tempo: 1.12, airDashes: 2, bar: '#c27aff', face: 2 },
  junior: { name: 'CELL JR.', speed: 1.4, dmgMul: 0.75, tempo: 1.1, airDashes: 1, bar: '#5aa8ff', face: 4, scale: 1 },
};
// Goku: base runs on foot and has the Spirit Bomb; the Kaioken is the fast one (it burns ki while it
// lasts: two air dashes, quicker strings, a three-hit rush); a Super Saiyan hits hardest and glides.
// kame: his Kamehameha in that form: seconds to charge it, damage a second, how thick the beam is
const GOKU_INFO = {
  base: { name: 'GOKU', speed: 1, dmgMul: 1, tempo: 1, airDashes: 1, kame: { charge: 1.15, dps: 16, size: 0.85 } },
  kaioken: { name: 'GOKU  KAIOKEN', speed: 1.3, dmgMul: 1.2, tempo: 1.25, airDashes: 2, kame: { charge: 0.8, dps: 20, size: 1 } },
  ssj: { name: 'GOKU  SSJ', speed: 1.15, dmgMul: 1.35, tempo: 1.1, airDashes: 1, kame: { charge: 0.9, dps: 22, size: 1 } },
};
const infoOf = f => f.who === 'cell' ? CELL_INFO[f.form] : GOKU_INFO[f.form];
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

// Goku's tables by form; a T on the end is that form with the gi top torn off (see Fighter.A)
const ANIMS = {
  goku: { base: GOKU_BASE, baseT: GOKU_BASE_T, ssj: GOKU_SSJ, ssjT: GOKU_SSJ_T, kaioken: GOKU_KAIO },
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
  // the Kaioken's own portrait, from the newer sheet
  kaioPortrait: { sheet: 'gb', ref: GB(68, 1302, 40, 56) },
  // the Destructo Disc in flight (two frames of its spin), and the Solar Flare going off: the flash
  // across his forehead and the ring that spreads from it
  disc: { sheet: 'gb', ref: GB(308, 1047, 63, 28) },
  disc2: { sheet: 'gb', ref: GB(376, 1047, 61, 28) },
  flareFlash: { sheet: 'gb', ref: GB(262, 1131, 143, 36) },
  flareRing: { sheet: 'gb', ref: { ...GB(410, 1111, 62, 60), hollow: true } },
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
  // Super Saiyan Goku's, as the full-gi sheet draws it with his Instant Kamehameha: a spiky burst out of
  // his hands, a thinner stream, and a big round head (drawn at its own size, not squeezed to the stream)
  gokuSsj: {
    start: { sheet: 'gs', ref: { sheet: 'gs', rect: [687, 1028, 123, 132], seed: 'tbl' } },
    body: { sheet: 'gs', ref: { sheet: 'gs', rect: [830, 1068, 40, 51], seed: 'tb' } },
    head: { sheet: 'gs', ref: { sheet: 'gs', rect: [929, 1028, 140, 132], seed: 'tbr' } },
    scale: 0.5, tile: true, ownHead: true,
  },
  // the Kaioken's, as its sheet draws it with his finish (the same shape, a little bigger)
  gokuKaio: {
    start: { sheet: 'gb', ref: { sheet: 'gb', rect: [403, 1369, 135, 129], seed: 'tbl' } },
    body: { sheet: 'gb', ref: { sheet: 'gb', rect: [560, 1404, 40, 60], seed: 'tb' } },
    head: { sheet: 'gb', ref: { sheet: 'gb', rect: [646, 1369, 140, 129], seed: 'tbr' } },
    scale: 0.5, tile: true, ownHead: true,
  },
};
// Base Goku's and Cell's: the same one-piece beam as the Kaioken's, Goku's a little thinner and Cell's a
// little thicker to suit his size. (They used to be pieced together from three sheets: a burst that
// ended in a hard step down to a flat band, and a small ball, which read as a second Kamehameha
// stuck in the middle of the beam.)
BEAMS.goku = { ...BEAMS.gokuKaio, scale: 0.44 };
BEAMS.cell = { ...BEAMS.gokuKaio, scale: 0.56 };

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
    { name: 'KAMEHAMEHA CANCEL', steps: ['melee', 'beam'], how: 'land a hit, then U' },
    { name: 'VANISH STRIKE', steps: ['melee', 'vanish', 'melee'], how: 'land a hit, Q, then J' },
    { name: 'WALL SPLAT', steps: ['wall', 'melee'], how: 'toward + K near the edge, hit the rebound' },
    { name: 'AIR DASH EXTEND', steps: ['air2', 'air'], how: 'air J J, double-tap, J again' },
    { name: 'AERIAL KAMEHAMEHA', steps: ['air', 'beam'], how: 'air hit, then U' },
    { name: 'SAIYAN SKY BLAST', steps: ['launch', 'air', 'air2', 'beam'], how: 'launcher, W, J J, then U' },
    { name: 'KAIOKEN ASSAULT', steps: ['rush', 'rush2', 'rush3'], how: 'in the Kaioken (E): toward + J' },
    { name: 'BLINDSIDE', steps: ['flare', 'melee', 'melee'], how: 'G blinds them (base or Kaioken), then hit twice' },
    { name: 'DISC CANCEL', steps: ['melee', 'disc'], how: 'land a hit, then Y (base or Kaioken)' },
    { name: 'DRAGON RUSH CHASE', steps: ['grab', 'air'], how: 'J+K (or F) through a block, W, J' },
    { name: 'COUNTER STRIKE', steps: ['counter', 'melee', 'melee'], how: 'hit them as they attack, keep going' },
    { name: 'KI BLAST RUSH', steps: ['kiBall', 'rush'], how: 'L hits, then J to rush in after it' },
    { name: 'AERIAL KI RELAY', steps: ['air', 'kiBall', 'air'], how: 'air hit, L, double-tap, J' },
    { name: 'SPIRIT BOMB FINISH', steps: ['melee', 'spirit'], how: 'land a hit, then O at full ki (base)' },
    { name: 'SKY SPIRIT BOMB', steps: ['launch', 'air', 'spirit'], how: 'launcher, W, J, then O at full ki (base)' },
    { name: 'DUNK SHOT', steps: ['spike', 'bounce', 'melee'], how: 'air S + J (dunk), then hit the bounce' },
    { name: 'RELAUNCH', steps: ['air', 'airLaunch', 'air'], how: 'air hit, F to send them up again, J' },
  ],
  cell: [
    { name: 'NIGHTMARE STRING', steps: ['p1', 'p2', 'k2'], how: 'J J K' },
    { name: 'GRAVE DIGGER', steps: ['p3', 'bounce', 'air'], how: 'J J J (slam), W, then J in the air' },
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
    { name: 'DUNK SHOT', steps: ['spike', 'bounce', 'melee'], how: 'air S + J (dunk), then hit the bounce' },
    { name: 'RELAUNCH', steps: ['air', 'airLaunch', 'air'], how: 'air hit, F to send them up again, J' },
  ],
};
const MELEE = ['p1', 'p2', 'p3', 'p4', 'k1', 'k2', 'k3', 'rush', 'rush2', 'rush3', 'grab', 'slash', 'air', 'air2', 'spike', 'airLaunch'];

// Move list shown in the pause menu and from the select screen: [input, what it does]
const MOVES = {
  goku: [
    ['J  /  K', 'Punch / kick, chain: J J J J or K K K'],
    ['J J J J  /  K K K', 'Ends in a launcher: W to chase them up'],
    ['TOWARD + J  /  K', 'Rush punch / heavy slash (wall bounce)'],
    ['J + K  /  F', 'Dragon Rush (15 ki): grab through a block, 3 hits, launches (then W)'],
    ['AIR: J J J', 'Air string, ends in a meteor spike'],
    ['AFTER A HIT', 'Cancel into L, U, Q or a dash'],
    ['AIR HIT + U  /  DASH', 'Kamehameha, or air dash and J again'],
    ['L', 'Ki blast (8 ki, air too)'],
    ['HOLD L', 'Bigger ki blast: up to 20 damage, knocks down (20 ki)'],
    ['TOWARD + L', 'Ki barrage: four blasts, left-right (15 ki)'],
    ['AFTER L HITS', 'J rushes in, or cancel into a dash, Q, U, L'],
    ['DOUBLE-TAP A / D', 'Dash, once in the air too'],
    ['Q', 'Vanish to their other side (15 ki, air too)'],
    ['S', 'Block (in the air too). Tap as a hit lands: PERFECT'],
    ['S + J IN THE AIR', 'Dunk: slam them down, they bounce off the ring'],
    ['F IN THE AIR', 'Re-launch a juggled enemy (once per combo)'],
    ['HOLD I', 'Charge ki'],
    ['U', 'Kamehameha (50 ki, air too): stronger each form'],
    ['G', 'Solar Flare (20 ki): blinds them if they are looking at you'],
    ['Y', 'Destructo Disc (30 ki): cuts through a guard'],
    ['E', 'Kaioken (25 ki): fastest form, burns ki, E ends it'],
    ['KAIOKEN: O (50 KI)', 'Dash in: if it lands, rush, kick them up, Kamehameha'],
    ['KAIOKEN: O AFTER A HIT', 'Straight into the finish (air, or off a ground bounce, too)'],
    ['KAIOKEN: O IN THE AIR', 'The dash dives down at them'],
    ['KAIOKEN: DOUBLE-TAP', 'Two air dashes a jump instead of one'],
    ['T', 'Super Saiyan (full ki): hits hardest'],
    ['Q THEN U  /  U THEN Q', 'Instant Kamehameha (SSJ, full gi, full ki)'],
    ['O', 'Spirit Bomb (base, full ki) / Dragon Fist (SSJ)'],
    ['O IN THE AIR (BASE)', 'Spirit Bomb that turns him Super Saiyan if it lands'],
    ['O (SSJ, GI TORN)', 'Dash in: if it lands, his full-power Kamehameha (hits harder)'],
    ['O IN THE AIR (SSJ)', 'Power down mid-air: a bigger Spirit Bomb (full ki)'],
    ['T  (AS SSJ)', 'Power down to base, keeping your ki'],
  ],
  cell: [
    ['J  /  K', 'Punch / kick, chain: J J J, J J K or K K'],
    ['J J J', 'Ends in a slam: they bounce up, W to follow'],
    ['J J K  /  K K', 'Ends in a launcher: W to chase them up'],
    ['TOWARD + J  /  K', 'Rush punch / heavy slash (wall bounce)'],
    ['J + K  /  F', 'Absorb: grab through a block, heals you'],
    ['AIR: J J J', 'Air string, ends in a meteor spike'],
    ['AFTER A HIT', 'Cancel into L, U, Q, E or a dash'],
    ['AIR HIT + U  /  DASH', 'Death Beam / Kamehameha, or dash and J'],
    ['L', 'Finger beam (8 ki, air too)'],
    ['HOLD L', 'Bigger Death Beam: up to 24 damage, knocks down'],
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
    ['U', 'Kamehameha (50 ki); TOWARD + U: Death Beam (20 ki)'],
    ['Y', 'Special Beam Cannon: pierces guards (35 ki)'],
    ['O  (AIR, AFTER A HIT TOO)', 'Solar Kamehameha finisher (Perfect, full ki)'],
  ],
};
// ---- names for keys and buttons ----
// Everything on screen that names a key is built from the current bindings (game/input.js, which the
// player can change in OPTIONS > KEYS & BUTTONS), so tips always match what the buttons do.
const KEY_NAMES = {
  Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT',
  Enter: 'ENTER', NumpadEnter: 'ENTER', Escape: 'ESC', Backspace: 'BACKSPACE', Tab: 'TAB', CapsLock: 'CAPS',
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Minus: '-', Equal: '=', Backquote: '`',
};
const keyName = code => KEY_NAMES[code] || code.replace(/^(Key|Digit|Numpad)/, '').toUpperCase();
// standard-mapping gamepad buttons by number, on each kind of pad
const PAD_BUTTONS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'LS', 'RS', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME', 'SHARE'],
  ps: ['\u2715', '\u25cb', '\u25a1', '\u25b3', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'PS', 'TOUCHPAD'],
};
const padButtonName = (i, style = padStyle) => (PAD_BUTTONS[style] || PAD_BUTTONS.xbox)[i] || 'BUTTON ' + i;
// Cell's specials on a gamepad: guard + this button (they have no button of their own)
const PAD_CHORD_BASE = { barrier: 'ki', junior: 'kick', cannon: 'beam' };
const isPad = device => device === 'xbox' || device === 'ps';
function padActionName(a, style = padStyle) {
  if (a === 'grab') return padActionName('punch', style) + '+' + padActionName('kick', style);
  if (PAD_CHORD_BASE[a]) return padActionName('block', style) + '+' + padActionName(PAD_CHORD_BASE[a], style);
  if (a === 'left' || a === 'right') return 'STICK';
  const b = PAD_BINDINGS[a];
  return b && b.length ? padButtonName(b[0], style) : '-';
}
// the keys a player's tips are written with: player 1's, player 2's on a shared keyboard, and online
// the friend's own keyboard (whose remapping this computer can't see, so the usual keys)
const keyTable = c => c === P2 ? (window.Net && Net.role === 'host' ? DEFAULTS.p1 : P2_BINDINGS) : BINDINGS;
function actionLabel(a, c = P1) {
  if (isPad(c.device)) return padActionName(a, c.device);
  if (a === 'confirm') return 'ENTER';
  if (a === 'back') return 'ESC';
  const t = keyTable(c);
  return t[a] && t[a].length ? keyName(t[a][0]) : '-';
}
// Tips are written with the usual keyboard keys; promptKeys rewrites each key as the action it does
// and then that player's key or button for it (one pass, so a name it puts in isn't read again).
// "W / S" in menus is the fixed menu up / down; "A / D" is moving.
const KEY_ACTIONS = {
  J: 'punch', K: 'kick', L: 'ki', U: 'beam', O: 'ult', I: 'charge', T: 'transform', Q: 'vanish', S: 'block', W: 'jump',
  F: 'grab', P: 'pause', G: 'barrier', E: 'junior', Y: 'cannon',
  ENTER: 'confirm', ESC: 'back', SPACE: 'jump', SHIFT: 'dash',
};
function promptKeys(str, c = P1) {
  const pad = isPad(c.device);
  return str.replace(/\bW\s*\/\s*S\b|\bA\s*\/\s*D\b|\b(?:ENTER|ESC|SPACE|SHIFT)\b|\b[JKLUOITQSWFPGEY]\b/g, k => {
    if (/^W\s*\/\s*S$/.test(k)) return pad ? 'D-PAD' : k;
    if (/^A\s*\/\s*D$/.test(k)) return pad ? 'STICK' : actionLabel('left', c) + ' / ' + actionLabel('right', c);
    return actionLabel(KEY_ACTIONS[k], c);
  });
}
// the controls page and the versus screen, from the current keys and buttons
const CONTROL_GROUPS = [
  ['MOVE', ['left', 'right']], ['JUMP', ['jump']], ['BLOCK', ['block']], ['PUNCH / KICK', ['punch', 'kick']],
  ['GRAB / AIR RE-LAUNCH', ['grab']], ['SPECIALS 1 / 2 / 3', ['barrier', 'junior', 'cannon']], ['KI ATTACK', ['ki']],
  ['BEAM / ULTIMATE', ['beam', 'ult']], ['CHARGE / TRANSFORM', ['charge', 'transform']], ['DASH / VANISH', ['dash', 'vanish']], ['PAUSE', ['pause']],
];
const keysOf = (table, acts) => acts.map(a => table[a] && table[a].length ? keyName(table[a][0]) : '-').join(' / ');
const controlRows = () => [
  ...CONTROL_GROUPS.map(([name, acts]) => [name, keysOf(BINDINGS, acts), acts[0] === 'left' ? 'STICK / D-PAD' : acts.map(a => padActionName(a)).join(' / ')]),
  ['MUSIC / CALM / FPS', 'M / R / F2', ''],
  ['COMBO LIST (TRAINING)', 'H', ''],
];
const versusRows = () => CONTROL_GROUPS.filter(([n]) => n !== 'PAUSE').map(([name, acts]) => [name, keysOf(BINDINGS, acts), keysOf(P2_BINDINGS, acts)]);
const ACTION_NAMES = {
  left: 'MOVE LEFT', right: 'MOVE RIGHT', jump: 'JUMP', block: 'BLOCK', punch: 'PUNCH', kick: 'KICK', grab: 'GRAB',
  ki: 'KI ATTACK', beam: 'BEAM', ult: 'ULTIMATE', charge: 'CHARGE', transform: 'TRANSFORM', vanish: 'VANISH', dash: 'DASH',
  barrier: 'SOLAR FLARE / BARRIER', junior: 'KAIOKEN / CELL JUNIOR', cannon: 'DISC / BEAM CANNON', pause: 'PAUSE',
};
