// Frame strips of a seeded computer match (the same match steps_armspeed.mjs and steps_feetlag.mjs measure, same seed, same start):
// for each AT entry who:t, the frames from t-BEFORE to t+AFTER every STEP frames, from behind him and close on the broadcast camera.
// OUT_<who>_<t>_<nn>_<view>.jpg and a line per frame. env: P0 P1 RSEED AT (comma list who:t) BEFORE AFTER STEP OUT
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/sd/s', B = +(E.BEFORE || 0.2), AF = +(E.AFTER || 0.2), ST = +(E.STEP || 3);
  const at = (E.AT || '0:10').split(',').map(x => x.split(':').map(Number)).sort((a, b) => a[1] - b[1]);
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', demo: true, cam: 'tv', intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    A.mode = 'match'; const g = A.game; g.running = false; g.audio = null; const R = g.gfx.render.bind(g.gfx); g.gfx.render = () => {}; window.__sd = { g, R }; return 'ok'; })()`));
  for (const [who, t] of at) {
    await ev(`(() => { const { g } = window.__sd, m = g.match; while (m.t < ${t - B} - 1e-6) { g.running = true; g.frame(1 / 60); g.running = false; } return 1; })()`);
    for (let k = 0; ; k++) {
      const done = await ev(`(() => { const { g } = window.__sd, m = g.match; return m.t > ${t + AF}; })()`); if (done) break;
      for (const vw of ['behind', 'tv']) {
        const st = await ev(`(() => { const { g, R } = window.__sd, m = g.match, p = m.players[${who}], P = g.fig[${who}].person, cam = g.gfx.camera, V = cam.position.constructor, pel = new V(); P.jointPos('Pelvis', pel);
          const c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov];
          if (${JSON.stringify(vw)} === 'behind') { const s = p.sgn; cam.position.set(pel.x + 0.3 * s, 2.2, pel.z + 4.6 * s); cam.lookAt(pel.x, 1.0, pel.z); cam.fov = 42; }
          else { g.updateCamera(0); const d = cam.position.distanceTo(pel); cam.lookAt(pel.x, 1.0, pel.z); cam.fov = Math.max(4, 2 * Math.atan(1.6 / d) * 57.3); }
          cam.updateProjectionMatrix(); R(1 / 60); cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix();
          const st = p.stroke || p.lastStroke; return 't ' + m.t.toFixed(2) + ' v ' + Math.hypot(p.vx, p.vz).toFixed(1) + ' ' + (st ? st.kind + '/' + st.wing + (st.tc != null ? ' u' + (m.t - st.tc).toFixed(2) : ' prep') : '-'); })()`);
        await shot(`${OUT}_${who}_${t}_${String(k).padStart(2, '0')}_${vw}.jpg`); if (vw === 'behind') console.log('FRAME', who, t, k, st);
      }
      await ev(`(() => { const { g } = window.__sd; for (let f = 0; f < ${ST}; f++) { g.running = true; g.frame(1 / 60); g.running = false; } return 1; })()`);
    }
  }
}
