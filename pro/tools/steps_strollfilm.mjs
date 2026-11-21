// A film of the walk between points: a seeded computer-v-computer match run to the moment after a point when player WHO is
// walking back (speed over 0.6 m/s in the 'between' phase), then every STEP-th frame for SECS seconds shot close from his
// side and from behind him, the camera following his hips. env: P0 P1 RSEED WHO (0|1) SKIP (walks to skip first) SECS STEP OUT
// FLAGS (a,b=1 → globalThis.__a ...)
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/sf/f', WHO = +(E.WHO || 0);
  await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Alcaraz')}), p1: ix(${JSON.stringify(E.P1 || 'Sinner')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 11)}, firstServer: 0, envOverride: { surface: 'hard', pace: 0, tempC: 24, humidity: 0.5, windX: 0, windZ: 0 } });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; window.__sf = { g, m };
    let skip = ${+(E.SKIP || 0)}, was = false;
    for (let f = 0; f < 60 * 400; f++) { g.running = true; g.frame(1 / 60); g.running = false; const p = m.players[${WHO}], on = m.phase === 'between' && Math.hypot(p.vx, p.vz) > 0.6;
      if (on && !was) { if (skip-- <= 0) return m.t.toFixed(2); } was = on; }
    return 'none'; })()`).then(r => console.log('start', r));
  const N = Math.round(+(E.SECS || 2.5) * 60), ST = +(E.STEP || 2); let k = 0;
  for (let f = 0; f < N; f++) {
    const r = await ev(`(() => { const { g, m } = window.__sf; g.running = true; g.frame(1 / 60); g.running = false; const p = m.players[${WHO}], fg = g.fig[${WHO}];
      const P = fg.person, V = P.bones[Object.keys(P.bones)[0]].position.constructor, w = n => { const v = new V(); P.jointPos(n, v); return v; }, ang = (a, k, c) => { const u = w(a).sub(w(k)), v = w(c).sub(w(k)); return Math.round(u.angleTo(v) * 57.3); };
      const LF = w('L_Foot'), RF = w('R_Foot'), pel = w('Pelvis'), LP = fg.loco.P, J0 = 3 * 5, J1 = 3 * 6;
      return [m.t.toFixed(2), m.phase, Math.hypot(p.vx, p.vz).toFixed(2), fg.lockF.map(L => (L.on ? 'D' : '.') + (L.step ? 's' : '')).join(''), (fg.loco.phF || 0).toFixed(2), 'knee', ang('L_Thigh', 'L_Calf', 'L_Foot'), ang('R_Thigh', 'R_Calf', 'R_Foot'), 'pelY', pel.y.toFixed(3), 'feet', Math.hypot(LF.x - RF.x, LF.z - RF.z).toFixed(2), 'clipAnk', Math.hypot(LP[J0] - LP[J1], LP[J0 + 2] - LP[J1 + 2]).toFixed(2), 'up', fg.loco.w.up.toFixed(2), 'ft', [LF.x, LF.y, LF.z, RF.x, RF.y, RF.z].map(x => x.toFixed(3)).join(','), 'rate', JSON.stringify(fg.loco.dbgRate), 'H', fg.H.toFixed(3), 'legScale', (fg.legScale || 0).toFixed(3), 'yaw', (fg.yaw || 0).toFixed(3)].join(' '); })()`);
    console.log('LOG ' + r);
    if (f % ST) continue;
    for (const [nm, vw] of [['side', [3.4, 1.15, 0.0]], ['behind', [0.0, 1.5, 3.6]]]) {
      await ev(`(() => { for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none'; const { g, m } = window.__sf, P = g.fig[${WHO}].person, cam = g.gfx.camera, pel = new (cam.position.constructor)(); P.jointPos('Pelvis', pel);
        const p = m.players[${WHO}], sp = Math.hypot(p.vx, p.vz) || 1, dx = p.vx / sp, dz = p.vz / sp, rx = -dz, rz = dx;   /* side: square to the way he walks */
        const v = ${JSON.stringify(vw)}; if (${JSON.stringify(nm)} === 'side') cam.position.set(pel.x + rx * v[0], v[1], pel.z + rz * v[0]); else cam.position.set(pel.x - dx * v[2], v[1], pel.z - dz * v[2]);
        cam.lookAt(pel.x, pel.y - 0.1, pel.z); cam.fov = 40; cam.updateProjectionMatrix(); g.gfx.render(1 / 60); return 1; })()`);
      await shot(`${OUT}_${nm}_${String(k).padStart(3, '0')}.jpg`);
    }
    k++;
  }
  console.log('frames', k);
}
