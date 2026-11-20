// Staged run forward with the racket back: player P0 starts at his baseline, runs toward the net at V m/s along a heading
// ANG degrees off straight (+ = toward his forehand side), the wind-up of a WING drive under way from LEAD seconds before
// contact, contact at T s after the start, then pulls up. The match itself is not stepped. Per frame it measures the arm
// inside the trunk, the gait the legs play (forward/back/side weights) and the frame's heading against the run; FILM=1 saves
// frames every STEP from VIEW (back|side|chase). env: P0 V ANG WING LEAD T FILM STEP VIEW OUT FLAGS=a,b=1
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/fw/f', STEP = +(E.STEP || 4), VIEW = E.VIEW || 'back';
  const fl = Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; }));
  console.log(await ev(`(async () => { const A = window.__app, D = await import('./js/data.js'); Object.assign(globalThis, ${JSON.stringify(fl)});
    const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.mode = 'match'; A.covered = false; document.querySelectorAll('#hud,#overlay,#ui,#shade,#bug,#strap,#tip,#cut,#wipe').forEach(e => e.style && (e.style.display = 'none'));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix('Nadal'), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
    const g = A.game; g.running = false; g._r = g.gfx.render.bind(g.gfx); g.gfx.render = () => {};
    const m = g.match, p = m.players[0], s = p.sgn, f = g.fig[0], P = f.person, V = g.gfx.camera.position.constructor;
    p.stroke = null; p.lastStroke = null; p.x = 0; p.z = s * 12.2; p.vx = p.vz = 0; m.phase = 'live'; m.ball.visible = false; m.t = 10; m.phaseT = 1;
    const v0 = ${+(E.V || 4.5)}, ang = ${+(E.ANG || 0)} * Math.PI / 180, lead = ${+(E.LEAD || 0.9)}, tC = ${+(E.T || 1.6)}, wing = ${JSON.stringify(E.WING || 'fh')}, t0 = m.t;
    const dirX = Math.sin(ang) * s * p.hs, dirZ = -Math.cos(ang) * s;   // (toward the net; + angle toward his forehand)
    let st = null, n = 0, k = 0; const S = { n: 0, pen5: 0, penMax: 0, side: 0, fwd: 0, yawOff: [], rows: [] };
    const J = {}; for (const nm of ['Neck', 'Pelvis', 'L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand', 'L_Thigh', 'R_Thigh', 'L_Foot', 'R_Foot']) J[nm] = new V();
    window.__fw = { step(nf, film) {
      for (let q = 0; q < nf; q++) {
        const el = m.t - t0; if (el > tC + 1.6) return null;
        const want = el < 0.25 ? 0 : el < tC + 0.15 ? v0 : 0, cur = Math.hypot(p.vx, p.vz), a = (want > cur ? 7 : 9) / 60, nv = want > cur ? Math.min(want, cur + a) : Math.max(want, cur - a);
        p.vx = dirX * nv; p.vz = dirZ * nv; p.x += p.vx / 60; p.z += p.vz / 60; m.t += 1 / 60; m.phaseT += 1 / 60; m.phase = 'live';
        if (!st && el >= tC - lead) { st = p.stroke = { wing, kind: 'drive', t0: m.t, tc: null, tcPlan: t0 + tC, done: false, hit: false, intent: null, auto: false }; st.cpPlan = { x: p.x + dirX * v0 * lead + p.hs * s * 0.0 + (wing === "fh" ? 1 : -1) * p.hs * s * 0.7, y: 0.9, z: p.z + dirZ * v0 * lead - s * 0.5 }; }
        if (st && st.tc == null && el >= tC) { st.tc = m.t; st.cp = { x: p.x + (wing === "fh" ? 1 : -1) * p.hs * s * 0.7, y: 0.9, z: p.z - s * 0.5 }; }
        if (st && st.tc != null && !st.done && m.t > st.tc + 0.05) { st.done = true; st.tEnd = m.t; }
        if (st && st.done && m.t > st.tEnd + 0.9) { p.lastStroke = st; p.stroke = null; }
        f.dbgOn = true; f.update(1 / 60, p, m);
        for (const nm in J) P.jointPos(nm, J[nm]);
        const up = J.Neck.clone().sub(J.Pelvis), tLen = up.length(); up.normalize(); const rt = J.R_UpperArm.clone().sub(J.L_UpperArm), shW = rt.length(); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt);
        const inside = qq => { const rel = qq.clone().sub(J.Pelvis), al = rel.dot(up); if (al < 0 || al > tLen * 1.05) return 0; const nk = al < 0.4 * tLen ? 0.75 + 0.25 * al / (0.4 * tLen) : al > 0.9 * tLen ? 0.75 : 1;
          const dx = rel.dot(rt), dz = rel.dot(fw), aa = shW * 0.39 * nk + 0.04, bb = (dz > 0 ? shW * 0.25 : shW * 0.32) * nk + 0.04, e = Math.hypot(dx / aa, dz / bb); return e < 1 ? (1 - e) * Math.min(aa, bb) : 0; };
        let pen = 0; for (const Sd of ['L', 'R']) { for (const fr of [0.75, 1]) pen = Math.max(pen, inside(J[Sd + '_UpperArm'].clone().lerp(J[Sd + '_Forearm'], fr))); for (const fr of [0, 0.5, 1]) pen = Math.max(pen, inside(J[Sd + '_Forearm'].clone().lerp(J[Sd + '_Hand'], fr))); }
        const sp = Math.hypot(p.vx, p.vz), w = f.loco.w;
        if (st && st.tc != null && Math.abs(m.t - st.tc - ${+(E.DBGU || 0.17)}) < 0.009) { const loc = q => { const r = q.clone().sub(J.Pelvis); return [r.dot(rt), r.dot(up), r.dot(fw)].map(x => +x.toFixed(3)); };
          S.dbgU = { lean: +f.lean.toFixed(3), twist: +f.twist.toFixed(3), yaw: +f.yaw.toFixed(3), pelY: +J.Pelvis.y.toFixed(3), tLen: +tLen.toFixed(3), shW: +shW.toFixed(3), LS: loc(J.L_UpperArm), RS: loc(J.R_UpperArm), LE: loc(J.L_Forearm), RE: loc(J.R_Forearm), LH: loc(J.L_Hand), RH: loc(J.R_Hand), clipW: +(f.clipW||0).toFixed(2), legRun: +(f.legRunNow||0).toFixed(2), shift: f.shiftNow || null, roomX: +(f.roomX||0).toFixed(3), roomF: +(f.roomF||0).toFixed(3), metW: +(f.metW||0).toFixed(2) }; }
        // the hips' heading against the run: the pelvis's forward (thigh line x up) and the velocity
        const hr = J.R_Thigh.clone().sub(J.L_Thigh); hr.y = 0; hr.normalize(); const hf = new V(-hr.z, 0, hr.x); const hipOff = sp > 1 ? Math.round(Math.acos(Math.max(-1, Math.min(1, (hf.x * p.vx + hf.z * p.vz) / sp))) * 57.3) : null;
        let which = ''; if (pen > 0.05) { let best = 0; for (const Sd of ['L', 'R']) { const dm = (Sd === 'R') === (f.hs > 0) ? 'hit' : 'free'; for (const [nm, a0, a1, frs] of [['ua', 'UpperArm', 'Forearm', [0.75, 1]], ['fa', 'Forearm', 'Hand', [0, 0.5, 1]]]) for (const fr of frs) { const v = inside(J[Sd + '_' + a0].clone().lerp(J[Sd + '_' + a1], fr)); if (v > best) { best = v; which = dm + ' ' + nm + fr; } } } (S.pens || (S.pens = [])).push([+(m.t - t0).toFixed(2), st ? (st.tc == null ? 'prep u' + (m.t - st.tcPlan).toFixed(2) : 'u' + (m.t - st.tc).toFixed(2)) : '-', +pen.toFixed(3), which, +sp.toFixed(1), +(f.gripW || 0).toFixed(2), (f.ecAng || []).map(x => +x.toFixed(2)), f.dbgEc || null]); }
        if (sp > 1.5) { S.n++; if (pen > 0.05) S.pen5++; S.penMax = Math.max(S.penMax, pen); S.side += (w.r + w.l) / Math.max(1e-3, w.f + w.b + w.r + w.l); }
        S.rows.push([+(m.t - t0).toFixed(2), +sp.toFixed(1), st ? (st.tc == null ? 'prep' : 'u' + (m.t - st.tc).toFixed(2)) : '-', +pen.toFixed(3), +w.f.toFixed(2), +w.b.toFixed(2), +w.r.toFixed(2), +w.l.toFixed(2), hipOff, +(f.yaw * 57.3).toFixed(0), +(f.clipW || 0).toFixed(2), +(f.legRunNow || 0).toFixed(2)]);
      }
      if (film) { const cam = g.gfx.camera, c = new V(); P.jointPos('Pelvis', c); const vv = ${JSON.stringify(VIEW)};
        if (vv === 'back') cam.position.set(c.x, 1.6, c.z + 4.2 * s); else if (vv === 'side') cam.position.set(c.x + 4.5 * s, 1.2, c.z); else cam.position.set(c.x + 1.2 * s, 2.55, c.z + 4.4 * s);
        cam.lookAt(c.x, 0.7, c.z); cam.fov = 45; cam.updateProjectionMatrix(); g._r(1 / 60); }
      return { t: +(m.t - t0).toFixed(2) };
    }, stats: () => ({ dbgU: S.dbgU || null, pens: S.pens || [], n: S.n, pen5: +(100 * S.pen5 / Math.max(1, S.n)).toFixed(1), penMax: +S.penMax.toFixed(3), sideW: +(S.side / Math.max(1, S.n)).toFixed(2), rows: S.rows.filter((r, i) => i % 4 === 0) }) };
    return 'ok'; })()`));
  let k = 0;
  for (let i = 0; i < 400; i++) { const r = await ev(`window.__fw.step(${STEP}, ${!!E.FILM})`); if (!r) break; if (E.FILM) { await shot(`${OUT}_${String(k).padStart(3, '0')}.jpg`); k++; } }
  const st = await ev(`JSON.stringify(window.__fw.stats())`); const o = JSON.parse(st);
  console.log('STATS', JSON.stringify({ n: o.n, pen5: o.pen5, penMax: o.penMax, sideW: o.sideW }));
  if (E.ROWS) for (const r of o.rows) console.log('R', JSON.stringify(r));
  for (const r of o.pens) console.log('PEN', JSON.stringify(r));
  console.log('DBGU', JSON.stringify(o.dbgU));
}
