// ---------- online ----------
// Two players on two computers, joined by a room code. The host's browser runs the fight: the host is
// player 1, and the guest's keys come over the connection as player 2's. The guest's browser runs no
// game at all: it shows the host's screen, replaying what the host's renderer changed each frame
// (Gfx.log, applied by GfxMirror), and plays the sounds the host played.
//
// The connection is browser to browser (WebRTC), set up through PeerJS and its free public server,
// which only introduces the two players; the game itself never goes through a server. PeerJS is
// loaded only when someone opens the online menu.
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ROOM_PREFIX = 'goku-vs-cell-room-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to mix up
// Online the guest's screen must stay close to live. When the link can't keep up, frames wait here
// instead of piling up in the connection (which turns into seconds of delay): past SEND_BACKLOG
// waiting to go out, frames are merged, and past MAX_MERGED changes it's quicker to send one fresh
// full picture than all the old ones.
const SEND_BACKLOG = 48 * 1024, MAX_MERGED = 8000;
// How browsers find each other: STUN servers tell each one its public address; when no direct path
// exists (some home routers and mobile networks), the TURN relay carries the match instead. These are
// PeerJS's own free servers plus a few more public STUN servers.
const PEER_OPTIONS = { config: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
] } };
const CONNECT_TIMEOUT = 20000; // give up on a connection that hasn't opened after this long
const NET_FAIL = 'Couldn\'t connect to your friend\'s game. Usually a network blocks the direct link (mobile hotspots, school or office Wi-Fi). Try again, try another network, or both join the same Wi-Fi.';
// what a connection is doing right now (its ICE state), in words
function iceState(conn) { const pc = conn && conn.peerConnection; return pc ? pc.iceConnectionState : 'new'; }

