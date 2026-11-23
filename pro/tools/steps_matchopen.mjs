// The opening of a match as the player gets it: started as the menus start one (the intro crane, his camera setting, the HUD hidden),
// the first SECS seconds shot every STEP frames through the game's own camera, and close on each player (from behind him, and from the
// broadcast side) for the first CLOSE seconds. OUT_<nn>_<view>.jpg and a line per frame (phase, each player's speed and what his legs
// are playing). env: P0 P1 VEN CAM SECS STEP CLOSE OUT RSEED
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/mo/m', SECS = +(E.SECS || 5), STEP = +(E.STEP || 3), CLOSE = +(E.CLOSE || 1.5);
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 5)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    A.loop = () => {}; A.mode = 'match';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: ${JSON.stringify(E.CAM || 'fp')}, intro: true });
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    A.input.enabled = true; A.input.locked = true; const g = A.game; g.running = false; g.audio = null; g.gfx.auto = false; window.__mo = { g, f: 0 };
    return 'started phase ' + g.match.phase + ' cine ' + (g.cine ? g.cine.kind : '-'); })()`));
  for (let k = 0; k * STEP / 60 < SECS; k++) {
    const st = await ev(`(() => { const { g } = window.__mo, m = g.match; if (window.__mo.f > 0) for (let f = 0; f < ${STEP}; f++) { g.running = true; g.frame(1 / 60); g.running = false; } else { g.running = true; g.frame(1 / 60); g.running = false; } window.__mo.f++;
      const leg = i => { const F = g.fig[i], w = F.loco && F.loco.w || {}; return 'v' + Math.hypot(m.players[i].vx, m.players[i].vz).toFixed(1) + ' go' + (w.go || 0).toFixed(2) + ' up' + (w.up || 0).toFixed(2) + ' st' + (F.strollK || 0).toFixed(2); };
      return 't ' + m.t.toFixed(2) + ' ' + m.phase + ' ' + (g.cine ? g.cine.kind : 'play') + ' | P0 ' + leg(0) + ' | P1 ' + leg(1); })()`);
    console.log('FRAME', k, st); await shot(`${OUT}_${String(k).padStart(2, '0')}_game.jpg`);
    if (k * STEP / 60 < CLOSE) for (const [who, vw] of [[0, 'behind'], [0, 'tv'], [1, 'behind'], [1, 'tv']]) {
      await ev(`(() => { const { g } = window.__mo, m = g.match, p = m.players[${who}], P = g.fig[${who}].person, cam = g.gfx.camera, V = cam.position.constructor, pel = new V(); P.jointPos('Pelvis', pel);
        const c0 = [cam.position.clone(), cam.quaternion.clone(), cam.fov], s = p.sgn;
        if (${JSON.stringify(vw)} === 'behind') { cam.position.set(pel.x + 0.3 * s, 1.9, pel.z + 4.2 * s); cam.lookAt(pel.x, 0.9, pel.z); cam.fov = 40; }
        else { cam.position.set(0, 9.6, 30); const d = cam.position.distanceTo(pel); cam.lookAt(pel.x, 0.95, pel.z); cam.fov = Math.max(3, 2 * Math.atan(1.3 / d) * 57.3); }
        cam.updateProjectionMatrix(); g.gfx.render(0); cam.position.copy(c0[0]); cam.quaternion.copy(c0[1]); cam.fov = c0[2]; cam.updateProjectionMatrix(); return 1; })()`);
      await shot(`${OUT}_${String(k).padStart(2, '0')}_p${who}${vw}.jpg`);
    }
  }
}
