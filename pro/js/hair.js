// Rally Pro — hair and headwear. A haircut is grown from a few measurements — how long it is on
// top, at the sides and at the back, whether it is straight, wavy or curly, how far the fringe
// comes down, how far the hairline has gone back — on the model's own scalp: the head is
// measured once by casting rays out from the middle of the skull, and the hair is laid over that
// surface in layers of strands, each layer showing fewer strands than the one beneath, so the
// outline is broken like hair and not smooth like a helmet. Where it is long it leaves the head
// and hangs. Headbands, bandanas and caps are fitted to the same scalp.
import * as THREE from 'three';
import { sunMask } from './arena.js';

const rad = d => d * Math.PI / 180, lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const cm = v => v / 100;
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); }

// ---------- the scalp ----------
// The middle of the skull in the model's bind space (y up, facing +z, metres), and the head's
// radius from there in every direction: phi 0 at the face and positive toward the wearer's
// left, theta 0 at the crown.
const C = new THREE.Vector3(0, 1.705, 0.012), NP = 96, NT = 64, TMAX = rad(168);
const dirOf = (phi, th, out) => { const st = Math.sin(th); return out.set(Math.sin(phi) * st, Math.cos(th), Math.cos(phi) * st); };
const _scalps = new WeakMap();
function scalpMap(M, mesh) {
  if (M._scalp) return M._scalp;
  if (_scalps.has(mesh.geometry)) return M._scalp = _scalps.get(mesh.geometry);
  const g = mesh.geometry, pos = g.attributes.position, ix = g.index, tris = [];
  const P = i => [pos.getX(i) - C.x, pos.getY(i) - C.y, pos.getZ(i) - C.z];
  for (let t = 0; t < ix.count; t += 3) {
    const a = P(ix.getX(t)), b = P(ix.getX(t + 1)), c = P(ix.getX(t + 2));
    if (Math.max(a[1], b[1], c[1]) < -0.22) continue;
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], ml = Math.hypot(m[0], m[1], m[2]) || 1; m[0] /= ml; m[1] /= ml; m[2] /= ml;
    let cosR = 1; for (const p of [a, b, c]) { const l = Math.hypot(p[0], p[1], p[2]) || 1; cosR = Math.min(cosR, (p[0] * m[0] + p[1] * m[1] + p[2] * m[2]) / l); }
    tris.push([a, b, c, m, cosR - 0.002]);
  }
  const raw = new Float32Array(NP * (NT + 1)), d = new THREE.Vector3();
  for (let j = 0; j <= NT; j++) for (let i = 0; i < NP; i++) {
    dirOf((i / NP - 0.5) * Math.PI * 2, j / NT * TMAX, d); let far = 0;
    for (const [a, b, c, m, cosR] of tris) {
      if (d.x * m[0] + d.y * m[1] + d.z * m[2] < cosR) continue;
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, tx = -a[0], ty = -a[1], tz = -a[2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d.x * qx + d.y * qy + d.z * qz) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt > far) far = tt;
    }
    raw[i + j * NP] = far;
  }
  // rays that slipped out through the open neck take the nearest value above them
  for (let j = 1; j <= NT; j++) for (let i = 0; i < NP; i++) if (!(raw[i + j * NP] > 0.02)) raw[i + j * NP] = raw[i + (j - 1) * NP] || 0.09;
  // the skull without its ears: a wide blur, and the head never allowed far outside it
  const blur = new Float32Array(raw.length), K = 4;
  for (let j = 0; j <= NT; j++) for (let i = 0; i < NP; i++) { let s = 0, w = 0; for (let dj = -K; dj <= K; dj++) for (let di = -K; di <= K; di++) { const jj = clamp(j + dj, 0, NT), ii = (i + di + NP) % NP, k = Math.exp(-(di * di + dj * dj) / 9); s += Math.min(raw[ii + jj * NP], 0.125) * k; w += k; } blur[i + j * NP] = s / w; }
  const smooth = new Float32Array(raw.length); for (let k = 0; k < raw.length; k++) smooth[k] = Math.min(raw[k], blur[k] + 0.004);
  M._scalp = { raw, smooth }; _scalps.set(mesh.geometry, M._scalp); return M._scalp;
}
function sample(map, phi, th) {
  let u = (phi / (Math.PI * 2) + 0.5) * NP; u = ((u % NP) + NP) % NP; const v = clamp(th / TMAX, 0, 1) * NT;
  const i0 = Math.floor(u), j0 = Math.min(NT - 1, Math.floor(v)), fu = u - i0, fv = v - j0, i1 = (i0 + 1) % NP;
  return lerp(lerp(map[i0 + j0 * NP], map[i1 + j0 * NP], fu), lerp(map[i0 + (j0 + 1) * NP], map[i1 + (j0 + 1) * NP], fu), fv);
}

