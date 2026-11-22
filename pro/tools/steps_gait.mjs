// The run measured against a runner: a seeded computer match, every frame of live play for both players, by speed band: steps a
// second (a foot coming down onto the court), metres a step, the hips' rise and fall from one foot coming down to the next, at a steady speed (cm), the trunk's lean forward
// along the way he runs (degrees). For a jog these are about 2.7 steps/s, 1.0 m, 8-10 cm, 5 deg; for a sprint at 5-7 m/s about
// 3.5-4.2 steps/s, 1.4-1.8 m, 5-6 cm, 10-20 deg (more while speeding up). env: P0 P1 RSEED SECS FLAGS
export default async function ({ ev }) {
  const E = process.env;
  console.log('GAIT', await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', demo: true, cam: 'tv', intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; g.gfx.render = () => {};
    const V = g.gfx.camera.position.constructor, band = sp => sp < 2 ? null : sp < 3 ? '2-3' : sp < 4 ? '3-4' : sp < 5 ? '4-5' : '5+';
    const S = {}, st = [0, 1].map(() => ({ down: [true, true], run: 0, lastStrike: null, ys: [], strikes: [] }));
    for (let f = 0; f < 60 * ${+(E.SECS || 120)}; f++) { g.running = true; g.frame(1 / 60); g.running = false; const live = m.phase === 'live';
      for (const i of [0, 1]) { const p = m.players[i], P = g.fig[i].person, sp = Math.hypot(p.vx, p.vz), b = band(sp), s = st[i], j = n => { const v = new V(); P.jointPos(n, v); return v; };
        if (!live || !b || (p.stroke && p.stroke.tc != null && Math.abs(m.t - p.stroke.tc) < 0.8)) { s.run = 0; s.lastStrike = null; s.since = null; continue; }
        s.run++; const la = j('L_Foot'), ra = j('R_Foot'), pel = j('Pelvis'), neck = j('Neck');
        const o = S[b] || (S[b] = { frames: 0, strikes: 0, stepLen: [], bob: [], lean: [] }); o.frames++;
        const ux = p.vx / sp, uz = p.vz / sp; o.lean.push(Math.atan2((neck.x - pel.x) * ux + (neck.z - pel.z) * uz, neck.y - pel.y) * 57.3);
        s.ys.push(pel.y); if (s.ys.length > 30) s.ys.shift(); if (s.since) s.since.push(pel.y);
        [la, ra].forEach((a, k) => { const dn = a.y < 0.11; if (dn && !s.down[k] && s.run > 6) { o.strikes++; if (s.lastStrike) { const d = Math.hypot(a.x - s.lastStrike.x, a.z - s.lastStrike.z); if (d < 3) o.stepLen.push(d); if (s.since && s.since.length > 6 && s.since.length < 30 && Math.abs(sp - s.sp0) < 0.5) { o.bob.push((Math.max(...s.since) - Math.min(...s.since)) * 100); } s.since = []; s.sp0 = sp; } s.lastStrike = a.clone(); } s.down[k] = dn; }); } }
    const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? +a[a.length >> 1].toFixed(2) : null; };
    return JSON.stringify(Object.fromEntries(Object.keys(S).sort().map(k => { const o = S[k]; return [k, { secs: +(o.frames / 60).toFixed(1), stepsPerS: +(o.strikes / (o.frames / 60)).toFixed(2), stepM: med(o.stepLen), bobCm: med(o.bob), leanDeg: med(o.lean) }]; }))); })()`));
}
