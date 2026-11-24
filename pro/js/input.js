// Rally Pro — keyboard and gamepad (he said "get rid of mouse controls"). Produces one small state object the game reads.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.btn = [false, false, false];         // the pad's buttons, held
    this.edges = [];                          // { type: 'down'|'up', b, t }
    this.pressed = new Set();                 // keys pressed since last read
    this.enabled = false;
    this.pad = null;
    const kd = e => {
      if (!this.enabled) return;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.code); this.pressed.add(e.code); }
    };
    const ku = e => { this.keys.delete(e.code); };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    addEventListener('blur', () => { this.keys.clear(); this.btn = [false, false, false]; });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  down(code) { return this.keys.has(code); }
  // movement as a vector: x right, y forward
  move() {
    let x = 0, y = 0;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    const p = this.pad;
    if (p && (Math.abs(p.lx) > 0.18 || Math.abs(p.ly) > 0.18)) { x = p.lx; y = -p.ly; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
  // movement on W A S D (and a pad's stick) only: with the first game's controls the arrows are the aim
  moveKeys() {
    let x = 0, y = 0;
    if (this.down('KeyD')) x += 1; if (this.down('KeyA')) x -= 1; if (this.down('KeyW')) y += 1; if (this.down('KeyS')) y -= 1;
    const p = this.pad;
    if (p && (Math.abs(p.lx) > 0.18 || Math.abs(p.ly) > 0.18)) { x = p.lx; y = -p.ly; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
  takeEdges() { const e = this.edges; this.edges = []; return e; }
  takePressed() { const p = this.pressed; this.pressed = new Set(); return p; }
  poll() {
    const g = navigator.getGamepads ? [...navigator.getGamepads()].find(x => x && x.connected) : null;
    if (!g) { this.pad = null; return; }
    const dz = v => Math.abs(v) < 0.16 ? 0 : v, prev = this.padBtn || [];
    this.pad = { lx: dz(g.axes[0] || 0), ly: dz(g.axes[1] || 0), rx: dz(g.axes[2] || 0), ry: dz(g.axes[3] || 0) };
    // A / right trigger = drive, X / left trigger = slice, B = drop, Y = lob, bumper = flat
    const map = [[0, 0], [7, 0], [2, 2], [6, 2]];
    const now = g.buttons.map(b => b.pressed);
    for (const [bi, mb] of map) if (now[bi] !== !!prev[bi]) { this.btn[mb] = now[bi]; this.edges.push({ type: now[bi] ? 'down' : 'up', b: mb, t: performance.now() }); }
    const key = (bi, code) => { if (now[bi] && !prev[bi]) { this.keys.add(code); this.pressed.add(code); } else if (!now[bi] && prev[bi]) this.keys.delete(code); };
    key(1, 'KeyE'); key(3, 'KeyQ'); key(5, 'ShiftLeft'); key(4, 'Space'); key(9, 'Escape'); key(8, 'KeyV');
    this.padBtn = now;
  }
}
