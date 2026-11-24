// Rally Pro — what makes each Grand Slam centre court itself, beyond the generic bowl that
// arena.js builds from a spec: the roof steel you see from the seats, the boxes and end stands,
// the scoreboards and where they hang. Looked at against photographs of the real courts (see the
// project notes); signage is the venue's own words only.
//
// Everything is plain meshes on a few shared materials, so the arena's merge pass turns each
// venue's additions into a handful of draw calls. Nothing here casts a shadow: the sun's shade
// inside the bowl is computed from the roof opening (see sunMask in arena.js).
import * as THREE from 'three';
import * as TX from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function kit(A, lit) {
  const g = new THREE.Group(); g.name = 'landmarks'; A.root.add(g);
  const cache = new Map();
  const key = o => Object.keys(o).sort().map(k => { const v = o[k]; return k + ':' + (v && v.isTexture ? v.uuid : v && v.isColor ? v.getHexString() : v); }).join(',');
  const mat = (color, o = {}) => { const k = color + '|' + key(o); if (!cache.has(k)) cache.set(k, lit(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }))); return cache.get(k); };
  const add = (geo, m, x = 0, y = 0, z = 0, ry = 0, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0, 'YXZ'); g.add(o); return o; };
  const box = (m, w, h, d, x, y, z, ry = 0, rx = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, ry, rx);
  // a straight member from a to b, w across and h deep; its width stays level wherever it can
  const beam = (m, a, b, w, h = w) => {
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length(); if (len < 1e-3) return null;
    dir.normalize();
    const xa = new THREE.Vector3().crossVectors(UP, dir); if (xa.lengthSq() < 1e-6) xa.set(1, 0, 0); xa.normalize();
    const ya = new THREE.Vector3().crossVectors(dir, xa);
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), m);
    o.position.addVectors(a, b).multiplyScalar(0.5); o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, ya, dir));
    g.add(o); return o;
  };
  // a Warren truss: straight bottom chord a→b, top chord through top(t), n panels of alternating diagonals
  const truss = (m, a, b, top, n, w, wd = w * 0.65, posts = false) => {
    const bot = t => a.clone().lerp(b, t);
    let pb = bot(0), pt = top(0);
    beam(m, pb, pt, wd);
    for (let i = 1; i <= n; i++) {
      const t = i / n, nb = bot(t), nt = top(t);
      beam(m, pb, nb, w); beam(m, pt, nt, w);
      if (i % 2) beam(m, pb, nt, wd); else beam(m, pt, nb, wd);
      if (posts) beam(m, nb, nt, wd * 0.8);
      pb = nb; pt = nt;
    }
    beam(m, pb, pt, wd);
  };
  // quads [p0, p1, p2, p3], wound counter-clockwise seen from the side that faces you
  const quads = (m, list) => {
    const pos = [], idx = [];
    for (const q of list) { const k = pos.length / 3; for (const p of q) pos.push(p.x, p.y, p.z); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return add(geo, m);
  };
  // the height of the seating at `dd` metres out from the court wall (with the lower tier's extra
  // height behind the baselines when `end`)
  const T = A.tierInfo;
  const standY = (dd, end) => {
    let y = T[0].y0;
    for (const t of T) {
      if (dd < t.d0) return t.walkY;
      if (dd <= t.d1) { const f = (dd - t.d0) / Math.max(1e-3, t.d1 - t.d0); return t.y0 + (t.y1 - t.y0) * f + (end ? t.endLift * (1 - f) : 0); }
      y = t.y1;
    }
    return y;
  };
  // the points where a ring turns (the corners of a chamfered or rounded outline)
  const turns = R => R.filter((p, i) => { const a = R[(i + R.length - 1) % R.length], b = R[(i + 1) % R.length];
    const ux = p.x - a.x, uz = p.z - a.z, vx = b.x - p.x, vz = b.z - p.z; return Math.abs(ux * vz - uz * vx) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) + 1e-9) > 0.02; });
  return { g, mat, add, box, beam, truss, quads, standY, turns, ring: A.kit.ring, band: A.kit.band, atArc: A.kit.atArc };
}

