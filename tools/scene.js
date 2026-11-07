// Puts the game into a fixed scene and holds it there, for comparing screenshots between versions
// (say the canvas build on main and this one). Paste into the console, then: scene('kame')
// Random numbers are seeded and time steps are fixed, so the same scene comes out the same.
(function () {
  window.scene = function (name) {
    let seed = 7;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    if (!window.__realStep) window.__realStep = window.step;
    const run = (frames) => { for (let i = 0; i < frames; i++) if (window.__realStep(1 / 60) !== 'frozen') pressed.clear(); };
    window.step = () => 'frozen';
    game.menu = [];
    const fight = (side) => { reset(side); place(); timers = []; game.mode = 'fight'; game.skip = true; };
    if (name === 'select') { reset(); game.mode = 'select'; game.pick = 1; game.t = 0.3; return; }
    if (name === 'pause') { fight('goku'); run(30); game.mode = 'paused'; game.menu = [{ id: 'pause', i: 1 }]; return; }
    if (name === 'kame') { fight('goku'); run(20); player.ki = 100; setForm(player, 'ssj'); goku.aura = 1; startKame(player); run(110); return; }
    if (name === 'spirit') { fight('goku'); run(20); player.ki = 100; spiritBomb(player); run(70); return; }
    if (name === 'cell') { fight('cell'); run(40); game.phase = 2; setForm(boss, 'ssj'); boss.hp = boss.maxHp * 0.5; player.ki = 60; run(90); return; }
    if (name === 'barrier') { fight('cell'); run(20); player.ki = 100; barrier(player); run(8); return; }
  };
})();
