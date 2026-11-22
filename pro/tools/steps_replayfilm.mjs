// A replay as the player sees it, the page's graphics included (the wipe, the Replay tag): a seeded demo match is played until a
// point is won outright, its replay is asked for, and every GAP s of screen time is shot from the moment it is asked for until a
// moment after it ends. OUT_<nn>.jpg, with a line per shot: STATE nn replay-on rp.t-rp.tc speed. env: P0 P1 RSEED GAP OUT FLAGS VEN
export default async function ({ ev, shot }) {
  const E = process.env, GAP = +(E.GAP || 0.1), OUT = E.OUT || '/tmp/rally-work2/rp/r';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 4)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', demo: true, cam: 'tv', intro: false, firstServer: 0 });
    A.mode = 'match'; const g = A.game, m = g.match; g.running = false; g.audio = null; window.__rp = { g, pt: null };
    const emit = m.emit.bind(m); m.emit = (t, d) => { const r = emit(t, d); if (t === 'point' && d && (d.why === 'winner' || d.why === 'ace')) window.__rp.pt = d; return r; };
    for (let f = 0; f < 60 * 240 && !window.__rp.pt; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    if (!window.__rp.pt) return 'no winner';
    g.pendingReplay = window.__rp.pt; return 'winner by P' + window.__rp.pt.winner + ' ' + window.__rp.pt.why; })()`));
  let started = false, ended = 0;
  for (let k = 0; k < 400; k++) {
    const st = await ev(`(() => { const { g } = window.__rp; for (let f = 0; f < Math.round(${GAP} * 60); f++) { g.running = true; g.frame(1 / 60); g.running = false; }
      const rp = g.replay; return JSON.stringify({ on: !!rp, u: rp ? +(rp.t - rp.tc).toFixed(2) : null, sp: rp ? rp.speed : null, sting: document.querySelector('#wipe').className, pending: !!g.pendingReplay }); })()`);
    const s = JSON.parse(st); if (s.on) started = true; if (started && !s.on) ended++;
    console.log('STATE', String(k).padStart(3, '0'), st);
    await shot(`${OUT}_${String(k).padStart(3, '0')}.jpg`);
    if (ended > 8 || (!started && k > 60)) break;
  }
}