// a sheet of small flags for flagpoles: national colours, nothing else
function flagSheet() {
  const c = TX.canvas(512, 64), g = c.getContext('2d'), W = 64;
  const F = [
    ['v', '#0b3d91', '#f4f4f4', '#d52b1e'], ['v', '#009246', '#f4f4f4', '#ce2b37'], ['h', '#111111', '#dd0000', '#ffce00'], ['h', '#c60b1e', '#ffc400', '#c60b1e'],
    ['h', '#f4f4f4', '#0039a6', '#d52b1e'], ['v', '#002395', '#ffd100', '#ef3340'], ['h', '#ae1c28', '#f4f4f4', '#21468b'], ['h', '#f4f4f4', '#d52b1e', '#f4f4f4'],
  ];
  F.forEach((f, i) => { for (let k = 0; k < 3; k++) { g.fillStyle = f[k + 1]; if (f[0] === 'v') g.fillRect(i * W + k * W / 3, 0, W / 3 + 1, 64); else g.fillRect(i * W, k * 64 / 3, W, 64 / 3 + 1); } });
  return TX.tex(c, { clamp: true });
}
function flag(K, m, x, y, z, slot, w = 1.5, h = 1.0, ry = 0) {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (slot + uv.getX(i)) / 8);
  return K.add(geo, m, x, y, z, ry);
}

// ---------------------------------------------------------------------------------------------
// Wimbledon, Centre Court: a deep fixed roof all the way round with a pale grey-green fascia, and
// the retractable roof's white arched trusses parked in two bundles over the ends with their
// folded fabric; the Royal Box behind one baseline; black scoreboards in two opposite corners at
// the top of the wall; the rolled court cover lying along a side wall; almost no advertising.
function wim(A, spec, K) {
  const { hx, hz, F } = A, R = spec.roof, open = A.open;
  const white = K.mat('#eef1ef', { roughness: 0.45, metalness: 0.25 }), fabric = K.mat('#b7bbb8', { roughness: 0.85, side: THREE.DoubleSide });
  const lipD = R.flare || 0, yLip = A.roofY + (R.thick || 1.6), outZ = hz + A.outerD + (R.over || 2.5), capY = z => yLip + (R.cap || 0) * THREE.MathUtils.clamp((z - open.hz - lipD) / (outZ - open.hz - lipD), 0, 1);
  const W = hx + A.outerD - 1, n = 5, gap = 2.4;
  for (const s of [-1, 1]) {
    const zs = [];
    for (let i = 0; i < n; i++) zs.push(open.hz + lipD + 2.2 + i * gap);
    for (const z of zs) {
      const yb = capY(z) + 1.3, D = 3.6, rise = 2.8;
      truss(white, z * s, yb, W, D, rise, K);
    }
    // the fabric folded between them, hanging in a vee under each bay
    const q = [];
    for (let i = 0; i < n - 1; i++) {
      const z0 = zs[i] * s, z1 = zs[i + 1] * s, zm = (z0 + z1) / 2, y0 = capY(zs[i]) + 1.35, y1 = capY(zs[i + 1]) + 1.35, ym = Math.min(y0, y1) - 0.9, X = W * 0.96;
      q.push([v3(-X, y0, z0), v3(X, y0, z0), v3(X, ym, zm), v3(-X, ym, zm)], [v3(-X, ym, zm), v3(X, ym, zm), v3(X, y1, z1), v3(-X, y1, z1)]);
    }
    K.quads(fabric, q);
  }
  function truss(m, z, yb, W, D, rise, K) {
    K.truss(m, v3(-W, yb, z), v3(W, yb, z), t => v3(-W + 2 * W * t, yb + D * Math.min(1, Math.sin(Math.PI * t) * 3) + rise * Math.sin(Math.PI * t), z), 18, 0.42, 0.28);
  }

  // the Royal Box: behind the baseline at the far end, framed by dark green walls, wicker chairs
  {
    const s = -1, x0 = 4.9, d0 = 1.3, d1 = 7.0, green = K.mat('#17302a', { roughness: 0.55 }), cream = K.mat('#e6dfc8', { roughness: 0.5 }), wicker = K.mat('#a88a5a', { roughness: 0.8 });
    const yF = K.standY(d0, true), yB = K.standY(d1, true);
    K.box(green, x0 * 2 + 0.3, 1.05, 0.22, 0, yF + 0.5, s * (hz + d0 - 0.15));
    K.box(cream, x0 * 2 + 0.36, 0.07, 0.3, 0, yF + 1.05, s * (hz + d0 - 0.15));
    for (const k of [-1, 1]) {
      K.beam(green, v3(k * x0, yF + 0.6, s * (hz + d0 - 0.1)), v3(k * x0, yB + 0.6, s * (hz + d1)), 0.22, 1.2);
      K.beam(cream, v3(k * x0, yF + 1.22, s * (hz + d0 - 0.1)), v3(k * x0, yB + 1.22, s * (hz + d1)), 0.28, 0.06);
    }
    // a dark green awning over the back of the box
    K.beam(green, v3(0, yB + 3.0, s * (hz + d1 - 2.6)), v3(0, yB + 3.7, s * (hz + d1 + 0.2)), x0 * 2 + 0.4, 0.08);
    for (const k of [-1, 1]) K.box(green, 0.12, 3.0, 0.12, k * x0, yB + 1.5, s * (hz + d1 - 2.5));
    for (const row of A.rows) {
      if (row.tier !== 0 || row.d < d0 + 0.2 || row.d > d1 - 0.1) continue;
      const y = row.y + (A.tierInfo[0].endLift || 0) * (1 - row.f);
      for (let x = -x0 + 0.45; x < x0 - 0.3; x += 0.56) K.box(wicker, 0.46, 0.46, 0.07, x, y + 0.66, s * (hz + row.d + 0.17));
    }
  }

  // scoreboards: black, at the top of the wall in two opposite corners, turned to the court
  const corner = (sx, sz, dd) => { const R2 = F.rc + dd, a = Math.PI / 4; return { x: sx * (F.hx - F.rc + R2 * Math.cos(a)), z: sz * (F.hz - F.rc + R2 * Math.sin(a)) }; };
  A.screens = [[-1, -1], [1, 1]].map(([sx, sz]) => { const p = corner(sx, sz, 0.8); return { x: p.x, y: (spec.wallBackH || 2.5) + 0.7, z: p.z, ry: Math.atan2(-p.x, -p.z), w: 4.4 }; });

  // the court cover, rolled and lying along one side wall
  {
    const r = 0.36, len = 2 * (hz - F.rc) - 3, geo = new THREE.CylinderGeometry(r, r, len, 14, 1, false, Math.PI / 2, Math.PI);
    K.add(geo, K.mat('#2e7a72', { roughness: 0.7 }), hx - r - 0.03, 0, 0, 0, Math.PI / 2);
  }
}

