// Rally Pro — renderer, post-processing and frame pacing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { arenaEnvironment } from './arena.js';

// The last pass works on the finished picture: a lens, not a light. Slight vignette, a
// whisper of colour fringing toward the corners, and film grain so flat colour never bands.
// It also carries the tone curve, so the picture needs no separate output pass.
const LensShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uNear: { value: 0.07 }, uFar: { value: 9000 }, uFocus: { value: 40 }, uRange: { value: 30 }, uMaxR: { value: 0 },
    uTime: { value: 0 }, uVig: { value: 0.22 }, uGrain: { value: 0.022 }, uCA: { value: 0.0025 }, uFade: { value: 0 }, uSat: { value: 0.97 }, uGrade: { value: 0.6 }, uWB: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uFocus, uRange, uMaxR;
    uniform float uTime, uVig, uGrain, uCA, uFade, uSat, uGrade; uniform vec3 uWB; varying vec2 vUv;
    // depth of field, as a long lens gives it: everything out to a chosen distance is sharp and the
    // stands beyond it soften. A sample only counts if its own blur would reach this pixel, so a
    // sharp player in front never smears into the crowd behind him.
    float coc(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      float d = 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
      return clamp((d - uFocus) / uRange, 0.0, 1.0);
    }
    void main() {
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * r2 * uCA).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * r2 * uCA).b;
      #ifdef FOCUS
      float c0 = uMaxR > 0.05 ? coc(vUv) : 0.0;
      if (c0 > 0.03) {
        float R = c0 * uMaxR, w = 1.0, a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
        for (int i = 1; i <= 8; i++) {
          float fi = float(i), r = sqrt(fi / 8.0) * R, t = a + fi * 2.39996323;
          vec2 uv = vUv + vec2(cos(t), sin(t)) * r * uTexel;
          float k = smoothstep(0.0, 1.0, coc(uv) * uMaxR / (r + 0.35));
          col += texture2D(tDiffuse, uv).rgb * k; w += k;
        }
        col /= w;
      }
      #endif
      col *= uWB;                                    // the camera's white balance
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= 1.0 - uVig * smoothstep(0.12, 0.78, r2 * 1.7);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
      // this is the last pass, drawn to the screen: the renderer's tone curve and colour space go on here
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      // the grade, on the finished picture: deeper blacks and a firmer shoulder, shadows leaning
      // cool and highlights warm, as a broadcast camera is set up for a night session
      { vec3 g = gl_FragColor.rgb; float gl = dot(g, vec3(0.2126, 0.7152, 0.0722));
        g = mix(g, g * g * (3.0 - 2.0 * g), 0.34 * uGrade);
        g += mix(vec3(-0.012, 0.0, 0.02), vec3(0.016, 0.006, -0.014), smoothstep(0.15, 0.85, gl)) * uGrade;
        gl_FragColor.rgb = g; }
      float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor.rgb += (n - 0.5) * uGrain;
    }`,
};

// Four-sample anti-aliasing costs about 5 ms a frame at 1080p on integrated graphics, two-sample
// about 2: only the top setting pays for four.
export const QUALITY = [
  { name: 'Low',    msaa: 0, bloom: false, focus: false, scale: 0.75, shadows: true,  maxDpr: 1 },
  { name: 'Medium', msaa: 2, bloom: true,  focus: true,  scale: 0.9,  shadows: true,  maxDpr: 1 },
  { name: 'High',   msaa: 2, bloom: true,  focus: true,  scale: 1,    shadows: true,  maxDpr: 1.5 },
  { name: 'Ultra',  msaa: 4, bloom: true,  focus: true,  scale: 1,    shadows: true,  maxDpr: 2 },
];

export class Gfx {
  constructor(canvas, o = {}) {
    this.canvas = canvas;
    this.q = o.quality == null ? 2 : o.quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: !!o.preserve });
    r.outputColorSpace = THREE.SRGBColorSpace;
    // the tone curve: ?tm=agx|neutral|aces picks one for comparison
    const tmq = new URLSearchParams(location.search).get('tm');
    // AgX by default: it rolls highlights off and keeps colours true the way a camera does, where ACES pushed clay and grass toward neon
    r.toneMapping = tmq === 'aces' ? THREE.ACESFilmicToneMapping : tmq === 'neutral' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
    this.tmK = +(new URLSearchParams(location.search).get('tmk') || (r.toneMapping === THREE.AgXToneMapping ? 1.3 : 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.07, 9000);
    this.camera.position.set(0, 1.7, 13);
    this.scene.add(this.camera);
    this.arena = null;
    this.time = 0; this.scale = QUALITY[this.q].scale; this.auto = o.autoScale !== false;
    this.frameMs = 16; this.slow = 0; this.fast = 0;
    this.build();
    this.resize();
  }
  build() {
    const Q = QUALITY[this.q], r = this.renderer;
    if (this.composer) { this.composer.dispose(); }
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: Q.msaa, depthBuffer: true });
    if (Q.focus) rt.depthTexture = new THREE.DepthTexture(4, 4);
    const c = this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera); c.addPass(this.renderPass);
    this.focusSet = this.focusSet || { from: 45, range: 30, size: 0.005 };
    this.bloom = null;
    if (Q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.6, 6.0); c.addPass(this.bloom); }
    this.lens = new ShaderPass(LensShader); if (Q.focus) { this.lens.material.defines.FOCUS = 1; this.lens.material.needsUpdate = true; } c.addPass(this.lens);
    this.hasFocus = !!Q.focus; this.frameNo = 0;
  }
  setQuality(q) { this.q = q; this.scale = QUALITY[q].scale; this.build(); this.resize(); }
  resize() {
    const Q = QUALITY[this.q], w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, Q.maxDpr) * this.scale;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.w = w; this.h = h; this.pxH = h * dpr;
    this.lens.uniforms.uTexel.value.set(1 / Math.max(1, w * dpr), 1 / Math.max(1, h * dpr));
  }
  // where the picture starts to soften (metres from the camera), over what distance it reaches
  // full blur, and how large that blur is as a fraction of the picture's height
  setFocus(from, range, size) { const f = this.focusSet; f.from = from; f.range = range; f.size = size; }
  setArena(A) {
    if (this.arena) { this.scene.remove(this.arena.root); if (this.arena.sky) this.scene.remove(this.arena.sky); this.arena.dispose(); }
    this.arena = A;
    this.scene.add(A.root);
    this.scene.background = new THREE.Color(A.indoorNow ? '#030406' : '#000000');
    this.scene.environment = arenaEnvironment(A, this.renderer);
    if (A.sky) this.scene.add(A.sky);
    this.scene.environmentIntensity = A.envI;
    this.scene.fog = new THREE.FogExp2(A.fogCol, A.indoorNow ? 0.0016 : A.night ? 0.0011 : 0.0009);
    // under floodlights the camera is exposed for the bright court, so everything off it goes darker
    this.renderer.toneMappingExposure = A.exposure * (this.tmK || 1) * (A.night ? 0.86 : 1);
    // by day almost nothing is bright enough to bloom: the pass only runs under lights
    const lampsOn = A.weather && A.weather.lamps >= 0.99;
    if (this.bloom) { this.bloom.enabled = !!A.night || lampsOn; this.bloom.threshold = 2.6; this.bloom.strength = 0.36; }
    this.lens.uniforms.uWB.value.fromArray(A.wb || [1, 1, 1]);
    this.lens.uniforms.uGrade.value = lampsOn ? 1.1 : 0.95; this.lens.uniforms.uVig.value = lampsOn ? 0.36 : 0.26;
    A.shadowLights = []; A.root.traverse(o => { if (o.isLight && o.castShadow) { o.shadow.autoUpdate = false; o.shadow.needsUpdate = true; A.shadowLights.push(o); } });
    this.setFlip(1);
  }
  setFlip(f) {
    const A = this.arena; if (!A) return;
    A.setFlip(f);
    this.scene.environmentRotation.y = f < 0 ? Math.PI : 0;
  }
  render(dt) {
    this.time += dt;
    this.lens.uniforms.uTime.value = this.time;
    if (this.hasFocus) {
      const u = this.lens.uniforms, f = this.focusSet;
      u.tDepth.value = this.composer.readBuffer.depthTexture;          // the scene is about to be drawn into this buffer
      u.uNear.value = this.camera.near; u.uFar.value = this.camera.far; u.uFocus.value = f.from; u.uRange.value = Math.max(0.5, f.range); u.uMaxR.value = u.tDepth.value ? f.size * (this.pxH || 720) : 0;
    }
    const A = this.arena; this.frameNo++;
    // every frame: only the players and what is beside the court cast into the maps, so they are cheap, and shadows
    // redrawn on alternate frames stepped at half the frame rate and made frame times uneven
    if (A && A.shadowLights) A.shadowLights.forEach(l => { l.shadow.needsUpdate = true; });
    this.composer.render(dt);
    // keep the frame rate: trade resolution for time when the GPU falls behind
    // Only ever down, and only when frames come late for a good while: each change rebuilds the buffers, and
    // a picture that sharpens and softens by turns, with a hitch each time, is worse than one a little soft.
    if (this.auto && this.measure && dt > 0) {
      const want = this.expect || 16.7;
      this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
      if (this.frameMs > want * 1.3) this.slow++; else this.slow = Math.max(0, this.slow - 1);
      const base = QUALITY[this.q].scale;
      if (this.slow > 90 && this.scale > base * 0.8) { this.scale = Math.max(base * 0.8, this.scale - 0.1); this.slow = 0; this.frameMs = want; this.resize(); }
    }
  }
}
