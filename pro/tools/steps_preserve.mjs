// A player waiting to serve (his stance before the toss, bouncing the ball): a seeded match with him serving first, every GAP s
// of the wait shot from behind him, from the broadcast camera, from his side and from in front. OUT_<k>_<view>.jpg. env: P0 P1
// RSEED K GAP OUT FLAGS VEN
export default async function ({ ev, shot }) {
  const E = process.env, K = +(E.K || 6), GAP = +(E.GAP || 0.4), OUT = E.OUT || '/tmp/rally-work2/ps/p';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    if (${JSON.stringify(E.OLDSRV || '')}) { const M = await import('./js/playermotion.js'), O = await import(${JSON.stringify(E.OLDSRV || '')}); M.PLAYER_MOTION.Nadal.serve = O.PLAYER_MOTION.Nadal.serve; }
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 3)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', demo: true, cam: 'tv', intro: false, firstServer: 0 });
    A.mode = 'match'; const g = A.game; g.running = false; g.audio = null; window.__ps = { g };
    const m = g.match; for (let f = 0; f < 60 * 30; f++) { g.running = true; g.frame(1 / 60); g.running = false; if (m.phase === 'ready' && m.score.server === 0 && m.phaseT > 0.6) break; }
    return 'phase ' + m.phase + ' t ' + m.phaseT.toFixed(2); })()`));
  for (let k = 0; k < K; k++) {
    await ev(`(() => { const { g } = window.__ps; for (let f = 0; f < Math.round(${GAP} * 60); f++) { g.running = true; g.frame(1 / 60); g.running = false; } return 1; })()`);
    const st = await ev(`(() => { const { g } = window.__ps, m = g.match, p = m.players[0]; return m.phase + ' ' + (p.stroke ? p.stroke.kind : '-') + ' toss ' + (m.tossT != null ? 1 : 0); })()`);
    console.log('STATE', k, st);
    for (const vw of ['tv', 'behind', 'side', 'front']) {
      await ev(`(() => { const { g } = window.__ps, m = g.match, p = m.players[0], fg = g.fig[0], P = fg.person, cam = g.gfx.camera, pel = new (cam.position.constructor)(); P.jointPos('Pelvis', pel);
        window.__ps.c0 = window.__ps.c0 || [cam.position.clone(), cam.quaternion.clone(), cam.fov];
        const [c0, q0, f0] = window.__ps.c0; cam.position.copy(c0); cam.quaternion.copy(q0); cam.fov = f0; const s = p.sgn, vw = ${JSON.stringify(vw)};
        if (vw === 'behind') cam.position.set(pel.x + 0.4 * s, 1.6, pel.z + 3.4 * s); else if (vw === 'front') cam.position.set(pel.x - 0.2 * s, 1.4, pel.z - 3.6 * s); else if (vw === 'side') cam.position.set(pel.x + 3.6, 1.2, pel.z);
        if (vw !== 'tv') { cam.lookAt(pel.x, 0.95, pel.z); cam.fov = 40; } cam.updateProjectionMatrix(); g.gfx.render(1 / 60); return 1; })()`);
      await shot(`${OUT}_${k}_${vw}.jpg`);
    }
  }
}
