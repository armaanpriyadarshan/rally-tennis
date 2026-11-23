// Rally Pro — the venue. A stadium is generated from a short spec: footprint, tiers,
// roof, colours, time of day. Sun and shade inside the bowl are computed analytically in
// every lit material (see sunMask), so the shadow line that crosses a real centre court in
// the afternoon is exact and soft-edged without a stadium-sized shadow map.
import * as THREE from 'three';
import { WEATHER, skyLight, makeSkyDome } from './skies.js';
import { COURT, netHeightAt } from './physics.js';
import * as TX from './textures.js';
import { crowdCards, poseSeated, poseStanding } from './crowd.js';
import { Person } from './people.js';
import { buildHair } from './hair.js';
import { KID_HEADS } from './looks.js';
import { buildLandmarks } from './landmarks.js';
import { Staff, insideCourt } from './staff.js';

// ---------- shared sun/shade term ----------
export const ARENA_U = {
  uArenaOpen: { value: new THREE.Vector4(30, 40, 8, 30) },   // opening half-x, half-z, corner radius, height
  uArenaSun: { value: new THREE.Vector3(0.3, 0.8, 0.5) },    // unit vector toward the sun, arena space
  uArenaOn: { value: 0 },
  uArenaFlip: { value: 1 },                                  // -1 after the players change ends
  uArenaFloor: { value: new THREE.Vector4(17, 27, 5, 1.1) }, // court floor half-x, half-z, corner radius; wall height
  uArenaAO: { value: 1 },
  uStandDim: { value: 1 },
  uPool: { value: 0 },                                       // under floodlights: how much the light falls off beyond the court                                   // how much of the court's light reaches the seats (floodlights are aimed at the court)
  uRimCol: { value: new THREE.Color(0, 0, 0) },              // edge light on the players
};
const SUN_GLSL = `
uniform vec4 uArenaOpen; uniform vec3 uArenaSun; uniform float uArenaOn; uniform float uArenaFlip;
uniform vec4 uArenaFloor; uniform float uArenaAO, uStandDim, uPool; uniform vec3 uRimCol;
varying vec3 vArenaW;
float arenaStand() {
  vec2 d = abs(vArenaW.xz) - (uArenaFloor.xy - uArenaFloor.z);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uArenaFloor.z;
  vec2 dc = abs(vArenaW.xz) - vec2(5.5, 11.9); float dcourt = length(max(dc, 0.0));
  float pool = mix(1.0, 0.62, smoothstep(1.0, 9.0, dcourt) * uPool);
  return pool * mix(1.0, uStandDim, smoothstep(0.2, 3.0, sd) * smoothstep(uArenaFloor.w, uArenaFloor.w + 1.5, vArenaW.y));
}

// How much of the sky a point can see. Where the floor meets the wall each hides half the sky
// from the other; under the lip of the stands and deep in the seating bowl there is less still.
float arenaAO() {
  vec3 p = vArenaW;
  vec2 d = abs(p.xz) - (uArenaFloor.xy - uArenaFloor.z);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uArenaFloor.z;      // < 0 on the court floor, 0 at the wall
  float nearWall = 1.0 - smoothstep(0.0, 2.0, -sd);                              // 1 at the foot of the wall
  float low = 1.0 - smoothstep(0.0, 1.3, p.y);                                   // 1 at floor level
  float ao = 1.0 - 0.5 * nearWall * low * step(sd, 0.25);
  // in the stands: rows shade each other, and the tier above shades the back of the one below
  float inStands = smoothstep(0.3, 1.2, sd);
  ao *= 1.0 - 0.22 * inStands;
  return mix(1.0, ao, uArenaAO);
}
float arenaSun() {
  if (uArenaOn < 0.5) return 1.0;
  vec3 p = vec3(vArenaW.x * uArenaFlip, vArenaW.y, vArenaW.z * uArenaFlip);
  float dy = uArenaOpen.w - p.y;
  if (dy <= 0.0) return 1.0;
  vec2 q = p.xz + uArenaSun.xz * (dy / max(uArenaSun.y, 0.03));
  vec2 d = abs(q) - (uArenaOpen.xy - uArenaOpen.z);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uArenaOpen.z;
  float pen = 0.04 + dy * 0.011 / max(uArenaSun.y, 0.12);    // the sun is half a degree wide
  return 1.0 - smoothstep(-pen, pen, sd);
}`;
let _dirPatched = null;
function dirChunk() {
  if (_dirPatched) return _dirPatched;
  const src = THREE.ShaderChunk.lights_fragment_begin, key = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (!src.includes(key)) console.warn('sunMask: lighting chunk changed, arena shade disabled');
  _dirPatched = src.replace(key, key + '\n\t\t#if UNROLLED_LOOP_INDEX == 0\n\t\tdirectLight.color *= arenaSun();\n\t\t#endif\n\t\tdirectLight.color *= arenaStand();');
  return _dirPatched;
}
// Give a lit material the arena's sun/shade term. `extra` lets the ground add its grain.
export function sunMask(mat, extra) {
  const tag = 'arena' + (extra ? ':' + extra.key : '');
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, ARENA_U, extra ? extra.uniforms : null);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArenaW;')
      .replace('#include <project_vertex>', (extra && extra.preVertex ? extra.preVertex + '\n' : '') + `#include <project_vertex>
        { vec4 aw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          aw = instanceMatrix * aw;
          #endif
          vArenaW = (modelMatrix * aw).xyz; }` + (extra && extra.vertex ? extra.vertex : ''));
    if (extra && extra.vertexPars) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + extra.vertexPars);
    // (a move made in the mesh's own rest shape, before the skeleton poses it)
    if (extra && extra.bindVertex) sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', extra.bindVertex + '\n#include <skinning_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SUN_GLSL + (extra && extra.pars ? extra.pars : ''))
      .replace('#include <lights_fragment_begin>', dirChunk())
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n\t{ float aAO = arenaAO(); aAO *= mix(1.0, arenaStand(), 0.8); reflectedLight.indirectDiffuse *= aAO; reflectedLight.indirectSpecular *= aAO; }');
    if (extra && extra.afterMap) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + extra.afterMap);
    if (extra && extra.rim) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '{ float rimK = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * (0.45 + 0.55 * clamp(normal.y, 0.0, 1.0)); outgoingLight += uRimCol * rimK; }\n#include <opaque_fragment>');
    if (extra && extra.beforeOut) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', extra.beforeOut + '\n#include <opaque_fragment>');
    if (extra && extra.afterRough) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + extra.afterRough);
  };
  mat.customProgramCacheKey = () => tag;
  return mat;
}

// ---------- footprint ----------
// A rounded rectangle grown outward by d. Samples line up across different d, so two
// rings can be stitched into a band of seats.
function ring(F, d, y) {
  const { hx, hz, rc, nx, nz, nc } = F, pts = [];
  const sx = hx - rc, sz = hz - rc, R = rc + d;
  const push = (x, z, ax, az) => pts.push({ x, y, z, nx: ax, nz: az });
  for (let i = 0; i < nz; i++) push(hx + d, -sz + 2 * sz * i / nz, 1, 0);
  for (let i = 0; i < nc; i++) { const a = Math.PI / 2 * i / nc; push(sx + Math.cos(a) * R, sz + Math.sin(a) * R, Math.cos(a), Math.sin(a)); }
  for (let i = 0; i < nx; i++) push(sx - 2 * sx * i / nx, hz + d, 0, 1);
  for (let i = 0; i < nc; i++) { const a = Math.PI / 2 + Math.PI / 2 * i / nc; push(-sx + Math.cos(a) * R, sz + Math.sin(a) * R, Math.cos(a), Math.sin(a)); }
  for (let i = 0; i < nz; i++) push(-hx - d, sz - 2 * sz * i / nz, -1, 0);
  for (let i = 0; i < nc; i++) { const a = Math.PI + Math.PI / 2 * i / nc; push(-sx + Math.cos(a) * R, -sz + Math.sin(a) * R, Math.cos(a), Math.sin(a)); }
  for (let i = 0; i < nx; i++) push(-sx + 2 * sx * i / nx, -hz - d, 0, -1);
  for (let i = 0; i < nc; i++) { const a = Math.PI * 1.5 + Math.PI / 2 * i / nc; push(sx + Math.cos(a) * R, -sz + Math.sin(a) * R, Math.cos(a), Math.sin(a)); }
  let s = 0; pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = s; }
  pts.len = s + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  return pts;
}
// Stitch two rings into a closed band. u runs around the bowl in metres/uScale, v across the band.
function band(A, B, uScale, vLen, flip) {
  const n = A.length, pos = [], uv = [], idx = [], nor = [];
  for (let i = 0; i <= n; i++) {
    const a = A[i % n], b = B[i % n], u = (i < n ? (a.s + b.s) / 2 : (A.len + B.len) / 2) / uScale;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z); uv.push(u, 0, u, vLen);
    // normal: perpendicular to the band, facing the court
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, horiz = Math.hypot(dx, dz);
    let nxn, nyn, nzn;
    if (horiz < 1e-4) { nxn = -a.nx; nyn = 0; nzn = -a.nz; }
    else { const L = Math.hypot(horiz, dy); nxn = -(dx / horiz) * (dy / L); nzn = -(dz / horiz) * (dy / L); nyn = horiz / L; if (dy < 0) { nxn = -nxn; nzn = -nzn; nyn = -nyn; } }
    if (flip) { nxn = -nxn; nyn = -nyn; nzn = -nzn; }
    nor.push(nxn, nyn, nzn, nxn, nyn, nzn);
  }
  // wound so the face toward the court is the front
  for (let i = 0; i < n; i++) { const k = i * 2; if (flip) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Stairways run up through the seats on lines square to the court, one every block. `aisles`
// is { base, L, w }: the ring at the wall (its arc length places the stairs), the length of a
// block and the width of a stair. Where along segment i they fall, as [t0, t1] pairs:
function aisleCuts(aisles, A, i) {
  const base = aisles.base, n = base.length, s0 = base[i].s, s1 = i + 1 < n ? base[i + 1].s : base.len, span = Math.max(1e-6, s1 - s0);
  const a = A[i], b = A[(i + 1) % n], here = Math.hypot(b.x - a.x, b.z - a.z), w = aisles.w * Math.min(1, span / Math.max(1e-6, here)), out = [];
  for (let k = Math.floor((s0 - w) / aisles.L - 0.5); k <= Math.ceil((s1 + w) / aisles.L - 0.5); k++) {
    const c = (k + 0.5) * aisles.L, t0 = Math.max(0, (c - w / 2 - s0) / span), t1 = Math.min(1, (c + w / 2 - s0) / span);
    if (t1 > t0 + 1e-4) out.push([t0, t1]);
  }
  return out;
}
// is a point `t` along segment `seg` of the ring on a stairway?
function onAisle(aisles, A, seg, t) { for (const [a, b] of aisleCuts(aisles, A, seg)) if (t > a - 0.02 && t < b + 0.02) return true; return false; }
// the band between two rings, either without its stairways (`stairs` false) or only them
function bandPart(A, B, uScale, vLen, aisles, stairs) {
  const n = A.length, pos = [], uv = [], idx = [], nor = [];
  const quad = (i, t0, t1) => {
    const a0 = A[i], a1 = A[(i + 1) % n], b0 = B[i], b1 = B[(i + 1) % n], sa0 = a0.s, sa1 = i + 1 < n ? a1.s : A.len, sb0 = b0.s, sb1 = i + 1 < n ? b1.s : B.len, k = pos.length / 3;
    for (const t of [t0, t1]) {
      const ax = a0.x + (a1.x - a0.x) * t, ay = a0.y + (a1.y - a0.y) * t, az = a0.z + (a1.z - a0.z) * t, bx = b0.x + (b1.x - b0.x) * t, by = b0.y + (b1.y - b0.y) * t, bz = b0.z + (b1.z - b0.z) * t;
      const u = ((sa0 + (sa1 - sa0) * t) + (sb0 + (sb1 - sb0) * t)) / 2 / uScale;
      pos.push(ax, ay, az, bx, by, bz); uv.push(u, 0, u, vLen);
      const dx = bx - ax, dy = by - ay, dz = bz - az, horiz = Math.hypot(dx, dz); let nxn, nyn, nzn;
      if (horiz < 1e-4) { nxn = -(a0.nx + (a1.nx - a0.nx) * t); nyn = 0; nzn = -(a0.nz + (a1.nz - a0.nz) * t); }
      else { const L = Math.hypot(horiz, dy); nxn = -(dx / horiz) * (dy / L); nzn = -(dz / horiz) * (dy / L); nyn = horiz / L; if (dy < 0) { nxn = -nxn; nzn = -nzn; nyn = -nyn; } }
      nor.push(nxn, nyn, nzn, nxn, nyn, nzn);
    }
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  };
  for (let i = 0; i < n; i++) {
    const cuts = aisleCuts(aisles, A, i);
    if (stairs) { for (const [a, b] of cuts) quad(i, a, b); continue; }
    let t = 0; for (const [a, b] of cuts) { if (a > t + 1e-4) quad(i, t, a); t = b; } if (t < 1 - 1e-4) quad(i, t, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

const std = o => new THREE.MeshStandardMaterial(o);

// Cut a region out of what is already built (a stand that a venue replaces with something of its
// own): every triangle whose centre is inside `pred` goes, and every instance standing in it.
function carve(objs, pred) {
  const c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), M = new THREE.Matrix4(), dead = [];
  for (const top of objs) top.traverse(o => {
    if (o.isInstancedMesh) {
      let k = 0;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M); c.setFromMatrixPosition(M).applyMatrix4(o.matrixWorld); if (pred(c.x, c.y, c.z)) continue; if (k !== i) o.setMatrixAt(k, M); k++; }
      if (k !== o.count) { o.count = k; o.instanceMatrix.needsUpdate = true; }
      return;
    }
    if (!o.isMesh || !o.geometry.index) return;
    const g = o.geometry, p = g.attributes.position, I = g.index.array, keep = [];
    for (let i = 0; i < I.length; i += 3) {
      c.fromBufferAttribute(p, I[i]); a.fromBufferAttribute(p, I[i + 1]); b.fromBufferAttribute(p, I[i + 2]); c.add(a).add(b).multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld);
      if (!pred(c.x, c.y, c.z)) keep.push(I[i], I[i + 1], I[i + 2]);
    }
    if (keep.length === I.length) return;
    if (!keep.length) { dead.push(o); return; }
    g.setIndex(keep);
  });
  for (const o of dead) { o.parent.remove(o); o.geometry.dispose(); }
}

