// (steps_frametime.mjs) How long the game takes per frame: a seeded computer match, 20 s of play, timed frame by frame with the picture drawn (the GPU's
// time is not seen, only the JavaScript's: simulation, figures, markers and the render call). Prints median, 90th percentile and
// mean ms per frame, and the same for the figures' update alone. env: P0 P1 RSEED SECS
export default async function ({ ev }) {
  const E = process.env;
  console.log('PERF', await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', demo: true, cam: 'tv', intro: false, firstServer: 0 });
    A.mode = 'match'; const g = A.game; g.running = false; g.audio = null;
    const F = g.fig, upd = F.map(f => f.update.bind(f)); let figT = 0; F.forEach((f, i) => { f.update = (...a) => { const t0 = performance.now(); const r = upd[i](...a); figT += performance.now() - t0; return r; }; });
    for (let f = 0; f < 120; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    const ts = [], fs = []; for (let f = 0; f < 60 * ${+(E.SECS || 20)}; f++) { figT = 0; const t0 = performance.now(); g.running = true; g.frame(1 / 60); g.running = false; ts.push(performance.now() - t0); fs.push(figT); }
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return +b[Math.floor(p * (b.length - 1))].toFixed(2); }, mean = a => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2);
    return JSON.stringify({ frame: { p50: q(ts, 0.5), p90: q(ts, 0.9), mean: mean(ts) }, figures: { p50: q(fs, 0.5), p90: q(fs, 0.9), mean: mean(fs) } }); })()`));
}
