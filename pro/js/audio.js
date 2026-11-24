// Rally Pro — sound. Strings, felt and court are synthesised per hit from what actually
// happened (pace, spin, surface, where on the court); the crowd breathes with the point;
// the chair umpire calls the score.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const NUM = ['Love', 'Fifteen', 'Thirty', 'Forty'];

export class Audio {
  constructor() {
    this.ctx = null; this.on = true; this.vol = 0.8; this.voiceOn = true;
    this.buf = {}; this.amb = null; this.hush = 1; this.cheer = 0;
    this.ft = []; this.queue = []; this.lead = {};
  }
  // Browsers only start audio from a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    // a short bright room for the hits, so they sit in a stadium rather than a studio
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(1.6, 2.4); const rg = c.createGain(); rg.gain.value = 0.22; this.rev.connect(rg); rg.connect(this.master);
    this.noise = this.noiseBuf(2);
    for (const [k, f] of [['hit', 'hit.mp3'], ['grunt', 'grunt.mp3'], ['crowd', 'crowd.ogg']]) fetch(new URL('../../audio/' + f, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(a => c.decodeAudioData(a)).then(b => { this.buf[k] = b; this.lead[k] = k === 'crowd' ? 0 : this.onset(b); if (k === 'crowd' && this.wantAmb) this.startAmbience(); }).catch(() => {});
  }
  // Recordings begin with silence (the hit's is over a quarter of a second): find where the
  // sound itself starts, so it can be played from there and land on the moment it belongs to.
  onset(b) {
    const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; }
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk * 0.04) return Math.max(0, i / b.sampleRate - 0.004);
    return 0;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.on ? v : 0; }
  toggle() { this.on = !this.on; this.setVolume(this.vol); return this.on; }
  noiseBuf(sec) { const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = l * 0.6 + w * 0.4; d[i] = w * 0.6 + l * 0.4; } return b; }
  impulse(sec, decay) { const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1); } return b; }
  // where a sound sits: pan by its place across the court, quieter with distance from the listener
  out(x, z, gain) {
    const c = this.ctx, L = this.listener || { x: 0, z: 12 }, d = Math.hypot(x - L.x, z - L.z);
    const g = c.createGain(); g.gain.value = gain * clamp(1.15 / (1 + d * 0.085), 0.12, 1);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = clamp((x - L.x) / 9, -0.85, 0.85) * (this.flipPan ? -1 : 1); g.connect(p); p.connect(this.master); p.connect(this.rev); } else { g.connect(this.master); g.connect(this.rev); }
    return g;
  }
  burst(dest, t, dur, freq, q, gain, type = 'bandpass', sweep = 0) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  tone(dest, t, dur, f0, f1, gain, type = 'sine') {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  sample(name, dest, gain, rate) { const b = this.buf[name]; if (!b) return false; const c = this.ctx, s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1; const g = c.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(0, this.lead[name] || 0); return true; }

  // ---------- the ball ----------
  hit(e) {
    if (!this.ctx) return; const t = this.ctx.currentTime, v = clamp(e.speed / 55, 0.15, 1.1), o = this.out(e.x, e.z, 1);
    const serve = e.kind === 'serve', slice = e.kind === 'slice' || e.kind === 'drop' || e.kind === 'volley' || e.kind === 'block';
    if (e.shank) { this.burst(o, t, 0.05, 2600, 3, 0.4 * v, 'bandpass'); this.tone(o, t, 0.08, 900, 500, 0.12); return; }
    // strings: a tight "pock" whose pitch and length follow how hard and how flat it was struck
    const body = serve ? 620 : slice ? 880 : 720 - (e.top || 0) * 0.02;
    this.tone(o, t, serve ? 0.075 : 0.055, body * 1.9, body * 0.72, (slice ? 0.7 : 0.42) * v, 'triangle');
    this.burst(o, t, slice ? 0.07 : 0.045, slice ? 3600 : 2100, 0.9, (slice ? 0.75 : 0.5) * v, 'bandpass', slice ? 0.6 : 0.8);
    this.burst(o, t, 0.02, 6500, 0.7, 0.22 * v, 'highpass');
    if (serve || v > 0.72) this.tone(o, t, 0.11, 190, 90, 0.2 * v);                   // the thump of a big one
    this.sample('hit', o, 0.28 * v, 0.9 + v * 0.3 + (slice ? 0.25 : 0));
    // effort: the harder and more stretched, the more voice
    const eff = (e.power || 0.5) * 0.6 + (e.diff || 0) * 0.2 + (serve ? 0.3 : 0);
    if (eff > 0.62 && Math.random() < 0.8) this.sample('grunt', this.out(e.x, e.z, 1), clamp(eff * 0.5, 0.15, 0.6), e.who === 0 ? 1.0 : 0.9 + Math.random() * 0.12);
  }
  bounce(e, surface) {
    if (!this.ctx || (e.dead && e.speed < 3)) return; const t = this.ctx.currentTime, v = clamp(e.vy / 9, 0.1, 1) * (e.dead ? 0.5 : 1), o = this.out(e.x, e.z, 1);
    if (surface === 'clay') { this.burst(o, t, 0.07, 900, 0.8, 0.85 * v, 'lowpass', 0.5); this.tone(o, t, 0.05, 210, 120, 0.5 * v); }
    else if (surface === 'grass') { this.tone(o, t, 0.06, 170, 90, 0.75 * v); this.burst(o, t, 0.04, 700, 0.8, 0.4 * v, 'lowpass'); }
    else { this.tone(o, t, 0.045, 420, 210, 0.8 * v, 'triangle'); this.burst(o, t, 0.03, 1800, 1.2, 0.7 * v); }
    if (e.line && surface !== 'hard') this.burst(o, t, 0.03, 4200, 2, 0.2 * v);         // the tape or chalk
  }
  net(e, cord) {
    if (!this.ctx) return; const t = this.ctx.currentTime, v = clamp(e.speed / 40, 0.2, 1), o = this.out(e.x, 0, 1);
    if (cord) { this.tone(o, t, 0.05, 1500, 900, 0.25 * v, 'triangle'); this.burst(o, t, 0.05, 3000, 2, 0.2 * v); }
    else { this.burst(o, t, 0.16, 500, 0.6, 1.5 * v, 'lowpass', 0.4); this.tone(o, t, 0.09, 130, 70, 0.8 * v); }
  }
  // the feet are close-miked on a broadcast court, but a far player's are heard across the court: duller as well as quieter
  outD(x, z, gain) {
    const c = this.ctx, L = this.listener || { x: 0, z: 12 }, d = Math.hypot(x - L.x, z - L.z), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 12000 / (1 + d * 0.12); f.Q.value = 0.5; f.connect(this.out(x, z, gain)); return f;
  }
  // a footfall: the sole slapping down and the weight going onto it, a little grit on clay, a soft thud on grass
  footfall(x, z, k) {
    const t = this.ctx.currentTime, o = this.outD(x, z, 1), s = this.surface, r = 0.85 + Math.random() * 0.3;
    if (s === 'clay') { this.burst(o, t, 0.05 + 0.03 * k, 2400 * r, 0.7, 0.07 * k, 'bandpass', 0.6); this.burst(o, t, 0.04, 520 * r, 0.7, 0.13 * k, 'lowpass'); this.tone(o, t, 0.05, 95 * r, 55, 0.1 * k); }
    else if (s === 'grass') { this.burst(o, t, 0.045, 380 * r, 0.7, 0.14 * k, 'lowpass'); this.tone(o, t, 0.06, 85 * r, 50, 0.1 * k); }
    else { this.burst(o, t, 0.03 + 0.02 * k, (650 + 250 * k) * r, 0.7, 0.15 * k, 'lowpass'); this.tone(o, t, 0.045, 115 * r, 60, 0.1 * k); this.burst(o, t, 0.022, 3300 * r, 1.4, 0.03 * k); }
  }
  // the squeal of a sole gripping a hard court as he plants on it out of a run: a pitched stick-slip, rising as the rubber
  // drags, rough with the sole juddering, a tenth of a second or so
  squeak(x, z, k) {
    const c = this.ctx, t = c.currentTime, o = this.outD(x, z, 1), dur = (0.07 + 0.08 * Math.min(1, k)) * (0.75 + Math.random() * 0.5), f0 = 1000 + Math.random() * 550;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 0.93, t); osc.frequency.linearRampToValueAtTime(f0 * (1.08 + Math.random() * 0.12), t + dur * 0.7); osc.frequency.linearRampToValueAtTime(f0, t + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 34 + Math.random() * 26; lg.gain.value = f0 * 0.03; lfo.connect(lg); lg.connect(osc.frequency);
    const lf2 = c.createOscillator(), l2 = c.createGain(); lf2.type = 'triangle'; lf2.frequency.value = 11 + Math.random() * 9; l2.gain.value = f0 * 0.025; lf2.connect(l2); l2.connect(osc.frequency);   /* (two wobbles at unrelated rates: one alone was a regular warble) */
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500 + Math.random() * 900; bp.Q.value = 2.2;
    const g = c.createGain(), a = 0.08 * k; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.012); g.gain.setValueAtTime(a, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(bp); bp.connect(g); g.connect(o); osc.start(t); lfo.start(t); lf2.start(t); osc.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02); lf2.stop(t + dur + 0.02);
  }
  // a slide on clay: the sole hissing through the top dressing for as long as the slide lasts
  slide(x, z, k, dur) { const t = this.ctx.currentTime, o = this.outD(x, z, 1); this.burst(o, t, dur, 1500, 0.5, 0.11 * k, 'bandpass', 0.55); this.burst(o, t, dur * 0.8, 420, 0.7, 0.08 * k, 'lowpass'); }
  swish(x, z) { if (!this.ctx) return; this.burst(this.out(x, z, 1), this.ctx.currentTime, 0.16, 1200, 0.7, 0.1, 'bandpass', 2.2); }

  // ---------- the crowd ----------
  // The crowd recording is a single swell that dies away, so looping it pumps. The bed is
  // built instead from overlapping two-second pieces of its steady opening, each faded in and
  // out and started at a different place, three or so sounding at once.
  startAmbience() {
    this.wantAmb = true; if (!this.ctx || this.amb || !this.buf.crowd) return;
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; const g = c.createGain(); g.gain.value = 0;
    f.connect(g); g.connect(this.master); this.amb = { g, f, next: c.currentTime + 0.05, live: [] };
    this.feedAmbience();
  }
  feedAmbience() {
    const A = this.amb, c = this.ctx, b = this.buf.crowd; if (!A || !b) return;
    const len = 2.4, every = 0.75, fade = 0.9, span = Math.max(0.2, Math.min(2.6, b.duration - len - 0.7));
    while (A.next < c.currentTime + 1.5) {
      const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.93 + Math.random() * 0.14;
      const e = c.createGain(), t = A.next; e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.62, t + fade); e.gain.setValueAtTime(0.62, t + len - fade); e.gain.linearRampToValueAtTime(0, t + len);
      s.connect(e); e.connect(A.f); s.start(t, 0.55 + Math.random() * span, len + 0.1); s.stop(t + len + 0.05);
      A.live.push(s); if (A.live.length > 8) A.live.shift();
      A.next += every * (0.85 + Math.random() * 0.3);
    }
  }
  stopAmbience() { this.wantAmb = false; if (this.amb) { for (const s of this.amb.live) { try { s.stop(); } catch (e) { /* already stopped */ } } try { this.amb.g.disconnect(); } catch (e) { /* gone */ } this.amb = null; } }
  // The crowd's reaction to a point: the recorded crowd swells and dies away again. (It used to be filtered hiss with
  // synthesised tones for voices on top, which sounded like nothing a crowd makes and was taken out on 2026-11-13.)
  applause(level, dur) { this.swell = { t: this.ctx ? this.ctx.currentTime : 0, level: clamp(level, 0, 1), dur: Math.max(1, dur) }; }
  gasp(level) { this.applause(0.35 * level, 1.4); }

  // ---------- the chair ----------
  say(text, o = {}) {
    if (!this.voiceOn || !this.on || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text); u.rate = o.rate || 0.98; u.pitch = o.pitch || 0.85; u.volume = clamp(this.vol * (o.vol || 0.9), 0, 1);
    const vs = speechSynthesis.getVoices(); const v = vs.find(x => /en[-_]GB/i.test(x.lang) && /male|daniel|george|arthur/i.test(x.name)) || vs.find(x => /en[-_]GB/i.test(x.lang)) || vs.find(x => /^en/i.test(x.lang));
    if (v) u.voice = v;
    if (o.now) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  callScore(m) {
    const s = m.score, n = i => m.players[i].prof.name;
    if (s.over) return;
    if (s.p[0] === 0 && s.p[1] === 0) return;
    const a = s.p[s.server], b = s.p[1 - s.server];
    let txt;
    if (s.tb) txt = a === b ? `${a} all` : a > b ? `${a}, ${b}, ${n(s.server)}` : `${b}, ${a}, ${n(1 - s.server)}`;
    else if (a >= 3 && b >= 3) txt = a === b ? 'Deuce' : 'Advantage ' + n(a > b ? s.server : 1 - s.server);
    else txt = a === b ? NUM[a] + ' all' : NUM[a] + ', ' + NUM[b];
    this.say(txt);
  }

  // ---------- wiring ----------
  startMatch(g) { this.surface = g.arena.spec.surface; this.startAmbience(); this.night = g.arena.night; }
  stopMatch() { this.stopAmbience(); if (window.speechSynthesis) speechSynthesis.cancel(); }
  event(type, e, g) {
    if (!this.ctx || !this.on) return;
    const m = g && g.match;
    switch (type) {
      case 'hit': this.hit(e); break;
      case 'bounce': this.bounce(e, this.surface); if (e.first && !e.good && !e.serve) this.say('Out', { now: true, rate: 1.15, pitch: 1.0 }); break;
      case 'net': this.net(e, false); break;
      case 'netcord': this.net(e, true); this.gasp(0.5); break;
      case 'whiff': this.swish(m.players[e.who].x, m.players[e.who].z); break;
      case 'fault': this.say(e.serveNum === 2 ? 'Double fault' : 'Fault', { now: true, rate: 1.1 }); if (e.serveNum === 2) this.applause(0.2, 1.6); break;
      case 'let': this.say('Let. First service', { now: true }); break;
      case 'point': {
        const big = e.val >= 1, lvl = clamp(0.2 + e.rally * 0.05 + (e.why === 'winner' || e.why === 'ace' ? 0.2 : 0) + (big ? 0.2 : 0) + (e.val >= 2 ? 0.25 : 0), 0.12, 1);
        if (e.cls === 'unforced' && e.rally > 5) this.gasp(0.6);
        this.applause(lvl, 2.2 + lvl * 3);
        // the call follows the applause, as it does
        clearTimeout(this.callT);
        this.callT = setTimeout(() => { if (!m.score.over && m.score.p[0] + m.score.p[1] > 0) this.callScore(m); }, 1500 + lvl * 900);
        break;
      }
      case 'game': clearTimeout(this.callT); this.callT = setTimeout(() => { if (!m.score.over) this.say(`Game, ${m.players[e.winner].prof.name}`); }, 1500); break;
      case 'set': clearTimeout(this.callT); this.callT = setTimeout(() => { if (!m.score.over) this.say(`Game and set, ${m.players[e.winner].prof.name}`); }, 1600); break;
      case 'tiebreak': setTimeout(() => this.say('Tiebreak'), 3200); break;
      case 'match': clearTimeout(this.callT); this.callT = setTimeout(() => this.say(`Game, set and match, ${m.players[e.winner].prof.name}`), 1600); this.applause(1, 9); break;
      case 'toss': break;
    }
  }
  // Footsteps follow the feet as they are animated: a step sounds the frame a lifted foot comes back down on the court, as
  // hard as it came down and as fast as he was going; a hard court squeals when a foot is planted to stop or turn out of a
  // run; on clay a slide hisses for as long as it lasts. (Before, a squeak was fired whenever a player slowed faster than
  // 9 m/s/s, which every stop does, braking at 9.7 to 10: a chirp every seventh of a second through each stop, even from a
  // walk, the far player's as loud as the near one's, and none of it in step with a foot.)
  feet(g, dt) {
    const F0 = g.fig && g.fig[0]; if (!F0 || dt <= 0) return;
    const V = F0.group.position.constructor, w = this._fw || (this._fw = { a: new V(), t: new V(), p: new V() }), clk = this.ftT = (this.ftT || 0) + dt;
    for (let i = 0; i < 2; i++) {
      const f = g.fig[i], P = f && f.person; if (!P || f.group.visible === false || !f.inited) { this.ft[i] = null; continue; }
      P.jointPos('Pelvis', w.p);
      let S = this.ft[i]; const jump = S && Math.hypot(w.p.x - S.px, w.p.z - S.pz) > Math.max(0.5, 12 * dt);
      if (!S || jump) S = this.ft[i] = { px: w.p.x, pz: w.p.z, vx: 0, vz: 0, ax: 0, az: 0, pk: [], sq: -9, sl: false, f: [{ up: false, n: 0 }, { up: false, n: 0 }] };
      // the body: its speed, the fastest it went in the last third of a second, and how hard it is braking or cutting
      const kv = 1 - Math.exp(-dt / 0.06), nvx = S.vx + ((w.p.x - S.px) / dt - S.vx) * kv, nvz = S.vz + ((w.p.z - S.pz) / dt - S.vz) * kv, ka = 1 - Math.exp(-dt / 0.08);
      S.ax += ((nvx - S.vx) / dt - S.ax) * ka; S.az += ((nvz - S.vz) / dt - S.az) * ka; S.vx = nvx; S.vz = nvz; S.px = w.p.x; S.pz = w.p.z;
      const v = Math.hypot(S.vx, S.vz); S.pk.push([clk, v]); while (S.pk.length && S.pk[0][0] < clk - 0.35) S.pk.shift();
      let vpk = 0; for (const q of S.pk) if (q[1] > vpk) vpk = q[1];
      const acc = Math.hypot(S.ax, S.az);
      for (let j = 0; j < 2; j++) {
        const sd = j ? 'R' : 'L', ft = S.f[j]; P.jointPos(sd + '_Foot', w.a); P.jointPos(sd + '_Toe0', w.t);
        // (how high the ankle and toe stand when down is taken from the figure itself, as it varies with his height)
        if (ft.ay == null) { ft.ay = w.a.y; ft.ty = w.t.y; } ft.ay = Math.min(ft.ay + dt * 0.02, w.a.y); ft.ty = Math.min(ft.ty + dt * 0.02, w.t.y);
        const ha = w.a.y - ft.ay, ht = w.t.y - ft.ty, low = Math.min(ha, ht), dy = ft.low != null ? (ft.low - low) / dt : 0; ft.low = low;
        if (!ft.up) { if (ha > 0.03 && ht > 0.025) { ft.up = true; ft.dy = 0; } continue; }
        ft.dy = Math.max(ft.dy * 0.6, dy);
        if (low > 0.012) continue;
        // down: as loud as it came down (metres a second at the last) and as fast as he was going
        ft.up = false; const k = clamp(0.3 + 0.16 * v + 0.35 * ft.dy, 0.3, 1.4), x = w.a.x, z = w.a.z;
        // (both feet down within a few hundredths of a second are one sound, not a flam)
        if (!this.on || clk - (S.ff || -9) < 0.07) continue; S.ff = clk;
        this.footfall(x, z, k);
      }
      // a slide on clay, from the figure's own slide
      const sf = f.slideFx; if (sf && !S.sl && this.on && this.surface === 'clay') this.slide(sf.x, sf.z, clamp(sf.speed / 5, 0.5, 1.3), clamp(0.18 + sf.speed * 0.07, 0.25, 0.6));
      S.sl = !!sf;
    }
  }
  frame(g, dt) {
    if (!this.ctx) return;
    const m = g.match, p = m.players[0];
    // you hear the court from where you play it, whichever camera is showing it
    this.listener = { x: p.x, z: p.z };
    // the crowd hushes for the serve and murmurs between points
    const quiet = m.phase === 'ready' || m.phase === 'toss' || m.phase === 'live';
    this.hush += ((quiet ? 0.32 : 1) - this.hush) * Math.min(1, dt * (quiet ? 2.2 : 1.2));
    let sw = 0; if (this.swell) { const u = (this.ctx.currentTime - this.swell.t) / this.swell.dur; sw = u < 0 || u > 1 ? 0 : this.swell.level * (u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.6)); }
    if (this.amb) { this.feedAmbience(); this.amb.g.gain.value = 0.2 * this.hush * (1 + 2.2 * sw); }
    this.feet(g, dt);
  }
}
