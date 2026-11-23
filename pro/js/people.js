// Rally Pro — real people. A photo-textured, rigged human (Microsoft Rocketbox avatar, MIT
// licence) dressed in a re-colourable kit, and a driver that poses its skeleton from the
// joint positions the animation solves for.
import * as THREE from 'three';
import { ALL_HEADS, KID_HEADS } from './looks.js';
import { FACES } from './facedata.js';
import { BODY_SHAPES } from './bodydata.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { sunMask } from './arena.js';

const base = name => new URL('../assets/people/' + name, import.meta.url).href;
const _models = new Map();
function loadTex(file, srgb) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(base(file), t => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.anisotropy = 4; res(t); }, undefined, rej));
}
export function loadPerson(key = 'm04') {
  if (_models.has(key)) return _models.get(key);
  const p = (async () => {
    const [gltf, info, bc, bm, bn, hc, hm, hn, shapes] = await Promise.all([
      new Promise((res, rej) => new GLTFLoader().load(base(key + '.glb'), res, undefined, rej)),
      fetch(base(key + '.json')).then(r => r.json()),
      loadTex(key + '_body_color.jpg', true), loadTex(key + '_body_mask.png', false), loadTex(key + '_body_normal.jpg', false),
      loadTex(key + '_head_color.jpg', true), loadTex(key + '_head_mask.png', false), loadTex(key + '_head_normal.jpg', false),
      // each player's body (bodydata.js); without it the players fall back to the older radial build
      BODY_SHAPES && BODY_SHAPES.file.startsWith(key + '_') ? fetch(base(BODY_SHAPES.file)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null) : null,
    ]);
    const M = { key, scene: gltf.scene, info, tex: { bc, bm, bn, hc, hm, hn } };
    if (shapes) M.shapes = readShapes(M, shapes);
    await loadHeads(M, [...new Set([...ALL_HEADS, ...KID_HEADS, ...Object.values(FACES).map(f => f.head)])]).catch(e => console.warn('heads', e));
    await loadFaces().catch(e => console.warn('faces', e));
    return M;
  })();
  _models.set(key, p); return p;
}

// Each player's body (tools/body_shapes.py): int16 blocks, one [vertex][xyz] per block over the body mesh — the step
// from each vertex onto the reference body, how bare each vertex is (sleeved arm, sleeveless arm, leg), which sheet of
// the leg it is on (skin, the model's shorts shell, their lining), the reference surface's normal, then one block of
// offsets per player. Also which vertices share a place (seams): to keep them together, and to reshade the surface.
function readShapes(M, buf) {
  let me = null; M.scene.traverse(o => { if (o.isSkinnedMesh && /body/i.test(o.material.name || '')) me = o; });
  const S = BODY_SHAPES, n = me ? me.geometry.attributes.position.count : 0, blk = n * 3, H = 4;
  if (!n || n !== S.verts || buf.byteLength !== (H + S.names.length) * blk * 2) { console.warn('body shapes do not fit the model'); return null; }
  // a seam's copies of a vertex are one point of the surface (pid); for shading, the two faces of a turned-in hem, at
  // the same place but facing apart, are not (wid)
  const P0 = me.geometry.attributes.position.array, N0 = me.geometry.attributes.normal.array, wid = new Int32Array(n), pid = new Int32Array(n), ids = new Map(), pids = new Map(), r = (a, i, s) => Math.round(a[i] * s);
  for (let i = 0; i < n; i++) {
    const j = i * 3, kp = r(P0, j, 1e5) + ',' + r(P0, j + 1, 1e5) + ',' + r(P0, j + 2, 1e5), k = kp + ',' + r(N0, j, 2) + ',' + r(N0, j + 1, 2) + ',' + r(N0, j + 2, 2);
    if (!ids.has(k)) ids.set(k, ids.size); wid[i] = ids.get(k); if (!pids.has(kp)) pids.set(kp, pids.size); pid[i] = pids.get(kp);
  }
  const pcount = new Uint16Array(pids.size); for (let i = 0; i < n; i++) pcount[pid[i]]++;
  const of = {}, blkAt = b => new Int16Array(buf, b * blk * 2, blk); S.names.forEach((nm, i) => { of[nm] = blkAt(H + i); });
  return { n, P0, snap: blkAt(0), bare: blkAt(1), kind: blkAt(2), nx: blkAt(3), of, unit: S.unit, shoulders: S.shoulders || {}, wid, nw: ids.size, pid, pcount, index: me.geometry.index.array };
}
// area-weighted normals of a surface, one per shared position
function weldedNormals(pos, sh, out) {
  const ix = sh.index, wid = sh.wid, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  out.fill(0);
  for (let t = 0; t < ix.length; t += 3) {
    a.fromBufferAttribute(pos, ix[t]); b.fromBufferAttribute(pos, ix[t + 1]).sub(a); c.fromBufferAttribute(pos, ix[t + 2]).sub(a); b.cross(c);
    for (let e = 0; e < 3; e++) { const w = wid[ix[t + e]] * 3; out[w] += b.x; out[w + 1] += b.y; out[w + 2] += b.z; }
  }
  for (let w = 0; w < out.length; w += 3) { const l = Math.hypot(out[w], out[w + 1], out[w + 2]) || 1; out[w] /= l; out[w + 1] /= l; out[w + 2] /= l; }
  return out;
}

// A Rocketbox avatar used as it comes — its own clothes, hair and face — for spectators,
// ball kids and officials. `path` is relative to assets/people.
export function loadAvatar(path) {
  if (_models.has(path)) return _models.get(path);
  const p = new Promise((res, rej) => new GLTFLoader().load(base(path), g => {
    g.scene.traverse(o => { if (/^Bip0\d_/.test(o.name)) o.name = 'Bip01_' + o.name.slice(6); });      // the children's skeleton is numbered differently
    // remember each vertex's height in the bind pose: clothing is split there, however the figure is later posed
    g.scene.traverse(o => { if (o.isSkinnedMesh && !o.geometry.attributes.aBindY) { const p = o.geometry.attributes.position, h = new Float32Array(p.count); for (let i = 0; i < p.count; i++) h[i] = p.getY(i); o.geometry.setAttribute('aBindY', new THREE.BufferAttribute(h, 1)); } });
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene);
    res({ key: path, scene: g.scene, info: { height: box.max.y - box.min.y }, plain: true });
  }, undefined, rej));
  _models.set(path, p); return p;
}