// ---------------------------------------------------------------------------------------------
// Arthur Ashe: the white steel of the roof — deep Warren trusses round the octagonal opening and a
// second ring further out, a lattice under a pale membrane — floating above a band of sky over
// the top row; the dark duct that runs round under it; video boards hanging under the roof at
// each end; navy sign bands on the suite levels.
function us(A, spec, K) {
  const R = spec.roof, y = A.roofY, F = A.F, open = A.open;
  const white = K.mat('#f2f4f3', { roughness: 0.45, metalness: 0.2 });
  const oF = { hx: R.openX, hz: R.openZ, rc: R.openR == null ? 3 : R.openR, nx: F.nx, nz: F.nz, nc: F.nc };
  const edge = (pts, D, w, dy = 0) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(len / (D * 0.9)));
      const A0 = v3(a.x, y - D + dy, a.z), B0 = v3(b.x, y - D + dy, b.z);
      K.truss(white, A0, B0, t => v3(a.x + (b.x - a.x) * t, y - 0.3 + dy, a.z + (b.z - a.z) * t), n, 0.55, 0.38);
    }
  };
  edge(K.turns(K.ring(oF, 0, y)), 6.5, 0.6);                         // the big trusses round the opening
  edge(K.turns(K.ring(oF, 13, y)), 3.6, 0.45);                       // the second ring
  // the lattice: rings of lighter members between the radial ones
  for (const dd of [4.5, 9, 17]) {
    const P = K.turns(K.ring(oF, dd, y - 0.45));
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; K.beam(white, v3(a.x, a.y, a.z), v3(b.x, b.y, b.z), 0.3, 0.5); }
  }
  // the duct round under the roof, just inside the rim
  {
    const dk = K.mat('#3b3f44', { roughness: 0.55, metalness: 0.3 }), d = A.outerD - 2.2, y0 = A.rimTop + 2.4;
    const r0 = K.ring(F, d, y0), r1 = K.ring(F, d, y0 + 1.3), r2 = K.ring(F, d + 1.2, y0);
    K.add(K.band(r0, r1, 1, 1), dk); K.add(K.band(r0, r2, 1, 1, true), dk);
  }
  // video boards hanging under the roof over each end
  A.screens = [-1, 1].map(s => ({ x: 0, y: y - 10.2, z: s * (open.hz + 2.5), ry: s > 0 ? Math.PI : 0, tilt: 0.1, w: 14 }));
  const cable = K.mat('#2a2d31', { roughness: 0.5, metalness: 0.5 });
  for (const S of A.screens) for (const k of [-1, 1]) K.beam(cable, v3(S.x + k * S.w * 0.4, S.y + 2.4, S.z), v3(S.x + k * S.w * 0.4, y - 0.5, S.z), 0.08);
  // navy sign bands across the front of each suite level, with the partners' names and the stadium's
  const T = A.tierInfo.find(t => t.suites);
  if (T) {
    const each = T.lift / T.suites;
    const c = TX.canvas(2048, 64), g = c.getContext('2d'); g.fillStyle = '#0f2050'; g.fillRect(0, 0, 2048, 64);
    g.fillStyle = '#ffffff'; g.font = '700 34px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = ['ARTHUR ASHE STADIUM', 'AMERICAN EXPRESS', 'NEW YORK', 'Emirates', 'IBM', 'USOPEN.ORG'];   // (the suites' fascias as they read: venues.js BRANDS)
    words.forEach((w, i) => g.fillText(w, (i + 0.5) * 2048 / words.length, 34));
    const t = TX.tex(c, { aniso: 8 }); t.wrapS = THREE.RepeatWrapping;
    const m = K.mat('#ffffff', { map: t, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: A.night ? 0.55 : 0.12 });
    for (let k = 0; k < T.suites; k++) {
      const y0 = T.walkY + each * k + 0.12, y1 = y0 + each * 0.36 * 0.62;
      K.add(K.band(K.ring(F, T.frontD - 0.03, y0), K.ring(F, T.frontD - 0.03, y1), 25, 1), m);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Philippe-Chatrier: behind one baseline there are no upper stands but a dark glass block of boxes
// and press seats, two storeys, with the video board in it and a row of flags on its roof; the
// pale concrete partitions of the boxes in the lower stands; white flowers along the side walls;
// the cream ribbed underside of the roof ring over the sides and the other end.
function rg(A, spec, K) {
  const { hx, hz, F } = A, T = A.tierInfo, sx = F.hx - F.rc, s = -1;
  const t1 = T[1], zF = hz + t1.frontD, zB = hz + A.outerD + 0.6, y0 = t1.walkY;
  const roofCut = A.roofY ? A.roofY - 1.6 : 1e9;
  A.cut = (x, y, z) => z < -(zF - 0.05) && (Math.abs(x) < sx - 0.02 || y > roofCut);
  const conc = K.mat('#d6d0c2', { roughness: 0.85, side: THREE.DoubleSide }), glass = K.mat('#0e1216', { roughness: 0.28, metalness: 0.3, emissive: new THREE.Color(A.night ? '#4a3c28' : '#000000'), emissiveIntensity: A.night ? 0.5 : 0 });
  const mull = K.mat('#2a2d31', { roughness: 0.5, metalness: 0.4 });
  const L = 4.2, slab = 0.5, top = y0 + 2 * L + 2 * slab;
  // two storeys of glass set back behind the slab edges, mullions every metre and a half
  for (let k = 0; k < 2; k++) {
    const yb = y0 + k * (L + slab);
    K.box(glass, sx * 2, L, 0.1, 0, yb + L / 2, s * (zF + 0.7));
    K.box(conc, sx * 2 + 0.1, slab, 1.2, 0, yb + L + slab / 2, s * (zF + 0.15));
    for (let x = -sx + 1.5; x < sx - 0.5; x += 1.5) K.box(mull, 0.1, L, 0.14, x, yb + L / 2, s * (zF + 0.66));
    // the balcony rail along the front of each storey
    K.box(mull, sx * 2, 0.05, 0.05, 0, yb + 1.05, s * (zF + 0.2));
    K.box(K.mat('#9fa5a6', { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 }), sx * 2, 1.0, 0.03, 0, yb + 0.55, s * (zF + 0.2));
  }
  // its roof, deep behind, and side walls following the corner stands up to the rim
  K.box(conc, sx * 2 + 0.3, 0.6, zB - zF, 0, top + 0.3, s * (zF + zB) / 2);
  K.box(conc, sx * 2 + 0.3, 1.1, 0.25, 0, top + 1.1, s * (zF - 0.1));
  for (const k of [-1, 1]) {
    const q = [];
    for (let d = t1.frontD; d < A.outerD - 0.01; d += 1) {
      const d2 = Math.min(A.outerD, d + 1), ya = Math.max(top + 0.6, K.standY(d) + 1.2), yb = Math.max(top + 0.6, K.standY(d2) + 1.2), za = s * (hz + d), zb = s * (hz + d2);
      const p = [v3(k * sx, y0, za), v3(k * sx, y0, zb), v3(k * sx, yb, zb), v3(k * sx, ya, za)];
      q.push(k * s > 0 ? p : p.reverse());
    }
    K.quads(conc, q);
  }
  // flags along the roof's front edge
  const fm = K.mat('#ffffff', { map: flagSheet(), roughness: 0.8, side: THREE.DoubleSide });
  const pole = K.mat('#d8dadb', { roughness: 0.4, metalness: 0.6 }), nF = 11;
  for (let i = 0; i < nF; i++) {
    const x = -sx + 0.8 + (2 * sx - 1.6) * i / (nF - 1), z = s * (zF + 0.6), h = 7.5;
    K.box(pole, 0.09, h, 0.09, x, top + 0.6 + h / 2, z);
    flag(K, fm, x + 0.78, top + 0.6 + h - 0.55, z, i % 8, 1.5, 1.0);
  }
  // the video board in the upper storey, left of centre
  A.screens = [{ x: -sx * 0.38, y: y0 + L + slab + 1.75, z: s * (zF - 0.05), ry: 0, w: 7.6 },
    { x: 0, y: A.rimTop - 1.2, z: -s * (hz + A.outerD - 0.3), ry: Math.PI, w: 10 }];

  // the boxes in the lower stands: low concrete walls across the rows every few seats
  {
    const ai = A.aisles, part = conc;
    for (let ti = 0; ti < 2; ti++) {
      const t = T[ti];
      for (let k = 0; k < ai.n; k++) for (const j of [0, 1, 2]) {
        const s0 = (k + j / 3) * ai.L, pF = K.atArc(t.d0 + 0.15, s0), pB = K.atArc(t.d1 - 0.1, s0);
        if (Math.abs(pF.nx) < 0.99 && Math.abs(pF.nz) < 0.99) continue;            // straight stands only
        const end = Math.abs(pF.nz) > 0.99;
        if (A.cut(pF.x, t.y0, pF.z) || A.cut(pB.x, t.y1, pB.z)) continue;
        const yF = K.standY(t.d0 + 0.15, end), yB = K.standY(t.d1 - 0.1, end);
        K.beam(part, v3(pF.x, yF + 0.42, pF.z), v3(pB.x, yB + 0.42, pB.z), 0.14, 0.85);
      }
    }
  }
  // white flowers in planters along the top of the side walls
  {
    const green = K.mat('#22402f', { roughness: 0.8 }), bloom = K.mat('#f3f1ea', { roughness: 0.9 }), wallH = spec.wallH || 1.1, sz = F.hz - F.rc - 0.8;
    for (const k of [-1, 1]) {
      K.box(green, 0.42, 0.26, sz * 2, k * (hx + 0.24), wallH + 0.13, 0);
      for (let z = -sz + 0.25; z < sz; z += 0.5) K.box(bloom, 0.36, 0.2, 0.42, k * (hx + 0.24), wallH + 0.33, z, z * 1.7);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Rod Laver Arena: a round bowl under a dark roof whose two panels park over the ends, each carried
// on white arched trusses that stand up over the roof line; floodlight banks all along the inner
// edge of the fascia; video boards hanging from the fascia over the long sides.
function ao(A, spec, K) {
  const R = spec.roof, F = A.F, open = A.open, y = A.roofY, yTop = y + (R.thick || 1.6) + (R.cap || 0) * 0.5;
  const white = K.mat('#f6f5ee', { roughness: 0.45, metalness: 0.2 });
  const outX = A.hx + A.outerD;
  for (const s of [-1, 1]) for (const zz of [open.hz + 4.5, open.hz + 12]) {
    const z = s * zz, W = Math.min(outX - 2, Math.sqrt(Math.max(0, (F.rc + A.outerD) ** 2 - Math.max(0, zz - (F.hz - F.rc)) ** 2)) + F.hx - F.rc - 2), rise = 7.5;
    K.truss(white, v3(-W, yTop, z), v3(W, yTop, z), t => v3(-W + 2 * W * t, yTop + rise * Math.sin(Math.PI * t), z), 16, 0.42, 0.26, true);
    // the arch is a pair: a second chord a little behind, tied to the first
    K.beam(white, v3(-W, yTop, z + s * 1.2), v3(W, yTop, z + s * 1.2), 0.3);
  }
  // floodlight banks along the fascia's inner edge
  {
    const fx = K.mat('#d3d6da', { roughness: 0.35, metalness: 0.4 }), back = K.mat('#22272e', { roughness: 0.6 });
    const oF = { hx: R.openX, hz: R.openZ, rc: R.openR == null ? 3 : R.openR, nx: F.nx, nz: F.nz, nc: F.nc };
    const P = K.ring(oF, 0.6, y - 0.55);
    let next = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; if (p.s < next) continue; next = p.s + 2.6;
      const ry = Math.atan2(-p.nx, -p.nz);
      K.box(back, 2.2, 0.6, 0.5, p.x, p.y, p.z, ry);
      K.box(fx, 0.62, 0.5, 0.06, p.x + p.nz * 0.55 - p.nx * 0.27, p.y, p.z - p.nx * 0.55 - p.nz * 0.27, ry, 0.35);
      K.box(fx, 0.62, 0.5, 0.06, p.x - p.nz * 0.55 - p.nx * 0.27, p.y, p.z + p.nx * 0.55 - p.nz * 0.27, ry, 0.35);
    }
  }
  // video boards hanging over the middle of each long side
  A.screens = [-1, 1].map(s => ({ x: s * (open.hx - 2.4), y: y - 2.6, z: 0, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2, tilt: 0.16, w: 8 }));
  const cable = K.mat('#15181c', { roughness: 0.5, metalness: 0.5 });
  for (const S of A.screens) for (const k of [-1, 1]) K.beam(cable, v3(S.x, S.y + 1.4, k * S.w * 0.4), v3(S.x, y - 0.2, k * S.w * 0.4), 0.07);
}

// ---------------------------------------------------------------------------------------------
// Miami, Hard Rock Stadium: the tennis stadium stands on the football field inside the NFL bowl. The bowl's
// canopy covers its seats and is open over the field; it hangs from four tall white masts on the corners, each
// with a fan of stays down to the canopy's inner edge and a back-stay to the ground; video boards hang under it
// in the corners.
function mia(A, spec, K) {
  const R = spec.roof, F = A.F, y = A.roofY, top = y + (R.thick || 1.6), c45 = Math.SQRT1_2;
  const white = K.mat('#eef0ee', { roughness: 0.45, metalness: 0.25 }), stay = K.mat('#d4d7d9', { roughness: 0.4, metalness: 0.6 });
  const oF = { hx: R.openX, hz: R.openZ, rc: R.openR == null ? 3 : R.openR, nx: F.nx, nz: F.nz, nc: F.nc };
  const lip = K.ring(oF, 0, top), corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [sx, sz] of corners) {
    const Rm = F.rc + A.outerD + 6, bx = sx * (F.hx - F.rc + Rm * c45), bz = sz * (F.hz - F.rc + Rm * c45);
    const tip = v3(bx - sx * 4, top + 34, bz - sz * 4);
    K.beam(white, v3(bx, 0, bz), tip, 1.6);
    const near = lip.filter(p => p.x * sx > 0 && p.z * sz > 0), step = Math.max(1, Math.floor(near.length / 7));
    for (let i = 0; i < near.length; i += step) K.beam(stay, tip, v3(near[i].x, top, near[i].z), 0.16);
    K.beam(stay, tip, v3(bx + sx * 26, 0, bz + sz * 26), 0.2);
  }
  A.screens = corners.map(([sx, sz]) => { const Rs = oF.rc + 5, x = sx * (oF.hx - oF.rc + Rs * c45), z = sz * (oF.hz - oF.rc + Rs * c45); return { x, y: y - 6, z, ry: Math.atan2(-x, -z), tilt: 0.1, w: 15 }; });
}

const BUILD = { wim, us, rg, ao, mia };
export function buildLandmarks(A, spec, lit) {
  const f = BUILD[spec.key]; if (!f || !A.tierInfo || !A.tierInfo.length) return;
  if (typeof location !== 'undefined' && /[?&]landmarks=0\b/.test(location.search)) return;   // dev: the generic bowl alone, to compare
  f(A, spec, kit(A, lit));
}
