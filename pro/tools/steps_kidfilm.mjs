// Staged ball-kid check: the human player (P0) is run along the back of his court at 5 m/s straight through the right-hand
// back kid's place and walked back, with the ball in play (the kids' 'frozen' state), the match itself not stepped. Prints
// the closest he came to any kid and the kid's states; FILM=1 saves a frame every STEP from the chase camera to OUT_nnn.jpg.
// env: P0 NODODGE FILM STEP OUT Z (how far back he runs, default 17.6)
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/kf/f', STEP = +(E.STEP || 6);
  console.log(await ev(`(async () => { const A = window.__app, D = await import('./js/data.js'); window.__noDodge = ${!!E.NODODGE};
    const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.mode = 'match'; A.covered = false; document.querySelectorAll('#hud,#overlay,#ui,#shade,#bug,#strap,#tip,#cut,#wipe').forEach(e => e.style && (e.style.display = 'none'));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Lendl')}), p1: ix('McEnroe'), format: 'atp3', difficulty: 1, cam: ${JSON.stringify(E.CAM || 'chase')}, intro: false });
    const g = A.game, m = g.match, p = m.players[0], q = m.players[1]; g.running = false; g._r = g.gfx.render.bind(g.gfx); g.gfx.render = () => {};
    const s = p.sgn, Z = ${+(E.Z || 17.6)}; p.x = 0.5; p.z = s * Z; p.vx = p.vz = 0; p.stroke = p.lastStroke = null; q.stroke = q.lastStroke = null;
    m.phase = 'live'; m.ball.visible = false; m.phaseT = 0;
    // [duration, target speed along +x (his right, seen from behind) , ...]: run through, stop, stand, walk back
    const plan = [[0.4, 0], [1.35, 5], [0.9, 0], [0.6, 0], [2.6, -1.6], [1.0, 0]];   // (to x 7.3: further, at 18 m back, is through the rounded corner, where the sim never lets him go)
    let seg = 0, segT = 0, minD = 9, minAt = null, states = {}; const SC = g.arena.staffCtl;
    window.__kf = { step(n, film) {
      for (let k = 0; k < n; k++) {
        if (seg >= plan.length) return null;
        const [d, tv] = plan[seg]; segT += 1 / 60; if (segT >= d) { seg++; segT = 0; }
        const wx = tv * s, a = 7.5, dv = wx - p.vx; p.vx += Math.sign(dv) * Math.min(Math.abs(dv), a / 60); p.vz = 0; p.x += p.vx / 60;
        m.t += 1 / 60; m.phaseT += 1 / 60; m.phase = 'live'; m.ball.visible = false; p.stroke = p.lastStroke = null;
        for (let i = 0; i < 2; i++) g.fig[i].update(1 / 60, m.players[i], m);
        g.arena.staffWatch(m, g); g.arena.update(1 / 60, m.t); g.updateCamera(1 / 60);
        for (const kd of SC.kids) { states[kd.state] = (states[kd.state] || 0) + 1; for (const pp of SC.players) { const dd = Math.hypot(kd.x - pp.x, kd.z - pp.z); if (dd < minD) { minD = dd; minAt = [+m.t.toFixed(2), kd.state, +kd.x.toFixed(2), +kd.z.toFixed(2)]; } } }
      }
      if (film) g._r(1 / 60);
      const kd = SC.kids.reduce((b, x) => Math.hypot(x.x - SC.players[0].x, x.z - SC.players[0].z) < Math.hypot(b.x - SC.players[0].x, b.z - SC.players[0].z) ? x : b);
      return { t: +m.t.toFixed(2), seg, x: +p.x.toFixed(2), kid: kd.state, kx: +kd.x.toFixed(2), d: +Math.hypot(kd.x - SC.players[0].x, kd.z - SC.players[0].z).toFixed(2) };
    }, stats: () => ({ minD: +minD.toFixed(2), minAt, states }) };
    return 'ok'; })()`));
  let k = 0;
  for (let i = 0; i < 400; i++) { const r = await ev(`window.__kf.step(${STEP}, ${!!E.FILM})`); if (!r) break;
    if (E.FILM) { await shot(`${OUT}_${String(k).padStart(3, '0')}.jpg`); k++; } console.log('F', JSON.stringify(r)); }
  console.log('STATS', JSON.stringify(await ev(`window.__kf.stats()`)));
}
