// per-frame arm segment swing (deg, against the chest frame) inside every tracked fh/bh clip, after strokeClip's processing
const M = await import('/home/armaan/Documents/rally-tennis/pro/js/motion.js');
const { PLAYER_MOTION } = await import('/home/armaan/Documents/rally-tennis/pro/js/playermotion.js'); const { PLAYER_MOTION_ALTS } = await import('/home/armaan/Documents/rally-tennis/pro/js/playeralts.js');
const { J, strokeClip } = M; const MIN = +(process.argv[2] || 30), WHO = process.argv[3] || '';
const P = (a, j) => [a[j * 3], a[j * 3 + 1], a[j * 3 + 2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const frame = a => { const up = nrm(sub(P(a, J.neck), P(a, J.pelvis))); let rt = sub(P(a, J.rsho), P(a, J.lsho)); rt = nrm(sub(rt, up.map(x => x * dot(rt, up)))); return [rt, up, cross(up, rt)]; };
const loc = (v, f) => f.map(e => dot(v, e));
const segs = a => { const f = frame(a), o = {}; for (const s of ['l', 'r']) { o[s + 'u'] = nrm(loc(sub(P(a, J[s + 'elb']), P(a, J[s + 'sho'])), f)); o[s + 'f'] = nrm(loc(sub(P(a, J[s + 'wri']), P(a, J[s + 'elb'])), f)); } return o; };
const ang = (x, y) => Math.acos(Math.max(-1, Math.min(1, dot(x, y)))) * 57.3;
for (const lefty of [false, true]) for (const name of Object.keys(PLAYER_MOTION)) { if (WHO && name !== WHO) continue;
  for (const key of ['fh', 'bh']) {
    const list = [[name, PLAYER_MOTION, name]]; const al = PLAYER_MOTION_ALTS[name] && PLAYER_MOTION_ALTS[name][key];
    if (al) al.forEach((c, i) => list.push([name + '#' + i, { [name + '#' + i]: { [key]: c } }, name + '#' + i]));
    for (const [lab, lib, id] of list) { const c = strokeClip(lib, id, key, lefty); if (!c) continue;
      let prev = null, hits = [];
      for (let f = 0; f < c.n; f++) { const u = c.u0 + f / c.fps, s = segs(c.F[f]);
        if (prev) for (const k in s) { const d = ang(s[k], prev[k]) * c.fps / 60; if (d > MIN && Math.abs(u) > +(process.env.UMIN || 0.06)) hits.push(k + ' ' + d.toFixed(0) + '@' + u.toFixed(3)); }
        prev = s; }
      if (hits.length) console.log(lab, key, lefty ? 'L' : 'R', 'fps', c.fps, 'ok', c.ok, '|', hits.slice(0, 8).join('  '));
    } } }
