// The Cell Games arena: the background art in assets/img (the painted version below stands in
// until it has loaded, or if it can't). On top of it run the live bits: drifting dust, a news
// helicopter, rocks lifted by power-ups and the cracks fighters leave in the ring.
const Stage = (() => {
  const W = 320, H = 180, S = 4, HORIZON = 110, RING = 128, FLOOR = 162;
  let decals = [], dust = [], debris = [], heliX = -30, clock = 0;
  let chunks = [], rings = [], shadows = [], birds = { x: -60, y: 30, t: 9 }, gusts = [];
  // environment impact: billowing dust, distant explosions on the mountains, wind streaks
  let clouds = [], blasts = [], winds = [];
  // The weather follows the fight: a storm rolls in for its last stretch (setStorm, called by the game
  // each frame). storm eases between 0 (clear) and 1; with it come a darker sky, heavy clouds along the
  // top, rain, and lightning that lights the whole arena for an instant.
  let storm = 0, stormTo = 0, storming = [], rain = [], bolt = null, boltIn = 2, glare = 0;
  // quick: a surge for a big moment (a transformation, a beam clash, a finisher) comes in fast
  let stormRate = 0.9;
  const setStorm = (on, quick = false) => { stormTo = on ? 1 : 0; stormRate = quick ? 5 : 0.9; };
  function strike() {
    // a jagged line from the clouds down to the hills, with a short branch
    let x = 30 + rnd() * (W - 60), y = 14;
    const pts = [[x, y]], branch = [];
    while (y < FAR - 4) { x += (rnd() - 0.5) * 18; y += 6 + rnd() * 10; pts.push([x, Math.min(y, FAR)]); if (!branch.length && rnd() < 0.3) branch.push([x, y], [x + (rnd() - 0.5) * 30, y + 14], [x + (rnd() - 0.5) * 44, y + 26]); }
    bolt = { pts, branch, t: 0 }; glare = 1;
  }
  const FAR = 104; // where the mountains meet the plain, for blasts on the horizon
  // two arenas. 'day' is the sharp, upscaled ring (assets/img/arena.jpg: the art with its sky
  // extended, so it is drawn from the top of the view, 340 wide and centred, which puts the
  // middle of the tiles on the floor line). 'classic' is the earlier painting, placed by its horizon.
  const ARENAS = {
    day: { src: 'assets/img/arena.jpg', x: -10, w: 340, top: () => 0 },
    classic: { src: 'assets/img/cell-games.webp', x: 0, w: W, top: h => 116 - 0.61 * h },
  };
  const photos = {};
  for (const k in ARENAS) { photos[k] = new Image(); photos[k].src = ARENAS[k].src; }
  let arena = 'day';
  try { if (ARENAS[localStorage.getItem('arena')]) arena = localStorage.getItem('arena'); } catch (e) { /* storage blocked */ }
  function setArena(name) {
    arena = name;
    try { localStorage.setItem('arena', name); } catch (e) { /* not saved, still works */ }
  }

  // seeded random so the scenery looks the same every time
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function cloud(c, x, y, s) {
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx, dy, r] of [[0, 0, 9], [9, 2, 7], [-9, 3, 6], [16, 5, 5], [-15, 6, 4], [4, 5, 7]]) {
      c.beginPath(); c.ellipse(x + dx * s, y + dy * s, r * s * 1.3, r * s * 0.7, 0, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(150,170,200,0.25)';
    c.beginPath(); c.ellipse(x + 2 * s, y + 7 * s, 20 * s, 3 * s, 0, 0, Math.PI * 2); c.fill();
  }

  // flat-topped buttes like the wasteland around the Cell Games
  function mesa(c, x, base, w, h, lit, shade, strata) {
    const top = base - h, l = x + w * 0.07, r = x + w * 0.93;
    const g = c.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, lit); g.addColorStop(1, shade);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x, base); c.lineTo(l, top); c.lineTo(r, top); c.lineTo(x + w, base); c.closePath(); c.fill();
    // shadowed right face
    c.fillStyle = 'rgba(40,20,30,0.22)';
    c.beginPath(); c.moveTo(x + w * 0.62, top); c.lineTo(r, top); c.lineTo(x + w, base); c.lineTo(x + w * 0.7, base); c.closePath(); c.fill();
    // rock layers
    c.strokeStyle = strata; c.lineWidth = 0.5;
    for (let y = top + 3; y < base; y += 3 + rnd() * 3) {
      const k = (y - top) / h;
      c.beginPath(); c.moveTo(l - (l - x) * k + 1, y); c.lineTo(r + (x + w - r) * k - 1, y + (rnd() - 0.5)); c.stroke();
    }
    c.fillStyle = 'rgba(255,240,210,0.35)'; c.fillRect(l, top, r - l, 1);
  }

  // drawn straight into the frame (same seed every time, so it looks the same each frame)
  function paint(c) {
    seed = 11;
    // sky and sun
    let g = c.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, '#4a7fc0'); g.addColorStop(0.5, '#8cbde0'); g.addColorStop(1, '#f1dfb8');
    c.fillStyle = g; c.fillRect(0, 0, W, HORIZON + 4);
    g = c.createRadialGradient(262, 30, 1, 262, 30, 70);
    g.addColorStop(0, 'rgba(255,252,235,1)'); g.addColorStop(0.08, 'rgba(255,245,210,0.9)'); g.addColorStop(1, 'rgba(255,235,190,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, HORIZON);
    [[46, 24, 1], [128, 12, 0.7], [196, 38, 0.6], [300, 50, 0.8]].forEach(a => cloud(c, ...a));
    // three layers of mesas, hazier with distance
    for (let x = -20; x < W; x += 34 + rnd() * 30) mesa(c, x, HORIZON, 40 + rnd() * 50, 10 + rnd() * 14, '#b9b2cf', '#a7a3c2', 'rgba(90,80,120,0.18)');
    for (let x = -30; x < W; x += 60 + rnd() * 50) mesa(c, x, HORIZON + 4, 50 + rnd() * 60, 18 + rnd() * 22, '#d9a77a', '#b37e57', 'rgba(110,60,40,0.3)');
    mesa(c, 250, HORIZON + 8, 90, 46, '#cf9666', '#9e6844', 'rgba(90,45,30,0.35)');
    mesa(c, -36, HORIZON + 8, 80, 36, '#cb9265', '#9a6543', 'rgba(90,45,30,0.35)');
    // desert floor
    g = c.createLinearGradient(0, HORIZON, 0, RING);
    g.addColorStop(0, '#dcc092'); g.addColorStop(1, '#c69c64');
    c.fillStyle = g; c.fillRect(0, HORIZON + 4, W, RING - HORIZON);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W, y = HORIZON + 6 + rnd() * (RING - HORIZON - 6), r = 0.4 + rnd() * 1.6 * ((y - HORIZON) / 18);
      c.fillStyle = 'rgba(120,80,50,0.55)'; c.beginPath(); c.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,235,200,0.4)'; c.fillRect(x - r * 0.6, y - r * 0.5, r, 0.4);
    }
    // press camp on the left: vans with satellite dishes and a few onlookers
    for (const [x, col] of [[34, '#e9e4dc'], [48, '#d8d2c6'], [60, '#f0ece4']]) {
      c.fillStyle = col; c.fillRect(x, 113, 11, 5); c.fillRect(x + 7, 111, 4, 2);
      c.fillStyle = '#333'; c.fillRect(x + 1, 118, 2, 1); c.fillRect(x + 8, 118, 2, 1);
      c.fillStyle = '#aaa'; c.beginPath(); c.arc(x + 3, 111, 2, Math.PI, 0); c.fill();
    }
    for (let i = 0; i < 9; i++) { c.fillStyle = ['#c33', '#36c', '#333', '#da3', '#6a4'][i % 5]; c.fillRect(74 + i * 2.6, 115, 1.4, 3); }
    // the Z fighters watching from a rock ledge on the right
    c.fillStyle = '#8f5d3c'; c.beginPath(); c.moveTo(262, 120); c.lineTo(268, 108); c.lineTo(300, 107); c.lineTo(308, 120); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,230,190,0.35)'; c.fillRect(268, 107, 32, 1);
    [['#f27a1e', '#1c1c2c'], ['#5a3fa0', '#1c1c2c'], ['#2f6fd0', '#1c1c2c'], ['#3b9a3b', '#e9e9e9'], ['#e8e8f0', '#e7c39c'], ['#f2a33a', '#1c1c2c']]
      .forEach(([body, head], i) => {
        const x = 271 + i * 4.6;
        c.fillStyle = body; c.fillRect(x, 102.5, 2.4, 4.5);
        c.fillStyle = head; c.fillRect(x + 0.2, 100.6, 2, 2);
      });
    // the ring: big white tiles in perspective, two corner posts on the far edge
    g = c.createLinearGradient(0, RING, 0, H);
    g.addColorStop(0, '#d6d1c6'); g.addColorStop(1, '#efebe2');
    c.fillStyle = g; c.fillRect(0, RING, W, H - RING);
    const vy = RING - 150, rows = [];
    for (let k = 0, y = RING; y < H + 20; k++) { rows.push(y); y += 3 + k * 2.2; }
    for (let r = 0; r + 1 < rows.length; r++) for (let i = -12; i <= 12; i++) {
      const at = (x0, y) => W / 2 + (x0 - W / 2) * (y - vy) / (H - vy);
      const y0 = rows[r], y1 = rows[r + 1], xa = W / 2 + i * 34, xb = xa + 34;
      c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '150,140,120'},${0.05 + rnd() * 0.1})`;
      c.beginPath(); c.moveTo(at(xa, y0), y0); c.lineTo(at(xb, y0), y0); c.lineTo(at(xb, y1), y1); c.lineTo(at(xa, y1), y1); c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(120,108,92,0.45)'; c.lineWidth = 0.45;
    rows.forEach(y => { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); });
    for (let i = -12; i <= 13; i++) {
      const x0 = W / 2 + i * 34;
      c.beginPath(); c.moveTo(W / 2 + (x0 - W / 2) * (RING - vy) / (H - vy), RING); c.lineTo(x0, H); c.stroke();
    }
    c.fillStyle = '#f8f6f0'; c.fillRect(0, RING - 1, W, 1.2);
    c.fillStyle = 'rgba(90,70,50,0.35)'; c.fillRect(0, RING - 2, W, 1);
    for (const x of [18, 296]) {
      g = c.createLinearGradient(x, 0, x + 6, 0); g.addColorStop(0, '#fbfaf6'); g.addColorStop(1, '#bdb7aa');
      c.fillStyle = g; c.fillRect(x, RING - 20, 6, 20);
      c.fillStyle = '#fffefb'; c.fillRect(x - 1, RING - 22, 8, 2.4);
      c.fillStyle = 'rgba(60,50,40,0.25)'; c.beginPath(); c.ellipse(x + 3, RING, 6, 1.2, 0, 0, Math.PI * 2); c.fill();
    }
  }

  function reset() {
    decals = []; debris = []; chunks = []; rings = []; gusts = []; clouds = []; blasts = []; winds = []; seed = 99;
    dust = Array.from({ length: 34 }, () => ({ x: rnd() * W, y: 118 + rnd() * 60, v: 6 + rnd() * 14, a: 0.15 + rnd() * 0.3 }));
    // big soft cloud shadows sliding across the ring
    shadows = Array.from({ length: 3 }, (_, i) => ({ x: i * 140 - 40, y: 132 + rnd() * 30, r: 50 + rnd() * 40, v: 4 + rnd() * 4 }));
    birds = { x: -60, y: 30, t: 9 };
    // (the storm clouds and the rain are always there, and only show as the storm comes in)
    storming = Array.from({ length: 7 }, (_, i) => ({ x: i * 56 - 30 + rnd() * 20, y: 4 + rnd() * 16, r: 34 + rnd() * 26, v: 5 + rnd() * 6 }));
    rain = Array.from({ length: 46 }, () => ({ x: rnd() * (W + 60), y: rnd() * H, v: 260 + rnd() * 120 }));
    storm = 0; stormTo = 0; bolt = null; boltIn = 2; glare = 0;
  }

  // A crater where something heavy hits the ring: a dented bowl with a lit far rim, broken tile
  // pieces, a few deep cracks, flying chunks and a shockwave ring.
  function crack(x, size = 1) {
    const lines = [];
    const n = 3 + Math.round(size * 1.5);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd() * 0.6, px = x + Math.cos(a) * 7 * size, py = FLOOR + 1.5 + Math.sin(a) * 1.8 * size;
      const seg = [[px, py]];
      for (let j = 0; j < 2 + size; j++) {
        const len = (3 + rnd() * 4) * size;
        px += Math.cos(a) * len; py += Math.sin(a) * len * 0.26;
        a += (rnd() - 0.5) * 0.8; seg.push([px, py]);
      }
      lines.push(seg);
    }
    const pieces = Array.from({ length: 3 + Math.round(size * 3) }, () => {
      const a = rnd() * Math.PI * 2, d = (4 + rnd() * 6) * size;
      return { x: x + Math.cos(a) * d, y: FLOOR + 1.5 + Math.sin(a) * d * 0.26, w: 2 + rnd() * 3 * size, h: 1 + rnd() * size, tilt: (rnd() - 0.5) * 1.2 };
    });
    decals.push({ x, size, lines, pieces });
    if (decals.length > 24) decals.shift();
    cloud(x, size * 0.8);
    for (let i = 0; i < 6 + size * 6; i++) {
      chunks.push({ x: x + (rnd() - 0.5) * 8, y: FLOOR, vx: (rnd() - 0.5) * 140 * size, vy: -(70 + rnd() * 130) * size, r: 1 + rnd() * 1.6 * size, rot: rnd() * 6, vr: (rnd() - 0.5) * 18, t: 0 });
    }
    shock(x, size);
  }

  // A billow of dust rolling out along the ring: soft puffs that swell, drift apart and fade.
  function cloud(x, size = 1, y = FLOOR) {
    const n = Math.round(5 + size * 5);
    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * Math.PI, sp = (20 + rnd() * 50) * Math.sqrt(size);
      clouds.push({ x: x + (rnd() - 0.5) * 10 * size, y: y - rnd() * 4, vx: Math.sin(a) * sp * 1.6, vy: -(4 + rnd() * 14) * size,
        r: (2 + rnd() * 3) * Math.sqrt(size), grow: (6 + rnd() * 8) * Math.sqrt(size), t: 0, life: 0.9 + rnd() * 0.8 * size, shade: rnd() });
    }
    if (clouds.length > 160) clouds.splice(0, clouds.length - 160);
  }

  // A burnt trench a beam ripped along the ring: glows orange first, then cools to a dark scar.
  function scorch(xa, xb, width = 1) {
    const x0 = Math.max(-10, Math.min(xa, xb)), x1 = Math.min(W + 10, Math.max(xa, xb));
    if (x1 - x0 < 6) return;
    const jag = Array.from({ length: Math.ceil((x1 - x0) / 4) + 1 }, () => (rnd() - 0.5) * 1.2);
    decals.push({ scorch: true, x0, x1, width, jag, t: 0 });
    if (decals.length > 24) decals.shift();
  }

  // Debris torn up under a beam or a clash, every frame it lasts: grit spraying up off the ring.
  function wake(xa, xb, dt, power = 1) {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const n = (x1 - x0) * dt * 0.2 * power;
    for (let i = 0; i < n || (i === 0 && rnd() < n); i++) {
      const x = x0 + rnd() * (x1 - x0);
      if (rnd() < 0.5) chunks.push({ x, y: FLOOR, vx: (rnd() - 0.5) * 60, vy: -(60 + rnd() * 90) * power, r: 0.6 + rnd() * 0.9, rot: rnd() * 6, vr: (rnd() - 0.5) * 18, t: 0.6 });
      else debris.push({ x, y: FLOOR - rnd() * 2, vy: -(10 + rnd() * 20), vx: (rnd() - 0.5) * 30, r: 1 + rnd(), t: 0, life: 0.5, wob: 0 });
    }
    if (chunks.length > 220) chunks.splice(0, chunks.length - 220);
  }

  // Something huge flew off the screen and hit the mountains: a flash on the horizon, a dome of
  // fire and a smoke column that drifts and fades. size < 1 is a ki blast's small puff.
  function farBlast(x, size = 1) {
    blasts.push({ x: Math.max(6, Math.min(W - 6, x)), size, t: 0, life: 3.5 + size * 2, lean: (rnd() - 0.5) * 6 });
    if (blasts.length > 6) blasts.shift();
  }

  // Slammed into the edge of the screen: rock bursts off the arena wall behind them.
  function wallHit(x, y, size = 1) {
    const dir = x < W / 2 ? 1 : -1;
    for (let i = 0; i < 18 * size; i++)
      chunks.push({ x, y: y + (rnd() - 0.5) * 26, vx: dir * (60 + rnd() * 150), vy: -(30 + rnd() * 140), r: 1.2 + rnd() * 2.2 * size, rot: rnd() * 6, vr: (rnd() - 0.5) * 18, t: 0 });
    // the dust bursts off the wall in a fan, and the ring cracks at its foot
    for (let i = 0; i < 8; i++) clouds.push({ x: x + dir * rnd() * 6, y: y + (rnd() - 0.5) * 24, vx: dir * (30 + rnd() * 60), vy: (rnd() - 0.6) * 30,
      r: 3 + rnd() * 3, grow: 10 + rnd() * 8, t: 0, life: 0.8 + rnd() * 0.5, shade: rnd() });
    cloud(x + dir * 8, 0.8 * size);
  }

  // Powering up: wind streaks blow out along the ring from their feet.
  function wind(x) {
    const dir = rnd() < 0.5 ? -1 : 1;
    winds.push({ x: x + dir * (6 + rnd() * 8), y: FLOOR - rnd() * 6, v: dir * (90 + rnd() * 80), len: 4 + rnd() * 8, t: 0 });
    if (winds.length > 60) winds.shift();
  }

  // a flat ring rippling out across the ring from a heavy hit
  function shock(x, size = 1) { rings.push({ x, size, t: 0 }); }

  // rocks pulled up off the ground by someone powering up
  function lift(x) {
    debris.push({ x: x + (rnd() - 0.5) * 50, y: FLOOR + rnd() * 6, vy: -(14 + rnd() * 26), vx: 0, r: 0.6 + rnd() * 1.6, t: 0, life: 2.2, wob: rnd() * 6 });
  }

  // a little kick of dust behind a fighter's feet when they set off
  function puff(x, dir) {
    for (let i = 0; i < 5; i++) debris.push({ x: x - dir * 4, y: FLOOR - rnd() * 2, vy: -(4 + rnd() * 10), vx: -dir * (12 + rnd() * 26), r: 1 + rnd(), t: 0, life: 0.45, wob: 0 });
  }

  function update(dt) {
    clock += dt;
    // the storm comes in over a couple of seconds and clears a little slower
    storm += (stormTo - storm) * Math.min(1, dt * (stormTo > storm ? stormRate : 0.6));
    if (storm > 0.02) {
      for (const c of storming) { c.x -= c.v * dt; if (c.x < -c.r - 10) c.x = W + c.r + 10; }
      for (const r of rain) { r.y += r.v * dt; r.x -= r.v * 0.22 * dt; if (r.y > FLOOR + 6) { r.y = -8; r.x = rnd() * (W + 60); } }
      if (storm > 0.6 && (boltIn -= dt) <= 0) { boltIn = 2.5 + rnd() * 5; strike(); }
    }
    if (bolt && (bolt.t += dt) > 0.22) bolt = null;
    glare = Math.max(0, glare - dt * 5);
    heliX += dt * 9; if (heliX > W + 40) heliX = -40;
    for (const d of dust) { d.x += d.v * dt; if (d.x > W + 4) { d.x = -4; d.y = 118 + rnd() * 60; } }
    for (const d of debris) { d.t += dt; d.y += d.vy * dt; d.x += d.vx * dt; d.vy *= 0.985; d.vx *= 0.94; }
    debris = debris.filter(d => d.t < d.life && d.y > 20);
    for (const c of chunks) {
      c.t += dt; c.vy += 520 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.y > FLOOR + 2 && c.vy > 0) { c.y = FLOOR + 2; c.vy *= -0.35; c.vx *= 0.6; c.vr *= 0.5; }
    }
    chunks = chunks.filter(c => c.t < 1.4);
    for (const c of clouds) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.93; c.vy *= 0.95; c.r += c.grow * dt; c.grow *= 0.97; }
    clouds = clouds.filter(c => c.t < c.life);
    for (const b of blasts) b.t += dt;
    blasts = blasts.filter(b => b.t < b.life);
    for (const w of winds) { w.t += dt; w.x += w.v * dt; }
    winds = winds.filter(w => w.t < 0.35);
    for (const d of decals) if (d.scorch) d.t += dt;
    for (const r of rings) r.t += dt;
    rings = rings.filter(r => r.t < 0.45);
    for (const sh of shadows) { sh.x += sh.v * dt; if (sh.x - sh.r > W) sh.x = -sh.r; }
    // a small flock crosses the sky every so often
    if ((birds.t -= dt) <= 0) { birds.x += 22 * dt; if (birds.x > W + 30) { birds.x = -60; birds.y = 18 + rnd() * 30; birds.t = 14 + rnd() * 10; } }
    // wind: a quick pale streak through the air now and then
    if (rnd() < dt * 0.6) gusts.push({ x: -40, y: 70 + rnd() * 80, len: 20 + rnd() * 30, v: 220 + rnd() * 120, t: 0 });
    for (const g of gusts) { g.t += dt; g.x += g.v * dt; }
    gusts = gusts.filter(g => g.x < W + 60);
  }

  function drawCrater(gfx, d) {
    const rx = 12 * d.size, ry = 3.3 * d.size, cy = FLOOR + 1.5;
    gfx.save(); gfx.translate(d.x, cy); gfx.scale(1, ry / rx);
    const g = gfx.createRadialGradient(0, 0, 0.5, 0, 0, rx);
    g.addColorStop(0, 'rgba(12,14,34,0.85)'); g.addColorStop(0.55, 'rgba(28,33,68,0.6)'); g.addColorStop(0.85, 'rgba(50,58,100,0.25)'); g.addColorStop(1, 'rgba(50,58,100,0)');
    gfx.fillStyle = g; gfx.beginPath(); gfx.arc(0, 0, rx, 0, Math.PI * 2); gfx.fill();
    gfx.lineWidth = 2.2;
    gfx.strokeStyle = 'rgba(10,12,30,0.7)'; gfx.beginPath(); gfx.arc(0, 0, rx * 0.72, Math.PI * 1.05, Math.PI * 1.95); gfx.stroke();
    gfx.strokeStyle = 'rgba(240,245,255,0.75)'; gfx.beginPath(); gfx.arc(0, 0, rx * 0.8, Math.PI * 0.08, Math.PI * 0.92); gfx.stroke();
    gfx.restore();
    gfx.strokeStyle = 'rgba(20,23,48,0.8)'; gfx.lineWidth = 0.7;
    for (const seg of d.lines) { gfx.beginPath(); seg.forEach(([x, y], i) => i ? gfx.lineTo(x, y) : gfx.moveTo(x, y)); gfx.stroke(); }
    for (const p of d.pieces) {
      gfx.save(); gfx.translate(p.x, p.y); gfx.rotate(p.tilt * 0.3);
      gfx.fillStyle = '#a9b1d6'; gfx.fillRect(-p.w / 2, -p.h, p.w, p.h);
      gfx.fillStyle = '#d9def5'; gfx.fillRect(-p.w / 2, -p.h, p.w, 0.6);
      gfx.strokeStyle = 'rgba(30,34,64,0.9)'; gfx.lineWidth = 0.5; gfx.strokeRect(-p.w / 2, -p.h, p.w, p.h);
      gfx.restore();
    }
  }

  function drawScorch(gfx, d) {
    const y = FLOOR + 1, heat = Math.max(0, 1 - d.t / 1.8), n = d.jag.length - 1;
    gfx.save();
    // the gouge: a ragged dark band, deepest in the middle, tapering at both ends, its near lip lit
    for (let i = 0; i < n; i++) {
      const x = d.x0 + i * 4, w = Math.min(4, d.x1 - x);
      if (w <= 0) break;
      const taper = Math.min(1, (i + 1) / 3, (n - i) / 3);
      const h = (5 + d.jag[i] * 2) * d.width * taper;
      gfx.fillStyle = 'rgba(40,38,60,0.55)'; gfx.fillRect(x, y - h / 2, w, h);
      gfx.fillStyle = 'rgba(14,12,26,0.75)'; gfx.fillRect(x, y - h / 4, w, h / 2);
      gfx.fillStyle = 'rgba(245,248,255,0.55)'; gfx.fillRect(x, y + h / 2, w, 0.7);
      if (heat > 0) {
        gfx.fillStyle = `rgba(255,${120 + Math.round(110 * heat)},${40 + Math.round(60 * heat)},${0.9 * heat})`;
        gfx.fillRect(x, y - h / 6, w, h / 3);
      }
    }
    gfx.restore();
  }

  function drawFarBlast(gfx, b) {
    const s = b.size, x = b.x, t = b.t;
    gfx.save();
    // the flash lights up the sky for an instant
    if (t < 0.18) { gfx.fillStyle = `rgba(255,250,225,${(1 - t / 0.18) * 0.55 * Math.min(1, s)})`; gfx.fillRect(0, 0, W, FAR + 14); }
    // the fireball: a dome that swells on the horizon, white-hot core to orange
    const fireT = 1.3 * Math.max(0.5, s), fire = Math.max(0, 1 - t / fireT);
    if (fire > 0) {
      const r = (10 + 24 * Math.sqrt(1 - fire)) * s;
      const g = gfx.createRadialGradient(x, FAR, 0, x, FAR, r);
      g.addColorStop(0, `rgba(255,255,240,${fire})`); g.addColorStop(0.35, `rgba(255,214,120,${fire})`);
      g.addColorStop(0.7, `rgba(255,130,50,${0.8 * fire})`); g.addColorStop(1, 'rgba(200,70,30,0)');
      gfx.fillStyle = g; gfx.beginPath(); gfx.ellipse(x, FAR, r, r * 0.9, 0, Math.PI, 0); gfx.fill();
      // a pillar of light shooting up out of it
      gfx.fillStyle = `rgba(255,248,220,${0.7 * fire * fire})`;
      gfx.fillRect(x - 2 * s, FAR - r * 1.6, 4 * s, r * 1.6);
    }
    // then the mushroom: a stem of smoke and a rolling cap, drifting and fading
    const smoke = Math.min(1, Math.max(0, t - 0.25) * 2) * Math.max(0, 1 - t / b.life);
    if (smoke > 0) {
      const rise = Math.min(1, t / 2.2), top = FAR - (16 + 30 * rise) * s, lean = b.lean * rise * s;
      gfx.fillStyle = `rgba(92,80,78,${0.55 * smoke})`;
      gfx.beginPath(); gfx.moveTo(x - 4 * s, FAR); gfx.lineTo(x - 2.5 * s + lean, top); gfx.lineTo(x + 2.5 * s + lean, top); gfx.lineTo(x + 4 * s, FAR); gfx.fill();
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI, cr = (5 + 3 * rise) * s;
        const cx = x + lean + Math.cos(a) * 9 * s * (0.6 + rise * 0.6), cy = top + 2 - Math.sin(a) * 4 * s;
        gfx.fillStyle = `rgba(${120 - i * 4},${104 - i * 3},${100 - i * 3},${0.6 * smoke})`;
        gfx.beginPath(); gfx.arc(cx, cy, cr, 0, Math.PI * 2); gfx.fill();
      }
      // the fire still glowing under the smoke
      gfx.fillStyle = `rgba(255,150,70,${0.35 * smoke * Math.max(0, 1 - t / 2.5)})`;
      gfx.beginPath(); gfx.ellipse(x, FAR, 10 * s, 3 * s, 0, Math.PI, 0); gfx.fill();
    }
    gfx.restore();
  }

  function drawClouds(gfx) {
    for (const c of clouds) {
      const a = Math.min(1, c.t * 8) * (1 - c.t / c.life);
      gfx.fillStyle = `rgba(${200 + Math.round(c.shade * 30)},${192 + Math.round(c.shade * 28)},${180 + Math.round(c.shade * 24)},${0.55 * a})`;
      gfx.beginPath(); gfx.arc(c.x, c.y - c.r * 0.5, c.r, 0, Math.PI * 2); gfx.fill();
      gfx.fillStyle = `rgba(120,110,110,${0.18 * a})`;
      gfx.beginPath(); gfx.arc(c.x, c.y - c.r * 0.2, c.r * 0.8, 0, Math.PI); gfx.fill();
    }
  }

  function drawBack(gfx, dim = 0) {
    gfx.imageSmoothingEnabled = true; gfx.imageSmoothingQuality = 'high';
    const photo = photos[arena], a = ARENAS[arena];
    if (photo.complete && photo.naturalWidth) {
      const h = photo.naturalHeight * a.w / photo.naturalWidth;
      gfx.drawImage(photo, a.x, a.top(h), a.w, h);
    } else {
      paint(gfx);
    }
    if (!shadows.length) reset();
    // cloud shadows drifting over the ring
    for (const sh of shadows) {
      const g = gfx.createRadialGradient(sh.x, sh.y, 2, sh.x, sh.y, sh.r);
      g.addColorStop(0, 'rgba(20,26,70,0.1)'); g.addColorStop(1, 'rgba(20,26,70,0)');
      gfx.fillStyle = g; gfx.beginPath(); gfx.ellipse(sh.x, sh.y, sh.r, sh.r * 0.28, 0, 0, Math.PI * 2); gfx.fill();
    }
    if (storm > 0.02) {
      const calm = typeof settings !== 'undefined' && settings.calm;
      // the day goes dark, darker up in the sky than down on the ring
      const sky = gfx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `rgba(14,12,40,${0.62 * storm})`); sky.addColorStop(0.6, `rgba(22,20,52,${0.42 * storm})`); sky.addColorStop(1, `rgba(26,24,56,${0.3 * storm})`);
      gfx.fillStyle = sky; gfx.fillRect(0, 0, W, H);
      // lightning: the sky lights up behind the clouds, then the bolt itself
      if (glare > 0) { gfx.fillStyle = `rgba(214,226,255,${glare * (calm ? 0.08 : 0.3) * storm})`; gfx.fillRect(0, 0, W, FAR + 6); }
      if (bolt) {
        const a = (1 - bolt.t / 0.22) * (calm ? 0.5 : 1), flick = Math.floor(bolt.t * 60) % 3 !== 1;
        const line = (pts, w, color) => { gfx.strokeStyle = color; gfx.lineWidth = w; gfx.beginPath(); pts.forEach(([x, y], i) => i ? gfx.lineTo(x, y) : gfx.moveTo(x, y)); gfx.stroke(); };
        if (flick) {
          line(bolt.pts, 3, `rgba(150,170,255,${0.35 * a})`); line(bolt.pts, 1, `rgba(255,255,255,${a})`);
          if (bolt.branch.length) line(bolt.branch, 0.6, `rgba(230,238,255,${0.8 * a})`);
        }
      }
      // heavy clouds along the top
      for (const c of storming) {
        const lit = Math.round(glare * 60);
        const g = gfx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
        g.addColorStop(0, `rgba(${34 + lit},${32 + lit},${58 + lit},${0.85 * storm})`); g.addColorStop(1, 'rgba(30,28,54,0)');
        gfx.fillStyle = g; gfx.beginPath(); gfx.ellipse(c.x, c.y, c.r, c.r * 0.42, 0, 0, Math.PI * 2); gfx.fill();
      }
    }
    gfx.imageSmoothingEnabled = false;
    // helicopter crossing the sky
    const hx = Math.round(heliX), hy = 40 + Math.round(Math.sin(clock * 0.8) * 2);
    gfx.fillStyle = '#4a4f5a'; gfx.fillRect(hx, hy, 6, 3); gfx.fillRect(hx - 5, hy + 1, 5, 1); gfx.fillRect(hx - 6, hy, 1, 2);
    gfx.fillStyle = 'rgba(40,40,50,0.6)'; gfx.fillRect(hx - 3 + (Math.floor(clock * 30) % 2) * 2, hy - 1, 9, 1);
    // birds, wings flapping
    if (birds.t <= 0) {
      gfx.fillStyle = '#2c3048';
      [[0, 0], [7, 3], [-6, 4], [13, 6]].forEach(([dx, dy], i) => {
        const bx = Math.round(birds.x + dx), by = Math.round(birds.y + dy), up = Math.floor(clock * 8 + i) % 2;
        gfx.fillRect(bx - 2, by - up, 2, 1); gfx.fillRect(bx, by, 1, 1); gfx.fillRect(bx + 1, by - up, 2, 1);
      });
    }
    for (const b of blasts) drawFarBlast(gfx, b);
    for (const d of decals) d.scorch ? drawScorch(gfx, d) : drawCrater(gfx, d);
    for (const r of rings) {
      const k = r.t / 0.45, rx = (8 + k * 70) * r.size;
      gfx.strokeStyle = `rgba(220,235,255,${0.7 * (1 - k)})`; gfx.lineWidth = 1.4;
      gfx.beginPath(); gfx.ellipse(r.x, FLOOR + 1, rx, rx * 0.2, 0, 0, Math.PI * 2); gfx.stroke();
    }
    for (const d of debris) {
      gfx.fillStyle = `rgba(150,148,175,${Math.min(1, (d.life - d.t) / Math.min(1, d.life))})`;
      gfx.fillRect(Math.round(d.x + Math.sin(d.t * 4 + d.wob) * 2), Math.round(d.y), Math.ceil(d.r), Math.ceil(d.r));
    }
    for (const c of chunks) {
      gfx.save(); gfx.translate(Math.round(c.x), Math.round(c.y)); gfx.rotate(c.rot); gfx.globalAlpha = Math.min(1, (1.4 - c.t) * 2);
      gfx.fillStyle = '#9da6cf'; gfx.fillRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2);
      gfx.fillStyle = '#2a2f55'; gfx.fillRect(-c.r, c.r * 0.3, c.r * 2, c.r * 0.3);
      gfx.restore();
    }
    for (const w of winds) {
      gfx.fillStyle = `rgba(240,232,214,${0.5 * (1 - w.t / 0.35)})`;
      gfx.fillRect(Math.round(w.v > 0 ? w.x : w.x - w.len), Math.round(w.y), Math.round(w.len), 1);
    }
    drawClouds(gfx);
    if (dim) { gfx.fillStyle = `rgba(0,0,0,${dim})`; gfx.fillRect(0, 0, W, H); }
  }

  function drawFront(gfx) {
    // rain falls in front of the fighters, slanting with the wind
    if (storm > 0.3) {
      gfx.fillStyle = `rgba(190,205,240,${0.3 * (storm - 0.3) / 0.7})`;
      for (const r of rain) { gfx.save(); gfx.translate(Math.round(r.x), Math.round(r.y)); gfx.rotate(0.22); gfx.fillRect(0, 0, 0.6, 5); gfx.restore(); }
    }
    for (const d of dust) { gfx.fillStyle = `rgba(235,225,205,${d.a})`; gfx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); }
    for (const g of gusts) {
      gfx.fillStyle = 'rgba(255,255,255,0.22)'; gfx.fillRect(Math.round(g.x), Math.round(g.y), Math.round(g.len), 1);
      gfx.fillStyle = 'rgba(255,255,255,0.12)'; gfx.fillRect(Math.round(g.x + g.len * 0.3), Math.round(g.y) + 2, Math.round(g.len * 0.6), 1);
    }
  }

  return { get arena() { return arena; }, arenas: Object.keys(ARENAS), setArena, drawBack, drawFront, update, reset, crack, shock, lift, puff, cloud, scorch, wake, farBlast, wallHit, wind, setStorm, strike, get storm() { return storm; } };
})();
window.Stage = Stage;
