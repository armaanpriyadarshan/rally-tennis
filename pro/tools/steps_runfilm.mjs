// A player running hard, filmed: a seeded computer match is played until player WHO has been moving faster than VMIN m/s for a fifth of
// a second, then N frames GAP s apart from behind him (the chase camera's place) and from the broadcast camera. OUT_<k>_<view>.jpg,
// with a line per frame: speed, which feet are down. env: P0 P1 WHO VMIN N GAP RSEED SKIP (runs to pass over first) OUT VEN
export default async function ({ ev, shot }) {
  const E = process.env, WHO = +(E.WHO || 0), N = +(E.N || 8), GAP = +(E.GAP || 0.067), OUT = E.OUT || '/tmp/rally-work2/rf/r';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', demo: true, cam: 'tv', intro: false, firstServer: 0, seed: ${+(E.RSEED || 11)} });
    A.mode = 'match'; const g = A.game, m = g.match, p = m.players[${WHO}]; g.running = false; g.audio = null; const R = g.gfx.render.bind(g.gfx); g.gfx.render = () => {}; window.__rf = { g, R };
    let fast = 0, skip = ${+(E.SKIP || 0)};
    for (let f = 0; f < 60 * 200; f++) { g.running = true; g.frame(1 / 60); g.running = false; const sp = Math.hypot(p.vx, p.vz);
      fast = m.phase === 'live' && sp > ${+(E.VMIN || 3.5)} ? fast + 1 : 0; if (fast === 12) { if (skip-- > 0) continue; return 'running at t ' + m.t.toFixed(2) + ' speed ' + sp.toFixed(1); } }
    return 'no run'; })()`));
  for (let k = 0; k < N; k++) {
    for (const vw of ['behind', 'tv']) {
      const st = await ev(`(() => { const { g, R } = window.__rf, m = g.match, p = m.players[${WHO}], P = g.fig[${WHO}].person, cam = g.gfx.camera, V = cam.position.constructor, pel = new V(); P.jointPos('Pelvis', pel);
        const c0 = window.__rf.c0 || (window.__rf.c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov]);
        if (${JSON.stringify(vw)} === 'behind') { const s = p.sgn; cam.position.set(pel.x + 0.3 * s, 2.3, pel.z + 4.2 * s); cam.lookAt(pel.x, 0.8, pel.z - 1.5 * s); cam.fov = 50; }
        else { g.updateCamera(0); }
        cam.updateProjectionMatrix(); R(1 / 60); const la = new V(), ra = new V(); P.jointPos('L_Foot', la); P.jointPos('R_Foot', ra);
        const out = 't ' + m.t.toFixed(2) + ' v ' + Math.hypot(p.vx, p.vz).toFixed(1) + ' feet ' + (la.y < 0.12 ? 'L' : '.') + (ra.y < 0.12 ? 'R' : '.');
        if (${JSON.stringify(vw)} === 'behind') { cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix(); } return out; })()`);
      await shot(`${OUT}_${String(k).padStart(2, '0')}_${vw}.jpg`); if (vw === 'behind') console.log('FRAME', k, st);
    }
    await ev(`(() => { const { g } = window.__rf; for (let f = 0; f < Math.round(${GAP} * 60); f++) { g.running = true; g.frame(1 / 60); g.running = false; } window.__rf.c0 = null; return 1; })()`);
  }
}