// ---------- the build ----------
export function buildArena(spec, opt = {}) {
  const q = opt.quality == null ? 2 : opt.quality;          // 0 low … 3 ultra
  const root = new THREE.Group(); root.name = 'arena';
  const seed = spec.seed || 7, rnd = TX.rng32(seed);
  const hx = COURT.halfWD + spec.side, hz = COURT.halfLen + spec.back;
  const F = { hx, hz, rc: spec.corner == null ? 5 : spec.corner, nx: 10, nz: 18, nc: spec.cornerSeg || 8 };
  const W0 = WEATHER[spec.weather] || WEATHER.clear;
  const night = !!(W0.night || W0.indoor || spec.indoor);
  const lit = m => sunMask(m);
  const disposables = [];
  const A = { root, spec, bounds: { x: hx - 0.7, z: hz - 0.9, pz: hz - Math.max(0.9, ((spec.wallBackH || spec.wallH || 1.15) - 0.85) + 0.45), hx, hz, rc: F.rc, nc: F.nc },   /* (players kept far enough from a tall back wall that the broadcast camera, craned up, still sees them over it) */ hx, hz, F, uniforms: ARENA_U, night };

  // ----- floor -----
  const photo = opt.photo || {};
  const ct = TX.courtTextures({ surface: spec.surface, inner: spec.inner, outer: spec.outer, stripe: spec.stripe, wear: spec.wear, earth: spec.earth }, hx * 2, hz * 2, seed, photo.court);
  ct.detailN.repeat.set(hx * 2 / ct.tile, hz * 2 / ct.tile);
  const ns = ct.nScale || 0.55;
  const floorMat = std({ map: ct.macro, normalMap: ct.detailN, normalScale: new THREE.Vector2(ns, ns), roughness: ct.rough, metalness: 0 });
  if (ct.roughMap) { ct.roughMap.repeat.set(hx * 2 / ct.tile, hz * 2 / ct.tile); floorMat.roughnessMap = ct.roughMap; }
  sunMask(floorMat, {
    key: 'floor' + (ct.photo ? 'p' + spec.surface : ''), uniforms: { uDetail: { value: ct.detail }, uDetailTile: { value: ct.tile } },
    pars: 'uniform sampler2D uDetail; uniform float uDetailTile;',
    // two scales of the same grain, the second rotated, so the repeat never lines up
    afterMap: ct.photo
      ? `vec3 fdt = texture2D(uDetail, vArenaW.xz / uDetailTile).rgb; vec2 fq = vec2(vArenaW.x * 0.8 + vArenaW.z * 0.6, vArenaW.z * 0.8 - vArenaW.x * 0.6); vec3 fdt2 = texture2D(uDetail, fq / (uDetailTile * 3.7) + 0.37).rgb; diffuseColor.rgb *= clamp(1.0 + ((fdt.r - 0.5) * 0.7 + (fdt2.r - 0.5) * 0.5) * 2.0 * ${ (ct.gain || 1).toFixed(2) }, 0.6, 1.45);`
      : 'vec3 fdt = texture2D(uDetail, vArenaW.xz / uDetailTile).rgb; vec3 fdt2 = texture2D(uDetail, vArenaW.xz / (uDetailTile * 0.19)).rgb; diffuseColor.rgb *= 0.925 + 0.05 * fdt.r + 0.10 * fdt2.r;',
    afterRough: ct.photo ? '' : 'roughnessFactor = clamp(roughnessFactor + (fdt2.r - 0.5) * 0.18, 0.05, 1.0);',
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2, 1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  A.floor = floor; A.floorMat = floorMat;

  // ----- lines -----
  {
    const lt = TX.lineTexture(spec.surface, seed + 20);
    const pos = [], uv = [], idx = []; let n = 0;
    const quad = (x0, z0, x1, z1) => {            // axis-aligned rectangle on the ground
      const long = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = long ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const y = 0.004;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      if (long) uv.push(0, 0, len / 2, 0, len / 2, 1, 0, 1); else uv.push(0, 0, 0, 1, len / 2, 1, len / 2, 0);
      idx.push(n, n + 2, n + 1, n, n + 3, n + 2); n += 4;
    };
    const w = COURT.line / 2, bw = COURT.baseLine, HL = COURT.halfLen, HW = COURT.halfW, HD = COURT.halfWD;
    for (const s of [-1, 1]) {
      quad(-HD, s * HL - (s > 0 ? bw : 0), HD, s * HL + (s > 0 ? 0 : bw));                 // baseline, drawn inside the court
      quad(-HW, s * COURT.svc - w, HW, s * COURT.svc + w);                                 // service line
      quad(-w, s * (HL - (s > 0 ? 0.1 : 0)) - (s > 0 ? 0.1 : 0), w, s * HL - (s > 0 ? 0.1 : -0.2)); // centre mark
    }
    for (const s of [-1, 1]) { quad(s * HW - w, -HL, s * HW + w, HL); quad(s * HD - (s > 0 ? COURT.line : 0), -HL, s * HD + (s > 0 ? 0 : COURT.line), HL); }
    quad(-w, -COURT.svc, w, COURT.svc);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const lm = lit(std({ map: lt, color: spec.lines || '#ffffff', roughness: spec.surface === 'clay' ? 0.6 : 0.8, transparent: spec.surface === 'grass', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const lines = new THREE.Mesh(g, lm); lines.receiveShadow = true; lines.renderOrder = 1; root.add(lines);
  }

  // ----- the venue's name painted on the run-off behind each baseline -----
  if (spec.groundText) {
    const tw = Math.min(9, (hx - 1.5) * 1.5), th = tw * 0.14;
    const gt = TX.textTexture(spec.groundText, { w: 1024, h: 144, bg: 'none', fg: '#ffffff', size: 112, weight: 800, spacing: 10 });
    const gm = lit(std({ map: gt, transparent: true, roughness: 0.8, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    for (const sg of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), gm); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.003, sg * (COURT.halfLen + spec.back * 0.6)); m.receiveShadow = true; m.renderOrder = 1; root.add(m); }
  }

  // ----- net -----
  A.net = buildNet(spec, root, lit);

  // ----- perimeter wall with boards -----
  const wallH = spec.wallH || 1.15, wallBackH = spec.wallBackH || wallH;
  // Walls were sampled from photographs where they stand in shade or take the sun at a glancing
  // angle, so the paint itself is lighter than the sample (a floodlit sample is used where there is one).
  const wallCol = spec.wallLit || (() => { const c = new THREE.Color(spec.wall), h = {}; c.getHSL(h, THREE.SRGBColorSpace); return '#' + new THREE.Color().setHSL(h.h, Math.min(1, h.s * 1.04), Math.min(0.62, h.l * 1.32), THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace); })();
  A.wallCol = wallCol;
  const wallMat = lit(std({ color: wallCol, roughness: 0.6 }));
  {
    // the wall is a band whose height steps up behind the baselines
    const lo = ring(F, 0, 0), hi = ring(F, 0, wallH);
    for (const p of hi) { const t = THREE.MathUtils.smoothstep(Math.abs(p.z), hz - F.rc * 0.9, hz); p.y = wallH + (wallBackH - wallH) * t; }
    const wall = new THREE.Mesh(band(lo, hi, 1, 1), wallMat); wall.receiveShadow = true; root.add(wall);
    const capMat = lit(std({ color: spec.wallCap || spec.wall, roughness: 0.5 }));
    const cap = ring(F, 0.5, 0); for (let i = 0; i < cap.length; i++) cap[i].y = hi[i].y;
    root.add(new THREE.Mesh(band(hi, cap, 1, 1), capMat));
    A.wallTop = hi;
    // boards: flat panels a hair in front of the wall
    const board = (text, x, z, w, h, ry, o) => {
      const t = TX.textTexture(text, { w: 1024, h: Math.round(1024 * h / w), bg: o.bg || wallCol, fg: o.fg || spec.wallText || '#ffffff', weight: o.weight || 700, size: o.size, spacing: o.spacing, font: o.font });
      // indoor events ring the court with LED boards: they glow rather than reflect
      const bm = spec.glowWall ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color().setScalar(spec.glowWall) }) : lit(std({ map: t, roughness: 0.55 }));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bm);
      m.position.set(x, (o.y == null ? h / 2 + 0.06 : o.y), z); m.rotation.y = ry; m.receiveShadow = true; root.add(m); return m;
    };
    // a place on the wall: `along` metres round it from the middle of the back wall at end s (+1 or -1),
    // `inset` metres out from it toward the court; ry turns a thing there to face the court
    const onWall = (s, along, inset) => {
      const R = lo, n = R.length, i0 = s > 0 ? F.nz + F.nc : F.nz * 2 + F.nc * 3 + F.nx, sx = hx - F.rc;
      let d = (((R[i0].s + sx + along) % R.len) + R.len) % R.len, i = 0;
      while (i < n - 1 && R[i + 1].s <= d) i++;
      const p = R[i], q = R[(i + 1) % n], ql = i + 1 < n ? q.s : R.len, t = (d - p.s) / Math.max(1e-6, ql - p.s);
      let nx = -(q.z - p.z), nz = q.x - p.x; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      if (nx * -x + nz * -z < 0) { nx = -nx; nz = -nz; }
      return { x: x + nx * inset, z: z + nz * inset, ry: Math.atan2(nx, nz), seg: ql - p.s };
    };
    const names = (spec.boards || ['RALLY']).filter(Boolean).length ? spec.boards : [' '];
    const bh = Math.min(0.92, wallBackH - 0.16), bw = 5.2;
    // behind each baseline: the venue's own words
    for (const s of [-1, 1]) {
      const zz = s * (hz - 0.03), ry = s > 0 ? Math.PI : 0;
      const row = spec.backText || [spec.city || names[0]];
      const span = (hx - F.rc) * 2, each = Math.min(bw * 1.5, span / row.length);
      const dressed = wallBackH >= 1.9 && names[0].trim() && !spec.backTextSize;
      if (!dressed) row.forEach((tx, i) => board(tx, (-(row.length - 1) / 2 + i) * each * (s > 0 ? -1 : 1), zz, each * 0.94, bh, ry, { bg: wallCol, fg: spec.wallText, spacing: 6, size: spec.backTextSize, weight: spec.backTextWeight || 700 }));
      else {
        // a tall back wall as the big events dress it: the venue's word large in the middle, a
        // partner's either side, dark slots at ground level for the cameras behind the wall
        const wide = span >= 12, cy = wallBackH * 0.64, hC = Math.min(1.2, wallBackH * 0.40), wC = Math.min(span * (wide ? 0.40 : 0.56), 9.5), dir = s > 0 ? -1 : 1;
        const slotW = Math.min(1.7, span * 0.17), slotX = span * (wide ? 0.19 : 0.15);
        const BB = spec.backBand;
        if (BB) {
          // a pale band the full width of the wall's top with the word on it, partners' names small below
          const bH = wallBackH * (BB.h || 0.42), bY = wallBackH - bH / 2 - 0.12;
          board(row.join('  '), 0, zz, span + 0.02, bH, ry, { y: bY, bg: BB.bg, fg: BB.fg, spacing: 14, weight: 800, size: Math.round(1024 * bH / span * 0.62) });
          [-1, 1].forEach((k, i) => board(names[(i + (s > 0 ? 1 : 3)) % names.length], k * span * 0.3 * dir, zz, span * 0.3, bH * 0.5, ry, { y: bY - bH * 0.5 - 0.42, bg: wallCol, fg: spec.wallText, spacing: 6, weight: 700 }));
        } else {
          board(row.join('  '), 0, zz, wC, hC, ry, { y: cy, bg: wallCol, fg: spec.wallText, spacing: 10, weight: 800 });
          if (wide) [-1, 1].forEach((k, i) => board(names[(i + (s > 0 ? 1 : 3)) % names.length], k * span * 0.36 * dir, zz, span * 0.22, hC * 0.6, ry, { y: cy, bg: wallCol, fg: spec.wallText, spacing: 6, weight: 700 }));
        }
        const slot = new THREE.MeshBasicMaterial({ color: '#020304' }), rim = lit(std({ color: '#0b0d10', roughness: 0.5 }));
        for (const k of [-1, 1]) {
          const sl = new THREE.Mesh(new THREE.PlaneGeometry(slotW, 0.44), slot); sl.position.set(k * slotX, 0.40, s * (hz - 0.035)); sl.rotation.y = ry; root.add(sl);
          const fr = new THREE.Mesh(new THREE.PlaneGeometry(slotW + 0.12, 0.56), rim); fr.position.set(k * slotX, 0.40, s * (hz - 0.032)); fr.rotation.y = ry; root.add(fr);
          // the lens looking out of it
          const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.22, 14), lit(std({ color: '#15171a', roughness: 0.3, metalness: 0.6 }))); ln.rotation.x = Math.PI / 2; ln.position.set(k * slotX + 0.2 * k, 0.40, s * (hz - 0.10)); root.add(ln);
          const gl = new THREE.Mesh(new THREE.CircleGeometry(0.062, 14), lit(std({ color: '#1a2a44', roughness: 0.05, metalness: 0.9 }))); gl.position.set(k * slotX + 0.2 * k, 0.40, s * (hz - 0.215)); gl.rotation.y = ry; root.add(gl);
        }
        // a low block in the wall's colour standing out from its foot, with a partner's name: on the
        // straight wall where it is wide enough, otherwise in front of the corner beside it
        const off = wide ? span / 2 - 0.95 : span / 2 + onWall(s, span / 2 + 0.3, 0).seg / 2;
        const P = onWall(s, off, 1.05), Pf = onWall(s, off, 1.05 + 0.255);
        const bl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.5), wallMat); bl.position.set(P.x, 0.31, P.z); bl.rotation.y = P.ry; bl.castShadow = true; bl.receiveShadow = true; root.add(bl);
        board(names[(s > 0 ? 4 : 5) % names.length], Pf.x, Pf.z, 1.4, 0.5, Pf.ry, { y: 0.31, bg: wallCol, fg: spec.wallText, weight: 700 });
      }
    }
    // the clock cabinet in a back corner: the time of day, and the serve clock counting down
    if (wallBackH >= 1.9) {
      const cv = TX.canvas(512, 384), ct = TX.tex(cv, { clamp: true, aniso: 8 }), body = spec.clockCol || '#103329';
      const draw = v => {
        const g = cv.getContext('2d'); g.fillStyle = body; g.fillRect(0, 0, 512, 384);
        // dial
        g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(150, 192, 112, 0, 7); g.fill(); g.strokeStyle = '#b79a4a'; g.lineWidth = 12; g.stroke();
        g.strokeStyle = '#1a1d1c'; g.lineWidth = 5; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(150 + Math.sin(a) * 88, 192 - Math.cos(a) * 88); g.lineTo(150 + Math.sin(a) * 100, 192 - Math.cos(a) * 100); g.stroke(); }
        const hr = A.clockHour == null ? 14.2 : A.clockHour, ha = hr % 12 / 12 * Math.PI * 2, ma = (hr % 1) * Math.PI * 2;
        g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(150, 192); g.lineTo(150 + Math.sin(ha) * 56, 192 - Math.cos(ha) * 56); g.stroke();
        g.lineWidth = 6; g.beginPath(); g.moveTo(150, 192); g.lineTo(150 + Math.sin(ma) * 84, 192 - Math.cos(ma) * 84); g.stroke();
        // serve clock
        g.fillStyle = 'rgba(255,255,255,0.86)'; g.font = '700 26px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('OFFICIAL TIME', 384, 96);
        g.fillStyle = '#060807'; g.fillRect(296, 136, 176, 132);
        g.fillStyle = v != null && v <= 5 ? '#ff5a3c' : '#ffd23c'; g.font = '700 104px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(v == null ? '--' : String(v).padStart(2, '0'), 384, 206); g.textBaseline = 'alphabetic';
        ct.needsUpdate = true;
      };
      let shown; A.setServeClock = v => { if (v === shown) return; shown = v; draw(v); };
      draw(null); shown = null;
      const cab = lit(std({ color: body, roughness: 0.45 })), face = new THREE.MeshBasicMaterial({ map: ct, color: new THREE.Color().setScalar(night ? 1.0 : 0.82) });
      const span = (hx - F.rc) * 2;
      for (const s of [-1, 1]) {
        // on the straight wall where there is room beside the lettering, otherwise against the corner
        const off = -(span >= 12 ? span / 2 - 1.2 : span / 2 + onWall(s, -(span / 2 + 0.3), 0).seg / 2);
        const P = onWall(s, off, 0.30), Pf = onWall(s, off, 0.30 + 0.256);
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 0.5), cab); b.position.set(P.x, 0.85, P.z); b.rotation.y = P.ry; b.castShadow = true; b.receiveShadow = true; root.add(b);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 1.56), face); f.position.set(Pf.x, 0.86, Pf.z); f.rotation.y = Pf.ry; root.add(f);
      }
    }
    // along the sides: partner boards
    const sideLen = (hz - F.rc) * 2, nSide = Math.max(4, Math.floor(sideLen / 4.4)), sw = sideLen / nSide;
    for (const s of [-1, 1]) for (let i = 0; i < nSide; i++) {
      const tx = names[(i + (s > 0 ? 0 : 2)) % names.length];
      board(tx, s * (hx - 0.03), -sideLen / 2 + sw * (i + 0.5), sw * 0.94, Math.min(0.8, wallH - 0.16), s > 0 ? -Math.PI / 2 : Math.PI / 2, { bg: spec.boardBg || spec.wall, fg: spec.boardFg || spec.wallText, size: undefined, weight: 600 });
    }
  }

  // ----- stands -----
  // the steps themselves: poured concrete, darker than the walkways because it sits in the seats' shade
  const stepMat = lit(std({ color: '#' + new THREE.Color(spec.concrete || '#8d8f92').lerp(new THREE.Color(spec.tread || '#3a3f47'), 0.45).getHexString(), roughness: 0.92 }));
  const fasciaMat = lit(std({ color: spec.fascia || '#1b2330', roughness: 0.5 }));
  const concMat = lit(std({ color: spec.concrete || '#8d8f92', roughness: 0.9 }));
  if (photo.concrete) { const cn = photo.concrete.normal.clone(); cn.repeat.set(0.5, 0.6); cn.needsUpdate = true; concMat.normalMap = cn; concMat.normalScale = new THREE.Vector2(0.8, 0.8); }
  let d = 0.5, h = wallBackH > wallH ? wallH : wallH, prev = null;
  const rows = [];                                    // every row of seats: { d, y, tier }
  // a stairway every nine metres or so round the bowl, and a tunnel mouth under every second one
  const baseRing = ring(F, 0, 0), nBlocks = Math.max(8, Math.round(baseRing.len / (spec.blockLen || 9.5)));
  const aisles = A.aisles = { base: baseRing, L: baseRing.len / nBlocks, w: 1.25, n: nBlocks, voms: [] };
  const aisleMat = lit(std({ color: '#' + new THREE.Color(spec.concrete || '#8d8f92').multiplyScalar(1.08).getHexString(), roughness: 0.9 })), mouthMat = std({ color: '#06080b', roughness: 1 });
  // a point on the ring grown out by `dd`, at arc length s0 of the wall ring
  const atArc = (dd, s0) => { const r = ring(F, dd, 0), n = baseRing.length; let i = 0; while (i < n - 1 && baseRing[i + 1].s <= s0) i++; const s1 = i + 1 < n ? baseRing[i + 1].s : baseRing.len, t = (s0 - baseRing[i].s) / Math.max(1e-6, s1 - baseRing[i].s), a = r[i], b = r[(i + 1) % n];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t, seg: i, t }; };
  const hiRing = () => { const r = ring(F, d, 0); for (let i = 0; i < r.length; i++) r[i].y = h; return r; };
  // the first tier starts from the top of the wall, which is taller behind the baselines
  prev = ring(F, 0.5, 0); for (let i = 0; i < prev.length; i++) prev[i].y = A.wallTop[i].y;
  let baseLift = prev.map(p => p.y - wallH);          // extra height behind the baselines, carried up the first tier
  const tiers = spec.tiers || [{ depth: 12, angle: 24 }, { gap: 1.2, lift: 3.4, depth: 16, angle: 32 }];
  A.tierInfo = [];                                    // where each tier starts and ends, for the venue's own structures
  tiers.forEach((t, ti) => {
    const walkD = d, walkY = h;
    if (ti > 0) {
      // walkway, then a fascia rising to the next tier
      const d1 = d + (t.gap || 0), a = prev, b = ring(F, d1, 0); for (const p of b) p.y = h;
      root.add(new THREE.Mesh(band(a, b, 1, 1), concMat));
      const c = ring(F, d1, 0); for (const p of c) p.y = h + (t.lift || 0);
      if (t.suites) {
        // rings of hospitality suites: a concrete front, then dark glass set back under it, repeated
        const n = t.suites, each = (t.lift || 0) / n, glassM = lit(std({ color: '#141c26', roughness: 0.12, metalness: 0.7, emissive: new THREE.Color(night ? '#3a3020' : '#000000'), emissiveIntensity: night ? 0.6 : 0 }));
        for (let k = 0; k < n; k++) {
          const y0 = h + each * k, r0 = ring(F, d1, 0), r1 = ring(F, d1, 0), r2 = ring(F, d1 + 0.5, 0), r3 = ring(F, d1 + 0.5, 0);
          for (let i = 0; i < r0.length; i++) { r0[i].y = y0; r1[i].y = y0 + each * 0.36; r2[i].y = y0 + each * 0.36; r3[i].y = y0 + each; }
          root.add(new THREE.Mesh(band(r0, r1, 1, 1), fasciaMat)); root.add(new THREE.Mesh(band(r1, r2, 1, 1, true), fasciaMat)); root.add(new THREE.Mesh(band(r2, r3, 1, 1), glassM));
        }
      } else { const fm = new THREE.Mesh(band(b, c, 1, 1), t.glass ? lit(std({ color: '#0d1218', roughness: 0.15, metalness: 0.6 })) : fasciaMat); root.add(fm); }
      if (spec.ribbon !== false && t.ribbon !== false && !t.suites && (t.lift || 0) > 1.2) {
        // LED ribbon board along the fascia
        const txt = (spec.ribbonText || spec.city || 'RALLY').toUpperCase();
        const rt = TX.textTexture(txt + '   ·   ', { w: 1024, h: 64, bg: spec.ribbonBg || '#04060a', fg: spec.ribbonFg || '#ffffff', size: 40, weight: 700, spacing: 4 });
        rt.wrapS = THREE.RepeatWrapping;
        const r0 = ring(F, d1 - 0.04, 0), r1 = ring(F, d1 - 0.04, 0); const top = h + (t.lift || 0) - 0.25;
        for (const p of r0) p.y = top - 0.9; for (const p of r1) p.y = top;
        const rm = new THREE.Mesh(band(r0, r1, 14, 1), new THREE.MeshBasicMaterial({ map: rt, toneMapped: true, color: new THREE.Color(night ? 1.6 : 1.0, night ? 1.6 : 1.0, night ? 1.6 : 1.0) }));
        root.add(rm); A.ribbon = rt;
      }
      d = d1; h += (t.lift || 0); prev = c; baseLift = baseLift.map(() => 0);
    }
    const run = t.depth, rise = Math.tan(t.angle * Math.PI / 180) * run;
    A.tierInfo.push({ walkD, walkY, frontD: walkD + (ti > 0 ? t.gap || 0 : 0), d0: d, y0: h, d1: d + run, y1: h + rise, angle: t.angle, suites: t.suites || 0, lift: ti > 0 ? t.lift || 0 : 0, endLift: ti === 0 ? baseLift[F.nz + F.nc] || 0 : 0 });
    const slope = Math.hypot(run, rise), rowD = 0.82, nRows = Math.max(2, Math.floor(slope / rowD));
    const seatW = 0.52, rr = run / nRows, rs = rise / nRows;
    const seatCol = t.seat || spec.seat;
    const backM = lit(std({ map: TX.seatBackTexture(seatCol, seed + 31 + ti), roughness: 0.62, alphaTest: 0.38, side: THREE.DoubleSide }));
    const panM = lit(std({ map: TX.seatPanTexture(seatCol, seed + 41 + ti), roughness: 0.62, alphaTest: 0.5, side: THREE.DoubleSide }));
    // real steps: a concrete riser and tread, and on every tread a row of seats — backs standing
    // against the next riser, pans in front of them
    const risers = [], treads = [], backs = [], pans = [], stairs = [];
    const level = (r, i) => h + rs * (r + 1) + baseLift[i] * (1 - (r + 1) / nRows);
    const seatD = Math.min(0.44, rr * 0.56);
    for (let r = 0; r < nRows; r++) {
      const d0 = d + rr * r, lo = ring(F, d0, 0), hi = ring(F, d0, 0), out = ring(F, d0 + rr, 0);
      for (let i = 0; i < lo.length; i++) { lo[i].y = r === 0 ? prev[i].y : level(r - 1, i); hi[i].y = level(r, i); out[i].y = level(r, i); }
      risers.push(bandPart(lo, hi, 1.6, 1, aisles, false)); treads.push(bandPart(hi, out, 1.6, 1, aisles, false));
      stairs.push(bandPart(lo, hi, 1.6, 1, aisles, true), bandPart(hi, out, 1.6, 1, aisles, true));
      const b0 = ring(F, d0 + rr - 0.03, 0), b1 = ring(F, d0 + rr + 0.05, 0), p0 = ring(F, d0 + rr - 0.03 - seatD, 0), p1 = ring(F, d0 + rr - 0.03, 0);
      for (let i = 0; i < b0.length; i++) { const y = level(r, i); b0[i].y = y; b1[i].y = y + 0.84; p0[i].y = y + 0.43; p1[i].y = y + 0.445; }
      backs.push(bandPart(b0, b1, seatW, 1, aisles, false)); pans.push(bandPart(p0, p1, seatW, 1, aisles, false));
      rows.push({ d: d0 + rr - 0.03 - seatD * 0.5, y: h + rs * (r + 1), tier: ti, f: (r + 1) / nRows, lift: baseLift });
    }
    root.add(new THREE.Mesh(mergeBands(risers), stepMat)); root.add(new THREE.Mesh(mergeBands(treads), stepMat));
    root.add(new THREE.Mesh(mergeBands(backs), backM)); root.add(new THREE.Mesh(mergeBands(pans), panM));
    root.add(new THREE.Mesh(mergeBands(stairs), aisleMat));
    // tunnel mouths: a concrete box standing out of the seats with a dark opening toward the court
    if (spec.voms !== false && rise > 3.2) {
      const vh = 2.25, f0 = ti === 0 ? 0.42 : 0.06, r0 = Math.min(nRows - 2, Math.max(1, Math.round(nRows * f0))), nr = Math.max(2, Math.ceil(vh / rs)), r1 = Math.min(nRows - 1, r0 + nr);
      for (let k = ti % 2; k < nBlocks; k += 2) {
        const s0 = (k + 0.5) * aisles.L, dF = d + rr * r0, dB = d + rr * (r1 + 1), pF = atArc(dF, s0), pB = atArc(dB, s0);
        const lift = ti === 0 ? baseLift[pF.seg] || 0 : 0, yF = h + rs * r0 + lift * (1 - r0 / nRows), yT = h + rs * (r1 + 1) + lift * (1 - (r1 + 1) / nRows) + 0.12, hh = yT - yF, dep = Math.hypot(pB.x - pF.x, pB.z - pF.z), ang = Math.atan2(-pF.nx, -pF.nz), w = 3.1;
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, hh, dep), concMat); box.position.set((pF.x + pB.x) / 2, yF + hh / 2, (pF.z + pB.z) / 2); box.rotation.y = ang; root.add(box);
        const mouth = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.7, Math.min(hh - 0.35, 2.15)), mouthMat); mouth.position.set(pF.x - pF.nx * 0.02, yF + Math.min(hh - 0.35, 2.15) / 2, pF.z - pF.nz * 0.02); mouth.rotation.y = ang; root.add(mouth);
        aisles.voms.push({ s0, tier: ti, d0: dF - 0.3, d1: dB + 0.2, half: w / 2 + 0.15 });
      }
    }
    const top = ring(F, d + run, 0); for (let i = 0; i < top.length; i++) top[i].y = h + rise;
    // vomitories: dark mouths in the lower third of the tier
    d += run; h += rise; prev = top; baseLift = baseLift.map(() => 0);
  });
  // back wall and rim
  const rimH = spec.rimH == null ? 3.5 : spec.rimH;
  {
    const a = prev, b = ring(F, d, 0); for (const p of b) p.y = h + rimH;
    root.add(new THREE.Mesh(band(a, b, 1, 1), lit(std({ color: spec.rim || spec.fascia || '#20262e', roughness: 0.7 }))));
    prev = b;
  }
  const outerD = d, rimTop = h + rimH;
  A.outerD = outerD; A.rimTop = rimTop;

  // ----- roof -----
  let openHX = hx + outerD, openHZ = hz + outerD, openRC = F.rc + outerD, openY = rimTop;
  if (spec.roof && spec.roof.type !== 'none') {
    const R = spec.roof, y = rimTop + (R.lift == null ? 2 : R.lift);
    const oF = { hx: R.openX, hz: R.openZ, rc: R.openR == null ? 3 : R.openR, nx: F.nx, nz: F.nz, nc: F.nc };
    const inner = R.closed ? null : ring(oF, 0, y), outer = ring(F, outerD + (R.over || 2.5), y + (R.pitch || 0) * -1);
    const under = lit(std({ color: R.under || '#c9ced4', roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(R.glow || '#000000'), emissiveIntensity: R.glowI || 0 }));
    if (inner) {
      root.add(new THREE.Mesh(band(inner, outer, 1, 1, true), under));
      // the lip of the opening: upright, or a fascia leaning out (`flare`), and the roof's top behind it (`cap`)
      const lip = ring(oF, R.flare || 0, y + (R.thick || 1.6)), edgeM = lit(std({ color: R.edge || '#e9ecef', roughness: 0.6, side: THREE.DoubleSide }));
      root.add(new THREE.Mesh(band(inner, lip, 1, 1), edgeM));
      if (R.cap != null) root.add(new THREE.Mesh(band(lip, ring(F, outerD + (R.over || 2.5), y + (R.thick || 1.6) + R.cap), 1, 1), lit(std({ color: R.capCol || R.edge || '#e9ecef', roughness: 0.75, side: THREE.DoubleSide }))));
      // trusses fanning from the opening to the rim
      if (R.trusses !== 0) {
        const tm = lit(std({ color: R.truss || '#eef0f2', roughness: 0.5, metalness: 0.3 })), ts = R.trussSize || [0.9, 0.35];
        const step = Math.max(2, Math.round(inner.length / (R.trusses || 28)));
        const box = new THREE.BoxGeometry(1, 1, 1), im = new THREE.InstancedMesh(box, tm, Math.ceil(inner.length / step));
        const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
        let k = 0;
        for (let i = 0; i < inner.length; i += step) {
          const a = inner[i], b = outer[i]; dir.set(b.x - a.x, b.y - a.y, b.z - a.z); const len = dir.length(); dir.normalize();
          P.set((a.x + b.x) / 2, (a.y + b.y) / 2 - ts[0] * 0.55, (a.z + b.z) / 2); Q.setFromUnitVectors(X, dir); S.set(len, ts[0], ts[1]);
          M.compose(P, Q, S); im.setMatrixAt(k++, M);
        }
        im.count = k; root.add(im);
      }
      openHX = R.openX; openHZ = R.openZ; openRC = oF.rc; openY = y;
    } else {
      // closed roof / indoor hall: a dark ceiling with a lighting grid
      const cg = new THREE.PlaneGeometry((hx + outerD + 6) * 2, (hz + outerD + 6) * 2); const cm = new THREE.Mesh(cg, std({ color: R.under || '#0a0b0e', roughness: 1 }));
      cm.rotation.x = Math.PI / 2; cm.position.y = y; root.add(cm);
      openHX = 0.01; openHZ = 0.01; openRC = 0.005; openY = y;
    }
    A.roofY = y;
  }
  A.open = { hx: openHX, hz: openHZ, rc: openRC, y: openY };

  // ----- what makes this ground itself: its roof steel, its boxes, its end stands -----
  {
    const before = root.children.filter(o => o !== A.floor && o !== A.net.group);
    A.rows = rows; A.kit = { ring, band, atArc, std };
    buildLandmarks(A, spec, lit);
    // a venue that builds its own end stand takes the generic one away first (and no one sits there)
    if (A.cut) { root.updateMatrixWorld(true); carve(before, A.cut); }
  }

  // ----- crowd -----
  A.crowd = buildCrowd(A, F, rows, spec, q, rnd, lit, opt.crowdAtlas);

  // ----- furniture -----
  A.staffModels = opt.staff || null;
  buildFurniture(A, spec, lit, opt.model);

  // ----- scoreboards -----
  {
    const sc = TX.canvas(1024, 384), st = TX.tex(sc, { clamp: true, aniso: 8 });
    const g = sc.getContext('2d'); g.fillStyle = '#05070b'; g.fillRect(0, 0, 1024, 384);
    A.scoreCanvas = sc; A.scoreTex = st;
    const mat = new THREE.MeshBasicMaterial({ map: st, toneMapped: true });
    mat.color.setScalar(night ? 1.5 : 1.15);
    const t0 = tiers[0], y0 = wallH + Math.tan(t0.angle * Math.PI / 180) * t0.depth;
    const w = Math.min(15, (hx - F.rc) * 1.5), hh = w * 0.375;
    const yb = spec.boardY || (tiers.length > 1 ? y0 + (tiers[1].lift || 3) + Math.tan(tiers[1].angle * Math.PI / 180) * tiers[1].depth + rimH * 0.55 : y0 + rimH * 0.5 + 1);
    // over each end at the back of the bowl, unless the venue hangs its own (`A.screens`: x, y, z, ry, tilt, w)
    const spots = A.screens || [-1, 1].map(s => ({ x: 0, y: Math.max(yb, hh / 2 + 3), z: s * (hz + outerD - 0.3), ry: s > 0 ? Math.PI : 0, w }));
    const frM = std({ color: '#0b0d10', roughness: 0.6 }), back = new THREE.Vector3();
    for (const S of spots) {
      const sw = S.w || w, sh = sw * 0.375;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
      m.position.set(S.x, S.y, S.z); m.rotation.set(S.tilt || 0, S.ry, 0, 'YXZ'); root.add(m);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.6, sh + 0.6, 0.5), frM); fr.quaternion.copy(m.quaternion); fr.position.copy(m.position).add(back.set(0, 0, -0.3).applyQuaternion(m.quaternion)); root.add(fr);
    }
  }

  // ----- sky, sun and lamps -----
  buildLighting(A, spec, q, opt.skyTex);

  // ----- beyond the rim -----
  buildBackdrop(A, spec, rnd);

  A.setFlip = f => { root.rotation.y = f < 0 ? Math.PI : 0; ARENA_U.uArenaFlip.value = f < 0 ? -1 : 1; if (A.sky) { A.sky.material.uniforms.uRot.value = A.skyRot0 + (f < 0 ? Math.PI : 0); if (A.skyTilt) A.skyTilt(f < 0 ? -1 : 1); } };
  // Draw calls are what this stadium costs: every object sharing a material becomes one mesh.
  { const keep = new Set([A.floor]); A.net.group.traverse(o => keep.add(o)); A.merged = compact(root, keep); }
  // under floodlights only the players, the ball and the net throw the four shadows; the rest would cost four more passes each
  if (!A.hasSun) { const keep = new Set(); A.net.group.traverse(o => keep.add(o)); root.traverse(o => { if (o.isMesh && o.castShadow && !keep.has(o)) o.castShadow = false; }); }
  // by day too: the stands' and roof's shade on the court is drawn by arenaSun, not the shadow map, so only what stands on
  // and beside the court throws a mapped shadow — and the map can then be redrawn every frame (no stepping shadows)
  { const bb = new THREE.Box3(); root.updateMatrixWorld(true);
    root.traverse(o => { if (!o.isMesh || !o.castShadow || o.isSkinnedMesh) return; bb.setFromObject(o);
      if (bb.max.x > A.hx + 0.6 || bb.min.x < -A.hx - 0.6 || bb.max.z > A.hz + 0.6 || bb.min.z < -A.hz - 0.6 || bb.max.y > 5) o.castShadow = false; }); }
  // nothing in the stadium moves: fix every object's matrix once instead of rebuilding it each frame
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o !== root && !o.isBone && !o.isSkinnedMesh && !o.userData.live) o.matrixAutoUpdate = false; });
  // where the ball is, for everyone who watches it
  A.ballAt = new THREE.Vector3(0, 1, 0); A.ballLive = false;
  A.watchBall = (x, y, z, on) => { const f = ARENA_U.uArenaFlip.value; A.ballAt.set(x * f, y, z * f); A.ballLive = !!on; };
  A.update = (dt, t) => {
    A.crowd.update(dt, t); A.net.update(dt); if (A.ribbon) A.ribbon.offset.x = (t * 0.02) % 1;
    // the umpire and the ball kids (staff.js): heads after the ball, and the work between points
    if (A.staffCtl) A.staffCtl.update(dt, t);
  };
  A.dispose = () => { root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); } } }); for (const x of disposables) x.dispose(); if (A.env) A.env.dispose(); };
  return A;
}

