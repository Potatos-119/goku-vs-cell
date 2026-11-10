// Regression checks: each one sets up a small scene in the real game, plays it frame by frame and
// checks what happened. Open the game (http://localhost:8766), open the browser console, paste this
// whole file in, then run:
//
//   await runChecks()            // every check; prints a table, returns the rows
//   await runChecks('clash')     // only the checks with "clash" in their name
//
// Every check here is a bug that was found and fixed: it fails on the old code and passes on the new.
// It takes over the game loop while it runs and puts it back afterwards; reload the page before playing.
(function () {
  let realStep;
  const tick = async (n = 1, each) => {
    for (let i = 0; i < n; i++) {
      if (each) each(i);
      if (realStep(1 / 60) !== 'frozen') { P1.pressed.clear(); P2.pressed.clear(); }
      for (let k = 0; k < 6; k++) await null; // let the cutscenes' promises run
    }
  };
  const hold = (c, a, down) => withController(c, () => setHeld(c.kbHeld, a, down));
  const letGo = () => { for (const c of [P1, P2]) withController(c, () => { for (const a in c.kbHeld) setHeld(c.kbHeld, a, false); }); };
  // a fight with no boss AI, both fighters standing `gap` apart in the middle of the ring
  function scene({ side = 'goku', gap = 120, versus = false, training = false } = {}) {
    letGo();
    reset(side); game.menu = []; timers = []; place();
    game.mode = 'fight'; game.skip = false; game.versus = versus; game.training = training;
    if (versus) for (const f of [goku, cell]) f.hp = f.maxHp = 200;
    player.x = W / 2 - gap / 2; boss.x = W / 2 + gap / 2;
    window.noAI = true;
  }
  const expect = (ok, why) => { if (!ok) throw new Error(why); };

  const CHECKS = {
    // step() used to read R, M and F2 on every frame of a hit-freeze, because presses are kept through
    // a freeze for the fighters: the setting flipped once per frozen frame
    'a toggle key pressed during a hit-freeze works once': async () => {
      scene();
      const before = settings.calm;
      game.freeze = 0.1; // six frames
      hold(P1, 'calm', true);
      await tick(10);
      hold(P1, 'calm', false);
      const flipped = settings.calm !== before;
      if (flipped) toggleCalm(); // leave the player's setting as it was
      const popups0 = popups.filter(p => /CALM MODE/.test(p.text)).length;
      expect(flipped, 'calm mode ended up where it started (it flipped an even number of times)');
      expect(popups0 === 1, `${popups0} CALM MODE messages for one key press`);
    },

    // two ki blasts that cancel each other were only marked dead, and went on to hit this frame
    'a ki blast cancelled by another does not also hit': async () => {
      scene({ gap: 200 });
      const hp = player.hp, y = player.y - 30;
      // the boss's blast is arriving at the player just as the player's own leaves the hand
      projs.push({ owner: player, kind: 'kiBall', x: player.x + 14, y, dir: 1, vx: 300, dmg: 6, heavy: false, size: 1 });
      projs.push({ owner: boss, kind: 'finger', x: player.x + 24, y, dir: -1, vx: -330, dmg: 8, heavy: false, size: 1 });
      const sparks0 = sparks.length;
      await tick(1);
      expect(projs.length === 0, `${projs.length} blasts left after they met`);
      expect(player.hp === hp, `the cancelled blast still did ${(hp - player.hp).toFixed(1)} damage`);
      expect(sparks.length - sparks0 === 1, `${sparks.length - sparks0} sparks for one collision`);
    },

    // a counter beam fired point-blank could finish a Cell Junior and, in the same frame, lock beams
    // with it: the clash then ran on through the cutscene and into the next Junior's fight
    'no beam clash starts against a fighter who was just knocked out': async () => {
      scene({ gap: 24 });
      setForm(goku, 'ssj'); goku.ki = 100;
      game.phase = 1; game.juniors = { left: 3, hp: 100, maxHp: 300 };
      juniorIn();
      // close enough that the first instant of Goku's beam already reaches it
      Object.assign(cell, { x: goku.x + 24, facing: -1, inv: 0, hp: 1 });
      goku.facing = 1;
      // the Junior is already firing through Goku; Goku answers
      startKame(cell); cell.t2 = 0; await tick(2);
      expect(cell.state === 'kameFire', 'setup: the Junior is not firing (' + cell.state + ')');
      goku.hp = goku.maxHp; goku.play('idle');
      startKame(goku, true);
      let clashSeen = false, maxSeen = 0;
      await tick(150, () => { if (clash) { clashSeen = true; maxSeen++; } });
      expect(cell.hp <= 0 || game.juniors.left < 3, 'setup: the Junior was not knocked out');
      expect(!clashSeen, `a clash ran for ${maxSeen} frames against a knocked-out Junior`);
      expect(!(game.banner && /MASH/.test(game.banner.text)), 'MASH SPACE is still on screen');
    },

    // the story had one 150-second clock for every stage, and running out of it with more health
    // than the boss counted as winning the whole story
    'the story clock refills at each stage, and running out is not a win': async () => {
      scene();
      boss.hp = boss.maxHp * 0.66; game.time = 12;
      await tick(2); // the boss is at 2/3: the phase change starts
      expect(game.mode === 'cut', 'setup: the phase change did not start');
      game.skip = true; timers.forEach(t => t.r()); if (game.dlg) { const d = game.dlg; game.dlg = null; d.done(); }
      await tick(30, () => { if (game.dlg) { const d = game.dlg; game.dlg = null; d.done(); } if (game.cine) { game.cine.clock = 99; } });
      expect(game.mode === 'fight', 'setup: the phase change did not finish (' + game.mode + ')');
      expect(game.time > 100, `the clock was at 12 before the phase change and is at ${game.time.toFixed(0)} after it`);
      // now let it run out with the player in better shape than the boss
      game.skip = false; player.hp = player.maxHp; boss.hp = boss.maxHp * 0.5; game.time = 0.02;
      await tick(400, () => { if (game.dlg) { const d = game.dlg; game.dlg = null; d.done(); } });
      expect(game.mode === 'end', 'the fight did not end on time-up (' + game.mode + ')');
      expect(game.result !== 'win', 'time ran out in the second stage and the story was won');
    },

    // equal health when the clock ran out gave the match to player 2
    'versus: time-up with equal health is a draw': async () => {
      scene({ versus: true });
      game.time = 0.02;
      await tick(400);
      expect(game.mode === 'end', 'the match did not end on time-up (' + game.mode + ')');
      expect(game.result === 'draw', `both at full health and the result is "${game.result}"`);
    },

    // every new press of block opened a fresh perfect-block window, so tapping block quickly
    // perfect-blocked everything
    'tapping block quickly does not perfect-block every hit': async () => {
      scene({ gap: 28 });
      let hits = 0, perfects = 0, was = 0;
      const realDamage = window.damage;
      window.damage = function (def, ...rest) { const r = realDamage(def, ...rest); if (def === player && r) hits++; return r; };
      try {
        await tick(60 * 12, i => {
          hold(P1, 'block', i % 10 !== 9); // held nine frames, let go for one, over and over
          if (boss.free) { boss.facing = -1; boss.x = player.x + 28; startAttack(boss, 'p1'); }
          const now = popups.filter(p => /PERFECT!/.test(p.text)).length;
          if (now > was) perfects += now - was;
          was = now;
        });
      } finally { window.damage = realDamage; hold(P1, 'block', false); }
      expect(hits >= 6, 'setup: only ' + hits + ' hits reached the guard');
      expect(perfects <= hits * 0.34, `${perfects} of ${hits} hits were perfect blocks from tapping alone`);
    },
    // ...while one well-timed press still is one
    'one well-timed block is still a perfect block': async () => {
      scene({ gap: 28 });
      boss.facing = -1; startAttack(boss, 'p1');
      let got = false;
      await tick(30, i => { if (i === 1) hold(P1, 'block', true); if (popups.some(p => /PERFECT!/.test(p.text))) got = true; });
      hold(P1, 'block', false);
      expect(got, 'a block pressed just before the hit was not a perfect block');
    },

    // Cell's third punch used to knock them away along the ring
    "Cell's J J J ends in a slam that bounces them off the ring": async () => {
      scene({ side: 'cell', gap: 28 });
      startAttack(player, 'p3');
      let bounced = false, top = FLOOR;
      await tick(90, () => { if (popups.some(p => /GROUND BOUNCE/.test(p.text))) bounced = true; if (bounced) top = Math.min(top, boss.y); });
      expect(bounced, 'no ground bounce (the enemy ended in "' + boss.state + '")');
      expect(top < FLOOR - 20, `they only came ${(FLOOR - top).toFixed(0)} px back up off the ring`);
    },

    // each hit of a combo is worth less than the one before, after the first two
    'combo hits on the boss scale down: 100, 100, 90, 80... never under 30%': async () => {
      scene({ gap: 28 });
      const got = [];
      for (let n = 0; n < 10; n++) { boss.comboTaken = n; boss.state = 'hurt'; boss.inv = 0; const hp = boss.hp = boss.maxHp; game.freeze = 0; damage(boss, player, 10, false, 1, 'melee'); got.push(Math.round((hp - boss.hp) * 10)); }
      expect(got.join(',') === '100,100,90,80,70,60,50,40,30,30', 'ten 10-damage hits did ' + got.join(', ') + ' percent');
    },

    // a long juggle (a launcher, a re-launch, a beam carrying them) could lift a fighter off the top
    'a juggled fighter stays on screen': async () => {
      scene();
      let top = FLOOR;
      // the tallest route the game allows: a launcher, three air hits, the re-launch, two more air hits,
      // then a beam carrying them for a second and a half (the speeds are the ones in damage())
      const pops = { 16: -170, 30: -170, 44: -170, 58: -330, 74: -170, 88: -170 };
      boss.play('knock'); boss.y = FLOOR - 1; boss.vy = -390; boss.juggle = 1;
      await tick(260, i => {
        if (boss.state === 'knock') { if (pops[i]) boss.vy = pops[i]; else if (i > 100 && i < 190 && i % 6 === 0) boss.vy = -125; }
        top = Math.min(top, boss.y);
      });
      expect(top >= 44, `feet at y ${top.toFixed(0)}: the head is ${Math.max(0, 46 - top).toFixed(0)} px above the screen`);
    },
  };

  window.runChecks = async function (only = '') {
    realStep = window.step;
    const realRandom = Math.random, noAI = window.noAI, trainWas = { ...TRAIN };
    let seed = 11;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    window.step = () => 'frozen'; // the page's own loop only draws: the checks move the game
    const rows = [];
    try {
      for (const [name, fn] of Object.entries(CHECKS)) {
        if (!name.includes(only)) continue;
        let result = 'pass', why = '';
        try { await fn(); } catch (e) { result = 'FAIL'; why = e.message; }
        rows.push({ check: name, result, why });
      }
    } finally {
      Math.random = realRandom; window.step = realStep; window.noAI = noAI; Object.assign(TRAIN, trainWas);
      letGo(); reset(); game.mode = 'select';
    }
    console.table(rows);
    console.log(`${rows.filter(r => r.result === 'pass').length} of ${rows.length} checks pass`);
    return rows;
  };
})();
