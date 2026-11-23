// Do the arms flail? A seeded computer match, every frame of live play for both players: each hand's speed against his own chest
// (the chest's frame from the shoulders and the hips, so running and turning are taken out), in m/s, split into: free (no stroke
// within 0.6 s) and running (> 1.5 m/s), free and standing, and in a stroke away from the hit (more than 0.15 s from contact). For
// each: the 95th percentile and the share of frames over 3 m/s; and the worst quarter-seconds (mean speed over the window) with time,
// player, arm, what he was doing. A hand carrying a racket on the run moves at 1-2 m/s against the chest; a take-back 2-4.
// env: P0 P1 RSEED SECS FLAGS TOP
export default async function ({ ev }) {
  const E = process.env;
  console.log('ARMS', await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', demo: true, cam: 'tv', intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; g.gfx.render = () => {};
    const V = g.gfx.camera.position.constructor, prev = [{}, {}], S = {}, win = [[], []], worst = [];
    const local = (P, n, o, ax, ay, az) => { const v = new V(); P.jointPos(n, v); v.sub(o); return [v.dot(ax), v.dot(ay), v.dot(az)]; };
    for (let f = 0; f < 60 * ${+(E.SECS || 120)}; f++) { g.running = true; g.frame(1 / 60); g.running = false; if (m.phase !== 'live') { prev[0] = {}; prev[1] = {}; continue; }
      for (const i of [0, 1]) { const p = m.players[i], P = g.fig[i].person, j = n => { const v = new V(); P.jointPos(n, v); return v; };
        const ls = j('L_UpperArm'), rsh = j('R_UpperArm'), pel = j('Pelvis'), o = ls.clone().add(rsh).multiplyScalar(0.5);
        const ax = rsh.clone().sub(ls).normalize(), up = o.clone().sub(pel); up.addScaledVector(ax, -up.dot(ax)).normalize(); const az = new V().crossVectors(ax, up);
        const st = p.stroke || p.lastStroke, u = st && st.tc != null ? m.t - st.tc : null, inSt = !!(p.stroke) || (u != null && u > -0.9 && u < 0.6);
        const sp = Math.hypot(p.vx, p.vz), cat = inSt ? (u != null && Math.abs(u) < 0.15 ? null : 'stroke') : sp > 1.5 ? 'free-run' : 'free-stand';
        for (const [arm, n] of [['L', 'L_Hand'], ['R', 'R_Hand']]) { const h = local(P, n, o, ax, up, az), q = prev[i][arm]; prev[i][arm] = h; if (!q || !cat) continue;
          const v = Math.hypot(h[0] - q[0], h[1] - q[1], h[2] - q[2]) * 60; const s = S[cat] || (S[cat] = []); s.push(v);
          const w = win[i]; w.push({ v, t: m.t, arm, cat, tag: (st ? st.kind + '/' + st.wing : '-') + (u != null ? ' u' + u.toFixed(2) : ' prep'), sp }); if (w.length > 30) w.shift();
          const last = w.filter(x => x.arm === arm).slice(-15); if (last.length === 15) { const mv = last.reduce((a, x) => a + x.v, 0) / 15; worst.push({ mv: +mv.toFixed(2), t: +m.t.toFixed(2), who: i, name: p.prof.name.split(' ').slice(-1)[0], arm, cat, tag: last[7].tag, sp: +sp.toFixed(1) }); } } } }
    const pc = (a, q) => { a = a.slice().sort((x, y) => x - y); return +a[Math.floor(a.length * q)].toFixed(2); };
    const out = {}; for (const [k, a] of Object.entries(S)) out[k] = { n: a.length, p50: pc(a, 0.5), p95: pc(a, 0.95), over3: +(a.filter(x => x > 3).length / a.length * 100).toFixed(1) + '%' };
    worst.sort((x, y) => y.mv - x.mv); const top = []; for (const w of worst) { if (top.some(x => x.who === w.who && Math.abs(x.t - w.t) < 0.6)) continue; top.push(w); if (top.length >= ${+(E.TOP || 8)}) break; }
    const byCat = {}; for (const w of worst) { const k = w.cat; if (!byCat[k] || byCat[k].length < 3) { if (!(byCat[k] || []).some(x => x.who === w.who && Math.abs(x.t - w.t) < 0.6)) (byCat[k] = byCat[k] || []).push(w); } }
    return JSON.stringify({ speeds: out, worst: top, worstByKind: byCat }); })()`));
}