// ---------- where things sit on the head ----------
// how far down the head the hair grows, by direction
function hairline(aphi, spec) {
  const r = spec.recede || 0, F = 57 - 18 * r, T = 66 - 30 * r, S = 93, B = 133, d = aphi * 180 / Math.PI;
  if (d < 40) return rad(lerp(F, T, sm(d / 40)));
  if (d < 86) return rad(lerp(T, S, sm((d - 40) / 46)));
  return rad(lerp(S, B, sm((d - 86) / 94)));
}
// the angle at which the scalp is at a given height
function thetaAtY(S, phi, y) { let lo = rad(15), hi = rad(150); for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (C.y + Math.cos(m) * sample(S.smooth, phi, m) > y) lo = m; else hi = m; } return (lo + hi) / 2; }
// a band lies on a tilted line round the head: high on the forehead, lower behind
const lineY = (phi, yF, yB) => lerp(yF, yB, (1 - Math.cos(phi)) / 2);

// ---------- strands ----------
let TEX = null;
function strandTextures() {
  if (TEX) return TEX;
  const make = fill => { const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), im = g.createImageData(N, N); fill(im.data, N); g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.premultiplyAlpha = false; return t; };
  const per = (x, n, s) => { const xi = Math.floor(x), f = x - xi, u = f * f * (3 - 2 * f); return lerp(hash(((xi % n) + n) % n, s), hash((((xi + 1) % n) + n) % n, s), u); };
  // straight hair: fine streaks that wander a little as they run, in clumps
  const straight = make((d, N) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const w = x + 2.2 * Math.sin(y / N * Math.PI * 2 * 2 + per(x / 20, 12, 7) * 6.283) + 1.1 * Math.sin(y / N * Math.PI * 2 * 5 + x * 0.21);
    const s1 = per(w, N, 1), s2 = per(w / 3.2, 80, 2), s3 = per(w / 11, 23, 3), s4 = per(y / 9, 28, 4 + Math.floor(per(w / 3.2, 80, 5) * 5));
    const a = clamp((0.26 * s1 + 0.40 * s2 + 0.26 * s3 + 0.08 * s4 - 0.5) * 2.5 + 0.5, 0, 1), b = 0.56 + 0.44 * clamp(0.55 * s1 + 0.45 * s2 + 0.15 * (s4 - 0.5), 0, 1), k = (x + y * N) * 4;
    d[k] = d[k + 1] = d[k + 2] = b * 255; d[k + 3] = a * 255; } });
  // curls: tight rounded tufts, lit on their upper side
  const curly = make((d, N) => { const pts = []; for (let i = 0; i < 320; i++) pts.push([hash(i, 11) * N, hash(i, 12) * N, 7 + hash(i, 13) * 6]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let best = 0, bdy = 0, sec = 0;
      for (const p of pts) { let dx = Math.abs(x - p[0]), dy = y - p[1]; if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy -= N; else if (dy < -N / 2) dy += N; const h = 1 - Math.hypot(dx, dy) / p[2]; if (h > best) { sec = best; best = h; bdy = dy / p[2]; } else if (h > sec) sec = h; }
      const ring = Math.sin(clamp(best, 0, 1) * 9.5) * 0.5 + 0.5, f = per(x / 2.1, 122, 21 + (y % 61)), a = clamp(0.35 + 0.75 * Math.pow(clamp(best, 0, 1), 0.6) + 0.12 * (f - 0.5), 0, 1), b = clamp(0.46 + 0.32 * clamp(best, 0, 1) + 0.16 * ring - 0.20 * bdy + 0.08 * (f - 0.5), 0.25, 1), k = (x + y * N) * 4;
      d[k] = d[k + 1] = d[k + 2] = b * 255; d[k + 3] = a * 255; } });
  return TEX = { straight, curly };
}
const MATS = new Map();
function hairMaterial(tex, rough) {
  const key = tex.uuid + rough; if (MATS.has(key)) return MATS.get(key);
  // uSway: how far hanging hair has swung, per metre it hangs, in the head's own space (set per player as each mesh is drawn)
  const U = { uSway: { value: new THREE.Vector3() } };
  const m = sunMask(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: rough, metalness: 0, side: THREE.DoubleSide, alphaToCoverage: true }), {
    key: 'hair3', uniforms: U,
    vertexPars: 'attribute float aCut; attribute vec3 aTan; attribute float aSwing; uniform vec3 uSway; varying float vCut; varying vec3 vHairT;', vertex: 'vCut = aCut; vHairT = normalize(normalMatrix * aTan);',
    preVertex: 'transformed += uSway * aSwing;',
    pars: 'varying float vCut; varying vec3 vHairT;',
    // strands fade out over a short range instead of stopping dead, and lie darker the deeper they are
    afterMap: 'float hcv = smoothstep(vCut - 0.10, vCut + 0.06, sampledDiffuseColor.a); if (hcv < 0.03) discard; diffuseColor.a = hcv; diffuseColor.rgb *= mix(0.55, 1.15, sampledDiffuseColor.a);',
    // the band of light that runs across hair, at right angles to the strands
    beforeOut: `#if NUM_DIR_LIGHTS > 0
      { vec3 hT = normalize(vHairT + normal * 0.12), hL = directionalLights[0].direction, hV = normalize(vViewPosition), hH = normalize(hL + hV);
        float hd = dot(hT, hH), hs = pow(max(0.0, 1.0 - hd * hd), 34.0), lit = clamp(dot(reflectedLight.directDiffuse, vec3(0.34)) / max(1e-4, dot(diffuseColor.rgb, vec3(0.34))), 0.0, 1.0);
        outgoingLight += (diffuseColor.rgb * 1.7 + vec3(0.006)) * hs * lit * 0.5; }
      #endif
      { float rimK = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0) * (0.45 + 0.55 * clamp(normal.y, 0.0, 1.0)); outgoingLight += uRimCol * rimK * (diffuseColor.rgb * 2.2 + vec3(0.01)); }`,
  });
  m.envMapIntensity = 0.35;                       // hair scatters the light it gets; it does not mirror the stadium
  m.userData.U = U;
  MATS.set(key, m); return m;
}

