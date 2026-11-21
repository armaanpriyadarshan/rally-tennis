// Drop shots called by the player: a match with the human's swing pressed on time and ↓ held only from that moment (DOWN=late)
// or from the ball's coming (DOWN=early); for each of his shots, the kind played and the kind the figure showed at contact.
// env: P0 P1 RSEED SECS DOWN FLAGS
export default async function ({ ev }) {
  const E = process.env;
  const r = await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'), S = await import('./js/sim.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Alcaraz')}), p1: ix(${JSON.stringify(E.P1 || 'Sinner')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 1 });
    A.mode = 'match'; A.input.enabled = true; A.input.locked = true; const g = A.game, m = g.match; g.running = false; g.audio = null;
    const inp = A.input, late = ${JSON.stringify(E.DOWN || 'late')} === 'late', out = []; let inc = null, pressed = false, srvAt = 0, tossed = false, watch = null;
    for (let f = 0; f < 60 * ${+(E.SECS || 120)}; f++) {
      const p = m.players[0], H = g.human;
      if (m.phase === 'live') { if (m.incoming && m.incoming !== inc && m.ball.lastHit !== 0) { inc = m.incoming; pressed = false; inp.keys.clear(); if (!late) inp.keys.add('ArrowDown'); }
        if (!pressed && H && H.tau != null && H.tau <= 0.1) { inp.keys.clear(); inp.keys.add('ArrowDown'); inp.pressed.add('Space'); pressed = true; } }
      else { inp.keys.clear(); if (m.phase === 'ready' && m.score.server === 0 && m.phaseT > 0.9) inp.pressed.add('Space'); if (m.phase === 'toss' && m.score.server === 0 && m.ball.held < 0 && !tossed) { tossed = true; srvAt = m.tossIdeal - S.TIMING.serveSwing; } if (srvAt && m.t >= srvAt) { inp.pressed.add('Space'); srvAt = 0; } if (m.phase !== 'toss') tossed = false; }
      g.running = true; g.frame(1 / 60); g.running = false;
      const st = p.stroke; if (st && st.tc != null && st.kind !== 'serve' && !st.__logged && m.t >= st.tc) { st.__logged = true; out.push(st.kind + '/' + (st.__dk || '-')); }
    }
    const tally = {}; for (const o of out) tally[o] = (tally[o] || 0) + 1; return JSON.stringify(tally); })()`);
  console.log('KINDS played/shown', r);
}
