// Serve in the pose lab (dev.html?lab=serve&p=Name): poses the figure with the lab's own go(u) from U0 to U1 every 1/60 s
// and prints the arm-in-trunk depth (the audit's trunk), which part of which arm, and the hitting arm's joints in the
// body frame. env: U0 U1 FLAGS=a,b=1
export default async function ({ ev }) {
  const E = process.env, U0 = +(E.U0 ?? 0), U1 = +(E.U1 ?? 1.2);
  const fl = Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; }));
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(fl)}); const L = window.__lab, fg = L.fig, P = fg.person, V = window.__THREE.Vector3, J = {}, out = []; fg.dbgOn = true;
    for (const n of ['Neck','Pelvis','L_UpperArm','R_UpperArm','L_Forearm','R_Forearm','L_Hand','R_Hand']) J[n] = new V();
    for (let u = ${U0}; u <= ${U1} + 1e-6; u += 1 / 60) { L.go(u); for (const n in J) P.jointPos(n, J[n]);
      const up = J.Neck.clone().sub(J.Pelvis), tLen = up.length(); up.normalize(); const rt = J.R_UpperArm.clone().sub(J.L_UpperArm), shW = rt.length(); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt);
      const ins = q => { const rel = q.clone().sub(J.Pelvis), al = rel.dot(up); if (al < 0 || al > tLen * 1.05) return 0; const nk = al < 0.4 * tLen ? 0.75 + 0.25 * al / (0.4 * tLen) : al > 0.9 * tLen ? 0.75 : 1; const dx = rel.dot(rt), dz = rel.dot(fw), a = shW * 0.39 * nk + 0.04, b = (dz > 0 ? shW * 0.25 : shW * 0.32) * nk + 0.04, e = Math.hypot(dx / a, dz / b); return e < 1 ? (1 - e) * Math.min(a, b) : 0; };
      const lc = q => { const r = q.clone().sub(J.Pelvis); return [r.dot(rt), r.dot(up), r.dot(fw)].map(x => +x.toFixed(2)); };
      const hitS = fg.hs > 0 ? 'R' : 'L'; let pen = 0, pw = '';
      for (const S of ['L', 'R']) for (const [a0, a1, frs] of [['UpperArm', 'Forearm', [0.75, 1]], ['Forearm', 'Hand', [0, 0.5, 1]]]) for (const fr of frs) { const v = ins(J[S + '_' + a0].clone().lerp(J[S + '_' + a1], fr)); if (v > pen) { pen = v; pw = (S === hitS ? 'hit' : 'free') + a0[0] + fr; } }
      out.push(JSON.stringify({ u: +u.toFixed(3), pen: +pen.toFixed(3), pw, ec: (fg.ecAng || []).map(x => +x.toFixed(2)), hd: fg.handInit, dbgEc: (fg.dbgOn = true, fg.dbgEc || null), fp: fg.dbg ? fg.dbg.fp : null, wrB: fg.dbg && fg.dbg.wrB ? fg.dbg.wrB.map(q => { const r = q.clone().sub(J.Pelvis); return [r.dot(rt), r.dot(up), r.dot(fw)].map(x => +x.toFixed(2)); }) : null, wr3: fg.dbg && fg.dbg.wr3 ? fg.dbg.wr3.map(q => { const r = q.clone().sub(J.Pelvis); return [r.dot(rt), r.dot(up), r.dot(fw)].map(x => +x.toFixed(2)); }) : null, limF: fg.dbg ? fg.dbg.limF : null, wrL: fg.dbg && fg.dbg.wrL ? fg.dbg.wrL.map(q => { const r = q.clone().sub(J.Pelvis); return [r.dot(rt), r.dot(up), r.dot(fw)].map(x => +x.toFixed(2)); }) : null, fgv: fg.dbg ? fg.dbg.fg : null, front: fg.dbg ? fg.dbg.front : null, stc: L.p.stroke ? [L.p.stroke.kind, L.p.stroke.tc, +L.m.t.toFixed(3)] : (L.p.lastStroke ? ['last', L.p.lastStroke.kind] : null), hE: lc(J[hitS + '_Forearm']), hH: lc(J[hitS + '_Hand']), fE: lc(J[(hitS === 'R' ? 'L' : 'R') + '_Forearm']), fH: lc(J[(hitS === 'R' ? 'L' : 'R') + '_Hand']) })); }
    return out.join('\\n'); })()`));
}
