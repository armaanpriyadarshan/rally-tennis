// A fingerprint of the game as it plays, for checking that a change to the code changes nothing it should not: a seeded match
// (the computer playing both sides) for SECS seconds, then its end - celebration, walk, handshake, trophy - and every 15 frames
// every bone of both men, the racket, the ball and the camera, rounded to 0.1 mm, hashed. Prints the hash per stage and a few values.
// env: VEN P0 P1 SECS RSEED
export default async function ({ ev }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    let rs = ${+(E.RSEED || 13)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'rg')});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.set.format = 'classic'; A.set.cam = 'tv'; A.set.controls = 'classic';
    await A.play({ kind: 'quick' }, ix(${JSON.stringify(E.P0 || 'Nadal')}), ix(${JSON.stringify(E.P1 || 'Federer')}), T, null);
    A.loop = () => {}; const g = A.game, m = g.match; g.running = true; g.gfx.render = () => {};
    const AIm = await import('./js/ai.js'); m.ctl[0] = new AIm.AI({ human: true }); g.human = null;
    const V = g.gfx.camera.position.constructor, v = new V();
    let h = 2166136261 >>> 0; const mix = x => { const s = String(Math.round(x * 1e4)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    const snap = () => { for (const f of g.fig) { if (!f.group.visible) { mix(-1); continue; } for (const n in f.person.bones) { f.person.bones[n].getWorldPosition(v); mix(v.x); mix(v.y); mix(v.z); } if (f.racket) { f.racket.getWorldPosition(v); mix(v.x); mix(v.y); mix(v.z); } }
      const b = m.ball; mix(b.x); mix(b.y); mix(b.z); const c = g.gfx.camera; mix(c.position.x); mix(c.position.y); mix(c.position.z); mix(c.fov); };
    const out = [];
    for (let f = 0; f < 60 * ${+(E.SECS || 60)}; f++) { g.frame(1 / 60); if (f % 15 === 0) snap(); }
    out.push('play ' + h.toString(16) + ' t ' + m.t.toFixed(2) + ' pts ' + m.history.length + ' score ' + JSON.stringify(m.score.g) + ' ' + JSON.stringify(m.score.p));
    for (let k = 0; k < 40 && !m.score.over; k++) m.awardPoint(0);
    let f = 0; while (!g.endSeq && f++ < 300) { g.frame(1 / 60); snap(); }
    if (!g.endSeq) g.endSequence({ trophy: true });
    for (let k = 0; k < 60 * 13; k++) { g.frame(1 / 60); if (k % 10 === 0) snap(); }
    out.push('end ' + h.toString(16) + ' stage ' + (g.endSeq ? g.endSeq.stage : '-') + ' trophy ' + (g.trophyObj ? g.trophyObj.userData.key : '-'));
    return out.join(' | '); })()`));
}
