// Pose lab: every clip of one player's stroke (his first, -1, and each alternate), scrubbed through the whole swing;
// share of instants with an arm more than 4 cm inside the trunk (as the mesh is, the limb's thickness counted).
// usage: shot.mjs "dev.html?lab=bh&p=Sinner" - --steps tools/steps_clippen.mjs   env N (number of alternates)
export default async function ({ ev }) {
  const N = +(process.env.N || 5), out = [];
  for (let k = -1; k < N; k++) {
    const r = await ev(`(() => { globalThis.__forcePick = ${k}; const L = window.__lab, f = L.fig, P = f.person, V = P.bones[Object.keys(P.bones)[0]].position.constructor, v = () => new V();
      let n = 0, bad = 0, deep = 0, worstU = null;
      for (let u = -0.7; u <= 0.5; u += 0.02) { L.go(u);
        const J = {}; for (const nm of ['Pelvis', 'Neck', 'L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand']) { J[nm] = v(); P.jointPos(nm, J[nm]); }
        const up = v().subVectors(J.Neck, J.Pelvis), tLen = up.length(); up.normalize(); const rt = v().subVectors(J.R_UpperArm, J.L_UpperArm); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = v().crossVectors(up, rt), shW = J.L_UpperArm.distanceTo(J.R_UpperArm);
        const inside = q => { const rel = v().subVectors(q, J.Pelvis), al = rel.dot(up); if (al < 0 || al > tLen * 1.05) return 0; const nk = al < 0.4 * tLen ? 0.75 + 0.25 * al / (0.4 * tLen) : al > 0.9 * tLen ? 0.75 : 1;
          const dx = rel.dot(rt), dz = rel.dot(fw), a = shW * 0.39 * nk + 0.04, b = (dz > 0 ? shW * 0.25 : shW * 0.32) * nk + 0.04, e = Math.hypot(dx / a, dz / b); return e < 1 ? (1 - e) * Math.min(a, b) : 0; };
        let w = 0; for (const S of ['L', 'R']) { for (const fr of [0.75, 1]) w = Math.max(w, inside(v().lerpVectors(J[S + '_UpperArm'], J[S + '_Forearm'], fr))); for (const fr of [0, 0.5, 1]) w = Math.max(w, inside(v().lerpVectors(J[S + '_Forearm'], J[S + '_Hand'], fr))); }
        n++; if (w > 0.04) { bad++; if (w > deep) { deep = w; worstU = u; } } }
      const st = L.p.stroke || {}; return { k: ${k}, sit: st.clipPick ? st.clipPick.sit : '-', n, bad, deep: +(deep * 100).toFixed(0), worstU: worstU == null ? null : +worstU.toFixed(2) }; })()`);
    out.push(r);
  }
  for (const r of out) console.log(typeof r === 'string' ? r : `clip ${String(r.k).padStart(2)}  in body ${String(r.bad).padStart(2)} of ${r.n} instants (${(100 * r.bad / r.n).toFixed(0)}%)  deepest ${r.deep} cm${r.worstU != null ? ' at u ' + r.worstU : ''}`);
}