const Net = {
  role: null,        // 'host' or 'guest' while connected
  peer: null, conn: null, side: 'goku',
  audio: [],         // sounds the host played since the last send
  mirror: null,      // the guest's copy of the host's screen
  pad: {},           // the guest's gamepad buttons last sent

  // ---- lobby ----
  async open(side) {
    this.side = side;
    this.panel = this.panel || buildLobby();
    this.panel.hidden = false; this.show('choose');
    try { await loadPeerJs(); } catch (e) { this.show('error', 'Could not load the online library. Check your connection.'); }
  },
  close() { if (this.panel) this.panel.hidden = true; if (!this.role) this.drop(); },
  get lobbyOpen() { return !!(this.panel && !this.panel.hidden); },
  show(view, text) {
    const p = this.panel;
    for (const el of p.querySelectorAll('[data-view]')) el.hidden = el.dataset.view !== view;
    p.querySelector('.who').textContent = `You play ${this.side.toUpperCase()}. Your friend plays ${this.side === 'goku' ? 'CELL' : 'GOKU'}.`;
    if (text != null) p.querySelector(`[data-view="${view}"] .msg`).textContent = text;
  },

  // ---- host ----
  host(tries = 0) {
    if (!window.Peer) return this.show('error', 'The online library isn\'t loaded yet. Try again in a moment.');
    this.drop();
    const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    this.show('wait', 'Setting up a room...');
    const peer = this.peer = new Peer(ROOM_PREFIX + code, PEER_OPTIONS);
    peer.on('open', () => { this.panel.querySelector('.code').textContent = code; this.show('wait', 'Waiting for your friend to join...'); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5) return this.host(tries + 1); // that code is taken: another one
      this.show('error', 'Could not create a room (' + e.type + ').');
    });
    peer.on('connection', conn => {
      if (this.conn) { conn.on('open', () => conn.close()); return; } // the room is full
      this.conn = conn;
      this.show('wait', 'Your friend found the room. Connecting...');
      // a friend whose connection never opens mustn't keep the room full: let them (or anyone) try again
      setTimeout(() => {
        if (this.conn === conn && !conn.open) {
          this.conn = null; try { conn.close(); } catch (e) { /* never opened */ }
          this.show('wait', 'Your friend couldn\'t get through. The room is still open: they can try again, or one of you can try another network.');
        }
      }, CONNECT_TIMEOUT);
      conn.on('open', () => this.startHosting());
      conn.on('data', msg => this.fromGuest(msg));
      conn.on('close', () => this.lost('Player 2 left the match.'));
    });
  },
  startHosting() {
    this.role = 'host'; this.panel.hidden = true;
    gfx.log = []; gfx.resync(); // the guest needs the whole picture once, then only the changes
    game.menu = []; startVersus(this.side);
  },
  // the guest's keys and buttons, as player 2's
  fromGuest(msg) {
    if (msg && msg.q) { this.ping = Math.round(performance.now() - msg.q); return; } // a ping came back
    if (!msg || !msg.k) return;
    const [actions, down] = msg.k;
    if (msg.d) P2.device = msg.d; // the friend's keyboard or gamepad, for the tips on their side
    withController(P2, () => { for (const a of actions) if (a in P2_BINDINGS) setHeld(P2.kbHeld, a, down); });
  },
  // after each drawn frame: send what changed, and the sounds
  flush() {
    const c = this.conn;
    if (this.role !== 'host' || !c || !c.open) return;
    const dc = c.dataChannel;
    // once a second, a ping: the guest answers it, and the time it takes shows how the link is doing
    const now = performance.now();
    if (now - (this.pingAt || 0) > 1000) { this.pingAt = now; try { c.send({ p: now }); } catch (e) { /* closing */ } }
    if (dc && dc.bufferedAmount > SEND_BACKLOG) {
      // the link is behind: keep merging, but not forever (sounds this late are dropped too)
      if (gfx.log.length > MAX_MERGED) { gfx.log = []; gfx.resync(); this.audio = []; }
      return;
    }
    if (!gfx.log.length && !this.audio.length) return;
    c.send({ l: gfx.log, a: this.audio });
    gfx.log = []; this.audio = [];
  },

  // ---- guest ----
  join(code) {
    if (!window.Peer) return this.show('error', 'The online library isn\'t loaded yet. Try again in a moment.');
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) return this.show('choose', 'A room code is 4 letters and numbers.');
    this.drop();
    this.show('wait', 'Contacting the game server...');
    this.panel.querySelector('.code').textContent = code;
    const peer = this.peer = new Peer(PEER_OPTIONS);
    // say where it got to, and give up with a reason instead of waiting forever
    const started = Date.now(), watch = setInterval(() => {
      if (this.peer !== peer || this.role === 'guest') return clearInterval(watch);
      const state = iceState(this.conn);
      if (this.conn && state === 'checking') this.show('wait', 'Found the room. Connecting to your friend\'s game...');
      if (state === 'failed' || Date.now() - started > CONNECT_TIMEOUT) {
        clearInterval(watch);
        const where = !peer.open ? 'the game server didn\'t answer' : 'connection ' + state;
        this.drop(); this.show('error', NET_FAIL + ' (' + where + ')');
      }
    }, 500);
    peer.on('error', e => this.show('error', e.type === 'peer-unavailable' ? 'There\'s no room with that code.' : 'Could not join (' + e.type + ').'));
    peer.on('open', () => {
      this.show('wait', 'Looking for room ' + code + '...');
      const conn = this.conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
      conn.on('open', () => this.startWatching());
      conn.on('data', msg => this.fromHost(msg));
      conn.on('close', () => this.lost('The host left the match.'));
    });
  },
  startWatching() {
    this.role = 'guest'; this.panel.hidden = true; this.pad = {};
    Audio8.init();
    for (const c of [P1, P2]) withController(c, () => { for (const a in c.kbHeld) setHeld(c.kbHeld, a, false); });
    this.mirror = new GfxMirror(gfx);
  },
  fromHost(msg) {
    if (this.role !== 'guest' || !msg) return;
    if (msg.p) { try { this.conn.send({ q: msg.p }); } catch (e) { /* closing */ } return; } // answer the host's ping
    if (msg.l) this.mirror.apply(msg.l);
    for (const [path, args] of msg.a || []) playRemoteSound(path, args);
  },
  // the guest's own keys: sent to the host instead of moving anything here
  sendKey(actions, down) { if (this.conn && this.conn.open) this.conn.send({ k: [actions, down], d: this.device || 'kb' }); },
  pollPad() {
    const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
    if (!pad) return;
    const btn = i => pad.buttons[i] && pad.buttons[i].pressed;
    const x = pad.axes[0] || 0, y = pad.axes[1] || 0, stick = Math.hypot(x, y) > 0.35;
    for (const [a, list] of Object.entries(PAD_BINDINGS)) {
      let down = list.some(btn);
      if (a === 'left') down = down || (stick && x < -0.5);
      if (a === 'right') down = down || (stick && x > 0.5);
      if (a === 'block') down = down || (stick && y > 0.6);
      if (a === 'jump') down = down || (stick && y < -0.6);
      if (!!this.pad[a] !== down) {
        this.pad[a] = down;
        if (down) this.device = padKind(pad);
        if (a === 'pause') { if (down && !this.lobbyOpen) this.askLeave(); continue; } // Start / Options: leave?
        if (!this.lobbyOpen) this.sendKey([a], down);
      }
    }
  },

  // the guest asks to leave: a question over the host's picture
  askLeave() {
    if (this.role !== 'guest') return;
    for (const a of Object.keys(P2_BINDINGS)) this.sendKey([a], false); // let go of anything held over there
    this.panel.hidden = false; this.show('leave');
  },
  leave() {
    this.drop(); reset(); game.mode = 'title'; this.panel.hidden = true;
  },

  // ---- ending ----
  lost(text) {
    const was = this.role;
    this.drop();
    if (was === 'host') { quitToSelect(); popups.push({ text: 'PLAYER 2 LEFT', x: W / 2, y: 60, t: 0, c: '#ff8a6a' }); }
    if (was === 'guest') { reset(); game.mode = 'title'; }
    if (was) { this.panel.hidden = false; this.show('error', text); }
  },
  drop() {
    const { conn, peer } = this;
    if (this.mirror) { // a guest's screen goes back to its own drawing, and the host's sounds stop
      this.mirror.dispose();
      for (const f of Object.values(standIns)) { try { Audio8.sfx.stopSustain(f); Audio8.sfx.stopKame(f); } catch (e) { /* nothing playing */ } }
      Audio8.music.stop();
    }
    this.role = null; this.conn = null; this.peer = null; this.mirror = null; this.audio = []; this.ping = null;
    gfx.log = null;
    if (conn) { try { conn.close(); } catch (e) { /* already closed */ } }
    if (peer) { try { peer.destroy(); } catch (e) { /* already gone */ } }
    for (const c of [P1, P2]) withController(c, () => { for (const a in c.kbHeld) setHeld(c.kbHeld, a, false); });
  },
};
window.Net = Net;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL; s.onload = ok; s.onerror = () => fail(new Error('PeerJS failed to load'));
    document.head.append(s);
  });
}

