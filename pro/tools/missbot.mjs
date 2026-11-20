// classicbot.mjs plus a breakdown of every rally shot the human-side bot hits: where the misses go (net / wide / long),
// off how hard a ball, how far inside the lines it aimed, and how many came off swings the game called Perfect.
// usage: node tools/missbot.mjs points=250 diff=0|1|2 assist=0|1|2 sig=0.03 p0=Federer p1=Djokovic
// A stand-in for a person playing with the first game's controls (js/human.js, CLASSIC):
// Space to toss, serve and hit, an arrow held at the swing to aim. It presses a little early or
// late and aims left, right, deep or short at random. Prints what such a player wins.
//   node tools/classicbot.mjs [points=300] [diff=1] [assist=2] [sig=0.05] [early=0] [p0=Federer] [p1=Nadal]
// early=0.3 presses that much sooner than the ball arrives (a player who hits Space as the ball bounces).
// late=0.05 presses that long after the ball has reached him (late=-0.05: just before).
import { Match, STEP, TIMING } from '../js/sim.js';
import { AI } from '../js/ai.js';
import { Human } from '../js/human.js';
import { makeRng } from '../js/physics.js';
import { PLAYERS, profileFor, DIFFICULTY, playerByName } from '../js/data.js';

const a = Object.fromEntries(process.argv.slice(2).map(x => x.split('=')));
globalThis.__noPlan = !!a.noplan; globalThis.__noRun = !!a.norun; globalThis.__noArc = !!a.noarc; globalThis.__noThr = !!a.nothr;
const N = +(a.points || 300), D = DIFFICULTY[+(a.diff ?? 1)], sig = +(a.sig || 0.05), rng = makeRng(17).u;
const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const keys = new Set(); let pressed = new Set();
const input = { takeMouse: () => ({ x: 0, y: 0 }), move: () => ({ x: 0, y: 0 }), down: c => keys.has(c), takeEdges: () => [], takePressed: () => { const p = pressed; pressed = new Set(); return p; } };
const game = { input, opts: { controls: 'classic', assist: +(a.assist ?? 2), markers: true }, audio: null };
const H = new Human(game); H.safe = D.safe; H.srvSafe = D.srvSafe;
const P0 = playerByName(a.p0 || 'Federer'), P1 = playerByName(a.p1 || 'Nadal');
const m = new Match({ env: { surface: a.surface || 'hard' }, format: 'slam5', p0: profileFor(P0.id, 'hard'), p1: profileFor(P1.id, 'hard', D), seed: 5, firstServer: 0, pace: 0.05, quick: true, logShots: true });
m.diffScale[1] = D.err; m.diffScale[0] = D.aid; m.cleanK[0] = D.clean == null ? 1 : D.clean; m.mercy[0] = D.mercy == null ? 1 : D.mercy; m.timingWindow[0] = D.window; m.aimSafe[0] = D.aimSafe;
let plan = null, srvAt = null, lastInc = null; const kinds = {}, hts = [], hsp = []; let netYs = []; let whiffs = 0, ownSide = 0, lastHitEv = null, firstB = false;
process.on('exit', () => { netYs.sort((a, b) => a - b); if (netYs.length) console.log('rally balls into the net:', netYs.length, 'hit the net at height m: p10', netYs[Math.floor(netYs.length * 0.1)].toFixed(2), 'median', netYs[netYs.length >> 1].toFixed(2), 'p90', netYs[Math.floor(netYs.length * 0.9)].toFixed(2)); });
process.on('exit', () => console.log('struck balls whose first bounce was on the hitter\'s own side:', ownSide));
process.on('exit', () => { const hi = hsp.filter(x => x[0] > 1.35), lo = hsp.filter(x => x[0] <= 1.35), avg = a => a.length ? (a.reduce((t, x) => t + x[1], 0) / a.length).toFixed(0) : '-'; console.log('drives above 1.35 m:', hi.length, 'of', hsp.length, '| km/h high', avg(hi), 'vs rest', avg(lo), '| whiffs', whiffs); });
process.on('exit', () => { console.log('your shots by kind', JSON.stringify(kinds)); hts.sort((x, y) => x - y); const q = f => hts[Math.floor(hts.length * f)].toFixed(2); if (hts.length) console.log('drive contact height m: p10', q(0.1), 'median', q(0.5), 'p90', q(0.9), ' share above 1.1 m', (hts.filter(x => x > 1.1).length / hts.length * 100).toFixed(0) + '%'); });
const bot = { update(mm, i, dt) {
  const ph = mm.phase, serving = mm.score.server === i;
  if (ph === 'ready' && serving) { if (mm.phaseT > 0.7) pressed.add('Space'); srvAt = null; }
  else if (ph === 'toss' && serving) {
    if (srvAt == null && mm.ball.held < 0) { srvAt = mm.tossIdeal - TIMING.serveSwing + gauss() * sig * 0.8; keys.clear(); const r = rng(); if (r < 0.33) keys.add('ArrowLeft'); else if (r < 0.66) keys.add('ArrowRight'); }
    if (srvAt != null && mm.t >= srvAt) { pressed.add('Space'); srvAt = 1e9; }
  } else if (ph === 'live') {
    const inc = mm.incoming;
    if (inc && inc !== lastInc && mm.ball.lastHit !== i) { lastInc = inc; plan = { off: gauss() * sig, done: false }; keys.clear(); const r = rng(); if (r < 0.3) keys.add('ArrowLeft'); else if (r < 0.6) keys.add('ArrowRight'); const q = rng(); if (q < 0.25) keys.add('ArrowUp'); else if (q < 0.31) keys.add('ArrowDown'); }
    // he presses about when the ball arrives, a little early or late; early is forgiven for a moment
    if (a.late != null) {
      // press `late` seconds after the ball gets to him (negative: before), the way a player who watches the ball does
      if (plan && H.tau != null && H.tau > -0.13) plan.arrive = mm.t + H.tau + TIMING.swing;
      if (plan && !plan.done && plan.arrive != null && mm.t >= plan.arrive + +a.late + plan.off) { pressed.add('Space'); plan.done = true; }
    } else if (plan && !plan.done && H.tau != null && H.tau <= 0.10 + plan.off + +(a.early || 0)) { pressed.add('Space'); plan.done = true; }
  } else keys.clear();
  H.update(mm, i, dt);
} };
m.ctl = [bot, new AI()];
const pts = []; let g = 0;
while (pts.length < N && g++ < 4e8) {
  m.step(STEP);
  if (m.events.length) { for (const e of m.events) { if (e.type === 'point') pts.push(e); if (e.type === 'hit' && e.who === 0) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; if (e.kind === 'drive' || e.kind === 'flat') { hts.push(e.y); hsp.push([e.y, e.speed * 3.6]); } } if (e.type === 'hit') { lastHitEv = e; firstB = true; } if (e.type === 'net' && lastHitEv && !lastHitEv.ret) netYs.push(e.y); if (e.type === 'bounce' && lastHitEv && firstB) { firstB = false; if (Math.sign(e.z) === Math.sign(lastHitEv.z) && Math.abs(e.z) > 0.05) { ownSide++; if (process.env.OWN) console.log('OWN SIDE', lastHitEv.who, lastHitEv.kind, 'kmh', (lastHitEv.speed * 3.6).toFixed(0), 'from z', (+lastHitEv.z).toFixed(1), 'y', (+lastHitEv.y).toFixed(2), 'bounce z', (+e.z).toFixed(1), 'shank', lastHitEv.shank, 'diff', (+lastHitEv.diff).toFixed(2)); } } if (e.type === 'whiff' && e.who === 0) { whiffs++; if (process.env.WHY) console.log('whiff lat', (+e.lat).toFixed(2), 'relZ', (+e.relZ).toFixed(2), 'h', (+e.h).toFixed(2)); } } m.events.length = 0; }
  if (m.phase === 'done') { m.score = { sets: [], g: [0, 0], p: [0, 0], tb: false, setsWon: [0, 0], server: pts.length % 2, serveNum: 1, over: false, winner: -1, tbStart: 0, pointNo: 0 }; m.startBetween(0.1); }
}
const pc = (x, y) => y ? (100 * x / y).toFixed(0) + '%' : '-', mine = pts.filter(p => p.server === 0), his = pts.filter(p => p.server === 1), st = m.players[0].stats;
const why = pts.reduce((o, p) => { const k = (p.winner === 0 ? '+' : '-') + p.why; o[k] = (o[k] || 0) + 1; return o; }, {});
console.log(`${D.name}: points won ${pc(pts.filter(p => p.winner === 0).length, pts.length)}  on serve ${pc(mine.filter(p => p.winner === 0).length, mine.length)}  on return ${pc(his.filter(p => p.winner === 0).length, his.length)}  | 1st serve in ${pc(st.s1In, st.s1Tot)}  aces ${st.aces}  double faults ${st.df}  rally ${(pts.reduce((x, p) => x + p.rally, 0) / pts.length).toFixed(1)}`);
console.log(JSON.stringify(why));

