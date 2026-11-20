// Deterministic footwork test: one player driven through a fixed script of runs, stops, backpedals, diagonals and shuffles
// (the match itself not stepped: phase held 'live', no ball, no strokes), measured every frame for feet that float, slide
// or glide on their toes; FILM=1 also saves frames every STEP from VIEW (back|side). env: P0 NOSYNC BACKLIFT FILM STEP VIEW OUT
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/loco', STEP = +(E.STEP || 4), VIEW = E.VIEW || 'side';
  console.log(await ev(`(async () => { const A = window.__app, D = await import('./js/data.js');
    window.__noSync = ${!!E.NOSYNC}; window.__noLow = ${!!E.NOLOW}; for (const fl of ${JSON.stringify((E.FLAGS || '').split(',').filter(Boolean))}) window['__' + fl] = true; window.__backLift = ${E.NOSYNC ? 1 : +(E.BACKLIFT || 0.7)}; if (${JSON.stringify(E.BACKLIFT || '')}) window.__backLift = +${JSON.stringify(E.BACKLIFT || '1')};
    const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.mode = 'match'; A.covered = false; document.querySelectorAll('#hud,#overlay,#ui,#shade,#bug,#strap,#tip,#cut,#wipe').forEach(e => e.style && (e.style.display = 'none'));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Djokovic')}), p1: ix('Nadal'), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
    const g = A.game; g.running = false; g._r = g.gfx.render.bind(g.gfx); g.gfx.render = () => {};
    const m = g.match, p = m.players[0]; p.stroke = null; p.lastStroke = null; p.x = 0; p.z = p.sgn * 11; p.vx = p.vz = 0; m.phase = 'live'; m.ball.visible = false;
    g.fig[0].loco.phF = 0; g.fig[0].loco.phS = 0;
    // the script: [duration s, target velocity right, target velocity forward (toward the net)] , eased with the player's accel
    const S = [[1, 0, 0], [1.1, 5, 0], [0.8, 0, 0], [1.1, -5, 0], [0.8, 0, 0], [1.3, 0, -2.6], [0.7, 0, 0], [1.0, 0, 5], [0.7, 0, 0], [0.9, -2.2, -2.2], [0.9, 3, 3], [0.7, 0, 0],
      [0.35, 1.6, 0], [0.35, -1.6, 0], [0.35, 1.6, 0], [0.35, -1.6, 0], [0.8, 0, 0], [0.9, 3.5, -1.5], [0.9, -3.5, -1.5], [1, 0, 0]];
    let seg = 0, segT = 0; const st = { n: 0, float: 0, floatN: 0, slide: 0, slideN: 0, glide: 0, glideN: 0, prev: null, seg: [] };
    window.__loco = { S, step(n, film) {
      const f = g.fig[0], P = f.person, V = g.gfx.camera.position.constructor, out = [];
      for (let k = 0; k < n; k++) {
        if (seg >= S.length) return null;
        const [d, tr, tf] = S[seg]; segT += 1 / 60; if (segT >= d) { seg++; segT = 0; }
        // target velocity in world: right = +x * sgn... the player faces the net (-z for sgn +1)
        const s = p.sgn, wx = tr * s, wz = -tf * s, a = 6.8 * 1.2, dvx = wx - p.vx, dvz = wz - p.vz, dl = Math.hypot(dvx, dvz), kk = dl > 1e-6 ? Math.min(1, a / 60 / dl) : 0;
        p.vx += dvx * kk; p.vz += dvz * kk; p.x += p.vx / 60; p.z += p.vz / 60; m.t += 1 / 60; m.phaseT = (m.phaseT || 0) + 1 / 60; m.phase = 'live'; p.stroke = null; p.lastStroke = null;
        f.update(1 / 60, p, m);
        const J = {}; for (const nm of ['L_Foot', 'R_Foot', 'L_Toe0', 'R_Toe0']) { J[nm] = new V(); P.jointPos(nm, J[nm]); }
        const spd = Math.hypot(p.vx, p.vz); st.n++;
        if (spd > 0.6 && spd < 3) { st.floatN++; const up = J.L_Foot.y > 0.14 && J.R_Foot.y > 0.14 && J.L_Toe0.y > 0.04 && J.R_Toe0.y > 0.04; if (up) st.float++;
          const sg = st.seg[seg] || (st.seg[seg] = [0, 0]); sg[1]++; if (up) sg[0]++; }
        if (spd >= 0.6 && spd < 2 && J.L_Foot.y > 0.14 && J.R_Foot.y > 0.14 && J.L_Toe0.y > 0.04 && J.R_Toe0.y > 0.04 && (st.dbgN = (st.dbgN || 0) + 1) <= 40) (st.dbg || (st.dbg = [])).push({ seg, spd: +spd.toFixed(2), Ly: +J.L_Foot.y.toFixed(3), Ry: +J.R_Foot.y.toFixed(3), lock: f.lockF.map(q => q.on ? 'on' : q.step ? 'step' + q.step.t.toFixed(2) : 'up'), lift: f.feet.map(q => +q.lift.toFixed(3)), w: [f.loco.w.go, f.loco.w.f, f.loco.w.b, f.loco.w.r, f.loco.w.l].map(x => +x.toFixed(2)), ph: +f.loco.phF.toFixed(2), legRun: +(f.legRunNow || 0).toFixed(2), pelY: +f.pelvisY.toFixed(3) });
        // lag: running sideways (more than 1.5 m/s across the way he faces), how far the trailing foot is behind the hips along
        // the way he is going, and whether it is up off the court while it is far behind
        { const fx = -Math.sin(f.frame.rotation.y), fz = -Math.cos(f.frame.rotation.y), rx = -fz, rz = fx, vl = p.vx * rx + p.vz * rz;
          if (Math.abs(vl) > 1.5) { const dir = Math.sign(vl), pel = new V(); P.jointPos('Pelvis', pel); st.lagN = (st.lagN || 0) + 1;
            let worst = 0, up = false; for (const sd of ['L', 'R']) { const ft = J[sd + '_Foot'], al = ((ft.x - pel.x) * rx + (ft.z - pel.z) * rz) * dir; if (-al > worst) { worst = -al; up = ft.y > 0.15; } }
            st.lagSum = (st.lagSum || 0) + worst; if (worst > 0.4) st.lag40 = (st.lag40 || 0) + 1; if (worst > 0.4 && up) st.lagAir = (st.lagAir || 0) + 1; } }
        { const b = spd < 0.6 ? null : spd < 2 ? 'slow' : spd < 3 ? 'jog' : null; if (b) { const q = st.band || (st.band = {}); const o = q[b] || (q[b] = [0, 0]); o[1]++; if (J.L_Foot.y > 0.14 && J.R_Foot.y > 0.14 && J.L_Toe0.y > 0.04 && J.R_Toe0.y > 0.04) o[0]++; } }
        if (st.prev) for (const sd of ['L', 'R']) { const ft = J[sd + '_Foot'], pf = st.prev[sd + '_Foot'], toe = J[sd + '_Toe0'], pt = st.prev[sd + '_Toe0'];
          if (ft.y < 0.105 && pf.y < 0.105 && toe.y < 0.03) { st.slideN++; const v = Math.hypot(ft.x - pf.x, ft.z - pf.z) * 60; if (v > 0.5) st.slide++; }
          if (toe.y < 0.03 && pt.y < 0.03 && ft.y >= 0.105) { st.glideN++; const v = Math.hypot(toe.x - pt.x, toe.z - pt.z) * 60; if (v > 1.0) st.glide++; } }
        st.prev = J;
      }
      if (film) { const cam = g.gfx.camera, c = new V(); P.jointPos('Pelvis', c); const v = ${JSON.stringify(VIEW)}, s = p.sgn;
        if (v === 'back') cam.position.set(c.x, 1.5, c.z + 4.5 * s); else cam.position.set(c.x + 5 * s, 1.2, c.z);
        cam.lookAt(c.x, 0.6, c.z); cam.fov = 40; cam.updateProjectionMatrix(); g._r(1 / 60); }
      return { seg, spd: +Math.hypot(p.vx, p.vz).toFixed(2), sc: S[Math.min(seg, S.length - 1)].slice(1).join(',') };
    }, stats: () => ({ frames: st.n, floatPct: +(100 * st.float / Math.max(1, st.floatN)).toFixed(2), slidePct: +(100 * st.slide / Math.max(1, st.slideN)).toFixed(2), glidePct: +(100 * st.glide / Math.max(1, st.glideN)).toFixed(2), glideN: st.glideN, lagN: st.lagN || 0, lagMean: +((st.lagSum || 0) / Math.max(1, st.lagN || 0)).toFixed(3), lag40: +(100 * (st.lag40 || 0) / Math.max(1, st.lagN || 0)).toFixed(1), lagAir: +(100 * (st.lagAir || 0) / Math.max(1, st.lagN || 0)).toFixed(1), dbg: st.dbg, forced: g.fig[0].forcedSteps || 0, band: Object.fromEntries(Object.entries(st.band || {}).map(([k, o]) => [k, o[0] + '/' + o[1]])), lifts: g.fig[0].liftSteps || 0, bySeg: st.seg.map((x, i) => x ? i + ':' + x[0] + '/' + x[1] : null).filter(Boolean).join(' ') }) };
    return 'ok'; })()`));
  let k = 0;
  for (let i = 0; i < 2000; i++) { const r = await ev(`window.__loco.step(${STEP}, ${!!E.FILM})`); if (!r) break;
    if (E.FILM && (!E.SEGS || E.SEGS.split(',').map(Number).includes(r.seg))) { await shot(`${OUT}_${String(k).padStart(3, '0')}.jpg`); console.log('F', k, JSON.stringify(r)); k++; } }
  console.log('STATS', JSON.stringify(await ev(`window.__loco.stats()`)));
}