// The lobby: a small HTML panel over the game (create a room, or type a friend's code)
function buildLobby() {
  const p = document.createElement('div');
  p.id = 'online'; p.hidden = true;
  p.innerHTML = `
    <div class="box">
      <h2>Play online</h2>
      <p class="who"></p>
      <div data-view="choose">
        <button class="create">Create a room</button>
        <p class="or">or join your friend's room</p>
        <form class="join"><input maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code"><button>Join</button></form>
        <p class="msg"></p>
      </div>
      <div data-view="wait">
        <p class="big code"></p>
        <p class="msg"></p>
        <p class="hint">Your friend opens the game, picks ONLINE and types this code.</p>
      </div>
      <div data-view="error"><p class="msg"></p><button class="again">Back</button></div>
      <div data-view="leave"><p class="msg">Leave this match?</p><button class="leave">Leave</button> <button class="stay">Keep playing</button></div>
      <button class="cancel">Close</button>
    </div>`;
  p.querySelector('.create').onclick = () => Net.host();
  p.querySelector('.join').onsubmit = e => { e.preventDefault(); Net.join(p.querySelector('input').value); };
  p.querySelector('.again').onclick = () => Net.show('choose', '');
  p.querySelector('.cancel').onclick = () => Net.close();
  p.querySelector('.leave').onclick = () => Net.leave();
  p.querySelector('.stay').onclick = () => { p.hidden = true; };
  p.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') Net.close(); });
  document.body.append(p);
  return p;
}

// ---- sounds over the wire ----
// Every sound effect and music change the host makes is also queued for the guest. A fighter passed
// to a sound goes as its name, and the guest gets a stand-in fighter with that name.
(function forwardAudio() {
  let depth = 0;
  const enc = v => v && typeof v === 'object' ? (v.who ? { f: v.who } : null) : v;
  const wrap = (obj, key, path) => {
    const fn = obj[key];
    if (typeof fn !== 'function') return;
    obj[key] = function (...args) {
      // only the outermost call is sent (a sound that plays another one would otherwise play twice)
      if (Net.role === 'host' && depth === 0) Net.audio.push([path, args.map(enc)]);
      depth++;
      try { return fn.apply(this, args); } finally { depth--; }
    };
  };
  for (const k of Object.keys(Audio8.sfx)) wrap(Audio8.sfx, k, 'sfx.' + k);
  for (const k of ['play', 'switchTo', 'stop', 'winner', 'defeat']) wrap(Audio8.music, k, 'music.' + k);
  // the low-health heartbeat is set every frame: only send it when it changes
  const beat = Audio8.heartbeat; let lastBeat = null;
  Audio8.heartbeat = on => { if (Net.role === 'host' && on !== lastBeat) { lastBeat = on; Net.audio.push(['heartbeat', [on]]); } return beat(on); };
})();
const standIns = {};
function playRemoteSound(path, args) {
  const dec = v => v && typeof v === 'object' && v.f ? (standIns[v.f] = standIns[v.f] || { who: v.f }) : v;
  const [group, key] = path.split('.');
  const fn = key ? Audio8[group === 'sfx' ? 'sfx' : 'music'][key] : Audio8[group];
  if (typeof fn === 'function') { try { fn(...args.map(dec)); } catch (e) { /* a sound that can't play here */ } }
}
