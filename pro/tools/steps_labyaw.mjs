// One stroke in the lab (dev.html?lab=fh&p=Name), every 1/60 s: the shoulder line's and the hips' turn (unwrapped, degrees,
// 0 = square to the net) and the hitting wrist. env: KIND WING PICK U0 U1 SEED
export default async function ({ ev }) {
  const E = process.env;
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(async () => { const L = window.__lab, fg = L.fig, P = fg.person, p = L.p, m = L.m, V = window.__THREE.Vector3;
    const J = {}; for (const n of ['Neck','Pelvis','L_UpperArm','R_UpperArm','L_Thigh','R_Thigh','R_Hand','L_Hand']) J[n] = new V();
    const KIND = ${JSON.stringify(E.KIND || 'drive')}, wing = ${JSON.stringify(E.WING || 'fh')}; globalThis.__forcePick = ${+(E.PICK ?? -1)};
    { const sd = ${+(E.SEED ?? 0)}; fg.breath = 0.5 + sd * 1.9; if (fg.loco) { fg.loco.phF = (0.13 + sd * 0.37) % 1; fg.loco.phS = (0.71 + sd * 0.61) % 1; } }
    m.t = 0; p.x = 0; p.z = 11.9; p.vx = p.vz = 0; p.stroke = null; fg.inited = false; fg.handInit = false; p.split = -9; fg.lastSplit = -9;
    const T0 = 2, dt = 1 / 120, out = []; let k = 0, pS = null, pH = null, uS = 0, uH = 0;
    while (m.t < T0 + ${+(E.U1 ?? 0.6)}) { m.t += dt; m.phaseT = m.t; if (!p.stroke && m.t >= T0 - 0.9) p.stroke = { kind: KIND, wing, t0: m.t, tc: T0, done: false, tEnd: T0, auto: true, cp: null };
      if (p.stroke && m.t >= p.stroke.tc + 0.001 && !p.stroke.done) { p.stroke.done = true; p.stroke.hit = true; } fg.update(dt, p, m);
      if (++k % 2) continue; for (const n in J) P.jointPos(n, J[n]);
      const yw = (a, b) => { const d = b.clone().sub(a); return Math.atan2(-d.z, d.x) * 57.3; }, ys = yw(J.L_UpperArm, J.R_UpperArm), yh = yw(J.L_Thigh, J.R_Thigh);
      if (pS != null) { let d = ys - pS; d -= 360 * Math.round(d / 360); uS += d; d = yh - pH; d -= 360 * Math.round(d / 360); uH += d; } else { uS = ys; uH = yh; } pS = ys; pH = yh;
      const u = m.t - T0; if (u < ${+(E.U0 ?? -0.9)}) continue;
      const w = J.R_Hand.clone().sub(J.Pelvis); const sd = J.R_UpperArm.clone().sub(J.L_UpperArm), el = Math.round(Math.asin(sd.y / sd.length()) * 57.3), sl = +Math.hypot(sd.x, sd.z).toFixed(2), nk = J.Neck.clone().sub(J.Pelvis); out.push([+u.toFixed(3), Math.round(uS), Math.round(uH), 'el', el, 'hz', sl, 'neck', +nk.x.toFixed(2), +nk.y.toFixed(2), +nk.z.toFixed(2), 'wr', +w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2), fg.ocDbg ? fg.ocDbg.cu : null, +(fg.clipW || 0).toFixed(2)].join(' ')); }
    globalThis.__forcePick = null; return out.join('\\n'); })()`));
}
