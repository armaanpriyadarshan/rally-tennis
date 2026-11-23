// How steeply the broadcast camera looks down: a seeded computer match in the camera he plays with (tv), every frame, the angle of
// its view below the horizontal; the frames steeper than LIM degrees with what was going on (phase, cine, replay, the players' z,
// the crane's height), and the steepest. env: VEN SECS RSEED LIM P0 P1
export default async function ({ ev, shot }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 5)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    A.set.format = 'atp3'; A.set.cam = 'tv';
    await A.play({ kind: 'quick' }, ix(${JSON.stringify(E.P0 || 'Nadal')}), ix(${JSON.stringify(E.P1 || 'Djokovic')}), T, null);
    A.loop = () => {}; const g = A.game, m = g.match; g.running = true;
    const AIm = await import('./js/ai.js'); m.ctl[0] = new AIm.AI({ human: true }); g.human = null;
    const V = g.gfx.camera.position.constructor, d = new V(), out = [], hist = {}; let worst = { a: 0 };
    const real = g.gfx.render.bind(g.gfx); g.gfx.render = () => {};
    for (let f = 0; f < 60 * ${+(E.SECS || 240)}; f++) { g.frame(1 / 60); const cam = g.gfx.camera; cam.getWorldDirection(d); const a = Math.asin(-d.y) * 57.3, k = Math.floor(a / 5) * 5; hist[k] = (hist[k] || 0) + 1;
      const ctx = () => 'a ' + a.toFixed(1) + ' t ' + g.time.toFixed(1) + ' ph ' + m.phase + ' cine ' + (g.cine ? g.cine.kind : '-') + ' rep ' + !!g.replay + ' mode ' + g.camMode + ' cam ' + [cam.position.x, cam.position.y, cam.position.z].map(v => v.toFixed(1)) + ' fov ' + cam.fov.toFixed(0) + ' pz ' + (g.replay && g.replay.m ? g.replay.m.players : m.players).map(p => p.z.toFixed(1));
      if (a > worst.a) worst = { a, s: ctx() }; if (a > ${+(E.LIM || 40)} && out.length < 12 && (!out.length || g.time - out[out.length - 1].t > 1)) out.push({ t: g.time, s: ctx() }); }
    g.gfx.render = real;
    return 'pitch histogram (deg: frames) ' + JSON.stringify(hist) + '\\nworst ' + worst.s + '\\n' + out.map(o => o.s).join('\\n'); })()`));
}
