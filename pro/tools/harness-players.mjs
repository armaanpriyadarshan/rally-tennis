import { Match, STEP } from '../js/sim.js';
import { AI } from '../js/ai.js';
import { PLAYERS, profileFor, playerByName, TOURNAMENTS, envFor } from '../js/data.js';
function run(a, b, key, N = 900) {
  const T = TOURNAMENTS.find(t => t.key === key), A = playerByName(a), B = playerByName(b);
  const m = new Match({ seed: 9, env: envFor(T, 'day', () => 0.5), format: 'slam5', p0: profileFor(A.id, T.surface), p1: profileFor(B.id, T.surface), pace: 0.05, logShots: true });
  m.ctl = [new AI(), new AI()]; const pts = []; let g = 0;
  while (pts.length < N && g++ < 3e8) { m.step(STEP); if (m.events.length) { for (const e of m.events) if (e.type === 'point') pts.push(e); m.events.length = 0; }
    if (m.phase === 'done') { m.score = { sets: [], g: [0, 0], p: [0, 0], tb: false, setsWon: [0, 0], server: pts.length % 2, serveNum: 1, over: false, winner: -1, tbStart: 0, pointNo: 0 }; m.startBetween(0.1); } }
  const err = p => ['net', 'long', 'wide'].includes(p.why), rl = pts.map(p => p.rally - (err(p) ? 1 : 0)), pc = (x, y) => y ? (100 * x / y).toFixed(0) : '-';
  const line = i => { const S = m.players[i].stats, mine = pts.filter(p => p.server === i); return `${m.players[i].prof.name.padEnd(9)} pts ${pc(pts.filter(p => p.winner === i).length, pts.length)}%  1stIn ${pc(S.s1In, S.s1Tot)} (real ${(m.players[i].prof.firstIn * 100).toFixed(0)})  1stW ${pc(S.s1Won, S.s1In)}  2ndW ${pc(S.s2Won, S.s2Tot)}  srvPtsW ${pc(mine.filter(p => p.winner === i).length, mine.length)}  aces/100sp ${(100 * S.aces / mine.length).toFixed(1)}  df ${(100 * S.df / mine.length).toFixed(1)}  s1 ${(S.s1Sum / S.s1N).toFixed(0)}km/h  W ${S.winners} UE ${S.ue} FE ${S.fe} net ${S.netPts}`; };
  console.log(`\n${a} v ${b} @ ${T.name} (${T.surface}, pace ${T.pace.toFixed(1)}): rally ${(rl.reduce((x, y) => x + y, 0) / pts.length).toFixed(2)}  1-3: ${pc(rl.filter(r => r <= 3).length, pts.length)}%  max ${Math.max(...rl)}`);
  console.log('  ' + line(0)); console.log('  ' + line(1));
}
run('Alcaraz', 'Sinner', 'us'); run('Nadal', 'Federer', 'rg'); run('Sampras', 'Agassi', 'wim'); run('Zverev', 'de Minaur', 'par');
