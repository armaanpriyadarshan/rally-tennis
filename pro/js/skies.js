// Rally Pro — skies and weather. The panoramas are photographs (Poly Haven "pure sky" HDRIs,
// CC0). For each one the sun's position, its strength against the rest of the sky and the
// colour of both were measured from the HDR original, so the light in the stadium is the
// light of that sky rather than a guess.
import * as THREE from 'three';

export const SKY_FACTS = {
 "kloofendal_43d_clear_puresky": {
  "sun": true,
  "sunAz": 36.2,
  "sunEl": 42.9,
  "ratio": 3.43,
  "sunCol": [
   1.0,
   0.943,
   0.864
  ],
  "skyCol": [
   0.547,
   0.715,
   1.0
  ],
  "ldrIrr": 0.948,
  "ldrAvg": 0.3491
 },
 "kloofendal_48d_partly_cloudy_puresky": {
  "sun": true,
  "sunAz": 34.3,
  "sunEl": 47.9,
  "ratio": 2.31,
  "sunCol": [
   0.992,
   1.0,
   0.913
  ],
  "skyCol": [
   0.58,
   0.682,
   1.0
  ],
  "ldrIrr": 0.941,
  "ldrAvg": 0.3029
 },
 "kloofendal_38d_partly_cloudy_puresky": {
  "sun": true,
  "sunAz": 36.0,
  "sunEl": 38.0,
  "ratio": 1.25,
  "sunCol": [
   1.0,
   0.946,
   0.849
  ],
  "skyCol": [
   0.818,
   0.887,
   1.0
  ],
  "ldrIrr": 0.953,
  "ldrAvg": 0.3542
 },
 "kloofendal_overcast_puresky": {
  "sun": false,
  "sunAz": 29.4,
  "sunEl": 23.0,
  "ratio": 0.0,
  "sunCol": [
   0.0,
   0.0,
   0.0
  ],
  "skyCol": [
   0.809,
   0.866,
   1.0
  ],
  "ldrIrr": 1.219,
  "ldrAvg": 0.3726
 },
 "kloofendal_28d_misty_puresky": {
  "sun": true,
  "sunAz": -10.8,
  "sunEl": 28.5,
  "ratio": 0.18,
  "sunCol": [
   0.993,
   1.0,
   0.946
  ],
  "skyCol": [
   0.95,
   0.955,
   1.0
  ],
  "ldrIrr": 0.981,
  "ldrAvg": 0.3458
 },
 "syferfontein_18d_clear_puresky": {
  "sun": true,
  "sunAz": 35.9,
  "sunEl": 18.4,
  "ratio": 7.7,
  "sunCol": [
   1.0,
   0.868,
   0.535
  ],
  "skyCol": [
   0.464,
   0.662,
   1.0
  ],
  "ldrIrr": 0.879,
  "ldrAvg": 0.3625
 },
 "syferfontein_6d_clear_puresky": {
  "sun": true,
  "sunAz": 35.8,
  "sunEl": 5.9,
  "ratio": 0.84,
  "sunCol": [
   1.0,
   0.817,
   0.3
  ],
  "skyCol": [
   0.626,
   0.808,
   1.0
  ],
  "ldrIrr": 0.873,
  "ldrAvg": 0.3677
 },
 "belfast_sunset_puresky": {
  "sun": false,
  "sunAz": 37.8,
  "sunEl": 1.9,
  "ratio": 0.0,
  "sunCol": [
   0.0,
   0.0,
   0.0
  ],
  "skyCol": [
   0.973,
   0.838,
   1.0
  ],
  "ldrIrr": 0.991,
  "ldrAvg": 0.3277
 },
 "qwantani_dusk_2_puresky": {
  "sun": false,
  "sunAz": 32.5,
  "sunEl": 12.1,
  "ratio": 0.0,
  "sunCol": [
   0.0,
   0.0,
   0.0
  ],
  "skyCol": [
   0.91,
   0.73,
   1.0
  ],
  "ldrIrr": 1.087,
  "ldrAvg": 0.3662
 },
 "qwantani_night_puresky": {
  "sun": true,
  "sunAz": 101.4,
  "sunEl": 84.2,
  "ratio": 0.0,
  "sunCol": [
   1.0,
   0.652,
   0.381
  ],
  "skyCol": [
   0.938,
   1.0,
   0.991
  ],
  "ldrIrr": 0.539,
  "ldrAvg": 0.209
 },
 "kloppenheim_07_puresky": {
  "sun": false,
  "sunAz": 35.7,
  "sunEl": 38.1,
  "ratio": 0.0,
  "sunCol": [
   0.0,
   0.0,
   0.0
  ],
  "skyCol": [
   0.784,
   0.868,
   1.0
  ],
  "ldrIrr": 1.002,
  "ldrAvg": 0.3195
 }
};

