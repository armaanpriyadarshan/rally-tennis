// Rally Pro — playing someone over the internet.
//
// The two browsers talk to each other directly (WebRTC), not through a game server: the only server
// involved is PeerJS's public one, which introduces them by a four-letter code and then drops out.
// Joining first looks for the other player on the same network (the shortest path there is), then
// over the internet by STUN.
//
// Two channels on the one connection:
//  - `sure`: reliable and in order, for what must arrive (the setup, every shot, every call);
//  - `fast`: unordered and never resent, for where each player is, sixty times a second. Only the
//    newest of those matters, so a lost one is skipped rather than waited for: nothing queues behind it.
//
// The clocks: each side runs its own match clock from the moment both have loaded. A ping every half
// second measures the round trip and the offset between the two clocks (half the round trip each way),
// smoothed, so a message stamped with the sender's time can be placed on the receiver's.

const PREFIX = 'rallypro-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] };
const LAN_TRY_MS = 3500;

export function makeCode() { let s = ''; for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }

// the other side's view of the court is this one turned half round: x and z (and their speeds and spins) change sign
export function mirrorBall(b) { return { x: -b.x, y: b.y, z: -b.z, vx: -b.vx, vy: b.vy, vz: -b.vz, wx: -b.wx, wy: b.wy, wz: -b.wz }; }

export class Net {
  constructor() {
    this.peer = null; this.conn = null; this.fast = null; this.code = null; this.role = null;
    this.handlers = {}; this.queue = []; this.open = false; this.kind = '';
    this.rtt = 0; this.offset = null; this.clock = null;      // clock(): this side's match time, set by the game
    this.lastSeen = 0; this.pingT = null;
  }
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; }
  emit(type, d) { for (const fn of this.handlers[type] || []) fn(d); }
  get Peer() { return typeof window !== 'undefined' ? window.Peer : null; }

  host(onCode) {
    if (!this.Peer) { this.emit('error', 'The connection library did not load.'); return; }
    this.role = 'host'; this.code = makeCode(); onCode && onCode(this.code);
    this.peer = new this.Peer(PREFIX + this.code, { config: ICE });
    this.peer.on('open', () => this.emit('status', 'Waiting for your opponent'));
    this.peer.on('connection', c => { if (this.conn) { try { c.close(); } catch (e) {} return; } this.bind(c); });
    this.peer.on('disconnected', () => { if (!this.open) try { this.peer.reconnect(); } catch (e) {} });
    this.peer.on('error', e => {
      if (e.type === 'unavailable-id') { this.close(); this.host(onCode); return; }
      this.emit('error', e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Cannot reach the connection server.' : 'Connection problem (' + e.type + ').');
    });
  }
  join(code, lanFirst = true) {
    if (!this.Peer) { this.emit('error', 'The connection library did not load.'); return; }
    this.role = 'guest'; this.code = code.toUpperCase();
    if (this.peer) try { this.peer.destroy(); } catch (e) {}
    const peer = this.peer = new this.Peer({ config: lanFirst ? { iceServers: [] } : ICE });
    this.emit('status', lanFirst ? 'Looking for them on your network' : 'Connecting over the internet');
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const c = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      this.bind(c);
      if (lanFirst) setTimeout(() => { if (this.peer === peer && !this.open) { this.conn = null; this.join(code, false); } }, LAN_TRY_MS);
    });
    peer.on('error', e => {
      if (this.peer !== peer) return;
      if (e.type === 'peer-unavailable') this.emit('error', 'No game with that code.');
      else if (!lanFirst || this.open) this.emit('error', 'Connection problem (' + e.type + ').');
    });
  }
  bind(c) {
    this.conn = c;
    c.on('open', () => {
      if (this.conn !== c) return;
      this.open = true; this.lastSeen = performance.now();
      // the fast channel, agreed on both sides by number so it needs no further handshake
      const pc = c.peerConnection;
      try {
        this.fast = pc.createDataChannel('rp-fast', { negotiated: true, id: 77, ordered: false, maxRetransmits: 0 });
        this.fast.onmessage = ev => { try { this.receive(JSON.parse(ev.data)); } catch (e) {} };
      } catch (e) { this.fast = null; }
      this.kind = this.pathKind(pc);
      this.emit('open', this.role);
      this.pingTimer = setInterval(() => this.ping(), 500);
    });
    c.on('data', d => { if (this.conn === c) this.receive(d); });
    c.on('close', () => { if (this.conn === c) { this.open = false; clearInterval(this.pingTimer); this.emit('close'); } });
    c.on('error', () => {});
  }
  // what kind of path the link took: the same network, direct over the internet, or relayed
  pathKind(pc) {
    setTimeout(async () => {
      try { const st = await pc.getStats(); let pair = null; st.forEach(r => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r; });
        if (pair) { const loc = st.get(pair.localCandidateId), rem = st.get(pair.remoteCandidateId); const t = [loc && loc.candidateType, rem && rem.candidateType];
          this.kind = t.includes('relay') ? 'relay' : t.every(x => x === 'host') ? 'lan' : 'direct'; this.emit('path', this.kind); } } catch (e) {}
    }, 1500);
    return '';
  }
  receive(d) {
    this.lastSeen = performance.now();
    if (!d || typeof d !== 'object') return;
    if (d.k === 'ping') { this.send({ k: 'pong', a: d.a, r: this.clock ? this.clock() : 0 }, true); return; }
    if (d.k === 'pong') {
      const now = this.clock ? this.clock() : 0, rtt = Math.max(0, now - d.a);
      this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
      const off = d.r - (d.a + rtt / 2);                         // their clock minus ours
      if (rtt < this.rtt * 1.5 + 0.01) this.offset = this.offset == null ? off : this.offset * 0.85 + off * 0.15;
      return;
    }
    if (this.lobby) { this.emit('msg', d); return; }            // before the match: the menus deal with it
    this.queue.push(d);
  }
  ping() { if (this.open && this.clock) this.send({ k: 'ping', a: this.clock() }, true); }
  // their time on our clock
  toLocal(t) { return t - (this.offset || 0); }
  send(d, fast) {
    if (!this.open) return;
    try { if (fast && this.fast && this.fast.readyState === 'open') this.fast.send(JSON.stringify(d)); else this.conn.send(d); } catch (e) {}
  }
  take() { const q = this.queue; this.queue = []; return q; }
  close() {
    clearInterval(this.pingTimer); this.open = false;
    try { this.fast && this.fast.close(); } catch (e) {}
    try { this.conn && this.conn.close(); } catch (e) {}
    try { this.peer && this.peer.destroy(); } catch (e) {}
    this.peer = this.conn = this.fast = null;
  }
}
