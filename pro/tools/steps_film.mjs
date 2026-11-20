// Film one player's strokes in a computer match: frames every STEP/60 s from 0.6 s before contact to 0.4 s after,
// from a fixed camera behind him (or VIEW=side|front), tiled into one image per stroke. env: P0 P1 WHO KIND WING N STEP VIEW OUT
export default async function ({ ev, sleep, shot }) {
  const P0 = process.env.P0 || 'Federer', P1 = process.env.P1 || 'Nadal', WHO = +(process.env.WHO || 0), WING = process.env.WING || 'bh', N = +(process.env.N || 2), STEP = +(process.env.STEP || 3), VIEW = process.env.VIEW || 'back', OUT = process.env.OUT || '/tmp/rally-work2/film';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js');
    const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(process.env.VEN || '')}) || D.TOURNAMENTS.find(t => !t.indoor && t.surface === 'hard') || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.mode = 'match'; A.covered = false; window.__noOvr = ${!!process.env.NOOVR}; if (${JSON.stringify(process.env.PICK || '')} !== '') window.__forcePick = +${JSON.stringify(process.env.PICK || '0')}; document.querySelectorAll('#hud,#overlay,#ui,#shade,#bug,#strap,#tip,#cut,#wipe').forEach(e => e.style && (e.style.display = 'none'));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(P0)}), p1: ix(${JSON.stringify(P1)}), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
    A.game.running = false; window.__g = A.game; if (${!!process.env.STILL}) { const mm = A.game.match, mp = mm.movePlayer.bind(mm); mm.movePlayer = (p, dt) => { if (p.i === ${WHO} && mm.phase === 'live' && !(p.stroke && p.stroke.kind === 'serve')) { p.vx = 0; p.vz = 0; return; } mp(p, dt); }; } A.game._r = A.game.gfx.render.bind(A.game.gfx); A.game.gfx.render = () => {}; return 'ok';
  })()`));
  let got = 0;
  for (let guard = 0; guard < 400 && got < N; guard++) {
    // run until this player has a stroke of the wanted wing with a known contact time 0.6 s or more ahead
    const r = await ev(`(() => { const g = window.__g, m = g.match, p = m.players[${WHO}];
      for (let f = 0; f < 1200; f++) { g.running = true; g.frame(1 / 60); g.running = false; const st = p.stroke;
        if (st && (${JSON.stringify(process.env.KIND || "")} ? st.kind === ${JSON.stringify(process.env.KIND || "")} : st.kind !== "serve") && (st.kind === "serve" || st.wing === ${JSON.stringify(WING)}) && st.tc != null && (!st.cp || st.cp.y >= ${+(process.env.MINH || 0)}) && Math.hypot(p.vx, p.vz) >= ${+(process.env.MINSPD || 0)} && (!${!!process.env.FWDRUN} || Math.abs(g.fig[${WHO}].latK || 0) < 0.4) && (!${!!process.env.JAM} || (st.cp && Math.abs((st.cp.x - p.x) * p.sgn * p.hs) < ${+(process.env.JAM || 0)})) && (!${!!process.env.FRESH} || m.t - st.t0 < 0.03) && st.tc - m.t > (st.kind === "serve" ? 0.05 : ${+(process.env.PRE || 0.6) - 0.05}) && st.tc - m.t < (st.kind === "serve" ? 2 : ${+(process.env.PRE || 0.6) + 0.05})) return { tc: st.tc, t: m.t, kind: st.kind }; }
      return null; })()`);
    if (!r || typeof r === 'string') continue;
    const frames = Math.round((r.tc - r.t + (+(process.env.AFTER || 0.45))) * 60);
    for (let f = 0, k = 0; f < frames; f++) {
      const dbgOut = await ev(`(() => { const g = window.__g; g.fig[${WHO}].dbgOn = !!${JSON.stringify(process.env.DBG || '')}; g.running = true; g.frame(1 / 60); g.running = false;
        const fig = g.fig[${WHO}], P = fig.person, p = g.match.players[${WHO}], s = p.sgn, cam = g.gfx.camera, V = cam.position.constructor;
        const c = new V(); P.jointPos('Spine2', c); const v = ${JSON.stringify(VIEW)};
        if (v === 'back') cam.position.set(p.x + 0.3 * s, 1.7, p.z + 3.6 * s); else if (v === 'front') cam.position.set(p.x, 1.6, p.z - 3.6 * s); else cam.position.set(p.x + 3.6 * s * (fig.hs || 1), 1.5, p.z);
        cam.lookAt(c.x, c.y - 0.1, c.z); cam.fov = 40; cam.updateProjectionMatrix(); g._r(1 / 60);
        const d = fig.dbg; if (!d || !d.wr3) return null; const hit = fig.hs > 0 ? 1 : 0, i = ${JSON.stringify(process.env.ARM || 'off')} === 'hit' ? hit : 1 - hit, sh = d.sh[i];
        const nk = new V(), pel = new V(), ls = new V(), rs = new V(); P.jointPos('Neck', nk); P.jointPos('Pelvis', pel); P.jointPos('L_UpperArm', ls); P.jointPos('R_UpperArm', rs);
        const up = nk.clone().sub(pel).normalize(), rt = rs.clone().sub(ls); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt);
        const loc = w => { const v = w.clone().sub(sh); return [v.dot(rt) * fig.hs, v.dot(up), v.dot(fw)].map(x => +x.toFixed(2)); };
        const st = p.stroke || p.lastStroke, u = st && st.tc != null ? g.match.t - st.tc : null;
        const lf = new V(), rf = new V(); P.jointPos('L_Foot', lf); P.jointPos('R_Foot', rf); const fl = w => { const q = w.clone().sub(pel); return [+(q.dot(rt)).toFixed(2), +q.y.toFixed(2), +(q.dot(fw)).toFixed(2)]; };
        const bl = g.match.ball; return { pick: st && st.clipPick ? st.clipPick.i : null, pickSit: st && st.clipPick ? st.clipPick.sit : null, want: st && st.clipPick ? st.clipPick.want : null, cpY: st && st.cp ? +st.cp.y.toFixed(2) : null, roomX: +(fig.roomX || 0).toFixed(2), roomF: +(fig.roomF || 0).toFixed(2), gripWo: +(fig.gripW || 0).toFixed(2), bly: bl ? +bl.y.toFixed(2) : null, relX: bl ? +((bl.x - p.x) * p.sgn * p.hs).toFixed(2) : null, relZ: bl ? +((p.z - bl.z) * p.sgn).toFixed(2) : null, metW: +(fig.metW || 0).toFixed(2), plW: +(fig.plW || 0).toFixed(2), lead: fig.pl ? fig.pl.lead : null, latK: +(fig.latK || 0).toFixed(2), spd: +Math.hypot(p.vx, p.vz).toFixed(2), legRun: +(fig.legRunNow || 0).toFixed(2), lfoot: fl(lf), rfoot: fl(rf), pelY: +pel.y.toFixed(2), lock: fig.lockF ? fig.lockF.map(L => L.on ? 1 : L.step ? 2 : 0) : null, u: u == null ? null : +u.toFixed(2), kind: st && st.kind, wing: st && st.wing, sw: +(fig.swNow || 0).toFixed(2), clipW: +(fig.clipW || 0).toFixed(2), freeOff: +(d.freeOff || 0).toFixed(2), clipWr: loc(d.cWr[i]), tgt1: loc(d.tgt1[i]), tgt2: loc(d.tgt2[i]), hand: loc(d.hand[i]), wrist: loc(d.wr3[i]), elbow: loc(d.el[i]), tS: d.tS ? loc(d.tS[i]) : null, tI: d.tI ? loc(d.tI[i]) : null, tZ: d.tZ ? loc(d.tZ[i]) : null, wr2: d.wr2 ? loc(d.wr2[i]) : null, wrB: d.wrB ? loc(d.wrB[i]) : null, wrL: d.wrL && d.wrL[i] ? loc(d.wrL[i]) : null, keyH: d.keyH ? loc(d.keyH) : null, head: (() => { const hd = new V(); P.jointPos('Head', hd); return loc(hd); })(), lgrip: +((fig.lgWE != null ? fig.lgWE : 0)).toFixed(2), gripW: +(fig.gripW || 0).toFixed(2), sw2: +(fig.swNow || 0).toFixed(2), wr2: d.wr2 ? loc(d.wr2[i]) : null, wrB: d.wrB ? loc(d.wrB[i]) : null, got: d.got ? [d.got[i].dot(rt) * fig.hs, d.got[i].dot(up), d.got[i].dot(fw)].map(x => +x.toFixed(2)) : null, wr2o: d.wr2 ? loc(d.wr2[1 - i]) : null, wrBo: d.wrB ? loc(d.wrB[1 - i]) : null, wr3o: loc(d.wr3[1 - i]), handO: loc(d.hand[1 - i]), lift: +(fig.rkLift || 0).toFixed(3), gripW2: +(fig.gripW || 0).toFixed(2), pole: d.pole && d.pole[i] ? [d.pole[i].dot(rt) * fig.hs, d.pole[i].dot(up), d.pole[i].dot(fw)].map(x => +x.toFixed(2)) : null, twoHW: +(fig.twoHW || 0).toFixed(2), armW: +(d.armW || 0).toFixed(2), rk: [fig.rk.dir.x, fig.rk.dir.y, fig.rk.dir.z].map(x => +x.toFixed(2)), rkB: (() => { const f = fig.fwd, rx = -f.z, rz = f.x, rl = Math.hypot(rx, rz) || 1, fl = Math.hypot(f.x, f.z) || 1, d = fig.rk.dir; return [(d.x * rx + d.z * rz) / rl * (fig.hs || 1), d.y, (d.x * f.x + d.z * f.z) / fl].map(x => +x.toFixed(2)); })() }; })()`);
      if (dbgOut && dbgOut !== 'null') console.log(JSON.stringify(dbgOut));
      if (f % STEP === 0) { await shot(`${OUT}_${got}_${String(k).padStart(2, '0')}.jpg`); k++; }
    }
    console.log('filmed', r.kind, 'stroke', got); got++;
  }
}
