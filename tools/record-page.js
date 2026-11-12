// Films the game frame by frame from inside the page, for README GIFs and for checking animations.
// Serve the project (tools/bake.js says how), open the game, paste this file into the console, then:
//
//   await recSetup()                                  // once: embeds the images and fonts
//   await recScene('name', () => { recFight(120); goku.ki = 100; }, 4, [{ t: 0.3, fn: () => instantKame(goku) }])
//
// It stops the game's own clock, steps it 1/60 s at a time, and every other step (30 a second) copies
// the screen (the game's SVG, with every picture and font embedded so it draws the same) onto a 640x360
// PNG and POSTs it to /save/<name>-0000.png on the server it was loaded from (a plain static server
// doesn't take POSTs: use one that writes them to a folder). Pack the PNGs into a GIF with a 256-colour
// palette per frame: one palette for the whole clip turns the colours muddy.
(function () {
  const toData = async url => {
    const b = await (await fetch(url)).blob();
    return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  };
  let pics = {}, fonts = '', cv, cx, realStep;
  window.recSetup = async function () {
    pics = {};
    const atlases = (await (await fetch('assets/frames/frames.json')).json()).atlases.map(a => 'assets/frames/' + a);
    for (const a of ['assets/img/arena.jpg', 'assets/cutins/goku-ssj-cutins.png', 'assets/cutins/cell-perfect-reveal.png', 'assets/cutins/goku-ssj-hurt.png', ...atlases])
      pics[new URL(a, location.href).href] = await toData(a);
    fonts = `@font-face{font-family:Saiyan;src:url(${await toData('assets/font/Saiyan-Sans.ttf')})}`;
    try {
      const css = await (await fetch('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap')).text();
      for (const bl of css.split('@font-face').slice(1)) {
        const u = bl.match(/url\((https:[^)]+)\)/)[1];
        fonts += '@font-face' + bl.replace(u, await toData(u)).replace(/unicode-range:[^;]+;/, '');
      }
    } catch (e) { /* offline: the pixel font falls back */ }
    cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; cx = cv.getContext('2d');
    if (!realStep) realStep = window.step;
    window.step = () => 'frozen';
  };
  window.recStop = () => { if (realStep) window.step = realStep; };
  window.recShot = async function (name) {
    const svg = document.getElementById('game').cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', 640); svg.setAttribute('height', 360);
    for (const im of svg.querySelectorAll('image')) {
      const h = im.getAttribute('href'), abs = h && new URL(h, location.href).href;
      if (abs && pics[abs]) im.setAttribute('href', pics[abs]);
    }
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = fonts; svg.insertBefore(st, svg.firstChild);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const img = new Image(); img.src = url; await img.decode();
    cx.fillStyle = '#000'; cx.fillRect(0, 0, 640, 360); cx.drawImage(img, 0, 0, 640, 360); URL.revokeObjectURL(url);
    await fetch('/save/' + name, { method: 'POST', body: await new Promise(r => cv.toBlob(r, 'image/png')) });
  };
  // two steps of the game, then draw it (a 30-a-second frame)
  window.recFrame = async function () {
    for (let i = 0; i < 2; i++) { realStep(1 / 60); P1.pressed.clear(); for (let k = 0; k < 6; k++) await null; }
    gfx.beginFrame(); render(); gfx.endFrame();
  };
  // a fight with no boss AI, the two `gap` apart in the middle of the ring
  window.recFight = function (gap = 120) {
    reset('goku'); game.menu = []; timers = []; place();
    Object.assign(game, { mode: 'fight', skip: false, versus: false, training: false, time: 99 });
    window.noAI = true; player.x = W / 2 - gap / 2; boss.x = W / 2 + gap / 2;
  };
  window.recTap = a => withController(P1, () => { setHeld(P1.kbHeld, a, true); setHeld(P1.kbHeld, a, false); });
  // events: { t: seconds, fn } or { when: () => condition, fn }; every: film one frame in this many
  window.recScene = async function (name, setup, secs, events = [], every = 1) {
    setup(); const ev = events.map(e => ({ ...e }));
    const n = Math.round(secs * 30);
    for (let i = 0; i < n; i++) {
      for (const e of ev) if (!e.done && (e.when ? e.when() : i / 30 >= e.t)) { e.done = true; e.fn(); }
      await recFrame();
      if (i % every === 0) await recShot(name + '-' + String(i).padStart(4, '0') + '.png');
    }
  };
})();
