// Drive a computer match frame by frame and measure the arms against the chest: per-frame swing of each segment
// (flail) and how high / far out each elbow is through every stroke (chicken wing). env: P0 P1 SECS VEN DUMP
export default async function ({ ev, sleep }) {
  const P0 = process.env.P0 || 'Federer', P1 = process.env.P1 || 'Nadal', SECS = +(process.env.SECS || 60), VEN = process.env.VEN || '';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js');
    const T = D.TOURNAMENTS.find(t => ${JSON.stringify(VEN)} ? t.key === ${JSON.stringify(VEN)} : !t.indoor && t.surface === 'hard') || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || p.name || "").includes(n));
    A.mode = 'match'; A.covered = false;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(P0)}), p1: ix(${JSON.stringify(P1)}), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
    A.game.running = false; window.__g = A.game; A.game._r = A.game.gfx.render.bind(A.game.gfx); A.game.gfx.render = () => {};
    return 'started ' + T.key + ' ';
  })()`));
  const res = await ev(`(() => {
    const g = window.__g, m = g.match, V = g.fig[0].person.bones[Object.keys(g.fig[0].person.bones)[0]].position.constructor;
    const v = () => new V(), J = {}; const names = ['Pelvis', 'Neck', 'L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand'];
    let cuts = 0; const pen = {}; const prev = [{}, {}], rows = [], worst = [], wing = {}, wingF = {}, wingEx = [];
    const N = ${SECS} * 60;
    for (let f = 0; f < N; f++) {
      g.running = true; g.frame(1 / 60); g.running = false;
      for (let i = 0; i < 2; i++) {
        const fig = g.fig[i], P = fig.person, p = m.players[i];
        for (const n of names) P.jointPos(n, J[n] || (J[n] = v()));
        const pj = prev[i].pel, jump = pj ? Math.hypot(J.Pelvis.x - pj.x, J.Pelvis.z - pj.z) : 0; prev[i].pel = { x: J.Pelvis.x, z: J.Pelvis.z };
        const up = v().subVectors(J.Neck, J.Pelvis).normalize();
        // arms in the body: each arm's centre line against the trunk as the mesh is (half-width 0.39, half-depth 0.31 of the
        // shoulder-joint span, narrowing to the waist and the neck), less the limb's own radius (4 cm)
        { const shWm = J.L_UpperArm.distanceTo(J.R_UpperArm), tLen = J.Neck.distanceTo(J.Pelvis), A0 = shWm * 0.39, B0 = shWm * 0.31;
          const rt0 = v().subVectors(J.R_UpperArm, J.L_UpperArm); rt0.addScaledVector(up, -rt0.dot(up)).normalize(); const fw0 = v().crossVectors(up, rt0);
          const inside = q => { const rel = v().subVectors(q, J.Pelvis), al = rel.dot(up); if (al < 0 || al > tLen * 1.05) return 0; const nk = al < 0.4 * tLen ? 0.75 + 0.25 * al / (0.4 * tLen) : al > 0.9 * tLen ? 0.75 : 1;
            const dx = rel.dot(rt0), dz = rel.dot(fw0), a = A0 * nk + 0.04, b = (dz > 0 ? shWm * 0.25 : shWm * 0.32) * nk + 0.04, e = Math.hypot(dx / a, dz / b); return e < 1 ? (1 - e) * Math.min(a, b) : 0; };
          let st0 = p.stroke; if (!st0 && p.lastStroke && p.lastStroke.tc != null && m.t - p.lastStroke.tc < 1.4 && m.t >= p.lastStroke.tc) st0 = p.lastStroke;
          const u0 = st0 && st0.tc != null ? m.t - st0.tc : null, ph0 = u0 == null ? '-' : u0 < -0.45 ? 'early' : u0 < -0.12 ? 'back' : u0 < 0.02 ? 'fwd' : u0 < 0.35 ? 'fin' : 'recov';
          const key0 = (st0 ? st0.kind.replace(/flat|loop/, 'drive') + '/' + st0.wing + (st0.wing === 'bh' && !fig.oneHand && /drive|flat|loop/.test(st0.kind) ? '2h' : '') : (m.phase === 'live' ? 'move' : m.phase)) + ' ' + ph0;
          let worstD = 0, worstW = ''; for (const S of ['L', 'R']) { const sh = J[S + '_UpperArm'], el = J[S + '_Forearm'], wr = J[S + '_Hand'], dm = (S === 'R') === (fig.hs > 0) ? 'dom' : 'off';
            for (const f of [0.75, 1]) { const d = inside(v().lerpVectors(sh, el, f)); if (d > worstD) { worstD = d; worstW = dm + (f === 1 ? '-elbow' : '-upper'); } }
            for (const f of [0, 0.33, 0.66, 1]) { const d = inside(v().lerpVectors(el, wr, f)); if (d > worstD) { worstD = d; worstW = dm + (f === 1 ? '-hand' : '-fore'); } } }
          if (worstD > 0.04) { const kk = 'by ' + key0 + ' ' + worstW; pen[kk] = pen[kk] || [0, 0, 0]; pen[kk][0]++; pen[kk][1]++; pen[kk][2] = Math.max(pen[kk][2], worstD); }
          const o = pen[key0] || (pen[key0] = [0, 0, 0]); o[1]++; if (worstD > 0.04) o[0]++; o[2] = Math.max(o[2], worstD); }
        const rt = v().subVectors(J.R_UpperArm, J.L_UpperArm); rt.addScaledVector(up, -rt.dot(up)).normalize();
        const fw = v().crossVectors(rt, up).normalize();   // chest forward (right x up)
        const loc = w => [w.dot(rt), w.dot(up), w.dot(fw)];
        let st = p.stroke; if (!st && p.lastStroke && p.lastStroke.tc != null && m.t - p.lastStroke.tc < 1.4 && m.t >= p.lastStroke.tc) st = p.lastStroke;
        const u = st && st.tc != null ? m.t - st.tc : (st && st.tcPlan != null ? m.t - st.tcPlan : null);
        const tag = !st ? (m.phase === 'live' ? 'move' : m.phase) : (st.kind + '/' + (st.wing || '-'));
        const ph = u == null ? (st ? 'prep?' : '-') : u < -0.45 ? 'early' : u < -0.12 ? 'back' : u < 0.02 ? 'fwd' : u < 0.35 ? 'fin' : 'recov';
        for (const S of ['L', 'R']) {
          const ua = loc(v().subVectors(J[S + '_Forearm'], J[S + '_UpperArm']).normalize()), fa = loc(v().subVectors(J[S + '_Hand'], J[S + '_Forearm']).normalize());
          const k = i + S, q = prev[i][S];
          const dom = (S === 'R') === (fig.hs > 0) ? 'dom' : 'off';
          if (q && q.f === f - 1) {
            const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 57.3;
            const dU = ang(ua, q.ua), dF = ang(fa, q.fa);
            if (jump < 0.3) rows.push([i, dom, tag, ph, dU, dF]); else cuts++;
            if (Math.max(dU, dF) > 24 && jump < 0.3) worst.push({ f, i, arm: dom, tag, ph, u: u == null ? null : +u.toFixed(3), dU: +dU.toFixed(1), dF: +dF.toFixed(1), phase: m.phase, spd: +Math.hypot(p.vx, p.vz).toFixed(2), sw: +(fig.swNow || 0).toFixed(2), clipW: +(fig.clipW || 0).toFixed(2), kind: st && st.kind });
          }
          prev[i][S] = { ua, fa, f };
          // elbow: elevation of the upper arm from hanging (0) to horizontal (90) and above; how far out to the side
          const elev = Math.acos(Math.max(-1, Math.min(1, -ua[1]))) * 57.3;
          const side = ua[0] * (S === 'R' ? 1 : -1), back = -ua[2];
          // elbow angle (180 straight)
          const bend = 180 - Math.acos(Math.max(-1, Math.min(1, ua[0] * fa[0] + ua[1] * fa[1] + ua[2] * fa[2]))) * 57.3;
          // the chicken wing: the elbow up near shoulder height and out to the side, beyond the hand (the forearm folded back in)
          { const sgnX = S === 'R' ? 1 : -1, elOut = ua[0] * sgnX * 0.3, wrOut = elOut + fa[0] * sgnX * 0.27, isW = ua[1] > -0.35 && ua[0] * sgnX > 0.45 && wrOut < elOut - 0.06 && !(st && /serve|smash/.test(st.kind));
            const key = dom + ' ' + (st ? st.kind.replace(/flat|loop/, 'drive') + '/' + st.wing : tag) + ' ' + ph; const o = wingF[key] || (wingF[key] = [0, 0]); o[1]++; if (isW) { o[0]++; if (wingEx.length < 400) wingEx.push({ f, i, arm: dom, key, u: u == null ? null : +u.toFixed(2), elev: +(Math.acos(Math.max(-1, Math.min(1, -ua[1]))) * 57.3).toFixed(0), elOut: +elOut.toFixed(2), wrOut: +wrOut.toFixed(2) }); } }
          if (st && /^(drive|flat|loop|slice|block|lob|drop)$/.test(st.kind) && u != null && u > -0.9 && u < 0.6) {
            const key = st.kind.replace(/flat|loop/, 'drive') + '/' + st.wing + '/' + dom + '/' + ph + '/' + i;
            (wing[key] || (wing[key] = [])).push([elev, side, back, bend]);
          }
        }
      }
    }
    // flail summary
    const grp = {};
    for (const r of rows) { const key = r[1] + ' ' + (r[2].startsWith('serve') ? 'serve' : r[2].split('/')[0]) + ' ' + r[3]; (grp[key] || (grp[key] = [])).push(Math.max(r[4], r[5])); }
    const pc = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
    const flail = Object.entries(grp).filter(([k, a]) => a.length > 30).map(([k, a]) => k.padEnd(24) + ' n ' + String(a.length).padStart(5) + '  p95 ' + pc(a, 0.95).toFixed(1).padStart(5) + '  p99 ' + pc(a, 0.99).toFixed(1).padStart(5) + '  max ' + Math.max(...a).toFixed(1).padStart(5) + '  >30: ' + a.filter(x => x > 30).length).sort();
    const wingS = Object.entries(wing).filter(([k, a]) => a.length > 8).map(([k, a]) => { const mean = j => (a.reduce((s, r) => s + r[j], 0) / a.length); return k.padEnd(30) + ' n ' + String(a.length).padStart(4) + '  elev mean ' + mean(0).toFixed(0).padStart(3) + ' p90 ' + pc(a.map(r => r[0]), 0.9).toFixed(0).padStart(3) + ' max ' + Math.max(...a.map(r => r[0])).toFixed(0).padStart(3) + ' | side ' + mean(1).toFixed(2) + ' back ' + mean(2).toFixed(2) + ' | bend ' + mean(3).toFixed(0); }).sort();
    worst.sort((a, b) => Math.max(b.dU, b.dF) - Math.max(a.dU, a.dF));
    const wingT = Object.entries(wingF).filter(([k, o]) => o[0] > 0).map(([k, o]) => k.padEnd(28) + ' wing frames ' + String(o[0]).padStart(4) + ' of ' + String(o[1]).padStart(5) + '  ' + (100 * o[0] / o[1]).toFixed(1) + '%').sort();
    const penT = Object.entries(pen).filter(([k, o]) => o[1] > 20 || (k.startsWith('by ') && o[0] > 8)).map(([k, o]) => k.padEnd(24) + ' arm in body (>4 cm) ' + String(o[0]).padStart(4) + ' of ' + String(o[1]).padStart(5) + '  ' + (100 * o[0] / o[1]).toFixed(1).padStart(5) + '%  deepest ' + (o[2] * 100).toFixed(1) + ' cm').sort();
    return { penT, cuts, flail, wingS, worst: worst.slice(0, 60), nWorst: worst.length, wingT, wingEx: wingEx.filter((x, j) => j % 6 === 0).slice(0, 40) };
  })()`);
  if (typeof res === 'string') { console.log(res); return; }
  console.log('FLAIL (deg per 1/60 s, arm segment vs chest; ' + res.cuts + ' arm-frames at a cut between points left out)\n' + res.flail.join('\n'));
  console.log('\nELBOWS through strokes (key: kind/wing/arm/phase/player)\n' + res.wingS.join('\n'));
  console.log('\nARMS IN THE BODY (centre line within 4 cm of the trunk mesh)\n' + res.penT.join('\n'));
  console.log('\nCHICKEN WING (elbow at/above ~70 deg, out to the side beyond the hand)\n' + res.wingT.join('\n')); for (const w of res.wingEx) console.log(JSON.stringify(w));
  if (process.env.BRIEF) return;
  console.log('\nframes over 24 deg:', res.nWorst); for (const w of res.worst) console.log(JSON.stringify(w));
}
