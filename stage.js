// The Cell Games arena: the background art in assets/img/cell-games.webp (the painted version
// below is the fallback if it can't load). On top of it run the live bits: drifting dust, a news
// helicopter, rocks lifted by power-ups and the cracks fighters leave in the ring.
const Stage = (() => {
  const W = 320, H = 180, S = 4, HORIZON = 110, RING = 128, FLOOR = 162;
  let painted = null, decals = [], dust = [], debris = [], heliX = -30, clock = 0;
  const photo = new Image(); photo.src = 'assets/img/cell-games.webp';
  // where the art's horizon (61% down the image) should sit, so the fighters stand on the tiles
  const PHOTO_HORIZON = 0.61, PHOTO_HORIZON_Y = 116;

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

  function paint() {
    seed = 11;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const c = cv.getContext('2d'); c.scale(S, S);
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
    return cv;
  }

  function reset() {
    decals = []; debris = []; seed = 99;
    dust = Array.from({ length: 34 }, () => ({ x: rnd() * W, y: 118 + rnd() * 60, v: 6 + rnd() * 14, a: 0.15 + rnd() * 0.3 }));
  }

  // a crack and shallow crater where a fighter slams into the ring
  function crack(x, size = 1) {
    const lines = [];
    // jagged lines radiating out from the impact, squashed flat by the ring's perspective
    const n = 6 + size * 3;
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd() * 0.5, px = x, py = FLOOR + 1.5;
      const seg = [[px, py]];
      for (let j = 0; j < 2 + size; j++) {
        const len = (2 + rnd() * 3) * size;
        px += Math.cos(a) * len; py += Math.sin(a) * len * 0.28;
        a += (rnd() - 0.5) * 0.9; seg.push([px, py]);
      }
      lines.push(seg);
    }
    decals.push({ x, size, lines });
    if (decals.length > 12) decals.shift();
  }

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
    heliX += dt * 9; if (heliX > W + 40) heliX = -40;
    for (const d of dust) { d.x += d.v * dt; if (d.x > W + 4) { d.x = -4; d.y = 118 + rnd() * 60; } }
    for (const d of debris) { d.t += dt; d.y += d.vy * dt; d.x += d.vx * dt; d.vy *= 0.985; d.vx *= 0.94; }
    debris = debris.filter(d => d.t < d.life && d.y > 20);
  }

  function drawBack(ctx, dim = 0) {
    ctx.imageSmoothingEnabled = true;
    if (photo.complete && photo.naturalWidth) {
      const k = W / photo.naturalWidth, h = photo.naturalHeight * k;
      ctx.drawImage(photo, 0, PHOTO_HORIZON_Y - PHOTO_HORIZON * h, W, h);
    } else {
      if (!painted) { painted = paint(); reset(); }
      ctx.drawImage(painted, 0, 0, W, H);
    }
    ctx.imageSmoothingEnabled = false;
    // helicopter crossing the sky
    const hx = Math.round(heliX), hy = 40 + Math.round(Math.sin(clock * 0.8) * 2);
    ctx.fillStyle = '#4a4f5a'; ctx.fillRect(hx, hy, 6, 3); ctx.fillRect(hx - 5, hy + 1, 5, 1); ctx.fillRect(hx - 6, hy, 1, 2);
    ctx.fillStyle = 'rgba(40,40,50,0.6)'; ctx.fillRect(hx - 3 + (Math.floor(clock * 30) % 2) * 2, hy - 1, 9, 1);
    for (const d of decals) {
      ctx.fillStyle = 'rgba(40,46,80,0.3)';
      ctx.beginPath(); ctx.ellipse(d.x, FLOOR + 1.5, 9 * d.size, 1.8 * d.size, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(25,28,52,0.85)'; ctx.lineWidth = 0.6;
      for (const seg of d.lines) { ctx.beginPath(); seg.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    }
    for (const d of debris) {
      ctx.fillStyle = `rgba(150,148,175,${Math.min(1, (d.life - d.t) / Math.min(1, d.life))})`;
      ctx.fillRect(Math.round(d.x + Math.sin(d.t * 4 + d.wob) * 2), Math.round(d.y), Math.ceil(d.r), Math.ceil(d.r));
    }
    if (dim) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawFront(ctx) {
    for (const d of dust) { ctx.fillStyle = `rgba(235,225,205,${d.a})`; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); }
  }

  return { drawBack, drawFront, update, reset, crack, lift, puff };
})();
window.Stage = Stage;
