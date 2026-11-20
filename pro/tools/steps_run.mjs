// Film a player running or backing up outside a stroke (a computer-v-computer match): waits until he is moving at MINSPD
// or more with no stroke showing (MODE=back: mostly backwards for the way he faces; MODE=side: mostly sideways; MODE=fwd:
// mostly forwards), then films FR frames every STEP from VIEW (back|side|front) and logs speed, direction, the gait
// blend and both feet. env: P0 P1 WHO MODE MINSPD N FR STEP VIEW OUT
export default async function ({ ev, shot }) {
  const E = process.env, WHO = +(E.WHO || 0), OUT = E.OUT || '/tmp/rally-work2/run', N = +(E.N || 2), FR = +(E.FR || 36), STEP = +(E.STEP || 3), MODE = E.MODE || 'back', VIEW = E.VIEW || 'back';
  console.log(await ev(`(async () => { const A = window.__app, D = await import('./js/data.js');
    const T = D.TOURNAMENTS.find(t => t.key === 'ao'); const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.mode = 'match'; A.covered = false; document.querySelectorAll('#hud,#overlay,#ui,#shade,#bug,#strap,#tip,#cut,#wipe').forEach(e => e.style && (e.style.display = 'none'));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
    A.game.running = false; window.__g = A.game; A.game._r = A.game.gfx.render.bind(A.game.gfx); A.game.gfx.render = () => {}; return 'ok'; })()`));
  let got = 0;
  for (let guard = 0; guard < 300 && got < N; guard++) {
    const r = await ev(`(() => { const g = window.__g, m = g.match, p = m.players[${WHO}], f = g.fig[${WHO}];
      for (let k = 0; k < 1800; k++) { g.running = true; g.frame(1 / 60); g.running = false; const sp = Math.hypot(p.vx, p.vz);
        const md = ${JSON.stringify(MODE)}, ok = md === 'between' ? (m.phase === 'between' && sp >= ${+(E.MINSPD || 0.6)} && m.phaseT > 0.3) : m.phase === 'live' && sp >= ${+(E.MINSPD || 3)} && (md === 'stop' ? (p.stroke && p.stroke.tc != null && p.stroke.tc - m.t < ${+(E.PRE || 0.5)} && p.stroke.tc - m.t > ${+(E.PRE || 0.5)} - 0.05 && Math.abs(f.latK || 0) > 0.6) : (f.swNow || 0) < 0.05 && (md === 'back' ? (f.fwdK || 0) < -0.55 : md === 'side' ? Math.abs(f.latK || 0) > 0.8 : (f.fwdK || 0) > 0.8));
        if (ok) return { t: m.t, sp }; }
      return null; })()`);
    if (!r) continue;
    for (let fr = 0, k = 0; fr < FR; fr++) {
      const d = await ev(`(() => { const g = window.__g, m = g.match, p = m.players[${WHO}], f = g.fig[${WHO}], P = f.person, s = p.sgn, cam = g.gfx.camera, V = cam.position.constructor;
        g.running = true; g.frame(1 / 60); g.running = false;
        const c = new V(); P.jointPos('Spine2', c); const v = ${JSON.stringify(VIEW)};
        const fx = -Math.sin(f.frame.rotation.y), fz = -Math.cos(f.frame.rotation.y);
        if (v === 'back') cam.position.set(c.x - fx * 4.2, 1.6, c.z - fz * 4.2); else if (v === 'front') cam.position.set(c.x + fx * 4.2, 1.5, c.z + fz * 4.2); else cam.position.set(c.x + fz * 4.2, 1.3, c.z - fx * 4.2);
        cam.lookAt(c.x, 0.85, c.z); cam.fov = 40; cam.updateProjectionMatrix(); g._r(1 / 60);
        const lf = new V(), rf = new V(); P.jointPos('L_Foot', lf); P.jointPos('R_Foot', rf); const L = f.loco.w;
        const pel = new V(); P.jointPos('Pelvis', pel); const rx = Math.cos(f.frame.rotation.y), rz = -Math.sin(f.frame.rotation.y), loc = q => [+((q.x - pel.x) * rx + (q.z - pel.z) * rz).toFixed(2), +((q.x - pel.x) * fx + (q.z - pel.z) * fz).toFixed(2)];
        const J3 = n => { const q = new V(); P.jointPos(n, q); return q; }, kneeA = S => { const h = J3(S + '_Thigh'), k = J3(S + '_Calf'), a = J3(S + '_Foot'); const u = h.clone().sub(k).normalize(), w = a.clone().sub(k).normalize(); return +(180 - Math.acos(Math.max(-1, Math.min(1, u.dot(w)))) * 57.3).toFixed(0); };
        const nk = J3('Neck'), leanD = +(Math.atan2(Math.hypot(nk.x - pel.x, nk.z - pel.z), nk.y - pel.y) * 57.3).toFixed(0);
        return { kL: kneeA('L'), kR: kneeA('R'), lean: leanD, L: loc(lf), R: loc(rf), plW: +(f.plW || 0).toFixed(2), u: p.stroke && p.stroke.tc != null ? +(m.t - p.stroke.tc).toFixed(2) : null, t: +m.t.toFixed(2), sp: +Math.hypot(p.vx, p.vz).toFixed(2), fwdK: +(f.fwdK || 0).toFixed(2), latK: +(f.latK || 0).toFixed(2), sw: +(f.swNow || 0).toFixed(2), w: [L.go, L.f, L.b, L.r, L.l].map(x => +x.toFixed(2)), up: +(L.up || 0).toFixed(2), stance: +((f.pose && f.pose.stance) || 0).toFixed(2), crouch: +((f.pose && f.pose.crouch) || 0).toFixed(2), between: !!(m.phase === 'between'), ph2: m.phase, pT: +(m.phaseT || 0).toFixed(2), pelY2: +(f.pelvisY || 0).toFixed(2), hipY: +f.D.hipY.toFixed(2), ph: +f.loco.phF.toFixed(2), lock: f.lockF.map(q => q.on ? 1 : q.step ? 2 : 0), lfy: +lf.y.toFixed(2), rfy: +rf.y.toFixed(2), legRun: +(f.legRunNow || 0).toFixed(2) }; })()`);
      console.log(JSON.stringify(d));
      if (fr % STEP === 0) { await shot(`${OUT}_${got}_${String(k).padStart(2, '0')}.jpg`); k++; }
    }
    console.log('filmed', got); got++;
  }
}
