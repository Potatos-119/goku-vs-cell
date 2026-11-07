// Goku vs Cell. Pick a side on the select screen; the other fighter becomes the boss, with
// three phases and an AI. The world is 320x180 and is drawn at 4x.
const W = 320, H = 180, FLOOR = 162, GRAV = 1300, JUMP_V = -400;
const PLAYER_HP = 100, BOSS_HP = 300;
// Perfect Cell's own health bar once he completes himself (see bossPhase)
const PERFECT_HP = 200;
// the world is 320x180, drawn as SVG (gfx.js) at 4x: one world pixel is 4 units of the drawing, which
// the browser scales to the window. SVG stays sharp at any size, so S doesn't depend on the screen.
const S = 4;
const gfx = new Gfx(document.getElementById('game'), W * S, H * S);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sfx = Audio8.sfx;
const art = a => Sheets.frame(a.sheet, a.ref);
