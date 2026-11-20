// Pose-lab grip check: for one stroke in dev.html's lab, every 1/60 s from U0 to U1, the free hand's palm distance from the
// racket's handle-and-throat line while the figure means it to be on (gripOn > 0.8), and each arm's segment turn per frame
// (chest frame). Prints the worst of each with the time. env: U0 U1 FLAGS=a=1,b=-0.6 (sets globalThis.__a ...)
export default async function ({ ev }) {
  const E = process.env, U0 = +(E.U0 || -0.95), U1 = +(E.U1 || 0.35);
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  const fl = Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; }));
  console.log(await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(fl)}); const L = window.__lab, fg = L.fig, P = fg.person, V = window.__THREE.Vector3, J = {};
    for (const n of ['Neck','Pelvis','L_UpperArm','R_UpperArm','L_Forearm','R_Forearm','L_Hand','R_Hand']) J[n] = new V();
    const palm = S => { const h = new V(), f1 = new V(), f4 = new V(); P.jointPos(S + '_Hand', h); P.jointPos(S + '_Finger1', f1); P.jointPos(S + '_Finger4', f4); return h.lerp(f4, 0.34).add(f1).multiplyScalar(0.5); };
    let gap = [0, 0], rate = { hit: [0, 0], free: [0, 0] }; const prev = {}, rows = [];
    for (let u = ${U0}; u <= ${U1} + 1e-6; u += 1 / 60) { L.go(u); for (const n in J) P.jointPos(n, J[n]);
      const hitS = fg.hs > 0 ? 'R' : 'L', offS = hitS === 'R' ? 'L' : 'R', R = fg.racket; R.updateWorldMatrix(true, false);
      const a0 = new V(0, -0.09, 0).applyMatrix4(R.matrixWorld), a1 = new V(0, 0.32, 0).applyMatrix4(R.matrixWorld), ab = a1.clone().sub(a0), q = palm(offS), tt = Math.max(0, Math.min(1, q.clone().sub(a0).dot(ab) / ab.lengthSq())), d = q.distanceTo(a0.clone().addScaledVector(ab, tt));
      if ((fg.gripOn || 0) > 0.8 && d > gap[0]) gap = [+d.toFixed(3), +u.toFixed(3)];
      const up = J.Neck.clone().sub(J.Pelvis).normalize(), rt = J.R_UpperArm.clone().sub(J.L_UpperArm); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt), loc = x => [x.dot(rt), x.dot(up), x.dot(fw)];
      for (const S of ['L', 'R']) { const ua = loc(J[S + '_Forearm'].clone().sub(J[S + '_UpperArm']).normalize()), fa = loc(J[S + '_Hand'].clone().sub(J[S + '_Forearm']).normalize()), dm = S === hitS ? 'hit' : 'free';
        if (prev[S] && !(u > -0.1 && u < 0.08)) { const ang = (x, y) => Math.acos(Math.max(-1, Math.min(1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))) * 57.3, a = Math.max(ang(ua, prev[S].ua), ang(fa, prev[S].fa)); if (a > rate[dm][0]) rate[dm] = [+a.toFixed(1), +u.toFixed(3)]; }
        prev[S] = { ua, fa }; } }
    return JSON.stringify({ gap, rate }); })()`));
}
