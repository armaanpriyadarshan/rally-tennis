// A continuous film of the human player walking along the baseline before his serve, in a real match (index.html): he holds
// an arrow for WALK seconds, then the other way, and every STEP-th frame is shot from behind, the side and the front, close.
// env: P0 P1 (players), RSEED, WALK (s each way, default 1.6), STEP (frames between pictures, default 3), OUT (prefix)
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/wf/f';
  await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 0, envOverride: { surface: 'hard', pace: 0, tempC: 24, humidity: 0.5, windX: 0, windZ: 0 } });
    A.mode = 'match'; A.input.enabled = true; A.input.locked = true;
    const g = A.game, m = g.match; g.running = false; window.__wf = { g, m, A, R: g.gfx.render.bind(g.gfx) }; g.gfx.render = () => {};
    for (let f = 0; f < 600 && m.phase !== 'ready'; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    for (let f = 0; f < 60; f++) { g.running = true; g.frame(1 / 60); g.running = false; }   // settle into the ready phase
    return m.phase; })()`);
  const W = +(E.WALK || 1.6), ST = +(E.STEP || 3), N = Math.round(W * 2 * 60);
  let k = 0;
  for (let f = 0; f < N; f++) {
    const key = f < N / 2 ? 'ArrowLeft' : 'ArrowRight';
    await ev(`(() => { const { g, m, A } = window.__wf; A.input.keys.clear(); A.input.keys.add('${key}'); g.running = true; g.frame(1 / 60); g.running = false; return 1; })()`);
    if (E.DBG && f % 6 === 0) console.log(await ev(`(() => { const { g, m } = window.__wf, fg = g.fig[0], p = m.players[0], P = fg.person, V = P.bones['Bip01_Pelvis'].position.constructor, w = n => { const v = new V(); P.bones['Bip01_' + n].getWorldPosition(v); return v; };
      const ang = (a, k, c) => { const u = w(a).sub(w(k)), v = w(c).sub(w(k)); return Math.round(180 - u.angleTo(v) * 57.3); }, pel = w('Pelvis'), hr = w('R_Hand'), hl = w('L_Hand'), f = fg.fwd;
      return JSON.stringify({ t: +m.t.toFixed(2), ph: m.phase, spd: +Math.hypot(p.vx, p.vz).toFixed(2), wk: +(fg.srvWalkK || 0).toFixed(2), up: +fg.loco.w.up.toFixed(2), go: +fg.loco.w.go.toFixed(2), kL: ang('L_Thigh', 'L_Calf', 'L_Foot'), kR: ang('R_Thigh', 'R_Calf', 'R_Foot'), handFwdR: +((hr.x - pel.x) * f.x + (hr.z - pel.z) * f.z).toFixed(2), handFwdL: +((hl.x - pel.x) * f.x + (hl.z - pel.z) * f.z).toFixed(2), pelY: +pel.y.toFixed(3), lk: fg.lockF.map(L => (L.on ? 'D' : '.') + (L.step ? 's' : '')).join('') }); })()`));
    if (f % ST) continue;
    for (const [vw, nm] of [[[0.25, 1.5, 3.2], 'behind'], [[3.2, 1.2, 0.0], 'side'], [[-0.25, 1.4, -3.2], 'front']]) {
      await ev(`(() => { const { g, m, R } = window.__wf, P = g.fig[0].person, c = g.gfx.camera, pel = new (c.position.constructor)(); P.jointPos('Pelvis', pel); const s = m.players[0].sgn;
        c.position.set(pel.x + ${vw[0]} * s, ${vw[1]}, pel.z + ${vw[2]} * s); c.lookAt(pel.x, pel.y - 0.15, pel.z); c.fov = 40; c.updateProjectionMatrix(); R(1 / 60); return 1; })()`);
      await shot(`${OUT}_${nm}_${String(k).padStart(3, '0')}.jpg`);
    }
    k++;
  }
  console.log('frames', k);
}
