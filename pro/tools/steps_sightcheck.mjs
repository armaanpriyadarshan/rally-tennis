// The broadcast camera's sight lines asked both ways, the stadium index (sight.js) against three.js's raycaster, in every venue, both
// ends: from each crane height to the middle of the court and to the near player at a spread of places, deep and close. Any line the
// two answer differently is listed; the time each takes is summed. env: VENUES (comma keys; default all) PTS
export default async function ({ ev }) {
  const E = process.env;
  const keys = JSON.parse(await ev(`(async () => { const D = await import('./js/data.js'); return JSON.stringify(D.TOURNAMENTS.map(t => t.key)); })()`));
  const list = E.VENUES ? E.VENUES.split(',') : keys; let all = 0, bad = 0, tOld = 0, tNew = 0;
  for (const key of list) for (const weather of (E.WEATHERS || 'clear').split(',')) {
    const r = JSON.parse(await ev(`(async () => {
      const A = window.__app, D = await import('./js/data.js'), THREE = await import('three'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(key)});
      const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
      await A.game.start({ T, weather: ${JSON.stringify(weather)}, p0: ix('Nadal'), p1: ix('Federer'), format: 'atp3', demo: true, cam: 'tv', intro: false, firstServer: 0 });
      const g = A.game, rc = new THREE.Raycaster(); g.running = false; for (let f = 0; f < 30; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
      const t0 = performance.now(); const sg = g.sightGrid(); const build = performance.now() - t0;
      const near = [[0, 12.4], [2.5, 13.5], [-3.5, 15], [5, 17], [-6, 18.5], [1, 9], [4.2, 11.9], [-2, 16.2]];
      const out = { key: ${JSON.stringify(key)}, n: 0, bad: [], tOld: 0, tNew: 0, build: +build.toFixed(0) };
      for (const flip of [1, -1]) { g.gfx.setFlip(flip); g.arena.root.updateMatrixWorld(true);
        for (const sgn of [1, -1]) for (const [nx, nz0] of near) { const nz = nz0 * sgn;
          const pts = [[0.5, 0, 0.4], [1.0, 0, 0], [0.5, 0, -11.885], [0.3, 0, 11.885], [0.06, nx, nz], [0.45, nx, nz], [0.95, nx, nz]].map(([y, x, z]) => new THREE.Vector3(x, y, z));
          for (const h of [9.6, 10.8, 12, 13.2, 14.4, 15.6]) { const o = new THREE.Vector3(0, h, 30 * sgn);
            for (const q of pts) { const d = q.clone().sub(o), L = d.length(); d.normalize();
              let t = performance.now(); rc.set(o, d); rc.far = L - 0.35; const a = !!rc.intersectObject(g.arena.root, true).find(x => x.object.visible && !x.object.isPoints); out.tOld += performance.now() - t;
              t = performance.now(); const b = sg.blocked(o, d, L - 0.35); out.tNew += performance.now() - t; out.n++;
              if (a !== b) out.bad.push([flip, sgn, h, q.x, q.y, q.z, a, b]); } } } }
      g.gfx.setFlip(1); out.tOld = +out.tOld.toFixed(0); out.tNew = +out.tNew.toFixed(1); return JSON.stringify(out); })()`));
    all += r.n; bad += r.bad.length; tOld += r.tOld; tNew += r.tNew;
    console.log('VENUE', key, weather, 'lines', r.n, 'differ', r.bad.length, 'raycaster ms', r.tOld, 'index ms', r.tNew, 'build ms', r.build, r.bad.length ? JSON.stringify(r.bad.slice(0, 4)) : '');
  }
  console.log('TOTAL lines', all, 'differ', bad, 'raycaster ms', tOld, 'index ms', tNew.toFixed(1));
}