// ---------- net ----------
function buildNet(spec, root, lit) {
  const grp = new THREE.Group(); root.add(grp);
  const PX = COURT.halfWD + 0.914, segX = 64, segY = 8;
  const topAt = x => Math.abs(x) <= COURT.postX ? netHeightAt(x) : COURT.postH;
  const nt = TX.netTexture(); nt.repeat.set(PX * 2 / 0.045, 1.0 / 0.045);
  const g = new THREE.PlaneGeometry(PX * 2, 1, segX, segY), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), v = p.getY(i) + 0.5; p.setY(i, 0.02 + v * (topAt(x) - 0.06)); }
  g.computeVertexNormals();
  const base = p.array.slice();
  const mat = lit(new THREE.MeshStandardMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, roughness: 1, color: spec.netCol || '#ffffff', depthWrite: false, alphaTest: 0.02 }));
  const net = new THREE.Mesh(g, mat); net.renderOrder = 2; grp.add(net);
  // a cord net lets about half the light through: thin the shadow by discarding a checkerboard
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  dm.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 0.5) discard;'); };
  net.customDepthMaterial = dm; net.castShadow = true;
  // headband
  const white = lit(new THREE.MeshStandardMaterial({ color: spec.netTape || '#f4f5f2', roughness: 0.7 }));
  const bandG = new THREE.BoxGeometry(PX * 2, 0.065, 0.022, segX, 1, 1), bp = bandG.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) + topAt(bp.getX(i)) - 0.03);
  bandG.computeVertexNormals(); const bandBase = bp.array.slice();
  const hb = new THREE.Mesh(bandG, white); hb.castShadow = true; grp.add(hb);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURT.netH, 0.024), white); strap.position.y = COURT.netH / 2; grp.add(strap);
  for (const sg of [-1, 1]) { const sb = new THREE.Mesh(new THREE.BoxGeometry(0.045, COURT.postH - 0.04, 0.018), white); sb.position.set(sg * (PX - 0.05), (COURT.postH - 0.04) / 2 + 0.02, 0); grp.add(sb); }
  const bot = new THREE.Mesh(new THREE.BoxGeometry(PX * 2 - 0.1, 0.03, 0.016), white); bot.position.y = 0.035; grp.add(bot);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 6), new THREE.MeshStandardMaterial({ color: '#8a8f96', metalness: 0.8, roughness: 0.4 })); cable.rotation.z = Math.PI / 2; cable.position.set(PX - 0.2, COURT.postH - 0.02, 0); grp.add(cable);
  const postMat = lit(new THREE.MeshStandardMaterial({ color: spec.netPost || '#1c1f24', roughness: 0.4, metalness: 0.6 }));
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, COURT.postH + 0.02, 14), postMat); post.position.set(s * PX, (COURT.postH + 0.02) / 2, 0); post.castShadow = true; grp.add(post);
    const capm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), postMat); capm.position.set(s * PX, COURT.postH + 0.02, 0); grp.add(capm);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, COURT.postH, 8), white); stick.position.set(s * COURT.postX, COURT.postH / 2, 0); stick.castShadow = true; grp.add(stick);
  }
  // the net gives when the ball hits it
  let amp = 0, vel = 0, hx0 = 0, hy0 = 0.5, dir = 1;
  const apply = () => {
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], w = Math.exp(-((x - hx0) ** 2) / 1.6 - ((y - hy0) ** 2) / 0.35) * (y / 1.0);
      p.array[i * 3 + 2] = amp * w * dir;
    }
    p.needsUpdate = true;
    for (let i = 0; i < bp.count; i++) { const x = bandBase[i * 3]; bp.array[i * 3 + 2] = bandBase[i * 3 + 2] + amp * Math.exp(-((x - hx0) ** 2) / 1.6) * 0.5 * dir; }
    bp.needsUpdate = true;
  };
  return {
    group: grp,
    hit(x, y, d, power) { hx0 = x; hy0 = y; dir = d; vel += Math.min(3.5, power * 0.11); },
    update(dt) {
      if (Math.abs(amp) < 1e-4 && Math.abs(vel) < 1e-3) { if (amp !== 0) { amp = 0; apply(); } return; }
      vel += (-amp * 260 - vel * 9) * dt; amp += vel * dt; apply();
    },
  };
}

