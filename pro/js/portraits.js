// Rally Pro — a studio picture of each player for the menus: his own figure in his own kit,
// standing ready, lit from one side with a cool light behind, against nothing. Rendered once
// when the game starts and kept as images.
import * as THREE from 'three';
import { ARENA_U } from './arena.js';
import { Figure } from './figure.js';

export function renderPortraits(renderer, model, players, lookFor, o = {}) {
  const W = o.w || 440, H = o.h || 600, out = {};
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, samples: 4, type: THREE.HalfFloatType });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x2a2e3a, 1.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 4.4); key.position.set(-1.2, 1.9, -3.2); scene.add(key);
  const back = new THREE.DirectionalLight(0x8fb4ff, 3.0); back.position.set(2.4, 1.8, 2.2); scene.add(back);
  const cam = new THREE.PerspectiveCamera(25, W / H, 0.1, 30);
  const old = { on: ARENA_U.uArenaOn.value, rim: ARENA_U.uRimCol.value.clone(), rt: renderer.getRenderTarget(), auto: renderer.autoClear, col: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), sh: renderer.shadowMap.enabled };
  ARENA_U.uArenaOn.value = 0; ARENA_U.uRimCol.value.set(0.20, 0.30, 0.55); renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
  const raw = new Uint16Array(W * H * 4), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), im = g.createImageData(W, H), half = THREE.DataUtils.fromHalfFloat;
  // the film curve the match picture goes through, near enough, so a portrait matches the man on court
  const tone = x => { x *= 1.2; const y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); return Math.pow(Math.min(1, Math.max(0, y)), 1 / 2.2) * 255; };
  for (const pl of players) {
    const fig = new Figure({ ...lookFor(pl.id), shadow: false }, model), h = (pl.facts.cm || 185) / 185;
    scene.add(fig.group);
    const p = { i: 0, sgn: 1, x: 0, z: 0, vx: 0, vz: 0, stroke: null, split: -9, mood: 0, moodT: -9 };
    // as he stands waiting for the serve: low and ready, the racket out in front of him
    const m = { t: 0, phase: 'ready', phaseT: 0, score: { server: 1 }, ball: { visible: false, held: -1, x: 0, y: 1, z: -12 }, players: [p] };
    for (let k = 0; k < 120; k++) { m.t += 1 / 60; m.phaseT = m.t; fig.update(1 / 60, p, m); }
    // nearly face on, a little to the side the racket points to, so all of it is in the picture
    const side = pl.facts.lefty ? -1 : 1; cam.position.set(-1.05 * side * h, 1.34 * h, -3.7 * h); cam.lookAt(0.02 * side * h, 1.08 * h, -0.42 * h);
    renderer.setRenderTarget(rt);                    // reading the last picture left the plain framebuffer bound: take the multisampled one back
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, raw);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4, a = Math.min(1, half(raw[s + 3])), k = a > 0.003 ? 1 / a : 0;
      im.data[d] = tone(half(raw[s]) * k); im.data[d + 1] = tone(half(raw[s + 1]) * k); im.data[d + 2] = tone(half(raw[s + 2]) * k); im.data[d + 3] = a * 255;
    }
    g.putImageData(im, 0, 0); out[pl.id] = cv.toDataURL('image/webp', 0.9);
    scene.remove(fig.group);
    // and let go of what it put on the graphics card: twelve men's skin, face and kit maps would otherwise
    // sit there all session (anything the match then uses is simply sent again)
    fig.group.traverse(n => {
      if (!n.isMesh) return;
      if (n.userData.own || !n.isSkinnedMesh) n.geometry.dispose();
      for (const mt of [].concat(n.material)) { if (!mt) continue; for (const k in mt) { const v = mt[k]; if (v && v.isTexture) v.dispose(); } if (mt.uniforms) for (const k in mt.uniforms) { const v = mt.uniforms[k] && mt.uniforms[k].value; if (v && v.isTexture) v.dispose(); } }
    });
  }
  ARENA_U.uArenaOn.value = old.on; ARENA_U.uRimCol.value.copy(old.rim); renderer.shadowMap.enabled = old.sh;
  renderer.setRenderTarget(old.rt); renderer.setClearColor(old.col, old.a); renderer.autoClear = old.auto; rt.dispose();
  return out;
}
