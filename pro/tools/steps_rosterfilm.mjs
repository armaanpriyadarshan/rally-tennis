// Both players of a seeded computer match, seen as a person sees them: every GAP seconds of live play (and some between points),
// the game's own broadcast frame cropped about each player (CROP lines give the crop), and a camera 3.4 m behind each, at chest
// height, looking the way he faces. OUT_<name>_<tv|behind>_<k>.jpg, K shots each. env: P0 P1 RSEED K GAP OUT T0
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/rf/r', K = +(E.K || 12), GAP = +(E.GAP || 0.7);
  const names = await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Alcaraz')}), p1: ix(${JSON.stringify(E.P1 || 'Sinner')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; window.__rf = { g, m, acc: 0 };
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    for (let f = 0; f < 60 * ${+(E.T0 || 4)}; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    return JSON.stringify(m.players.map(p => p.prof.name.replace(/ /g, '_'))); })()`);
  const NM = JSON.parse(names);
  for (let k = 0; k < K; k++) {
    // run on until GAP seconds of live play have passed (between points counts at a quarter, so a few walks are seen too)
    await ev(`(() => { const S = window.__rf, { g, m } = S; let a = 0; for (let f = 0; f < 60 * 40 && a < ${GAP}; f++) { g.running = true; g.frame(1 / 60); g.running = false; a += (m.phase === 'live' ? 1 : 0.25) / 60; } return 1; })()`);
    for (const w of [0, 1]) {
      const pos = await ev(`(() => { const { g } = window.__rf, cam = g.gfx.camera, P = g.fig[${w}].person, v = new (cam.position.constructor)(); g.gfx.render(1 / 60); P.jointPos('Pelvis', v); v.project(cam); return ((v.x + 1) / 2).toFixed(3) + ' ' + ((1 - v.y) / 2).toFixed(3); })()`);
      console.log('CROP', NM[w], k, pos);
      await shot(`${OUT}_${NM[w]}_tv_${String(k).padStart(2, '0')}.jpg`);
      await ev(`(() => { const { g, m } = window.__rf, fg = g.fig[${w}], P = fg.person, cam = g.gfx.camera, pel = new (cam.position.constructor)(); P.jointPos('Pelvis', pel);
        const f = fg.fwd, c0 = cam.position.clone(), q0 = cam.quaternion.clone(), f0 = cam.fov;
        cam.position.set(pel.x - f.x * 3.4, 1.45, pel.z - f.z * 3.4); cam.lookAt(pel.x, pel.y - 0.05, pel.z); cam.fov = 42; cam.updateProjectionMatrix(); g.gfx.render(1 / 60);
        window.__rf.restore = () => { cam.position.copy(c0); cam.quaternion.copy(q0); cam.fov = f0; cam.updateProjectionMatrix(); }; return 1; })()`);
      await shot(`${OUT}_${NM[w]}_behind_${String(k).padStart(2, '0')}.jpg`);
      await ev(`(() => { window.__rf.restore(); return 1; })()`);
    }
  }
  console.log('done');
}
