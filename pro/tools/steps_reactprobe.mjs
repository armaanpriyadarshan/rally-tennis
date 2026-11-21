// Reaction lab, numbers: dev.html?lab=fh&p=Name, the player standing after a point with reaction REACT forced; every 1/30 s
// from the point's end to 2 s, both hands' targets (the pose's, after blending) and where the hands are drawn (wrist bones),
// in the body's frame (x out to his right, y up, z toward the net). env: REACT, FLAGS (a,b=1 → globalThis.__a ...)
export default async function ({ ev }) {
  const E = process.env, rc = E.REACT || 'fist';
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  const r = await ev(`(() => { Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const L = __lab, fg = L.fig, p = L.p, m = L.m; m.t = 0; m.phaseT = 0; p.x = 0; p.z = 11.9; p.vx = p.vz = 0; p.stroke = null; p.lastStroke = null; fg.inited = false; fg.handInit = false; p.split = -9; fg.lastSplit = -9; fg.dbgOn = true;
    fg.breath = 1.2; m.phase = 'live'; const dt = 1 / 120; while (m.t < 1.0) { m.t += dt; m.phaseT = m.t; fg.update(dt, p, m); }
    m.phase = 'over'; m.phaseT = 0; m.score.server = 1; p.mood = ${JSON.stringify(rc)}.match(/^(down|strings|hips|hands)$/) ? -1 : 1; p.moodT = m.t; fg.reactFor = p.moodT; fg.react = ${JSON.stringify(rc)};
    const out = [], B = fg.person.bones, V = B['Bip01_Pelvis'].position.constructor; let nx = 0;
    while (m.phaseT < 2.0) { m.t += dt; m.phaseT += dt; fg.update(dt, p, m); fg.react = ${JSON.stringify(rc)};
      if (m.phaseT >= nx) { nx += 1 / 30; fg.group.updateMatrixWorld(true); const w = n => { const v = B['Bip01_' + n].getWorldPosition(new V()); return [+(v.x - p.x).toFixed(2), +v.y.toFixed(2), +(p.z - v.z).toFixed(2)]; };
        const ko = fg._keyOff; out.push([+m.phaseT.toFixed(2), +(fg.reactK || 0).toFixed(2), 'key', ko ? [+(ko.x - p.x).toFixed(2), +ko.y.toFixed(2), +(ko.z - p.z).toFixed(2)] : null, 'tgt', fg.dbgTgt, 'hand', w('L_Hand'), w('R_Hand'), 'elb', w('L_Forearm'), w('R_Forearm'), 'sh', w('L_UpperArm')[1], w('R_UpperArm')[1]]); } }
    return JSON.stringify(out); })()`);
  for (const row of JSON.parse(r)) console.log(JSON.stringify(row));
}