export function buildHair(person, spec, headwear) {
  const g = new THREE.Group(), head = person.meshes.find(m => m.userData.head) || person.meshes[0], S = scalpMap(person.headKit || person.M, { geometry: (person.headKit && person.headKit.geo) || head.geometry });
  const band = headwear && (headwear.type === 'headband' || headwear.type === 'bandana') ? headwear : null, cap = headwear && headwear.type === 'cap' ? headwear : null;
  const curly = spec.tex === 'curly', wavy = spec.tex === 'wavy', flat = (spec.recede || 0) > 0.5;
  const seed = (spec.top * 13.7 + spec.back * 3.1 + spec.sides * 7.3) % 17;
  // bands and caps sit a set distance below the crown of this head, whatever its size
  const top = C.y + sample(S.smooth, 0, 0), dTop = (top - 1.812) * 0.45;
  const bandY = band ? [1.757 + dTop - (band.low ? 0.012 : 0), 1.690 + dTop] : null, bandHalf = band ? cm(band.w || 5) / 2 : 0, capY = cap && cap.back ? [1.756 + dTop - (cap.drop || 0), 1.712 + dTop - (cap.drop || 0)] : [1.748 + dTop - ((cap && cap.drop) || 0), 1.700 + dTop - ((cap && cap.drop) || 0)];   /* (worn backwards, as Hewitt and Kyrgios wore it: the strap edge higher across the forehead, the peak's edge low over the back of the head) */
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), D = new THREE.Vector3();
  // a point at a distance off the scalp
  const onScalp = (phi, th, off, out, map = S.smooth) => dirOf(phi, th, out).multiplyScalar(sample(map, phi, th) + off).add(C);

  // ---- the hair: a sheet from crown to tips for each layer ----
  const Nu = curly ? 80 : 72, Nv = 18, Nk = 9, cols = Nu + 1, rows = Nv + 1 + Nk, layers = curly ? [[0.36, 0, 0.84], [0.62, 0.14, 1.0], [0.82, 0.28, 1.14], [1, 0.42, 1.28]] : [[0.36, 0, 0.90], [0.70, 0.24, 1.12], [1, 0.46, 1.32]];
  const per = cols * rows, n = per * layers.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), cut = new Float32Array(n), tan = new Float32Array(n * 3), swing = new Float32Array(n), idx = [];
  const base = new THREE.Color(spec.c), root = new THREE.Color(spec.c2 || spec.c), tmp = new THREE.Color();
  const repU = curly ? (spec.top > 6 ? 3 : 4) : 6, tile = curly ? (spec.top > 6 ? 0.19 : 0.145) : 0.30;
  layers.forEach(([f, cut0, bright], li) => {
    for (let i = 0; i < cols; i++) {
      const u = i / Nu, phi = (u - 0.5) * Math.PI * 2, aphi = Math.abs(phi);
      const front = sm(1 - aphi / rad(62)), backW = sm((aphi - rad(100)) / rad(60)), sideW = Math.max(0, 1 - front - backW);
      const earGap = spec.ears ? 1 : 1 - sm(1 - Math.abs(aphi - rad(80)) / rad(26));          // hair tucked behind an uncovered ear
      const tH = hairline(aphi, spec) + rad(2.4) * (noise(u * 31 + seed + li * 7.7, li) - 0.5) * (li ? 1.6 : 0.6);     // no hairline is a ruled line
      // how far the hair carries on past the hairline (metres): a fringe in front, lengths at the sides and back
      const fr = (spec.fringe || 0) * Math.min(spec.top, 9) * 0.0055 * (band || cap ? 0 : 1);
      const hasFringe = (spec.fringe || 0) > 0.15 && !band && !cap;
      // under a band the long side hair is tucked behind the temples: it falls from beside the ears, not in front of the face
      const tuck = band || cap ? sm((aphi - rad(66)) / rad(26)) : 1;
      const ext = Math.max(hasFringe ? 0.007 : (band || cap) ? 0.0015 * (1 - front) : 0.003, front * fr + sideW * tuck * Math.max(0, spec.sides - 3) * 0.008 * earGap + backW * Math.max(0, spec.back - 4) * 0.008) * (0.9 + 0.1 * f);
      const hangs = ext > 0.012 && front < 0.5;
      const bTh = band ? thetaAtY(S, phi, lineY(phi, bandY[0], bandY[1])) : 0, bW = band ? bandHalf / sample(S.smooth, phi, bTh) : 0;
      const cTh = cap ? thetaAtY(S, phi, lineY(phi, capY[0], capY[1])) : 0;
      let arc = 0, hang0 = null;
      for (let j = 0; j < rows; j++) {
        const k = li * per + i + j * cols, onHead = j <= Nv, v = Math.min(1, j / Nv), th = v * tH, h = onHead ? 0 : (j - Nv) / Nk;
        // how long the hair is here, and so how thick it lies
        const L = lerp(spec.top, front * spec.top + sideW * spec.sides + backW * spec.back, sm((v - 0.42) / 0.5));
        let t = curly ? Math.min(0.046, 0.004 + cm(L) * 0.60) : (L <= 6 ? 0.002 + cm(L) * 0.42 : lerp(0.0272, 0.018, sm((L - 6) / 8))) * (wavy ? 1.2 : 1);
        if (spec.up) t *= 1 + 0.5 * front * (1 - 0.5 * v);
        if (flat) t *= 0.5;
        if (spec.helmet) t = Math.max(t, 0.032);
        // hair starts thin at the hairline it is brushed back from
        if (!hasFringe) t *= lerp(1, spec.up ? 0.62 : 0.22, front * sm((v - 0.74) / 0.26));
        if (!hangs) t *= lerp(1, 0.3, (1 - front) * sm((v - 0.80) / 0.20));
        // pressed flat under a band, hidden under a cap
        let press = 1;
        if (band) press = 0.14 + 0.86 * sm((Math.abs(th - bTh) / bW - 0.9) / 1.3);
        if (cap) press = Math.min(press, sm((th - cTh) / rad(10)));
        const strand = noise(u * Nu * 0.6 + seed, v * 2.4 + li) - 0.5, lump = noise(u * 30 + seed + li * 3.1, v * 8 + seed) - 0.5;
        const bump = curly ? lump * 0.008 * clamp(L / 6, 0.5, 1.2) * (li ? 1 : 0.3) : (wavy ? lump * 0.008 + strand * 0.004 : strand * 0.003) * clamp(L / 5, 0.2, 1.3);
        const off = Math.max(0.0012, (t * f + bump * f) * press + 0.001);
        if (onHead) { onScalp(phi, th, off, P); if (j === Nv) hang0 = P.clone(); }
        else {
          // past the hairline: a fringe lies down the forehead; the rest leaves the head and hangs
          const s = ext * h;
          onScalp(phi, tH + s / 0.105, Math.max(0.003, off * (1 - 0.55 * h)), P, spec.ears ? S.raw : S.smooth);
          if (hangs) {
            const ox = Math.sin(phi), oz = Math.cos(phi), flip = 0, under = spec.helmet ? -0.016 : 0;
            const out = (band ? 0.5 : 1) * (wavy || curly ? 0.016 : 0.009) * Math.sin(Math.PI * h * 0.9) * f + (flip + under) * h * h + (wavy ? 0.007 : curly ? 0.010 : 0.002) * Math.sin(h * (wavy ? 7 : 9) + u * 46 + seed + li) * h;
            Q.set(hang0.x + ox * out, hang0.y - s * (1 - 0.10 * h), hang0.z + oz * out);
            // never inside the head or the neck
            D.copy(Q).sub(C); const r = D.length(), th2 = Math.acos(clamp(D.y / r, -1, 1)), ph2 = Math.atan2(D.x, D.z), need = (th2 < TMAX ? sample(S.raw, ph2, th2) : 0) + 0.004 + 0.012 * f;
            if (r < need) Q.copy(D.multiplyScalar(need / r)).add(C);
            const hr = Math.hypot(Q.x, Q.z + 0.012), neck = 0.066 + 0.010 * f; if (Q.y < 1.60 && hr < neck) { Q.x *= neck / hr; Q.z = (Q.z + 0.012) * neck / hr - 0.012; }
            Q.y = Math.max(Q.y, 1.497 + 0.01 * (1 - f));
            P.lerp(Q, 1 - front);
          }
        }
        pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z;
        swing[k] = !onHead && hangs ? ext * h : 0;                         // how far below the hairline this point hangs
        if (j > 0) arc += Math.hypot(P.x - pos[(k - cols) * 3], P.y - pos[(k - cols) * 3 + 1], P.z - pos[(k - cols) * 3 + 2]);
        uv[k * 2] = u * repU + li * 0.37 + (wavy ? 0.035 * Math.sin(arc * 60 + u * 30 + seed) : 0); uv[k * 2 + 1] = arc / tile + li * 0.23;
        // strands run out toward the tips, raggedly; under a cap there is nothing to see
        const soft = hasFringe ? 0.30 : 0.50, tip = onHead ? (ext < 0.012 ? sm((v - 0.70) / 0.30) * soft : 0) : (ext < 0.012 ? soft + (1 - soft) * h : sm((h - 0.35) / 0.65));
        const shaved = sm(1 - (L - 0.3) / 0.9) * sm((v - 0.3) / 0.3);          // clipped to the skin: the scalp's own stubble shows instead
        cut[k] = cap && onHead && th < cTh + (globalThis.__capCutOld ? -rad(3) : rad(globalThis.__capCutDeg ?? 2)) ? 2 : Math.min(1.01, cut0 + (0.90 - cut0) * tip * (li ? 1 : 0.85) + shaved * 1.01);
        const shade = bright * (0.86 + 0.28 * (noise(u * Nu * 1.3 + 3 + li, v * 3 + h * 2) - 0.5) + (curly ? 0.10 * lump : 0)) * (onHead ? 1 : 1 - 0.10 * h);
        tmp.copy(root).lerp(base, spec.c2 ? sm((v + h - 0.30) / 0.5) : 1).multiplyScalar(clamp(shade, 0.4, 1.3));
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      }
    }
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < Nu; i++) { const a = li * per + i + j * cols, b = a + 1, c = a + cols, d = c + 1; idx.push(a, c, b, b, c, d); }
  });
  // the way each strand runs, for the light along it
  for (let li = 0; li < layers.length; li++) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const k = li * per + i + j * cols, a = li * per + i + Math.max(0, j - 1) * cols, b = li * per + i + Math.min(rows - 1, j + 1) * cols; D.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]); if (D.lengthSq() < 1e-10) D.set(0, -1, 0); D.normalize(); tan[k * 3] = D.x; tan[k * 3 + 1] = D.y; tan[k * 3 + 2] = D.z; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aCut', new THREE.BufferAttribute(cut, 1)); geo.setAttribute('aTan', new THREE.BufferAttribute(tan, 3)); geo.setAttribute('aSwing', new THREE.BufferAttribute(swing, 1)); geo.setIndex(idx); geo.computeVertexNormals();
  // the seam at the back: both edges share one normal
  { const nr = geo.attributes.normal; for (let li = 0; li < layers.length; li++) for (let j = 0; j < rows; j++) { const a = li * per + j * cols, b = a + Nu; const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1; nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l); } }
  const T = strandTextures(), mesh = new THREE.Mesh(geo, hairMaterial(curly ? T.curly : T.straight, curly ? 0.78 : 0.56)); mesh.frustumCulled = false; g.add(mesh);
  // this player's swing, put into the shared material just before each of his hair meshes is drawn
  g.userData.sway = new THREE.Vector3();
  const swayIn = (r, sc, cam, gg, mt) => { if (mt.userData.U) { mt.userData.U.uSway.value.copy(g.userData.sway); mt.uniformsNeedUpdate = true; } };
  mesh.onBeforeRender = swayIn;

  // ---- locks: clumps of strands on top of the mass ----
  // Hair is not a surface: it is a great many clumps, each growing from a point on the scalp and
  // lying the way the cut sends it. A few hundred narrow strips, rooted inside the mass and coming
  // out of it toward their tips, break the outline the layers above leave smooth, and where the hair
  // is long they hang as locks instead of a sheet. Curls are short strips that turn as they go.
  {
    const rnd = (() => { let a = Math.floor(seed * 1e4) + 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const lp = [], lc = [], lu = [], lcut = [], ltan = [], lsw = [], li2 = [];
    const nrm = new THREE.Vector3(), tng = new THREE.Vector3(), sd = new THREE.Vector3(), prev = new THREE.Vector3(), cur = new THREE.Vector3(), tip = new THREE.Vector3();
    const NL = curly ? Math.round(560 + 40 * Math.min(10, spec.top)) : Math.round(260 + 34 * Math.min(14, Math.max(spec.top, spec.back * 0.8))), SEG = curly ? 6 : 8;
    const pts = [], hs = [], hang = [];
    for (let n = 0, tries = 0; n < NL && tries < NL * 6; tries++) {
      // a root anywhere the hair grows, evenly over the area of the scalp
      const phi = (rnd() - 0.5) * Math.PI * 2, aphi = Math.abs(phi), tH = hairline(aphi, spec), th0 = Math.acos(1 - rnd() * (1 - Math.cos(tH)));
      const front = sm(1 - aphi / rad(62)), backW = sm((aphi - rad(100)) / rad(60)), sideW = Math.max(0, 1 - front - backW);
      const v0 = th0 / tH, L = lerp(spec.top, front * spec.top + sideW * spec.sides + backW * spec.back, sm((v0 - 0.42) / 0.5));
      if (L < 1.2) continue;                                                      // clipped short: the stubble shows, not locks
      const bTh = band ? thetaAtY(S, phi, lineY(phi, bandY[0], bandY[1])) : 0, bW = band ? bandHalf / sample(S.smooth, phi, bTh) : 0;
      const cTh = cap ? thetaAtY(S, phi, lineY(phi, capY[0], capY[1])) : 0;
      // under the cap, all of it: a lock rooted just inside the cap's edge stands two centimetres off the scalp, the cap one,
      // and it came out through the crown as dark flecks on the cap above the peak
      if (cap && th0 < cTh + (globalThis.__capCutOld ? -rad(4) : rad(1))) continue;
      if (band && Math.abs(th0 - bTh) < bW * 1.1) continue;                      // under the band
      n++;
      // how thick the mass lies here, as the layers above have it
      let t = curly ? Math.min(0.046, 0.004 + cm(L) * 0.60) : (L <= 6 ? 0.002 + cm(L) * 0.42 : lerp(0.0272, 0.018, sm((L - 6) / 8))) * (wavy ? 1.2 : 1);
      if (spec.up) t *= 1 + 0.5 * front; if (flat) t *= 0.5; if (spec.helmet) t = Math.max(t, 0.032);
      const hasFringe = (spec.fringe || 0) > 0.15 && !band && !cap, fr = (spec.fringe || 0) * Math.min(spec.top, 9) * 0.0055 * (band || cap ? 0 : 1);
      const earGap = spec.ears ? 1 : 1 - sm(1 - Math.abs(aphi - rad(80)) / rad(26)), tuck = band || cap ? sm((aphi - rad(66)) / rad(26)) : 1;
      const ext = Math.max(0.003, front * fr + sideW * tuck * Math.max(0, spec.sides - 3) * 0.008 * earGap + backW * Math.max(0, spec.back - 4) * 0.008);
      const hangs = ext > 0.012 && front < 0.5 && aphi > rad(68);          // locks hang behind the temples; in front the cut ends at its line
      // the lock's length, and how it lies: down from the crown; brushed up and back at the front of an upswept cut
      let len = cm(L) * (0.7 + rnd() * 0.45) * (curly ? 0.75 : 1);
      const upFront = spec.up && front > 0.3 && th0 > tH * 0.45, dirT = upFront ? -1 : 1;
      const drift = (rnd() - 0.5) * 0.5 + (sideW * Math.sign(phi) * 0.25), off0 = t * (0.55 + rnd() * 0.45), lift = curly ? 0.004 + rnd() * 0.006 : 0.001 + rnd() * 0.0025 * Math.min(1, L / 5);
      const stopTh = band && th0 < bTh ? bTh - bW * 1.05 : tH + (hasFringe && front > 0.3 ? fr / 0.1 : 0.06 / Math.max(1, L));
      const w = (curly ? 0.009 : 0.011) * (0.75 + rnd() * 0.6) * (spec.top > 8 || spec.back > 8 ? 1.25 : 1);
      // walk it: on the scalp until it reaches its tip or the hairline, then (long hair) down
      let phiK = phi, thK = th0, arc = 0, hanging = false, curlA = rnd() * 6.28;
      pts.length = 0; hs.length = 0; hang.length = 0; let hangD = 0;
      onScalp(phiK, thK, off0, cur); pts.push(cur.clone()); hs.push(0); hang.push(0);
      const step = len / SEG, NS = SEG + (hangs ? Math.min(10, Math.ceil(ext * 1.1 / step)) : 0);
      for (let k = 1; k <= NS; k++) {
        const h = Math.min(1, k / SEG);
        if (!hanging) {
          const r = sample(S.smooth, phiK, thK) + off0;
          if (curly) { curlA += 1.15; thK += step * (0.55 + 0.5 * Math.cos(curlA)) / r; phiK += step * Math.sin(curlA) * 0.9 / (r * Math.max(0.3, Math.sin(thK))); }
          else { thK += dirT * step / r * Math.cos(drift * 0.6); phiK += step * Math.sin(drift) * 0.5 / (r * Math.max(0.3, Math.sin(thK))); }
          if (thK < 0.02) { thK = 0.02 - thK; phiK += Math.PI; }
          if (thK >= stopTh) {
            if (hangs && !band && !cap || (hangs && thK > (band ? bTh : cTh))) { hanging = true; thK = stopTh; }
            else if (thK > stopTh + 0.05) break;
          }
          const o = off0 + (curly ? lift * Math.sin(Math.PI * h) + 0.004 * Math.sin(curlA * 0.5) : lift * h * h) * (upFront ? 2.4 : 1);
          onScalp(phiK, thK, o, cur, spec.ears && thK > tH ? S.raw : S.smooth);
        } else {
          // free of the head: it falls, a little away from it, with a wave if the hair has one
          const ox = Math.sin(phiK), oz = Math.cos(phiK), sway = (wavy || curly ? 0.004 : 0.0015) * Math.sin(h * 9 + phi * 7);
          cur.set(prev.x + ox * (0.0018 + sway), prev.y - step * 0.97, prev.z + oz * (0.0018 + sway));
          D.copy(cur).sub(C); const rr = D.length(), th2 = Math.acos(clamp(D.y / rr, -1, 1)), ph2 = Math.atan2(D.x, D.z), need = (th2 < TMAX ? sample(S.raw, ph2, th2) : 0) + 0.006;
          if (rr < need) cur.copy(D.multiplyScalar(need / rr)).add(C);
          const hr = Math.hypot(cur.x, cur.z + 0.012), neck = 0.072; if (cur.y < 1.60 && hr < neck) { cur.x *= neck / hr; cur.z = (cur.z + 0.012) * neck / hr - 0.012; }
          cur.y = Math.max(cur.y, 1.50);
          if (arc > len + ext * 1.1) break;
        }
        const dd = cur.distanceTo(pts[pts.length - 1]); arc += dd; if (hanging) hangD += dd; prev.copy(cur); pts.push(cur.clone()); hs.push(h); hang.push(hangD);
        if (!hanging && arc >= len) break;
      }
      if (pts.length < 3) continue;
      // the strip: across the lock, lying along the scalp; narrower toward the tip
      const o = lp.length / 3, last = pts.length - 1, u0 = rnd() * 4, shade = (0.80 + 0.22 * rnd()) * (curly ? 1 + 0.1 * (rnd() - 0.5) : 1), wide = hanging ? 1.7 : 1;
      for (let k = 0; k <= last; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(last, k + 1)]; tng.subVectors(b, a).normalize();
        nrm.subVectors(pts[k], C).normalize(); sd.crossVectors(tng, nrm); if (sd.lengthSq() < 1e-8) sd.set(1, 0, 0); sd.normalize();
        const f = k / last, wk = w * wide * (1 - 0.6 * f * f) * (curly ? 0.9 + 0.2 * Math.sin(f * 3.14) : 1);
        // three across: the strands thin out toward both edges of a lock, so it has no edge to see
        for (const sgn of [-1, 0, 1]) {
          tip.copy(pts[k]).addScaledVector(sd, sgn * wk * 0.5).addScaledVector(nrm, curly ? 0 : -0.0012 * Math.abs(sgn) * (1 - f));
          lp.push(tip.x, tip.y, tip.z); lu.push(u0 + (sgn + 1) * 0.045 * wide, f * len / tile * 0.9 + u0);
          ltan.push(tng.x, tng.y, tng.z); lsw.push(hang[k]);
          lcut.push(Math.min(1.01, 0.16 + 0.74 * sm((f - 0.15) / 0.85) + (sgn ? 0.38 : 0)));
          tmp.copy(root).lerp(base, spec.c2 ? sm(f * 1.4 - 0.1) : 1).multiplyScalar(clamp(shade * (0.9 + 0.12 * f), 0.4, 1.3)); lc.push(tmp.r, tmp.g, tmp.b);
        }
        if (k < last) { const q = o + k * 3; li2.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q + 1, q + 4, q + 2, q + 2, q + 4, q + 5); }
      }
    }
    if (lp.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
      lg.setAttribute('aCut', new THREE.Float32BufferAttribute(lcut, 1)); lg.setAttribute('aTan', new THREE.Float32BufferAttribute(ltan, 3)); lg.setAttribute('aSwing', new THREE.Float32BufferAttribute(lsw, 1)); lg.setIndex(li2); lg.computeVertexNormals();
      // a lock's light comes from the head's side of it, not from which way the strip happens to face
      { const nr = lg.attributes.normal, ps = lg.attributes.position; for (let i = 0; i < nr.count; i++) { D.set(ps.getX(i) - C.x, ps.getY(i) - C.y, ps.getZ(i) - C.z).normalize(); nrm.set(nr.getX(i), nr.getY(i), nr.getZ(i)); if (nrm.dot(D) < 0) nrm.negate(); nrm.lerp(D, 0.55).normalize(); nr.setXYZ(i, nrm.x, nrm.y, nrm.z); } }
      const lm = new THREE.Mesh(lg, hairMaterial(curly ? T.curly : T.straight, curly ? 0.78 : 0.56)); lm.frustumCulled = false; lm.onBeforeRender = swayIn; g.add(lm);
    }
  }

  // ---- what is worn on it: one cloth mesh ----
  const cp = [], cc = [], ci = [], c1 = new THREE.Color(), put = (p, c) => { cp.push(p.x, p.y, p.z); cc.push(c.r, c.g, c.b); return cp.length / 3 - 1; };
  const strip = (N, R, at, colour) => { const o = cp.length / 3; for (let j = 0; j <= R; j++) for (let i = 0; i <= N; i++) { at(i / N, j / R, P); put(P, typeof colour === 'function' ? colour(i / N, j / R) : colour); } for (let j = 0; j < R; j++) for (let i = 0; i < N; i++) { const a = o + i + j * (N + 1), b = a + 1, c = a + N + 1, d = c + 1; ci.push(a, c, b, b, c, d); } };
  if (band) {
    const main = new THREE.Color(band.c), stripe = band.c2 ? new THREE.Color(band.c2) : null, lift = 0.0065 + (band.type === 'bandana' ? 0.0015 : 0) + (spec.top > 7 ? 0.002 : 0), sh = new THREE.Color();
    const shade = (c, b) => sh.copy(c).multiplyScalar(0.80 + 0.20 * Math.sin(b * Math.PI));
    strip(64, 6, (a, b, out) => { const phi = (a - 0.5) * Math.PI * 2, th = thetaAtY(S, phi, lineY(phi, bandY[0], bandY[1])), w = bandHalf / sample(S.smooth, phi, th); onScalp(phi, th + (b - 0.5) * 2 * w, lift + 0.0022 * Math.sin(b * Math.PI), out); }, (a, b) => shade(stripe && Math.abs(b - 0.5) < 0.18 ? stripe : main, b));
    if (band.type === 'bandana') {                                           // the knot and its two tails at the back
      const th = thetaAtY(S, Math.PI, bandY[1]); onScalp(Math.PI, th, lift + 0.008, Q); const K = Q.clone();
      strip(6, 4, (a, b, out) => { const al = a * Math.PI * 2, be = (b - 0.5) * Math.PI; out.set(K.x + Math.cos(al) * Math.cos(be) * 0.016, K.y + Math.sin(be) * 0.012, K.z + Math.sin(al) * Math.cos(be) * 0.011 - 0.004); }, main);
      for (const sx of [-1, 1]) strip(2, 5, (a, b, out) => out.set(K.x + sx * (0.006 + 0.020 * b) + (a - 0.5) * 0.026, K.y - 0.004 - 0.115 * b, K.z - 0.006 - 0.018 * Math.sin(b * 2.4) + (a - 0.5) * sx * 0.008), (a, b) => shade(main, 0.5 + 0.5 * a));
    }
  }
  if (cap) {
    const main = new THREE.Color(cap.c), under = main.clone().multiplyScalar(0.42), sh = new THREE.Color(), lineTh = phi => thetaAtY(S, phi, lineY(phi, capY[0], capY[1]));
    // the crown: six panels up to a button, standing a little proud of the head at the front
    strip(72, 10, (a, b, out) => { const phi = (a - 0.5) * Math.PI * 2, fw = sm(1 - (cap.back ? Math.PI - Math.abs(phi) : Math.abs(phi)) / rad(70)); onScalp(phi, lineTh(phi) * b, 0.010 + 0.006 * Math.sin(b * Math.PI) + 0.010 * fw * Math.sin(Math.min(1, b * 1.15) * Math.PI) * b + 0.004 * (1 - b), out); },
      (a, b) => { const seam = Math.abs(((a * 6 + 0.5) % 1) - 0.5) * 2; return sh.copy(main).multiplyScalar((0.90 + 0.10 * sm(seam / 0.10)) * (b > 0.93 ? 0.86 : 1)); });
    onScalp(0, 0, 0.017, Q); const top = Q.clone(); strip(8, 3, (a, b, out) => { const al = a * Math.PI * 2, be = b * Math.PI / 2; out.set(top.x + Math.cos(al) * Math.sin(be) * 0.009, top.y + Math.cos(be) * 0.005, top.z + Math.sin(al) * Math.sin(be) * 0.009); }, main);
    // the peak: a stiff curved plate out over the eyes, dark underneath
    for (const [dy, colour] of [[0, main], [-0.0025, under]]) strip(18, 6, (a, b, out) => { const phi = (cap.back ? Math.PI : 0) + (a - 0.5) * rad(132), e = Math.abs(a - 0.5) * 2; onScalp(phi, lineTh(phi), 0.010, out); const reach = 0.082 * b * Math.pow(Math.max(0, 1 - e * e), 0.55); out.z += cap.back ? -reach : reach; out.x += Math.sin(phi) * reach * 0.12; out.y += dy - (cap.back ? 0.32 : 0.21) * reach - 0.010 * e * e * b + 0.004 * b; }, colour);
  }
  if (cp.length) {
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); cg.setIndex(ci); cg.computeVertexNormals();
    const cl = new THREE.Mesh(cg, sunMask(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), { key: 'headwear' })); cl.castShadow = true; cl.frustumCulled = false; g.add(cl);
  }
  person.attachBind('Head', g);
  return g;
}
