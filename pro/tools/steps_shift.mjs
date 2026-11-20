// How far the game has to move each player's swing at contact to put the strings on the ball (x to his right, y up,
// z forward, m), by player and wing: a big, steady gap means his clip meets the ball somewhere the game never puts it.
export default async function ({ ev }) {
  const pairs = (process.env.PAIRS || 'Federer:Nadal,Djokovic:Sinner,Alcaraz:Agassi').split(',');
  for (const pr of pairs) { const [a, b] = pr.split(':');
    const r = await ev(`(async () => {
      const A = window.__app, D = await import('./js/data.js');
      const T = D.TOURNAMENTS.find(t => !t.indoor && t.surface === 'hard') || D.TOURNAMENTS[0];
      const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
      A.mode = 'match'; await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(a)}), p1: ix(${JSON.stringify(b)}), demo: true, cam: 'tv', pace: 1, format: 'atp3' });
      const g = A.game; g.running = false; g.gfx.render = () => {}; g.fig[0].dbgOn = g.fig[1].dbgOn = true;
      const out = {}; let last = [null, null];
      for (let f = 0; f < ${+(process.env.SECS || 90)} * 60; f++) { g.running = true; g.frame(1 / 60); g.running = false;
        for (let i = 0; i < 2; i++) { const d = g.fig[i].dbg; if (d && d.shift && d.shift !== last[i]) { last[i] = d.shift; const s = d.shift; const k = g.match.players[i].prof.name + ' ' + s.wing + (s.clip ? '' : ' (keys)'); (out[k] || (out[k] = [])).push([s.x, s.y, s.z]); } } }
      return Object.entries(out).map(([k, a]) => { const m = j => a.reduce((s, r) => s + r[j], 0) / a.length, L = a.map(r => Math.hypot(...r)).sort((x, y) => x - y);
        return k.padEnd(22) + ' n ' + String(a.length).padStart(3) + '  mean shift x ' + m(0).toFixed(2) + ' y ' + m(1).toFixed(2) + ' z ' + m(2).toFixed(2) + '  |shift| median ' + L[L.length >> 1].toFixed(2) + ' p90 ' + L[Math.floor(L.length * 0.9)].toFixed(2); }).join('\\n');
    })()`);
    console.log(r);
  }
}
