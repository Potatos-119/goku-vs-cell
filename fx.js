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
  // A painterly, flame-shaped ki field that stays behind the pixel sprite.
  // Its two counter-rotating ribbons make the charge feel alive without blurring the art.
  kiAura(ctx, x, y, scale, t, power = 0.5, ssj = false, calm = false) {
    const gold = ssj;
    const outer = gold ? 'rgba(255,183,38,' : 'rgba(38,164,255,';
    const core = gold ? 'rgba(255,241,160,' : 'rgba(176,241,255,';
    const w = 14 * scale * (0.82 + power * 0.38), h = 35 * scale * (0.82 + power * 0.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = calm ? 0.34 : 0.66;
    const glow = ctx.createRadialGradient(x, y - 20 * scale, 2, x, y - 20 * scale, h * 1.2);
    glow.addColorStop(0, gold ? 'rgba(255,220,105,0.3)' : 'rgba(77,191,255,0.28)');
    glow.addColorStop(1, 'rgba(40,120,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(x, y - 20 * scale, w * 1.7, h, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const phase = t * (3.2 + i * 0.45) + i * Math.PI * 2 / 3;
      const lean = Math.sin(phase) * 5 * scale;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.82, y - 3 * scale);
      ctx.bezierCurveTo(x - w * 1.5 + lean, y - 18 * scale, x - w * 0.35, y - h * (0.7 + power * 0.3), x + lean, y - h * (1.12 + power * 0.26));
      ctx.bezierCurveTo(x + w * 0.55, y - h * 0.62, x + w * 1.65 - lean, y - 13 * scale, x + w * 0.82, y - 3 * scale);
      ctx.closePath(); ctx.fillStyle = outer + (0.16 + power * 0.11) + ')'; ctx.fill();
      ctx.strokeStyle = core + (0.32 + power * 0.2) + ')'; ctx.lineWidth = 1.2 * scale; ctx.stroke();
    }
    // Thin lightning flickers, strongest as the charge reaches its peak.
    if (!calm && power > 0.55) for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, flick = Math.sin(t * 31 + i * 7);
      if (flick < 0.25) continue;
      const ex = x + side * (w + 4 * scale), ey = y - (8 + (i * 11)) * scale;
      ctx.globalAlpha = 0.25 + flick * 0.55; ctx.strokeStyle = gold ? '#fff2a1' : '#d3fbff'; ctx.lineWidth = 0.7 * scale;
      ctx.beginPath(); ctx.moveTo(ex, ey - 8 * scale); ctx.lineTo(ex - side * 2 * scale, ey - 3 * scale); ctx.lineTo(ex + side * 2 * scale, ey); ctx.lineTo(ex, ey + 6 * scale); ctx.stroke();
    }
    ctx.restore();
  },
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
