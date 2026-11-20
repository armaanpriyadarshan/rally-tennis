// The server in the ready phase (holding the ball, in his address) shuffling along the baseline, as the arrow keys move him:
// steps the lab figure with p.vx = VX for SECS seconds and saves a frame every STEP/60 s from VIEW (behind|broadcast|side).
// env: VX SECS STEP OUT VIEWS FLAGS
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/srv/f';
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))}); const L = window.__lab, fg = L.fig, p = L.p, m = L.m;
    m.t = 0; m.phase = 'ready'; m.phaseT = 0; m.score.server = 0; m.ball.held = 0; p.x = 0.6; p.z = 11.9; p.vx = 0; p.vz = 0; p.stroke = null; fg.inited = false; fg.handInit = false;
    for (let k = 0; k < 60; k++) { m.t += 1 / 60; m.phaseT = m.t; fg.update(1 / 60, p, m); } window.__sw = { k: 0 }; return 1; })()`);
  const N = Math.round(+(E.SECS || 1.6) * 60), ST = +(E.STEP || 4), views = (E.VIEWS || 'back,tv').split(',');
  let n = 0;
  for (let k = 0; k < N; k += ST) {
    await ev(`(() => { const L = window.__lab, fg = L.fig, p = L.p, m = L.m; for (let j = 0; j < ${ST}; j++) { const kk = window.__sw.k++, ph = kk / 60; p.vx = ${+(E.VX || 1.6)} * (ph < 0.8 ? 1 : ph < 1.4 ? 0 : ph < 2.2 ? -1 : 0); m.t += 1 / 60; m.phaseT = m.t; p.x += p.vx / 60; fg.update(1 / 60, p, m); const R = fg.racket; R.updateWorldMatrix(true, false); const d = new window.__THREE.Vector3(0, 1, 0).transformDirection(R.matrixWorld); const W = window.__sw; if (W.d) { const a = Math.acos(Math.max(-1, Math.min(1, d.dot(W.d)))) * 57.3; if (a > (W.mx || 0)) { W.mx = a; W.at = +ph.toFixed(2); } } W.d = d.clone(); } return 1; })()`);
    for (const vw of views) {
      await ev(`__lab.shoot(${JSON.stringify(vw)})`);
      await shot(`${OUT}_${vw}_${String(n).padStart(3, '0')}.jpg`);
    }
    n++;
  }
  console.log('frames', n, 'racket max deg/frame (world)', await ev('JSON.stringify([window.__sw.mx, window.__sw.at])'));
}
