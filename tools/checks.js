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

    // ...and W after the slam follows them up, so the combo carries on in the air
    "after Cell's slam, a jump and a punch continue the combo in the air": async () => {
      scene({ side: 'cell', gap: 28 });
      const press = async a => { hold(P1, a, true); await tick(1); hold(P1, a, false); };
      player.queue = ['p2', 'p3']; startAttack(player, 'p1');
      for (let i = 0; i < 200 && !(player.anim === 'p3' && player.hitLanded); i++) await tick(1);
      expect(player.anim === 'p3' && player.hitLanded, 'setup: the slam did not land');
      await press('jump');
      for (let i = 0; i < 20 && player.state !== 'jump'; i++) await tick(1); // the slam's hit-stop passes first
      expect(player.state === 'jump', 'W after the slam did not jump (' + player.state + ')');
      const hp = boss.hp;
      await press('punch'); await tick(20);
      expect(boss.hp < hp, 'the air punch after the slam missed (player y ' + player.y.toFixed(0) + ', enemy y ' + boss.y.toFixed(0) + ', enemy ' + boss.state + ')');
    },

    // the result screen's score sheet
    'a story fight is scored: time, combo, damage taken, and a grade for a win': async () => {
      const skip = () => { if (game.dlg) { const d = game.dlg; game.dlg = null; d.done(); } };
      scene({ gap: 28 });
      game.phase = 2; game.finalDone = true; // straight to the last blow
      boss.queue = []; startAttack(boss, 'p1'); await tick(30);
      const taken = game.stats.taken;
      expect(taken > 0, 'setup: the boss did not hit');
      player.queue = ['p2']; player.play('idle'); boss.play('idle'); boss.hp = 3; startAttack(player, 'p1');
      await tick(900, skip);
      expect(game.mode === 'end' && game.result === 'win', 'setup: the fight was not won (' + game.mode + ', ' + game.result + ')');
      const r = game.report;
      expect(r && r.win && /^[SABC]$/.test(r.grade), 'no grade on the report');
      expect(r.time > 0.4 && r.time < 30, 'time on the report is ' + (r && r.time));
      expect(Math.abs(r.taken - taken) < 0.01, `took ${taken.toFixed(1)} damage, the report says ${r.taken.toFixed(1)}`);
      expect(r.bestHits >= 1 && r.dealt > 0, 'the hits that won it are not on the report');
    },

    // the Senzu Bean used to be thrown while Krillin was still talking, and hung in the air until Enter
    'the Senzu Bean is thrown after Krillin calls, not during': async () => {
      scene();
      senzuBean(goku);
      await tick(90); // his line is on screen, nobody has pressed Enter
      expect(game.dlg && game.dlg.who === 'KRILLIN', 'setup: Krillin is not talking');
      expect(!game.bean, 'the bean is already in the air while he talks');
      const d = game.dlg; game.dlg = null; d.done(); await tick(10);
      expect(game.bean && game.bean.t < 0.3, 'the bean was not thrown once the line was read');
      game.skip = true; timers.forEach(t => t.r()); await tick(5);
    },

    // each hit of a combo is worth less than the one before, after the first two
    'combo hits on the boss scale down: 100, 100, 92, 84... never under 40%': async () => {
      scene({ gap: 28 });
      const got = [];
      for (let n = 0; n < 11; n++) { boss.state = 'hurt'; boss.inv = 0; const hp = boss.hp = boss.maxHp; game.freeze = 0; damage(boss, player, 10, false, 1, 'melee'); got.push(Math.round((hp - boss.hp) * 10)); }
      expect(got.join(',') === '100,100,92,84,76,68,60,52,44,40,40', 'eleven 10-damage hits did ' + got.join(', ') + ' percent');
    },
    // the scaling follows the hit counter: it used to start again whenever the enemy recovered for an
    // instant, with the counter still running
    'scaling carries on while the hit counter does, and starts again after it': async () => {
      scene({ gap: 28 });
      const hit = () => { boss.inv = 0; const hp = boss.hp = boss.maxHp; game.freeze = 0; damage(boss, player, 10, false, 1, 'melee'); return Math.round((hp - boss.hp) * 10); };
      hit(); hit(); hit();
      boss.play('idle'); await tick(20); // back on their feet for a third of a second
      expect(hit() === 84, 'the fourth hit, a third of a second later, was not the 84% one');
      boss.play('idle'); await tick(80); // well over a second with no hit: the combo is over
      expect(hit() === 100, 'a hit after the combo ended was still scaled');
    },
    // a beam used to weaken itself with every tick, even fired on its own
    'a beam does full damage on its own, and less at the end of a combo': async () => {
      const beam = async hitsFirst => {
        scene({ gap: 90 }); setForm(goku, 'ssj'); goku.ki = 100; boss.maxHp = boss.hp = 1000;
        for (let i = 0; i < hitsFirst; i++) { boss.inv = 0; game.freeze = 0; damage(boss, player, 1, false, 1, 'melee'); }
        boss.play('idle'); game.freeze = 0;
        const ticks = [], real = window.damage;
        window.damage = function (def, src, dmg, ...rest) { const hp = def.hp, r = real(def, src, dmg, ...rest); if (def === boss && rest[2] === 'beam') ticks.push((hp - def.hp) / dmg); return r; };
        try { startKame(player); player.t2 = 0.05; await tick(130, () => { game.time = 99; }); } finally { window.damage = real; }
        return ticks;
      };
      const raw = await beam(0), late = await beam(6);
      expect(raw.length >= 8, 'setup: the beam only ticked ' + raw.length + ' times');
      expect(raw.every(k => Math.abs(k - 1) < 0.001), 'a beam on its own did ' + raw.map(k => Math.round(k * 100)).join(', ') + ' percent per tick');
      expect(late.length >= 8 && late.every(k => Math.abs(k - 0.6) < 0.001), 'a beam after six hits did ' + late.map(k => Math.round(k * 100)).join(', ') + ' percent per tick (should be 60 throughout)');
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

    // ---- Goku's forms ----
    'the Kaioken costs ki to start, makes him the fastest, tears the gi top, and ends when the ki runs out': async () => {
      scene();
      player.ki = 60;
      hold(P1, 'junior', true); await tick(2); hold(P1, 'junior', false);
      await tick(95);
      expect(goku.form === 'kaioken', 'E with 60 ki did not start the Kaioken (' + goku.form + ', ' + goku.state + ')');
      expect(goku.torn, 'the gi top is still on');
      expect(goku.speed > GOKU_INFO.ssj.speed, `Kaioken speed ${goku.speed} is not above a Super Saiyan's`);
      expect(player.ki < 60 - KAIO_COST + 1, `it cost ${(60 - player.ki).toFixed(1)} ki (should be ${KAIO_COST} and counting)`);
      player.ki = 0.2;
      await tick(120);
      expect(goku.form === 'base', 'out of ki and still in the Kaioken (' + goku.form + ', ' + goku.state + ')');
    },

    'the Kaioken rush is three hits from one press': async () => {
      scene({ gap: 60 });
      setForm(goku, 'kaioken'); goku.torn = true; player.ki = 100; boss.maxHp = boss.hp = 1000;
      const seen = [];
      hold(P1, 'right', true); await tick(1); hold(P1, 'punch', true); await tick(2); hold(P1, 'punch', false);
      await tick(90, () => { if (goku.state === 'attack' && seen[seen.length - 1] !== goku.anim) seen.push(goku.anim); });
      hold(P1, 'right', false);
      expect(seen.join(' ') === 'rush rush2 rush3', 'toward + J played: ' + (seen.join(' ') || 'nothing'));
      expect(game.learned.has('KAIOKEN ASSAULT'), 'three hits landed (' + (1000 - boss.hp).toFixed(0) + ' damage) but KAIOKEN ASSAULT was not named');
    },

    'base Goku has a Kamehameha, weaker and slower than a Super Saiyan\'s': async () => {
      const fire = async form => {
        scene({ gap: 140 }); if (form !== 'base') setForm(goku, form);
        player.ki = 100; boss.maxHp = boss.hp = 1000;
        hold(P1, 'beam', true); await tick(2); hold(P1, 'beam', false);
        let at = null;
        await tick(260, i => { if (at === null && beams.length) at = i; });
        return { at, dmg: 1000 - boss.hp };
      };
      const base = await fire('base'), ssj = await fire('ssj');
      expect(base.at !== null, 'U as base Goku fired nothing');
      expect(base.dmg > 5, `the base beam did ${base.dmg.toFixed(1)} damage`);
      expect(base.at > ssj.at && base.dmg < ssj.dmg, `base: fires after ${base.at} frames for ${base.dmg.toFixed(0)}; Super Saiyan: ${ssj.at} frames for ${ssj.dmg.toFixed(0)}`);
    },

    // he used to rise into the sky for it; the sheet draws him standing under it
    // (it used to be gathered standing on the ring; he rises into the sky with it, as it first was)
    'the Spirit Bomb is gathered up in the sky, as big as he is, on screen': async () => {
      scene({ gap: 160 });
      player.ki = 100; spiritBomb(player);
      let top = FLOOR;
      await tick(80, () => { top = Math.min(top, player.y); });
      expect(FLOOR - top > 30, 'he only rose ' + Math.round(FLOOR - top) + ' px off the ring while gathering it');
      expect(game.spirit && game.spirit.r > 30, 'the bomb is ' + (game.spirit ? game.spirit.r.toFixed(0) : 'gone') + ' px across its radius');
      expect(game.spirit.y - game.spirit.r > 0, 'the top of the bomb is off the screen');
    },

    'hurt enough, Goku fights on with his gi top torn off': async () => {
      scene({ gap: 30 });
      expect(!goku.torn, 'setup: torn from the start');
      damage(player, boss, player.maxHp * 0.6, false, -1); await tick(2);
      expect(goku.torn, `at ${player.hp.toFixed(0)} of ${player.maxHp} health the gi is whole`);
      expect(goku.A('idle') === ANIMS.goku.baseT.idle, 'torn, but his stance is not the torn one');
    },

    // Cell's beam ended and he dropped to the ring, so Goku's last Instant Kamehameha "up in the sky" was
    // fired standing on the ground next to him
    // ---- the cutscene attacks ----
    'Super Saiyan with the gi torn: O dashes in, and a dash that lands plays the whole attack': async () => {
      scene({ gap: 110 });
      goku.torn = true; setForm(goku, 'ssj'); player.ki = 100;
      const hp = boss.hp;
      hold(P1, 'ult', true); await tick(2); hold(P1, 'ult', false);
      let cut = false, beam = false;
      await tick(420, () => { if (game.mode === 'cut') cut = true; if (beams.length) beam = true; });
      expect(cut, 'the dash reached him and no cutscene started (' + goku.state + ')');
      expect(beam, 'the attack never fired its Kamehameha');
      expect(hp - boss.hp > 40, `the whole attack did ${(hp - boss.hp).toFixed(0)} damage`);
      expect(game.mode === 'fight' && goku.state !== 'pose', 'the fight did not carry on after it (' + game.mode + ', ' + goku.state + ')');
    },

    'a cutscene attack that does not reach them is just a missed dash': async () => {
      scene({ gap: 30 });
      player.x = 30; boss.x = W - 20;
      goku.torn = true; setForm(goku, 'ssj'); player.ki = 100;
      const hp = boss.hp;
      superRush(goku);
      let cut = false;
      await tick(150, () => { if (game.mode === 'cut') cut = true; });
      expect(!cut, 'a cutscene started although the dash fell short');
      expect(boss.hp === hp, 'a missed dash did damage');
      expect(goku.free, 'he is stuck after a missed dash (' + goku.state + ')');
    },

    'in his full gi a Super Saiyan keeps the Dragon Fist on O': async () => {
      scene({ gap: 110 });
      setForm(goku, 'ssj'); player.ki = 100;
      hold(P1, 'ult', true); await tick(2); hold(P1, 'ult', false);
      expect(goku.state === 'ult1', 'O started ' + goku.state);
    },

    'the Kaioken: O at 50 ki is its own attack, and U is an ordinary Kamehameha': async () => {
      scene({ gap: 110 });
      player.ki = 100; goKaioken(goku); await tick(100);
      expect(goku.form === 'kaioken', 'setup: not in the Kaioken (' + goku.form + ')');
      player.ki = 60;
      const hp = boss.hp;
      hold(P1, 'ult', true); await tick(2); hold(P1, 'ult', false);
      let cut = false;
      await tick(420, () => { if (game.mode === 'cut') cut = true; });
      expect(cut, 'O at 60 ki did not start the attack (' + goku.state + ')');
      expect(hp - boss.hp > 25, `the whole attack did ${(hp - boss.hp).toFixed(0)} damage`);
      expect(GOKU_INFO.kaioken.kame.size === 1, 'the Kaioken\'s U is still the oversized beam');
    },

    'base Goku, O in the air: the Spirit Bomb tears his gi, and landing it makes him a Super Saiyan': async () => {
      scene({ gap: 110 });
      player.ki = 100; goku.y = FLOOR - 50; goku.vy = -120; goku.play('jump', 'jump');
      await tick(3);
      hold(P1, 'ult', true); await tick(2); hold(P1, 'ult', false);
      expect(goku.state === 'spirit' && goku.torn, 'O in the air gave ' + goku.state + (goku.torn ? '' : ', gi still on'));
      const hp = boss.hp;
      await tick(480);
      expect(goku.form === 'ssj' && goku.torn, 'after it landed he is ' + goku.form);
      expect(hp - boss.hp > 40, `it did ${(hp - boss.hp).toFixed(0)} damage`);
      expect(game.mode === 'fight', 'the fight did not carry on (' + game.mode + ')');
    },

    'the Spirit Bomb from the ring is the ordinary one: no Super Saiyan': async () => {
      scene({ gap: 110 });
      player.ki = 100;
      hold(P1, 'ult', true); await tick(2); hold(P1, 'ult', false);
      await tick(420);
      expect(goku.form === 'base', 'he turned ' + goku.form);
    },

    // thrown from the air, he used to fall to the ring before the bomb landed, and turn down there
    'the Spirit Bomb thrown from the air: he is still up there when it turns him': async () => {
      scene({ gap: 110 });
      player.ki = 100; goku.y = FLOOR - 50; goku.vy = 0; goku.play('jump', 'jump');
      spiritBomb(goku, false, false, true);
      let lowest = FLOOR - 50;
      await tick(420, () => { if (goku.form === 'base') lowest = Math.max(lowest, goku.y); });
      expect(goku.form === 'ssj', 'he is still ' + goku.form);
      expect(lowest < FLOOR - 20, 'he came down to ' + Math.round(FLOOR - lowest) + ' px off the ring before he turned');
    },

    'Cell\'s story: Goku goes Kaioken at two thirds and Super Saiyan at one third, on Easy too': async () => {
      const was = settings.difficulty; settings.difficulty = 'easy';
      try {
        scene({ side: 'cell' });
        const through = async () => {
          for (let k = 0; k < 60 && (k < 2 || game.mode !== 'fight'); k++)
            await tick(20, () => { if (game.dlg) { const d = game.dlg; game.dlg = null; d.done(); } if (game.cine) game.cine.clock = 99; });
        };
        boss.hp = boss.maxHp * 0.66; await tick(2); await through();
        expect(goku.form === 'kaioken', 'his second stage is ' + goku.form);
        await tick(400);
        expect(goku.form === 'kaioken', 'the Kaioken ran out during his second stage (' + goku.form + ')');
        boss.hp = boss.maxHp * 0.32; await tick(2); await through();
        expect(goku.form === 'ssj' && goku.torn, 'his last stage is ' + goku.form + (goku.torn ? '' : ' in his full gi'));
      } finally { settings.difficulty = was; }
    },

    'RETRY in the pause menu starts the fight again': async () => {
      scene();
      boss.hp = 50; player.hp = 40;
      expect(MENUS.pause().items.some(i => i.label === 'RETRY'), 'the pause menu has no RETRY');
      game.mode = 'paused'; openMenu('pause');
      MENUS.pause().items.find(i => i.label === 'RETRY').go();
      await tick(5);
      expect(player.hp === player.maxHp && boss.hp === boss.maxHp, `health after RETRY: ${player.hp} and ${boss.hp}`);
      expect(game.menu.length === 0 && game.mode !== 'paused', 'still paused (' + game.mode + ')');
    },

    'losing the final clash, Cell stays in the sky for Goku\'s last stand': async () => {
      scene();
      window.noAI = true; game.phase = 2; setForm(cell, 'perfect'); boss.hp = 0;
      let lastStandY = null, ended = false;
      for (let k = 0; k < 1500 && !ended; k += 20) {
        await tick(20, () => {
          if (game.dlg) { const d = game.dlg; game.dlg = null; d.done(); }
          if (clash) clash.s -= 0.004;
          if (goku.floating && goku.state === 'kameFire' && lastStandY === null) lastStandY = cell.y;
        });
        ended = game.mode === 'end';
      }
      expect(ended, 'the scene did not reach its end (' + game.mode + ')');
      expect(lastStandY !== null, 'setup: Goku never fired his last Kamehameha');
      expect(lastStandY < FLOOR - 40, `Cell was at y ${Math.round(lastStandY)} (the ring is ${FLOOR}) when Goku fired`);
      expect(game.result === 'lose', 'the clash was lost and the result is ' + game.result);
    },
  };

  window.runChecks = async function (only = '') {
    realStep = window.step;
    const realRandom = Math.random, noAI = window.noAI, trainWas = { ...TRAIN };
    let bestsWas = null; try { bestsWas = localStorage.getItem('bests'); } catch (e) { /* storage blocked */ }
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
      try { if (bestsWas == null) localStorage.removeItem('bests'); else localStorage.setItem('bests', bestsWas); } catch (e) { /* storage blocked */ }
      letGo(); reset(); game.mode = 'select';
    }
    console.table(rows);
    console.log(`${rows.filter(r => r.result === 'pass').length} of ${rows.length} checks pass`);
    return rows;
  };
})();
