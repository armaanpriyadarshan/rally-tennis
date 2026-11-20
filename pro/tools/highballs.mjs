// What players do with a high ball: for every rally ball whose bounce rises above PEAK m (default 1.4), where it was met
// (height, how long after the bounce, how far inside the baseline), what the striker chose (state, kind, km/h) and how
// the point went. usage: node tools/highballs.mjs a=Nadal b=Federer ev=rg points=500 peak=1.4
import { Match, STEP } from '../js/sim.js';
import { AI } from '../js/ai.js';
import { profileFor, playerByName, TOURNAMENTS, envFor } from '../js/data.js';
const A = Object.fromEntries(process.argv.slice(2).map(s => s.split('=')));
const T = TOURNAMENTS.find(t => t.key === (A.ev || 'rg')), pa = playerByName(A.a || 'Nadal'), pb = playerByName(A.b || 'Federer'), PEAK = +(A.peak || 1.4);
const m = new Match({ seed: 11, env: envFor(T, 'day', () => 0.5), format: 'slam5', p0: profileFor(pa.id, T.surface, T.key), p1: profileFor(pb.id, T.surface, T.key), pace: 0.05, logShots: true });
m.ctl = [new AI(), new AI()];
const pts = []; let g = 0, lastInc = null, peak = 0, bT = null; const rows = [];
let prevLog = 0;
while (pts.length < +(A.points || 500) && g++ < 3e8) {
  m.step(STEP);
  const b = m.ball;
  if (m.shotLog.length > prevLog) { for (let k = prevLog; k < m.shotLog.length; k++) { const r = m.shotLog[k]; if (r.kind !== 'serve' && !r.ret && !r.volley) rows.push({ ...r, peak, sinceB: bT == null ? null : m.t - bT, D: r.D }); } prevLog = m.shotLog.length; peak = 0; bT = null; }
  if (m.incoming !== lastInc) { lastInc = m.incoming; peak = 0; bT = null; }
  if (b.live && b.bounces >= 1) { if (bT == null) bT = m.t; peak = Math.max(peak, b.y); }
  if (m.events.length) { for (const e of m.events) if (e.type === 'point') pts.push(e); m.events.length = 0; }
  if (m.phase === 'done') { m.score = { sets: [], g: [0, 0], p: [0, 0], tb: false, setsWon: [0, 0], server: pts.length % 2, serveNum: 1, over: false, winner: -1, tbStart: 0, pointNo: 0 }; m.startBetween(0.1); }
}
const pc = (a, b) => (100 * a / Math.max(1, b)).toFixed(0) + '%', avg = (a, f) => a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length).toFixed(2) : '-';
const hi = rows.filter(r => r.peak > PEAK), lo = rows.filter(r => r.peak <= PEAK);
const q = (a, f, p) => { const s = a.map(f).sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))].toFixed(2) : '-'; };
console.log(`${pa.facts.name} v ${pb.facts.name} @ ${T.name}: ${rows.length} rally groundstrokes, ${hi.length} (${pc(hi.length, rows.length)}) off balls bouncing above ${PEAK} m`);
for (const [nm, a] of [['high-bouncing', hi], ['the rest', lo]]) {
  console.log(`  ${nm.padEnd(14)} n ${String(a.length).padStart(4)}  contact h p10 ${q(a, r => r.h, 0.1)} med ${q(a, r => r.h, 0.5)} p90 ${q(a, r => r.h, 0.9)}  peak med ${q(a, r => r.peak, 0.5)}  after bounce med ${q(a.filter(r => r.sinceB != null), r => r.sinceB, 0.5)} s  depth D med ${q(a, r => r.D, 0.5)}  km/h ${avg(a, r => r.kmh)}`);
  const st = {}; for (const r of a) st[r.state || '?'] = (st[r.state || '?'] || 0) + 1; const kd = {}; for (const r of a) kd[r.kind] = (kd[r.kind] || 0) + 1;
  console.log(`  ${''.padEnd(14)} states ${JSON.stringify(st)} kinds ${JSON.stringify(kd)}  contact above 1.35 m: ${pc(a.filter(r => r.h > 1.35).length, a.length)}`);
}
