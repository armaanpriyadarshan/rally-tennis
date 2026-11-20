// Every tracked groundstroke clip of the lab's player (dev.html?lab=fh&p=Name), standing, KIND (drive|lob|drop|slice|volley)
// on each wing, each clip forced in turn (-1 = his main one, 0.. his others): the worst arm-in-trunk (the audit's trunk), the
// free hand's distance off the racket while gripping, and each arm's fastest turn per frame outside the contact instant.
// env: KINDS, SEEDS (each clip played this many times, from different breathing and gait phases: the worst is kept)
export default async function ({ ev }) {
  const E = process.env;
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  console.log(await ev(`(async () => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))}); const L = window.__lab, fg = L.fig, P = fg.person, p = L.p, m = L.m, V = window.__THREE.Vector3, PA = (await import('./js/playeralts.js')).PLAYER_MOTION_ALTS;
    const NS = ${+(E.SEEDS || 3)}, name = fg.look.name, out = [], J = {}; for (const n of ['Neck','Pelvis','L_UpperArm','R_UpperArm','L_Forearm','R_Forearm','L_Hand','R_Hand']) J[n] = new V();
    const palm = S => { const h = new V(), f1 = new V(), f4 = new V(); P.jointPos(S + '_Hand', h); P.jointPos(S + '_Finger1', f1); P.jointPos(S + '_Finger4', f4); return h.lerp(f4, 0.34).add(f1).multiplyScalar(0.5); };
    for (const KIND of ${JSON.stringify((E.KINDS || 'drive').split(','))}) for (const wing of ['fh', 'bh']) { const nAlt = KIND === 'volley' ? 0 : PA[name] && PA[name][wing] ? PA[name][wing].length : 0;
      for (let pick = -1; pick < nAlt; pick++) { globalThis.__forcePick = pick; let pen = [0, 0, ''], gap = [0, 0], rate = { hit: [0, 0], free: [0, 0] };
       for (let sd = 0; sd < NS; sd++) { fg.breath = 0.5 + sd * 1.9; if (fg.loco) { fg.loco.phF = (0.13 + sd * 0.37) % 1; fg.loco.phS = (0.71 + sd * 0.61) % 1; }
        m.t = 0; p.x = 0; p.z = 11.9; p.vx = p.vz = 0; p.stroke = null; fg.inited = false; fg.handInit = false; p.split = -9; fg.lastSplit = -9;
        const T0 = 2, dt = 1 / 120; let prev = {}, k = 0;
        while (m.t < T0 + 0.85) { m.t += dt; m.phaseT = m.t; if (!p.stroke && m.t >= T0 - 0.9) p.stroke = { kind: KIND, wing, t0: m.t, tc: T0, done: false, tEnd: T0, auto: true, cp: null };
          if (p.stroke && m.t >= p.stroke.tc + 0.001 && !p.stroke.done) { p.stroke.done = true; p.stroke.hit = true; } fg.update(dt, p, m);
          if (++k % 2 || m.t < T0 - 0.95) continue; const u = m.t - T0;
          for (const n in J) P.jointPos(n, J[n]);
          const up = J.Neck.clone().sub(J.Pelvis), tLen = up.length(); up.normalize(); const rt = J.R_UpperArm.clone().sub(J.L_UpperArm), shW = rt.length(); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt);
          const ins = q => { const rel = q.clone().sub(J.Pelvis), al = rel.dot(up); if (al < 0 || al > tLen * 1.05) return 0; const nk = al < 0.4 * tLen ? 0.75 + 0.25 * al / (0.4 * tLen) : al > 0.9 * tLen ? 0.75 : 1; const dx = rel.dot(rt), dz = rel.dot(fw), a = shW * 0.39 * nk + 0.04, b = (dz > 0 ? shW * 0.25 : shW * 0.32) * nk + 0.04, e = Math.hypot(dx / a, dz / b); return e < 1 ? (1 - e) * Math.min(a, b) : 0; };
          const hitS = fg.hs > 0 ? 'R' : 'L';
          { const yw = Math.atan2(fw.x, -fw.z) * 57.3; if (prev.yw != null) { let d = yw - prev.yw; d -= 360 * Math.round(d / 360); prev.ywU += d; if (Math.abs(d) > (rate.yaw || [0])[0]) rate.yaw = [+Math.abs(d).toFixed(1), +u.toFixed(2)]; rate.ywR = [Math.min((rate.ywR || [1e9])[0], +prev.ywU.toFixed(0)), Math.max((rate.ywR || [0, -1e9])[1], +prev.ywU.toFixed(0))]; } else prev.ywU = yw; prev.yw = yw; }
          for (const S of ['L', 'R']) { const dm = S === hitS ? 'hit' : 'free'; for (const [a0, a1, frs] of [['UpperArm', 'Forearm', [0.75, 1]], ['Forearm', 'Hand', [0, 0.5, 1]]]) for (const fr of frs) { const v = ins(J[S + '_' + a0].clone().lerp(J[S + '_' + a1], fr)); if (v > pen[0]) pen = [+v.toFixed(3), +u.toFixed(2), dm]; }
            const ua = J[S + '_Forearm'].clone().sub(J[S + '_UpperArm']).normalize(), fa = J[S + '_Hand'].clone().sub(J[S + '_Forearm']).normalize(), l = x => [x.dot(rt), x.dot(up), x.dot(fw)], lu = l(ua), lf = l(fa);
            if (prev[S] && !(u > -0.1 && u < 0.08)) { const ang = (x, y) => Math.acos(Math.max(-1, Math.min(1, x[0]*y[0]+x[1]*y[1]+x[2]*y[2]))) * 57.3, a = Math.max(ang(lu, prev[S][0]), ang(lf, prev[S][1])); if (a > rate[dm][0]) rate[dm] = [+a.toFixed(1), +u.toFixed(2)]; }
            prev[S] = [lu, lf]; }
          const R = fg.racket; R.updateWorldMatrix(true, false); const a0 = new V(0, -0.09, 0).applyMatrix4(R.matrixWorld), a1 = new V(0, 0.32, 0).applyMatrix4(R.matrixWorld), ab = a1.clone().sub(a0), q = palm(hitS === 'R' ? 'L' : 'R'), tt = Math.max(0, Math.min(1, q.clone().sub(a0).dot(ab) / ab.lengthSq())), d = q.distanceTo(a0.clone().addScaledVector(ab, tt));
          if ((fg.gripOn || 0) > 0.8 && d > gap[0]) gap = [+d.toFixed(3), +u.toFixed(2)];
          { const rd = a1.clone().sub(a0).normalize(), rl = [rd.dot(rt), rd.dot(up), rd.dot(fw)]; if (prev.rk && !(u > -0.1 && u < 0.08)) { const a = Math.acos(Math.max(-1, Math.min(1, rl[0]*prev.rk[0] + rl[1]*prev.rk[1] + rl[2]*prev.rk[2]))) * 57.3; if (a > (rate.rk || [0])[0]) rate.rk = [+a.toFixed(1), +u.toFixed(2)]; if ((u > 0.25 || u < -0.4) && a > (rate.rkR || [0])[0]) rate.rkR = [+a.toFixed(1), +u.toFixed(2)]; } prev.rk = rl; } } }
        out.push(name + ' ' + KIND + ' ' + wing + ' ' + (pick < 0 ? 'main' : 'alt' + pick + (PA[name][wing][pick].situation ? '/' + PA[name][wing][pick].situation : '') + (PA[name][wing][pick].ok === true ? '' : '(off)')) + ' pen ' + JSON.stringify(pen) + ' gap ' + JSON.stringify(gap) + ' rate ' + JSON.stringify(rate)); } }
    globalThis.__forcePick = null; return out.join('\\n'); })()`));
}