// ---------- crowd ----------
// what a summer crowd wears: mostly pale, a third dark, a scatter of colour
const CLOTHES = ['#dedcd5', '#d6d4cc', '#cfd4da', '#e2e0d8', '#c2cbd6', '#d8d2c2', '#9fb4cf', '#6f93c4', '#3b5f9a', '#1e2f55', '#1b1c20', '#2a2c33', '#3a3d45', '#a8362c', '#c8685a', '#d4b548', '#d9cc98', '#5d8a66', '#2f5f45', '#c98fa6', '#b5a07e', '#a08c68', '#7c8794', '#c9793c', '#6aa7ad'];
const SKIN = ['#f1d1b5', '#e8bf9d', '#d9a57e', '#c68f68', '#a9744f', '#8a5a3c', '#6b4530', '#f5dcc6'];
const HATS = ['#dcdad2', '#dcdad2', '#d4c8a8', '#c8b88e', '#1d2a44', '#a8362c', '#dcdad2'];
function buildCrowd(A, F, rows, spec, q, rnd, lit, atlas) {
  const fill = Math.max(spec.fill == null ? 0.92 : spec.fill, A.night ? 0.95 : 0), fillTopV = spec.fillTop == null ? null : Math.max(spec.fillTop, A.night ? 0.9 : 0);
  const seatW = 0.52, thin = q <= 0 ? 3 : q === 1 ? 2 : 1;
  // one seated spectator: thighs forward, torso upright
  const torso = new THREE.BoxGeometry(0.42, 0.50, 0.21);
  { const tp = torso.attributes.position; for (let i = 0; i < tp.count; i++) if (tp.getY(i) < 0) tp.setX(i, tp.getX(i) * 0.78); }   // shoulders wider than the waist
  torso.translate(0, 0.67, -0.04);
  const legs = new THREE.BoxGeometry(0.34, 0.14, 0.40); legs.translate(0, 0.43, 0.15);
  const bodyG = mergeGeo([torso, legs]);
  { // lap and lower body sit in the shade of the row in front
    const bp = bodyG.attributes.position, col = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) { const k = THREE.MathUtils.clamp((bp.getY(i) - 0.36) / 0.5, 0.42, 1); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    bodyG.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const headNear = new THREE.SphereGeometry(0.098, 8, 6); headNear.translate(0, 1.035, -0.02);
  const headFar = new THREE.IcosahedronGeometry(0.105, 0); headFar.translate(0, 1.035, -0.02);
  const cheerU = { uCheer: { value: 0 }, uCrowdT: { value: 0 }, uCrowdBall: { value: new THREE.Vector3(0, 0, 0) } };   // ball: x, 1 while a point is live, z
  const mk = body => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, vertexColors: !!body });
    sunMask(m, {
      key: 'crowd', uniforms: cheerU, vertexPars: 'uniform float uCheer; uniform float uCrowdT;',
      vertex: '',
    });
    // people shift in their seats, and rise when the point is worth it
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = sh => {
      prev(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        { float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          float up = smoothstep(1.0 - uCheer * 0.9, 1.0 - uCheer * 0.9 + 0.25, ph + 0.15 * sin(uCrowdT * 1.3 + ph * 30.0));
          transformed.y += up * (0.16 + 0.10 * abs(sin(uCrowdT * (7.0 + ph * 4.0) + ph * 40.0))) * step(0.5, transformed.y);
          transformed.x += 0.012 * sin(uCrowdT * (0.6 + ph) + ph * 50.0) * step(0.6, transformed.y); }
        #endif`);
    };
    m.customProgramCacheKey = () => 'crowd2' + (body ? 'b' : 'h');
    return m;
  };
  const sets = [];
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  // gather seats
  const near = [], far = [];
  for (const row of rows) {
    const r = ring(F, row.d, row.y), isFar = row.tier > 0;
    const n = Math.floor(r.len / seatW);
    let seg = 0;
    for (let k = 0; k < n; k += (isFar ? thin : Math.min(thin, 2))) {
      const s = (k + 0.5) * seatW;
      while (seg < r.length - 1 && r[seg + 1].s < s) seg++;
      const a = r[seg], b = r[(seg + 1) % r.length], bs = seg + 1 < r.length ? b.s : r.len, t = (s - a.s) / Math.max(1e-6, bs - a.s);
      // empties cluster: whole blocks of seats sit vacant together
      const blk = Math.sin(seg * 12.99 + row.tier * 7.1 + Math.floor(row.f * 6) * 3.3) * 43758.5453; const blkR = blk - Math.floor(blk);
      const tierFill = spec.tiers && spec.tiers[row.tier] ? spec.tiers[row.tier].fill : null;      // a tier's own fill (a draped deck: 0)
      const pFill = tierFill != null ? tierFill : fill * (blkR < (1 - fill) * 1.5 ? 0.25 : 1) * (fillTopV != null && row.tier > 0 ? fillTopV / fill : 1);
      if (A.aisles) {                                                 // nobody sits on a stairway or in a tunnel mouth
        if (onAisle(A.aisles, r, seg, t)) continue;
        const B0 = A.aisles.base, s1 = seg + 1 < B0.length ? B0[seg + 1].s : B0.len, s0 = B0[seg].s + (s1 - B0[seg].s) * t, scale = Math.max(1e-6, bs - a.s) / Math.max(1e-6, s1 - B0[seg].s);
        let hid = false; for (const v of A.aisles.voms) if (v.tier === row.tier && row.d > v.d0 && row.d < v.d1 && Math.abs(s0 - v.s0) * scale < v.half) { hid = true; break; }
        if (hid) continue;
      }
      if (rnd() > pFill) continue;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, nx = a.nx + (b.nx - a.nx) * t, nz = a.nz + (b.nz - a.nz) * t;
      if (A.cut && A.cut(x, row.y, z)) continue;                      // a stand the venue has taken away
      const lift = row.tier === 0 ? (row.lift[seg] || 0) * (1 - row.f) : 0;
      (isFar ? far : near).push(x, row.y + lift, z, Math.atan2(-nx, -nz), isFar ? thin : 1);
    }
  }
  const palette = spec.crowdPalette || CLOTHES, hatP = spec.hats == null ? 0.22 : spec.hats;
  const make = (list, headG) => {
    const n = list.length / 5; if (!n) return;
    const bodies = new THREE.InstancedMesh(bodyG, mk(true), n), heads = new THREE.InstancedMesh(headG, mk(false), n);
    for (let i = 0; i < n; i++) {
      const sc = 0.9 + rnd() * 0.2, wide = list[i * 5 + 4];
      P.set(list[i * 5], list[i * 5 + 1], list[i * 5 + 2]); Q.setFromAxisAngle(Y, list[i * 5 + 3] + (rnd() - 0.5) * 0.3); S.set(sc * (wide > 1 ? 1.5 : 1), sc, sc);
      M.compose(P, Q, S); bodies.setMatrixAt(i, M); heads.setMatrixAt(i, M);
      C.set(palette[Math.floor(rnd() * palette.length)]); C.multiplyScalar(0.75 + rnd() * 0.28); bodies.setColorAt(i, C);
      C.set(rnd() < hatP ? HATS[Math.floor(rnd() * HATS.length)] : SKIN[Math.floor(rnd() * SKIN.length)]); heads.setColorAt(i, C);
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    bodies.frustumCulled = false; heads.frustumCulled = false;
    A.root.add(bodies, heads); sets.push(bodies, heads);
  };
  if (atlas) {
    // pictures of seated people on upright cards
    const all = near.concat(far);
    for (let i = 1; i < all.length; i += 5) all[i] += 0.24;                 // the picture starts at thigh height above the tread
    const mesh = crowdCards(all, atlas, rnd, { uniforms: cheerU }); A.root.add(mesh); sets.push(mesh);
  } else { for (const l of [near, far]) for (let i = 1; i < l.length; i += 5) l[i] -= 0.10; make(near, headNear); make(far, headFar); }
  // camera flashes: pin-pricks in the seats that come thick after a big point
  let flash = null;
  { const all = near.concat(far), n = Math.min(420, Math.floor(all.length / 5)), P = new Float32Array(n * 3), Ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { const k = Math.floor(rnd() * (all.length / 5)) * 5; P[i * 3] = all[k]; P[i * 3 + 1] = all[k + 1] + 0.9; P[i * 3 + 2] = all[k + 2]; Ph[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(Ph, 1));
    const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uT: cheerU.uCrowdT, uRate: { value: 0 }, uPx: { value: 900 } },
      vertexShader: 'attribute float aPh; uniform float uT, uRate, uPx; varying float vA; void main(){ float cyc = uT * (0.11 + aPh * 0.07) + aPh * 37.0; float f = fract(cyc); float on = step(1.0 - uRate, fract(floor(cyc) * 0.618 + aPh)); vA = on * smoothstep(0.0, 0.004, f) * (1.0 - smoothstep(0.004, 0.035, f)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = vA * uPx * 0.36 / max(1.0, -mv.z); }',
      fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = vA * (smoothstep(0.5, 0.0, d) * 0.6 + smoothstep(0.12, 0.0, d) * 2.2); if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * a * 3.0, a); }' });
    flash = new THREE.Points(g, fm); flash.frustumCulled = false; flash.renderOrder = 6; flash.visible = false; A.root.add(flash); A.flash = flash; }
  let cheer = 0, target = 0, hold = 0;
  return {
    count: (near.length + far.length) / 5,
    cheer(v, dur) { target = Math.max(target, v); hold = Math.max(hold, dur || 2); },
    watch(x, z, live) { const f = ARENA_U.uArenaFlip.value; cheerU.uCrowdBall.value.set(x * f, live ? 1 : 0, z * f); },
    update(dt, t) {
      hold -= dt; if (hold <= 0) target = 0;
      cheer += (target - cheer) * Math.min(1, dt * (target > cheer ? 6 : 1.4));
      cheerU.uCheer.value = cheer; cheerU.uCrowdT.value = t;
      if (flash && flash.visible) flash.material.uniforms.uRate.value = 0.05 + cheer * 0.55;
    },
  };
}
// Merge every static mesh that shares a material (and the same kind of geometry) into one.
function compact(root, keep) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.live || keep.has(o) || o.customDepthMaterial || Array.isArray(o.material)) return;
    const g = o.geometry, at = Object.keys(g.attributes).sort().join(',');
    if (at !== 'normal,position' && at !== 'normal,position,uv') return;
    // two materials that would draw identically count as one
    const m = o.material, plain = !m.onBeforeCompile || (m.customProgramCacheKey && m.customProgramCacheKey() === 'arena');
    const id = t => t ? t.uuid : '', sig = plain && m.isMeshStandardMaterial
      ? ['std', m.color.getHexString(), m.roughness, m.metalness, id(m.map), id(m.normalMap), id(m.roughnessMap), m.emissive.getHexString(), m.emissiveIntensity, m.alphaTest, m.side, m.transparent, m.opacity, m.vertexColors, m.normalScale.x, !!m.onBeforeCompile].join('|') : m.uuid;
    const key = sig + at + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '') + (o.renderOrder || 0);
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
  });
  let before = 0, after = 0; const M = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const list of groups.values()) {
    before += list.length; if (list.length < 2) { after++; continue; }
    let nv = 0, ni = 0; const uv = !!list[0].geometry.attributes.uv;
    for (const o of list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const P = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), U = uv ? new Float32Array(nv * 2) : null, I = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni); let vo = 0, io = 0;
    for (const o of list) {
      const g = o.geometry, p = g.attributes.position, n = g.attributes.normal; M.multiplyMatrices(inv, o.matrixWorld); N.getNormalMatrix(M);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(M); P[(vo + i) * 3] = v.x; P[(vo + i) * 3 + 1] = v.y; P[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(n, i).applyMatrix3(N).normalize(); Nn[(vo + i) * 3] = v.x; Nn[(vo + i) * 3 + 1] = v.y; Nn[(vo + i) * 3 + 2] = v.z;
      }
      if (uv) U.set(g.attributes.uv.array.subarray(0, p.count * 2), vo * 2);
      if (g.index) for (let i = 0; i < g.index.count; i++) I[io + i] = g.index.array[i] + vo; else for (let i = 0; i < p.count; i++) I[io + i] = vo + i;
      vo += p.count; io += g.index ? g.index.count : p.count;
    }
    const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(P, 3)); G.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); if (uv) G.setAttribute('uv', new THREE.BufferAttribute(U, 2)); G.setIndex(new THREE.BufferAttribute(I, 1));
    const me = new THREE.Mesh(G, list[0].material); me.castShadow = list[0].castShadow; me.receiveShadow = list[0].receiveShadow; me.renderOrder = list[0].renderOrder; me.frustumCulled = false;
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
    root.add(me); after++;
  }
  return { before, after };
}
// many bands into one mesh: a whole tier of steps is a single draw
function mergeBands(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + o; o += g.attributes.position.count; oi += ia.length; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}
function mergeGeo(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = n > 65000 ? new Uint32Array(ni) : new Uint16Array(ni); let o = 0, oi = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o; o += g.attributes.position.count; oi += g.index.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}

