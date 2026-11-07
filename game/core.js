// Goku vs Cell. Pick a side on the select screen; the other fighter becomes the boss, with
// three phases and an AI. The world is 320x180 and is drawn at 4x.
const W = 320, H = 180, FLOOR = 162, GRAV = 1300, JUMP_V = -400;
const PLAYER_HP = 100, BOSS_HP = 300;
// Perfect Cell's own health bar once he completes himself (see bossPhase)
const PERFECT_HP = 200;
const canvas = document.getElementById('game');
// the world is 320x180; draw it 4x, or 8x on big/retina screens so the arena art and text stay
// sharp instead of being stretched (a multiple of 4 keeps S x zoom whole, so pixel art stays crisp)
const S = screen.width * (window.devicePixelRatio || 1) > 1900 ? 8 : 4;
canvas.width = W * S; canvas.height = H * S;
const ctx = canvas.getContext('2d');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sfx = Audio8.sfx;
const art = a => Sheets.frame(a.sheet, a.ref);
