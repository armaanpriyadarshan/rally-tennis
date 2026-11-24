// A fingerprint of the game as it plays, for checking that a change to the code changes nothing it should not: a seeded match
// (the computer playing both sides) for SECS seconds, then its end - celebration, walk, handshake, trophy - and every 15 frames
// every bone of both men, the racket, the ball and the camera, rounded to 0.1 mm, hashed. Prints the hash per stage and a few values.
// env: VEN P0 P1 SECS RSEED
export default async function ({ ev }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    let rs = ${+(E.RSEED || 13)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'fin')});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    const cfg = { T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'classic', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: ${+(E.RSEED || 13)}, firstServer: 0 };
    // (once to load everything, then again from the same seed with nothing left loading: loading in its own time takes random
    // numbers in its own order, and the men are built with some)
    await A.game.start(cfg); await new Promise(r => setTimeout(r, 4000)); rs = ${+(E.RSEED || 13)}; await A.game.start(cfg);
    A.mode = 'match'; A.loop = () => {}; const g = A.game, m = g.match; g.running = true; g.gfx.render = () => {};
    rs = ${+(E.RSEED || 13)};   // (again, now everything has loaded: loading in its own time took random numbers in its own order)
    const V = g.gfx.camera.position.constructor, v = new V();
    let h = 2166136261 >>> 0, hc = 2166136261 >>> 0; const mix = x => { const s = String(Math.round(x * 1e4)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    const mixC = x => { const s = String(Math.round(x * 1e3)); for (let i = 0; i < s.length; i++) { hc ^= s.charCodeAt(i); hc = Math.imul(hc, 16777619) >>> 0; } };
    const snap = () => { for (const f of g.fig) { if (!f.group.visible) { mix(-1); continue; } for (const n in f.person.bones) { f.person.bones[n].getWorldPosition(v); mix(v.x); mix(v.y); mix(v.z); } if (f.racket) { f.racket.getWorldPosition(v); mix(v.x); mix(v.y); mix(v.z); } }
      const b = m.ball; mix(b.x); mix(b.y); mix(b.z); const c = g.gfx.camera; mixC(c.position.x); mixC(c.position.y); mixC(c.position.z); mixC(c.fov); };
    const out = [];
    for (let f = 0; f < 60 * ${+(E.SECS || 60)}; f++) { g.frame(1 / 60); if (f % 15 === 0) snap(); }
    out.push('play ' + h.toString(16) + ' cam ' + hc.toString(16) + ' t ' + m.t.toFixed(2) + ' pts ' + m.history.length + ' score ' + JSON.stringify(m.score.g) + ' ' + JSON.stringify(m.score.p));
    for (let k = 0; k < 40 && !m.score.over; k++) m.awardPoint(0);
    let f = 0; while (!g.endSeq && f++ < 300) { g.frame(1 / 60); snap(); }
    if (!g.endSeq) g.endSequence({ trophy: true });
    for (let k = 0; k < 60 * 13; k++) { g.frame(1 / 60); if (k % 10 === 0) snap(); }
    out.push('end ' + h.toString(16) + ' cam ' + hc.toString(16) + ' stage ' + (g.endSeq ? g.endSeq.stage : '-') + ' trophy ' + (g.trophyObj ? g.trophyObj.userData.key : '-'));
    return out.join(' | '); })()`));
}
