// compact one-line summary for tuning
import { Match, STEP, TUNE } from '../js/sim.js';
import { AI, AIT } from '../js/ai.js';
export function run(o={}) {
  const N=o.points||1200; if (o.tune) Object.assign(TUNE,o.tune); if (o.ait) Object.assign(AIT,o.ait);
  const m = new Match({ seed:o.seed||5, env:{surface:o.surface||'hard', ...(o.env||{})}, format:'slam5', pace:0.05, logShots:true, p0:o.p0||{}, p1:o.p1||o.p0||{} });
  m.ctl=[new AI(),new AI()]; const pts=[]; let g=0;
  while (pts.length<N && g++<4e8) { m.step(STEP); if (m.events.length){ for (const e of m.events) if (e.type==='point') pts.push(e); m.events.length=0; }
    if (m.phase==='done'){ m.score={sets:[],g:[0,0],p:[0,0],tb:false,setsWon:[0,0],server:pts.length%2,serveNum:1,over:false,winner:-1,tbStart:0,pointNo:0}; m.startBetween(0.1);} }
  const S=m.players.map(p=>p.stats), sum=k=>S[0][k]+S[1][k], n=pts.length, pc=(a,b)=>b?(100*a/b):0;
  const err=p=>['net','long','wide'].includes(p.why); const rl=pts.map(p=>p.rally-(err(p)?1:0));
  const cls={}; for (const p of pts) cls[p.cls]=(cls[p.cls]||0)+1; const L=m.shotLog.filter(s=>s.kind!=='serve');
  const E=pts.filter(err), ec={}; for (const p of E) ec[p.why]=(ec[p.why]||0)+1;
  const P1=pts.filter(p=>p.serveNum===1), unret=a=>a.filter(p=>p.why==='ace'||p.why==='serviceWinner'||(p.rally===2&&err(p))).length;
  const dr=L.filter(s=>(s.kind==='drive'||s.kind==='flat')&&!s.ret).map(s=>s.kmh).sort((a,b)=>a-b);
  return { n, rally: rl.reduce((a,b)=>a+b,0)/n, r13: pc(rl.filter(r=>r<=3).length,n), r10: pc(rl.filter(r=>r>=10).length,n),
    W: pc((cls.winner||0)+(cls.ace||0),n), FE: pc((cls.forced||0)+(cls.serviceWinner||0),n), UE: pc(cls.unforced||0,n), DF: pc(cls.doubleFault||0,n), ace: pc(cls.ace||0,n),
    in1: pc(sum('s1In'),sum('s1Tot')), w1: pc(sum('s1Won'),sum('s1In')), w2: pc(sum('s2Won'),sum('s2Tot')), srv: pc(pts.filter(p=>p.winner===p.server).length,n),
    unret1: pc(unret(P1),P1.length), net: pc(ec.net||0,E.length), long: pc(ec.long||0,E.length), wide: pc(ec.wide||0,E.length),
    kmh: dr[dr.length>>1], vol: pc(L.filter(s=>s.volley).length,L.length), netPts: pc(sum('netPts'),2*n), s1: sum('s1Sum')/sum('s1N'), s2: sum('s2Sum')/sum('s2N'), m };
}
export function line(r) { return `rally ${r.rally.toFixed(2)} (4.1) 1-3:${r.r13.toFixed(0)}% (60) 10+:${r.r10.toFixed(0)}% | W ${r.W.toFixed(0)} (31) FE ${r.FE.toFixed(0)} (29) UE ${r.UE.toFixed(0)} (32) DF ${r.DF.toFixed(1)} (3.6) ace ${r.ace.toFixed(1)} (9.3) | 1stIn ${r.in1.toFixed(0)} (63) 1stW ${r.w1.toFixed(0)} (73) 2ndW ${r.w2.toFixed(0)} (51) srvW ${r.srv.toFixed(0)} (64) unret1 ${r.unret1.toFixed(0)} (38) | net/long/wide ${r.net.toFixed(0)}/${r.long.toFixed(0)}/${r.wide.toFixed(0)} (42/33/26) | ${r.kmh.toFixed(0)}kmh vol ${r.vol.toFixed(1)}% s1 ${r.s1.toFixed(0)} s2 ${r.s2.toFixed(0)}`; }
if (process.argv[1].endsWith('harness.mjs')) { const a=Object.fromEntries(process.argv.slice(2).map(x=>x.split('='))); const r=run({points:+(a.points||1200), surface:a.surface, tune:a.tune&&JSON.parse(a.tune), ait:a.ait&&JSON.parse(a.ait), seed:+(a.seed||5), p0:a.p0&&JSON.parse(a.p0)}); console.log((a.label||a.surface||'hard')+': '+line(r)); }
