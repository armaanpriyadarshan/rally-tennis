// Do the feet trail the body? A seeded computer match, both players, every frame of live play: how far the hips' point on the ground
// is ahead of the middle of the two feet along the way he is going (m; positive = the body ahead of the feet), by speed band, and the
// share of frames where it is more than 0.25 m; and in the last quarter second before each groundstroke's contact, the share of frames
// with neither foot on the court (ankle over 0.13 m) and the median stance width. env: P0 P1 RSEED SECS FLAGS
export default async function ({ ev }) {
  const E = process.env;
  const r = await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; g.gfx.render = () => {};
    const V = g.fig[0].person.bones['Bip01_Pelvis'].position.constructor, band = sp => sp < 1.5 ? null : sp < 3 ? '1.5-3' : sp < 4.5 ? '3-4.5' : '>4.5';
    const L = {}, pre = { n: 0, air: 0, w: [], why: {} };
    for (let f = 0; f < 60 * ${+(E.SECS || 120)}; f++) { g.running = true; g.frame(1 / 60); g.running = false; if (m.phase !== 'live') continue;
      for (const i of [0, 1]) { const p = m.players[i], P = g.fig[i].person, sp = Math.hypot(p.vx, p.vz), j = n => { const v = new V(); P.jointPos(n, v); return v; };
        const pel = j('Pelvis'), la = j('L_Foot'), ra = j('R_Foot'), lt = j('L_Toe0'), rt = j('R_Toe0'), mx = (la.x + ra.x) / 2, mz = (la.z + ra.z) / 2;
        const b = band(sp); if (b) { const ux = p.vx / sp, uz = p.vz / sp, off = (pel.x - mx) * ux + (pel.z - mz) * uz; (L[b] || (L[b] = [])).push(off); }
        const st = p.stroke || p.lastStroke; if (st && st.tc != null && st.kind !== 'serve' && st.kind !== 'smash' && m.t - st.tc > -0.25 && m.t - st.tc <= 0) { pre.n++; if (la.y > 0.13 && ra.y > 0.13 && lt.y > 0.05 && rt.y > 0.05) { pre.air++; const fg = g.fig[i], k = (sp < 1.3 ? 'slow' : sp < 3 ? 'mid' : 'fast') + ' cw' + ((fg.clipW || 0) > 0.5 ? 1 : 0) + ' lr' + ((fg.legRunNow || 0) > 0.5 ? 1 : 0) + ' ' + fg.lockF.map(o => (o.on ? 'D' : '.') + (o.step ? 's' : '-')).join(''); pre.why[k] = (pre.why[k] || 0) + 1; } pre.w.push(Math.hypot(la.x - ra.x, la.z - ra.z)); } } }
    const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? +a[a.length >> 1].toFixed(2) : null; };
    const out = {}; for (const k of Object.keys(L).sort()) { const a = L[k]; out[k] = { n: a.length, median: med(a), over25: +(a.filter(x => x > 0.25).length / a.length).toFixed(2), underM25: +(a.filter(x => x < -0.25).length / a.length).toFixed(2) }; }
    return JSON.stringify({ bodyAheadOfFeet: out, beforeContact: { frames: pre.n, bothFeetUp: +(pre.air / Math.max(1, pre.n)).toFixed(2), stanceMedian: med(pre.w), why: pre.why } }); })()`);
  console.log('FEETLAG', r);
}
