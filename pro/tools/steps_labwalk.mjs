// Walk/run in the pose lab (dev.html?lab=run&p=Name&v=..&vz=..&ph=between): steps the figure 3 s at 1/60 and reports the
// closest the two legs come (shins, and lower thighs to knees, as segments): the legs passing through each other.
// env: SECS
export default async function ({ ev }) {
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((process.env.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))}); const L = window.__lab, fg = L.fig, P = fg.person, p = L.p, m = L.m, V = window.__THREE.Vector3; const out = [];
    const sp = new URLSearchParams(location.search); m.t = 0; p.x = 0; p.z = 11.9; p.vx = +(sp.get('v') || 1.5); p.vz = +(sp.get('vz') || 0); p.stroke = null; fg.inited = false; fg.handInit = false; { const sd = ${+(process.env.SEED ?? 0)}; fg.breath = 0.5 + sd * 1.9; if (fg.loco) { fg.loco.phF = (0.13 + sd * 0.37) % 1; fg.loco.phS = (0.71 + sd * 0.61) % 1; } }
    const J = {}; for (const n of ['L_Thigh','R_Thigh','L_Calf','R_Calf','L_Foot','R_Foot']) J[n] = new V();
    const segD = (a0, a1, b0, b1) => { let best = 9; for (let k = 0; k <= 8; k++) { const q = new V().lerpVectors(a0, a1, k / 8), ab = new V().subVectors(b1, b0), tt = Math.max(0, Math.min(1, new V().subVectors(q, b0).dot(ab) / Math.max(1e-6, ab.lengthSq()))); best = Math.min(best, q.distanceTo(b0.clone().addScaledVector(ab, tt))); } return best; };
    let worst = 9, wt = 0, n9 = 0, n = 0; const S = ${+(process.env.SECS || 3)};
    for (let k = 0; k < S * 60; k++) { m.t += 1 / 60; m.phaseT = m.t; p.x += p.vx / 60; p.z += p.vz / 60; fg.update(1 / 60, p, m); if (k < 60) continue;
      for (const nm in J) P.jointPos(nm, J[nm]);
      const shin = segD(J.L_Calf, J.L_Foot, J.R_Calf, J.R_Foot), knee = segD(new V().lerpVectors(J.L_Thigh, J.L_Calf, 0.5), J.L_Calf, new V().lerpVectors(J.R_Thigh, J.R_Calf, 0.5), J.R_Calf), d = Math.min(shin, knee);
      n++; if (d < 0.09) n9++; if (d < worst) { worst = d; wt = m.t; } }
    return JSON.stringify({ worst: +worst.toFixed(3), at: +wt.toFixed(2), under9: n9, of: n }); })()`));
}
