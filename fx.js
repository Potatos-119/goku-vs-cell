// Small procedural effects: hit sparks, charging ki glow, floating dust.
function disc(gfx, x, y, r, color) {
  x = Math.round(x); y = Math.round(y); r = Math.round(r);
  gfx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    gfx.fillRect(x - w, y + dy, w * 2 + 1, 1);
  }
}

const FX = {
  disc,
  // A painterly, flame-shaped ki field that stays behind the pixel sprite.
  // Its two counter-rotating ribbons make the charge feel alive without blurring the art.
  // fade: 0..1, so the aura can swell in and die away
  // tone: 'blue' (ki), 'gold' (Super Saiyan) or 'red' (Kaioken)
  kiAura(gfx, x, y, scale, t, power = 0.5, tone = 'blue', calm = false, fade = 1) {
    const C = { blue: ['38,164,255', '176,241,255', '77,191,255', '#d3fbff'], gold: ['255,183,38', '255,241,160', '255,220,105', '#fff2a1'],
      red: ['255,44,66', '255,190,190', '255,90,100', '#ffd6d6'] }[tone];
    const outer = `rgba(${C[0]},`, core = `rgba(${C[1]},`;
    const w = 14 * scale * (0.82 + power * 0.38), h = 35 * scale * (0.82 + power * 0.3);
    gfx.save(); gfx.globalCompositeOperation = 'lighter';
    gfx.globalAlpha = (calm ? 0.34 : 0.66) * fade;
    const glow = gfx.createRadialGradient(x, y - 20 * scale, 2, x, y - 20 * scale, h * 1.2);
    glow.addColorStop(0, `rgba(${C[2]},0.3)`);
    glow.addColorStop(1, `rgba(${C[0]},0)`);
    gfx.fillStyle = glow; gfx.beginPath(); gfx.ellipse(x, y - 20 * scale, w * 1.7, h, 0, 0, Math.PI * 2); gfx.fill();
    for (let i = 0; i < 3; i++) {
      const phase = t * (3.2 + i * 0.45) + i * Math.PI * 2 / 3;
      const lean = Math.sin(phase) * 5 * scale;
      gfx.beginPath();
      gfx.moveTo(x - w * 0.82, y - 3 * scale);
      gfx.bezierCurveTo(x - w * 1.5 + lean, y - 18 * scale, x - w * 0.35, y - h * (0.7 + power * 0.3), x + lean, y - h * (1.12 + power * 0.26));
      gfx.bezierCurveTo(x + w * 0.55, y - h * 0.62, x + w * 1.65 - lean, y - 13 * scale, x + w * 0.82, y - 3 * scale);
      gfx.closePath(); gfx.fillStyle = outer + (0.16 + power * 0.11) + ')'; gfx.fill();
      gfx.strokeStyle = core + (0.32 + power * 0.2) + ')'; gfx.lineWidth = 1.2 * scale; gfx.stroke();
    }
    // Thin lightning flickers, strongest as the charge reaches its peak.
    if (!calm && power > 0.55) for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, flick = Math.sin(t * 31 + i * 7);
      if (flick < 0.25) continue;
      const ex = x + side * (w + 4 * scale), ey = y - (8 + (i * 11)) * scale;
      gfx.globalAlpha = (0.25 + flick * 0.55) * fade; gfx.strokeStyle = C[3]; gfx.lineWidth = 0.7 * scale;
      gfx.beginPath(); gfx.moveTo(ex, ey - 8 * scale); gfx.lineTo(ex - side * 2 * scale, ey - 3 * scale); gfx.lineTo(ex + side * 2 * scale, ey); gfx.lineTo(ex, ey + 6 * scale); gfx.stroke();
    }
    gfx.restore();
  },
  kiGlow(gfx, x, y, r, t, pal = ['#ffffff', '#c9f4ff', '#5fd2ff', '#1f7ff0']) {
    const flick = Math.floor(t * 20) % 2;
    disc(gfx, x, y, r + 2 + flick, pal[3]);
    disc(gfx, x, y, r + 1, pal[2]);
    disc(gfx, x, y, r * 0.65, pal[1]);
    disc(gfx, x, y, r * 0.3, pal[0]);
    gfx.fillStyle = pal[2];
    for (let i = 0; i < 6; i++) {
      const a = t * 9 + i * 1.05, d = r + 4 + (i % 2) * 3;
      gfx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
  },
  spark(gfx, x, y, t, color = '#fff6b8') {
    if (t > 0.25) return;
    const r = 3 + t * 50;
    gfx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      gfx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
    }
    if (t < 0.07) disc(gfx, x, y, 6, '#ffffff');
  },
};
window.FX = FX;
