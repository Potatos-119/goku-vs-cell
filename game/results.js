// ---------- results ----------
// What a story fight is scored on, counted as it's played (game.stats), and the report shown on the
// result screen: time, best combo, damage taken, perfect blocks, named combos, and after a win a
// grade. The best time for each fighter and difficulty is kept between visits.
const newStats = () => ({ time: 0, bestHits: 0, bestDmg: 0, dealt: 0, taken: 0, perfect: 0, named: 0 });
const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// Grade: up to 3 points each for speed, for how little damage you took and for your longest combo,
// plus one on Hard and minus one on Easy. S needs 8, A 6, B 4.
const GRADE_RULES = {
  time: [240, 360, 480],   // seconds: under the first is 3 points, the second 2, the third 1
  taken: [100, 200, 320],  // damage taken
  hits: [10, 6, 3],        // longest combo, in hits
};
function gradeOf(s) {
  const under = (v, steps) => 3 - steps.filter(x => v >= x).length, over = (v, steps) => steps.filter(x => v >= x).length;
  const pts = under(s.time, GRADE_RULES.time) + under(s.taken, GRADE_RULES.taken) + over(s.bestHits, GRADE_RULES.hits)
    + (settings.difficulty === 'hard' ? 1 : settings.difficulty === 'easy' ? -1 : 0);
  return pts >= 8 ? 'S' : pts >= 6 ? 'A' : pts >= 4 ? 'B' : 'C';
}
const GRADE_COLOR = { S: '#ffe04a', A: '#8f8', B: '#9ff', C: '#ccc' };
function loadBests() { try { return JSON.parse(localStorage.getItem('bests') || '{}'); } catch (e) { return {}; } }
function makeReport(win) {
  const s = game.stats, key = game.side + '-' + settings.difficulty, bests = loadBests(), old = bests[key];
  const r = { ...s, win, grade: win ? gradeOf(s) : null, best: old ? old.time : null, newBest: false };
  if (win && (!old || s.time < old.time)) {
    r.newBest = true; bests[key] = { time: s.time, grade: r.grade };
    try { localStorage.setItem('bests', JSON.stringify(bests)); } catch (e) { /* not saved, still shown */ }
  }
  return r;
}
function drawResults() {
  const r = game.report;
  if (!r) return;
  const x = 58, y = 96, w = 204;
  gfx.fillStyle = 'rgba(6,5,16,0.82)'; gfx.fillRect(x, y, w, 64);
  gfx.strokeStyle = r.win ? '#ffd23a' : '#7a5a5a'; gfx.lineWidth = 1; gfx.strokeRect(x + 0.5, y + 0.5, w - 1, 63);
  const rows = [
    ['TIME', clock(r.time)],
    ['BEST COMBO', r.bestHits >= 2 ? `${r.bestHits} HITS  ${Math.round(r.bestDmg)} DMG` : '-'],
    ['DAMAGE TAKEN', String(Math.round(r.taken))],
    ['PERFECT BLOCKS', String(r.perfect)],
    ['NAMED COMBOS', String(r.named)],
  ];
  const right = r.grade ? x + 146 : x + w - 8;
  rows.forEach(([name, value], i) => { small(name, x + 8, y + 7 + i * 9, '#9ff', 'left'); small(value, right, y + 7 + i * 9, '#fff', 'right'); });
  if (r.grade) { small('GRADE', x + 175, y + 8, '#9ff', 'center'); text(r.grade, x + 175, y + 15, 34, GRADE_COLOR[r.grade], 'center'); }
  const line = r.newBest ? 'NEW BEST TIME ON ' + diff().label + '!' : r.best != null ? 'BEST TIME ON ' + diff().label + '  ' + clock(r.best) : r.win ? '' : 'WIN TO SET A BEST TIME';
  if (line) small(line, x + w / 2, y + 54, r.newBest ? '#ffe04a' : '#aaa', 'center');
}
// damage dealt inside a cinematic, where damage() is switched off: it still counts on the score sheet
function directDamage(f, dmg) {
  const before = f.hp;
  f.hp = Math.max(game.training ? 1 : 0, f.hp - dmg);
  if (f === player) game.stats.taken += before - f.hp; else game.stats.dealt += before - f.hp;
}
