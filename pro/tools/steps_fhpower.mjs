// How much of a tracked groundstroke's power reaches the screen, and what the footwork round it looks like: one player's
// strokes of one wing in a computer match, every frame from the moment the stroke is chosen to AFTER s after contact, the
// figure as drawn against his own clip sampled at the same moment. Per frame (every 3rd printed): u (s from contact), sw (stroke
// weight), clipW (clip weight); shoulder and hip turn (degrees from square to the net: 90 = side-on, more = back to the net),
// pelvis height, drawn | clip; stance width (m between the ankles) and which foot is down; the hitting hand's and the racket
// head's speed (m/s). SUMMARY per stroke. SHOOT=1 films every STEP frames from a camera like the footage's (behind him at the
// back fence, raised): OUT_<k>_<nn>.jpg. env: P0 P1 WHO WING N AFTER RSEED PICK (clip index, -1 = his first) FLAGS VEN SHOOT STEP OUT
export default async function ({ ev, shot }) {
  const E = process.env, WHO = +(E.WHO || 0), N = +(E.N || 3), AFTER = +(E.AFTER || 0.5), STEP = +(E.STEP || 2), OUT = E.OUT || '/tmp/rally-work2/fp/f';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'), M = await import('./js/motion.js'); window.__J = M.J;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 5)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    A.mode = 'match'; if (${JSON.stringify(E.PICK || '')} !== '') window.__forcePick = +${JSON.stringify(E.PICK || '0')};
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
    A.game.running = false; window.__g = A.game; A.game._r = A.game.gfx.render.bind(A.game.gfx); A.game.gfx.render = () => {}; return 'ok'; })()`));
  for (let got = 0, guard = 0; guard < 200 && got < N; guard++) {
    const r = await ev(`(() => { const g = window.__g, m = g.match, p = m.players[${WHO}];
      for (let f = 0; f < 3000; f++) { g.running = true; g.frame(1 / 60); g.running = false; const st = p.stroke;
        if (st && st.kind !== 'serve' && st.wing === ${JSON.stringify(E.WING || 'fh')} && st.tc != null && st.tc - m.t > 0.3) { window.__fpSt = st; window.__fpPrev = null; g.fig[${WHO}].dbgOn = true; return { tc: st.tc, t: m.t, kind: st.kind }; } }
      return null; })()`);
    if (!r) continue;
    const rows = [];
    for (let f = 0, k = 0; f < Math.round((r.tc - r.t + AFTER) * 60); f++) {
      const x = await ev(`(() => { const g = window.__g, m = g.match, p = m.players[${WHO}], fig = g.fig[${WHO}], P = fig.person, J = window.__J, st = window.__fpSt;
        g.running = true; g.frame(1 / 60); g.running = false;
        const V = g.gfx.camera.position.constructor, s = p.sgn, net = new V(0, 0, -s), u = m.t - st.tc;
        const j = n => { const v = new V(); P.jointPos(n, v); return v; };
        const turn = (a, b) => { const rt = b.clone().sub(a); rt.y = 0; const f = new V(rt.z, 0, -rt.x); f.normalize(); return Math.acos(Math.max(-1, Math.min(1, f.dot(net)))) * 57.3; };
        const cturn = (F, a, b) => { const rx = F[b * 3] - F[a * 3], rz = F[b * 3 + 2] - F[a * 3 + 2], l = Math.hypot(rx, rz) || 1; return Math.acos(Math.max(-1, Math.min(1, rx / l))) * 57.3; };
        const ls = j('L_UpperArm'), rsh = j('R_UpperArm'), lh = j('L_Thigh'), rh = j('R_Thigh'), pel = j('Pelvis'), hand = j(fig.hs > 0 ? 'R_Hand' : 'L_Hand'), la = j('L_Foot'), ra = j('R_Foot');
        const rk = fig.rkDrawn && fig.rkDrawn.ok ? fig.rkDrawn.d : fig.rk.dir, head = hand.clone().addScaledVector(rk, 0.55), pr = window.__fpPrev;
        const hv = pr ? Math.hypot(hand.x - pr[0].x, hand.y - pr[0].y, hand.z - pr[0].z) * 60 : 0, rv = pr ? Math.hypot(head.x - pr[1].x, head.y - pr[1].y, head.z - pr[1].z) * 60 : 0; window.__fpPrev = [hand, head];
        const C = fig.dbgClipS; let cs = null, ch = null, cy = null; if (C && (fig.clipW || 0) > 0.01) { cs = cturn(C, J.lsho, J.rsho); ch = cturn(C, J.lhip, J.rhip); cy = C[J.pelvis * 3 + 1]; }
        if (${+(E.SHOOT || 0)} && ${f} % ${STEP} === 0) { const cam = g.gfx.camera; cam.position.set(p.x + 0.8 * s, 2.6, p.z + 5.5 * s); cam.lookAt(p.x, 0.85, p.z - 1.0 * s); cam.fov = 34; cam.updateProjectionMatrix(); g._r(1 / 60); }
        return { u: +u.toFixed(3), sw: +(fig.swNow || 0).toFixed(2), cw: +(fig.clipW || 0).toFixed(2), sh: +turn(ls, rsh).toFixed(0), csh: cs == null ? null : +cs.toFixed(0), hip: +turn(lh, rh).toFixed(0), chip: ch == null ? null : +ch.toFixed(0), py: +pel.y.toFixed(2), cpy: cy == null ? null : +cy.toFixed(2),
          w: +Math.hypot(la.x - ra.x, la.z - ra.z).toFixed(2), dn: (la.y < 0.12 ? 'L' : '.') + (ra.y < 0.12 ? 'R' : '.'), spd: +Math.hypot(p.vx, p.vz).toFixed(1), hv: +hv.toFixed(1), rv: +rv.toFixed(1), pick: st.clipPick ? st.clipPick.i : null, id: fig.ocDbg ? fig.ocDbg.id : null }; })()`);
      rows.push(x);
      if (+(E.SHOOT || 0) && f % STEP === 0) { await shot(`${OUT}_${got}_${String(k).padStart(2, "0")}.jpg`); console.log("SHOT", got, k, x.u); k++; }
    }
    await ev(`(() => { window.__g.fig[${WHO}].dbgOn = false; return 1; })()`);
    console.log('STROKE', got, r.kind, 'chosen', +(r.tc - r.t).toFixed(2), 's before contact, pick', rows[0].pick, rows.find(x => x.id) ? rows.find(x => x.id).id : '');
    for (const x of rows) if (Math.round(x.u * 60) % 3 === 0) console.log(`u ${x.u >= 0 ? '+' : ''}${x.u.toFixed(2)} sw ${x.sw} cw ${x.cw} | shoulders ${x.sh}/${x.csh} hips ${x.hip}/${x.chip} pelvis ${x.py}/${x.cpy} | stance ${x.w} ${x.dn} spd ${x.spd} | hand ${x.hv} racket ${x.rv}`);
    const pre = rows.filter(x => x.u < 0), mid = rows.filter(x => x.u > -0.25 && x.u < 0.15), mx = (a, k) => Math.max(...a.map(x => x[k] == null ? -1 : x[k])), mn = (a, k) => Math.min(...a.map(x => x[k] == null ? 9 : x[k]));
    console.log('SUMMARY', JSON.stringify({ shoulderTurnMax: [mx(pre, 'sh'), mx(pre, 'csh')], hipTurnMax: [mx(pre, 'hip'), mx(pre, 'chip')], pelvisMin: [mn(pre, 'py'), mn(pre, 'cpy')], stanceMax: mx(pre, 'w'), handTop: mx(mid, 'hv'), racketTop: mx(mid, 'rv') }));
    got++;
  }
}
