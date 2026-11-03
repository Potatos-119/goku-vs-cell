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

  sfx.parry = () => { init(); const t = ac.currentTime; [88, 95, 100].forEach((n, i) => tone('square', hz(n), hz(n), t + i * 0.05, 0.12, 0.14)); noise(t, 0.08, 0.3, 'highpass', 5000, 5000); };
  sfx.teleport = () => { init(); const t = ac.currentTime; tone('square', 1800, 300, t, 0.12, 0.12); noise(t, 0.1, 0.2, 'highpass', 4000, 4000); };

  // Music files in assets/audio: the fight theme loops, and when Goku goes Super Saiyan it
  // fades into the transformation theme (the generated chiptune is the fallback if a file is missing).
  const TRACKS = {
    bg: { src: 'assets/audio/bg-theme.mp3', vol: 0.45 },
    // a 15s cut that builds up and hits at SSJ_PEAK; plays once, then the fight theme resumes
    ssj: { src: 'assets/audio/ssj-transform.mp3', vol: 0.6, loop: false, then: 'bg' },
  };
  const tracks = {};
  function track(name) {
    if (!tracks[name]) {
      const a = new Audio(TRACKS[name].src); a.loop = TRACKS[name].loop !== false; a.volume = TRACKS[name].vol;
      a.onended = () => { if (music.current === name && TRACKS[name].then) music.play(TRACKS[name].then); };
      tracks[name] = a;
    }
    return tracks[name];
  }
  function fadeOut(a) {
    const step = setInterval(() => { a.volume = Math.max(0, a.volume - 0.05); if (!a.volume) { clearInterval(step); a.pause(); } }, 40);
  }
  let savedMute = false;
  try { savedMute = localStorage.getItem('musicMuted') === '1'; } catch (e) { /* storage blocked: start unmuted */ }
  const music = {
    current: 'bg',
    // M key: while muted the game still tracks which song should be on, so unmuting resumes it
    muted: savedMute,
    // play (or resume) a track; restart: from the beginning
    play(name = music.current, restart = false) {
      for (const [k, a] of Object.entries(tracks)) if (k !== name) a.pause();
      music.current = name;
      const a = track(name);
      a.volume = TRACKS[name].vol;
      if (restart) a.currentTime = 0;
      if (!music.muted) a.play().catch(() => playMusic('boss'));
    },
    switchTo(name) {
      if (music.current === name) return;
      if (tracks[music.current]) fadeOut(tracks[music.current]);
      music.current = name;
      const a = track(name); a.currentTime = 0; a.volume = TRACKS[name].vol;
      if (!music.muted) a.play().catch(() => {});
    },
    toggleMute() {
      music.muted = !music.muted;
      try { localStorage.setItem('musicMuted', music.muted ? '1' : '0'); } catch (e) { /* not saved, still works */ }
      if (music.muted) music.stop(); else music.play();
      return music.muted;
    },
    stop() { for (const a of Object.values(tracks)) a.pause(); stopMusic(); },
    // playback position of a track, or null when it isn't playing (cinematics sync to this)
    time(name) { const a = tracks[name]; return a && !a.paused && music.current === name ? a.currentTime : null; },
    winner() { music.stop(); if (!music.muted) jingle(VICTORY, 0.16); },
    defeat() { music.stop(); if (!music.muted) jingle(DEFEAT, 0.3); },
  };

  // [midi note, beats] lead lines over a sustained bass; _ is a rest
  const VICTORY = { bpm: 150, lead: [[72, 0.5], [72, 0.5], [72, 0.5], [76, 1], [79, 1], [_, 0.5], [76, 0.5], [79, 3]], bass: [48, 52, 55, 60] };
  const DEFEAT = { bpm: 70, lead: [[69, 1], [68, 1], [67, 1], [66, 1.5], [_, 0.5], [62, 1], [61, 3]], bass: [45, 44, 43, 38] };
  function jingle(song, gap) {
    init();
    const beat = 60 / song.bpm;
    let t = ac.currentTime + 0.05;
    for (const [n, len] of song.lead) {
      if (n) { tone('square', hz(n), hz(n), t, len * beat * 0.95, 0.16); tone('square', hz(n) * 1.005, hz(n) * 1.005, t, len * beat * 0.9, 0.05); }
      t += len * beat;
    }
    song.bass.forEach((n, i) => tone('triangle', hz(n), hz(n), ac.currentTime + 0.05 + i * gap * 4, gap * 4 + 0.6, 0.4));
  }

  return { init, playMusic, stopMusic, sfx, music };
})();
window.Audio8 = Audio8;

// Spoken lines with the browser's built-in voice: higher and quicker for Goku, deep and slow for Cell.
const Voice = {
  on: true,
  style: { goku: { pitch: 1.35, rate: 1.08 }, cell: { pitch: 0.45, rate: 0.92 } },
  pick() {
    if (this.voice !== undefined || !window.speechSynthesis) return this.voice;
    const all = speechSynthesis.getVoices();
    this.voice = all.find(v => /^en(-|_)US/.test(v.lang) && /Daniel|Alex|Fred|Google US/.test(v.name)) || all.find(v => /^en/.test(v.lang)) || null;
    return this.voice;
  },
  speak(who, text, interrupt = true) {
    if (!this.on || !window.speechSynthesis) return;
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    Object.assign(u, this.style[who] || {}, { volume: 0.9 });
    const v = this.pick(); if (v) u.voice = v;
    speechSynthesis.speak(u);
  },
  shout(who, text) { this.speak(who, text, true); },
};
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { Voice.voice = undefined; };
window.Voice = Voice;
