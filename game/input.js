// ---------- input ----------
// Gameplay reads named actions, never raw keys. Keyboard bindings are physical key positions
// (e.code), so WASD stays in place on AZERTY/QWERTZ, and a gamepad maps onto the same actions.
const BINDINGS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'Space', 'ArrowUp'],
  block: ['KeyS', 'ArrowDown'], punch: ['KeyJ'], kick: ['KeyK'], grab: ['KeyF'], ki: ['KeyL'], beam: ['KeyU'],
  ult: ['KeyO'], cannon: ['KeyY'], charge: ['KeyI'], vanish: ['KeyQ'], barrier: ['KeyG'], junior: ['KeyE'], transform: ['KeyT'], dash: ['ShiftLeft', 'ShiftRight'],
  // menus move with their own up / down, so the button that picks an item (A / Cross, also jump)
  // never moves the cursor first
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  pause: ['KeyP'], confirm: ['Enter', 'NumpadEnter'], back: ['Escape'], music: ['KeyM'], calm: ['KeyR'], fps: ['F2'],
};
// standard-mapping gamepad buttons (A B X Y = 0 1 2 3, LB RB = 4 5, LT RT = 6 7, Back Start = 8 9,
// stick clicks = 10 11, d-pad = 12-15)
const PAD_BINDINGS = {
  jump: [0, 12], confirm: [0, 9], back: [1, 8], ki: [1], punch: [2], kick: [3], block: [4, 13], dash: [5],
  charge: [6], beam: [7], vanish: [8], pause: [9], transform: [10], ult: [11], left: [14], right: [15], up: [12], down: [13],
};
// Versus (two players on one keyboard): player 1 keeps the letters on the left, player 2 gets the arrows
// and the keys around Enter, and the arrows, Space and right Shift stop counting for player 1.
const P2_BINDINGS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], block: ['ArrowDown'],
  punch: ['Comma'], kick: ['Period'], ki: ['Slash'], beam: ['Semicolon'], ult: ['Quote'],
  charge: ['BracketLeft'], transform: ['BracketRight'], vanish: ['Backslash'], dash: ['ShiftRight'],
  grab: ['Minus'], barrier: ['Equal'], junior: ['Digit0'], cannon: ['Digit9'],
};
const P2_ONLY = new Set(Object.values(P2_BINDINGS).flat());
const codeMap = table => { const m = {}; for (const [a, codes] of Object.entries(table)) for (const c of codes) (m[c] = m[c] || []).push(a); return m; };
const CODE_ACTIONS = codeMap(BINDINGS), P2_CODE_ACTIONS = codeMap(P2_BINDINGS);
// synthetic events (and some old browsers) carry no e.code: fall back to the key's name
const codeOf = e => e.code || { ' ': 'Space', enter: 'Enter', escape: 'Escape', shift: 'ShiftLeft', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' }[e.key.toLowerCase()] || 'Key' + e.key.toUpperCase();

// A controller is one player's input: actions held, pressed this frame, the input buffer and the
// double-tap dash. The input code below works on the current one (keys, pressed...); in versus the
// game switches to player 2's controller while it reads player 2 (withController).
// Double-tap a direction = dash. Detected as the keys are pressed (not once per frame), so two taps
// during a hit-freeze still count; the request then waits in the input buffer like any other press.
const makeController = () => ({ keys: {}, pressed: new Set(), lastPress: {}, kbHeld: {}, padHeld: {}, lastTap: { dir: 0, t: -1 }, dashReq: null });
const P1 = makeController(), P2 = makeController();
let keys, pressed, lastPress, kbHeld, padHeld, lastTap, dashReq, ctl;
function useController(c) {
  if (ctl) ctl.dashReq = dashReq;
  ctl = c; ({ keys, pressed, lastPress, kbHeld, padHeld, lastTap } = c); dashReq = c.dashReq;
}
function withController(c, fn) {
  const prev = ctl; useController(c);
  try { return fn(); } finally { useController(prev); }
}
useController(P1);
function setHeld(src, action, down) {
  if (down && !kbHeld[action] && !padHeld[action]) {
    pressed.add(action); lastPress[action] = game ? game.ct : 0;
    if (game && (action === 'left' || action === 'right')) {
      const d = action === 'right' ? 1 : -1;
      if (lastTap.dir === d && game.ct - lastTap.t < 0.25) { dashReq = { dir: d, t: game.ct }; lastTap.dir = 0; }
      else Object.assign(lastTap, { dir: d, t: game.ct });
    }
  }
  src[action] = down;
  keys[action] = !!(kbHeld[action] || padHeld[action]);
}
// which player a key belongs to, and its actions
function route(code) {
  // online, the other player is on another computer: this keyboard is all player 1's
  if (game && game.versus && !(window.Net && Net.role === 'host')) {
    if (P2_CODE_ACTIONS[code]) return [P2, P2_CODE_ACTIONS[code]];
    if (P2_ONLY.has(code) || code === 'Space') return [P1, null];
  }
  return [P1, CODE_ACTIONS[code]];
}
// online guest: the keys go to the host (as player 2) instead of moving anything on this screen
function guestKey(e, down) {
  if (!window.Net || !(Net.role === 'guest' || Net.lobbyOpen)) return false;
  if (Net.role !== 'guest') return true; // the lobby is open: keys are for it, not the game
  const acts = CODE_ACTIONS[codeOf(e)];
  if (acts) { e.preventDefault(); if (!e.repeat) Net.sendKey(acts, down); }
  return true;
}
addEventListener('keydown', e => {
  if (guestKey(e, true)) return;
  const [c, acts] = route(codeOf(e));
  if (!acts) return;
  e.preventDefault();
  if (!e.repeat) withController(c, () => acts.forEach(a => setHeld(c.kbHeld, a, true)));
});
addEventListener('keyup', e => { if (guestKey(e, false)) return; const [c, acts] = route(codeOf(e)); if (acts) withController(c, () => acts.forEach(a => setHeld(c.kbHeld, a, false))); });
// switching windows swallows keyup events, which would leave a key held forever
addEventListener('blur', () => { for (const c of [P1, P2]) withController(c, () => { for (const a in c.kbHeld) setHeld(c.kbHeld, a, false); }); });
// one gamepad drives player 1; in versus a single gamepad is player 2's (player 1 has the keyboard),
// and with two, the first is player 1's and the second player 2's
// which kind of gamepad player 1 holds, for the button names on the controls page
let padStyle = 'xbox';
function pollGamepad() {
  const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(p => p && p.connected);
  if (pads.length) padStyle = /054c|dualshock|dualsense|playstation|wireless controller/i.test(pads[0].id) ? 'ps' : 'xbox';
  const driven = new Map();
  if (game && game.versus && !(window.Net && Net.role === 'host')) {
    if (pads.length === 1) driven.set(P2, pads[0]);
    else if (pads.length > 1) { driven.set(P1, pads[0]); driven.set(P2, pads[1]); }
  } else if (pads.length) driven.set(P1, pads[0]);
  for (const c of [P1, P2]) withController(c, () => {
    if (driven.has(c)) readPad(driven.get(c));
    // no gamepad for this player now (unplugged, flat, or handed over): let go of what it held
    else for (const a in c.padHeld) if (c.padHeld[a]) setHeld(c.padHeld, a, false);
  });
}
function readPad(pad) {
  const btn = i => pad.buttons[i] && pad.buttons[i].pressed;
  const x = pad.axes[0] || 0, y = pad.axes[1] || 0, stick = Math.hypot(x, y) > 0.35; // radial deadzone
  for (const [a, list] of Object.entries(PAD_BINDINGS)) {
    let down = list.some(btn);
    if (a === 'left') down = down || (stick && x < -0.5);
    if (a === 'right') down = down || (stick && x > 0.5);
    if (a === 'block') down = down || (stick && y > 0.6);
    if (a === 'jump' || a === 'up') down = down || (stick && y < -0.6); // the stick up jumps, like the d-pad
    if (a === 'down') down = down || (stick && y > 0.6);
    setHeld(padHeld, a, down);
  }
}
const tap = a => pressed.has(a);
// input buffer: a press up to 0.12s before the fighter can act still goes through, once
const BUFFER = 0.12;
// (ages on the control clock, which stops during hit-freeze, so a press made in a freeze isn't lost)
function act(a) {
  const age = game.ct - lastPress[a];
  if (!(age >= 0 && age <= BUFFER)) return false;
  lastPress[a] = -99; return true;
}
// Punch + kick together is the grab (F), and in the air the re-launch. On a gamepad the two buttons
// rarely land in the same frame, so a punch or kick pressed on its own this very moment waits one
// frame for the other before it counts as a plain hit
function pairPending() {
  const fresh = k => { const age = game.ct - lastPress[k]; return age >= 0 && age < 0.018; };
  return fresh('punch') !== fresh('kick');
}
// two buttons pressed together (both still in the buffer)
function chord(a, b) {
  const fresh = k => { const age = game.ct - lastPress[k]; return age >= 0 && age <= BUFFER; };
  if (!fresh(a) || !fresh(b)) return false;
  lastPress[a] = lastPress[b] = -99; return true;
}
