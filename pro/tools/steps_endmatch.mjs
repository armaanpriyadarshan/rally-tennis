// The end of a match as the player gets it: a quick match started as the menus start one, its points given to WHO until it is
// over (classic scoring, so it is quick), then the frames that follow shot at the times in AT (seconds after the last point):
// the celebration, the trophy if he won, the results. OUT_<nn>.jpg, a line per shot. env: P0 P1 VEN WHO AT OUT KIND
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/em/e', AT = (E.AT || '0.5,1.5,3,4.5,5.6,6.5,7.5,9,11,13.5').split(',').map(Number);
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    A.set.format = 'classic'; A.set.cam = 'tv';
    await A.play({ kind: ${JSON.stringify(E.KIND || 'quick')} }, ix(${JSON.stringify(E.P0 || 'Federer')}), ix(${JSON.stringify(E.P1 || 'Nadal')}), T, ${JSON.stringify(E.ROUND || null)});
    A.loop = () => {}; const g = A.game, m = g.match; g.running = true; g.cine = null; window.__em = { g, A };
    for (let f = 0; f < 60 * 2; f++) g.frame(1 / 60);
    for (let k = 0; k < 40 && !m.score.over; k++) m.awardPoint(${+(E.WHO || 0)});
    let f = 0; while (!g.endSeq && f++ < 300) g.frame(1 / 60);
    window.__em.t0 = g.time; return 'over ' + m.score.over + ' winner ' + m.score.winner + ' endSeq ' + !!g.endSeq + (g.endSeq ? ' trophy ' + g.endSeq.trophy + ' kind ' + g.endSeq.kind : ''); })()`));
  for (const at of AT) {
    const st = await ev(`(() => { const { g, A } = window.__em; while (g.time - window.__em.t0 < ${at}) g.frame(1 / 60); const S = g.endSeq;
      return 't ' + (g.time - window.__em.t0).toFixed(2) + ' stage ' + (S ? S.stage : '-') + ' cine ' + (g.cine ? g.cine.kind : '-') + ' overlay ' + document.querySelector('#overlay').className; })()`);
    console.log('SHOT', at, st); await shot(`${OUT}_${String(at).replace('.', '_')}.jpg`);
  }
}
