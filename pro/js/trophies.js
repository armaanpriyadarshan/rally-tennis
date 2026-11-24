// Rally Pro — the winner's trophy of every event, as it is (he said "the trophies should be accurate").
// Each is built from what the trophy is: its form, its material and colour, its size, and how a winner holds it. The sources for
// each are in NOTES.md (2026-11-23, trophies). Built in metres, its foot at the origin, its front toward +z.
// userData.grip = { y, w, curl }: the two points it is held by - its handles, or its sides or its base where it has none - y above
// its foot, w either side of its middle, and how far the fingers close round them (1 a fist round a handle, 0.4 a palm pressed on).
import * as THREE from 'three';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let M = null;
function mats() {
  if (M) return M;
  const std = (color, metalness, roughness, o = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity: o.env ?? 1.3, side: THREE.DoubleSide, ...o.x });
  const glass = (color, opacity, roughness = 0.04) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness, transparent: true, opacity, envMapIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false });
  M = {
    silver: std('#e3e6ea', 1, 0.22, { env: 1.25 }), chrome: std('#f1f3f5', 1, 0.06), alu: std('#c9ced2', 1, 0.36), pewter: std('#c4c6c4', 1, 0.3),
    gilt: std('#e3bb5e', 1, 0.2), gold: std('#ecc463', 1, 0.17), brass: std('#c9a14a', 1, 0.3), bronze: std('#b98a4e', 1, 0.32),
    patina: std('#93a08c', 0.55, 0.55),
    black: std('#141414', 0.2, 0.32, { env: 0.8 }), wood: std('#5b3621', 0, 0.5, { env: 0.6 }), walnut: std('#4a2e1c', 0, 0.45, { env: 0.6 }),
    marble: std('#bdbcb6', 0, 0.22, { env: 0.9 }), white: std('#f2f2ef', 0, 0.3, { env: 0.8 }),
    crystal: glass('#eef7fc', 0.4), acrylic: glass('#f4fbff', 0.22), frost: glass('#e9eff2', 0.6, 0.45), resin: glass('#24443b', 0.82, 0.08),
    ball: std('#d6e64a', 0, 0.85, { env: 0.5 }), red: std('#c4262e', 0, 0.5, { env: 0.6 }), blue: std('#1d4fa3', 0.2, 0.3),
    strings: new THREE.MeshStandardMaterial({ color: '#f4f1e6', metalness: 0, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    glaze: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.18, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    nylon: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.75, envMapIntensity: 0.7, flatShading: true, side: THREE.DoubleSide }),
  };
  return M;
}

// ---- the parts ----
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
// a body turned on a lathe: points [radius, height] from the bottom up; seg sides (8 for an octagon, flat shaded)
function lathe(pts, mat, seg = 56, flat = false) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0004), y)), seg);
  if (flat) { const n = g.toNonIndexed(); n.computeVertexNormals(); return new THREE.Mesh(n, mat.flatShading ? mat : Object.assign(mat.clone(), { flatShading: true })); }
  return new THREE.Mesh(g, mat);
}
// a tube along a smooth curve through pts [x, y, z]
const tube = (pts, r, mat, n = 48) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p))), n, r, 10, false), mat);
// a handle on each side: pts for the right-hand one (+x), the left mirrored
function handles(g, pts, r, mat) { for (const s of [1, -1]) g.add(tube(pts.map(([x, y, z]) => [x * s, y, z]), r, mat)); }
const box = (w, h, d, mat, y = 0, x = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
const cyl = (rt, rb, h, mat, y = 0, seg = 40) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, 0, y + h / 2, 0);
const sphere = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = mesh(new THREE.SphereGeometry(r, 24, 16), mat, x, y, z); m.scale.set(sx, sy, sz); return m; };
const ring = (R, r, mat, y, sy = 1) => { const m = mesh(new THREE.TorusGeometry(R, r, 10, 56), mat, 0, y, 0); m.rotation.x = Math.PI / 2; m.scale.z = sy; return m; };
// colour a body's vertices by height (glaze, printed nylon): stops [t 0..1, colour]
function heightColours(m, stops) {
  const g = m.geometry, p = g.attributes.position, c = new Float32Array(p.count * 3); g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, col = new THREE.Color(), a = new THREE.Color(), b = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - y0) / Math.max(1e-6, y1 - y0); let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], u = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0))); col.copy(a.set(c0)).lerp(b.set(c1), u); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return m;
}
// a racket's strings: a square grid drawn once
let STR = null;
function stringTex() { if (STR) return STR; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128); x.strokeStyle = '#fff'; x.lineWidth = 2;
  for (let i = 4; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  STR = new THREE.CanvasTexture(c); STR.colorSpace = THREE.SRGBColorSpace; return STR; }
// a simple seeded random, for the shapes that are irregular (the tree, the totem)
const rnd = s => () => (s = (s * 48271) % 2147483647) / 2147483647;

