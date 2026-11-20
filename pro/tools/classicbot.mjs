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
globalThis.__noPlan = !!a.noplan;
const N = +(a.points || 300), D = DIFFICULTY[+(a.diff ?? 1)], sig = +(a.sig || 0.05), rng = makeRng(17).u;
const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const keys = new Set(); let pressed = new Set();
const input = { takeMouse: () => ({ x: 0, y: 0 }), move: () => ({ x: 0, y: 0 }), down: c => keys.has(c), takeEdges: () => [], takePressed: () => { const p = pressed; pressed = new Set(); return p; } };
const game = { input, opts: { controls: 'classic', assist: +(a.assist ?? 2), markers: true }, audio: null };
const H = new Human(game); H.safe = D.safe; H.srvSafe = D.srvSafe;
const P0 = playerByName(a.p0 || 'Federer'), P1 = playerByName(a.p1 || 'Nadal');
const m = new Match({ env: { surface: a.surface || 'hard' }, format: 'slam5', p0: profileFor(P0.id, 'hard'), p1: profileFor(P1.id, 'hard', D), seed: 5, firstServer: 0, pace: 0.05, quick: true });
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
