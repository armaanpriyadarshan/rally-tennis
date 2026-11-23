export default async function ({ ev, shot }) {
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(process.env.VEN || 'ao')});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.set.format = 'classic'; A.set.cam = 'tv';
    await A.play({ kind: 'quick' }, ix('Federer'), ix('Nadal'), T, null);
    A.loop = () => {}; const g = A.game, m = g.match; g.running = true; g.cine = null; window.__em = { g, A };
    for (let f = 0; f < 60 * 2; f++) g.frame(1 / 60);
    for (let k = 0; k < 40 && !m.score.over; k++) m.awardPoint(0);
    let f = 0; while (!g.endSeq && f++ < 300) g.frame(1 / 60); g.endSkip(); f = 0; while (g.endSeq.stage !== 'trophy' && f++ < 400) g.frame(1 / 60);
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    window.__em.t0 = g.time; return 'stage ' + g.endSeq.stage; })()`));
  for (const at of (process.env.AT || '0.5,2.6,4.0,6.6').split(',').map(Number)) {
    console.log('AT', at, await ev(`(() => { const { g } = window.__em; while (g.time - window.__em.t0 < ${at}) g.frame(1 / 60); const F = g.trophyFit, f = g.fig[g.endSeq.who], V = g.gfx.camera.position.constructor, h = new V(); f.person.jointPos('Head', h); const top = g.trophyObj.position.y; return F ? 'span ' + F.span.toFixed(3) + ' want ' + F.want.toFixed(3) + ' scale ' + F.sc.toFixed(2) + ' trophyFoot ' + top.toFixed(2) + ' headBone ' + h.y.toFixed(2) : '-'; })()`));
    for (const vw of ['game', 'hands', 'side']) {
      await ev(`(() => { const { g } = window.__em, w = g.endSeq.who, P = g.fig[w].person, cam = g.gfx.camera, V = cam.position.constructor, a = new V(), b = new V(); P.jointPos('L_Hand', a); P.jointPos('R_Hand', b);
        const mid = a.clone().add(b).multiplyScalar(0.5), s = g.match.players[w].sgn, c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov];
        if (${JSON.stringify(vw)} === 'hands') { cam.position.set(mid.x, mid.y + 0.1, mid.z - s * 1.1); cam.lookAt(mid.x, mid.y + 0.05, mid.z); cam.fov = 40; cam.updateProjectionMatrix(); }
        else if (${JSON.stringify(vw)} === 'side') { cam.position.set(mid.x + 1.2, mid.y + 0.1, mid.z); cam.lookAt(mid.x, mid.y + 0.05, mid.z); cam.fov = 40; cam.updateProjectionMatrix(); }
        g.gfx.render(0); if (${JSON.stringify(vw)} === 'game') console.log; if (${JSON.stringify(vw)} !== 'game') { cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix(); } return 1; })()`);
      await shot((process.env.OUT || '/tmp/rally-work2/th/t') + '_' + String(at).replace('.', '_') + '_' + vw + '.jpg');
    }
  }
}