// ---- the trophies ----
const B = {
  // Australian Open, the Norman Brookes Challenge Cup: a silver vase after the Warwick Vase, 28 cm, the bowl 25.7 cm across, 39 cm
  // across its handles, big reeded handles rising from low on the bowl to over its rim; a square plinth 15.5 cm.
  ao(g, m) {
    g.add(box(0.155, 0.035, 0.155, m.silver), box(0.13, 0.012, 0.13, m.silver, 0.035));
    g.add(lathe([[0, 0.047], [0.07, 0.047], [0.07, 0.056], [0.045, 0.066], [0.03, 0.085], [0.034, 0.1], [0.07, 0.112], [0.1, 0.135], [0.118, 0.17], [0.124, 0.215], [0.126, 0.25], [0.134, 0.268], [0.129, 0.28], [0.12, 0.27]], m.silver));
    g.add(ring(0.124, 0.006, m.silver, 0.2), ring(0.09, 0.006, m.silver, 0.125));   // the bands round the bowl
    for (const k of [0, 1, 2]) handles(g, [[0.105, 0.15, -0.012 + k * 0.012], [0.165, 0.17, 0], [0.198, 0.22, 0], [0.19, 0.275, 0], [0.155, 0.292, 0], [0.13, 0.272, -0.012 + k * 0.012]], 0.0055, m.silver);   // reeded: three rods
    return { y: 0.22, w: 0.19, curl: 0.82 };
  },
  // Wimbledon, the Gentlemen's Singles Trophy: a silver-gilt cup, 47 cm, 19 cm across, two handles, a lid with a pineapple on top.
  wim(g, m) {
    g.add(lathe([[0, 0], [0.078, 0], [0.078, 0.012], [0.06, 0.022], [0.034, 0.05], [0.026, 0.09], [0.04, 0.11], [0.07, 0.14], [0.088, 0.19], [0.095, 0.25], [0.093, 0.3], [0.098, 0.318], [0.09, 0.325]], m.gilt));
    g.add(lathe([[0.096, 0.322], [0.092, 0.334], [0.075, 0.36], [0.045, 0.385], [0.022, 0.395], [0, 0.398]], m.gilt));
    g.add(sphere(0.026, m.gilt, 0, 0.428, 0, 1, 1.35, 1), cyl(0.012, 0.018, 0.012, m.gilt, 0.395));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, l = mesh(new THREE.ConeGeometry(0.008, 0.03, 6), m.gilt, Math.cos(a) * 0.009, 0.47, Math.sin(a) * 0.009); l.rotation.z = Math.cos(a) * 0.5; l.rotation.x = -Math.sin(a) * 0.5; g.add(l); }   // the pineapple's leaves
    g.add(ring(0.094, 0.005, m.gilt, 0.24));
    handles(g, [[0.085, 0.17, 0], [0.13, 0.19, 0], [0.152, 0.24, 0], [0.145, 0.295, 0], [0.115, 0.312, 0], [0.095, 0.3, 0]], 0.008, m.gilt);
    return { y: 0.25, w: 0.148, curl: 0.82 };
  },
  // Roland Garros, the Coupe des Mousquetaires: a silver cup, wide-mouthed, a border of vine leaves, swan-necked handles, ~40 cm.
  rg(g, m) {
    g.add(lathe([[0, 0], [0.085, 0], [0.085, 0.016], [0.065, 0.026], [0.032, 0.06], [0.026, 0.1], [0.04, 0.125], [0.07, 0.15], [0.092, 0.2], [0.103, 0.27], [0.112, 0.34], [0.126, 0.385], [0.13, 0.4], [0.122, 0.392]], m.silver));
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2, l = sphere(0.016, m.silver, Math.cos(a) * 0.116, 0.36, Math.sin(a) * 0.116, 1, 0.55, 0.35); l.rotation.y = -a; g.add(l); }   // the vine leaves
    g.add(ring(0.075, 0.007, m.silver, 0.15));
    handles(g, [[0.09, 0.2, 0], [0.15, 0.22, 0], [0.172, 0.27, 0], [0.16, 0.33, 0], [0.135, 0.355, 0], [0.142, 0.375, 0.0], [0.158, 0.37, 0]], 0.0085, m.silver);   // the swan's neck, its head turned out
    return { y: 0.27, w: 0.172, curl: 0.82 };
  },
  // US Open: Tiffany's sterling silver cup, about 47 cm, tall scrolled handles.
  us(g, m) {
    g.add(lathe([[0, 0], [0.092, 0], [0.092, 0.014], [0.082, 0.02], [0.082, 0.03], [0.05, 0.045], [0.03, 0.09], [0.028, 0.12], [0.045, 0.14], [0.08, 0.17], [0.105, 0.23], [0.12, 0.31], [0.13, 0.4], [0.14, 0.455], [0.145, 0.47], [0.136, 0.465]], m.silver));
    g.add(ring(0.122, 0.005, m.silver, 0.33), ring(0.083, 0.006, m.silver, 0.17));
    handles(g, [[0.086, 0.175, 0], [0.12, 0.17, 0], [0.135, 0.19, 0], [0.12, 0.205, 0], [0.105, 0.2, 0], [0.13, 0.22, 0], [0.19, 0.29, 0], [0.205, 0.38, 0], [0.19, 0.44, 0], [0.16, 0.455, 0], [0.142, 0.45, 0]], 0.0085, m.silver);   // a scroll at the foot of each
    return { y: 0.34, w: 0.2, curl: 0.82 };
  },
  // Nitto ATP Finals: a sterling silver trophy of eight sides, about 60 cm, no handles: held round its body.
  fin(g, m) {
    g.add(lathe([[0, 0], [0.11, 0], [0.11, 0.05], [0.095, 0.06], [0.07, 0.07], [0.058, 0.16], [0.052, 0.28], [0.06, 0.34], [0.09, 0.42], [0.12, 0.52], [0.132, 0.6], [0.125, 0.6]], m.silver, 8, true));
    g.add(lathe([[0.112, 0.045], [0.112, 0.052]], m.silver, 8, true));
    return { y: 0.2, w: 0.068, curl: 0.45 };
  },
  // Monte-Carlo, the Coupe de S.A.S. le Prince Souverain: a wide, plain, polished silver bowl on a short stem and a round foot, on
  // a dark wood plinth with a silver plaque; the red and white of Monaco tied at the stem. Held under the bowl and by the plinth.
  mc(g, m) {
    g.add(box(0.26, 0.07, 0.2, m.wood), box(0.12, 0.035, 0.004, m.silver, 0.018, 0, 0.101));
    g.add(lathe([[0, 0.07], [0.075, 0.07], [0.075, 0.08], [0.05, 0.09], [0.024, 0.105], [0.022, 0.13], [0.05, 0.145], [0.11, 0.17], [0.16, 0.21], [0.185, 0.26], [0.19, 0.3], [0.184, 0.3]], m.silver));
    g.add(ring(0.024, 0.006, m.red, 0.118), ring(0.024, 0.006, m.white, 0.128));
    return { y: 0.035, w: 0.135, curl: 0.55 };
  },
  // Rome, the Coppa Federazione Italiana Tennis: a silver bell-shaped urn, the rim flared and beaded, the lower body fluted, two
  // small scroll handles low on it, on a round foot and a grey veined marble plinth. About 45 cm. Held by the plinth.
  rom(g, m) {
    g.add(box(0.24, 0.08, 0.2, m.marble));
    g.add(lathe([[0, 0.08], [0.075, 0.08], [0.075, 0.09], [0.05, 0.1], [0.026, 0.13], [0.024, 0.16], [0.05, 0.17]], m.silver));
    g.add(lathe([[0.05, 0.17], [0.075, 0.18], [0.09, 0.21], [0.095, 0.25]], m.silver, 20, true));   // fluted
    g.add(lathe([[0.095, 0.25], [0.1, 0.3], [0.115, 0.36], [0.135, 0.41], [0.15, 0.44], [0.155, 0.45], [0.148, 0.445]], m.silver));
    for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; g.add(sphere(0.0055, m.silver, Math.cos(a) * 0.153, 0.448, Math.sin(a) * 0.153)); }
    handles(g, [[0.088, 0.2, 0], [0.12, 0.215, 0], [0.13, 0.24, 0], [0.115, 0.25, 0], [0.098, 0.245, 0]], 0.006, m.silver);
    return { y: 0.04, w: 0.122, curl: 0.55 };
  },
  // Paris, "l'Arbre" of Lucio Fanti: a bronze tree with no leaves, pale grey-green, a trunk splitting into many thin angular
  // branches in a wide crown (the draw: the champion's name on the trunk), 50-60 cm, on a small block. Held by the trunk and block.
  par(g, m) {
    g.add(box(0.11, 0.05, 0.11, m.patina));
    const r = rnd(731), seg = (a, b, w) => { const d = V3().subVectors(b, a), l = d.length(), c = mesh(new THREE.CylinderGeometry(w * 0.8, w, l, 6), m.patina); c.position.copy(a).addScaledVector(d, 0.5); c.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); g.add(c); };
    const grow = (p, dir, len, w, depth) => { const q = p.clone().addScaledVector(dir, len); seg(p, q, w); if (depth === 0) return;
      const n = depth > 3 ? 2 : 2 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const a = (k / n + r() * 0.3) * Math.PI * 2, t = 0.55 + r() * 0.6 + (5 - depth) * 0.08, d2 = V3(dir.x * 0.6 + Math.cos(a) * t, 1, dir.z * 0.6 + Math.sin(a) * t * 0.5).normalize(); grow(q, d2, len * (0.72 + r() * 0.12), w * 0.68, depth - 1); } };
    grow(V3(0, 0.05, 0), V3(0, 1, 0), 0.19, 0.02, 5);
    return { y: 0.06, w: 0.06, curl: 0.6 };
  },
  // Madrid, a new sculpture by David Rodríguez Caballero each year; 2026's "Aphormē": a folded, twisting funnel of brushed aluminium
  // with brass, on a slim stem and a small square plate (made small so the winner can take hold of it), about 50 cm.
  mad(g, m) {
    g.add(box(0.12, 0.012, 0.12, m.alu), cyl(0.014, 0.016, 0.2, m.alu, 0.012), cyl(0.022, 0.016, 0.02, m.brass, 0.2));
    const f = lathe([[0.02, 0.22], [0.035, 0.26], [0.06, 0.32], [0.09, 0.4], [0.115, 0.47], [0.13, 0.51]], m.alu, 7, false), p = f.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = (y - 0.22) * 4.2, x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)); }
    const n = f.geometry.toNonIndexed(); n.computeVertexNormals(); f.geometry = n; f.material = Object.assign(m.alu.clone(), { flatShading: true }); g.add(f);
    g.add(ring(0.13, 0.004, m.brass, 0.508));
    return { y: 0.11, w: 0.035, curl: 0.88 };
  },
  // Canada, the National Bank Open (since 2021): two racket heads locked through each other, frames and strings, gold-toned.
  can(g, m) {
    g.add(cyl(0.05, 0.06, 0.03, m.bronze));
    for (const a of [0, Math.PI / 2]) {
      const h = new THREE.Group(), fr = mesh(new THREE.TorusGeometry(0.125, 0.011, 10, 64), m.bronze); fr.scale.set(1, 1.3, 1); h.add(fr);
      const st = mesh(new THREE.CircleGeometry(0.118, 48), Object.assign(m.strings.clone(), { map: stringTex(), alphaMap: stringTex() })); st.scale.set(1, 1.3, 1); h.add(st);
      h.add(tube([[-0.05, -0.155, 0], [-0.018, -0.21, 0], [0, -0.225, 0]], 0.008, m.bronze), tube([[0.05, -0.155, 0], [0.018, -0.21, 0], [0, -0.225, 0]], 0.008, m.bronze));   // the throat
      h.position.y = 0.255; h.rotation.y = a + Math.PI / 4; g.add(h);   // (each turned 45° to the front, so both are seen)
    }
    return { y: 0.25, w: 0.128, curl: 0.75 };
  },
  // Miami, the Butch Buchholz Trophy: cut crystal from a single blown piece (Lasvit, since 2022), nearly 50 cm.
  mia(g, m) {
    g.add(lathe([[0, 0], [0.075, 0], [0.072, 0.03], [0.048, 0.11], [0.08, 0.2], [0.11, 0.3], [0.1, 0.38], [0.07, 0.45], [0.085, 0.49], [0.08, 0.495]], m.crystal, 10, true));
    return { y: 0.2, w: 0.092, curl: 0.45 };
  },
  // Indian Wells, Baccarat's shooting star: solid clear crystal, tall and narrow and heavy at the top, about 48 cm.
  iw(g, m) {
    const sh = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k / 10 * Math.PI * 2, r = k % 2 ? 0.05 : 0.12; k ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const star = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 1 }), m.crystal, 0, 0.36, -0.035); star.rotation.z = 0.25; g.add(star);
    const tail = lathe([[0, 0], [0.065, 0], [0.06, 0.03], [0.04, 0.12], [0.03, 0.22], [0.035, 0.3]], m.crystal, 8, true); tail.rotation.z = -0.06; g.add(tail);
    return { y: 0.12, w: 0.05, curl: 0.5 };
  },
  // Shanghai: Royal Selangor's pewter after the stadium's roof, a magnolia's eight petals: angular struts flaring into faceted
  // petals, gold, on a short faceted silver foot, no handles.
  sha(g, m) {
    g.add(lathe([[0, 0], [0.07, 0], [0.07, 0.02], [0.05, 0.04], [0.035, 0.09], [0.04, 0.11]], m.pewter, 8, true));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, s = new THREE.Shape(); s.moveTo(-0.012, 0); s.lineTo(0.012, 0); s.lineTo(0.05, 0.22); s.lineTo(0, 0.34); s.lineTo(-0.05, 0.22); s.lineTo(-0.012, 0);
      const pt = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }), m.gold); const piv = new THREE.Group(); piv.position.set(Math.cos(a) * 0.03, 0.105, Math.sin(a) * 0.03); piv.rotation.y = -a + Math.PI / 2; pt.rotation.x = -0.42; piv.add(pt); g.add(piv); }
    return { y: 0.06, w: 0.05, curl: 0.7 };
  },
  // Cincinnati, the Rookwood Cup: Rookwood Pottery's, a glazed ceramic vase, white fading into a deep blue.
  cin(g, m) {
    const v = lathe([[0, 0], [0.065, 0], [0.068, 0.015], [0.06, 0.03], [0.09, 0.1], [0.122, 0.19], [0.118, 0.26], [0.095, 0.31], [0.065, 0.35], [0.06, 0.38], [0.075, 0.4], [0.07, 0.402]], m.glaze);
    g.add(heightColours(v, [[0, '#f3f1ea'], [0.35, '#e9eef3'], [0.75, '#3a64b4'], [1, '#1d3c84']]));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.add(sphere(0.018, m.ball, Math.cos(a) * 0.12, 0.25, Math.sin(a) * 0.12)); }   // the tennis balls among its leaves
    return { y: 0.19, w: 0.128, curl: 0.42 };
  },
  // Rotterdam (Sabine Marcelis, since 2023): a square slab of polished cast resin, dark smoky green, a tennis ball in a round hollow.
  rot(g, m) {
    g.add(box(0.3, 0.3, 0.07, m.resin), sphere(0.033, m.ball, 0, 0.17, 0));
    return { y: 0.07, w: 0.152, curl: 0.42 };
  },
  // Dallas, the Lamar Hunt Trophy: an arch after the Margaret Hunt Hill Bridge over a clear box full of tennis balls.
  dal(g, m) {
    g.add(box(0.26, 0.16, 0.2, m.acrylic));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 3; k++) g.add(sphere(0.031, m.ball, -0.096 + i * 0.064, 0.033 + j * 0.064, -0.064 + k * 0.064));
    g.add(box(0.27, 0.012, 0.21, m.silver, 0.16));
    const arch = []; for (let k = 0; k <= 16; k++) { const t = k / 16, a = Math.PI * t; arch.push([-Math.cos(a) * 0.06, 0.172 + Math.sin(a) * 0.2, 0]); } g.add(tube(arch, 0.008, m.silver));
    for (let k = 1; k < 8; k++) { const x = -0.1 + k * 0.025; g.add(tube([[0, 0.372, 0], [x, 0.18, 0]], 0.0015, m.silver, 4)); }   // its cables
    return { y: 0.08, w: 0.132, curl: 0.42 };
  },
  // Doha, the Golden Falcon: a gold falcon upright, wings folded, on a small silver dome and a slim silver stem, on a faceted base.
  doh(g, m) {
    g.add(lathe([[0, 0], [0.085, 0], [0.065, 0.09], [0.04, 0.1], [0, 0.1]], m.crystal, 4, true), sphere(0.016, m.gold, 0, 0.05, 0.062));
    g.add(cyl(0.012, 0.016, 0.15, m.silver, 0.1), lathe([[0.035, 0.25], [0.03, 0.268], [0.018, 0.278], [0, 0.282]], m.silver));
    g.add(sphere(0.045, m.gold, 0, 0.33, 0, 0.8, 1.25, 0.9), sphere(0.024, m.gold, 0, 0.405, 0.01), mesh(new THREE.ConeGeometry(0.008, 0.022, 8), m.gold, 0, 0.402, 0.036));
    for (const s of [-1, 1]) { const w = sphere(0.04, m.gold, s * 0.03, 0.33, -0.01, 0.35, 1.5, 0.95); w.rotation.z = s * 0.12; g.add(w); }
    g.add(sphere(0.02, m.gold, 0, 0.27, -0.035, 0.7, 1.4, 0.5));   // its tail
    return { y: 0.05, w: 0.08, curl: 0.5 };
  },
  // Rio (Antonio Bernardo): silver mesh in the outline of the Sugarloaf, a gold ball between its humps, on a long low black base.
  rio(g, m) {
    g.add(box(0.6, 0.05, 0.12, m.black));
    const hump = (x0, x1, h) => { const pts = []; for (let k = 0; k <= 14; k++) { const t = k / 14; pts.push([x0 + (x1 - x0) * t, 0.05 + Math.pow(Math.sin(Math.PI * t), 0.8) * h]); } return pts; };
    for (const [x0, x1, h] of [[-0.27, -0.03, 0.26], [0.0, 0.27, 0.15]]) for (let z = -0.03; z <= 0.031; z += 0.015) g.add(tube(hump(x0, x1, h).map(([x, y]) => [x, y, z]), 0.0025, m.silver, 40));
    for (let x = -0.25; x <= 0.26; x += 0.025) g.add(tube([[x, 0.05, -0.03], [x, 0.05 + 0.01, 0], [x, 0.05, 0.03]], 0.0015, m.silver, 4));
    g.add(sphere(0.028, m.gold, -0.015, 0.08, 0));
    return { y: 0.025, w: 0.29, curl: 0.55 };
  },
  // Dubai: a silver dhow under its billowing lateen sail, on a plinth.
  dub(g, m) {
    g.add(box(0.3, 0.06, 0.12, m.black));
    const hull = sphere(0.13, m.silver, 0, 0.1, 0, 1, 0.38, 0.32); g.add(hull);
    g.add(box(0.24, 0.01, 0.07, m.silver, 0.1));
    g.add(cyl(0.004, 0.005, 0.28, m.silver, 0.1));
    const s = new THREE.Shape(); s.moveTo(-0.13, 0.12); s.quadraticCurveTo(0.0, 0.08, 0.12, 0.33); s.quadraticCurveTo(0.03, 0.2, -0.13, 0.12);
    const sail = mesh(new THREE.ShapeGeometry(s, 16), m.silver, 0, 0, 0.004); g.add(sail); g.add(tube([[-0.14, 0.115, 0], [0.13, 0.34, 0]], 0.003, m.silver, 4));
    return { y: 0.03, w: 0.155, curl: 0.55 };
  },
  // Acapulco, the Guaje de Plata (TANE): a pear-shaped silver gourd with a curled stem, a gold tennis ball set in its front, on a
  // square walnut plinth.
  aca(g, m) {
    g.add(box(0.17, 0.05, 0.17, m.walnut));
    g.add(lathe([[0, 0.05], [0.04, 0.055], [0.09, 0.09], [0.11, 0.14], [0.105, 0.19], [0.075, 0.23], [0.05, 0.27], [0.055, 0.31], [0.04, 0.34], [0.012, 0.355], [0, 0.356]], m.silver));
    g.add(tube([[0, 0.35, 0], [0.004, 0.375, 0], [0.025, 0.385, 0], [0.03, 0.37, 0], [0.018, 0.365, 0]], 0.005, m.silver, 20));
    g.add(sphere(0.034, m.gold, 0, 0.14, 0.092), ring(0.036, 0.004, m.gold, 0.14));
    g.children[g.children.length - 1].rotation.x = 0; g.children[g.children.length - 1].position.z = 0.096;
    return { y: 0.025, w: 0.088, curl: 0.55 };
  },
  // Barcelona, the Trofeo Conde de Godó (Soler-Cabot, 1953): a covered neoclassical cup of sterling silver, acanthus handles, a
  // volleying player on its lid, on an oak and silver pedestal; 71 cm in all.
  bar(g, m) {
    g.add(cyl(0.15, 0.16, 0.11, m.wood), ring(0.152, 0.006, m.silver, 0.1), ring(0.158, 0.006, m.silver, 0.012));
    g.add(lathe([[0, 0.11], [0.09, 0.11], [0.09, 0.125], [0.055, 0.14], [0.03, 0.18], [0.03, 0.22], [0.07, 0.24], [0.12, 0.29], [0.145, 0.36], [0.14, 0.43], [0.148, 0.45], [0.14, 0.455]], m.silver));
    g.add(lathe([[0.145, 0.452], [0.12, 0.49], [0.07, 0.53], [0.03, 0.55], [0.02, 0.57], [0, 0.575]], m.silver));
    g.add(sphere(0.016, m.silver, 0, 0.6, 0, 0.9, 1.6, 0.7), sphere(0.011, m.silver, 0, 0.64, 0), tube([[0.01, 0.61, 0], [0.04, 0.63, 0.01]], 0.004, m.silver, 4), sphere(0.012, m.silver, 0.05, 0.635, 0.012, 1, 1.3, 0.3));   // the volleyer
    g.add(tube([[-0.006, 0.585, 0], [-0.012, 0.57, 0]], 0.005, m.silver, 4), tube([[0.006, 0.585, 0], [0.014, 0.57, 0]], 0.005, m.silver, 4));
    handles(g, [[0.13, 0.3, 0], [0.19, 0.31, 0], [0.215, 0.36, 0], [0.205, 0.42, 0], [0.175, 0.44, 0], [0.16, 0.42, 0], [0.17, 0.4, 0]], 0.011, m.silver);
    return { y: 0.36, w: 0.212, curl: 0.82 };
  },
  // Munich: a tall, flat, slightly tapered slab of mirror-polished metal, a frosted glass block at its top front.
  mun(g, m) {
    const s = new THREE.Shape(); s.moveTo(-0.055, 0); s.lineTo(0.055, 0); s.lineTo(0.065, 0.37); s.lineTo(-0.065, 0.37); s.lineTo(-0.055, 0);
    g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }), m.chrome, 0, 0, -0.015));
    g.add(box(0.1, 0.06, 0.04, m.frost, 0.29, 0, 0.03));
    const rd = mesh(new THREE.CircleGeometry(0.016, 32), m.blue, 0, 0.2, 0.0185); g.add(rd);
    return { y: 0.07, w: 0.068, curl: 0.6 };
  },
  // Hamburg (2026): a totem of irregular facets, narrow at the waist, a crown of angular pieces after the stadium's roof; printed
  // nylon running from cobalt blue through clay red to white. 50 cm.
  ham(g, m) {
    const t = lathe([[0, 0], [0.085, 0], [0.09, 0.06], [0.07, 0.15], [0.05, 0.22], [0.065, 0.3], [0.095, 0.38], [0.11, 0.42], [0, 0.42]], m.nylon, 9, false), p = t.geometry.attributes.position, r = rnd(377);
    for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.18; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    const n = t.geometry.toNonIndexed(); n.computeVertexNormals(); t.geometry = n; heightColours(t, [[0, '#1c3fa8'], [0.55, '#b5523a'], [1, '#f4f1ec']]); g.add(t);
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, c = mesh(new THREE.ConeGeometry(0.03, 0.09, 4), m.white, Math.cos(a) * 0.08, 0.45, Math.sin(a) * 0.08); c.rotation.z = -Math.cos(a) * 0.35; c.rotation.x = Math.sin(a) * 0.35; g.add(c); }
    return { y: 0.16, w: 0.07, curl: 0.5 };
  },
  // Halle (Juwelier Dodt): a silver covered cup with a finial, a round bowl with gold leaf and porcelain, two thin loop handles, a
  // baluster stem, on a dark plinth with a gold plaque; 8.3 kg.
  hal(g, m) {
    g.add(box(0.2, 0.06, 0.2, m.black), box(0.08, 0.025, 0.003, m.gold, 0.018, 0, 0.1015));
    g.add(lathe([[0, 0.06], [0.07, 0.06], [0.07, 0.07], [0.045, 0.08], [0.025, 0.11], [0.035, 0.14], [0.025, 0.17], [0.05, 0.19], [0.09, 0.23], [0.11, 0.29], [0.105, 0.35], [0.09, 0.38], [0.095, 0.39], [0.085, 0.392]], m.silver));
    g.add(ring(0.111, 0.012, m.gold, 0.29), ring(0.1, 0.009, m.white, 0.33));
    g.add(lathe([[0.092, 0.39], [0.075, 0.42], [0.04, 0.44], [0, 0.445]], m.silver), sphere(0.02, m.silver, 0, 0.465, 0));
    handles(g, [[0.105, 0.25, 0], [0.15, 0.27, 0], [0.16, 0.32, 0], [0.13, 0.36, 0], [0.1, 0.36, 0]], 0.006, m.silver);
    return { y: 0.31, w: 0.157, curl: 0.82 };
  },
  // Queen's Club: a large silver covered cup, its body an egg with gilt bands and engraved names, a domed lid with an acorn finial,
  // two very tall looping handles over the rim; 76 cm with its plinth.
  que(g, m) {
    g.add(box(0.2, 0.07, 0.2, m.black));
    g.add(lathe([[0, 0.07], [0.085, 0.07], [0.085, 0.082], [0.06, 0.092], [0.032, 0.13], [0.03, 0.17], [0.07, 0.19], [0.115, 0.25], [0.135, 0.33], [0.13, 0.42], [0.11, 0.48], [0.09, 0.5], [0.095, 0.51], [0.088, 0.512]], m.silver));
    g.add(ring(0.135, 0.008, m.gilt, 0.32), ring(0.118, 0.007, m.gilt, 0.455));
    g.add(lathe([[0.093, 0.51], [0.085, 0.54], [0.06, 0.575], [0.03, 0.6], [0, 0.605]], m.silver), cyl(0.012, 0.016, 0.02, m.silver, 0.6), sphere(0.024, m.silver, 0, 0.645, 0, 1, 1.3, 1), sphere(0.026, m.silver, 0, 0.63, 0, 1, 0.45, 1));
    handles(g, [[0.12, 0.24, 0], [0.18, 0.27, 0], [0.205, 0.36, 0], [0.2, 0.48, 0], [0.18, 0.56, 0], [0.145, 0.57, 0], [0.12, 0.53, 0], [0.11, 0.5, 0]], 0.009, m.silver);
    return { y: 0.4, w: 0.203, curl: 0.82 };
  },
  // Washington, the Donald Dell Trophy: after John Safer's "Serve", two crescents of polished metal rising through each other.
  was(g, m) {
    g.add(cyl(0.06, 0.07, 0.04, m.black));
    for (const [a, rz] of [[0, 0.35], [Math.PI / 2, -0.35]]) { const c = mesh(new THREE.TorusGeometry(0.15, 0.018, 12, 48, Math.PI * 1.15), m.chrome); const piv = new THREE.Group(); piv.position.y = 0.2; piv.rotation.y = a; c.rotation.z = -Math.PI * 0.075 + rz; c.scale.set(1, 1.15, 0.6); piv.add(c); g.add(piv); }
    g.add(cyl(0.012, 0.018, 0.06, m.chrome, 0.04));
    return { y: 0.02, w: 0.07, curl: 0.55 };
  },
  // Tokyo: a silver ball of a bowl with a domed lid and a spire, two short arms at its shoulder ending in balls, on a tall slender
  // trumpet stem and a round stepped base of black and silver.
  tok(g, m) {
    g.add(cyl(0.09, 0.095, 0.035, m.black), cyl(0.075, 0.085, 0.02, m.silver, 0.035), cyl(0.06, 0.07, 0.02, m.black, 0.055));
    g.add(lathe([[0, 0.075], [0.05, 0.075], [0.03, 0.1], [0.016, 0.2], [0.013, 0.28], [0.02, 0.3]], m.silver));
    g.add(sphere(0.085, m.silver, 0, 0.375, 0), lathe([[0.07, 0.42], [0.06, 0.45], [0.03, 0.475], [0, 0.48]], m.silver), mesh(new THREE.ConeGeometry(0.012, 0.09, 12), m.silver, 0, 0.525, 0), sphere(0.008, m.silver, 0, 0.575, 0));
    handles(g, [[0.075, 0.41, 0], [0.12, 0.41, 0]], 0.005, m.silver); g.add(sphere(0.012, m.silver, 0.125, 0.41, 0), sphere(0.012, m.silver, -0.125, 0.41, 0));
    return { y: 0.19, w: 0.034, curl: 0.88 };
  },
  // Beijing, the China Cup: gold, after the Qing emperors' Jin'ou Yonggu cup in the Palace Museum, two raised dragon handles, a
  // wave and cliff pattern round its body, on a square straight-edged base.
  bei(g, m) {
    g.add(box(0.17, 0.045, 0.17, m.gold));
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(cyl(0.012, 0.016, 0.05, m.gold, 0.045).translateX(x * 0.05).translateZ(z * 0.05));
    g.add(lathe([[0, 0.09], [0.07, 0.09], [0.1, 0.12], [0.115, 0.18], [0.112, 0.24], [0.118, 0.27], [0.11, 0.268]], m.gold));
    for (let k = 0; k < 3; k++) g.add(ring(0.114, 0.004, m.gold, 0.135 + k * 0.018));   // the waves
    for (const s of [1, -1]) { g.add(tube([[s * 0.11, 0.15, 0], [s * 0.15, 0.17, 0], [s * 0.16, 0.23, 0], [s * 0.14, 0.29, 0], [s * 0.115, 0.3, 0]], 0.011, m.gold)); g.add(sphere(0.02, m.gold, s * 0.112, 0.305, 0, 1.2, 0.8, 0.9)); }   // the dragons, their heads at the rim
    return { y: 0.22, w: 0.155, curl: 0.82 };
  },
  // Basel: a large ornate silver covered cup, its lobed body chased with foliage, a domed lid and finial, two long S-scroll handles,
  // a trumpet foot on a round base; about 60 cm, 50 cm across the handles. Held by the handles.
  bas(g, m) {
    g.add(lathe([[0, 0], [0.1, 0], [0.1, 0.015], [0.08, 0.025], [0.045, 0.06], [0.03, 0.13], [0.035, 0.16], [0.07, 0.18], [0.12, 0.23], [0.15, 0.3], [0.15, 0.37], [0.135, 0.42], [0.14, 0.435], [0.13, 0.438]], m.silver, 12, false));
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.add(sphere(0.03, m.silver, Math.cos(a) * 0.14, 0.3, Math.sin(a) * 0.14, 0.45, 1.4, 0.45)); }   // the lobes
    g.add(lathe([[0.138, 0.435], [0.125, 0.47], [0.08, 0.51], [0.035, 0.53], [0, 0.535]], m.silver), cyl(0.015, 0.02, 0.025, m.silver, 0.53), sphere(0.03, m.silver, 0, 0.58, 0, 1, 1.2, 1));
    handles(g, [[0.14, 0.23, 0], [0.2, 0.22, 0], [0.235, 0.26, 0], [0.22, 0.32, 0], [0.19, 0.36, 0], [0.205, 0.41, 0], [0.24, 0.42, 0], [0.25, 0.4, 0]], 0.009, m.silver);
    return { y: 0.3, w: 0.225, curl: 0.82 };
  },
  // Vienna (Rainer Mutsch, since 2018): brass, eight-sided like a racket's handle and opening out at the top, mirror inside, the
  // winning match ball fixed in it.
  vie(g, m) {
    g.add(lathe([[0, 0], [0.045, 0], [0.045, 0.24], [0.06, 0.3], [0.09, 0.37], [0.12, 0.42], [0.112, 0.42], [0.083, 0.37], [0.05, 0.3], [0.035, 0.26], [0, 0.26]], m.brass, 8, true));
    g.add(sphere(0.033, m.ball, 0, 0.32, 0));
    return { y: 0.12, w: 0.055, curl: 0.62 };
  },
};
// any other: a plain silver cup with two handles
function plain(g, m) {
  g.add(lathe([[0, 0], [0.085, 0], [0.085, 0.014], [0.06, 0.024], [0.026, 0.06], [0.02, 0.13], [0.032, 0.15], [0.062, 0.175], [0.086, 0.215], [0.097, 0.27], [0.101, 0.325], [0.106, 0.36], [0.1, 0.366]], m.silver));
  handles(g, [[0.09, 0.2, 0], [0.14, 0.22, 0], [0.155, 0.27, 0], [0.14, 0.32, 0], [0.104, 0.335, 0]], 0.008, m.silver);
  return { y: 0.27, w: 0.15, curl: 0.82 };
}

