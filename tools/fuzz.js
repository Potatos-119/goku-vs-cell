// Fuzz tester: plays random fights at high speed and watches for things that must never happen
// (a crash, a fighter stuck in one state, a value that isn't a number, someone outside the ring, a
// cutscene that never ends). Open the game (http://localhost:8766), open the browser console, paste
// this whole file in, then run:
//
//   await runFuzz()                                   // every mode, 8 seeds each, 4 minutes of play per run
//   await runFuzz({ modes: ['versus'], seeds: 20 })   // one mode, more seeds
//   await runFuzz({ modes: ['goku'], seed0: 37, seeds: 1, seconds: 600, verbose: true })   // replay one
//
// Modes: 'goku' and 'cell' are story mode from the intro to the ending (the tester chips at the boss
// so every phase, the Cell Juniors and the final clash come up, and keeps the player alive most of the
// time), 'versus' is two random players, 'training' is the dummy set to fight back.
// Random numbers are seeded, so a seed that finds something finds it again. It takes over the game
// loop while it runs and puts it back afterwards; reload the page before playing.
(function () {
  const ACTIONS = ['punch', 'kick', 'grab', 'ki', 'beam', 'ult', 'cannon', 'vanish', 'barrier', 'junior', 'transform', 'dash', 'jump'];
  const HELD = ['left', 'right', 'block', 'charge', 'ki'];
  // how long a fighter may stay in one state during a fight before it counts as stuck (seconds)
  const MAX_IN_STATE = {
    hurt: 3, knock: 7, tele: 1.5, airAtk: 3, attack: 3, cast: 3, dash: 1.5, windup: 1.5, appear: 2, land: 1.5,
    barrier: 1.5, kameCharge: 4, kameFire: 24, pose: 3, spirit: 4, spiritThrow: 2, ult1: 3, ult2: 3, ult3: 3,
    transform: 4, evolve: 3, kaioUp: 2, flare: 1.5, superUp: 1.5, superDash: 1.5, powerDown: 3, kiHold: 3, down: 2.5, jump: 4,
  };
  const MAX_IN_MODE = { cut: 60, ko: 40, ready: 6, intro: 90 };

  function makeRng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  }

  async function runOne(realStep, mode, seed, seconds, verbose) {
    const rng = makeRng(seed * 7919 + mode.length * 104729);
    const realRandom = Math.random; Math.random = rng;
    const found = [], seen = new Set(), trail = [];
    const report = (kind, detail) => {
      const key = kind + '|' + detail.replace(/-?\d+(\.\d+)?/g, '#');
      if (seen.has(key)) return;
      seen.add(key);
      // what both fighters were doing at that moment, so a find can be understood without replaying it
      const snap = f => `${f.who}[${f.state}/${f.anim} x${f.x.toFixed(0)} y${f.y.toFixed(0)} vx${f.vx.toFixed(0)} vy${f.vy.toFixed(0)} hp${f.hp.toFixed(0)} ki${f.ki.toFixed(0)} t2:${(+f.t2).toFixed(2)} jug${f.juggle}${f.floating ? ' floating' : ''}${f.visible ? '' : ' hidden'}${f.wallBounce ? ' wallBounce' : ''}]`;
      const scene = `${snap(goku)} ${snap(cell)} beams${beams.length} projs${projs.length}${clash ? ' clash' : ''}${game.spirit ? ' spirit:' + game.spirit.phase : ''}${game.react ? ' react' : ''} freeze${game.freeze.toFixed(2)}`;
      found.push({ mode, seed, at: +(frame / 60).toFixed(2), kind, detail, scene, trail: trail.slice(-12).join(' > ') });
      if (verbose) console.warn('[fuzz]', mode, 'seed', seed, 't', (frame / 60).toFixed(2), kind, detail);
    };
    let frame = 0;
    const onErr = e => report('error', String((e.reason && e.reason.stack) || e.message || e.reason || e).slice(0, 400));
    addEventListener('unhandledrejection', onErr); addEventListener('error', onErr);

    // start the mode the way the menus do
    const side = mode === 'cell' ? 'cell' : mode === 'goku' ? 'goku' : rng() < 0.5 ? 'goku' : 'cell';
    game.menu = [];
    if (mode === 'versus') startVersus(side);
    else if (mode === 'training') { TRAIN.dummy = 'fight'; startTraining(side); }
    else { reset(side); intro(); }

    const held = new Map([[P1, {}], [P2, {}]]);
    const set = (c, a, down) => withController(c, () => setHeld(c.kbHeld, a, down));
    const releases = [];
    const players = () => game.versus ? [P1, P2] : [P1];
    const watch = new Map(); // fighter -> { state, t }
    let modeName = game.mode, modeT = 0, hidden = new Map(), hang = new Map(), orphan = 0, ends = 0, lastTrail = '';

    try {
      for (frame = 0; frame < seconds * 60; frame++) {
        // ---- random input ----
        for (const c of players()) {
          const h = held.get(c);
          if (rng() < 0.06) { const a = HELD[Math.floor(rng() * HELD.length)]; h[a] = !h[a]; set(c, a, h[a]); }
          // don't sit in a guard or a charge for ever
          if (rng() < 0.02) for (const a of HELD) if (h[a]) { h[a] = false; set(c, a, false); }
          if (rng() < 0.16) { const a = ACTIONS[Math.floor(rng() * ACTIONS.length)]; set(c, a, true); releases.push([c, a]); }
          // a beam clash wants mashing
          if (clash && rng() < 0.35) { set(c, 'jump', true); releases.push([c, 'jump']); }
        }
        // dialogue and cut-ins move on with Enter
        if ((game.dlg || game.cutin || game.mode === 'end') && rng() < 0.12) { set(P1, 'confirm', true); releases.push([P1, 'confirm']); }
        // ---- cheats, so a random player sees the whole game ----
        if (game.mode === 'fight') {
          for (const f of [goku, cell]) if (rng() < 0.004) f.ki = 100;
          if (!game.versus && !game.training) {
            if (boss.free && rng() < 0.03) boss.hp = Math.max(1, boss.hp - 4);
            if (player.hp < player.maxHp * 0.3 && rng() < 0.02) player.hp = player.maxHp;
            game.time = Math.max(game.time, 30);
          }
        }
        // ---- one step of the real game, then let the cutscenes' promises run ----
        let ret;
        try { ret = realStep(1 / 60); } catch (e) { report('exception', String(e.stack || e).slice(0, 400)); }
        if (ret !== 'frozen') { P1.pressed.clear(); P2.pressed.clear(); }
        for (const [c, a] of releases.splice(0)) set(c, a, false);
        for (let i = 0; i < 6; i++) await null;

        // ---- checks ----
        const tr = game.mode + ':' + player.state + '/' + boss.state;
        if (tr !== lastTrail) { trail.push(tr); lastTrail = tr; if (trail.length > 40) trail.shift(); }
        for (const f of [goku, cell]) {
          for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'ki', 'stamina', 'at', 't2', 'stun', 'inv', 'juggle', 'comboTaken'])
            if (!Number.isFinite(f[k])) report('not a number', `${f.who}.${k} = ${f[k]} in ${f.state}`);
          if (f.x < 0 || f.x > W) report('out of the ring', `${f.who}.x = ${f.x.toFixed(1)} in ${f.state}`);
          if (f.y > FLOOR + 0.5 || f.y < -120) report('out of the ring', `${f.who}.y = ${f.y.toFixed(1)} in ${f.state}`);
          if (f.hp < 0 || f.hp > f.maxHp + 0.01) report('health out of range', `${f.who}.hp = ${f.hp.toFixed(2)} / ${f.maxHp}`);
          if (f.ki < -0.01 || f.ki > 100.01) report('ki out of range', `${f.who}.ki = ${f.ki.toFixed(2)} in ${f.state} (${f.anim})`);
          if (!f.A()) report('missing animation', `${f.who} ${f.form} has no "${f.anim}" (state ${f.state})`);
          if (game.mode === 'fight') {
            const w = watch.get(f) || { state: null, t: 0 };
            if (w.state === f.state) w.t += 1 / 60; else { w.state = f.state; w.t = 0; }
            watch.set(f, w);
            const max = MAX_IN_STATE[f.state];
            if (max && w.t > max && f.hp > 0 && !(f.state === 'kiHold' && human(f))) report('stuck in a state', `${f.who} (${human(f) ? 'human' : 'ai'}) in "${f.state}" (${f.anim}) for ${w.t.toFixed(1)} s, y ${f.y.toFixed(0)}`);
            if (f.state === 'block' && !human(f) && !game.training && w.t > 6) report('stuck in a state', `${f.who} (ai) blocking for ${w.t.toFixed(1)} s`);
            hidden.set(f, f.visible ? 0 : (hidden.get(f) || 0) + 1 / 60);
            if (hidden.get(f) > 2) report('invisible', `${f.who} hidden for ${hidden.get(f).toFixed(1)} s in ${f.state}`);
            // hanging in the air without moving, outside the moves that hold him up
            const hanging = f.y < FLOOR - 1 && Math.abs(f.vy) < 0.01 && !['kameCharge', 'kameFire', 'spirit', 'spiritThrow', 'powerDown', 'tele', 'dash', 'pose'].includes(f.state);
            hang.set(f, hanging ? (hang.get(f) || 0) + 1 / 60 : 0);
            if (hang.get(f) > 1) report('hanging in the air', `${f.who} at y ${f.y.toFixed(0)} in ${f.state} (${f.anim}), floating ${!!f.floating}`);
          } else { watch.delete(f); hidden.set(f, 0); hang.set(f, 0); }
        }
        if (!Number.isFinite(game.freeze) || game.freeze > 1) report('bad freeze', String(game.freeze));
        if (!Number.isFinite(game.time) || !Number.isFinite(game.shake)) report('not a number', `game.time ${game.time} shake ${game.shake}`);
        orphan = clash && (clash.pb.owner.state !== 'kameFire' || clash.bb.owner.state !== 'kameFire') ? orphan + 1 / 60 : 0;
        if (orphan > 0.6) report('clash without a beam', `${clash.pb.owner.state} / ${clash.bb.owner.state}`);
        if (projs.length > 60 || beams.length > 2 || sparks.length > 400 || popups.length > 200 || timers.length > 60) report('leak', `projs ${projs.length} beams ${beams.length} sparks ${sparks.length} popups ${popups.length} timers ${timers.length}`);
        if (game.mode === modeName) modeT += 1 / 60; else { modeName = game.mode; modeT = 0; }
        if (MAX_IN_MODE[game.mode] && modeT > MAX_IN_MODE[game.mode]) { report('stuck in a mode', `"${game.mode}" for ${modeT.toFixed(0)} s, dlg ${!!game.dlg} cutin ${!!game.cutin} cine ${!!game.cine} react ${!!game.react} clash ${!!clash} timers ${timers.length}`); break; }
        // a fight that ended starts again (Enter on the result screen does it)
        if (game.mode === 'end') ends++;
        if (game.mode === 'select' || game.mode === 'title') break;
      }
    } finally {
      Math.random = realRandom;
      removeEventListener('unhandledrejection', onErr); removeEventListener('error', onErr);
      for (const c of [P1, P2]) withController(c, () => { for (const a in c.kbHeld) setHeld(c.kbHeld, a, false); });
    }
    return { found, frames: frame, phase: game.phase, endFrames: ends };
  }

  window.runFuzz = async function ({ modes = ['goku', 'cell', 'versus', 'training'], seeds = 8, seed0 = 1, seconds = 240, verbose = false } = {}) {
    const realStep = window.step, mute = Audio8.music.muted;
    const trainWas = { ...TRAIN }, saved = {};
    for (const k of ['training', 'difficulty', 'bests']) try { saved[k] = localStorage.getItem(k); } catch (e) { /* storage blocked */ }
    window.step = () => 'frozen'; // the page's own loop only draws: the tester moves the game
    const all = [], summary = [];
    const t0 = performance.now();
    try {
      for (const mode of modes) for (let s = seed0; s < seed0 + seeds; s++) {
        const r = await runOne(realStep, mode, s, seconds, verbose);
        all.push(...r.found);
        summary.push({ mode, seed: s, seconds: +(r.frames / 60).toFixed(0), reachedPhase: r.phase, finished: r.endFrames > 0, problems: r.found.length });
        await new Promise(r2 => setTimeout(r2, 0));
      }
    } finally {
      window.step = realStep;
      Object.assign(TRAIN, trainWas);
      for (const k in saved) try { if (saved[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); } catch (e) { /* storage blocked */ }
      reset(); game.mode = 'select';
      if (Audio8.music.muted !== mute) Audio8.music.toggleMute();
    }
    // the same problem from many seeds, counted once
    const byKind = {};
    for (const f of all) { const k = f.kind + ': ' + f.detail.replace(/-?\d+(\.\d+)?/g, '#'); (byKind[k] = byKind[k] || { count: 0, first: f }).count++; }
    console.table(summary);
    console.log(`fuzz: ${summary.length} runs, ${(summary.reduce((a, r) => a + r.seconds, 0) / 60).toFixed(0)} minutes of play in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${Object.keys(byKind).length} different problems`);
    return { summary, problems: Object.entries(byKind).map(([k, v]) => ({ problem: k, runs: v.count, ...v.first })) };
  };
})();