// ---------- umpire's chair, benches, bags, the people who work the court ----------
function buildFurniture(A, spec, lit, model) {
  const root = A.root, g = new THREE.Group(); root.add(g);
  const M = (c, r, o) => lit(new THREE.MeshStandardMaterial({ color: c, roughness: r, ...(o || {}) }));
  const frame = M(spec.chair || '#1f3d2c', 0.45, { metalness: 0.25 }), steel = M('#b9bec4', 0.35, { metalness: 0.8 }), dark = M('#16181b', 0.6), white = M('#eeeeea', 0.85), pad = M(spec.wall, 0.8);
  const add = (geo, m, x, y, z, parent, rx, ry, rz) => { const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); if (rx || ry || rz) b.rotation.set(rx || 0, ry || 0, rz || 0); b.castShadow = true; b.receiveShadow = true; (parent || g).add(b); return b; };
  const box = (w, h, d, m, x, y, z, parent, rx, ry, rz) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent, rx, ry, rz);
  const tube = (r, len, m, x, y, z, parent, rx, ry, rz) => add(new THREE.CylinderGeometry(r, r, len, 10), m, x, y, z, parent, rx, ry, rz);
  const ux = -(COURT.halfWD + 0.914 + 1.0);
  // a box with rounded edges and corners: cushions, panels, bags, coolers
  const rbox = (w, h, d, r, m, x, y, z, parent, rx, ry, rz) => {
    const geo = new THREE.BoxGeometry(w, h, d, 6, 6, 6), P = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd)); v.sub(c).normalize().multiplyScalar(r).add(c); P.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals(); return add(geo, m, x, y, z, parent, rx, ry, rz);
  };
  const taper = (r0, r1, len, m, x, y, z, parent, rx, ry, rz) => add(new THREE.CylinderGeometry(r1, r0, len, 12), m, x, y, z, parent, rx, ry, rz);
  const chairCol = spec.playerChair || spec.chair || '#1f3d2c', cushion = M(chairCol, 0.7), seatFrame = M('#2b2e33', 0.35, { metalness: 0.7 });

  // ---- the umpire's chair: a tall framed stand, panelled below, seat and desk at about two metres ----
  const ch = new THREE.Group(); ch.position.set(ux, 0, 0); g.add(ch);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) taper(0.034, 0.026, 1.92, frame, sx * 0.36, 0.96, sz * 0.38, ch, sz * 0.035, 0, -sx * 0.04);   // legs, narrowing upward
  for (const y of [0.32, 1.02, 1.58]) { for (const sx of [-1, 1]) tube(0.017, 0.78, frame, sx * 0.355, y, 0, ch, Math.PI / 2); tube(0.017, 0.70, frame, 0, y, 0.375, ch, 0, 0, Math.PI / 2); tube(0.017, 0.70, frame, 0, y, -0.375, ch, 0, 0, Math.PI / 2); }
  rbox(0.80, 1.18, 0.035, 0.012, pad, 0.0, 0.70, 0.39, ch); rbox(0.80, 1.18, 0.035, 0.012, pad, 0.0, 0.70, -0.39, ch);   // side panels in the event's colour
  rbox(0.035, 1.18, 0.74, 0.012, pad, 0.37, 0.70, 0, ch);                                                                 // front panel, toward the court
  // the steps up the back, with a rail
  for (let i = 0; i < 6; i++) rbox(0.22, 0.035, 0.46, 0.01, frame, -0.52 - i * 0.0, 0.24 + i * 0.29, 0, ch);
  for (const sz of [-1, 1]) { tube(0.02, 1.95, frame, -0.62, 1.0, sz * 0.25, ch, 0, 0, -0.06); tube(0.014, 1.0, steel, -0.66, 1.75, sz * 0.27, ch, 0, 0, 0.1); }
  rbox(0.92, 0.06, 0.92, 0.02, frame, 0, 1.92, 0, ch);                                                                    // platform
  rbox(0.54, 0.09, 0.50, 0.035, cushion, 0.02, 2.00, 0, ch);                                                              // seat cushion
  rbox(0.08, 0.56, 0.52, 0.03, cushion, -0.25, 2.32, 0, ch, 0, 0, 0.12);                                                 // backrest
  for (const sz of [-1, 1]) { rbox(0.40, 0.045, 0.07, 0.018, cushion, 0.0, 2.24, sz * 0.30, ch); tube(0.014, 0.22, frame, 0.18, 2.12, sz * 0.30, ch); }   // armrests
  rbox(0.34, 0.035, 0.62, 0.012, dark, 0.36, 2.30, 0, ch, 0, 0, -0.30);                                                  // desk
  add(new THREE.PlaneGeometry(0.22, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5b7fa8').multiplyScalar(A.night ? 1.2 : 0.8) }), 0.37, 2.32, 0.12, ch, 0, Math.PI / 2, 0).rotation.set(0, Math.PI / 2, 0.3);   // the scoring tablet's screen
  tube(0.005, 0.20, steel, 0.30, 2.42, -0.16, ch, 0.0, 0, -0.5); add(new THREE.SphereGeometry(0.018, 10, 8), dark, 0.36, 2.52, -0.16, ch);       // microphone
  rbox(0.06, 0.06, 0.66, 0.02, frame, 0.44, 1.50, 0, ch);                                                                 // foot rail
  // a sunshade over the chair on day sessions: a pole and a sixteen-panel canopy
  if (!A.night) {
    tube(0.016, 1.465, steel, -0.34, 2.9575, 0.32, ch);   // (its top under the cloth: a little off the canopy's middle, it came out through it)
    const can = add(new THREE.ConeGeometry(1.0, 0.30, 16, 1, true), M('#f1efe8', 0.85, { side: THREE.DoubleSide }), -0.22, 3.62, 0.22, ch);
    // (each rib laid from the top down the inside of the canopy to its rim: turned by an x and a z angle together, the four
    // diagonal ones went off at the wrong slope and their ends stuck out through the cloth)
    const ribs = M('#c9ccd0', 0.4, { metalness: 0.6 }), up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), -0.3, Math.sin(a)).normalize(), L = 1.02, top = new THREE.Vector3(-0.22, 3.745, 0.22);
      const r = tube(0.006, L, ribs, top.x + d.x * L / 2, top.y + d.y * L / 2, top.z + d.z * L / 2, ch); r.rotation.set(0, 0, 0); r.quaternion.setFromUnitVectors(up, d); }
    void can;
  }

  // ---- each player's place either side of the chair: two padded chairs, a cooler, bags, towels, bottles ----
  const kit = spec.kitCols || ['#b3202e', '#1f4fa0', '#111317', '#e8e8e4'];
  const chair = (parent, z) => {
    const c = new THREE.Group(); c.position.set(0, 0, z); parent.add(c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tube(0.014, 0.45, seatFrame, sx * 0.20, 0.225, sz * 0.21, c);
    rbox(0.48, 0.075, 0.48, 0.03, cushion, 0.02, 0.47, 0, c);                                                            // seat
    rbox(0.07, 0.44, 0.48, 0.03, cushion, -0.23, 0.78, 0, c, 0, 0, 0.13);                                               // back
    for (const sz of [-1, 1]) { rbox(0.38, 0.035, 0.05, 0.015, seatFrame, 0.0, 0.66, sz * 0.25, c); tube(0.012, 0.19, seatFrame, 0.16, 0.565, sz * 0.25, c); tube(0.012, 0.36, seatFrame, -0.22, 0.75, sz * 0.25, c, 0, 0, 0.13); }
    return c;
  };
  const bagShape = (len, hgt, dep, col, x, y, z, parent, ry, tilt) => {
    const bg = new THREE.Group(); bg.position.set(x, y, z); bg.rotation.set(0, ry || 0, tilt || 0); parent.add(bg);
    rbox(dep, hgt, len, Math.min(dep, hgt) * 0.42, M(col, 0.7), 0, 0, 0, bg);                                           // the bag
    rbox(dep * 1.02, hgt * 0.22, len * 0.96, 0.02, M('#16181b', 0.6), 0, hgt * 0.18, 0, bg);                           // a darker panel round it
    add(new THREE.TorusGeometry(0.11, 0.012, 6, 14, Math.PI), M('#16181b', 0.6), 0, hgt / 2, 0, bg, 0, Math.PI / 2, 0); // handles
    return bg;
  };
  const towel = (parent, x, y, z, ry, col) => { const tm = M(col || '#f6f6f2', 0.97); rbox(0.03, 0.40, 0.46, 0.012, tm, x, y, z, parent, 0, ry || 0, 0); rbox(0.03, 0.30, 0.46, 0.012, tm, x - 0.06, y + 0.02, z, parent, 0, ry || 0, 0.3); };
  const bottle = (parent, x, z, col) => { tube(0.032, 0.20, M(col, 0.25, { transparent: true, opacity: 0.88 }), x, 0.10, z, parent); tube(0.033, 0.07, M('#f4f4f0', 0.6), x, 0.11, z, parent); tube(0.016, 0.03, M('#1b1d22', 0.5), x, 0.215, z, parent); };
  for (const s of [-1, 1]) {
    const b = new THREE.Group(); b.position.set(ux - 0.35, 0, s * 3.4); g.add(b);
    chair(b, -0.30 * s); const c2 = chair(b, 0.32 * s);
    towel(b, -0.28, 0.80, -0.30 * s, 0, '#f6f6f2');                                                                     // towel over his chair
    bagShape(0.78, 0.30, 0.30, kit[s > 0 ? 0 : 1], 0.03, 0.66, 0, c2, 0, 0);                                          // racket bag on the second chair
    bagShape(0.72, 0.28, 0.28, kit[s > 0 ? 2 : 3], 0.38, 0.14, -0.05 * s, b, 0.25 * s, 0);                              // a second bag on the ground
    bottle(b, 0.30, -0.62 * s, '#dfeaf2'); bottle(b, 0.38, -0.66 * s, '#f2a63a'); bottle(b, 0.30, -0.70 * s, '#dfeaf2');
    // drinks cooler: white body, dark glass door, a top in the event's colour
    const fr = new THREE.Group(); fr.position.set(-0.05, 0, s * 1.15); b.add(fr);
    rbox(0.54, 0.84, 0.58, 0.04, M('#eceef0', 0.35), 0, 0.42, 0, fr); rbox(0.02, 0.62, 0.44, 0.01, M('#0d1116', 0.1, { metalness: 0.6 }), 0.275, 0.46, 0, fr); rbox(0.56, 0.08, 0.60, 0.03, pad, 0, 0.87, 0, fr);
    tube(0.012, 0.36, steel, 0.30, 0.46, 0.18, fr);                                                                     // door handle
  }
  // ---- towel stands at the back corners, by the ball kids ----
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.Group(); t.position.set(sx * (A.hx - 3.4), 0, sz * (A.hz - 0.32)); g.add(t);
    for (const k of [-1, 1]) tube(0.012, 0.92, seatFrame, k * 0.17, 0.46, 0, t);
    tube(0.012, 0.36, seatFrame, 0, 0.90, 0, t, 0, 0, Math.PI / 2); rbox(0.40, 0.035, 0.30, 0.01, seatFrame, 0, 0.02, 0, t);
    rbox(0.30, 0.42, 0.025, 0.01, M('#f6f6f2', 0.97), 0, 0.70, 0.02, t);                                                 // the towel hanging over the bar
  }
  // ---- people: the umpire in the chair, ball kids at the back and by the net ----
  // They are alive (staff.js): heads after the ball, the umpire's calls, kids fetching dead balls between points.
  A.staff = [];
  const ST = A.staffModels || null;
  if (model || ST) {
    // the chair umpire: an official in the event's colours, seated above the net
    const ump = ST && ST.umpire ? new Person(ST.umpire, { height: 1.80, uniform: { top: spec.umpire || '#e9e7e0', bottom: spec.umpireLegs || '#c9bfa6' } })
      : new Person(model, { height: 1.80, top: spec.umpire || '#1c2b47', shorts: '#d8d2c2', skin: '#d7a67f', hair: '#3a2a1a', build: { arms: 1, legs: 1, chest: 1.04, depth: 1.06, shoulders: 0 } });
    poseSeated(ump, 0, 0.02, 0, 0.52);
    ump.root.position.set(ux + 0.02, 1.97 - 0.42, 0); ump.root.rotation.y = -Math.PI / 2; g.add(ump.root); A.staff.push(ump);
    // ball kids: boys and girls in the event's kit — shirt, shorts, white socks and shoes, a cap — at the back
    // corners and kneeling by the net. They are built on the athletic body the players use, scaled to a teenager.
    const kidTop = spec.kidTop || '#f1f1ec', kidBot = spec.kidShorts || '#1a1c22', capC = spec.kidCap || A.wallCol || spec.wall;
    const KSKIN = ['#e8c4a2', '#c99872', '#f0d2b4', '#8d5f42', '#d9ad86', '#b07a52'], KHAIR = ['#2a1c12', '#5a3a22', '#1a1412', '#8a6440', '#3a2a1c', '#c09a6a'];
    A.kids = [];
    const kid = (x, z, ry, kneel) => {
      const n = A.kids.length, k = new Person(model, {
        height: 1.50 + (n % 3) * 0.05, skin: KSKIN[n % KSKIN.length], hair: KHAIR[n % KHAIR.length], head: KID_HEADS[n % KID_HEADS.length], beard: 0,
        hairSpec: { top: 4, sides: n % 2 ? 9 : 2, back: n % 2 ? 14 : 2.5, tex: 'straight', fringe: 0.2, recede: 0, ears: !!(n % 2), c: KHAIR[n % KHAIR.length] },
        kit: { shirt: kidTop, layers: [['collar', capC, 0.93], ['sleeve', capC, 0.36, 0.40]], shorts: { c: kidBot, len: 'short' }, socks: { c: '#f2f2ee', top: 'ankle' }, shoes: { c: '#f2f2ee', c2: kidBot } },
        build: { arms: 0.84, legs: 0.86, calf: 0.86, chest: 0.86, depth: 0.86, shoulders: -0.018 }, doubleSide: true,
      });
      buildHair(k, k.look.hairSpec, { type: 'cap', c: capC });
      k.root.position.set(x, 0, z); k.root.rotation.y = ry; g.add(k.root); A.staff.push(k); A.kids.push({ k, person: k, x, z, ry, kneel });
    };
    // the back four a couple of metres off the wall, in line with the alleys, clear of the rounded corners and of
    // what stands against the wall, facing up the court; the other two on one knee by the net posts
    const bxk = COURT.halfWD - 0.2;
    let bzk = Math.max(COURT.halfLen + 2.6, A.hz - 1.75); while (bzk > COURT.halfLen + 2.6 && !insideCourt(A, bxk, bzk, 1.0)) bzk -= 0.05;
    for (const sz of [1, -1]) for (const sx of [-1, 1]) kid(sx * bxk, sz * bzk, Math.atan2(sx * bxk * 0.25, sz * bzk), false);
    kid(COURT.halfWD + 2.3, 0.0, Math.PI / 2, true); kid(-(COURT.halfWD + 3.6), 0.9, -Math.PI / 2, true);
    // what they run round: the chair, the net posts, the players' benches and coolers, the towel stands
    const NP = COURT.halfWD + 0.914, obstacles = [{ x: ux - 0.08, z: 0, r: 0.62 }, { x: NP, z: 0, r: 0.12 }, { x: -NP, z: 0, r: 0.12 }];
    for (const s of [-1, 1]) obstacles.push({ x: ux - 0.35, z: s * 3.4, r: 0.75 }, { x: ux - 0.4, z: s * 4.55, r: 0.45 }, { x: A.hx - 3.4, z: s * (A.hz - 0.32), r: 0.3 }, { x: -(A.hx - 3.4), z: s * (A.hz - 0.32), r: 0.3 });
    // and what stands on the floor against the walls (the clock cabinets, the partners' blocks): a row of circles along each box
    for (const o of root.children) {
      const P = o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters; if (!P || o.position.y - P.height / 2 > 0.05 || P.height > 2.6 || P.width > 4 || !insideCourt(A, o.position.x, o.position.z, -0.5) || insideCourt(A, o.position.x, o.position.z, 2.5)) continue;
      const n = Math.max(1, Math.ceil(P.width / P.depth)), c = Math.cos(o.rotation.y), sn = Math.sin(o.rotation.y);
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n * P.width - P.width / 2; obstacles.push({ x: o.position.x + c * u, z: o.position.z - sn * u, r: Math.max(P.depth / 2, P.width / n / 2) + 0.05, solid: true }); }
    }
    A.staffCtl = new Staff(A, { ump, umpAt: { tablet: new THREE.Vector3(ux + 0.37, 2.32, 0.12), mic: new THREE.Vector3(ux + 0.36, 2.52, -0.16) }, kids: A.kids, group: g, obstacles });
    A.staffWatch = (m, game) => A.staffCtl.watch(m, game);
  }
  A.furniture = g;
  // the chair, benches, bags and fridges are several hundred small boxes and tubes: draw them as one mesh per material
  g.updateMatrixWorld(true);
  const groups = new Map(), gone = [];
  // (never what is fixed to someone's bones — a cap, a racket — or it would be left behind as he moves)
  const onPerson = o => { for (let a = o.parent; a; a = a.parent) if (a.isBone) return true; return false; };
  g.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.material.map && o.geometry.index && o.geometry.attributes.normal && !onPerson(o)) { const k = o.material.uuid; if (!groups.has(k)) groups.set(k, { m: o.material, list: [] }); const gg = o.geometry.clone(); gg.applyMatrix4(o.matrixWorld); groups.get(k).list.push(gg); gone.push(o); } });
  for (const o of gone) o.parent.remove(o);
  for (const { m, list } of groups.values()) { const me = new THREE.Mesh(mergeGeo(list), m); me.castShadow = true; me.receiveShadow = true; root.add(me); for (const x of list) x.dispose(); }
}

