// Rally Pro — lines of sight through the stadium, quick enough to ask every frame.
// The broadcast camera checks that nothing of the stadium stands between it and the court (game.js, the crane). Asked of three.js's
// raycaster, every sight line tested every triangle of the merged stands and every card of the crowd: 30 to 60 ms in Firefox, ten
// times a second. Here every fixed triangle and every crowd card is filed once, in the stadium's own frame (it turns round at a change
// of ends), under the 2 m squares of ground it covers, and a sight line tests only what is filed under the squares it passes over.
// The answers are the raycaster's own: the same triangles, the same faces counted (a material's side), a crowd card the camera has
// cleared out of the way (its matrix zeroed, game.js clearCrowd) not counted, the object's own `visible` honoured. What moves (ball
// kids, line judges, their shadows, the balls they carry) is still asked of the raycaster: it is little.
import * as THREE from 'three';

export class SightGrid {
  // matrixAt(o, i, M): where instance i of o stands when it is not cleared away (default: its matrix now)
  constructor(root, matrixAt) {
    root.updateMatrixWorld(true);
    this.root = root; this.objs = []; this.live = [];
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), MI = new THREE.Matrix4(), IM = new THREE.Matrix4(), v = new THREE.Vector3();
    const P = [], ref = [], cull = [], pad = [];
    const isLive = o => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.live) return true; return false; };
    root.traverse(o => {
      if (o.isPoints) return;                                   // (the crane never counted a hit on points)
      if (!o.isMesh && !o.isLine && !o.isSprite) return;
      if (o.isSkinnedMesh || o.isLine || o.isSprite || isLive(o) || o.matrixAutoUpdate || o.morphTargetInfluences) { this.live.push(o); return; }
      const ge = o.geometry, pos = ge && ge.attributes.position; if (!pos) return;
      const oi = this.objs.length; this.objs.push(o);
      const idx = ge.index, mats = Array.isArray(o.material) ? o.material : null;
      const groups = mats ? ge.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
      const tri = (mat, inst, flip) => {
        for (const gr of groups) {
          const m = mats ? mats[gr.materialIndex] : o.material; if (!m) continue;
          const side = m.side, end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
          for (let s = gr.start; s + 2 < end + 0; s += 3) {
            const q = [];
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(s + k) : s + k).applyMatrix4(mat); q.push(v.x, v.y, v.z); }
            // three tests a back-side material's triangle with its corners reversed and back faces culled; a mirrored matrix
            // reverses the winding seen here against the one it tests in the object's own frame
            let sw = flip; if (side === THREE.BackSide) sw = !sw;
            if (sw) P.push(q[6], q[7], q[8], q[3], q[4], q[5], q[0], q[1], q[2]); else P.push(...q);
            ref.push(oi, inst); cull.push(side === THREE.DoubleSide ? 0 : 1); pad.push(inst >= 0 ? 1 : 0);
          }
        }
      };
      M.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) {
        const n = o.instanceMatrix.count;
        for (let i = 0; i < n; i++) { if (matrixAt) matrixAt(o, i, IM); else o.getMatrixAt(i, IM); MI.multiplyMatrices(M, IM); tri(MI, i, MI.determinant() < 0); }
      } else tri(M, -1, M.determinant() < 0);
    });
    const T = this.T = new Float32Array(P), nT = T.length / 9;
    this.ref = new Int32Array(ref); this.cull = new Uint8Array(cull); this.stamp = new Uint32Array(nT); this.q = 0;
    // the squares: bounds of everything, 2 m a side
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) { const x = T[t * 9 + k * 3], z = T[t * 9 + k * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!nT) { x0 = z0 = -1; x1 = z1 = 1; }
    const C = this.C = 2; this.x0 = x0 - 2; this.z0 = z0 - 2; this.nx = Math.ceil((x1 - x0 + 4) / C) + 1; this.nz = Math.ceil((z1 - z0 + 4) / C) + 1;
    const nx = this.nx, nz = this.nz, cnt = new Int32Array(nx * nz + 1);
    const span = (t, f) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let k = 0; k < 3; k++) { const x = T[t * 9 + k * 3], z = T[t * 9 + k * 3 + 2]; a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
      const p = pad[t] ? 0.5 : 0.01, i0 = Math.max(0, Math.floor((a - p - this.x0) / C)), i1 = Math.min(nx - 1, Math.floor((b + p - this.x0) / C)), j0 = Math.max(0, Math.floor((c - p - this.z0) / C)), j1 = Math.min(nz - 1, Math.floor((d + p - this.z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * nx + i); };
    for (let t = 0; t < nT; t++) span(t, c => cnt[c + 1]++);
    for (let c = 0; c < nx * nz; c++) cnt[c + 1] += cnt[c];
    const fill = cnt.slice(0, nx * nz), list = new Int32Array(cnt[nx * nz]);
    for (let t = 0; t < nT; t++) span(t, c => { list[fill[c]++] = t; });
    this.start = cnt; this.list = list; this.inv = new THREE.Matrix4(); this._o = new THREE.Vector3(); this._d = new THREE.Vector3();
    this._rc = new THREE.Raycaster();
  }
  // Is anything between o (world) and the point `far` metres along the unit direction d? The raycaster's question, with near 0.
  blocked(o, d, far) {
    this.root.updateWorldMatrix(true, false); this.inv.copy(this.root.matrixWorld).invert();
    const O = this._o.copy(o).applyMatrix4(this.inv), D = this._d.copy(d).transformDirection(this.inv);
    const T = this.T, ref = this.ref, cull = this.cull, st = this.stamp, objs = this.objs, q = ++this.q, C = this.C, nx = this.nx, nz = this.nz;
    const ox = O.x, oy = O.y, oz = O.z, dx = D.x, dy = D.y, dz = D.z;
    // the squares under the line, in order (a 2D digital differential analyser)
    let cx = (ox - this.x0) / C, cz = (oz - this.z0) / C; const ex = cx + dx * far / C, ez = cz + dz * far / C;
    let i = Math.floor(cx), j = Math.floor(cz); const i1 = Math.floor(ex), j1 = Math.floor(ez), si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(C / (dx)) : Infinity, tdz = dz !== 0 ? Math.abs(C / (dz)) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? i + 1 - cx : cx - i) * C) / Math.abs(dx) : Infinity, tmz = dz !== 0 ? ((dz > 0 ? j + 1 - cz : cz - j) * C) / Math.abs(dz) : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      if (i >= 0 && j >= 0 && i < nx && j < nz) {
        const c = j * nx + i;
        for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) {
          const t = this.list[k]; if (st[t] === q) continue; st[t] = q;
          const b = t * 9, ax = T[b], ay = T[b + 1], az = T[b + 2];
          const e1x = T[b + 3] - ax, e1y = T[b + 4] - ay, e1z = T[b + 5] - az, e2x = T[b + 6] - ax, e2y = T[b + 7] - ay, e2z = T[b + 8] - az;
          const nx_ = e1y * e2z - e1z * e2y, ny_ = e1z * e2x - e1x * e2z, nz_ = e1x * e2y - e1y * e2x;
          let DdN = dx * nx_ + dy * ny_ + dz * nz_, sg;
          if (DdN > 0) { if (cull[t]) continue; sg = 1; } else if (DdN < 0) { sg = -1; DdN = -DdN; } else continue;
          const qx = ox - ax, qy = oy - ay, qz = oz - az;
          const a1 = sg * (dx * (qy * e2z - qz * e2y) + dy * (qz * e2x - qx * e2z) + dz * (qx * e2y - qy * e2x)); if (a1 < 0) continue;
          const a2 = sg * (dx * (e1y * qz - e1z * qy) + dy * (e1z * qx - e1x * qz) + dz * (e1x * qy - e1y * qx)); if (a2 < 0) continue;
          if (a1 + a2 > DdN) continue;
          const QdN = -sg * (qx * nx_ + qy * ny_ + qz * nz_); if (QdN < 0) continue;
          const dist = QdN / DdN; if (dist > far) continue;
          const o2 = objs[ref[t * 2]]; if (!o2.visible) continue;
          const ii = ref[t * 2 + 1];
          if (ii >= 0) { if (ii >= o2.count) continue; const a = o2.instanceMatrix.array, m0 = ii * 16; if (a[m0] === 0 && a[m0 + 5] === 0 && a[m0 + 10] === 0) continue; }
          return true;
        }
      }
      if (i === i1 && j === j1) break;
      if (tmx < tmz) { if (tmx > far + C) break; tmx += tdx; i += si; } else { if (tmz > far + C) break; tmz += tdz; j += sj; }
    }
    // what moves, as before (looked for again now and then: a ball kid's spare ball is added to the stadium after it is filed)
    const now = performance.now();
    if (!(now - this.liveT < 250)) { this.liveT = now; const inGrid = this.inGrid || (this.inGrid = new Set(this.objs)); this.live = []; this.root.traverse(x => { if ((x.isMesh || x.isLine || x.isSprite) && !inGrid.has(x)) this.live.push(x); }); }
    if (this.live.length) { const rc = this._rc; rc.set(o, d); rc.near = 0; rc.far = far; if (rc.intersectObjects(this.live, false).find(x => x.object.visible && !x.object.isPoints)) return true; }
    return false;
  }
}
