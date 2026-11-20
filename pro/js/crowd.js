// Rally Pro — the crowd. Seated people are posed with the same rigged model the players
// use, dressed in a spread of colours, and rendered once into a sheet of small pictures.
// The stands are then filled with thousands of those pictures on upright cards: people who
// look like people from the court, at the cost of two triangles each.
import * as THREE from 'three';
import { Person } from './people.js';
import { ARENA_U, sunMask } from './arena.js';

// The sheet: each spectator has six pictures side by side — watching, head turned to his
// left, to his right, two frames of applause, and from behind — and the sheet holds two
// people per row.
export const CROWD = { cols: 12, rows: 14, per: 6, persons: 28, cw: 128, ch: 216, w: 0.66, h: 1.114 };
export const CROWD_SRC = ['Female_Adult_01', 'Male_Adult_01', 'Female_Adult_02', 'Male_Adult_02', 'Female_Adult_03', 'Male_Adult_04', 'Female_Adult_05', 'Male_Adult_06', 'Female_Adult_08', 'Male_Adult_09', 'Female_Adult_11', 'Male_Adult_12', 'Female_Adult_14', 'Male_Adult_15'];

const _V = (x, y, z) => new THREE.Vector3(x, y, z), _up = _V(0, 1, 0), _fwd = _V(0, 0, -1), _right = _V(1, 0, 0), _I = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
// Sit a person down (pose them before moving their root: joints are read in world space).
// variant: 0 hands on thighs, 1 arms folded, 2 chin on hand, 3/4 applauding.
export function poseSeated(person, variant, lean, yaw, seatY) {
  const D = person.dim, qLean = new THREE.Quaternion().setFromAxisAngle(_right, lean);
  person.setTrunk(_V(0, seatY, 0), _I, qLean);
  for (const [S, sx] of [['L', -1], ['R', 1]]) {
    const hip = person.jointPos(S + '_Thigh', _V(0, 0, 0));
    const knee = hip.clone().addScaledVector(_fwd, D.thigh * 0.97).addScaledVector(_right, sx * 0.05).addScaledVector(_up, 0.03);
    const ankle = knee.clone().addScaledVector(_up, -D.shank * 0.96).addScaledVector(_fwd, 0.06);
    person.setLimb(S, 'leg', knee, ankle, _I, hip, _qa, _qb); person.drive(S + '_Foot', _I); person.drive(S + '_Toe0', _I);
    const sh = person.jointPos(S + '_UpperArm', _V(0, 0, 0)); let el, wr;
    if (variant === 0) { el = sh.clone().addScaledVector(_up, -0.26).addScaledVector(_fwd, 0.07).addScaledVector(_right, sx * 0.07); wr = el.clone().addScaledVector(_fwd, 0.25).addScaledVector(_up, -0.05).addScaledVector(_right, -sx * 0.05); }
    else if (variant === 1) { el = sh.clone().addScaledVector(_up, -0.25).addScaledVector(_fwd, 0.12).addScaledVector(_right, sx * 0.03); wr = el.clone().addScaledVector(_right, -sx * 0.25).addScaledVector(_fwd, 0.07).addScaledVector(_up, sx * 0.03); }
    else if (variant === 2) { el = sh.clone().addScaledVector(_up, sx > 0 ? -0.18 : -0.26).addScaledVector(_fwd, sx > 0 ? 0.2 : 0.07).addScaledVector(_right, sx * 0.06); wr = sx > 0 ? el.clone().addScaledVector(_up, 0.24).addScaledVector(_fwd, 0.04).addScaledVector(_right, -0.1) : el.clone().addScaledVector(_fwd, 0.25).addScaledVector(_up, -0.05); }
    else { el = sh.clone().addScaledVector(_up, -0.15).addScaledVector(_fwd, 0.2).addScaledVector(_right, sx * 0.07); wr = el.clone().addScaledVector(_up, 0.2).addScaledVector(_fwd, 0.1).addScaledVector(_right, -sx * (variant === 3 ? 0.13 : 0.04)); }
    const Ff = person.setLimb(S, 'arm', el, wr, qLean, sh, _qa, _qb); person.drive(S + '_Hand', Ff); person.setFingers(S, 0.25);
  }
  const qh = new THREE.Quaternion().setFromAxisAngle(_up, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(_right, -0.06));
  person.drive('Neck', qLean.clone().slerp(qh, 0.5)); person.drive('Head', qh);
  person.chestQ = qLean.clone();
  person.arm.updateWorldMatrix(false, true);
}
// Stand at ease: feet apart, hands behind the back — a ball kid waiting, or kneel by the net post.
// the knee of a leg from hip to ankle with these lengths, bent toward `pole`
function kneeFor(hip, ankle, l1, l2, pole) {
  const d = ankle.clone().sub(hip), L = Math.min(d.length(), (l1 + l2) * 0.999); d.normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
  return hip.clone().addScaledVector(d, x).addScaledVector(p, h);
}
export function poseStanding(person, kneel) {
  const D = person.dim;
  // kneeling, the hips sit as high as the down knee lets them: its thigh reaches from the hip to the ground
  const backZ = 0.10, hipY = kneel ? 0.065 + Math.sqrt(Math.max(0.01, D.thigh * D.thigh - backZ * backZ - 0.0064)) : D.hipY - 0.012;
  const lean = new THREE.Quaternion().setFromAxisAngle(_right, kneel ? -0.22 : -0.03);
  person.setTrunk(_V(0, hipY, 0), _I, lean);
  for (const [S, sx] of [['L', -1], ['R', 1]]) {
    const hip = person.jointPos(S + '_Thigh', _V(0, 0, 0)); let knee, ankle;
    if (kneel && sx > 0) {
      // the down knee on the court a little behind the hip, the shin flat along the ground behind it
      knee = _V(hip.x + 0.08, 0.065, hip.z + backZ); knee.sub(hip).setLength(D.thigh).add(hip);
      ankle = knee.clone().add(_V(0.02, 0.0, 1).normalize().multiplyScalar(D.shank)); ankle.y = Math.max(ankle.y, D.ankle * 0.9);
    } else if (kneel) {
      // the up leg: its foot flat on the ground in front, the knee raised over it
      ankle = _V(hip.x - 0.10, D.ankle, hip.z - Math.min(0.42, D.shank * 0.85));
      knee = kneeFor(hip, ankle, D.thigh, D.shank, _V(0, 0.6, -1).normalize());
    } else {
      ankle = _V(hip.x + sx * 0.07, D.ankle, 0);
      knee = kneeFor(hip, ankle, D.thigh, D.shank, _V(0, 0, -1));
    }
    person.setLimb(S, 'leg', knee, ankle, _I, hip, _qa, _qb); person.drive(S + '_Foot', _I); person.drive(S + '_Toe0', _I);
    const sh = person.jointPos(S + '_UpperArm', _V(0, 0, 0));
    const el = sh.clone().addScaledVector(_up, -0.27).addScaledVector(_right, sx * 0.05).addScaledVector(_fwd, kneel ? 0.08 : -0.06);
    const wr = kneel ? el.clone().addScaledVector(_fwd, 0.2).addScaledVector(_up, -0.16) : el.clone().addScaledVector(_up, -0.16).addScaledVector(_right, -sx * 0.12).addScaledVector(_fwd, -0.16);
    const Ff = person.setLimb(S, 'arm', el, wr, lean, sh, _qa, _qb); person.drive(S + '_Hand', Ff); person.setFingers(S, 0.4);
  }
  person.drive('Neck', lean); person.drive('Head', _I);
  person.chestQ = lean.clone();
  person.arm.updateWorldMatrix(false, true);
}

