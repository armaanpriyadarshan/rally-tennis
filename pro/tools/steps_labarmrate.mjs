// Pose-lab arm rate: poses the lab figure every 1/60 s from U0 to U1 (seconds from contact) and prints each arm's largest
// segment turn per frame (upper arm, forearm, in the chest's frame) with the time it happens. env: U0 U1
export default async function ({ ev }) {
  const E = process.env, U0 = +(E.U0 || -0.4), U1 = +(E.U1 || 0.3);
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(() => { const L = window.__lab, P = L.fig.person, V = window.__THREE.Vector3, J = {}; for (const n of ['Neck','Pelvis','L_UpperArm','R_UpperArm','L_Forearm','R_Forearm','L_Hand','R_Hand']) J[n] = new V();
    const out = [], prev = {}; let worst = { L: [0, 0], R: [0, 0] };
    for (let u = ${U0}; u <= ${U1} + 1e-6; u += 1 / 60) { L.go(u); for (const n in J) P.jointPos(n, J[n]);
      const up = J.Neck.clone().sub(J.Pelvis).normalize(), rt = J.R_UpperArm.clone().sub(J.L_UpperArm); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt), loc = q => [q.dot(rt), q.dot(up), q.dot(fw)];
      for (const S of ['L', 'R']) { const ua = loc(J[S + '_Forearm'].clone().sub(J[S + '_UpperArm']).normalize()), fa = loc(J[S + '_Hand'].clone().sub(J[S + '_Forearm']).normalize());
        if (prev[S]) { const ang = (x, y) => Math.acos(Math.max(-1, Math.min(1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))) * 57.3, a = Math.max(ang(ua, prev[S].ua), ang(fa, prev[S].fa)); if (a > worst[S][0]) worst[S] = [+a.toFixed(1), +u.toFixed(3)]; out.push(S + ' ' + u.toFixed(3) + ' ' + a.toFixed(1)); }
        prev[S] = { ua, fa }; } }
    return JSON.stringify(worst); })()`));
}
