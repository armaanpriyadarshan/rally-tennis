// Rally Pro — procedural textures. Everything the scene needs is painted here at load:
// no image downloads, so a venue is a few hundred bytes of colour and a seed.
import * as THREE from 'three';
import { COURT } from './physics.js';

export function rng32(seed) {
  let s = seed >>> 0 || 1;
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export const hex = c => new THREE.Color(c);
export function rgb(c) { const k = new THREE.Color(c); return [Math.round(k.r * 255), Math.round(k.g * 255), Math.round(k.b * 255)]; }
// colour maths in sRGB bytes, which is what a canvas wants
export function mix(a, b, t) { const A = srgb(a), B = srgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }
export function srgb(c) { const k = new THREE.Color(c); const h = k.getHex(THREE.SRGBColorSpace); return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
export function shade(c, f) { const A = srgb(c); return `rgb(${Math.round(Math.min(255, A[0] * f))},${Math.round(Math.min(255, A[1] * f))},${Math.round(Math.min(255, A[2] * f))})`; }

// A grey fractal-noise field in [0,1], built from white noise at a few scales and the
// canvas's own bilinear upscaling. Fast enough to make 2k textures at load time.
export function fbmField(w, h, seed, o = {}) {
  const oct = o.octaves || 5, base = o.base || 4, gain = o.gain || 0.5, sx = o.stretchX || 1, sy = o.stretchY || 1;
  const r = rng32(seed), out = canvas(w, h), g = out.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  let amp = 0.5, f = base;
  for (let i = 0; i < oct; i++) {
    const nw = Math.max(2, Math.round(f * sx)), nh = Math.max(2, Math.round(f * sy * h / w));
    const n = canvas(nw, nh), ng = n.getContext('2d'), id = ng.createImageData(nw, nh);
    for (let k = 0; k < nw * nh; k++) { const v = r() * 255; id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255; }
    ng.putImageData(id, 0, 0);
    g.globalAlpha = amp; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(n, 0, 0, w, h);
    amp *= gain; f *= 2;
  }
  g.globalAlpha = 1;
  return out;
}
export function fieldData(c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, f = new Float32Array(c.width * c.height); for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255; return f; }

// Height field → tangent-space normal map.
export function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, H = fieldData(hc), out = canvas(w, h), g = out.getContext('2d'), id = g.createImageData(w, h), d = id.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = H[y * w + (x + w - 1) % w], r = H[y * w + (x + 1) % w], u = H[((y + h - 1) % h) * w + x], dn = H[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const il = 1 / Math.hypot(nx, ny, nz);
    const i = (y * w + x) * 4; d[i] = (nx * il * 0.5 + 0.5) * 255; d[i + 1] = (ny * il * 0.5 + 0.5) * 255; d[i + 2] = (nz * il * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return out;
}

export function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso || 8;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Photo-scanned grain for each surface (Poly Haven, CC0): a neutral detail map, the scan's
// normals and its roughness. Loaded once per surface.
const _surf = new Map();
export function loadSurface(key) {
  if (_surf.has(key)) return _surf.get(key);
  const one = (file, data) => new Promise(res => new THREE.TextureLoader().load(new URL('../assets/surface/' + key + '_' + file + '.jpg', import.meta.url).href, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; void data; res(t); }, undefined, () => res(null)));
  const p = Promise.all([one('detail'), one('normal'), one('rough')]).then(([detail, normal, rough]) => (detail && normal && rough ? { detail, normal, rough } : null));
  _surf.set(key, p); return p;
}

// ---------- the playing surface ----------
// One painted "macro" map for the whole floor (2 cm texels), carrying everything a camera
// sees from more than a few metres: the two colours, wear, damp, mowing stripes. Close-up
// grain comes from a small tiling normal/roughness pair.
export function courtTextures(spec, floorW, floorL, seed, photo) {
  const S = spec.surface, PX = 48;                         // pixels per metre
  const W = Math.min(2048, Math.round(floorW * PX)), H = Math.min(4096, Math.round(floorL * PX));
  const ppmX = W / floorW, ppmZ = H / floorL;
  const c = canvas(W, H), g = c.getContext('2d');
  const X = x => (x + floorW / 2) * ppmX, Z = z => (z + floorL / 2) * ppmZ;
  const r = rng32(seed);
  // acrylic paint is a chalky, flat colour: the venue's swatch reads too pure once it is lit
  const flatten = (c, k) => { const C = new THREE.Color(c), l = 0.2126 * C.r + 0.7152 * C.g + 0.0722 * C.b; return '#' + C.lerp(new THREE.Color(l, l, l), k).getHexString(); };
  // crushed brick is a richer orange in the camera than its swatch survives the film curve as
  const brick = c => { const C = new THREE.Color(c), h = {}; C.getHSL(h); return '#' + C.setHSL(h.h + 0.014, Math.min(1, h.s * 1.18), h.l * 1.04).getHexString(); };
  const inner = S === 'hard' ? flatten(spec.inner, 0.22) : S === 'clay' ? brick(spec.inner) : spec.inner, outer = S === 'hard' ? flatten(spec.outer || spec.inner, 0.22) : S === 'clay' ? brick(spec.outer || spec.inner) : (spec.outer || spec.inner);
  g.fillStyle = shade(outer, 1); g.fillRect(0, 0, W, H);
  // inner colour fills the doubles court
  g.fillStyle = shade(inner, 1);
  g.fillRect(X(-COURT.halfWD), Z(-COURT.halfLen), (COURT.halfWD * 2) * ppmX, (COURT.halfLen * 2) * ppmZ);

  const big = fbmField(W, H, seed + 1, { base: 3, octaves: 5 }), mid = fbmField(W, H, seed + 2, { base: 24, octaves: 4 });
  const blend = (src, mode, a) => { g.globalCompositeOperation = mode; g.globalAlpha = a; g.drawImage(src, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };

  if (S === 'hard') {
    // An acrylic court is close to one flat colour. What a camera sees is a faint
    // unevenness in the top coat and a paler, scuffed patch where the players stand.
    blend(big, 'soft-light', 0.10); blend(mid, 'soft-light', 0.045);
    for (const sg of [-1, 1]) {
      const cz = Z(sg * (COURT.halfLen + 0.5));
      g.save(); g.translate(X(0), cz); g.scale(1, 0.42);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 5.2 * ppmX);
      gr.addColorStop(0, 'rgba(255,255,255,0.075)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-6 * ppmX, -6 * ppmX, 12 * ppmX, 12 * ppmX); g.restore();
    }
    // the top coat is squeegeed on along the court: faint lengthwise bands a metre or two wide
    const lay = fbmField(W, H, seed + 4, { base: 14, octaves: 3, stretchX: 1, stretchY: 0.03 });
    blend(lay, 'soft-light', 0.07);
    // shoes leave short dark smears where the feet work hardest: behind each baseline, and
    // more thinly where players split and change direction inside it
    g.lineCap = 'round';
    for (const sg of [-1, 1]) for (let i = 0; i < 150; i++) {
      const deep = i < 105, x = (r() + r() + r() - 1.5) * (deep ? 3.4 : 2.6), z = sg * (deep ? COURT.halfLen + 0.15 + Math.abs(r() + r() - 1) * 1.7 : COURT.halfLen - 0.4 - r() * 4.2);
      const l = (0.10 + r() * 0.32) * ppmX, a = (r() - 0.5) * 2.4 + (r() < 0.5 ? 0 : Math.PI), bend = (r() - 0.5) * 0.5;
      g.strokeStyle = `rgba(14,16,22,${(deep ? 0.035 : 0.02) + r() * 0.045})`; g.lineWidth = (0.015 + r() * 0.028) * ppmX;
      g.beginPath(); g.moveTo(X(x), Z(z)); g.quadraticCurveTo(X(x) + Math.cos(a + bend) * l * 0.5, Z(z) + Math.sin(a + bend) * l * 0.5, X(x) + Math.cos(a) * l, Z(z) + Math.sin(a) * l); g.stroke();
    }
    // and the ball leaves a scatter of pale fuzz marks through the middle of each half
    for (let i = 0; i < 260; i++) {
      const x = (r() - 0.5) * COURT.halfWD * 2.1, z = (r() - 0.5) * COURT.halfLen * 2.05, rad = (0.025 + r() * 0.03) * ppmX;
      g.fillStyle = `rgba(232,240,214,${0.03 + r() * 0.05})`; g.beginPath(); g.ellipse(X(x), Z(z), rad * 0.8, rad * (1.3 + r()), 0, 0, 7); g.fill();
    }
  } else if (S === 'clay') {
    // sweeping leaves lengthwise drag; watering leaves darker damp; play scatters pale dust
    const drag = fbmField(W, H, seed + 3, { base: 60, octaves: 3, stretchX: 1, stretchY: 0.04 });
    blend(big, 'soft-light', 0.30); blend(mid, 'soft-light', 0.14); blend(drag, 'soft-light', 0.16);
    for (let i = 0; i < 90; i++) {
      const x = (r() - 0.5) * floorW, z = (r() - 0.5) * floorL, rad = (0.8 + r() * 2.6) * ppmX;
      const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rad);
      const dark = r() < 0.55;
      gr.addColorStop(0, dark ? 'rgba(70,24,8,0.085)' : 'rgba(255,214,170,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(X(x) - rad, Z(z) - rad, rad * 2, rad * 2);
    }
    // the baselines are chewed pale by sliding feet
    for (const sg of [-1, 1]) {
      const gr = g.createRadialGradient(X(0), Z(sg * (COURT.halfLen + 0.9)), 10, X(0), Z(sg * (COURT.halfLen + 0.9)), 6.5 * ppmX);
      gr.addColorStop(0, 'rgba(255,220,180,0.20)'); gr.addColorStop(1, 'rgba(255,220,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const x = (r() + r() - 1) * 5.5, z = sg * (COURT.halfLen + (r() - 0.25) * 2.6), l = (0.5 + r() * 1.3) * ppmX, a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI);
        const gr2 = g.createLinearGradient(X(x), Z(z), X(x) + Math.cos(a) * l, Z(z) + Math.sin(a) * l * 0.4);
        gr2.addColorStop(0, 'rgba(255,225,190,0.22)'); gr2.addColorStop(1, 'rgba(255,225,190,0)');
        g.strokeStyle = gr2; g.lineWidth = (0.08 + r() * 0.1) * ppmX; g.lineCap = 'round';
        g.beginPath(); g.moveTo(X(x), Z(z)); g.lineTo(X(x) + Math.cos(a) * l, Z(z) + Math.sin(a) * l * 0.4); g.stroke();
      }
    }
  } else {
    // grass: mown in stripes along the court, and worn to bare earth where feet go
    const stripe = spec.stripe || 0.9;
    for (let x = -floorW / 2, i = 0; x < floorW / 2; x += stripe, i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,220,0.085)' : 'rgba(0,20,0,0.085)';
      g.fillRect(X(x), 0, stripe * ppmX + 1, H);
    }
    const blades = fbmField(W, H, seed + 3, { base: 200, octaves: 2, stretchX: 1, stretchY: 0.25 });
    blend(big, 'soft-light', 0.26); blend(mid, 'soft-light', 0.16); blend(blades, 'soft-light', 0.2);
    const wear = spec.wear == null ? 0.7 : spec.wear, earth = spec.earth || '#a08a5c';
    const patch = (x, z, rx, rz, a) => {
      g.save(); g.translate(X(x), Z(z)); g.scale(rx * ppmX, rz * ppmZ);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); const e = srgb(earth);
      gr.addColorStop(0, `rgba(${e[0]},${e[1]},${e[2]},${a})`); gr.addColorStop(0.55, `rgba(${e[0]},${e[1]},${e[2]},${a * 0.55})`); gr.addColorStop(1, `rgba(${e[0]},${e[1]},${e[2]},0)`);
      g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
    };
    for (const sg of [-1, 1]) {
      patch(0, sg * (COURT.halfLen + 0.35), 4.6, 1.5, 0.85 * wear);        // the baseline
      patch(0, sg * (COURT.halfLen - 0.8), 3.2, 1.3, 0.45 * wear);
      patch(0, sg * COURT.svc, 1.5, 1.1, 0.4 * wear);                      // the service T, from serve-volleyers
      patch(0, sg * 2.2, 2.4, 1.6, 0.22 * wear);
      for (let i = 0; i < 40; i++) patch((r() + r() - 1) * 4.5, sg * (COURT.halfLen + (r() - 0.4) * 1.8), 0.25 + r() * 0.5, 0.2 + r() * 0.4, 0.35 * wear);
    }
    blend(fbmField(W, H, seed + 4, { base: 90, octaves: 3 }), 'soft-light', 0.22);
  }
  const macro = tex(c, { clamp: true, aniso: 16 });

  // close-up grain
  const DN = 512;
  let hgt;
  if (S === 'hard') hgt = fbmField(DN, DN, seed + 7, { base: 96, octaves: 3, gain: 0.7 });
  else if (S === 'clay') hgt = fbmField(DN, DN, seed + 7, { base: 64, octaves: 4, gain: 0.75 });
  else hgt = fbmField(DN, DN, seed + 7, { base: 128, octaves: 2, gain: 0.8, stretchX: 1, stretchY: 0.2 });
  const detailN = tex(normalFromHeight(hgt, S === 'hard' ? 2.2 : S === 'clay' ? 3.4 : 4.5), { data: true, aniso: 8 });
  const dc = fbmField(DN, DN, seed + 8, { base: 48, octaves: 4, gain: 0.65 });
  const detail = tex(dc, { data: true, aniso: 8 });
  if (photo) {
    // real grain: the scans cover about 2 m (track surface), 3 m (infield clay) and 2.5 m (turf)
    const tileP = S === 'hard' ? 2.0 : S === 'clay' ? 3.0 : 2.5;
    return { macro, detailN: photo.normal, detail: photo.detail, roughMap: photo.rough, tile: tileP, rough: S === 'hard' ? 0.52 : 1, photo: true, gain: S === 'clay' ? 2.6 : S === 'hard' ? 1.3 : 1.25, nScale: S === 'hard' ? 0.4 : S === 'clay' ? 0.9 : 1.2, floorW, floorL };   // an acrylic court has a sheen that clay and grass do not
  }
  const tile = S === 'hard' ? 1.6 : S === 'clay' ? 2.2 : 1.3;      // metres per repeat
  return { macro, detailN, detail, tile, rough: S === 'hard' ? 0.78 : S === 'clay' ? 0.96 : 0.9, floorW, floorL };
}

// The painted lines: slightly uneven paint on a hard court, dusty tape on clay, chalk on grass.
export function lineTexture(surface, seed) {
  const w = 512, h = 64, c = canvas(w, h), g = c.getContext('2d'), r = rng32(seed);
  g.fillStyle = surface === 'grass' ? '#f2f2ea' : '#f6f6f2'; g.fillRect(0, 0, w, h);
  const n = fbmField(w, h, seed, { base: 40, octaves: 3 });
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = surface === 'hard' ? 0.12 : 0.3; g.drawImage(n, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (surface === 'clay') {
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(190,96,52,${0.05 + r() * 0.22})`; const x = r() * w, y = r() < 0.6 ? (r() < 0.5 ? r() * 12 : h - r() * 12) : r() * h; g.beginPath(); g.arc(x, y, 1 + r() * 4, 0, 6.3); g.fill(); }
    for (let x = 30; x < w; x += 128) { g.fillStyle = 'rgba(90,90,90,0.5)'; g.beginPath(); g.arc(x, h / 2, 2.5, 0, 6.3); g.fill(); }   // nail heads
  }
  if (surface === 'grass') {
    // chalk bleeds into the turf at the edges
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let x = 0; x < w; x++) for (const edge of [0, 1]) { const depth = 3 + Math.floor(r() * 9); for (let k = 0; k < depth; k++) { const y = edge ? h - 1 - k : k; d[(y * w + x) * 4 + 3] = Math.floor(255 * (k / depth) * r()); } }
    g.putImageData(id, 0, 0);
  }
  return tex(c, { aniso: 16 });
}

// Net mesh: a tiling square of cord.
export function netTexture() {
  const n = 128, c = canvas(n, n), g = c.getContext('2d');
  g.clearRect(0, 0, n, n);
  // knotted black cord, about 3 mm on a 45 mm mesh, with a light edge so it reads as twine
  for (const [col, w, o] of [['rgba(10,10,12,1)', 11, 6], ['rgba(58,58,62,0.9)', 3, 3.5]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(0, o); g.lineTo(n, o); g.moveTo(o, 0); g.lineTo(o, n); g.stroke(); }
  g.fillStyle = 'rgba(10,10,12,1)'; g.beginPath(); g.arc(6, 6, 9, 0, 6.3); g.fill();
  return tex(c, { aniso: 16 });
}

// Tennis ball felt with its seam, as an equirectangular map.
export function ballTexture() {
  const w = 512, h = 256, c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#d7e83a'; g.fillRect(0, 0, w, h);
  const n = fbmField(w, h, 91, { base: 90, octaves: 3, gain: 0.8 });
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.55; g.drawImage(n, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // the seam is one closed curve that wanders between the two hemispheres
  g.strokeStyle = 'rgba(248,250,240,0.95)'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath();
  for (let i = 0; i <= 256; i++) { const u = i / 256, x = u * w, y = h / 2 + Math.sin(u * Math.PI * 4) * h * 0.27; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  return tex(c, { aniso: 4 });
}
export function ballNormal() { return tex(normalFromHeight(fbmField(256, 128, 92, { base: 80, octaves: 3, gain: 0.85 }), 3.5), { data: true }); }

// Soft round blob: contact shadows, ball marks, dust.
export function blobTexture(size, inner, outer) {
  const c = canvas(size, size), g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner || 'rgba(0,0,0,1)'); gr.addColorStop(0.5, inner ? inner.replace(/[\d.]+\)$/, '0.5)') : 'rgba(0,0,0,0.5)'); gr.addColorStop(1, outer || 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return tex(c, { clamp: true });
}


// One seat wide: the back of a moulded stadium seat (and, lower, the front edge of its pan),
// with clear air between it and the next one so a row reads as seats rather than a wall.
export function seatBackTexture(seatCol, seed) {
  const w = 64, h = 128, c = canvas(w, h), g = c.getContext('2d'); void seed;
  g.clearRect(0, 0, w, h);
  // legs / the gap under the pan stay clear; back from 0.42 to 0.84 m of a 0.84 m strip
  g.fillStyle = shade(seatCol, 1.0); g.beginPath(); g.roundRect(4, 2, w - 8, 66, [9, 9, 3, 3]); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(8, 4, w - 16, 5);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(8, 44, w - 16, 22);
  g.fillStyle = shade(seatCol, 0.62); g.beginPath(); g.roundRect(5, 70, w - 10, 12, 3); g.fill();     // pan edge
  g.fillStyle = 'rgba(20,22,26,0.9)'; g.fillRect(w / 2 - 3, 82, 6, h - 82);                           // the stanchion
  const t = tex(c, { aniso: 8 }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function seatPanTexture(seatCol, seed) {
  const w = 64, h = 64, c = canvas(w, h), g = c.getContext('2d'); void seed;
  g.clearRect(0, 0, w, h);
  g.fillStyle = shade(seatCol, 0.9); g.beginPath(); g.roundRect(4, 3, w - 8, h - 6, [4, 4, 10, 10]); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(w / 2, h * 0.45, w * 0.3, h * 0.3, 0, 0, 7); g.fill();
  const t = tex(c, { aniso: 8 }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// Text on a board: sponsor-style hoardings, venue names, scoreboards.
export function textTexture(text, o = {}) {
  const w = o.w || 1024, h = o.h || 128, c = canvas(w, h), g = c.getContext('2d');
  if (o.bg === 'none') g.clearRect(0, 0, w, h); else { g.fillStyle = o.bg || '#0c2a4a'; g.fillRect(0, 0, w, h); }
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); }
  g.fillStyle = o.fg || '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = o.size || h * 0.56;
  g.font = `${o.weight || 700} ${size}px ${o.font || '"Helvetica Neue", Helvetica, Arial, sans-serif'}`;
  if (o.spacing) try { g.letterSpacing = o.spacing + 'px'; } catch (e) { /* older engines */ }
  const m = g.measureText(text).width; if (m > w * 0.92) { size *= w * 0.92 / m; g.font = `${o.weight || 700} ${size}px ${o.font || '"Helvetica Neue", Helvetica, Arial, sans-serif'}`; }
  g.fillText(text, w / 2, h / 2 + (o.dy || 0));
  const t = tex(c, { clamp: true, aniso: 16 });
  return t;
}