// ---------- light ----------
// The sky is a photograph; its measured sun and sky strengths set the lamps in the scene.
function buildLighting(A, spec, q, skyTex) {
  const root = A.root, L = spec.light || {};
  const W = WEATHER[spec.weather] || WEATHER.clear;
  const indoor = !!(spec.indoor || W.indoor);
  const dark = !!(W.night || indoor);
  A.night = dark; A.weather = W; A.indoorNow = indoor;
  const SL = W.sky ? skyLight(W.sky, { Esky: W.night ? 0.07 : W.lamps >= 1 ? 0.55 : 1.5 }) : null;
  const hasSun = !!(SL && SL.sunI > 0.05 && !W.night);
  // the sun comes from the side of the court the venue says, at the height the photograph says
  // ...unless the weather names an hour: then it stands where the real sun does over this court on
  // the event's dates, and the photograph is tilted to agree (never by more than 24 degrees)
  const el0 = SL ? Math.max(0.06, SL.el) : 0.8, want = SL && W.hour != null && spec.sunAt ? spec.sunAt(W.hour) : null;
  const az = (L.sunAz == null ? 62 : L.sunAz) * Math.PI / 180, el = want == null ? el0 : THREE.MathUtils.clamp(want * Math.PI / 180, el0 - 0.42, el0 + 0.42);
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  A.sunDir = sunDir; A.hasSun = hasSun;
  const lights = new THREE.Group(); root.add(lights);
  const shadowSize = q >= 3 ? 4096 : q >= 1 ? 2048 : 1024;
  const fit = (cam, r) => { cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 20; cam.far = 200; cam.updateProjectionMatrix(); };
  const mkDir = (col, int, dir, cast) => {
    const d = new THREE.DirectionalLight(col, int); d.position.copy(dir).multiplyScalar(110); lights.add(d); lights.add(d.target);
    if (cast) { const sz = cast === 'lamp' ? Math.min(1024, shadowSize) : shadowSize; d.castShadow = true; d.shadow.mapSize.set(sz, sz); fit(d.shadow.camera, cast === 'lamp' ? 17 : 26); d.shadow.bias = -0.0005; d.shadow.normalBias = 0.045; d.shadow.radius = 2.4; }
    return d;
  };
  A.lamps = []; A.sun = null;
  let Eh = SL ? SL.Esky : 0;                               // light reaching a level surface, for exposure
  if (hasSun) {
    const c = SL.sunCol, sc = new THREE.Color(c[0], c[1], c[2]);
    A.sun = mkDir(sc, SL.sunI * (L.sunScale || 1), sunDir, true);
    Eh += SL.sunI * Math.sin(el);
    ARENA_U.uArenaOn.value = 1;
  } else ARENA_U.uArenaOn.value = 0;
  // what the court throws back up at the players and the walls
  A.hemi = new THREE.HemisphereLight(new THREE.Color('#000000'), new THREE.Color(spec.inner).lerp(new THREE.Color('#8a8a8a'), 0.78), 0); lights.add(A.hemi);
  const lampK = W.lamps || 0;
  if (lampK > 0.01) {
    // banks of lamps high above the four corners: four soft shadows under every player
    const col = new THREE.Color(L.lampCol || '#f3f6ff'), I = (L.lampI == null ? 1.95 : L.lampI) * lampK;
    const ly = Math.min(A.roofY || A.rimTop + 6, 34), px = A.hx + 8, pz = A.hz * 0.7;
    const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
    corners.forEach((c, i) => {
      const dir = new THREE.Vector3(c[0] * px, ly, c[1] * pz).normalize();
      A.lamps.push(mkDir(col, I, dir, !hasSun && (i === 0 || i === 3) && (q >= 1 || i === 0) ? 'lamp' : false));      // two crossing shadows from opposite corners
      Eh += I * dir.y;
    });
    // the fittings themselves, bright enough to bloom
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9.4, 10).multiplyScalar(Math.min(1, lampK + 0.2)) });
    const lg = new THREE.BoxGeometry(0.7, 0.25, 0.5);
    const im = new THREE.InstancedMesh(lg, lampMat, 400); let k = 0; const M = new THREE.Matrix4();
    const y = (A.roofY || A.rimTop + 5) - 0.6;
    if (spec.roof && !spec.roof.closed && spec.roof.type !== 'none' && !indoor) {
      const ox = spec.roof.openX, oz = spec.roof.openZ;
      for (const s of [-1, 1]) for (let i = 0; i < 26; i++) { M.makeTranslation(s * (ox + 0.8), y, -oz * 0.85 + oz * 1.7 * i / 25); im.setMatrixAt(k++, M); }
      for (const s of [-1, 1]) for (let i = 0; i < 12; i++) { M.makeTranslation(-ox * 0.8 + ox * 1.6 * i / 11, y, s * (oz + 0.8)); im.setMatrixAt(k++, M); }
    } else if (indoor) {
      const rows = 6;
      for (let r = 0; r < rows; r++) for (let i = 0; i < 14; i++) { M.makeTranslation(-12 + 24 * r / (rows - 1), y, -20 + 40 * i / 13); im.setMatrixAt(k++, M); }
    } else if (A.F && A.outerD) {
      // a ring of lamp banks along the top of the bowl, tilted down at the court
      const R = ring(A.F, A.outerD - 0.8, 0), step = 3.2; let next = 0;
      for (let i = 0; i < R.length && k < 380; i++) { const p = R[i]; if (p.s < next) continue; next = p.s + step;
        for (let j = 0; j < 3; j++) { M.makeRotationY(Math.atan2(-p.nx, -p.nz)); M.multiply(new THREE.Matrix4().makeRotationX(0.5)); M.setPosition(p.x + (j - 1) * 0.8 * p.nz, A.rimTop + 0.45, p.z - (j - 1) * 0.8 * p.nx); im.setMatrixAt(k++, M); } }
      const frame = new THREE.Mesh(band(ring(A.F, A.outerD - 1.1, A.rimTop + 0.15), ring(A.F, A.outerD - 0.4, A.rimTop + 0.15), 1, 1), new THREE.MeshStandardMaterial({ color: '#1b1e23', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }));
      root.add(frame);
    } else {
      // open ground: four towers
      const tm = new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.6, metalness: 0.5 });
      for (const c of corners) {
        const tx = c[0] * (A.hx + A.outerD + 3), tz = c[1] * (A.hz + A.outerD * 0.6), th = A.rimTop + 14;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, th, 8), tm); pole.position.set(tx, th / 2, tz); root.add(pole);
        const ang = Math.atan2(tx, tz);
        for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { M.makeRotationY(ang + Math.PI); M.setPosition(tx - c[0] * 0.5 + (i - 2.5) * 0.9 * Math.abs(Math.cos(ang)), th - r * 0.6, tz + (i - 2.5) * 0.9 * Math.abs(Math.sin(ang))); im.setMatrixAt(k++, M); }
      }
    }
    im.count = k; root.add(im);
  }
  // How much of the court the sun reaches over the stands (the same test the shaders make), at the
  // players' feet and their chests. When the stands put the court in shade, as on most late
  // afternoons, a broadcast camera opens up and balances its colour for the court, not the sky:
  // the sunlit seats burn out and the court reads in its own colours.
  let vis = 1;
  if (hasSun && A.open) {
    let n = 0, lit = 0; const o = A.open, ty = Math.max(0.03, sunDir.y);
    for (let ix = -4; ix <= 4; ix++) for (let iz = -6; iz <= 6; iz++) for (const y of [0.05, 1.3]) {
      const x = ix * 1.45, z = iz * 2.15, dy = o.y - y; n++;
      if (dy <= 0) { lit++; continue; }
      const qx = Math.abs(x + sunDir.x * dy / ty) - (o.hx - o.rc), qz = Math.abs(z + sunDir.z * dy / ty) - (o.hz - o.rc);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - o.rc;
      lit += THREE.MathUtils.smoothstep(-sd, -0.6, 0.6);
    }
    vis = lit / n;
  }
  A.courtSun = vis;
  const EhCourt = hasSun ? Eh - SL.sunI * Math.sin(el) * (1 - vis) : Eh, shade = hasSun ? 1 - vis : 0;
  A.wb = [1, 1, 1];
  if (SL && shade > 0.05 && !W.night) {
    const k = SL.skyCol, l = 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
    A.wb = k.map(c => THREE.MathUtils.lerp(1, THREE.MathUtils.clamp(l / Math.max(1e-4, c), 0.82, 1.3), shade * 0.85));
  }
  A.hemi.intensity = Math.max(0.04, EhCourt * 0.055);
  // theatre: under lights the court is a bright pool and the seats fall away into the dark
  const lit = lampK >= 0.99 && !hasSun;
  ARENA_U.uStandDim.value = lit ? (dark ? 0.26 : 0.5) : 1;
  ARENA_U.uPool.value = lit && dark ? 1 : 0;
  { const c = hasSun ? new THREE.Color(SL.sunCol[0], SL.sunCol[1], SL.sunCol[2]).multiplyScalar(0.12 * Math.min(2.2, SL.sunI)) : new THREE.Color(L.lampCol || '#e6eeff').multiplyScalar(lampK > 0.3 ? 1.05 : 0.25); ARENA_U.uRimCol.value.copy(c); }
  if (lit) {
    // shafts from the lamp banks, visible against the dark seats
    const ly = Math.min(A.roofY || A.rimTop + 6, 34), px = A.hx + 8, pz = A.hz * 0.7;
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uCol: { value: new THREE.Color(L.lampCol || '#dfe8ff') } },
      vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = edge * smoothstep(0.0, 0.25, vT) * (1.0 - vT) * 0.085; gl_FragColor = vec4(uCol * a, a); }' });
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const from = new THREE.Vector3(sx * px, ly, sz * pz), to = new THREE.Vector3(sx * 2.5, 0, sz * 5), len = from.distanceTo(to);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 11, len, 20, 1, true), bm); cone.position.copy(from).lerp(to, 0.5); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize()); cone.renderOrder = 5; cone.frustumCulled = false; bm.userData.noSight = !globalThis.__beamSightOld; root.add(cone);   /* (light, not a thing - marked on the material, which the meshes merged later keep: the broadcast camera's sight lines go through it - counted solid, at night it craned the camera to the top and looked down near vertically) */
    }
  }
  if (A.flash) A.flash.visible = lit || dark;
  ARENA_U.uArenaOpen.value.set(A.open.hx, A.open.hz, A.open.rc, A.open.y);
  ARENA_U.uArenaFloor.value.set(A.hx, A.hz, A.F ? A.F.rc : 5, spec.wallH || 1.15);
  ARENA_U.uArenaSun.value.copy(sunDir);

  // the dome
  A.sky = null; A.skyRot0 = 0;
  if (skyTex && SL && !indoor) {
    const gain = W.gain != null ? W.gain * (SL.gain / 1.0) : SL.gain;
    // below the horizon the dome stands in for what a roof or a wall sees looking down: stands and
    // crowd more than court, so mostly neutral with a little of the court's colour
    A.sky = makeSkyDome(skyTex, { gain, tint: W.tint, boost: W.night ? 0 : 1.6, ground: '#' + new THREE.Color(spec.outer || spec.inner).lerp(new THREE.Color('#77797c'), 0.8).getHexString() });
    A.sky.scale.setScalar(4000);
    // turn the photograph until its sun stands where the arena's sun is
    A.skyRot0 = Math.atan2(sunDir.x, -sunDir.z) - SL.az;
    A.sky.material.uniforms.uRot.value = A.skyRot0;
    A.skyTilt = f => { A.sky.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.cos(az) * f, 0, Math.sin(az) * f), el - el0); }; A.skyTilt(1);
  }
  const sc = SL ? SL.skyCol : [0.1, 0.12, 0.18], fb = dark ? 0.035 : W.lamps >= 1 ? 0.3 : 0.78;
  A.fogCol = new THREE.Color(L.fog || new THREE.Color(sc[0] * fb, sc[1] * fb, sc[2] * fb));
  A.exposure = L.exposure == null ? THREE.MathUtils.clamp(1.15 * Math.PI / (0.9 * Math.max(0.5, EhCourt)), 0.3, 2.4) * (L.expose || 1) : L.exposure;
  A.envI = L.envI == null ? 1.0 : L.envI;
  A.Eh = Eh;
}

