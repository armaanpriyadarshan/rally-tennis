// Where a frame's time goes: a seeded computer match, 20 s of play with the picture drawn, each part of the frame timed (simulation
// steps, the two figures, the arena and crowd, the ball effects, the camera, the render call) and reported for ordinary frames and for
// the slowest tenth. env: P0 P1 RSEED SECS CAM W H
export default async function ({ ev }) {
  const E = process.env;
  console.log('PROF', await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Nadal')}), p1: ix(${JSON.stringify(E.P1 || 'Federer')}), format: 'atp3', demo: true, cam: ${JSON.stringify(E.CAM || 'tv')}, intro: false, firstServer: 0 });
    A.mode = 'match'; const g = A.game; g.running = false; g.audio = null;
    const acc = {}; const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t0 = performance.now(); const r = f(...a); acc[key] = (acc[key] || 0) + performance.now() - t0; return r; }; };
    wrap(g.match, 'step', 'sim'); g.fig.forEach((f, i) => wrap(f, 'update', 'fig' + i)); wrap(g.arena, 'update', 'arena'); wrap(g.fx, 'update', 'fx'); wrap(g, 'updateCamera', 'camera'); wrap(g.gfx, 'render', 'render'); wrap(g, 'markers', 'markers');
    if (g.ui && g.ui.frame) wrap(g.ui, 'frame', 'ui');
    for (let f = 0; f < 120; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    const rows = []; for (let f = 0; f < 60 * ${+(E.SECS || 20)}; f++) { for (const k in acc) acc[k] = 0; const t0 = performance.now(); g.running = true; g.frame(1 / 60); g.running = false; rows.push({ tot: performance.now() - t0, ...acc }); }
    rows.sort((a, b) => a.tot - b.tot); const keys = Object.keys(rows[rows.length - 1]);
    const avg = (rs, k) => +(rs.reduce((s, r) => s + (r[k] || 0), 0) / rs.length).toFixed(2), slow = rows.slice(Math.floor(rows.length * 0.9)), typ = rows.slice(0, Math.floor(rows.length * 0.5));
    const info = g.gfx.renderer.info; return JSON.stringify({ typical: Object.fromEntries(keys.map(k => [k, avg(typ, k)])), slowest10pc: Object.fromEntries(keys.map(k => [k, avg(slow, k)])), worst: +rows[rows.length - 1].tot.toFixed(1), calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures }); })()`));
}