process.on('exit', () => {
  const L = m.shotLog.filter(r => r.who === 0 && r.kind !== 'serve'); const COURT_HW = 4.115, COURT_HL = 11.885;
  const out = r => { if (!r.land) return 'none'; const x = Math.abs(r.land.x), z = r.land.z; if (r.clear != null && r.clear < 0) return 'net'; if (z > 0) return 'short-own'; if (x > COURT_HW + 0.03) return 'wide'; if (-z > COURT_HL + 0.03) return 'long'; return 'in'; };
  const res = {}, rows = [];
  for (const r of L) { const o = out(r); res[o] = (res[o] || 0) + 1; if (o !== 'in') rows.push(r); }
  console.log('human rally shots', L.length, JSON.stringify(res));
  const avg = (a, f) => a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(2) : '-';
  const ins = L.filter(r => out(r) === 'in');
  console.log('IN    : n', ins.length, 'diff', avg(ins, r => r.diff), 'mistimed%', avg(ins, r => r.mistimed ? 100 : 0), 'weak', avg(ins, r => r.weak), 'aim |x| from line', avg(ins, r => COURT_HW - Math.abs(r.tgt[0])), 'aim from baseline', avg(ins, r => COURT_HL - Math.abs(r.tgt[1])), 'clear', avg(ins, r => r.clear || 0));
  for (const o of ['net', 'wide', 'long']) { const a = rows.filter(r => out(r) === o); console.log(o.toUpperCase().padEnd(6) + ': n', a.length, 'diff', avg(a, r => r.diff), 'mistimed%', avg(a, r => r.mistimed ? 100 : 0), 'weak', avg(a, r => r.weak), 'aim |x| from line', avg(a, r => COURT_HW - Math.abs(r.tgt[0])), 'aim from baseline', avg(a, r => COURT_HL - Math.abs(r.tgt[1])), 'clear', avg(a, r => r.clear || 0), 'kinds', JSON.stringify(a.reduce((o, r) => (o[r.kind] = (o[r.kind] || 0) + 1, o), {}))); }
  const perf = L.filter(r => r.perfect); const pm = perf.filter(r => out(r) !== 'in');
  console.log('PERFECT-label swings', perf.length, 'missed', pm.length, ((pm.length / Math.max(1, perf.length)) * 100).toFixed(1) + '%', JSON.stringify(pm.reduce((o, r) => (o[out(r)] = (o[out(r)] || 0) + 1, o), {})), 'their diff', avg(pm, r => r.diff));
  const C = m.shotLog.filter(r => r.who === 1 && r.kind !== 'serve'); const cres = {}; for (const r of C) { const o = out({ ...r, land: r.land && { x: r.land.x, z: -r.land.z } }); cres[o] = (cres[o] || 0) + 1; }
  console.log('CPU rally shots', C.length, JSON.stringify(cres), 'aim |x| from line', avg(C, r => COURT_HW - Math.abs(r.tgt[0])), 'diff', avg(C, r => r.diff));
  const easy = rows.filter(r => r.diff < 0.4 && !r.mistimed);
  console.log('misses off EASY balls (difficulty < 0.4, not mistimed):', easy.length, 'of', rows.length, '| e.g.', easy.slice(0, 6).map(r => r.kind + ' tgt ' + r.tgt.map(v => v.toFixed(1)) + ' land ' + (r.land ? r.land.x.toFixed(1) + ',' + r.land.z.toFixed(1) : '-') + ' clear ' + (r.clear == null ? '-' : r.clear.toFixed(2)) + ' diff ' + r.diff.toFixed(2)).join(' | '));
});
