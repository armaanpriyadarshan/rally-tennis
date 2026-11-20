// Rally Pro — the ball as you see it: felt, motion streak, marks on the court, dust.
import * as THREE from 'three';
import { BALL, COURT } from './physics.js';
import { sunMask } from './arena.js';
import { ballTexture, ballNormal, blobTexture } from './textures.js';

const TRAIL = 16, MARKS = 220, DUST = 160;

const _bp = new THREE.Vector3();
export class BallFx {
  constructor(scene, surface) {
    this.scene = scene; this.surface = surface;
    const g = this.group = new THREE.Group(); scene.add(g);
    // ball
    const m = sunMask(new THREE.MeshStandardMaterial({ map: ballTexture(), normalMap: ballNormal(), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, emissive: new THREE.Color('#c9dd2e'), emissiveIntensity: 0.10 }));
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 24, 16), m); this.ball.castShadow = true; g.add(this.ball);
    // streak: a camera-facing ribbon through the ball's last few positions
    const tp = new Float32Array(TRAIL * 2 * 3), ta = new Float32Array(TRAIL * 2), ti = [];
    for (let i = 0; i < TRAIL - 1; i++) { const k = i * 2; ti.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aAlpha', new THREE.BufferAttribute(ta, 1)); tg.setIndex(ti);
    this.trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color('#dff04a') }, uGain: { value: 1 } },
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uGain; varying float vA; void main(){ gl_FragColor = vec4(uCol * uGain, vA); }',
    }));
    this.trail.frustumCulled = false; this.trail.renderOrder = 4; g.add(this.trail);
    this.hist = []; this.spin = new THREE.Quaternion();
    // marks
    const mk = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(64), transparent: true, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), MARKS);
    mk.count = 0; mk.frustumCulled = false; mk.renderOrder = 2; g.add(mk); this.marks = mk; this.markList = []; this.markI = 0;
    // dust
    const dp = new Float32Array(DUST * 3), da = new Float32Array(DUST), ds = new Float32Array(DUST);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aAlpha', new THREE.BufferAttribute(da, 1)); dg.setAttribute('aSize', new THREE.BufferAttribute(ds, 1));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTex: { value: blobTexture(64, 'rgba(255,255,255,1)') }, uCol: { value: new THREE.Color('#ffffff') }, uScale: { value: 600 } },
      vertexShader: 'attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uTex; uniform vec3 uCol; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a); }',
    }));
    this.dust.frustumCulled = false; this.dust.renderOrder = 5; g.add(this.dust);
    this.parts = []; for (let i = 0; i < DUST; i++) this.parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, a: 1 });
    this.partI = 0;
    this.dustCol = { hard: '#e8ecef', clay: '#d98a5a', grass: '#e9ead8' }[surface] || '#ffffff';
    // where an incoming ball will land, and where you are aiming
    const ringM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
    this.land = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 40), ringM); this.land.rotation.x = -Math.PI / 2; this.land.position.y = 0.008; this.land.renderOrder = 3; g.add(this.land);
    const aimM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
    this.aim = new THREE.Group(); g.add(this.aim);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48), aimM); this.aimRing.rotation.x = -Math.PI / 2; this.aim.add(this.aimRing);
    this.aimDot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), aimM); this.aimDot.rotation.x = -Math.PI / 2; this.aim.add(this.aimDot);
    this.aim.position.y = 0.009; this.aimMat = aimM; this.landMat = ringM;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    this.t = 0;
  }

  // `held`: world position of the hand carrying the ball, if any
  update(dt, b, camera, o = {}) {
    this.t += dt;
    const ball = this.ball;
    ball.visible = !!b.visible;
    if (b.held >= 0 && o.held) ball.position.copy(o.held); else ball.position.set(b.x, b.y, b.z);
    // just let go of: from where the hand had it into its own flight, without a jump
    if (o.held && b.held >= 0) { this.relFrom = this.relFrom || new THREE.Vector3(); this.relFrom.copy(o.held).sub(_bp.set(b.x, b.y, b.z)); this.relT = 0; this.relOn = true; }
    else if (this.relOn) { this.relT += dt; const k = Math.exp(-this.relT / 0.05); if (k < 0.02) this.relOn = false; else ball.position.addScaledVector(this.relFrom, k); }
    // spin you can see
    const w = Math.hypot(b.wx, b.wy, b.wz);
    if (w > 0.5 && b.held < 0) { this._p.set(b.wx / w, b.wy / w, b.wz / w); this._q.setFromAxisAngle(this._p, Math.min(w * dt, 2.5)); ball.quaternion.premultiply(this._q); }
    // The ball is drawn at its real size, whatever the camera and however far away: enlarging it with
    // distance (more for the broadcast camera than the others) made it change size between views and in flight.
    const sc = 1; ball.scale.setScalar(sc);
    // streak
    const speed = Math.hypot(b.vx, b.vy, b.vz), H = this.hist;
    H.unshift({ x: ball.position.x, y: ball.position.y, z: ball.position.z, t: this.t });
    if (H.length > TRAIL) H.length = TRAIL;
    const pa = this.trail.geometry.attributes.position.array, aa = this.trail.geometry.attributes.aAlpha.array;
    const live = b.visible && b.held < 0 && speed > 7;
    const shutter = 0.05, wid = BALL.r * sc * 0.92, cam = camera.position;
    for (let i = 0; i < TRAIL; i++) {
      const h = H[Math.min(i, H.length - 1)], n = H[Math.min(i + 1, H.length - 1)];
      // side vector: perpendicular to both the path and the line of sight
      let dx = h.x - n.x, dy = h.y - n.y, dz = h.z - n.z; const vx = h.x - cam.x, vy = h.y - cam.y, vz = h.z - cam.z;
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      const age = this.t - h.t, a = live ? Math.max(0, 1 - age / shutter) * 0.5 * Math.min(1, (speed - 7) / 14) : 0, ww = wid * (1 - 0.35 * Math.min(1, age / shutter));
      const k = i * 6; pa[k] = h.x + sx * ww; pa[k + 1] = h.y + sy * ww; pa[k + 2] = h.z + sz * ww; pa[k + 3] = h.x - sx * ww; pa[k + 4] = h.y - sy * ww; pa[k + 5] = h.z - sz * ww;
      aa[i * 2] = aa[i * 2 + 1] = a;
    }
    this.trail.geometry.attributes.position.needsUpdate = true; this.trail.geometry.attributes.aAlpha.needsUpdate = true;
    this.trail.visible = live;
    this.stepDust(dt); this.stepMarks(dt);
  }
  reset() { this.hist.length = 0; }

  // ---- marks ----
  mark(x, z, vx, vz, speed, o = {}) {
    const s = this.surface;
    // clay keeps every mark; a hard court shows a faint scuff for a few seconds; grass barely shows
    const life = o.life || (s === 'clay' ? 600 : s === 'hard' ? 9 : 4);
    const len = THREE.MathUtils.clamp(0.07 + speed * 0.006, 0.07, 0.34) * (o.scale || 1), wid = 0.075 * (o.scale || 1);
    const ang = Math.atan2(vx, vz);
    const col = o.color || (s === 'clay' ? '#5a2410' : s === 'hard' ? '#f4f6f8' : '#d8dcc0');
    const a = o.alpha || (s === 'clay' ? 0.5 : s === 'hard' ? 0.22 : 0.15);
    const mk = { x, z, len, wid, ang, life, max: life, col, a };
    const i = this.markI; this.markList[i] = mk; this.markI = (i + 1) % MARKS;
    this.marks.count = Math.max(this.marks.count, Math.min(MARKS, this.markList.length));
    this.writeMark(i);
  }
  writeMark(i) {
    const mk = this.markList[i]; if (!mk) return;
    const f = this.surface === 'clay' ? 1 : Math.min(1, mk.life / (mk.max * 0.6));
    this._q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, mk.ang, 'YXZ'));
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mk.ang).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    this._m.compose(this._p.set(mk.x, 0.0065, mk.z), this._q, this._s.set(mk.wid * 2, mk.len * 2, 1));
    this.marks.setMatrixAt(i, this._m);
    this._c.set(mk.col); this.marks.setColorAt(i, this._c);
    mk.f = f; this.marks.instanceMatrix.needsUpdate = true; if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }
  stepMarks(dt) {
    let any = false, op = 0;
    for (let i = 0; i < this.markList.length; i++) { const mk = this.markList[i]; if (!mk || mk.life <= 0) continue; mk.life -= dt; if (mk.life <= 0) { this._m.makeScale(0, 0, 0); this.marks.setMatrixAt(i, this._m); any = true; } else op = Math.max(op, mk.a); }
    if (any) this.marks.instanceMatrix.needsUpdate = true;
    this.marks.material.opacity = this.surface === 'clay' ? 0.5 : this.surface === 'hard' ? 0.22 : 0.15;
  }
  clearMarks() { this.markList.length = 0; this.markI = 0; this.marks.count = 0; }

  // ---- dust ----
  puff(x, y, z, n, o = {}) {
    for (let k = 0; k < n; k++) {
      const p = this.parts[this.partI]; this.partI = (this.partI + 1) % DUST;
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 1) * (0.3 + Math.random() * 0.9);
      p.x = x; p.y = y + 0.02; p.z = z; p.vx = Math.cos(a) * sp + (o.vx || 0) * 0.12; p.vz = Math.sin(a) * sp + (o.vz || 0) * 0.12; p.vy = (o.up || 0.8) * (0.4 + Math.random());
      p.life = p.max = (o.life || 0.6) * (0.6 + Math.random() * 0.8); p.s = (o.size || 0.12) * (0.6 + Math.random() * 0.9); p.a = o.alpha || 0.5;
    }
    if (o.color) this.dust.material.uniforms.uCol.value.set(o.color); else this.dust.material.uniforms.uCol.value.set(this.dustCol);
  }
  stepDust(dt) {
    const pa = this.dust.geometry.attributes.position.array, aa = this.dust.geometry.attributes.aAlpha.array, sa = this.dust.geometry.attributes.aSize.array;
    for (let i = 0; i < DUST; i++) {
      const p = this.parts[i];
      if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 1.6 * dt; const dr = Math.exp(-3 * dt); p.vx *= dr; p.vz *= dr; if (p.y < 0.01) { p.y = 0.01; p.vy = 0; } }
      const f = p.life > 0 ? p.life / p.max : 0;
      pa[i * 3] = p.x; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = p.z; aa[i] = f * p.a; sa[i] = p.s * (1.6 - 0.6 * f);
    }
    this.dust.geometry.attributes.position.needsUpdate = true; this.dust.geometry.attributes.aAlpha.needsUpdate = true; this.dust.geometry.attributes.aSize.needsUpdate = true;
  }
  setViewport(h) { this.dust.material.uniforms.uScale.value = h * 0.9; }

  // ---- markers ----
  showLanding(p, strength) {
    if (!p || strength <= 0) { this.landMat.opacity = Math.max(0, this.landMat.opacity - 0.08); return; }
    this.land.position.set(p.x, 0.008, p.z); this.landMat.opacity = 0.55 * strength; const s = 1 + 0.12 * Math.sin(this.t * 9); this.land.scale.set(s, s, 1);
  }
  showAim(x, z, radius, color, alpha, deep) {
    if (alpha <= 0) { this.aimMat.opacity = 0; return; }
    this.aim.position.set(x, 0.009, z); this.aimRing.scale.set(radius, deep || radius, 1); this.aimMat.opacity = alpha; this.aimMat.color.set(color || '#ffffff');
  }
}
