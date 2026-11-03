// Original chiptune music and sound effects, synthesised with Web Audio (no audio files).
const Audio8 = (() => {
  let ac = null, master = null, musicGain = null, timer = null, noiseBuf = null;

  function init() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  function tone(type, f0, f1, t, dur, vol, dest = master) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol, filter = 'highpass', f0 = 1000, f1 = f0, dest = master) {
    const s = ac.createBufferSource(), g = ac.createGain(), bq = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    bq.type = filter; bq.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(bq); bq.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // ---- Boss theme: D minor, 160 bpm, 8th-note steps. Dm | Bb | C | A ----
  const _ = null;
  const LEAD = [
    74, _, 69, 74, 77, _, 76, 74, 74, _, 72, 70, _, 70, 72, 74,
    76, _, 76, 77, 79, _, 77, 76, 73, _, _, 69, 73, 76, 81, _,
    77, _, 76, 74, 81, _, 79, 77, 77, _, 74, 77, 82, _, 81, 79,
    79, _, 76, 79, 84, _, 82, 81, 81, _, 79, 77, 76, _, 73, _,
  ];
  const ROOTS = [38, 34, 36, 33];
  const BASS_SHAPE = [0, 0, 12, 0, 0, 12, 0, 7];

  const THEMES = {
    boss: { bpm: 160, lead: LEAD, roots: ROOTS, drums: true },
    intro: {
      bpm: 92,
      lead: [62, _, _, 65, 69, _, _, _, 67, _, 65, _, 64, _, _, _, 62, _, _, 65, 70, _, 69, _, 67, _, _, _, 69, _, _, _],
      roots: [38, 34], drums: false,
    },
  };

  function playMusic(name = 'boss') {
    init(); stopMusic();
    const th = THEMES[name];
    const stepDur = 60 / th.bpm / 2;
    let step = 0, next = ac.currentTime + 0.05;
    timer = setInterval(() => {
      while (next < ac.currentTime + 0.2) {
        const s = step % th.lead.length;
        const bar = Math.floor(s / 16) % th.roots.length;
        const n = th.lead[s];
        if (n) {
          tone('square', hz(n), hz(n), next, stepDur * 1.6, 0.16, musicGain);
          tone('square', hz(n) * 1.006, hz(n) * 1.006, next + 0.012, stepDur * 1.2, 0.05, musicGain);
        }
        const b = th.roots[bar] + BASS_SHAPE[s % 8];
        tone('triangle', hz(b), hz(b), next, stepDur * 0.9, th.drums ? 0.45 : 0.3, musicGain);
        if (th.drums) {
          if (s % 4 === 0) tone('sine', 150, 40, next, 0.14, 0.7, musicGain);
          if (s % 4 === 2) noise(next, 0.12, 0.3, 'bandpass', 1800, 1800, musicGain);
          noise(next, 0.03, 0.08, 'highpass', 7000, 7000, musicGain);
        } else if (s % 8 === 0) {
          tone('sine', hz(th.roots[bar] + 24), hz(th.roots[bar] + 24), next, stepDur * 6, 0.12, musicGain);
        }
        next += stepDur; step++;
      }
    }, 50);
  }

  function stopMusic() { if (timer) clearInterval(timer); timer = null; }

  const sfx = {
    punch() { init(); const t = ac.currentTime; noise(t, 0.08, 0.6, 'lowpass', 2500, 400); tone('sine', 160, 50, t, 0.12, 0.8); },
    kick() { init(); const t = ac.currentTime; noise(t, 0.12, 0.6, 'lowpass', 1800, 300); tone('sine', 120, 40, t, 0.16, 0.9); },
    whoosh() { init(); noise(ac.currentTime, 0.18, 0.25, 'bandpass', 600, 3000); },
    blast() { init(); const t = ac.currentTime; tone('square', 1100, 180, t, 0.25, 0.25); noise(t, 0.2, 0.25, 'bandpass', 3000, 800); },
    charge(dur = 1.4) {
      init(); const t = ac.currentTime;
      tone('sawtooth', 160, 1400, t, dur, 0.12);
      tone('square', 80, 700, t, dur, 0.06);
      noise(t, dur, 0.15, 'bandpass', 400, 4000);
    },
    beam(dur = 1.6) {
      init(); const t = ac.currentTime;
      noise(t, dur, 0.55, 'lowpass', 5000, 600);
      tone('square', 90, 60, t, dur, 0.2);
      tone('sawtooth', 220, 110, t, dur, 0.1);
    },
    hurt() { init(); const t = ac.currentTime; tone('square', 520, 90, t, 0.22, 0.25); noise(t, 0.1, 0.4, 'lowpass', 3000, 500); },
    explode() { init(); const t = ac.currentTime; noise(t, 1.2, 0.8, 'lowpass', 3000, 80); tone('sine', 90, 30, t, 0.9, 0.9); },
    powerup() {
      init(); const t = ac.currentTime;
      noise(t, 1.6, 0.35, 'bandpass', 300, 5000);
      [50, 53, 57, 62, 65, 69, 74].forEach((n, i) => tone('square', hz(n + 12), hz(n + 12), t + i * 0.12, 0.3, 0.12));
    },
    ko() { init(); const t = ac.currentTime; [69, 65, 62, 57, 50].forEach((n, i) => tone('square', hz(n), hz(n), t + i * 0.16, 0.25, 0.15)); },
    blip() { init(); tone('square', 880, 880, ac.currentTime, 0.04, 0.08); },
  };

  sfx.teleport = () => { init(); const t = ac.currentTime; tone('square', 1800, 300, t, 0.12, 0.12); noise(t, 0.1, 0.2, 'highpass', 4000, 4000); };

  // Music and voice files from assets/audio (falls back to the synth theme if missing).
  const tracks = {};
  function track(name, src, loop, vol) {
    if (!tracks[name]) { const a = new Audio(src); a.loop = loop; a.volume = vol; tracks[name] = a; }
    return tracks[name];
  }
  const music = {
    play() {
      const a = track('theme', 'assets/audio/theme.mp3', true, 0.45);
      a.play().catch(() => playMusic('boss'));
    },
    stop() { if (tracks.theme) tracks.theme.pause(); stopMusic(); },
    winner() { music.stop(); track('winner', 'assets/audio/winner.wav', false, 0.8).play().catch(() => {}); },
  };

  return { init, playMusic, stopMusic, sfx, music };
})();
window.Audio8 = Audio8;
