// Legs in the pose lab with the lab's own go(u) (dev.html?lab=<kind>&p=Name): the closest the two legs come (shins, lower
// thighs), the ankles' distance, every 1/60 s from U0 to U1. env: U0 U1 FLAGS
export default async function ({ ev }) {
  const E = process.env, U0 = +(E.U0 ?? -2), U1 = +(E.U1 ?? 1);
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))}); const L = window.__lab, fg = L.fig, P = fg.person, V = window.__THREE.Vector3, J = {}, out = [];
    for (const n of ['L_Thigh','R_Thigh','L_Calf','R_Calf','L_Foot','R_Foot']) J[n] = new V();
    const segD = (a0, a1, b0, b1) => { let best = 9; for (let k = 0; k <= 8; k++) { const q = new V().lerpVectors(a0, a1, k / 8), ab = new V().subVectors(b1, b0), tt = Math.max(0, Math.min(1, new V().subVectors(q, b0).dot(ab) / Math.max(1e-6, ab.lengthSq()))); best = Math.min(best, q.distanceTo(b0.clone().addScaledVector(ab, tt))); } return best; };
    for (let u = ${U0}; u <= ${U1} + 1e-6; u += 1 / 60) { L.go(u); for (const n in J) P.jointPos(n, J[n]);
      const shin = segD(J.L_Calf, J.L_Foot, J.R_Calf, J.R_Foot), knee = segD(new V().lerpVectors(J.L_Thigh, J.L_Calf, 0.5), J.L_Calf, new V().lerpVectors(J.R_Thigh, J.R_Calf, 0.5), J.R_Calf);
      out.push(JSON.stringify({ u: +u.toFixed(3), d: +Math.min(shin, knee).toFixed(3), shin: +shin.toFixed(3), ankH: +Math.hypot(J.L_Foot.x - J.R_Foot.x, J.L_Foot.z - J.R_Foot.z).toFixed(3), lk: (fg.lockF || []).map(o => (o.on ? 'on' : 'off') + (o.step ? '+st' : '')) })); }
    return out.join('\\n'); })()`));
}
