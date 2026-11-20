// Footwork lab: dev.html?lab=fh&p=Name. The player in the ready position (phase live) moves S metres sideways (DIR +1 to his
// right, -1 left; FZ forward share) over D seconds with a bell-shaped speed (as to a ball a step or three away), then settles.
// Frames every STEP/60 s from VIEWS into OUT_<view>_nnn.jpg. STROKE=fh|bh adds a stroke whose contact is at the end of the move.
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/shuf/f', S = +(E.S || 1.5), D = +(E.D || 0.6), DIR = +(E.DIR || 1), FZ = +(E.FZ || 0), ST = +(E.STEP || 2), VIEWS = (E.VIEWS || 'back,tv').split(',');
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  await ev(`(() => { const L = __lab, fg = L.fig, p = L.p, m = L.m; m.t = 0; m.phaseT = 0; m.phase = 'live'; m.score.server = 1; p.x = 0; p.z = 11.9; p.vx = p.vz = 0; p.stroke = null; fg.inited = false; fg.handInit = false; p.split = -9; fg.lastSplit = -9;
    const dt = 1 / 120; while (m.t < 0.8) { m.t += dt; m.phaseT = m.t; fg.update(dt, p, m); } window.__sh = { t0: m.t }; return 1; })()`);
  const N = Math.round((D + 0.7) * 60); let n = 0;
  for (let k = 0; k < N; k += ST) {
    await ev(`(() => { const L = __lab, fg = L.fig, p = L.p, m = L.m, dt = 1 / 120, S = ${S}, D = ${D}, vmax = S * Math.PI / (2 * D), ux = ${DIR} * Math.sqrt(1 - ${FZ} * ${FZ}), uz = -${FZ};
      for (let j = 0; j < ${ST} * 2; j++) { const tt = m.t - window.__sh.t0, v = tt > 0 && tt < D ? vmax * Math.sin(Math.PI * tt / D) : 0; p.vx = v * ux; p.vz = v * uz; p.x += p.vx * dt; p.z += p.vz * dt; m.t += dt; m.phaseT = m.t;
        ${E.STROKE ? `if (!p.stroke && tt >= D - 0.75) p.stroke = { kind: 'drive', wing: ${JSON.stringify(E.STROKE)}, t0: m.t, tc: window.__sh.t0 + D, done: false, tEnd: window.__sh.t0 + D, auto: true, cp: null }; if (p.stroke && m.t >= p.stroke.tc + 0.001 && !p.stroke.done) { p.stroke.done = true; p.stroke.hit = true; }` : ''}
        fg.update(dt, p, m); } return 1; })()`);
    for (const vw of VIEWS) { await ev(`__lab.shoot(${JSON.stringify(vw)})`); await shot(`${OUT}_${vw}_${String(n).padStart(3, '0')}.jpg`); }
    n++; }
  console.log('frames', n);
}
