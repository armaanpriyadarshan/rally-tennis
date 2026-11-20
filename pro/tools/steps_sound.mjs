// Offline render of the synthesised court sounds (no match): a ball bounce, footfalls near and far, squeaks, a clay step and
// slide, a grass step and a struck ball, each half a second or so apart, through the game's own Audio code and master chain.
// Writes a 16-bit WAV to OUT and prints the cue times. env: OUT
export default async function ({ ev }) {
  const E = process.env;
  const r = await ev(`(async () => {
    const { Audio } = await import('./js/audio.js');
    const sr = 44100, secs = 9, oc = new OfflineAudioContext(2, sr * secs, sr); let T = 0;
    const ctx = new Proxy(oc, { get(t, k) { if (k === 'currentTime') return T; const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v; } });
    const au = new Audio(); au.ctx = ctx; au.master = oc.createGain(); au.master.gain.value = 0.8;
    const comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2; au.master.connect(comp); comp.connect(oc.destination);
    au.rev = oc.createConvolver(); au.rev.buffer = au.impulse(1.6, 2.4); const rg = oc.createGain(); rg.gain.value = 0.22; au.rev.connect(rg); rg.connect(au.master);
    au.noise = au.noiseBuf(2); au.listener = { x: 0, z: 11 };
    const cues = []; const at = (t, name, fn) => { T = t; cues.push([t, name]); fn(); };
    at(0.2, 'bounce near', () => au.bounce({ x: 0.5, z: 8, vy: 9, speed: 20 }, 'hard'));
    at(0.8, 'bounce far', () => au.bounce({ x: 0.5, z: -9, vy: 9, speed: 20 }, 'hard'));
    au.surface = 'hard';
    at(1.4, 'step near k1.4', () => au.footfall(0.3, 11, 1.4));
    at(2.0, 'step near k0.7', () => au.footfall(0.3, 11, 0.7));
    at(2.6, 'step far k1.4', () => au.footfall(0.3, -12, 1.4));
    at(3.2, 'squeak near k1', () => au.squeak(0.3, 11, 1));
    at(3.8, 'squeak far k1', () => au.squeak(0.3, -12, 1));
    at(4.4, 'old squeak near', () => { const o = au.out(0.3, 11, 1), f = 1900 + 0.5 * 900, k = 1; au.tone(o, T, 0.06 + 0.5 * 0.05, f, f * (0.86 + 0.5 * 0.3), 0.09 * k, 'sawtooth'); });
    au.surface = 'clay';
    at(5.0, 'clay step near', () => au.footfall(0.3, 11, 1.2));
    at(5.6, 'clay slide near', () => au.slide(0.3, 11, 1, 0.5));
    au.surface = 'grass';
    at(6.4, 'grass step near', () => au.footfall(0.3, 11, 1.2));
    au.surface = 'hard';
    at(7.0, 'hit near (synth part)', () => au.hit({ x: 0.3, z: 11, speed: 30, kind: 'drive', top: 0, power: 0.4, who: 0 }));
    const buf = await oc.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, i16 = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { i16[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; i16[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return JSON.stringify({ sr, cues, pcm: btoa(s) });
  })()`);
  const fs = await import('fs'), o = JSON.parse(r), pcm = Buffer.from(o.pcm, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(o.sr, 24); h.writeUInt32LE(o.sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(E.OUT || '/tmp/rally-work2/court.wav', Buffer.concat([h, pcm])); console.log(JSON.stringify(o.cues));
}
