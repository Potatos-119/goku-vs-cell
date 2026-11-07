// ---------- input ----------
// Gameplay reads named actions, never raw keys. Keyboard bindings are physical key positions
// (e.code), so WASD stays in place on AZERTY/QWERTZ, and a gamepad maps onto the same actions.
const BINDINGS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'Space', 'ArrowUp'],
  block: ['KeyS', 'ArrowDown'], punch: ['KeyJ'], kick: ['KeyK'], grab: ['KeyF'], ki: ['KeyL'], beam: ['KeyU'],
  ult: ['KeyO'], cannon: ['KeyY'], charge: ['KeyI'], vanish: ['KeyQ'], barrier: ['KeyG'], junior: ['KeyE'], transform: ['KeyT'], dash: ['ShiftLeft', 'ShiftRight'],
  pause: ['KeyP'], confirm: ['Enter', 'NumpadEnter'], back: ['Escape'], music: ['KeyM'], calm: ['KeyR'],
};
// standard-mapping gamepad buttons (A B X Y = 0 1 2 3, LB RB = 4 5, LT RT = 6 7, Back Start = 8 9,
// stick clicks = 10 11, d-pad = 12-15)
const PAD_BINDINGS = {
  jump: [0, 12], confirm: [0, 9], back: [1, 8], ki: [1], punch: [2], kick: [3], block: [4, 13], dash: [5],
  charge: [6], beam: [7], vanish: [8], pause: [9], transform: [10], ult: [11], left: [14], right: [15],
};
const CODE_ACTIONS = {};
for (const [a, codes] of Object.entries(BINDINGS)) for (const c of codes) (CODE_ACTIONS[c] = CODE_ACTIONS[c] || []).push(a);
// synthetic events (and some old browsers) carry no e.code: fall back to the key's name
const codeOf = e => e.code || { ' ': 'Space', enter: 'Enter', escape: 'Escape', shift: 'ShiftLeft', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown' }[e.key.toLowerCase()] || 'Key' + e.key.toUpperCase();

const keys = {}, pressed = new Set(), lastPress = {}, kbHeld = {}, padHeld = {};
// double-tap a direction = dash. Detected as the keys are pressed (not once per frame), so two taps
// during a hit-freeze still count; the request then waits in the input buffer like any other press.
const lastTap = { dir: 0, t: -1 };
let dashReq = null;
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
addEventListener('keydown', e => {
  const acts = CODE_ACTIONS[codeOf(e)];
  if (!acts) return;
  e.preventDefault();
  if (!e.repeat) acts.forEach(a => setHeld(kbHeld, a, true));
});
addEventListener('keyup', e => (CODE_ACTIONS[codeOf(e)] || []).forEach(a => setHeld(kbHeld, a, false)));
// switching windows swallows keyup events, which would leave a key held forever
addEventListener('blur', () => { for (const a in kbHeld) setHeld(kbHeld, a, false); });
function pollGamepad() {
  const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
  if (!pad) return;
  const btn = i => pad.buttons[i] && pad.buttons[i].pressed;
  const x = pad.axes[0] || 0, y = pad.axes[1] || 0, stick = Math.hypot(x, y) > 0.35; // radial deadzone
  for (const [a, list] of Object.entries(PAD_BINDINGS)) {
    let down = list.some(btn);
    if (a === 'left') down = down || (stick && x < -0.5);
    if (a === 'right') down = down || (stick && x > 0.5);
    if (a === 'block') down = down || (stick && y > 0.6);
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
// two buttons pressed together (both still in the buffer)
function chord(a, b) {
  const fresh = k => { const age = game.ct - lastPress[k]; return age >= 0 && age <= BUFFER; };
  if (!fresh(a) || !fresh(b)) return false;
  lastPress[a] = lastPress[b] = -99; return true;
}
