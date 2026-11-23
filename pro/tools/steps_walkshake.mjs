// The end of a match walked through to the handshake: each man's place and speed every SPAN s, the racket's grip end against each
// hand (which hand holds it), and when the handshake starts; shots at AT (game camera, and close from the side at the hand-over
// when ZOOM=1). env: P0 P1 VEN RSEED SPAN AT UNTIL ZOOM
export default async function ({ ev, shot }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 7)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'classic', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: 7, firstServer: 0 });
    A.mode = 'match'; A.loop = () => {}; const g = A.game, m = g.match; g.running = true; g.cine = null; window.__em = { g, A };
    for (let k = 0; k < 11; k++) m.awardPoint(0);
    let f = 0; while (!m.score.over && f++ < 60 * 400) g.frame(1 / 60);
    if (!g.endSeq) g.endSequence({ trophy: false });
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    window.__em.t0 = g.time; return 'winner ' + m.score.winner; })()`));
  const span = +(E.SPAN || 0.5), AT = (E.AT || '').split(',').filter(Boolean).map(Number), end = +(E.UNTIL || 14);
  for (let t = 0, ai = 0; t <= end + 1e-6; t = +(t + span).toFixed(3)) {
    console.log('WS', await ev(`(() => { const { g } = window.__em; while (g.time - window.__em.t0 < ${t}) g.frame(1 / 60); const m = g.match, S = g.endSeq, V = g.gfx.camera.position.constructor;
      const o = ['t ' + (g.time - window.__em.t0).toFixed(2), S ? 'shakeT ' + (S.shakeT != null ? S.shakeT.toFixed(2) : '-') : 'done'];
      for (const i of [0, 1]) { const p = m.players[i], f = g.fig[i], r = f.racket, gp = new V(), dL = new V(), dR = new V(); if (r) { r.getWorldPosition(gp); } f.person.jointPos('L_Hand', dL); f.person.jointPos('R_Hand', dR);
        o.push(f.look.name + ' ' + p.x.toFixed(2) + ',' + p.z.toFixed(2) + ' v ' + Math.hypot(p.vx, p.vz).toFixed(2) + ' rk-L ' + gp.distanceTo(dL).toFixed(2) + ' rk-R ' + gp.distanceTo(dR).toFixed(2) + (f.handover ? ' ho ' + f.handover.u.toFixed(2) : '') + (f.shakeSwap ? ' swap' : '') + (f.shake ? ' k ' + f.shake.k.toFixed(2) : '')); }
      return o.join(' | '); })()`));
    if (ai < AT.length && Math.abs(t - AT[ai]) < span / 2) { await shot(`/tmp/rally-work2/ws/w_${String(AT[ai]).replace('.', '_')}.jpg`);
      if (E.ZOOM) { await ev(`(() => { const { g } = window.__em, i = ${+(E.ZI || 0)}, p = g.match.players[i], cam = g.gfx.camera, c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov]; cam.position.set(p.x + 2.4, 1.3, p.z - p.sgn * 0.8); cam.lookAt(p.x, 1.0, p.z); cam.fov = 40; cam.updateProjectionMatrix(); g.gfx.render(0); window.__em.c0 = c0; return 1; })()`);
        await shot(`/tmp/rally-work2/ws/w_${String(AT[ai]).replace('.', '_')}_z.jpg`);
        await ev(`(() => { const { g } = window.__em, cam = g.gfx.camera, c0 = window.__em.c0; cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix(); return 1; })()`); }
      ai++; }
  }
}