// ---------- another man's head on the player's body ----------
// The athletic model has one face. The library's other men have their own — photographed
// skin, eyes and brows — on the same skeleton, so a player takes the head of whichever of them
// is nearest his type; it is moved onto this body's head joint and skinned to this body's bones.
export const HEADS = new Map();
const HEAD_C = new THREE.Vector3(0, 1.705, 0.012);            // the middle of the skull in the player model's bind space
function hairlineAt(aphi) { const d = aphi * 180 / Math.PI, sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }, L = (a, b, t) => a + (b - a) * t; return (d < 40 ? L(57, 66, sm(d / 40)) : d < 86 ? L(66, 93, sm((d - 40) / 46)) : L(93, 133, sm((d - 86) / 94))) * Math.PI / 180; }
export async function loadHeads(target, list) {
  let tgt = null; target.scene.traverse(o => { if (o.isSkinnedMesh && /head/i.test(o.material.name || '')) tgt = o; });
  const ti = tgt.skeleton.bones.findIndex(b => b.name === 'Bip01_Head'), tp = new THREE.Vector3().setFromMatrixPosition(tgt.skeleton.boneInverses[ti].clone().invert());
  const tNames = tgt.skeleton.bones.map(b => b.name);
  await Promise.all(list.map(async name => {
    if (HEADS.has(name)) return;
    const M = await loadAvatar(name + '.glb'); let src = null;
    M.scene.traverse(o => { if (o.isSkinnedMesh && (o.material.name || '') === 'head') src = o; });
    if (!src) return;
    const sk = src.skeleton, hi = sk.bones.findIndex(b => b.name === 'Bip01_Head'), hp = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[hi].clone().invert());
    const geo = src.geometry.clone(); geo.translate(tp.x - hp.x, tp.y - hp.y, tp.z - hp.z);
    // The donor's neck ends where its own collar began, which on this body leaves the nape open above the
    // shirt. Take the open edge at the foot of the neck down inside the collar and spread it to fill the opening.
    { const P = geo.attributes.position, ix = geo.index, id = new Map(), vid = new Int32Array(P.count), cnt = new Map();
      for (let i = 0; i < P.count; i++) { const k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4); if (!id.has(k)) id.set(k, id.size); vid[i] = id.get(k); }
      for (let t = 0; t < ix.count; t += 3) for (let e = 0; e < 3; e++) { const a = vid[ix.getX(t + e)], b = vid[ix.getX(t + (e + 1) % 3)], k = a < b ? a + '_' + b : b + '_' + a; cnt.set(k, (cnt.get(k) || 0) + 1); }
      const open = new Set(); for (const [k, n] of cnt) if (n === 1) { const q = k.split('_'); open.add(+q[0]); open.add(+q[1]); }
      // down at the back and sides, where the collar stands highest; the front, already low, only a little, and never forward into the shirt
      for (let i = 0; i < P.count; i++) if (open.has(vid[i]) && P.getY(i) < 1.60) { const z = P.getZ(i), back = Math.min(1, Math.max(0, (0.03 - z) / 0.06)); P.setXYZ(i, P.getX(i) * (1 + 0.25 * back), Math.min(P.getY(i), 1.445 - 0.02 * back), z < -0.012 ? -0.012 + (z + 0.012) * 1.3 : z); } }
    // a smaller head (a child's) has a thinner neck than this body's collar: fill it out to the collar below the jaw
    { const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > 1.63) continue; const x = P.getX(i), z = P.getZ(i) + 0.012, r = Math.hypot(x, z * 1.08), want = 0.064 * Math.min(1, (1.63 - y) / 0.05); if (r > 1e-4 && r < want) { const k = want / r; P.setXYZ(i, x * k, y, z * k - 0.012); } } }
    // skin it to the player's skeleton: the same bones by name
    const si = geo.attributes.skinIndex, map = sk.bones.map(b => { const k = tNames.indexOf(b.name); return k >= 0 ? k : ti; });
    for (let i = 0; i < si.count; i++) si.setXYZW(i, map[si.getX(i)], map[si.getY(i)], map[si.getZ(i)], map[si.getW(i)]);
    // where hair grows on it, and the brows: those take the player's own hair colour
    const pos = geo.attributes.position, uv = geo.attributes.uv, zone = new Float32Array(pos.count), brows = new Float32Array(pos.count), sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), dx = x - HEAD_C.x, dy = y - HEAD_C.y, dz = z - HEAD_C.z, r = Math.hypot(dx, dy, dz) || 1;
      const th = Math.acos(Math.max(-1, Math.min(1, dy / r))), tH = hairlineAt(Math.abs(Math.atan2(dx, dz)));
      let zn = sm((tH + 0.10 - th) / 0.14);
      const brow = ((Math.abs(x) - 0.034) / 0.028) ** 2 + ((y - 1.704) / 0.012) ** 2 + ((z - 0.115) / 0.03) ** 2; if (brow < 1) { brows[i] = sm((1 - brow) * 2.5); zn = Math.max(zn, brows[i]); }
      zone[i] = zn;
    }
    geo.setAttribute('aZone', new THREE.BufferAttribute(zone, 1)); geo.setAttribute('aBrow', new THREE.BufferAttribute(brows, 1));
    // The eyelids. These heads carry eyelid bones but no skin on them, so a blink is made here instead: the skin just above
    // each eyeball (found as the vertices its eye bone moves) is given the way it moves to close over the eye (the rim of
    // the lid to a little below the eye's middle, the skin up toward the brow less and less), kept just clear of the
    // eyeball's surface; the shader moves it that far times uBlink.
    { const lid = new Float32Array(pos.count * 3), sw = geo.attributes.skinWeight, off = new THREE.Vector3(tp.x - hp.x, tp.y - hp.y, tp.z - hp.z);
      for (const nm of ['Bip01_LEye', 'Bip01_REye']) {
        const di = sk.bones.findIndex(b => b.name === nm), ti2 = tNames.indexOf(nm); if (di < 0 || ti2 < 0) continue;
        const C = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[di].clone().invert()).add(off);
        let R = 0, n = 0; for (let i = 0; i < pos.count; i++) if (si.getX(i) === ti2 && sw.getX(i) > 0.5) { R += Math.hypot(pos.getX(i) - C.x, pos.getY(i) - C.y, pos.getZ(i) - C.z); n++; }
        if (!n) continue; R /= n; R = Math.min(0.016, Math.max(0.009, R));
        const smo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }, q = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          if (si.getX(i) === ti2 && sw.getX(i) > 0.5) continue;                       // the eyeball itself
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), dx = x - C.x, dy = y - C.y, dz = z - C.z;
          if (dz < 0.15 * R || Math.abs(dx) > 1.3 * R || dy < -0.1 * R || dy > 1.2 * R || brows[i] > 0.02) continue;     // (below the brow: it stays put)
          const w = smo(1.3 * R, 0.85 * R, Math.abs(dx)) * smo(1.2 * R, 0.45 * R, dy); if (w <= 0) continue;
          q.set(x, y + (C.y - 0.3 * R - y) * w, z);
          const d = q.distanceTo(C), clear = R + 0.0016; if (d < clear) q.sub(C).multiplyScalar(clear / Math.max(d, 1e-5)).add(C);
          lid[i * 3] = q.x - x; lid[i * 3 + 1] = q.y - y; lid[i * 3 + 2] = q.z - z; } }
      geo.setAttribute('aLid', new THREE.BufferAttribute(lid, 3)); }
    // his own skin and hair, read off the picture: the player's colours are set against these
    const img = src.material.map.image, cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g2 = cv.getContext('2d', { willReadFrequently: true }); g2.drawImage(img, 0, 0, 256, 256); const px = g2.getImageData(0, 0, 256, 256).data;
    const at = i => { const u = Math.min(255, Math.max(0, Math.floor(uv.getX(i) * 256))), v = Math.min(255, Math.max(0, Math.floor(uv.getY(i) * 256))), k = (v * 256 + u) * 4; return [px[k] / 255, px[k + 1] / 255, px[k + 2] / 255]; };
    const skin = [0, 0, 0], hair = []; let ns = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i)), y = pos.getY(i), z = pos.getZ(i);
      if (zone[i] < 0.02 && z > 0.07 && ((y > 1.63 && y < 1.67 && x > 0.025 && x < 0.06) || (y > 1.72 && y < 1.745 && x < 0.03))) { const c = at(i); skin[0] += c[0]; skin[1] += c[1]; skin[2] += c[2]; ns++; }
      if (zone[i] > 0.95 && y > 1.76) { const c = at(i); hair.push(0.3 * c[0] + 0.5 * c[1] + 0.2 * c[2]); }
    }
    const sc = new THREE.Color().setRGB(skin[0] / Math.max(1, ns), skin[1] / Math.max(1, ns), skin[2] / Math.max(1, ns), THREE.SRGBColorSpace); hair.sort((a, b) => a - b);
    const hl = hair.length ? new THREE.Color().setRGB(hair[hair.length >> 1], hair[hair.length >> 1], hair[hair.length >> 1], THREE.SRGBColorSpace).r : 0.03;
    HEADS.set(name, { name, geo, map: src.material.map, normalMap: src.material.normalMap || null, skin: sc, skinLum: 0.3 * sc.r + 0.5 * sc.g + 0.2 * sc.b, hairLum: hl });
  }));
}
// A player whose own face has been painted onto his head (facedata.js): the same head mesh with that picture
// on it, kept under 'face:<Name>'.
async function loadFaces() {
  // each face on its own: one that cannot be loaded (a local-only picture missing from a deployed copy) leaves only
  // that player on his library head
  await Promise.all(Object.entries(FACES).map(async ([name, f]) => { try {
    const K = HEADS.get(f.head); if (!K || HEADS.has('face:' + name)) return;
    // a picture kept on this machine only is not asked for anywhere else: the player keeps his donor head there
    if (f.local && !/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { HEADS.set('face:' + name, { ...K, name: 'face:' + name }); return; }
    // a chosen donor head with no photograph painted on keeps its own picture and colour reference
    if (!f.map) { HEADS.set('face:' + name, { ...K, name: 'face:' + name }); return; }
    const map = await loadTex(f.map, true), sc = new THREE.Color(f.skin);
    HEADS.set('face:' + name, { ...K, name: 'face:' + name, map, skin: sc, skinLum: 0.3 * sc.r + 0.5 * sc.g + 0.2 * sc.b, baked: true });
  } catch (e) { console.warn('face', name, e && e.message); } }));
}
function graftMaterial(K, look) {
  const want = lin(look.skin || '#d9a57e').multiply(SKIN_ALBEDO), hs = look.hairSpec;
  // his skin against the head's own: the picture keeps its light, shade and colour variation
  const tint = new THREE.Color(Math.min(1.9, want.r / K.skin.r), Math.min(1.9, want.g / K.skin.g), Math.min(1.9, want.b / K.skin.b));
  const light = K.hairLum > K.skinLum * 0.62;                  // a fair-haired head: the hair cannot be told from skin by its darkness
  // brows are darker than the hair on the head, and keep their colour when the hair is bleached
  const browC = lin((hs && hs.c2) || look.hair || '#2a1c12').multiplyScalar(0.62);
  const U = { uHair: { value: lin(look.hair || '#2a1c12') }, uBrowC: { value: browC }, uSkinTint: { value: tint }, uSkinCol: { value: want }, uSkinLum: { value: K.skinLum }, uHairLum: { value: Math.max(0.012, K.hairLum) }, uLightHair: { value: light ? 1 : 0 },
    uBeard: { value: look.beard || 0 }, uFade: { value: hs ? clamp01(1.05 - hs.sides * 0.5) : 0 }, uRecede: { value: hs ? clamp01((hs.recede || 0) * 1.3) : 0 }, uFreckle: { value: (look.face && look.face.freckle) || 0 }, uBlink: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ map: K.map, normalMap: K.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.66, metalness: 0 });
  m.userData.U = U;
  sunMask(m, {
    key: 'person-head3', uniforms: U, rim: true,
    vertexPars: 'attribute float aZone, aBrow; attribute vec3 aLid; uniform float uBlink; varying vec3 vBind; varying float vZone, vBrow, vLid;', vertex: 'vBind = position; vZone = aZone; vBrow = aBrow; vLid = clamp(length(aLid) * 320.0, 0.0, 1.0);',
    bindVertex: 'transformed += aLid * uBlink;',
    pars: 'uniform vec3 uHair, uBrowC, uSkinTint, uSkinCol; varying float vBrow, vLid; uniform float uBeard, uSkinLum, uHairLum, uLightHair, uFade, uRecede, uFreckle, uBlink; varying vec3 vBind; varying float vZone;\nfloat fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    afterMap: `vec3 hBase = diffuseColor.rgb; float hl = dot(hBase, vec3(0.3, 0.5, 0.2));
      // hair and brows: what is as dark as this head's hair, where hair grows
      float hDark = mix(1.0 - smoothstep(uHairLum * 1.3, mix(uHairLum, uSkinLum, 0.6), hl), 0.9, uLightHair);
      float hk = smoothstep(0.25, 0.75, vZone) * hDark;
      vec3 hSkin = hBase * uSkinTint, hFlat = uSkinCol * clamp(hl / uSkinLum, 0.55, 1.25);
      // stubble or a beard over the jaw, chin and lip
      float jaw = smoothstep(1.652, 1.632, vBind.y) * smoothstep(0.005, 0.06, vBind.z) * (1.0 - 0.75 * smoothstep(0.016, 0.006, abs(vBind.y - 1.612)) * smoothstep(0.03, 0.015, abs(vBind.x)));
      hSkin = mix(hSkin, uHair * 0.55 + hSkin * 0.30, jaw * uBeard * (0.75 + 0.25 * fhash(floor(vBind.xy * 900.0))));
      if (uFreckle > 0.0) { vec2 fc = vBind.xy * 520.0; float fk = step(1.0 - 0.16 * uFreckle, fhash(floor(fc))) * smoothstep(0.5, 0.15, length(fract(fc) - 0.5)); fk *= smoothstep(0.07, 0.10, vBind.z) * smoothstep(1.625, 1.645, vBind.y) * smoothstep(1.70, 1.675, vBind.y); hSkin *= 1.0 - 0.22 * fk; }
      vec3 hHair = mix(uHair, uBrowC, smoothstep(0.2, 0.6, vBrow)) * clamp(hl / uHairLum, 0.55, 2.4) * 0.9;
      // cut close at the sides and back the scalp shows through; a hairline that has gone back thins the front
      float hFade = uFade * smoothstep(1.765, 1.655, vBind.y) * smoothstep(0.075, 0.02, vBind.z), hRec = uRecede * smoothstep(-0.03, 0.06, vBind.z) * smoothstep(1.735, 1.785, vBind.y);
      hHair = mix(hHair, hFlat * 0.95, clamp(hFade + hRec, 0.0, 0.96) * step(vBind.y, 1.70 + 1.0));
      diffuseColor.rgb = mix(hSkin, hHair, hk);
      // a closing eyelid is skin, a little shaded: not the photograph's lashes and shadow stretched over the eye
      diffuseColor.rgb = mix(diffuseColor.rgb, hFlat * 1.08, vLid * smoothstep(0.1, 0.6, uBlink));`,
    afterRough: 'roughnessFactor = mix(roughnessFactor, 0.55, smoothstep(0.25, 0.75, vZone));',
    beforeOut: 'float pSkin = 1.0 - hk, pCloth = 0.0;\n' + SKIN_CLOTH_LIGHT,
  });
  return m;
}

const lin = c => new THREE.Color(c);
// a skin colour read off a photograph is skin in sunlight; the surface itself is darker than that
const SKIN_ALBEDO = new THREE.Color(0.72, 0.60, 0.57);
const clamp01 = v => Math.min(1, Math.max(0, v));
// Kit and colouring are applied in the shader: garments are stored as neutral grey folds, and
// what is drawn on them — collars, plackets, stripes, bands, panels, trims — is laid out in the
// body's own coordinates (the bind pose), so an outfit is a short list of layers, not a texture.
// Landmarks of the model in its bind pose, in model units (it stands 1.807 tall, arms 45 degrees down).
export const BODY = { hip: 0.895, neck: 1.521, sh: [0.217, 1.428, -0.025], armDir: [0.377, -0.382, 0.106], armLen: 0.557, knee: 0.497, ankle: 0.102, waist: 0.985 };
// where shorts end, as a height on the model (crotch about 0.80, knee 0.50)
const SHORTS_HEM = { short: 0.745, mid: 0.655, knee: 0.53, capri: 0.40 };
const LAYER = { collar: 1, placket: 2, pin: 3, hbands: 4, band: 5, yoke: 6, sides: 7, sleeve: 8, fade: 9, diag: 10, grid: 11, patch: 12, shoulder: 13, argyle: 14 };
// kit: { shirt, sleeveless, tucked, layers: [[type, colour, p1..p7]], shorts: { c, len, hem, side, pin }, socks: { c, top, ring }, shoes: { c, c2 }, wb: { L: [colour, cm], R: [colour, cm] } }
export function kitUniforms(look, U = {}) {
  const k = look.kit || {}, col = (c, d) => new THREE.Color(c || d);
  const set = (n, v) => { if (U[n]) { if (U[n].value && U[n].value.copy && v && v.copy) U[n].value.copy(v); else U[n].value = v; } else U[n] = { value: v }; };
  set('uShirt', col(k.shirt || look.top, '#f1f1ee')); set('uSleeve', (k.sleeveless == null ? look.sleeveless : k.sleeveless) ? 0 : 1);
  if (!U.uSweat) U.uSweat = { value: 0 };             // how far into a hot match he is: the shirt darkens where it soaks (game.js)
  const A = [], B = [], C = [];
  for (let i = 0; i < 6; i++) { const L = (k.layers || [])[i]; A.push(new THREE.Vector4(L ? LAYER[L[0]] || 0 : 0, L ? L[2] || 0 : 0, L ? L[3] || 0 : 0, L ? L[4] || 0 : 0)); B.push(new THREE.Vector4(L ? L[5] || 0 : 0, L ? L[6] || 0 : 0, L ? L[7] || 0 : 0, L ? L[8] || 0 : 0)); C.push(col(L && L[1], '#000000')); }
  set('uLayA', A); set('uLayB', B); set('uLayC', C);
  const sh = k.shorts || {}, len = SHORTS_HEM[sh.len || 'mid'];
  set('uShorts', col(sh.c || look.shorts, '#16181d')); set('uShortsHem', col(sh.hem || sh.c || look.shorts, '#16181d')); set('uShortsSide', col(sh.side || sh.c || look.shorts, '#16181d'));
  // x: shorts hem height, y: sock top height, z: 1 if the shirt is tucked in, w: shorts pinstripe spacing (0 none)
  const so = k.socks || {}; set('uCut', new THREE.Vector4(len, BODY.ankle + ({ ankle: 0.045, crew: 0.15, high: 0.26 }[so.top || 'crew']), k.tucked ? 1 : 0, sh.pin || 0));
  set('uShortsPin', col(sh.pinC, '#000000')); set('uSock', col(so.c, '#f2f2f0')); set('uSockRing', col(so.ring || so.c, '#f2f2f0'));
  const shoe = k.shoes || {}; set('uShoe', col(shoe.c || look.shoe, '#f2f2ee')); set('uShoe2', col(shoe.c2 || shoe.c || look.shoe, '#f2f2ee'));
  const wb = k.wb || {}, w = v => v ? new THREE.Vector4(...new THREE.Color(v[0]).toArray(), (v[1] || 8) / 100 / BODY.armLen) : new THREE.Vector4(0, 0, 0, 0);
  // the shader works on the model as built, facing +z, where the wearer's left is +x
  set('uWbL', w(wb.L)); set('uWbR', w(wb.R));
  return U;
}
// Light in skin and cloth beyond what the standard shading gives. Skin: light goes into it and comes out a
// little further on, reddened, so where a limb turns from the sun the shading wraps on warm instead of going
// straight to grey, and its shade is warmer than a painted surface's. Cloth: woven fibres stand out of the
// surface and catch the light at a glancing angle, so a shirt's edges brighten softly toward the light.
// (Uses the arena's sun term, so the stands' shadow still falls on it.)
const SKIN_CLOTH_LIGHT = `
  #if NUM_DIR_LIGHTS > 0
  { vec3 sL = directionalLights[0].direction, sC = directionalLights[0].color * arenaSun(); float nl = dot(normal, sL);
    float wrap = max(0.0, (nl + 0.5) / 1.5) - max(0.0, nl);
    outgoingLight += diffuseColor.rgb * sC * wrap * vec3(0.38, 0.13, 0.08) * pSkin;
    float fv = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    outgoingLight += diffuseColor.rgb * sC * fv * fv * fv * clamp(nl + 0.35, 0.0, 1.0) * 0.30 * pCloth; }
  #endif
  outgoingLight += reflectedLight.indirectDiffuse * vec3(0.045, -0.004, -0.025) * pSkin;`;
function bodyMaterial(M, look) {
  const skinBase = new THREE.Color().setRGB(M.info.skin[0], M.info.skin[1], M.info.skin[2], THREE.SRGBColorSpace);
  const want = lin(look.skin || '#d9a57e').multiply(SKIN_ALBEDO);
  const tint = new THREE.Color(want.r / skinBase.r, want.g / skinBase.g, want.b / skinBase.b);
  const U = { uMask: { value: M.tex.bm }, uSkinTint: { value: tint }, uSkinCol: { value: want }, uSkinLum: { value: 0.3 * skinBase.r + 0.5 * skinBase.g + 0.2 * skinBase.b } };
  kitUniforms(look, U);
  const m = new THREE.MeshStandardMaterial({ map: M.tex.bc, normalMap: M.tex.bn, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.78, metalness: 0 });
  if (look.doubleSide) m.side = THREE.DoubleSide;           // the inside of the shirt shows where a smaller head leaves the collar open
  sunMask(m, {
    key: 'person-body', uniforms: U, rim: true,
    // the kit is laid out on the body as the model was built (aBind), so it sits the same on every player's frame
    vertexPars: 'attribute vec3 aBind; varying vec3 vBind;', vertex: 'vBind = aBind;',
    pars: `uniform sampler2D uMask; uniform vec3 uShirt, uShorts, uShortsHem, uShortsSide, uShortsPin, uSkinTint, uSkinCol, uShoe, uShoe2, uSock, uSockRing; uniform float uSleeve, uSkinLum, uSweat;
      uniform vec4 uLayA[6]; uniform vec4 uLayB[6]; uniform vec3 uLayC[6]; uniform vec4 uCut, uWbL, uWbR; varying vec3 vBind;
      // one drawn layer of a shirt: returns how much of its colour lies on this point
      float kitLayer(vec4 A, vec4 B, vec3 b, float hy, float ax, float aq, float arm) {
        int t = int(A.x + 0.5); float front = step(0.0, b.z);
        if (t == 1) return step(A.y, hy) * (1.0 - arm) * step(abs(b.x), 0.13);                                             // collar: everything above A.y at the neck
        if (t == 2) return step(abs(b.x - A.w), A.y) * front * step(A.z, hy) * (1.0 - arm);                                 // placket: half-width A.y, from A.z up, centred at x = A.w
        if (t == 3) { float u = arm > 0.5 ? aq : b.x; float inX = step(B.y, b.x) * step(b.x, B.z) + step(B.z, B.y);         // pinstripes: spacing A.y, width A.z; B.yz an x range
          return step(abs(fract(u / A.y + 0.5) - 0.5) * A.y, A.z * 0.5) * step(A.w, hy + arm) * mix(1.0, front, B.x) * min(1.0, inX + arm * step(B.z, B.y)); }
        if (t == 4) { float inY = step(B.x, hy) * step(hy, B.y);                                                             // bands across: period A.y, share A.z, offset A.w, between B.x and B.y
          return step(fract((hy - A.w) / A.y), A.z) * inY * mix(1.0, front, B.z) * (1.0 - arm * (1.0 - B.w)); }
        if (t == 5) { float wv = A.w * sin(b.x * B.z);                                                                        // one band: A.y to A.z on the body, B.x to B.y along the sleeve
          return (1.0 - arm) * step(A.y + wv, hy) * step(hy, A.z + wv) + arm * step(B.x, ax) * step(ax, B.y) * step(0.001, B.y); }
        if (t == 6) { float side = A.w == 0.0 ? 1.0 : step(0.0, b.x * A.w);                                                   // yoke: above A.y, dropping A.z per metre outward; B.x takes the sleeves too
          return max((1.0 - arm) * step(A.y, hy + A.z * abs(b.x)), arm * B.x) * side; }
        if (t == 7) { float side = A.w == 0.0 ? 1.0 : step(0.0, b.x * A.w);                                                   // side panels: outside x = A.y, below A.z
          return step(A.y, abs(b.x)) * (1.0 - arm) * step(hy, A.z) * step(B.x, hy) * side; }
        if (t == 8) return arm * step(A.y, ax) * step(ax, A.z);                                                               // a ring round the sleeve
        if (t == 9) return clamp((A.y - hy) / max(1e-3, A.y - A.z), 0.0, 1.0) * A.w * (1.0 - arm);                            // fade toward the hem
        if (t == 10) { float v = b.x * cos(A.w) + b.y * sin(A.w);                                                             // slanted bars: period A.y, share A.z, angle A.w, between B.x and B.y
          float fade = B.w > 0.0 ? clamp((B.y - hy) / max(1e-3, B.y - B.x), 0.0, 1.0) : 1.0;
          return step(fract(v / A.y), A.z) * step(B.x, hy) * step(hy, B.y) * mix(1.0, front, B.z) * (1.0 - arm) * fade; }
        if (t == 11) return max(step(abs(fract(b.x / A.y + 0.5) - 0.5) * A.y, A.z * 0.5), step(abs(fract(b.y / A.y + 0.5) - 0.5) * A.y, A.z * 0.5)) * (1.0 - arm * 0.0);   // windowpane
        if (t == 12) return step(abs(b.x - A.y), A.w) * step(abs(hy - A.z), B.x) * front * (1.0 - arm);                       // a small patch
        if (t == 13) { float z = b.z - A.y; float k = abs(mod(z + A.w * 0.5, A.w) - A.w * 0.5);                               // stripes along the top of the shoulder and down the sleeve
          return step(k, A.z * 0.5) * step(abs(z), A.w * B.x + A.z) * max((1.0 - arm) * step(0.80, hy + 0.5 * abs(b.x)), arm * step(ax, B.y)); }
        if (t == 14) { float c = b.x / A.y; float d = abs(fract(c) - 0.5) * 2.0 + abs(hy - A.z) / A.w;                         // a row of diamonds
          return step(d, 1.0) * step(mod(floor(c) + B.x, 2.0), 0.5) * front * (1.0 - arm); }
        return 0.0;
      }`,
    afterMap: `vec4 pmk = texture2D(uMask, vMapUv);
      vec3 b = vBind; float hy = (b.y - ${BODY.hip}) / ${(BODY.neck - BODY.hip).toFixed(3)};
      float sgnX = b.x < 0.0 ? -1.0 : 1.0;
      vec3 aS = vec3(sgnX * ${BODY.sh[0]}, ${BODY.sh[1]}, ${BODY.sh[2]}), aD = normalize(vec3(sgnX * ${BODY.armDir[0]}, ${BODY.armDir[1]}, ${BODY.armDir[2]}));
      float ax = dot(b - aS, aD) / ${BODY.armLen}, aq = dot(b - aS, normalize(vec3(-aD.y * sgnX, aD.x * sgnX, 0.0)));
      float arm = step(${(BODY.sh[0] - 0.012).toFixed(3)}, abs(b.x)) * step(-0.06, ax);
      float pTank = pmk.r, pSleeve = pmk.a * uSleeve * (1.0 - pTank), pShoe = pmk.b;
      vec3 pBase = diffuseColor.rgb; float pLum = dot(pBase, vec3(0.3, 0.5, 0.2));
      // the lower body: shorts from the waist to their hem, then leg, sock and shoe
      float lower = step(b.y, ${BODY.waist}) * step(abs(b.x), 0.33) * (1.0 - pShoe);
      float tuckCut = step(${(BODY.waist - 0.012).toFixed(3)}, b.y);
      float pShirt = clamp(pTank + pSleeve, 0.0, 1.0) * mix(1.0, tuckCut, uCut.z);
      float pShorts = lower * step(uCut.x, b.y) * (1.0 - pShirt);
      float pSock = lower * step(b.y, uCut.y) * step(0.085, b.y);
      float pLeg = lower * (1.0 - pShorts) * (1.0 - pSock);
      float clothShade = pBase.g / 0.59, skinShade = clamp(pLum / uSkinLum, 0.55, 1.2), wasCloth = max(pmk.g, pTank);
      // the shirt and what is drawn on it
      vec3 cShirt = uShirt;
      for (int i = 0; i < 6; i++) { if (uLayA[i].x > 0.5) cShirt = mix(cShirt, uLayC[i], clamp(kitLayer(uLayA[i], uLayB[i], b, hy, ax, aq, arm), 0.0, 1.0)); }
      vec3 cTank = cShirt * clothShade, cSleeve = cShirt * clamp(pLum / uSkinLum, 0.75, 1.15);
      // sweat: down the middle of the chest, across the upper back and under the arms first, spreading as the match goes on;
      // wet cloth is darker and a little more saturated, with a ragged edge
      if (uSweat > 0.001) {
        float ragged = 0.5 + 0.5 * sin(b.x * 61.0 + b.y * 37.0) * sin(b.y * 53.0 - b.z * 29.0);
        float chest = (1.0 - smoothstep(0.03, 0.04 + 0.11 * uSweat, abs(b.x))) * smoothstep(0.30, 0.42, hy) * (1.0 - smoothstep(0.80, 0.95, hy)) * step(0.0, b.z);
        float back = (1.0 - smoothstep(0.06, 0.06 + 0.12 * uSweat, abs(b.x))) * smoothstep(0.55 - 0.25 * uSweat, 0.70 - 0.25 * uSweat, hy) * (1.0 - smoothstep(0.92, 1.0, hy)) * step(b.z, 0.0);
        float pits = smoothstep(0.10, 0.16, abs(b.x)) * (1.0 - smoothstep(0.75, 0.90, hy)) * smoothstep(0.55, 0.68, hy) * (1.0 - arm);
        float wet = clamp(max(max(chest, back), pits * 0.9) * smoothstep(0.15, 0.75, uSweat + 0.25 * (ragged - 0.5)), 0.0, 1.0) * (1.0 - arm * 0.6);
        vec3 wetC = cShirt * cShirt * 1.05;                        // soaked cloth goes deeper in its own colour
        cTank = mix(cTank, wetC * clothShade * 0.92, wet * 0.75);
      }
      // shorts: a hem band, a stripe down the side seam, pinstripes
      vec3 cShorts = uShorts;
      if (uCut.w > 0.0) cShorts = mix(cShorts, uShortsPin, step(abs(fract(b.x / uCut.w + 0.5) - 0.5) * uCut.w, 0.0022));
      cShorts = mix(cShorts, uShortsSide, step(0.068, abs(abs(b.x) - 0.105) ) * 0.0 + step(abs(b.z + 0.005), 0.016) * step(0.10, abs(b.x)));
      cShorts = mix(cShorts, uShortsHem, step(b.y, uCut.x + 0.018));
      cShorts *= mix(skinShade, clothShade, wasCloth);
      // A thigh uncovered by shorter shorts was cloth in the model (with the shorts' folds and seams, grey texels at the
      // edge of their islands, and skin under them darkened by baked shade): it is drawn as plain skin at the bare
      // leg's brightness, its normal map mostly flattened (pNrmK), so no band, outline or pale patch shows below the hem.
      float pGrey = smoothstep(0.9, 0.3, (pBase.r - pBase.b) / max(pLum, 0.02));
      float exShorts = lower * smoothstep(0.51, 0.575, b.y), plainSkin = max(max(wasCloth, pGrey), exShorts) * (1.0 - pShoe);
      vec3 cSkin = mix(mix(pBase * uSkinTint, uSkinCol * clamp(pLum / uSkinLum, 0.6, 1.3), 0.65), uSkinCol * mix(clothShade, 0.97, lower), plainSkin);
      vec3 cSock = mix(uSock, uSockRing, step(uCut.y - 0.05, b.y) * step(b.y, uCut.y - 0.02)) * mix(skinShade, clothShade, wasCloth) * 0.96;
      vec3 cShoe = mix(uShoe, uShoe2, step(b.y, 0.028) + step(abs(b.y - 0.062), 0.008)) * clamp(pLum * 1.9, 0.35, 1.25);
      // wristbands on the forearm, each wrist its own
      vec4 wb = b.x > 0.0 ? uWbL : uWbR; float pWb = arm * (1.0 - pSleeve) * step(1.0 - wb.w - 0.035, ax) * step(ax, 0.972) * step(0.001, wb.w);
      vec3 col = cSkin;
      col = mix(col, cSock, pSock); col = mix(col, cShorts, pShorts);
      col = mix(col, cTank, pTank * pShirt); col = mix(col, cSleeve, pSleeve * pShirt);
      col = mix(col, wb.rgb * skinShade, pWb); col = mix(col, cShoe, pShoe);
      float pCloth = clamp(pShirt + pShorts + pSock + pWb, 0.0, 1.0), pSkin = 1.0 - clamp(pCloth + pShoe, 0.0, 1.0);
      // bare skin over what was cloth in the model keeps little of the cloth's folds and seams in the normal map
      float pNrmK = 1.0 - max(0.85 * wasCloth, exShorts) * pSkin;
      diffuseColor.rgb = col;`,
    // skin is a little damp with sweat in a match: smoother than cloth, so it catches the light
    afterRough: 'roughnessFactor = mix(roughnessFactor, 0.92, pCloth); roughnessFactor = mix(roughnessFactor, 0.60, pSkin);\n#define normalScale (normalScale * pNrmK)',
    beforeOut: SKIN_CLOTH_LIGHT,
  });
  m.userData.U = U; m.userData.base = skinBase;
  return m;
}
function headMaterial(M, look) {
  const skinBase = new THREE.Color().setRGB(M.info.faceSkin[0], M.info.faceSkin[1], M.info.faceSkin[2], THREE.SRGBColorSpace);
  const want = lin(look.skin || '#d9a57e').multiply(SKIN_ALBEDO);
  const tint = new THREE.Color(want.r / skinBase.r, want.g / skinBase.g, want.b / skinBase.b);
  const hs = look.hairSpec, thin = hs ? 0 : look.hairStyle === 'buzz' ? 0.45 : look.hairStyle === 'thin' ? 0.6 : look.hairStyle === 'bald' ? 0.9 : 0;
  const U = { uMask: { value: M.tex.hm }, uHair: { value: lin(look.hair || '#2a1c12') }, uSkinTint: { value: tint }, uBeard: { value: look.beard || 0 }, uThin: { value: thin }, uFade: { value: hs ? clamp01(1.05 - hs.sides * 0.5) : 0 }, uRecede: { value: hs ? clamp01((hs.recede || 0) * 1.3) : 0 }, uFreckle: { value: (look.face && look.face.freckle) || 0 }, uSkinCol: { value: want }, uSkinLum: { value: 0.3 * skinBase.r + 0.5 * skinBase.g + 0.2 * skinBase.b } };
  const m = new THREE.MeshStandardMaterial({ map: M.tex.hc, normalMap: M.tex.hn, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.72, metalness: 0 });
  m.userData.U = U; m.userData.base = skinBase;
  sunMask(m, {
    key: 'person-head', uniforms: U, rim: true,
    vertexPars: 'varying vec3 vBind;', vertex: 'vBind = position;',
    pars: 'uniform sampler2D uMask; uniform vec3 uHair, uSkinTint, uSkinCol; uniform float uBeard, uThin, uSkinLum, uFade, uRecede, uFreckle; varying vec3 vBind;\nfloat fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    afterMap: `vec3 hmk = texture2D(uMask, vMapUv).rgb;
      vec3 hBase = diffuseColor.rgb;
      // hair is stored as grey strands around 0.5; lift it onto the player's hair colour
      vec3 hHair = uHair * (hBase.g / 0.214) * 1.15 + vec3(0.012) * max(0.0, hBase.g / 0.214 - 1.0);
      // skin takes the player's own colour, keeping the texture's light and shade but little of its hue
      vec3 hFlat = uSkinCol * clamp(dot(hBase, vec3(0.3, 0.5, 0.2)) / uSkinLum, 0.5, 1.3);
      vec3 hSkin = mix(hBase, mix(hBase * uSkinTint, hFlat, 0.45), hmk.g);
      hSkin = mix(hSkin, uHair * 0.9 + hSkin * 0.12, hmk.b * uBeard);
      // freckles across the nose and cheeks of the fair and red-haired
      if (uFreckle > 0.0) { vec2 fc = vBind.xy * 520.0; float fk = step(1.0 - 0.16 * uFreckle, fhash(floor(fc))) * smoothstep(0.5, 0.15, length(fract(fc) - 0.5)); fk *= smoothstep(0.07, 0.10, vBind.z) * smoothstep(1.625, 1.645, vBind.y) * smoothstep(1.70, 1.675, vBind.y); hSkin *= 1.0 - 0.22 * fk * hmk.g; }
      // cut close at the sides and back, the scalp shows through toward the neck; a hairline that has gone back thins the front
      float hFade = uFade * smoothstep(1.765, 1.655, vBind.y) * smoothstep(0.075, 0.02, vBind.z), hRec = uRecede * smoothstep(-0.03, 0.06, vBind.z) * smoothstep(1.735, 1.785, vBind.y);
      hHair = mix(hHair, hFlat * 0.96, clamp(uThin + hFade + hRec, 0.0, 0.96));
      diffuseColor.rgb = mix(hSkin, hHair, hmk.r);`,
    afterRough: 'roughnessFactor = mix(roughnessFactor, 0.5, hmk.r);',
  });
  return m;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const YAW180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const B = n => 'Bip01_' + n;

// One person: a clone of the model with its own materials, and its bones addressed by name.
// Body space is the game's: x to the person's right, y up, forward along -z.
export class Person {
  constructor(M, look = {}) {
    this.M = M; this.look = look;
    const root = this.root = SkeletonUtils.clone(M.scene);
    this.scale = (look.height || 1.85) / M.info.height;
    this.bones = {}; this.meshes = []; this.headGear = [];
    root.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) { this.meshes.push(o); o.frustumCulled = false; o.castShadow = look.shadow !== false; o.receiveShadow = true; }
    });
    if (M.plain) {
      // the avatar's own materials: clothes, skin, and a cut-out layer for hair and lashes
      for (const me of this.meshes) {
        const kind = me.material.name || 'body', m = me.material = me.material.clone();
        m.roughness = kind === 'body' ? 0.85 : 0.7; m.metalness = 0; m.vertexColors = false;      // some avatars carry stray vertex colours
        if (kind === 'opacity') { m.alphaTest = 0.42; m.transparent = false; m.side = THREE.DoubleSide; }
        if (look.tint && kind === 'body') m.color.set(look.tint);
        if (look.lit !== false) sunMask(m);
        me.userData.head = kind !== 'body';
        if (kind === 'body') this.body = m; else if (kind === 'head') this.head = m;
      }
    } else {
      const K = look.head && (HEADS.get(look.head) || (look.headFallback && HEADS.get(look.headFallback))), body = bodyMaterial(M, look), head = K ? graftMaterial(K, look) : headMaterial(M, look);
      for (const me of this.meshes) { const isHead = /head/i.test(me.material.name || ''); me.material = isHead ? head : body; me.userData.head = isHead; if (isHead && K) { me.geometry = K.geo; this.headKit = K; } }
      this.body = body; this.head = head;
    }
    this.arm = this.bones[B('Pelvis')].parent; this.arm.position.set(0, 0, 0); this.arm.quaternion.identity();
    root.updateMatrixWorld(true);
    // the model wears shorts to the knee: where this player's end higher, the cloth below their hem is drawn in to the leg
    if (!M.plain && look.kit) this.fitKit(look.kit);
    if (!M.plain && look.face) this.fitFace(look.face);
    // the kit is drawn where it lies on the body as fitted so far, whatever frame the body is then given
    if (!M.plain) for (const me of this.meshes) if (!me.userData.head) { const g = me.geometry; g.setAttribute('aBind', me.userData.own ? g.attributes.position.clone() : g.attributes.position); }
    // build: reshape the body to this player's frame before anything is posed — his own body where there is one
    // (applyShape), else the older radial build
    if (look.build) { const S = !M.plain && M.shapes && look.build.shape && M.shapes.of[look.build.shape]; if (!(S && this.applyShape(S, look))) this.applyBuild(look.build); }
    // the armature node carries the height; bones are then posed in that node's space
    this.arm.scale.setScalar(this.scale);
    // a head does not grow in step with height: keep it near life size on the tall and the short
    this.bones[B('Head')].scale.setScalar(Math.pow(1 / this.scale * (M.info.height / 1.85), 0.7) * (look.build && look.build.head || 1));
    root.updateMatrixWorld(true);
    // rest pose, turned to face -z
    this.rest = {};
    for (const n in this.bones) {
      const b = this.bones[n];
      const wq = b.getWorldQuaternion(new THREE.Quaternion()), wp = b.getWorldPosition(new THREE.Vector3());
      this.rest[n] = { q: YAW180.clone().multiply(wq), p: wp.applyQuaternion(YAW180), lq: b.quaternion.clone() };
    }
    this.world = {};                                  // world orientation given to each driven bone this frame
    const R = this.rest, d = (a, b) => R[B(b)].p.clone().sub(R[B(a)].p);
    // proportions, in metres at this person's size
    this.dim = {
      hipY: R[B('Pelvis')].p.y, hipHalf: Math.abs(R[B('L_Thigh')].p.x), thigh: d('L_Thigh', 'L_Calf').length(), shank: d('L_Calf', 'L_Foot').length(), ankle: R[B('L_Foot')].p.y,
      shY: R[B('L_UpperArm')].p.y, shHalf: Math.abs(R[B('L_UpperArm')].p.x), upper: d('L_UpperArm', 'L_Forearm').length(), fore: d('L_Forearm', 'L_Hand').length(),
      eyeY: (R[B('LEye')].p.y + R[B('REye')].p.y) / 2, headY: R[B('Head')].p.y,
    };
    // directions of each limb segment at rest
    const dir = (a, b) => d(a, b).normalize();
    this.dir = {};
    for (const S of ['L', 'R']) {
      this.dir['arm' + S] = dir(S + '_UpperArm', S + '_Forearm'); this.dir['fore' + S] = dir(S + '_Forearm', S + '_Hand');
      this.dir['leg' + S] = dir(S + '_Thigh', S + '_Calf'); this.dir['shank' + S] = dir(S + '_Calf', S + '_Foot');
      this.dir['foot' + S] = dir(S + '_Foot', S + '_Toe0');
      // A handle lies diagonally across the palm: from the pad at the heel of the hand, below the little
      // finger, to the base of the index finger. That line — not the row of knuckles — is the grip, which
      // puts a racket at about fifty degrees to the forearm with the wrist at rest, as a hand holds one.
      const h = R[B(S + '_Hand')].p, f1 = R[B(S + '_Finger1')].p, f4 = R[B(S + '_Finger4')].p, heel = h.clone().lerp(f4, 0.34);
      this.dir['grip' + S] = f1.clone().sub(heel).normalize();
      this.dir['palm' + S] = heel.clone().add(f1).multiplyScalar(0.5).sub(h);             // from the wrist to the middle of that line
      // the way the fingers close: where a handle lies, inside the curl, off the palm on that side
      { const a = new THREE.Vector3(0, 0, 1).applyQuaternion(R[B(S + '_Finger1')].q), fd = R[B(S + '_Finger11')] ? R[B(S + '_Finger11')].p.clone().sub(f1).normalize() : f1.clone().sub(h).normalize();
        this.dir['palmN' + S] = a.cross(fd).normalize(); }
    }
    this.curl = 0;
    if (M.plain && look.uniform) this.setUniform(look.uniform.top, look.uniform.bottom);
  }
  // Reshape the bind pose: limbs thicker or leaner about their own axes, the trunk wider or
  // deeper about the spine, shoulders set further apart. `b`: { arms, legs, chest, depth, shoulders (m) }.
  // A face of his own. The model has one face; each player's is that face reshaped, in the
  // model's bind space, by a handful of measures (each about -1..1, 0 = the model as it is):
  // faceW/faceL the width and length of the face, jawW the jaw's width, chinL/chinP the chin's
  // length and how far it juts, noseL/noseW/noseP the nose's length, width and projection,
  // cheek the cheekbones, hollow the cheeks under them, brow the brow ridge, deep how deep the
  // eyes are set, ears how far the ears stand out, lips their fullness.
  fitFace(F) {
    const me = this.meshes.find(m => m.userData.head); if (!me) return;
    const pos = this.own(me).attributes.position, g = (d2, r) => Math.exp(-d2 / (r * r)), sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    const f = k => F[k] || 0;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (y < 1.555) continue;
      const sx = x < 0 ? -1 : 1, ax = Math.abs(x), front = sm((z - 0.0) / 0.06), keep = sm((y - 1.555) / 0.02);      // nothing moves at the collar
      // the lower face longer or shorter, hung from the eye line
      if (y < 1.672) y = 1.672 - (1.672 - y) * (1 + 0.085 * f('faceL') * front * keep);
      // width: the whole face, then the jaw on its own
      x *= 1 + 0.07 * f('faceW') * front * sm((1.76 - y) / 0.05) * keep;
      x *= 1 + 0.13 * f('jawW') * sm((1.655 - y) / 0.045) * sm((z + 0.03) / 0.05) * keep;
      // chin
      { const w = g((y - 1.566) ** 2 + x * x * 0.6 + (z - 0.115) ** 2 * 0.5, 0.034) * keep; y -= 0.011 * f('chinL') * w; z += 0.010 * f('chinP') * w; }
      // nose: tip and wings
      { const w = g(x * x + (y - 1.652) ** 2 * 0.55 + (z - 0.138) ** 2 * 0.5, 0.026); z += 0.012 * f('noseP') * w; y -= 0.007 * f('noseL') * w; x *= 1 + 0.30 * f('noseW') * w; const br = g(x * x + (y - 1.688) ** 2 * 0.6 + (z - 0.118) ** 2, 0.018); z += 0.005 * f('noseP') * br; }
      // cheekbones, and the hollows beneath them
      { const w = g((ax - 0.054) ** 2 + (y - 1.658) ** 2 + (z - 0.092) ** 2, 0.028); x += sx * 0.006 * f('cheek') * w; z += 0.003 * f('cheek') * w;
        const h = g((ax - 0.050) ** 2 + (y - 1.615) ** 2 + (z - 0.098) ** 2, 0.027); x -= sx * 0.006 * f('hollow') * h; z -= 0.004 * f('hollow') * h; }
      // brow ridge, and eyes set deeper under it
      { const w = g((ax - 0.032) ** 2 * 0.5 + (y - 1.704) ** 2 * 1.6 + (z - 0.118) ** 2, 0.024); z += 0.006 * f('brow') * w; y -= 0.002 * f('brow') * w;
        const e = g((ax - 0.032) ** 2 + (y - 1.686) ** 2 + (z - 0.100) ** 2, 0.016); z -= 0.0035 * f('deep') * e; }
      // lips
      { const w = g(x * x * 0.4 + (y - 1.613) ** 2 * 3 + (z - 0.128) ** 2, 0.020); z += 0.004 * f('lips') * w; }
      // ears
      if (ax > 0.074 && y > 1.63 && y < 1.73 && z < 0.05) x += sx * 0.012 * f('ears') * sm((ax - 0.074) / 0.012);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }
  // this person's own copy of the model's geometry, made once
  own(me) { if (!me.userData.own) { me.geometry = me.geometry.clone(); me.userData.own = true; } return me.geometry; }
  fitKit(kit) {
    if (kit.sleeveless) {
      const S0 = BODY.sh, AD = new THREE.Vector3(...BODY.armDir).normalize(), sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
      for (const me of this.meshes) {
        if (me.userData.head) continue;
        const pos = this.own(me).attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), sx = x < 0 ? -1 : 1; if (Math.abs(x) < S0[0] - 0.02 || y < 1.05) continue;
          const rx = x - sx * S0[0], ry = y - S0[1], rz = z - S0[2], along = rx * sx * AD.x + ry * AD.y + rz * AD.z; if (along < 0.03 || along > 0.27) continue;
          const px = rx - sx * AD.x * along, py = ry - AD.y * along, pz = rz - AD.z * along, r = Math.hypot(px, py, pz), R = 0.060 - 0.045 * along;       // the upper arm narrows toward the elbow
          if (r <= R) continue;
          const k = 1 + (R / r - 1) * sm((along - 0.03) / 0.05) * sm((0.27 - along) / 0.04);
          pos.setXYZ(i, sx * S0[0] + sx * AD.x * along + px * k, S0[1] + AD.y * along + py * k, S0[2] + AD.z * along + pz * k);
        }
        pos.needsUpdate = true;
      }
    }
    const hem = SHORTS_HEM[(kit.shorts || {}).len || 'mid']; if (hem <= 0.61) return;
    const HIP = [0.0884, 0.8952, 0.008], KNEE = [0.1095, 0.497, 0.026], sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    for (const me of this.meshes) {
      if (me.userData.head) continue;
      const pos = this.own(me).attributes.position, nor = me.geometry.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i); if (y < 0.50 || y > hem + 0.04) continue;
        const x = pos.getX(i), z = pos.getZ(i); if (Math.abs(x) > 0.27) continue;
        const sx = x < 0 ? -1 : 1, t = (HIP[1] - y) / (HIP[1] - KNEE[1]), ax = sx * (HIP[0] + (KNEE[0] - HIP[0]) * t), az = HIP[2] + (KNEE[2] - HIP[2]) * t;
        // the thigh at this height: thicker toward the hip, deeper than it is wide
        const R = 0.064 + (0.095 - 0.064) * Math.min(1, Math.max(0, (y - 0.55) / 0.31)), dx = (x - ax) / (R * 0.96), dz = (z - az) / (R * 1.10), r = Math.hypot(dx, dz);
        if (r <= 1) { if (Math.abs(y - 0.60) < 0.024 && r > 0.55) pos.setXYZ(i, ax + (x - ax) * 0.86, y, az + (z - az) * 0.86); continue; }   // the old hem's turned-in edge, tucked out of sight
        // the shorts' inside face, which lies on their outside: drawn in onto the leg it would take the same place and
        // flicker through it (on a two-sided body, as pale patches): it goes 5 mm under the skin instead, facing in
        const inner = nor && nor.getX(i) * dx + nor.getZ(i) * dz < 0;
        const wk = sm((hem + 0.04 - y) / 0.05), k = 1 + ((inner ? 1 - 0.005 / R : 1) / r - 1) * wk;
        pos.setXYZ(i, ax + (x - ax) * k, y, az + (z - az) * k);
        // facing out from the thigh, tipped down as the thigh narrows toward the knee (0.10 per unit of height)
        if (nor && wk > 0.5) { const nl = (inner ? -1 : 1) * (Math.hypot(dx, dz) || 1), f = 1 / Math.hypot(1, 0.10); nor.setXYZ(i, dx / nl * f, (inner ? 0.10 : -0.10) * f, dz / nl * f); }
      }
      pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
    }
  }
  // His own body (tools/body_shapes.py): every vertex of the body moved by how his MakeHuman body differs from the
  // reference there, and the skin his kit leaves bare (forearms, the legs below his shorts, the arms of a sleeveless
  // shirt) laid onto his MakeHuman surface itself. Done once, on his own copy of the mesh; normals turn with the surface
  // (and on the bare skin are the reference surface's own, so every sheet of the model lying there shades alike).
  applyShape(D, look) {
    const sh = this.M.shapes, me = this.meshes.find(m => !m.userData.head); if (!me || me.geometry.attributes.position.count !== sh.n) return false;
    const g = this.own(me), pos = g.attributes.position, nor = g.attributes.normal, P = pos.array, P0 = sh.P0, S0 = sh.snap, bare = sh.bare, u = sh.unit, n = sh.n;
    const k = look.kit || {}, sleeveless = k.sleeveless == null ? !!look.sleeveless : !!k.sleeveless, hem = SHORTS_HEM[(k.shorts || {}).len || 'mid'];
    // copies of a vertex at one place start together (fitting the kit may have parted them), and get the same of everything
    const mean = new Float32Array(sh.pcount.length * 3);
    for (let i = 0, j = 0; i < n; i++, j += 3) { const w = sh.pid[i] * 3; mean[w] += P[j]; mean[w + 1] += P[j + 1]; mean[w + 2] += P[j + 2]; }
    for (let i = 0, j = 0; i < n; i++, j += 3) { const w = sh.pid[i] * 3, c = sh.pcount[sh.pid[i]]; P[j] = mean[w] / c; P[j + 1] = mean[w + 1] / c; P[j + 2] = mean[w + 2] / c; }
    const before = weldedNormals(pos, sh, new Float32Array(sh.nw * 3)), cs = new Float32Array(n), K = sh.kind, NX = sh.nx;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const y0 = P0[j + 1], leg = bare[j + 2] / 1e4 * clamp01((hem - 0.004 - y0) / 0.03), c = cs[i] = Math.min(1, (sleeveless ? bare[j + 1] : bare[j]) / 1e4 + leg);
      // Three sheets of the model meet on the thigh: its own leg skin, which goes on up under the shorts to about
      // 0.68 m; the shorts' shell over it, down to the model's hem at about 0.59 m; and their lining, turned in there.
      // The outside stays as the model built it: the shell on the surface down to that hem (with the lining's edge, so
      // the hem closes flat), the skin on the surface below it; the skin under the shell and the rest of the lining go
      // 8 mm under the surface (deeper than the shell's flat triangles sag inside the curve), out of sight.
      const tuck = 0.008 * Math.min(1, K[j + 2] / 1e4 * clamp01((y0 - 0.62) / 0.03) + K[j] / 1e4 * clamp01((y0 - 0.595) / 0.03));
      for (let e = 0; e < 3; e++) { const p = P[j + e]; P[j + e] = p + c * (P0[j + e] + S0[j + e] * u - tuck * NX[j + e] / 1e4 - p) + D[j + e] * u; }
    }
    pos.needsUpdate = true;
    if (nor) {
      const after = weldedNormals(pos, sh, new Float32Array(sh.nw * 3)), a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { const w = sh.wid[i] * 3; a.set(before[w], before[w + 1], before[w + 2]); b.set(after[w], after[w + 1], after[w + 2]); _q.setFromUnitVectors(a, b); v.fromBufferAttribute(nor, i).applyQuaternion(_q).lerp(b.set(NX[i * 3], NX[i * 3 + 1], NX[i * 3 + 2]).multiplyScalar(1e-4), cs[i]).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
      nor.needsUpdate = true;
    }
    this.shiftShoulders(sh.shoulders[look.build.shape] || 0, me);
    return true;
  }
  // Set the shoulder joints further apart (metres each side): the arm bones, and the skin they carry, move out.
  shiftShoulders(shift, only) {
    if (!shift) return;
    const bones = this.bones, wp = n => bones[B(n)].getWorldPosition(new THREE.Vector3());
    for (const me of this.meshes) {
      if (only && me !== only) continue;
      const g = this.own(me), pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const side = me.skeleton.bones.map(x => { const nm = x.name.slice(6); return /^(L|R)_(UpperArm|Forearm|Hand|Finger)/.test(nm) ? (nm[0] === 'L' ? 1 : -1) : 0; });
      for (let i = 0; i < pos.count; i++) { let dx = 0; for (let q = 0; q < 4; q++) dx += side[si.getComponent(i, q)] * sw.getComponent(i, q); if (dx) pos.setX(i, pos.getX(i) + dx * shift); }
      pos.needsUpdate = true;
    }
    for (const S of ['L', 'R']) { const bn = bones[B(S + '_UpperArm')], w = wp(S + '_UpperArm'); w.x += (S === 'L' ? 1 : -1) * shift; bn.position.copy(bn.parent.worldToLocal(w)); }
    this.root.updateMatrixWorld(true);
    for (const me of this.meshes) me.skeleton.calculateInverses();
  }
  applyBuild(b) {
    const bones = this.bones, wp = n => bones[B(n)].getWorldPosition(new THREE.Vector3());
    const seg = {}, K = {};
    for (const S of ['L', 'R']) {
      seg[S + '_UpperArm'] = [wp(S + '_UpperArm'), wp(S + '_Forearm')]; seg[S + '_Forearm'] = [wp(S + '_Forearm'), wp(S + '_Hand')];
      seg[S + '_Thigh'] = [wp(S + '_Thigh'), wp(S + '_Calf')]; seg[S + '_Calf'] = [wp(S + '_Calf'), wp(S + '_Foot')];
      const arm = b['arm' + S] || b.arms || 1;
      K[S + '_UpperArm'] = arm; K[S + '_Forearm'] = b['fore' + S] || 1 + (arm - 1) * 0.8; K[S + '_Thigh'] = b.legs || 1; K[S + '_Calf'] = b.calf || 1 + ((b.legs || 1) - 1) * 0.85;
    }
    const TORSO = new Set(['Pelvis', 'Spine', 'Spine1', 'Spine2', 'L_Clavicle', 'R_Clavicle']);
    const kx = b.chest || 1, kz = b.depth || 1, shift = b.shoulders || 0, spineZ = wp('Spine1').z;
    const p = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3();
    for (const me of this.meshes) {
      const g = this.own(me), pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, names = me.skeleton.bones.map(x => x.name.slice(6));
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i); d.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k); if (w <= 0) continue;
          const n = names[si.getComponent(i, k)], sg = seg[n];
          if (sg) { ab.copy(sg[1]).sub(sg[0]); const t = THREE.MathUtils.clamp(c.copy(p).sub(sg[0]).dot(ab) / ab.lengthSq(), -0.1, 1.1); c.copy(sg[0]).addScaledVector(ab, t); d.addScaledVector(c.sub(p).negate(), (K[n] - 1) * w); }
          else if (TORSO.has(n)) { d.x += p.x * (kx - 1) * w; d.z += (p.z - spineZ) * (kz - 1) * w; }
          // the whole arm rides out with the shoulder
          if (shift && /^(L|R)_(UpperArm|Forearm|Hand|Finger)/.test(n)) d.x += (n[0] === 'L' ? 1 : -1) * shift * w;
        }
        pos.setXYZ(i, p.x + d.x, p.y + d.y, p.z + d.z);
      }
      pos.needsUpdate = true;
    }
    if (shift) for (const S of ['L', 'R']) { const bn = bones[B(S + '_UpperArm')], w = wp(S + '_UpperArm'); w.x += (S === 'L' ? 1 : -1) * shift; bn.position.copy(bn.parent.worldToLocal(w)); }
    this.root.updateMatrixWorld(true);
    for (const me of this.meshes) me.skeleton.calculateInverses();
  }
  // Put an avatar in uniform: everything that is not bare skin takes `top` above the hips and
  // `bottom` below them, keeping the cloth's own folds; shoes are left as they are.
  setUniform(top, bottom) {
    if (!this.M.plain || !this.body) return;
    const m = this.body, prev = m.onBeforeCompile, s = this.scale;
    const U = { uTopC: { value: new THREE.Color(top) }, uBotC: { value: new THREE.Color(bottom) }, uHipY: { value: this.dim.hipY / s + 0.03 }, uShoeY: { value: (this.dim.ankle / s) + 0.03 } };
    m.onBeforeCompile = sh => {
      if (prev) prev(sh);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBindY; varying float vBindY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindY = aBindY;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTopC, uBotC; uniform float uHipY, uShoeY; varying float vBindY;').replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 c = diffuseColor.rgb; float gr = c.g / max(c.r, 1e-3), br = c.b / max(c.r, 1e-3);
          float skin = step(0.36, gr) * step(gr, 0.74) * step(0.14, br) * step(br, 0.58) * step(br, gr) * step(0.03, c.r);
          float l = dot(c, vec3(0.3, 0.55, 0.15)), cloth = (1.0 - skin) * step(uShoeY, vBindY);
          vec3 kit = mix(uBotC, uTopC, step(uHipY, vBindY)) * (0.5 + 0.62 * pow(l, 0.42));
          diffuseColor.rgb = mix(c, kit, cloth); }`);
    };
    m.customProgramCacheKey = () => 'arena:uniform';
    m.needsUpdate = true;
  }
  // Freeze the figure as posed: its skinned meshes become ordinary ones and the skeleton is
  // dropped. For people who hold one position all match, this costs a fraction of a live figure.
  freeze() {
    this.root.updateMatrixWorld(true);
    const out = new THREE.Group(), v = new THREE.Vector3(), n = new THREE.Vector3();
    for (const me of this.meshes) {
      me.skeleton.update();
      const g0 = me.geometry, pos = g0.attributes.position, nor = g0.attributes.normal, P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i).multiplyScalar(0.01).add(v);
        me.applyBoneTransform(i, v); me.applyBoneTransform(i, n); n.sub(v).normalize();
        v.applyMatrix4(me.matrixWorld); n.transformDirection(me.matrixWorld);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; N[i * 3] = n.x; N[i * 3 + 1] = n.y; N[i * 3 + 2] = n.z;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      if (g0.attributes.uv) g.setAttribute('uv', g0.attributes.uv); if (g0.attributes.aBindY) g.setAttribute('aBindY', g0.attributes.aBindY); if (g0.attributes.aBind) g.setAttribute('aBind', g0.attributes.aBind); g.setIndex(g0.index);
      const m = new THREE.Mesh(g, me.material); m.castShadow = me.castShadow; m.receiveShadow = true; m.matrixAutoUpdate = false; out.add(m);
    }
    // whatever was fixed to the bones (a cap) comes along where it now sits
    for (const o of this.headGear) { o.updateMatrixWorld(true); const c = o.clone(); c.matrix.copy(o.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale); out.add(c); }
    return out;
  }
  setFirstPerson(on) { for (const me of this.meshes) if (me.userData.head) me.visible = !on; for (const o of this.headGear) o.visible = !on; }
  // Fix a rigid object to a bone. `pos` and `quat` are where it sits on the body at rest,
  // in body space and real metres.
  attach(bone, obj, pos, quat) {
    const b = this.bones[B(bone)], r = this.rest[B(bone)], inv = r.q.clone().invert();
    obj.position.copy(pos).sub(r.p).applyQuaternion(inv).multiplyScalar(1 / this.scale);
    obj.quaternion.copy(inv); if (quat) obj.quaternion.multiply(quat);
    obj.scale.multiplyScalar(1 / this.scale);
    b.add(obj); if (bone === 'Head') this.headGear.push(obj);
    return obj;
  }
  // Fix an object built in the model's own bind space to a bone, as if it were skinned to it alone.
  attachBind(bone, obj) {
    const me = this.meshes.find(m => m.userData.head) || this.meshes[0], sk = me.skeleton, b = this.bones[B(bone)], i = sk.bones.indexOf(b);
    obj.matrixAutoUpdate = false; obj.matrix.copy(sk.boneInverses[i]).multiply(me.bindMatrix);
    b.add(obj); if (bone === 'Head') this.headGear.push(obj);
    return obj;
  }
  // change colouring in place (used when one model stands in for a whole crowd)
  setTint(skin, hair) {
    if (this.M.plain) return;
    const w = new THREE.Color(skin);
    for (const m of [this.body, this.head]) { const b = m.userData.base; m.userData.U.uSkinTint.value.setRGB(w.r / b.r, w.g / b.g, w.b / b.b); }
    this.head.userData.U.uHair.value.set(hair); this.head.userData.U.uSkinCol.value.copy(w);
  }
  setLook(look) { if (this.M.plain) return; kitUniforms(look, this.body.userData.U); }

  // Give a bone a world orientation `F` measured from its rest pose (F = identity leaves it at rest).
  drive(name, F) {
    const b = this.bones[B(name)], r = this.rest[B(name)];
    const w = this.world[name] || (this.world[name] = new THREE.Quaternion());
    w.copy(F).multiply(r.q);
    const par = b.parent && b.parent.isBone ? this.worldOf(b.parent.name.slice(6)) : _q2.identity();
    b.quaternion.copy(_q.copy(par).invert()).multiply(w);
    return w;
  }
  worldOf(name) { return this.world[name] || this.rest[B(name)].q; }
  // Put a bone back to the world orientation it was last driven to, after its parent has been turned since (the
  // collarbones hang from the neck, which is posed last, after the head has found the ball)
  redrive(name) {
    const b = this.bones[B(name)], w = this.world[name]; if (!w) return;
    const par = b.parent && b.parent.isBone ? this.worldOf(b.parent.name.slice(6)) : _q2.identity();
    b.quaternion.copy(_q.copy(par).invert()).multiply(w);
  }
  // Place the hips and set the trunk: pelvis turns with the feet, the chest carries twist and lean.
  setTrunk(pelvis, qPel, qChest) {
    const b = this.bones[B('Pelvis')];
    b.position.copy(pelvis).multiplyScalar(1 / this.scale);
    this.drive('Pelvis', qPel); this.drive('Spine', qPel);
    this.drive('Spine1', _q.copy(qPel).slerp(qChest, 0.5)); this.drive('Spine2', qChest);
    this.drive('L_Clavicle', qChest); this.drive('R_Clavicle', qChest);
    this.arm.updateWorldMatrix(false, true);
  }
  jointPos(name, out) { return this.bones[B(name)].getWorldPosition(out); }
  // Two-segment limb: aim the upper bone at the middle joint, the lower at the end.
  setLimb(S, kind, mid, end, parentF, root, outUpper, outLower) {
    const up = kind === 'arm' ? S + '_UpperArm' : S + '_Thigh', lo = kind === 'arm' ? S + '_Forearm' : S + '_Calf';
    const d1 = kind === 'arm' ? this.dir['arm' + S] : this.dir['leg' + S], d2 = kind === 'arm' ? this.dir['fore' + S] : this.dir['shank' + S];
    const Fu = swing(parentF, d1, _v.copy(mid).sub(root), outUpper);
    this.drive(up, Fu);
    const Fl = swing(Fu, d2, _v.copy(end).sub(mid), outLower);
    this.drive(lo, Fl);
    return Fl;
  }
  // Close the fingers by `k` (0 open … 1 fist) round whatever the hand is holding.
  // fist (0..1): toward a clenched fist - the knuckles bent square, the fingers folded into the palm, the thumb across them - where
  // k alone closes a hand round a handle (at its fullest the knuckles bent sixty degrees: a fist made with it was a claw)
  setFingers(S, k, point = 0, fist = 0) {           // point: the index finger held out straight (0..1) while the others close by k
    for (let f = 0; f <= 4; f++) for (const seg of ['', '1', '2']) {
      const n = B(S + '_Finger' + f + seg), b = this.bones[n]; if (!b) continue;
      const r = this.rest[n], kf = f === 1 ? k * (1 - point) + 0.08 * point : k;
      let a = f === 0 ? (seg === '' ? 0.25 : 0.45) * kf : (seg === '' ? 1.0 : seg === '1' ? 1.25 : 0.9) * kf;
      if (fist > 0) { const fa = f === 0 ? (seg === '' ? 0.55 : seg === '1' ? 0.85 : 0.7) : f === 1 && point > 0 ? a : (seg === '' ? 1.5 : seg === '1' ? 1.7 : 1.05); a += (fa - a) * Math.min(1, fist); }
      b.quaternion.copy(r.lq).multiply(_q.setFromAxisAngle(FINGER_AXIS, a * (S === 'L' ? 1 : 1)));
    }
  }
}
const FINGER_AXIS = new THREE.Vector3(0, 0, 1);
// Rotation from rest: begin as the parent turned, then swing the segment's rest direction onto `dir`.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sq = new THREE.Quaternion();
export function swing(parentF, restDir, dir, out) {
  _a.copy(restDir).applyQuaternion(parentF).normalize(); _b.copy(dir).normalize();
  _sq.setFromUnitVectors(_a, _b);
  return out.copy(_sq).multiply(parentF);
}