// Weather a match can be played in. `sky` picks the photograph; the rest is how that
// weather changes play: air temperature offset (C), humidity offset, wind multiplier.
export const WEATHER = {
  clear:     { name: 'Clear',            sky: 'kloofendal_43d_clear_puresky', hour: 3.8,         temp: 2,  hum: -0.08, wind: 1.0, lamps: 0 },
  fair:      { name: 'Sun and cloud',    sky: 'kloofendal_48d_partly_cloudy_puresky', hour: 3.2, temp: 0,  hum: 0,     wind: 1.1, lamps: 0 },
  broken:    { name: 'Broken cloud',     sky: 'kloofendal_38d_partly_cloudy_puresky', hour: 2.4, temp: -1, hum: 0.05,  wind: 1.3, lamps: 0 },
  overcast:  { name: 'Overcast',         sky: 'kloofendal_overcast_puresky',          temp: -4, hum: 0.15,  wind: 1.2, lamps: 0.35 },
  hazy:      { name: 'Hot and hazy',     sky: 'kloofendal_28d_misty_puresky', hour: 1.4,         temp: 7,  hum: 0.12,  wind: 0.5, lamps: 0 },
  afternoon: { name: 'Late afternoon',   sky: 'syferfontein_18d_clear_puresky',       temp: 1,  hum: -0.05, wind: 0.9, lamps: 0 },
  sunset:    { name: 'Sunset',           sky: 'syferfontein_6d_clear_puresky',        temp: -2, hum: 0.05,  wind: 0.7, lamps: 0.7 },
  evening:   { name: 'Evening cloud',    sky: 'belfast_sunset_puresky',               temp: -3, hum: 0.08,  wind: 0.8, lamps: 1 },
  dusk:      { name: 'Dusk',             sky: 'qwantani_dusk_2_puresky',              temp: -4, hum: 0.1,   wind: 0.6, lamps: 1 },
  night:     { name: 'Night',            sky: 'qwantani_night_puresky',               temp: -6, hum: 0.12,  wind: 0.5, lamps: 1, night: true, gain: 0.05, tint: [0.55, 0.7, 1.0] },
  nightCloud:{ name: 'Night, low cloud', sky: 'kloppenheim_07_puresky',               temp: -5, hum: 0.2,   wind: 0.8, lamps: 1, night: true, gain: 0.055, tint: [1.0, 0.82, 0.66] },
  roof:      { name: 'Roof closed',      sky: null, temp: 0, hum: 0, wind: 0, lamps: 1, night: true, indoor: true },
};
// `hour`: how long after solar noon that weather's match is played; the photograph is tilted so

