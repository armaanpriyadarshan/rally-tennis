// Movement lab: dev.html?lab=fh&p=Name, the player in a live point with no ball, moved by a script of arrow keys as Manual
// footwork moves him (the sim's own acceleration, braking and slower backpedal, 8 directions, speed 6.1 m/s, accel 6.8), every
// STEP frames shot from VIEW (back: behind him; tv: high behind like the broadcast; side; front). Logs, every 3 frames, speed,
// direction, the gait's weights, yaw, both feet's plants, and the lower toe's speed over the court; at the end SLIP: how fast a
// planted foot (held by its lock, no step) moves over the court (frames, share over 0.5 m/s, median, 95th pct, max).
// env: PHASE (live|ready|between: the match phase he moves in; ready with SERVER=1 = receiving), KEYS ("U:1.2,-:0.5,L:0.8,..." U D L R and pairs, - for none), STEP, VIEW, OUT, FLAGS (a,b=1 → globalThis.__a ...), NOSHOT
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/lm/m', ST = +(E.STEP || 2), VW = E.VIEW || 'back';
  const KEYS = (E.KEYS || 'U:1.2,-:0.6,D:1.0,-:0.6,L:0.9,-:0.4,R:0.5,L:0.4,-:0.5,UL:0.9,-:0.5,DR:0.8,-:0.6').split(',').map(x => { const [k, d] = x.split(':'); return [k, +d]; });
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const L = __lab, fg = L.fig, p = L.p, m = L.m; m.t = 0; m.phase = 'live'; m.phaseT = 0; p.x = 0; p.z = 11.9; p.vx = p.vz = 0; p.stroke = null; p.lastStroke = null; p.move = { x: 0, z: 0 }; p.goDist = null;
    m.phase = ${JSON.stringify(E.PHASE || 'live')}; m.score.server = ${+(E.SERVER ?? 1)};
    fg.inited = false; fg.handInit = false; p.split = -9; fg.lastSplit = -9; const dt = 1 / 60; for (let f = 0; f < 60; f++) { m.t += dt; m.phaseT += dt; fg.update(dt, p, m); }
    window.__lm = { kI: 0, kT: 0, log: [], prevToe: null, prevLo: -1, slip: [], slipN: 0, slipT: 0, pa: null, pon: null }; return 1; })()`);
  const total = KEYS.reduce((a, k) => a + k[1], 0), N = Math.round(total * 60); let k = 0;
  for (let f = 0; f < N; f++) {
    await ev(`(() => { const L = __lab, fg = L.fig, p = L.p, m = L.m, S = window.__lm, KEYS = ${JSON.stringify(KEYS)}, dt = 1 / 60;
      S.kT += dt; while (S.kI < KEYS.length - 1 && S.kT > KEYS[S.kI][1]) { S.kT -= KEYS[S.kI][1]; S.kI++; }
      const kk = KEYS[S.kI][0]; let mx = 0, mz = 0; if (kk.includes('L')) mx -= 1; if (kk.includes('R')) mx += 1; if (kk.includes('U')) mz -= 1; if (kk.includes('D')) mz += 1;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; } p.move.x = mx; p.move.z = mz;
      // (the sim's movePlayer: top speed, slower backpedal, accel, harder braking)
      const top = 6.1, back = mz * p.sgn > 0 ? 0.82 : 1, tvx = mx * top, tvz = mz * top * back, dvx = tvx - p.vx, dvz = tvz - p.vz, dv = Math.hypot(dvx, dvz);
      const braking = (tvx * p.vx + tvz * p.vz) < 0.5 * (p.vx * p.vx + p.vz * p.vz), a = 6.8 * (braking ? 1.35 : 1);
      if (dv > 1e-6) { const q = Math.min(1, a * dt / dv); p.vx += dvx * q; p.vz += dvz * q; }
      p.x += p.vx * dt; p.z += p.vz * dt; m.t += dt; m.phaseT += dt; fg.update(dt, p, m);
      const B = fg.person.bones, V = B['Bip01_Pelvis'].position.constructor, lt = new V(), rt = new V(); B['Bip01_L_Toe0'].getWorldPosition(lt); B['Bip01_R_Toe0'].getWorldPosition(rt);
      const lo = lt.y <= rt.y ? 0 : 1, tp = lo ? rt : lt; let ts = null; if (S.prevToe && S.prevLo === lo) ts = Math.hypot(tp.x - S.prevToe.x, tp.z - S.prevToe.z) * 60; S.prevToe = tp.clone(); S.prevLo = lo;
      { const la = new V(), ra = new V(); B['Bip01_L_Foot'].getWorldPosition(la); B['Bip01_R_Foot'].getWorldPosition(ra); const A = [la, ra];
        for (let q = 0; q < 2; q++) { const Lk = fg.lockF[q], pa = S.pa && S.pa[q]; if (pa && Lk.on && !Lk.step && S.pon && S.pon[q] && A[q].y < 0.16) { const v = Math.hypot(A[q].x - pa.x, A[q].z - pa.z) * 60; S.slip.push(v); if (v > 0.5) S.slipN++; S.slipT += 1; } }
        S.pa = A.map(a => a.clone()); S.pon = fg.lockF.map(o => o.on && !o.step);
        // gliding: moving with both feet held on the court and neither stepping
        { const sp = Math.hypot(p.vx, p.vz); if (sp > 0.8) { S.mov = (S.mov || 0) + 1; if (fg.lockF.every(o => o.on && !o.step)) { S.glide = (S.glide || 0) + 1; const gk = kk + '@' + (sp < 2 ? 'slow' : 'fast'); (S.gBy || (S.gBy = {}))[gk] = (S.gBy[gk] || 0) + 1; } } } }
      if (${f} % 3 === 0) { const w = fg.loco.w; S.log.push([+m.t.toFixed(2), kk, +Math.hypot(p.vx, p.vz).toFixed(1), [w.f, w.b, w.r, w.l].map(x => +x.toFixed(1)).join('/'), +(fg.yaw || 0).toFixed(2), fg.lockF.map(o => (o.on ? 'D' : '.') + (o.step ? 's' : '')).join(''), ts == null ? '' : +ts.toFixed(2), 'pump', +(fg.pumpSus || 0).toFixed(2), 'free', +(fg.armFree || 0).toFixed(2), 'hands', (() => { const pl = new V(), lh = new V(), rh = new V(); B['Bip01_Pelvis'].getWorldPosition(pl); B['Bip01_L_Hand'].getWorldPosition(lh); B['Bip01_R_Hand'].getWorldPosition(rh); return [+(pl.z - lh.z).toFixed(2), +(pl.z - rh.z).toFixed(2)].join(','); })()].join(' ')); }
      return 1; })()`);
    if (f % ST || E.NOSHOT) continue;
    await ev(`(() => { __lab.shoot(${JSON.stringify(VW)}); return 1; })()`);
    await shot(`${OUT}_${String(k).padStart(3, '0')}.jpg`); k++;
  }
  console.log(await ev(`window.__lm.log.join('\\n')`));
  console.log('SLIP', await ev(`(() => { const S = window.__lm, a = S.slip.slice().sort((x, y) => x - y); return JSON.stringify({ planted: S.slipT, over05: S.slipN, share: +(S.slipN / Math.max(1, S.slipT)).toFixed(3), p50: +(a[a.length >> 1] || 0).toFixed(2), p95: +(a[Math.floor(0.95 * (a.length - 1))] || 0).toFixed(2), max: +(a[a.length - 1] || 0).toFixed(2), moving: S.mov || 0, glide: S.glide || 0, glideShare: +((S.glide || 0) / Math.max(1, S.mov || 0)).toFixed(3), by: S.gBy || {} }); })()`));
  console.log('frames', k);
}
