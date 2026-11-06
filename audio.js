// Game audio. Everything plays through buses, so music and effects can be balanced and turned
// up or down as groups:   music files / synth theme -> music -> duck --\
//                         sound effects -------------> sfx ----------+--> master -> limiter -> speakers
// The duck stage dips the music while a line is spoken; the limiter stops loud moments clipping.
const Audio8 = (() => {
  let ac = null, master = null, musicGain = null, timer = null, noiseBuf = null;
  let musicBus = null, duckBus = null, sfxBus = null;

  // volume settings are 0..10; squared so each step sounds like a similar change
  const vol = { music: 9, sfx: 8 };
  try { Object.assign(vol, JSON.parse(localStorage.getItem('volumes') || '{}')); } catch (e) { /* defaults */ }
  const gainOf = level => Math.pow(level / 10, 2);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.15;
    limiter.connect(ac.destination);
    master = ac.createGain(); master.gain.value = 1; master.connect(limiter);
    duckBus = ac.createGain(); duckBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = gainOf(vol.music); musicBus.connect(duckBus);
    sfxBus = ac.createGain(); sfxBus.gain.value = gainOf(vol.sfx) * 0.7; sfxBus.connect(master);
    musicGain = ac.createGain(); musicGain.gain.value = 0.35; musicGain.connect(musicBus);
    for (const name in tracks) route(tracks[name]);
    // two seconds of noise, so looped layers don't repeat audibly
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildKit();
    loadKame();
  }

  // ---- The recorded Kamehameha (assets/audio/kamehameha.mp3) ----
  // The clip is the whole move: the chant building from 0.85 s to 6.95 s, then "HA!" and the beam
  // from 7.05 s, fading out after 10.4 s. The game's charge is far shorter than the chant, so it
  // plays the chant's last stretch ending right as the beam fires, then the blast while the beam is
  // out (looping its loud middle through a long clash). Cell's is pitched a little lower. Until the
  // file loads (or if it can't), the synthesised charge and beam carry it alone.
  // (chantEnd stops before the breath at the end of the chant, so even a short charge gets its loud part)
  const KAME = { src: 'assets/audio/kamehameha.mp3', chantEnd: 6.5, blast: 7.05, loopA: 7.6, loopB: 10.3, gain: 2.2 };
  let kameBuf = null;
  const kamePlaying = new Map();
  function loadKame() {
    if (typeof fetch !== 'function') return;
    fetch(KAME.src).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { kameBuf = buf; }).catch(() => { /* synth only */ });
  }
  const kameRate = (who, big) => (who === 'cell' ? 0.9 : 1) * (big ? 0.92 : 1);
  function kameClip(owner, offset, dur, rate, loop) {
    const t = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = kameBuf; s.playbackRate.value = rate;
    if (loop) { s.loop = true; s.loopStart = KAME.loopA; s.loopEnd = KAME.loopB; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(KAME.gain, t + 0.04);
    if (dur) { g.gain.setValueAtTime(KAME.gain, t + Math.max(0.05, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04); }
    s.connect(g); g.connect(sfxBus); s.start(t, offset); if (dur) s.stop(t + dur + 0.1);
    const list = kamePlaying.get(owner) || []; list.push({ s, g }); kamePlaying.set(owner, list);
    duck(true);
    s.onended = () => { const l = kamePlaying.get(owner); if (l) { const i = l.findIndex(x => x.s === s); if (i >= 0) l.splice(i, 1); if (!l.length) { kamePlaying.delete(owner); if (!kamePlaying.size) duck(false); } } };
  }
  // the end of the chant, finishing as the charge does (too short a charge gets none: a quick
  // counter beam is just the blast)
  function kameChant(owner, dur, big) {
    init(); if (!kameBuf || dur < 0.45) return false;
    const rate = kameRate(owner.who, big);
    kameClip(owner, Math.max(0.85, KAME.chantEnd - dur * rate), dur, rate, false);
    return true;
  }
  // "HA!" and the beam, held as long as the beam lasts
  function kameBlast(owner, big) {
    init(); if (!kameBuf) return false;
    kameClip(owner, KAME.blast, 0, kameRate(owner.who, big), true);
    return true;
  }
  function stopKame(owner) {
    const l = kamePlaying.get(owner);
    if (!l || !ac) return;
    const t = ac.currentTime;
    for (const { s, g } of l) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.12); try { s.stop(t + 0.6); } catch (e) { /* already stopped */ } }
  }

  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  // up to +/- one semitone, and +/- about 2 dB
  const vary = () => Math.pow(2, (Math.random() * 2 - 1) / 12);
  const level = () => 0.8 + Math.random() * 0.4;
  // the same effect fired again within `gap` seconds is skipped, so spam (ki blasts, beam struggles,
  // combo whiffs) stays punchy instead of piling into mush
  const lastAt = {};
  function busy(k, gap) {
    const t = ac.currentTime, last = lastAt[k];
    if (last !== undefined && t >= last && t - last < gap) return true;
    lastAt[k] = t; return false;
  }

  function tone(type, f0, f1, t, dur, vol, dest = sfxBus) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, vol, filter = 'highpass', f0 = 1000, f1 = f0, dest = sfxBus) {
    const s = ac.createBufferSource(), g = ac.createGain(), bq = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    bq.type = filter; bq.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(bq); bq.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // Rise into a noisy ki sweep, then let it crack and fall away.
  function sweepNoise(t, dur, vol, filter = 'bandpass', f0 = 500, f1 = 4000, dest = sfxBus) {
    const s = ac.createBufferSource(), g = ac.createGain(), bq = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; bq.type = filter;
    bq.frequency.setValueAtTime(f0, t); bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.16, dur * 0.28));
    g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(bq); bq.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  // ---- anime fight sound kit ----
  // Every effect is built from layers the way fighting-game hits are: a sharp crack on top, a body
  // pushed through a soft clipper for crunch, and a low thump; big moments also go into a short
  // generated "arena" reverb so they ring out instead of stopping dead.
  let verbIn = null, crunch = null;
  function buildKit() {
    const len = Math.floor(ac.sampleRate * 1.6), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ac.createConvolver(); conv.buffer = ir;
    const damp = ac.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 3800;
    const ret = ac.createGain(); ret.gain.value = 0.5;
    verbIn = ac.createGain(); verbIn.connect(conv); conv.connect(damp); damp.connect(ret); ret.connect(sfxBus);
    crunch = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 3) / Math.tanh(3); }
    crunch.curve = curve; crunch.oversample = '2x';
    const cg = ac.createGain(); cg.gain.value = 0.8; crunch.connect(cg); cg.connect(sfxBus);
  }
  // one sound's output: straight to the effects bus, plus `wet` of it into the reverb
  function voice(wet = 0.15, gain = 1) {
    const g = ac.createGain(); g.gain.value = gain; g.connect(sfxBus);
    if (wet > 0) { const s = ac.createGain(); s.gain.value = wet; g.connect(s); s.connect(verbIn); }
    return g;
  }
  // the same, but through the clipper first
  function dirty(wet = 0.2) {
    const g = ac.createGain(); g.connect(crunch);
    if (wet > 0) { const s = ac.createGain(); s.gain.value = wet; g.connect(s); s.connect(verbIn); }
    return g;
  }
  function filt(type, f, dest, q = 0.7) {
    const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b;
  }
  // electric ki crackle: tiny bright snaps scattered over a span
  function crackle(t, span, n, vol, dest) {
    for (let i = 0; i < n; i++) {
      const at = t + Math.random() * span, f = 2500 + Math.random() * 5000;
      noise(at, 0.012 + Math.random() * 0.02, vol * (0.5 + Math.random() * 0.5), 'bandpass', f, f * 0.7, dest);
    }
  }

  // Held sounds (the aura while charging ki, the roar of a beam) are kept per fighter, so starting
  // one again replaces it instead of stacking, and the game stops it when the move ends.
  const sustained = new Map();
  function startSustain(owner, kind) {
    init(); stopSustain(owner);
    const t = ac.currentTime, beam = kind === 'beam', srcs = [];
    const out = voice(beam ? 0.3 : 0.22, 0);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(beam ? 0.6 : 0.9, t + (beam ? 0.06 : 0.3));
    const layer = (type, f, q, gain) => {
      const s = ac.createBufferSource(), g = ac.createGain();
      s.buffer = noiseBuf; s.loop = true; g.gain.value = gain;
      const b = filt(type, f, g, q); s.connect(b); g.connect(out); s.start(t, Math.random() * 1.5); srcs.push(s);
      return { b, g };
    };
    const osc = (type, f, gain, dest = out) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.value = gain;
      o.connect(g); g.connect(dest); o.start(t); srcs.push(o); return o;
    };
    // a slow wobble on a gain, for the flutter of an aura or a beam
    const wobble = (param, rate, depth) => {
      const l = ac.createOscillator(), g = ac.createGain(); l.frequency.value = rate; g.gain.value = depth;
      l.connect(g); g.connect(param); l.start(t); srcs.push(l);
    };
    if (beam) {
      // Kamehameha roar: a dense rushing core, a low rumble, a hum under it and a sizzle on top
      const core = layer('bandpass', 700, 0.6, 0.7); wobble(core.g.gain, 6, 0.15);
      layer('lowpass', 220, 0.7, 0.8);
      osc('sawtooth', 55, 0.25, filt('lowpass', 300, out)); osc('sawtooth', 82.6, 0.12, filt('lowpass', 300, out));
      const sizzle = layer('highpass', 4500, 0.7, 0.09); wobble(sizzle.g.gain, 17, 0.04);
    } else {
      // aura: a fluttering roar that opens up the longer you hold it, rumble and sub underneath
      const roar = layer('lowpass', 380, 1.2, 0.55);
      roar.b.frequency.setTargetAtTime(1200, t, 1.5);
      wobble(roar.g.gain, 9, 0.18); wobble(roar.g.gain, 13.7, 0.12);
      // a slow swell under the flutter, so the aura breathes ("whoom... whoom") instead of hissing flat
      const body = layer('bandpass', 180, 0.9, 0.5); wobble(body.g.gain, 1.7, 0.22);
      const sub = osc('sine', 46, 0.22); sub.frequency.setTargetAtTime(60, t, 2);
      layer('highpass', 5000, 0.7, 0.035);
    }
    // electric crackles sprinkled over the held sound
    const spark = setInterval(() => { if (Math.random() < 0.5) crackle(ac.currentTime, 0.06, 1, beam ? 0.1 : 0.14, out); }, 70);
    sustained.set(owner, { out, srcs, spark, beam });
  }

  function stopSustain(owner) {
    const v = sustained.get(owner);
    if (!v || !ac) return;
    sustained.delete(owner); clearInterval(v.spark);
    const t = ac.currentTime;
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0.0001, t, v.beam ? 0.12 : 0.08);
    for (const s of v.srcs) { try { s.stop(t + 0.7); } catch (e) { /* already stopped */ } }
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
    // hits, whooshes and blasts repeat a lot: each play gets a slightly different pitch and level
    // light hit: a slap, a crunchy body and a short thump
    punch() {
      init(); if (busy('punch', 0.02)) return;
      const t = ac.currentTime, p = vary(), v = level(), out = voice(0.12), dirt = dirty(0.1);
      noise(t, 0.005, 0.5 * v, 'highpass', 7000, 7000, out); // the anime "snap" at the very front
      noise(t, 0.018, 0.55 * v, 'highpass', 3500 * p, 2500, out);
      noise(t, 0.09, 0.75 * v, 'bandpass', 1500 * p, 450 * p, dirt);
      tone('sine', 190 * p, 52, t, 0.13, 0.85 * v, out);
    },
    // medium hit: lower and longer
    kick() {
      init(); if (busy('kick', 0.02)) return;
      const t = ac.currentTime, p = vary(), v = level(), out = voice(0.18), dirt = dirty(0.15);
      noise(t, 0.006, 0.5 * v, 'highpass', 6000, 6000, out);
      noise(t, 0.022, 0.5 * v, 'highpass', 2800 * p, 1800, out);
      noise(t, 0.14, 0.85 * v, 'bandpass', 1000 * p, 260 * p, dirt);
      tone('sine', 150 * p, 42, t, 0.2, 1 * v, out);
      tone('triangle', 320 * p, 80, t, 0.08, 0.3 * v, out);
    },
    // heavy hit (launchers, knockdowns, wall bounces, slams): a crack, a boom and a rumble that rings
    smash() {
      init(); const t = ac.currentTime, p = vary(), v = level(), out = voice(0.35), dirt = dirty(0.3);
      noise(t, 0.03, 0.8 * v, 'highpass', 2600 * p, 1600, out);
      noise(t, 0.32, 1 * v, 'lowpass', 3200 * p, 160, dirt);
      tone('sine', 110 * p, 30, t, 0.5, 1.1 * v, out);
      tone('triangle', 260 * p, 60, t, 0.18, 0.35 * v, dirt);
      noise(t + 0.05, 0.7, 0.25 * v, 'lowpass', 500, 90, out);
      // a second crack a beat later ("ba-BOOM"), the shockwave catching up with the fist
      noise(t + 0.04, 0.05, 0.4 * v, 'bandpass', 1800 * p, 900, dirt);
      tone('sine', 58 * p, 26, t + 0.02, 0.6, 0.45 * v, out);
    },
    // a hit on a guard: a dull thud and the ki shield's shimmer
    block() {
      init(); const t = ac.currentTime, p = vary(), out = voice(0.2, 1.6);
      tone('sine', 150 * p, 70, t, 0.11, 0.6, out);
      noise(t, 0.06, 0.35, 'bandpass', 2200 * p, 1200, out);
      tone('sine', 1320 * p, 1250 * p, t + 0.01, 0.22, 0.06, out);
      tone('sine', 1980 * p, 1900 * p, t + 0.01, 0.18, 0.04, out);
    },
    // a swing, dash or jump: air rising past, then closing back in behind
    whoosh() {
      init(); if (busy('whoosh', 0.03)) return;
      const t = ac.currentTime, p = vary(), d = 0.18 + Math.random() * 0.1, out = voice(0.1, 2.8);
      sweepNoise(t, d, 0.42 * level(), 'bandpass', 450 * p, 2800 * p, out);
      sweepNoise(t + d * 0.4, d * 0.8, 0.2, 'bandpass', 2400 * p, 700 * p, out);
      noise(t, d, 0.25, 'lowpass', 700, 200, out);
    },
    // a ki blast leaving the hand
    // "dshoom": a snap off the palm, a low push and a puff of air falling away (not a laser "pew")
    blast() {
      init(); if (busy('blast', 0.03)) return;
      const t = ac.currentTime, p = vary(), v = level(), out = voice(0.22), dirt = dirty(0.15);
      noise(t, 0.012, 0.45 * v, 'highpass', 5000, 3000, out);
      tone('sine', 260 * p, 70, t, 0.16, 0.8 * v, out);
      noise(t, 0.24, 0.7 * v, 'bandpass', 2200 * p, 380 * p, dirt);
      tone('sawtooth', 380 * p, 120 * p, t, 0.14, 0.12 * v, filt('lowpass', 1400, out));
      sweepNoise(t + 0.03, 0.3, 0.22 * v, 'bandpass', 2500 * p, 800 * p, out);
    },
    // a ki blast bursting on someone (or two blasts cancelling out)
    kiHit() {
      init(); if (busy('kiHit', 0.035)) return;
      const t = ac.currentTime, p = vary(), v = level(), out = voice(0.3), dirt = dirty(0.2);
      noise(t, 0.025, 0.6 * v, 'highpass', 4000, 2000, out);
      noise(t, 0.25, 0.8 * v, 'lowpass', 4500 * p, 250, dirt);
      tone('sine', 160 * p, 40, t, 0.25, 0.8 * v, out);
      crackle(t, 0.15, 4, 0.15, out);
    },
    // beams pushing against each other, and a beam burning into someone
    // (fired several times a second during a struggle): a grinding surge with an electric buzz under it
    clash() {
      init(); if (busy('clash', 0.04)) return;
      const t = ac.currentTime, p = vary(), v = level(), out = voice(0.3, 0.9), dirt = dirty(0.25);
      const f = 900 + Math.random() * 1400, v2 = v * 0.75;
      noise(t, 0.16, 0.6 * v2, 'bandpass', f, f * 0.45, dirt);
      tone('sawtooth', 62 * p, 48 * p, t, 0.18, 0.3 * v, filt('lowpass', 400, out));
      tone('sine', 80 * p, 40, t, 0.16, 0.6 * v, out);
      crackle(t, 0.12, 4, 0.22, out);
    },
    // gathering a beam ("Ka... me... ha... me..."): a rising whine whose vibrato speeds up as it fills,
    // gathering wind and pressure underneath, crackling more towards the end
    charge(dur = 1.4) {
      init(); const t = ac.currentTime, d = Math.max(0.2, dur), out = voice(0.35, 1.8);
      const o = ac.createOscillator(), o2 = ac.createOscillator(), vib = ac.createOscillator();
      const g = ac.createGain(), g2 = ac.createGain(), vg = ac.createGain();
      o.type = 'sawtooth'; o2.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(440, t + d);
      o2.frequency.setValueAtTime(330, t); o2.frequency.exponentialRampToValueAtTime(1760, t + d);
      vib.frequency.setValueAtTime(5, t); vib.frequency.linearRampToValueAtTime(16, t + d);
      vg.gain.setValueAtTime(4, t); vg.gain.linearRampToValueAtTime(30, t + d);
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      const lp = filt('lowpass', 500, g, 2);
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3500, t + d);
      // a second saw a few cents sharp makes the whine shimmer instead of buzzing thin
      const o3 = ac.createOscillator(); o3.type = 'sawtooth';
      o3.frequency.setValueAtTime(110.6, t); o3.frequency.exponentialRampToValueAtTime(442.3, t + d);
      vg.connect(o3.frequency); o3.connect(lp); o3.start(t); o3.stop(t + d + 0.15);
      o.connect(lp); g2.gain.value = 0.35; o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.26, t + d * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
      g.connect(out);
      for (const n of [o, o2, vib]) { n.start(t); n.stop(t + d + 0.15); }
      sweepNoise(t, d + 0.1, 0.3, 'bandpass', 250, 3200, out);
      tone('sine', 40, 75, t, d + 0.1, 0.35, out);
      crackle(t + d * 0.3, d * 0.7, Math.round(6 + d * 10), 0.18, out);
      // the air rushing in to the hands just before the release
      sweepNoise(t + d * 0.6, d * 0.45, 0.2, 'highpass', 6000, 1500, out);
    },
    // "...HA!": the beam bursting out of the hands; the held roar starts with beamLoop
    beam() {
      init(); const t = ac.currentTime, out = voice(0.5), dirt = dirty(0.4);
      noise(t, 0.05, 0.6, 'highpass', 3000, 1500, out);
      noise(t, 0.6, 0.9, 'lowpass', 6000, 300, dirt);
      tone('sine', 130, 32, t, 0.7, 1, out);
      tone('sawtooth', 220, 55, t, 0.35, 0.25, dirt);
      sweepNoise(t, 0.5, 0.35, 'bandpass', 5000, 900, out);
      tone('sine', 62, 24, t, 1.1, 0.5, out); // sub drop: the ground taking the recoil
    },
    // Special Beam Cannon: a thin screaming "zzhiiiu" that drills across in half a second. A narrow
    // high tone (not the Kamehameha's wide roar) with a fast whirr on its level and pitch for the spiral
    cannon() {
      init(); const t = ac.currentTime, p = vary(), d = 0.55, out = voice(0.3, 1.6), dirt = dirty(0.15);
      noise(t, 0.01, 0.9, 'highpass', 4500, 4500, out); // the crack off the fingertip
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), spin = ac.createGain();
      const lfo = ac.createOscillator(), lg = ac.createGain(), fm = ac.createGain();
      o.type = 'sawtooth'; o2.type = 'square';
      o.frequency.setValueAtTime(2200 * p, t); o.frequency.exponentialRampToValueAtTime(900 * p, t + d);
      o2.frequency.setValueAtTime(1104 * p, t); o2.frequency.exponentialRampToValueAtTime(452 * p, t + d);
      // the spiral: a 45-60 Hz whirr pulsing the level and wobbling the pitch
      lfo.frequency.setValueAtTime(60, t); lfo.frequency.linearRampToValueAtTime(42, t + d);
      lg.gain.value = 0.45; fm.gain.value = 60; lfo.connect(lg); lg.connect(spin.gain); lfo.connect(fm); fm.connect(o.frequency);
      spin.gain.value = 0.55;
      const bp = filt('bandpass', 2400 * p, spin, 3); bp.frequency.setValueAtTime(3200 * p, t); bp.frequency.exponentialRampToValueAtTime(1300 * p, t + d);
      o.connect(bp); o2.connect(bp); spin.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.015);
      g.gain.setValueAtTime(0.4, t + d * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      g.connect(out);
      for (const n of [o, o2, lfo]) { n.start(t); n.stop(t + d + 0.05); }
      // the drill: a narrow band of noise screaming down with the tone
      noise(t, d, 0.6, 'bandpass', 7000 * p, 2200 * p, dirt);
      tone('sine', 140 * p, 50, t, 0.14, 0.45, out); // a small kick of recoil, much lighter than a beam's
    },
    kameChant, kameBlast, stopKame,
    chargeLoop(owner) { startSustain(owner, 'charge'); },
    beamLoop(owner) { startSustain(owner, 'beam'); },
    stopSustain,
    // the player taking a hard one: a dull crunch into the body, the wind knocked out, a dark sting
    // falling away under the hit (it plays on top of punch/kick, so it stays low and doesn't zap)
    hurt() {
      init(); if (busy('hurt', 0.06)) return;
      const t = ac.currentTime, p = vary(), v = level(), out = voice(0.18, 1.4), dirt = dirty(0.1);
      noise(t, 0.14, 0.55 * v, 'bandpass', 800 * p, 220 * p, dirt);
      tone('sine', 105 * p, 38, t, 0.24, 0.7 * v, out);
      tone('triangle', 260 * p, 110 * p, t + 0.01, 0.16, 0.2 * v, filt('lowpass', 800, out));
    },
    // a guard shattering: a crack, shield shards ringing and scattering, a heavy drop under it
    guardBreak() {
      init(); const t = ac.currentTime, p = vary(), out = voice(0.45, 1.2), dirt = dirty(0.3);
      noise(t, 0.025, 0.7, 'highpass', 4000, 2500, out);
      [2300, 3450, 5170, 6900].forEach((f, i) => { const r = f * p * (0.98 + Math.random() * 0.04); tone('sine', r, r * 0.97, t + 0.005, 0.25 - i * 0.04, 0.08, out); });
      crackle(t + 0.01, 0.25, 10, 0.25, out);
      noise(t, 0.2, 0.6, 'lowpass', 2500, 150, dirt);
      tone('sine', 95 * p, 32, t, 0.35, 0.8, out);
    },
    explode() {
      init(); const t = ac.currentTime, p = vary(), v = level(), out = voice(0.5), dirt = dirty(0.4);
      noise(t, 0.04, 0.8 * v, 'highpass', 3000, 1200, out);
      noise(t, 1.1, 1 * v, 'lowpass', 3500 * p, 70, dirt);
      tone('sine', 85 * p, 24, t, 1.2, 1.1 * v, out);
      tone('triangle', 200 * p, 40, t, 0.3, 0.35 * v, dirt);
      noise(t + 0.08, 1.6, 0.35 * v, 'lowpass', 420, 60, out);
      crackle(t + 0.05, 0.5, 6, 0.12, out);
    },
    // powering up (Super Saiyan, Cell evolving): the aura roars up from a rumble to a gale,
    // crackling harder as it peaks, then bursts
    powerup() {
      init(); const t = ac.currentTime, out = voice(0.4), dirt = dirty(0.4), b = t + 1.25;
      sweepNoise(t, 1.5, 0.7, 'lowpass', 200, 3000, out);
      sweepNoise(t, 1.5, 0.3, 'bandpass', 300, 5000, out);
      tone('sine', 38, 90, t, 1.5, 0.45, out);
      crackle(t + 0.2, 1.2, 22, 0.2, out);
      noise(b, 0.6, 0.7, 'lowpass', 5000, 200, dirt);
      tone('sine', 120, 35, b, 0.6, 0.8, out);
    },
    // the final blow: a huge hit that rings out into a slow-motion rumble while the K.O. banner shows
    ko() {
      init(); const t = ac.currentTime, out = voice(0.7), dirt = dirty(0.5);
      noise(t, 0.05, 0.8, 'highpass', 3000, 1200, out);
      noise(t, 0.9, 0.9, 'lowpass', 4000, 80, dirt);
      tone('sine', 70, 22, t, 1.6, 1, out);
      tone('sine', 140, 45, t, 0.5, 0.4, out);
      noise(t + 0.1, 1.8, 0.3, 'lowpass', 300, 50, out);
      sweepNoise(t + 0.05, 1.4, 0.2, 'bandpass', 3000, 300, out);
    },
    blip() { init(); if (busy('blip', 0.03)) return; tone('square', 880, 880, ac.currentTime, 0.04, 0.08); },
  };

  // a perfect block rings out like struck metal
  sfx.parry = () => {
    init(); const t = ac.currentTime, out = voice(0.55);
    [[1870, 0.22], [2810, 0.14], [4190, 0.09], [935, 0.12]].forEach(([f, g]) => tone('sine', f, f * 0.995, t, 0.7, g, out));
    noise(t, 0.03, 0.5, 'highpass', 5000, 3000, out);
    tone('sine', 160, 60, t, 0.12, 0.6, out);
  };
  // Instant Transmission / vanish: a quick "shwip" with a faint ring after it
  sfx.teleport = () => {
    init(); if (busy('teleport', 0.05)) return;
    const t = ac.currentTime, p = vary(), out = voice(0.3, 2);
    noise(t, 0.008, 0.35, 'highpass', 6000, 6000, out); // the pop out of the air
    // two fast rising zips a hair apart: the flicker of a body vanishing
    sweepNoise(t, 0.09, 0.55, 'bandpass', 1400 * p, 9000 * p, out);
    sweepNoise(t + 0.05, 0.08, 0.24, 'bandpass', 1800 * p, 10000 * p, out);
    tone('sine', 1500 * p, 4200 * p, t, 0.07, 0.08, out);
    tone('sine', 3300 * p, 3250 * p, t + 0.08, 0.3, 0.03, out); // a faint ring left behind
  };

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
      if (ac) route(a);
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

  // a music file joins the mix through the music bus (once the audio context exists)
  function route(a) {
    if (a.routed) return;
    try { ac.createMediaElementSource(a).connect(musicBus); a.routed = true; } catch (e) { /* plays unrouted */ }
  }

  // dip the music while a line is spoken, then let it come back up
  function duck(on) {
    if (!ac) return;
    duckBus.gain.setTargetAtTime(on ? 0.35 : 1, ac.currentTime, on ? 0.04 : 0.35);
  }

  function setVolume(bus, level) {
    vol[bus] = Math.max(0, Math.min(10, level));
    try { localStorage.setItem('volumes', JSON.stringify(vol)); } catch (e) { /* not saved */ }
    if (!ac) return;
    if (bus === 'music') musicBus.gain.setTargetAtTime(gainOf(vol.music), ac.currentTime, 0.05);
    else { sfxBus.gain.setTargetAtTime(gainOf(vol.sfx) * 0.7, ac.currentTime, 0.05); sfx.blip(); }
  }

  // Adaptive layer: a heartbeat that fades in under everything while you're close to defeat.
  let beatTimer = null;
  function heartbeat(on) {
    if (on === !!beatTimer || !ac) return;
    if (!on) { clearInterval(beatTimer); beatTimer = null; return; }
    const thump = () => { const t = ac.currentTime; tone('sine', 70, 40, t, 0.16, 0.6); tone('sine', 62, 36, t + 0.2, 0.16, 0.45); };
    thump(); beatTimer = setInterval(thump, 850);
  }

  return { init, playMusic, stopMusic, sfx, music, duck, setVolume, vol, heartbeat };
})();
window.Audio8 = Audio8;

// Voice clips. The game calls Voice.speak / Voice.shout with every line and shout; a line only makes a
// sound if it has a recording listed in VOICE_CLIPS (none yet). To add one, drop the file in
// assets/audio/voice/ and map "who:exact line" to it, e.g.
//   'goku:Kamehameha!': 'assets/audio/voice/goku-kamehameha.mp3',
// The music dips while a clip plays.
const VOICE_CLIPS = {
};
const Voice = {
  on: true,
  playing: null,
  speak(who, text) {
    const src = VOICE_CLIPS[who + ':' + text];
    if (!this.on || !src) return;
    if (this.playing) this.playing.pause();
    const a = new Audio(src);
    this.playing = a;
    Audio8.duck(true);
    a.onended = a.onerror = () => { if (this.playing === a) Audio8.duck(false); };
    a.play().catch(() => Audio8.duck(false));
  },
  shout(who, text) { this.speak(who, text); },
};
window.Voice = Voice;
