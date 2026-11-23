// The end of a match, both men: where each is and how fast he goes, whether his feet step (the lower ankle's height and the gap
// between the ankles), the winner's hands' height and how far his wrist is bent (the angle between the forearm and the hand, elbow
// to wrist against wrist to the middle finger's knuckle), every SPAN seconds; and shots, in the camera he plays with, at AT, and
// from in front of the winner (ZOOM=1). env: P0 P1 VEN WHO AT SPAN OUT FLAGS ZOOM
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/cw/c', AT = (E.AT || '0.9,1.8,3.0,4.2').split(',').map(Number);
  console.log(await ev(`(async () => {
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : JSON.parse(v)]; })))});
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.set.format = 'classic'; A.set.cam = 'tv';
    let g, m;
    if (${JSON.stringify(!!E.LIVE)}) {
      // the last point played out, both men the computer's: the winner celebrates from wherever the point left him
      let rs = ${+(E.RSEED || 7)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
      await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'classic', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 7)}, firstServer: 0 });
      A.mode = 'match'; A.loop = () => {}; g = A.game; m = g.match; g.running = true; g.cine = null;
      for (let k = 0; k < 11; k++) m.awardPoint(${+(E.WHO || 0)});
      let f = 0; while (!m.score.over && f++ < 60 * 400) g.frame(1 / 60);
      if (!g.endSeq) g.endSequence({ trophy: m.score.winner === 0 });
    } else {
      await A.play({ kind: 'quick' }, ix(${JSON.stringify(E.P0 || 'Federer')}), ix(${JSON.stringify(E.P1 || 'Nadal')}), T, null);
      A.loop = () => {}; g = A.game; m = g.match; g.running = true; g.cine = null;
      for (let f = 0; f < 60 * 2; f++) g.frame(1 / 60);
      for (let k = 0; k < 40 && !m.score.over; k++) m.awardPoint(${+(E.WHO || 0)});
      let f = 0; while (!g.endSeq && f++ < 300) g.frame(1 / 60);
    }
    window.__em = { g, A };
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    window.__em.t0 = g.time; return 'winner ' + m.score.winner + ' trophy ' + g.endSeq.trophy; })()`));
  const span = +(E.SPAN || 0.25), end = Math.max(...AT, +(E.UNTIL || 6));
  let next = 0, ai = 0;
  while (next <= end + 1e-6) {
    const line = await ev(`(() => { const { g } = window.__em; while (g.time - window.__em.t0 < ${next}) g.frame(1 / 60); const m = g.match, S = g.endSeq; if (!S) return 'no endSeq';
      const V = g.gfx.camera.position.constructor, j = (P, n) => { const v = new V(); P.jointPos(n, v); return v; }, out = ['t ' + (g.time - window.__em.t0).toFixed(2), S.stage];
      for (const i of [S.who, 1 - S.who]) { const p = m.players[i], P = g.fig[i].person, la = j(P, 'L_Foot'), ra = j(P, 'R_Foot');
        out.push((i === S.who ? 'W' : 'L') + ' z ' + p.z.toFixed(2) + ' v ' + Math.hypot(p.vx, p.vz).toFixed(2) + ' ank ' + Math.min(la.y, ra.y).toFixed(2) + '/' + Math.max(la.y, ra.y).toFixed(2) + ' gap ' + la.distanceTo(ra).toFixed(2));
        if (i === S.who) for (const s of ['R', 'L']) { const e = j(P, s + '_Forearm'), w = j(P, s + '_Hand'), k = j(P, s + '_Finger2'), fa = w.clone().sub(e).normalize(), hd = k.clone().sub(w).normalize();
          out.push(s + ' y ' + w.y.toFixed(2) + ' bend ' + Math.round(Math.acos(Math.max(-1, Math.min(1, fa.dot(hd)))) * 57.3)); }
        if (i === S.who && g.fig[i].racket) { const r = g.fig[i].racket, d = new V(0, 1, 0).applyQuaternion(r.getWorldQuaternion(new r.quaternion.constructor())); out.push('rk ' + [d.x, d.y, d.z].map(v => v.toFixed(2)).join(',')); } }
      return out.join(' | '); })()`);
    console.log('CW', line);
    if (ai < AT.length && Math.abs(next - AT[ai]) < span / 2) {
      await shot(`${OUT}_${String(AT[ai]).replace('.', '_')}.jpg`);
      if (E.ZOOM) { await ev(`(() => { const { g } = window.__em, w = g.endSeq.who, P = g.fig[w].person, cam = g.gfx.camera, V = cam.position.constructor, c = new V(); P.jointPos('Spine2', c); const s = g.match.players[w].sgn, c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov];
          const a = ${+(E.ZANG || 0.6)}; cam.position.set(c.x + Math.sin(a) * 3.2, c.y + 0.2, c.z - s * Math.cos(a) * 3.2); cam.lookAt(c.x, c.y + 0.25, c.z); cam.fov = 40; cam.updateProjectionMatrix(); g.gfx.render(0); window.__em.c0 = c0; return 1; })()`);
        await shot(`${OUT}_${String(AT[ai]).replace('.', '_')}_z.jpg`);
        await ev(`(() => { const { g } = window.__em, cam = g.gfx.camera, c0 = window.__em.c0; cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix(); return 1; })()`); }
      ai++; }
    next = +(next + span).toFixed(4);
  }
}
