// Rally Pro — a library head pushed toward one man's face. `warp` (from tools/face_shape.py, kept
// in facedata.js) holds landmarks on the head (`pts`, bind-space metres, as the head sits on the
// player's body) and how far each should move (`off`, metres). The movement between them is a
// Gaussian radial-basis field: weights are solved once so every landmark moves exactly by its
// offset (softened by `lambda`), the field dies away a few centimetres from the face, and normals
// are rebuilt so that UV seams stay closed. tools/face_shape.py applies the same field to check it.
export function warpHead(geo, warp, o = {}) {
  if (!warp || !warp.pts || !warp.pts.length) return geo;
  const P = warp.pts, D = warp.off, n = P.length, s = warp.sigma || 0.02, lam = warp.lambda == null ? 0.02 : warp.lambda;
  const r0 = warp.fade0 || 0.03, r1 = warp.fade1 || 0.055, k2 = 1 / (2 * s * s);
  // solve (K + lam I) W = D for the three components at once
  const A = new Float64Array(n * (n + 3));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2]; A[i * (n + 3) + j] = Math.exp(-(dx * dx + dy * dy + dz * dz) * k2) + (i === j ? lam : 0); }
    for (let c = 0; c < 3; c++) A[i * (n + 3) + n + c] = D[i][c];
  }
  const m = n + 3;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r * m + c]) > Math.abs(A[p * m + c])) p = r;
    if (p !== c) for (let k = 0; k < m; k++) { const t = A[c * m + k]; A[c * m + k] = A[p * m + k]; A[p * m + k] = t; }
    const piv = A[c * m + c] || 1e-12;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r * m + c] / piv; if (f === 0) continue; for (let k = c; k < m; k++) A[r * m + k] -= f * A[c * m + k]; }
  }
  const W = []; for (let i = 0; i < n; i++) { const piv = A[i * m + i] || 1e-12; W.push([A[i * m + n] / piv, A[i * m + n + 1] / piv, A[i * m + n + 2] / piv]); }
  // move every vertex by the field, faded out beyond the face
  const pos = geo.attributes.position, sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v); let ox = 0, oy = 0, oz = 0, dmin = 1e9;
    for (let i = 0; i < n; i++) {
      const dx = x - P[i][0], dy = y - P[i][1], dz = z - P[i][2], d2 = dx * dx + dy * dy + dz * dz; if (d2 < dmin) dmin = d2;
      const g = Math.exp(-d2 * k2); ox += g * W[i][0]; oy += g * W[i][1]; oz += g * W[i][2];
    }
    const f = 1 - sm((Math.sqrt(dmin) - r0) / (r1 - r0));
    if (f > 0) pos.setXYZ(v, x + ox * f, y + oy * f, z + oz * f);
  }
  pos.needsUpdate = true;
  if (o.normals !== false) smoothNormals(geo);
  geo.computeBoundingSphere && geo.computeBoundingSphere();
  return geo;
}
// Normals from the faces around each point, shared by every vertex at the same place (a UV seam
// splits one point of the surface into several vertices; each would otherwise light differently).
export function smoothNormals(geo) {
  const pos = geo.attributes.position, idx = geo.index, nrm = geo.attributes.normal, N = new Float32Array(pos.count * 3);
  const key = new Map(), id = new Int32Array(pos.count);
  for (let v = 0; v < pos.count; v++) { const k = Math.round(pos.getX(v) * 1e5) + ',' + Math.round(pos.getY(v) * 1e5) + ',' + Math.round(pos.getZ(v) * 1e5); if (!key.has(k)) key.set(k, key.size); id[v] = key.get(k); }
  const acc = new Float64Array(key.size * 3), cnt = idx ? idx.count : pos.count;
  for (let t = 0; t < cnt; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a), e1x = pos.getX(b) - ax, e1y = pos.getY(b) - ay, e1z = pos.getZ(b) - az, e2x = pos.getX(c) - ax, e2y = pos.getY(c) - ay, e2z = pos.getZ(c) - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { const k = id[v] * 3; acc[k] += nx; acc[k + 1] += ny; acc[k + 2] += nz; }
  }
  for (let v = 0; v < pos.count; v++) { const k = id[v] * 3, l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]) || 1; N[v * 3] = acc[k] / l; N[v * 3 + 1] = acc[k + 1] / l; N[v * 3 + 2] = acc[k + 2] / l; }
  if (nrm) { nrm.array.set(N); nrm.needsUpdate = true; } else geo.setAttribute('normal', new pos.constructor(N, 3));     // pos.constructor is BufferAttribute
  return geo;
}
