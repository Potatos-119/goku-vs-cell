// Small procedural effects: hit sparks, charging ki glow, floating dust.
function disc(ctx, x, y, r, color) {
  x = Math.round(x); y = Math.round(y); r = Math.round(r);
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(x - w, y + dy, w * 2 + 1, 1);
  }
}

const FX = {
  disc,
  kiGlow(ctx, x, y, r, t, pal = ['#ffffff', '#c9f4ff', '#5fd2ff', '#1f7ff0']) {
    const flick = Math.floor(t * 20) % 2;
    disc(ctx, x, y, r + 2 + flick, pal[3]);
    disc(ctx, x, y, r + 1, pal[2]);
    disc(ctx, x, y, r * 0.65, pal[1]);
    disc(ctx, x, y, r * 0.3, pal[0]);
    ctx.fillStyle = pal[2];
    for (let i = 0; i < 6; i++) {
      const a = t * 9 + i * 1.05, d = r + 4 + (i % 2) * 3;
      ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
  },
  spark(ctx, x, y, t, color = '#fff6b8') {
    if (t > 0.25) return;
    const r = 3 + t * 50;
    ctx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
    }
    if (t < 0.07) disc(ctx, x, y, 6, '#ffffff');
  },
};
window.FX = FX;