// Bake what surrounds the court into the environment map that lights every surface.
export function arenaEnvironment(A, renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  if (A.sky) {
    const parent = A.sky.parent; s.add(A.sky);
    const u = A.sky.material.uniforms, b = u.uBoost.value; u.uBoost.value = 0;   // the sun is its own light
    A.env = pm.fromScene(s, 0, 1, 9000);
    u.uBoost.value = b; s.remove(A.sky); if (parent) parent.add(A.sky);
  } else {
    s.background = new THREE.Color('#05070a');
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 12.5, 14) });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 9), lamp); m.position.set(sx * 34, 30, sz * 30); s.add(m); }
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(A.spec.inner).multiplyScalar(0.45) })); fl.rotation.x = -Math.PI / 2; fl.position.y = -2; s.add(fl);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#10141c', side: THREE.BackSide })); wall.position.y = 15; s.add(wall);
    A.env = pm.fromScene(s, 0.02, 1, 400);
  }
  pm.dispose();
  return A.env.texture;
}

// ---------- what you see over the top of the stands ----------
function buildBackdrop(A, spec, rnd) {
  const kind = spec.backdrop || 'none'; if (kind === 'none' || spec.indoor) return;
  const w = 2048, h = 256, c = TX.canvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const haze = A.night ? [14, 18, 28] : [176, 196, 220];
  const col = (r, gg, b, a) => `rgba(${Math.round(r)},${Math.round(gg)},${Math.round(b)},${a})`;
  const layer = (base, amp, freq, rgbc, a) => {
    g.fillStyle = col(rgbc[0], rgbc[1], rgbc[2], a); g.beginPath(); g.moveTo(0, h);
    let y = base; const ph = rnd() * 10;
    for (let x = 0; x <= w; x += 4) { y = base - amp * (0.5 + 0.5 * Math.sin(x * freq + ph) * Math.sin(x * freq * 0.37 + ph * 2) + 0.25 * Math.sin(x * freq * 3.1 + ph)); g.lineTo(x, y); }
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  const mixc = (a, t) => [a[0] + (haze[0] - a[0]) * t, a[1] + (haze[1] - a[1]) * t, a[2] + (haze[2] - a[2]) * t];
  if (kind === 'hills' || kind === 'sea') {
    layer(150, 120, 0.004, mixc(A.night ? [20, 24, 34] : [120, 112, 110], 0.55), 1);
    layer(190, 70, 0.009, mixc(A.night ? [16, 20, 28] : [104, 100, 92], 0.3), 1);
  }
  if (kind === 'city' || kind === 'sea') {
    for (let i = 0; i < 150; i++) {
      const x = rnd() * w, bw = 8 + rnd() * 26, bh = 20 + rnd() * rnd() * 150, t = 0.25 + rnd() * 0.45;
      const b = mixc(A.night ? [18, 22, 32] : [96 + rnd() * 50, 100 + rnd() * 50, 110 + rnd() * 50], t);
      g.fillStyle = col(b[0], b[1], b[2], 1); g.fillRect(x, h - bh, bw, bh);
      if (A.night) for (let k = 0; k < bh / 5; k++) if (rnd() < 0.35) { g.fillStyle = `rgba(255,${200 + rnd() * 40},${130 + rnd() * 60},${0.4 + rnd() * 0.5})`; g.fillRect(x + 2 + rnd() * (bw - 5), h - bh + 3 + k * 5, 2, 2); }
    }
  }
  // trees close in around the ground
  const tc = spec.trees === false ? 0 : 260;
  for (let i = 0; i < tc; i++) {
    const x = rnd() * w, r = 10 + rnd() * 22, y = h - 6 - rnd() * 26, t = rnd() * 0.25;
    const b = mixc(A.night ? [10, 16, 12] : [44 + rnd() * 30, 78 + rnd() * 34, 40 + rnd() * 20], t);
    g.fillStyle = col(b[0], b[1], b[2], 1); g.beginPath(); g.ellipse(x, y, r, r * (0.7 + rnd() * 0.5), 0, 0, 6.3); g.fill();
  }
  const t = TX.tex(c, { aniso: 4 }); t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(2, 1);
  const R = 420, H = 120;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.position.y = H / 2 - 8; A.root.add(m);
  // one landmark on the skyline (`peak`: a granite peak `h` metres tall on the ring, `az` degrees round from
  // behind the far baseline toward +x, a statue on its summit if `statue`): drawn once, on its own card
  const P = spec.peak;
  if (P) {
    const pw = 512, ph = 256, pc = TX.canvas(pw, ph), pg = pc.getContext('2d'), sx = pw * 0.55, top = ph * 0.14;
    const rock = mixc(A.night ? [14, 18, 22] : [76, 86, 74], 0.4);
    pg.fillStyle = col(rock[0], rock[1], rock[2], 1); pg.beginPath(); pg.moveTo(0, ph);
    // steep and sharp-topped, the cliff side steeper than the other
    for (let x = 0; x <= pw; x += 4) { const u = (x - sx) / (pw * (x < sx ? 0.36 : 0.5)); pg.lineTo(x, ph - (ph - top) * Math.pow(1 / (1 + 7 * u * u), 0.9) * (1 - 0.05 * Math.sin(x * 0.07) * Math.abs(u))); }
    pg.lineTo(pw, ph); pg.closePath(); pg.fill();
    if (P.statue) {
      // floodlit after dark, pale stone by day: a pedestal, the figure, and its outstretched arms
      const s = A.night ? [246, 240, 222] : mixc([226, 224, 214], 0.15), sh = ph * 0.075;
      pg.fillStyle = col(s[0], s[1], s[2], 1);
      pg.fillRect(sx - sh * 0.12, top - sh * 0.32, sh * 0.24, sh * 0.34); pg.fillRect(sx - sh * 0.07, top - sh, sh * 0.14, sh * 0.7); pg.fillRect(sx - sh * 0.4, top - sh * 0.82, sh * 0.8, sh * 0.09);
    }
    const pt = TX.tex(pc, { clamp: true, aniso: 4 }), a = (P.az || 0) * Math.PI / 180, D = R - 12;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(P.w || P.h * 2.2, P.h), new THREE.MeshBasicMaterial({ map: pt, transparent: true, fog: false, depthWrite: false }));
    card.position.set(Math.sin(a) * D, P.h / 2 - 8, -Math.cos(a) * D); card.rotation.y = Math.atan2(-card.position.x, -card.position.z); card.renderOrder = 1; A.root.add(card);
  }
  if (kind === 'sea') {
    const sea = new THREE.Mesh(new THREE.RingGeometry(120, 3000, 48, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: A.night ? '#0a1322' : '#3f78a8', fog: false }));
    sea.rotation.x = -Math.PI / 2; sea.rotation.z = (spec.seaAz || 0) * Math.PI / 180; sea.position.y = -14; A.root.add(sea);
  }
}
