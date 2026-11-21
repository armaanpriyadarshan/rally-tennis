// The stroll between points, measured as steps_srvwalkprobe.mjs measures the walk to serve: a seeded CPU-vs-CPU match, and for
// both players every frame between points while strolling (strollK over 0.9, over 0.5 m/s), the lower toe's speed over the court
// (a planted contact in any walk). Prints frames, median, 90th pct m/s and the share over 0.3 m/s, per player and by speed band.
// env: P0 P1 RSEED SECS FLAGS
export default async function ({ ev }) {
  const E = process.env;
  const r = await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Sinner')}), p1: ix(${JSON.stringify(E.P1 || 'Becker')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; g.gfx.render = () => {};
    const V = g.fig[0].person.bones['Bip01_Pelvis'].position.constructor, out = [{}, {}], prev = [null, null];
    for (let f = 0; f < 60 * ${+(E.SECS || 120)}; f++) { g.running = true; g.frame(1 / 60); g.running = false;
      for (const i of [0, 1]) { const fg = g.fig[i], P = fg.person, p = m.players[i], spd = Math.hypot(p.vx, p.vz), L = new V(), R = new V(); P.bones['Bip01_L_Toe0'].getWorldPosition(L); P.bones['Bip01_R_Toe0'].getWorldPosition(R);
        const lo = L.y <= R.y ? 0 : 1, tp = lo ? R : L, ok = m.phase === 'between' && (fg.strollK || 0) > 0.9 && spd > 0.5;
        if (ok && prev[i] && prev[i].lo === lo) { const band = spd < 1 ? '<1' : spd < 1.4 ? '1-1.4' : '>1.4', v = Math.hypot(tp.x - prev[i].p.x, tp.z - prev[i].p.z) * 60; (out[i][band] || (out[i][band] = [])).push(v); (out[i].all || (out[i].all = [])).push(v); }
        prev[i] = ok ? { lo, p: tp.clone() } : null; } }
    const q = a => { a = a.slice().sort((x, y) => x - y); return a.length ? [a.length, +a[Math.floor(a.length / 2)].toFixed(2), +a[Math.floor(0.9 * (a.length - 1))].toFixed(2), +(a.filter(x => x > 0.3).length / a.length).toFixed(2)] : null; };
    return JSON.stringify(out.map((o, i) => ({ who: m.players[i].prof.name, ...Object.fromEntries(Object.entries(o).map(([k, a]) => [k, q(a)])) }))); })()`);
  console.log('STROLL', r);
}
