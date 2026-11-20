// Pose lab: the off arm through a stroke, stage by stage (the clip's wrist, the target, the hand, the wrist after the
// body push, the elbow), in the chest's frame, plus a picture per instant. env: P KIND WING US VIEW OUT ARM(off|hit)
export default async function ({ ev, shot }) {
  const US = (process.env.US || '-0.7,-0.6,-0.5,-0.4,-0.3,-0.2,-0.1,0').split(',').map(Number), OUT = process.env.OUT || '/tmp/rally-work2/lab';
  for (const u of US) {
    const r = await ev(`(() => { const L = window.__lab, f = L.fig; f.dbgOn = true; L.go(${u}); const d = f.dbg; if (!d) return 'no dbg';
      const hit = f.hs > 0 ? 1 : 0, i = ${JSON.stringify(process.env.ARM || 'off')} === 'off' ? 1 - hit : hit, sh = d.sh[i], V = sh.constructor;
      const P = f.person, nk = new V(), pel = new V(), ls = new V(), rs = new V(), hd = new V(); P.jointPos('Neck', nk); P.jointPos('Pelvis', pel); P.jointPos('L_UpperArm', ls); P.jointPos('R_UpperArm', rs); P.jointPos('Head', hd);
      const up = nk.clone().sub(pel).normalize(), rt = rs.clone().sub(ls); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt);
      const loc = w => { const v = w.clone().sub(sh); return [v.dot(rt) * f.hs, v.dot(up), v.dot(fw)].map(x => +x.toFixed(2)); };
      return { u: ${u}, freeOff: +d.freeOff.toFixed(2), armW: +d.armW.toFixed(2), clipWr: loc(d.cWr[i]), clipEl: loc(d.cEl[i]), tgt: loc(d.tgt1[i]), tgtFinal: loc(d.tgt2[i]), hand: loc(d.hand[i]), wristSolved: loc(d.wr3[i]), elbow: loc(d.el[i]), head: loc(hd) }; })()`);
    console.log(JSON.stringify(r));
    if (process.env.SHOTS !== '0') await shot(`${OUT}_${String(Math.round((u + 1) * 100)).padStart(3, '0')}.jpg`);
  }
}