// Draw the sheet from a set of avatars (done once, offline: tools/README.md). Every avatar
// appears twice, sitting differently and sometimes in a hat.
export function renderCrowdAtlas(renderer, avatars) {
  const C = CROWD, W = C.cols * C.cw, H = C.rows * C.ch;
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, samples: 4 });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9fa9, 3.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(0.5, 2.0, -1.4); scene.add(key);
  const cam = new THREE.OrthographicCamera(-C.w / 2, C.w / 2, C.h, 0, 0.1, 20);
  // a summer crowd is mostly in white and pale colours: the second copy of each person is re-dressed
  const PALE = ['#f2f1ec', '#e8e6df', '#ffffff', '#dfe6ee', '#f0e6d8', '#cfe0f0', '#e9d5d8', '#d9e4dc', '#f2f1ec', '#1c2740', '#c9b06a', '#e8e6df', '#9fb4cf', '#c8685a'];
  let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const old = { on: ARENA_U.uArenaOn.value, rt: renderer.getRenderTarget(), auto: renderer.autoClear, tm: renderer.toneMapping, vp: renderer.getViewport(new THREE.Vector4()), sc: renderer.getScissor(new THREE.Vector4()) };
  ARENA_U.uArenaOn.value = 0; renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.setScissorTest(true);
  renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.clear();
  const hatM = new THREE.MeshStandardMaterial({ color: '#e9e5d8', roughness: 0.9 }), strawM = new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.95 }), capCols = ['#e9e5d8', '#1d2a44', '#b23a32', '#e9e5d8', '#2f5f45'];
  for (let pi = 0; pi < C.persons; pi++) {
    const M = avatars[pi % avatars.length], second = pi >= avatars.length, female = /Female/.test(M.key);
    const person = new Person(M, { height: M.info.height * (0.97 + rnd() * 0.06), shadow: false, lit: false });
    scene.add(person.root);
    // headwear: a cap on some of the men, a brimmed sun hat on some of the women
    if (second && person.body) {
      const cloth = new THREE.Color(PALE[pi % PALE.length]);
      person.body.onBeforeCompile = sh => { sh.uniforms.uCloth = { value: cloth }; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCloth;').replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 c = diffuseColor.rgb; float gr = c.g / max(c.r, 1e-3), br = c.b / max(c.r, 1e-3);
          // bare skin keeps its colour; everything else is cloth and takes the new one, keeping its folds
          float skin = step(0.36, gr) * step(gr, 0.74) * step(0.14, br) * step(br, 0.58) * step(br, gr) * step(0.03, c.r);
          float l = dot(c, vec3(0.3, 0.55, 0.15));
          diffuseColor.rgb = mix(uCloth * (0.5 + 0.62 * pow(l, 0.42)), c, skin); }`); };
      person.body.customProgramCacheKey = () => 'crowd-recloth';
    }
    const hat = rnd() < (female ? (second ? 0.22 : 0.08) : (second ? 0.34 : 0.1)), s = person.scale, ey = person.dim.eyeY;
    if (hat) {
      if (female) {
        const g = new THREE.Group(), crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), strawM); crown.scale.set(1, 0.85, 1.1);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.012, 24), strawM); g.add(crown, brim);
        person.attach('Head', g, new THREE.Vector3(0, ey + 0.055 * s, 0.01 * s));
      } else {
        const m = hatM.clone(); m.color.set(capCols[Math.floor(rnd() * capCols.length)]);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), m); cap.scale.set(0.098 * s, 0.112 * s, 0.124 * s);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18), m); brim.scale.set(0.8, 0.07, 0.72); brim.position.set(0, 0.12, -0.92); cap.add(brim);
        person.attach('Head', cap, new THREE.Vector3(0, ey + 0.028 * s, 0.008 * s));
      }
    }
    const variant = second ? (rnd() < 0.5 ? 1 : 2) : 0, lean = 0.03 + rnd() * 0.1, seatY = 0.52;
    const col0 = (pi % 2) * C.per, row = Math.floor(pi / 2);
    const shots = [[variant, lean, 0, -6], [variant, lean, 0.62, -6], [variant, lean, -0.62, -6], [3, -0.02, 0, -6], [4, -0.02, 0, -6], [variant, lean, 0, 6]];
    shots.forEach(([v, ln, yaw, camZ], k) => {
      poseSeated(person, v, ln, yaw, seatY);
      cam.position.set(0, 0.36, camZ); cam.lookAt(0, 0.36, 0); cam.updateMatrixWorld();
      const x = (col0 + k) * C.cw, y = (C.rows - 1 - row) * C.ch;
      renderer.setViewport(x, y, C.cw, C.ch); renderer.setScissor(x, y, C.cw, C.ch);
      renderer.clearDepth(); renderer.render(scene, cam);
    });
    scene.remove(person.root);
  }
  renderer.setScissorTest(false); renderer.setRenderTarget(old.rt); renderer.setViewport(old.vp); renderer.setScissor(old.sc); renderer.autoClear = old.auto; renderer.toneMapping = old.tm; ARENA_U.uArenaOn.value = old.on;
  return rt;
}
// The finished sheet as an image (for saving), the right way up.
export function atlasDataURL(renderer, rt, type = 'image/webp', q = 0.92) {
  const W = rt.width, H = rt.height, px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);
  for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g.putImageData(im, 0, 0); return c.toDataURL(type, q);
}
let _atlas = null;
export function loadCrowdAtlas() {
  if (_atlas) return _atlas;
  _atlas = new Promise(res => new THREE.TextureLoader().load(new URL('../assets/crowd/atlas.webp', import.meta.url).href, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; res(t); }, undefined, () => res(null)));
  return _atlas;
}

// Thousands of cards from seat positions: list = [x, y, z, facing, wide] per seat.
export function crowdCards(list, atlas, rnd, o = {}) {
  const C = CROWD, n = list.length / 5;
  const g = new THREE.PlaneGeometry(C.w, C.h); g.translate(0, C.h / 2, 0);
  // lit as if facing up and toward the court, so the sun reaches a crowd the way it reaches people
  const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 0.62, 0.78);
  const cells = new Float32Array(n * 3), phase = new Float32Array(n);
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const U = o.uniforms;
  sunMask(mat, {
    key: 'crowd-cards', uniforms: { ...U, uCell: { value: new THREE.Vector2(1 / C.cols, 1 / C.rows) } },
    vertexPars: 'attribute vec3 aCell; attribute float aPhase; uniform vec2 uCell; uniform float uCheer, uCrowdT; uniform vec3 uCrowdBall;',
    vertex: '',
    // a real crowd is mostly whites, navies and muted colour: the sheet's reds are pulled back toward that
    afterMap: '{ vec3 cc = diffuseColor.rgb; float lm = dot(cc, vec3(0.3, 0.55, 0.15)); float red = clamp((cc.r - max(cc.g, cc.b)) * 2.6, 0.0, 1.0); cc = mix(cc, vec3(lm * 1.05, lm * 0.98, lm * 0.96), red * 0.62); diffuseColor.rgb = mix(vec3(dot(cc, vec3(0.3, 0.55, 0.15))), cc, 0.82); }',
  });
  // Each card turns part of the way toward whoever is looking, so a stand seen from the side
  // or from above is still a stand full of people; seen from behind it shows their backs.
  // While a point is played each head follows the ball, a beat late and not all together.
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => { prev(sh); sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec3 ax = instanceMatrix[0].xyz, az = instanceMatrix[2].xyz; float sx = length(ax), sz = length(az); ax /= sx; az /= sz;
        vec3 org = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        vec3 tc = (cameraPosition - org) * mat3(modelMatrix);
        vec2 t2 = normalize(tc.xz + vec2(1e-5)); vec2 f2 = az.xz;
        float facing = dot(f2, t2), sgn = facing < 0.0 ? -1.0 : 1.0;
        vec2 g2 = normalize(f2 * sgn + t2 * 1.6);
        vec3 right = vec3(g2.y, 0.0, -g2.x);
        vec3 D = right * transformed.x;
        transformed.x = dot(D, ax); transformed.z = dot(D, az) * sx / sz;
        // which of his pictures: applauding, watching the ball to one side, or straight ahead
        float up = step(1.0 - uCheer * 0.95, aPhase);
        float beat = step(0.5, fract(uCrowdT * (2.6 + aPhase * 1.4) + aPhase * 7.0));
        vec2 toBall = uCrowdBall.xz - instanceMatrix[3].xz;
        float side = (toBall.x * az.z - toBall.y * az.x) / max(1.0, length(toBall));           // + = the ball is to his left
        float idl = fract(uCrowdT * (0.045 + aPhase * 0.05) + aPhase * 17.0);                    // between points they look about them
        float look = uCrowdBall.y > 0.5 ? (side > 0.26 + aPhase * 0.2 ? 1.0 : side < -0.26 - aPhase * 0.2 ? 2.0 : 0.0) : (idl < 0.15 ? 1.0 : idl > 0.87 ? 2.0 : 0.0);
        float k = sgn < 0.0 ? 5.0 : up > 0.5 ? 3.0 + beat : look;
        float flip = aCell.z;                                                                   // half of them are mirror images
        if (flip > 0.5 && k > 0.5 && k < 2.5) k = 3.0 - k;
        vec2 cuv = vec2(flip > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
        vMapUv = (cuv + vec2(aCell.x + k, aCell.y)) * uCell;
        float onFeet = step(1.0 - clamp((uCheer - 0.5) * 1.5, 0.0, 0.7), fract(aPhase * 7.31));                // a big point brings many of them to their feet
        transformed.y += up * 0.05 * abs(sin(uCrowdT * (7.0 + aPhase * 5.0) + aPhase * 40.0)) + 0.012 * sin(uCrowdT * (0.7 + aPhase) + aPhase * 50.0) + onFeet * up * 0.36 * step(0.001, uv.y + 1.0);
        transformed.x += 0.012 * uv.y * sin(uCrowdT * (0.31 + aPhase * 0.4) + aPhase * 90.0); }
      #endif`); };
  mat.customProgramCacheKey = () => 'crowd-cards-4';
  const mesh = new THREE.InstancedMesh(g, mat, n);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const sc = 0.94 + rnd() * 0.12, wide = list[i * 5 + 4];
    P.set(list[i * 5], list[i * 5 + 1], list[i * 5 + 2]); Q.setFromAxisAngle(Y, list[i * 5 + 3] + (rnd() - 0.5) * 0.25); S.set(sc * (wide > 1 ? 1.35 : 1), sc, sc);
    M.compose(P, Q, S); mesh.setMatrixAt(i, M);
    const pi = Math.floor(rnd() * C.persons);
    cells[i * 3] = (pi % 2) * C.per; cells[i * 3 + 1] = C.rows - 1 - Math.floor(pi / 2); cells[i * 3 + 2] = rnd() < 0.5 ? 1 : 0; phase[i] = rnd();
    const k = 0.86 + rnd() * 0.22; col.setRGB(k, k, k); mesh.setColorAt(i, col);
  }
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 3)); g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false;
  return mesh;
}
