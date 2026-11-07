reset();
Sheets.load().then(() => requestAnimationFrame(loop));
window.__game = () => ({ goku, cell, player, boss, game, beams, projs, startKame, bossPhase, instantKame, solarKame, setForm, reset, startFight });