// What the metal and glass reflect: a photographer's studio, grey walls and soft white lights above and to the sides, the same at
// every event. (Reflecting the stadium, a silver trophy in a dark indoor arena - Turin - came out navy black.)
let ENV = null;
function studio(renderer) {
  if (ENV || !renderer) return ENV;
  const sc = new THREE.Scene(), sg = new THREE.SphereGeometry(10, 32, 16), c = new Float32Array(sg.attributes.position.count * 3), col = new THREE.Color(), lo = new THREE.Color('#2a2c30'), mid = new THREE.Color('#8c9198'), hi = new THREE.Color('#dfe3e8');
  for (let i = 0; i < sg.attributes.position.count; i++) { const t = sg.attributes.position.getY(i) / 10; col.copy(t < 0 ? lo.clone().lerp(mid, 1 + t) : mid.clone().lerp(hi, t)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  sg.setAttribute('color', new THREE.BufferAttribute(c, 3)); sc.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); };
  panel(6, 6, 0, 8, 0, 3.2); panel(2, 7, 7, 2, 2, 4); panel(2, 7, -7, 2, 2, 4); panel(5, 3, 0, 3, 8, 2.2); panel(5, 2, 1, 1, -8, 1.4);
  const pm = new THREE.PMREMGenerator(renderer); ENV = pm.fromScene(sc, 0.03).texture; pm.dispose(); sg.dispose();
  return ENV;
}
export function buildTrophy(key, renderer) {
  const m = mats(), g = new THREE.Group(), grip = (B[key] || plain)(g, m), env = studio(renderer);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; if (env && o.material && !o.material.envMap) { o.material.envMap = env; o.material.needsUpdate = true; } } });
  g.userData.grip = grip; g.userData.key = key;
  return g;
}
export const TROPHY_KEYS = Object.keys(B);
