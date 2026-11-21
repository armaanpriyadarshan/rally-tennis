// Every player's walk back between points, as the game's broadcast camera shows it (cropped about him) and from behind him:
// a seeded match per pair, both players, the first walk back that reaches walking pace, N frames STEP apart.
// env: P0 P1 RSEED N STEP OUT (prefix; writes OUT_<name>_<view>_<k>.jpg and prints CROP lines for the broadcast frames)
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/wr/w', N = +(E.N || 6), ST = +(E.STEP || 6);
  for (const WHO of [0, 1]) {
    const name = await ev(`(async () => {
      const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
      const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
      let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
      await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Alcaraz')}), p1: ix(${JSON.stringify(E.P1 || 'Sinner')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
      A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; window.__wr = { g, m };
      for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
      for (let f = 0; f < 60 * 300; f++) { g.running = true; g.frame(1 / 60); g.running = false; const p = m.players[${WHO}];
        if (m.phase === 'between' && Math.hypot(p.vx, p.vz) > 1.0) break; }
      return g.match.players[${WHO}].prof.name; })()`);
    for (let k = 0; k < N; k++) {
      for (let f = 0; f < ST; f++) await ev(`(() => { const { g } = window.__wr; g.running = true; g.frame(1 / 60); g.running = false; return 1; })()`);
      // the game's own broadcast frame first, then the camera behind him
      const pos = await ev(`(() => { const { g } = window.__wr, cam = g.gfx.camera, P = g.fig[${WHO}].person, v = new (cam.position.constructor)(); g.gfx.render(1 / 60); P.jointPos('Pelvis', v); v.project(cam); return ((v.x + 1) / 2).toFixed(3) + ' ' + ((1 - v.y) / 2).toFixed(3); })()`);
      console.log('CROP', name, k, pos);
      await shot(`${OUT}_${name.replace(/ /g, '_')}_tv_${k}.jpg`);
      await ev(`(() => { const { g, m } = window.__wr, P = g.fig[${WHO}].person, cam = g.gfx.camera, pel = new (cam.position.constructor)(); P.jointPos('Pelvis', pel);
        const p = m.players[${WHO}], sp = Math.hypot(p.vx, p.vz) || 1, dx = p.vx / sp, dz = p.vz / sp, c0 = cam.position.clone(), q0 = cam.quaternion.clone(), f0 = cam.fov;
        cam.position.set(pel.x - dx * 3.4, 1.5, pel.z - dz * 3.4); cam.lookAt(pel.x, pel.y - 0.1, pel.z); cam.fov = 40; cam.updateProjectionMatrix(); g.gfx.render(1 / 60);
        window.__wr.restore = () => { cam.position.copy(c0); cam.quaternion.copy(q0); cam.fov = f0; cam.updateProjectionMatrix(); }; return 1; })()`);
      await shot(`${OUT}_${name.replace(/ /g, '_')}_behind_${k}.jpg`);
      await ev(`(() => { window.__wr.restore(); return 1; })()`);
    }
  }
}
