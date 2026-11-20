// Where a match frame's JS time goes: wraps match.step, the two figures' update, the arena's, the ball fx, the staff, audio and
// gfx.render, plays SECS seconds of a computer-vs-computer match at 60 frames a second, prints ms per frame for each.
export default async function ({ ev }) {
  const E = process.env;
  for (let i = 0; i < 60 && !(await ev('!!(window.__app && window.__app.game)')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(async () => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => [ '__' + x, true ])))}); const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, cpu0: true });
    A.mode = 'match'; const g = A.game, m = g.match; const FR = g.frame.bind(g); g.frame = () => {}; const acc = {}, wrap = (o, k, lab) => { const f = o[k].bind(o); o[k] = (...a) => { const t0 = performance.now(); const r = f(...a); acc[lab] = (acc[lab] || 0) + performance.now() - t0; return r; }; };
    m.ctl[0] = m.ctl[1];
    wrap(m, 'step', 'sim'); for (let i = 0; i < 2; i++) wrap(g.fig[i], 'update', 'figure' + i); if (g.arena && g.arena.update) wrap(g.arena, 'update', 'arena'); if (g.fx && g.fx.update) wrap(g.fx, 'update', 'ballfx'); if (g.staff && g.staff.update) wrap(g.staff, 'update', 'staff'); if (g.audio && g.audio.frame) wrap(g.audio, 'frame', 'audio');
    wrap(g.gfx, 'render', 'render');
    const N = ${+(E.SECS || 20)} * 60; let tot = 0;
    for (let k = 0; k < N; k++) { const t0 = performance.now(); FR(1 / 60); tot += performance.now() - t0; }
    const o = Object.entries(acc).map(([k, v]) => k + ' ' + (v / N).toFixed(2)).join(' | ');
    return 'ms/frame total ' + (tot / N).toFixed(2) + ' :: ' + o; })()`));
}
