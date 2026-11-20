// Reaction lab: dev.html?lab=fh&p=Name, the player standing after a point, each reaction in REACTS forced and filmed at the
// times in US (seconds after the point ended) from VIEWS (front, back, tv). OUT_<react>_<view>_nn.jpg. env: REACTS US VIEWS OUT
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/react/r';
  const RS = (E.REACTS || 'fist,vamos,free,raise,calm,down,strings,hips,hands').split(','), US = (E.US || '0.2,0.4,0.6,0.9,1.3,1.8,2.3').split(',').map(Number), VW = (E.VIEWS || 'front,back').split(',');
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  for (const rc of RS) for (const vw of VW) { let k = 0;
    for (const u of US) {
      await ev(`(() => { const E_PROBE = ${E.PROBE ? 1 : 0}; const L = __lab, fg = L.fig, p = L.p, m = L.m; m.t = 0; m.phaseT = 0; p.x = 0; p.z = 11.9; p.vx = p.vz = 0; p.stroke = null; p.lastStroke = null; fg.inited = false; fg.handInit = false; p.split = -9; fg.lastSplit = -9;
        fg.breath = 1.2; m.phase = 'live'; const dt = 1 / 120; while (m.t < 1.0) { m.t += dt; m.phaseT = m.t; fg.update(dt, p, m); }
        const TCH = ${JSON.stringify(rc)}.startsWith('t:') ? ${JSON.stringify(rc)}.slice(2) : null; m.phase = TCH === 'rspin' ? 'ready' : 'over'; m.phaseT = 0; m.score.server = 1; p.mood = ${JSON.stringify(rc)}.match(/^(down|strings|hips|hands)$/) ? -1 : 1; p.moodT = m.t; fg.reactFor = p.moodT; fg.react = TCH ? null : ${JSON.stringify(rc)}; if (TCH) { fg.touchFor = p.moodT; fg.rdyFor = p.moodT; fg.touch = TCH === 'rspin' ? null : TCH; fg.touchT = m.t + 0.35; fg.rdySpinT = TCH === 'rspin' ? m.t + 0.2 : null; }
        const t1 = m.t + ${u}; while (m.t < t1 - 1e-6) { m.t += dt; m.phaseT += dt; fg.update(dt, p, m); if (!TCH) fg.react = ${JSON.stringify(rc)}; }
        if (E_PROBE) { fg.group.updateMatrixWorld(true); const B = fg.person.bones, o = {}; for (const k of Object.keys(B)) if (/Head$|L_Hand$|L_Forearm$|L_UpperArm$|Neck$|Spine2$|L_Finger1$|L_Finger11$|L_Finger12$|LEye$|REye$/.test(k)) { const v = B[k].getWorldPosition(new B[k].position.constructor()); fg.group.worldToLocal(v); o[k.replace('Bip01_', '')] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; } console.log('PROBE ' + ${u} + ' ' + JSON.stringify(o)); }
        L.shoot(${JSON.stringify(vw)}); return 1; })()`);
      await shot(`${OUT}_${rc}_${vw}_${String(k).padStart(2, '0')}.jpg`); k++; } }
  console.log('done');
}
