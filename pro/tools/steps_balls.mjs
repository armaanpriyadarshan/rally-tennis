// Balls left lying: plays a computer-vs-computer match for SECS and, at every serve, lists the staff balls lying free
// (not in a hand), their age, where they are, whether in the court, claimed; and the kids' states.
export default async function ({ ev }) {
  const E = process.env;
  for (let i = 0; i < 60 && !(await ev('!!(window.__app && window.__app.game)')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(async () => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => ['__' + x, true])))}); const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false });
    A.mode = 'match'; const g = A.game, m = g.match; const FR = g.frame.bind(g); g.frame = () => {}; m.ctl[0] = m.ctl[1];
    const S = g.arena && g.arena.staffCtl; const out = []; let prev = null, maxFree = 0;
    for (let k = 0; k < ${+(E.SECS || 120)} * 60; k++) { FR(1 / 60); const ph = m.phase;
      const st = S || (window.__staff); 
      if (ph === 'toss' && prev !== 'toss' && st) { const fr = st.balls.filter(b => b.mode === 'free'); maxFree = Math.max(maxFree, fr.length);
        out.push('t ' + m.t.toFixed(1) + ' free ' + fr.length + ' :: ' + fr.map(b => '(' + b.x.toFixed(1) + ',' + b.z.toFixed(1) + ' age ' + b.age.toFixed(1) + (b.claim ? ' claimed' : '') + (b.mirror ? ' mirror' : '') + ')').join(' ') + ' | kids ' + st.kids.map(q => q.state).join(',')); }
      prev = ph; }
    return (S ? '' : 'NO STAFF FOUND ' + Object.keys(g).join(',') + '\\n') + 'maxFree ' + maxFree + '\\n' + out.join('\\n'); })()`));
}
