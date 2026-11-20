// The server's movement between points and in the ready phase of a computer-vs-computer match: per point, how far he moves
// sideways, how many times he changes direction, top speed, and the time spent moving in 'ready'.
export default async function ({ ev }) {
  const E = process.env;
  for (let i = 0; i < 60 && !(await ev('!!(window.__app && window.__app.game)')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(async () => { const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false });
    A.mode = 'match'; const g = A.game, m = g.match; const FR = g.frame.bind(g); g.frame = () => {}; m.ctl[0] = m.ctl[1];
    const out = []; let cur = null;
    for (let k = 0; k < ${+(E.SECS || 90)} * 60; k++) { FR(1 / 60); const sv = m.players[m.score.server], ph = m.phase;
      if (ph === 'ready' || ph === 'between') { if (!cur || cur.no !== m.score.pointNo) { if (cur) out.push(cur); cur = { no: m.score.pointNo, rev: 0, top: 0, readyMove: 0, lastSign: 0, path: 0, ph0: ph }; }
        const vx = sv.vx; const sp = Math.hypot(sv.vx, sv.vz); cur.top = Math.max(cur.top, sp); cur.path += sp / 60; if (ph === 'ready' && sp > 0.25) cur.readyMove += 1 / 60;
        const sg = Math.abs(vx) > 0.15 ? Math.sign(vx) : 0; if (sg && cur.lastSign && sg !== cur.lastSign) cur.rev++; if (sg) cur.lastSign = sg; } }
    if (cur) out.push(cur);
    return out.map(o => 'pt ' + o.no + ' path ' + o.path.toFixed(2) + ' m top ' + o.top.toFixed(2) + ' rev ' + o.rev + ' readyMove ' + o.readyMove.toFixed(2) + ' s').join('\\n'); })()`));
}
