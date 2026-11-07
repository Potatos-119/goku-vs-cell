// Balance tester: plays the boss against a scripted player at high speed and measures how hard the
// boss hits. Open the game (http://localhost:8766), open the browser console, paste this whole file
// in, then run:
//
//   await runBalance()                          // every boss, phase and player style, Normal
//   await runBalance({ difficulty: 'hard' })    // the same on Hard
//   await runBalance({ bosses: ['cell'], phases: [2], styles: ['mixed'], seconds: 300 })
//
// It reloads nothing and takes over the game loop while it runs, so reload the page afterwards.
// The fight stays in the phase being measured: the boss's health is kept full (so no phase change
// starts) and the player's is topped up before it can reach zero, with every point of damage counted.
//
// Player styles:
//   idle  - stands still: the boss's full combos land, the worst case
//   block - holds block the whole time: how well the boss opens up a turtling player
//   mixed - a rough stand-in for a person: walks in, throws strings, blocks now and then, jumps
//
// Per run it reports: damage per second, combos landed per minute, average and biggest combo damage
// (unblocked hits in a row), chip damage through the guard, damage from cinematic finishers (not
// counted as combos), and the named combos the boss finished.
(function () {
  const styles = {
    idle: () => {},
    block: s => s.hold('block', true),
    mixed: (s, dt) => {
      s.t -= dt;
      if (s.t > 0) return;
      // a new decision every 0.2-0.4 s
      s.t = 0.2 + Math.random() * 0.2;
      for (const a of ['block', 'left', 'right']) s.hold(a, false);
      const dist = Math.abs(boss.x - player.x), toward = boss.x > player.x ? 'right' : 'left';
      const r = Math.random();
      if (dist > 50) { if (r < 0.75) s.hold(toward, true); else if (r < 0.85) s.press('ki'); else s.hold('block', true); return; }
      if (r < 0.45) s.press(r < 0.3 ? 'punch' : 'kick');
      else if (r < 0.75) s.hold('block', true);
      else if (r < 0.85) s.press('jump');
    },
  };

  function setPhase(ph) {
    game.phase = ph;
    if (boss.who === 'cell') setForm(boss, CELL_FORMS[ph]);
    else { if (ph >= 1) setForm(boss, 'ssj'); Object.assign(boss, GOKU_BOSS[ph]); }
  }

  // stepFn is the real game step: the page's own loop is paused while this runs
  function runOne(stepFn, bossWho, ph, style, seconds) {
    reset(bossWho === 'cell' ? 'goku' : 'cell');
    place(); timers = []; game.mode = 'fight'; game.skip = true;
    setPhase(ph);
    Object.assign(ai, { think: 0.8, vanishCd: 3, ultCd: 6, spam: 0, barrierCd: 5, assistCd: 6, cannonCd: 6, rolled: 0 });
    const out = { total: 0, chip: 0, ult: 0, ults: 0, combos: [], named: {} };
    let cur = 0;
    const realDamage = window.damage;
    window.damage = function (def, ...rest) {
      const before = def.hp, taken = def === player ? def.comboTaken : 0;
      const r = realDamage(def, ...rest);
      if (def === player && def.hp < before) {
        const d = before - def.hp;
        out.total += d;
        // cinematic finishers (Instant Kamehameha, Dragon Fist, Solar Kamehameha) are counted on their own
        if (rest[4] === 'ult') { out.ult += d; return r; }
        if (def.comboTaken > taken) { if (def.comboTaken === 1) { if (cur) out.combos.push(cur); cur = 0; } cur += d; }
        else out.chip += d;
      }
      return r;
    };
    // the boss announces the named combos it finishes (game.bossCombo.names), counted here
    const seen = new Set();
    const s = { t: 0, release: [], hold: (a, down) => setHeld(kbHeld, a, down), press: a => { setHeld(kbHeld, a, true); s.release.push(a); } };
    const dt = 1 / 60;
    try {
      for (let i = 0; i < seconds * 60; i++) {
        styles[style](s, dt);
        if (stepFn(dt) !== 'frozen') pressed.clear();
        for (const a of s.release.splice(0)) setHeld(kbHeld, a, false);
        boss.hp = boss.maxHp; game.time = 99;
        if (player.hp < 40) player.hp = player.maxHp;
        if (game.mode !== 'fight') { game.mode = 'fight'; game.cine = null; }
        for (const c of (game.bossCombo && game.bossCombo.names) || []) if (!seen.has(c)) { seen.add(c); out.named[c.name] = (out.named[c.name] || 0) + 1; }
      }
    } finally {
      window.damage = realDamage;
      for (const a in kbHeld) setHeld(kbHeld, a, false);
    }
    if (cur) out.combos.push(cur);
    const avg = out.combos.length ? out.combos.reduce((x, y) => x + y, 0) / out.combos.length : 0;
    return {
      boss: bossWho, phase: ph, style,
      dps: +(out.total / seconds).toFixed(2),
      combosPerMin: +(out.combos.length / seconds * 60).toFixed(1),
      avgCombo: +avg.toFixed(1),
      maxCombo: +Math.max(0, ...out.combos).toFixed(1),
      chipPerMin: +(out.chip / seconds * 60).toFixed(1),
      finisherDmgPerMin: +(out.ult / seconds * 60).toFixed(1),
      named: Object.entries(out.named).map(([k, v]) => k + ' x' + v).join(', '),
    };
  }

  window.runBalance = async function ({ bosses = ['goku', 'cell'], phases = [0, 1, 2], styles: st = ['idle', 'block', 'mixed'], seconds = 120, difficulty = 'normal' } = {}) {
    const realStep = window.step, prevDiff = settings.difficulty;
    window.step = () => 'frozen'; // pause the page's own loop: only the tester moves the game
    settings.difficulty = difficulty;
    const rows = [];
    try {
      for (const b of bosses) for (const ph of phases) for (const s of st) {
        rows.push(runOne(realStep, b, ph, s, seconds));
        await new Promise(r => setTimeout(r, 0)); // let the page breathe between runs
      }
    } finally {
      window.step = realStep; settings.difficulty = prevDiff;
    }
    console.table(rows);
    return rows;
  };
})();