// What the weather is likely to be at a venue: hot dry places are clear, northern ones cloudy.
export function rollWeather(T, session, rnd) {
  const r = rnd || Math.random;
  if (T.indoor) return 'roof';
  if (session === 'night') { const u = r(); return u < 0.25 ? 'dusk' : u < 0.45 ? 'evening' : u < 0.8 ? 'night' : 'nightCloud'; }
  const cloud = Math.min(0.75, Math.max(0.1, (T.hum - 25) / 60));          // humid venues see more cloud
  const hot = T.temp >= 27;
  const u = r();
  // a wet day under a roof, where there is one
  if (T.roof === 'retractable' && r() < cloud * 0.14) return 'roof';
  if (u < cloud * 0.45) return 'overcast';
  if (u < cloud * 0.45 + cloud * 0.5) return r() < 0.5 ? 'broken' : 'fair';
  const v = r();
  if (hot && v < 0.3) return 'hazy';
  if (v < 0.5) return 'clear';
  if (v < 0.72) return 'fair';
  if (v < 0.92) return 'afternoon';
  return 'sunset';
}

const _cache = new Map();
export function loadSkyTexture(key) {
  if (_cache.has(key)) return _cache.get(key);
  const p = new Promise((res, rej) => new THREE.TextureLoader().load(new URL('../assets/sky/' + key + '.jpg', import.meta.url).href, t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; res(t); }, undefined, rej));
  _cache.set(key, p); return p;
}

// The dome. Directions are mapped exactly as the measurement script read the panoramas, so
// a measured sun azimuth plus `uRot` is where the sun is in the world.
export function makeSkyDome(tex, o = {}) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMap: { value: tex }, uRot: { value: o.rot || 0 }, uGain: { value: o.gain == null ? 1 : o.gain }, uTint: { value: new THREE.Color().fromArray(o.tint || [1, 1, 1]) }, uBoost: { value: o.boost == null ? 1.6 : o.boost }, uGround: { value: new THREE.Color(o.ground || '#5a5f66') } },
    vertexShader: 'varying vec3 vDir; varying vec3 vWorld; void main(){ vDir = position; vWorld = mat3(modelMatrix) * position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = projectionMatrix * vec4(p.xyz, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `
      uniform sampler2D uMap; uniform float uRot, uGain, uBoost; uniform vec3 uTint, uGround; varying vec3 vDir; varying vec3 vWorld;
      void main() {
        vec3 d = normalize(vDir);
        float c = cos(uRot), s = sin(uRot);
        vec3 r = vec3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
        float u = atan(r.x, -r.z) / 6.2831853 + 0.5;
        float v = acos(clamp(max(r.y, 0.004), -1.0, 1.0)) / 3.14159265;
        vec3 col = texture2D(uMap, vec2(u, 1.0 - v)).rgb;
        // a photograph clips at white; give the brightest cloud and the sun their energy back
        float l = max(col.r, max(col.g, col.b));
        col *= 1.0 + uBoost * smoothstep(0.82, 1.0, l);
        col = mix(col, uGround * dot(col, vec3(0.333)) * 1.4, smoothstep(0.0, -0.12, normalize(vWorld).y));
        gl_FragColor = vec4(col * uTint * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}

// Sun and sky strengths for the scene, from the measurements. All in the engine's own
// units: the sky delivers `Esky` to a level surface, the sun `ratio` times that.
export function skyLight(key, o = {}) {
  const f = SKY_FACTS[key]; if (!f) return null;
  const Esky = o.Esky == null ? 1.5 : o.Esky;
  const el = f.sunEl * Math.PI / 180;
  // very low suns measure enormous ratios against a dark sky; a camera would not expose for them
  const ratio = f.sun ? Math.min(f.ratio, 5.2) : 0;
  const sunI = f.sun ? ratio * Esky / Math.max(0.12, Math.sin(el)) : 0;
  const gain = Esky / (Math.PI * f.ldrAvg);              // scales the photograph so its mean radiance carries Esky
  const Etot = Esky * (1 + ratio);
  const Eref = Math.max(Etot, f.sun ? 0.55 * sunI + Esky : Etot);
  return { f, Esky, sunI, gain, ratio, el, az: f.sunAz * Math.PI / 180, exposure: 1.15 * Math.PI / (0.9 * Eref), sunCol: f.sun ? f.sunCol : [1, 1, 1], skyCol: f.skyCol };
}
