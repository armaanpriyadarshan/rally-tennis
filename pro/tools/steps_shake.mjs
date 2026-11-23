// the handshake at the net: shots in the game's camera and close from the side, and where the two right hands are
export default async function ({ ev, shot }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = 7; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'classic', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: 7, firstServer: 0 });
    A.mode = 'match'; A.loop = () => {}; const g = A.game, m = g.match; g.running = true; g.cine = null; window.__em = { g, A };
    for (let k = 0; k < 11; k++) m.awardPoint(0);
    let f = 0; while (!m.score.over && f++ < 60 * 400) g.frame(1 / 60);
    if (!g.endSeq) g.endSequence({ trophy: false });
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    window.__em.t0 = g.time; return 'winner ' + m.score.winner; })()`));
  for (const at of (E.AT || '3.8,4.0,4.6,5.0,5.4,6.0').split(',').map(Number)) {
    console.log('SH', at, await ev(`(() => { const { g } = window.__em; while (g.time - window.__em.t0 < ${at}) g.frame(1 / 60); const V = g.gfx.camera.position.constructor, j = (i, n) => { const v = new V(); g.fig[i].person.jointPos(n, v); return v; };
      const a = j(0, 'R_Hand'), b = j(1, 'R_Hand'); return 'gap ' + a.distanceTo(b).toFixed(2) + ' A ' + [a.x, a.y, a.z].map(v => v.toFixed(2)) + ' B ' + [b.x, b.y, b.z].map(v => v.toFixed(2)) + ' p ' + g.match.players.map(p => p.x.toFixed(2) + ',' + p.z.toFixed(2)).join(' '); })()`));
    const tag = String(at).replace('.', '_');
    await shot(`/tmp/rally-work2/cw/s${tag}.jpg`);
    await ev(`(() => { const { g } = window.__em, cam = g.gfx.camera, c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov]; cam.position.set(2.6, 1.35, 0.5); cam.lookAt(0, 1.1, 0); cam.fov = 40; cam.updateProjectionMatrix(); g.gfx.render(0); cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix(); return 1; })()`);
    await shot(`/tmp/rally-work2/cw/s${tag}_z.jpg`);
  }
}
