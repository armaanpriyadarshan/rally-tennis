// Rally Pro — keyboard, mouse and gamepad. Produces one small state object the game reads.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.mx = 0; this.my = 0;                 // unread mouse movement, pixels
    this.btn = [false, false, false];         // left, middle, right held
    this.edges = [];                          // { type: 'down'|'up', b, t }
    this.pressed = new Set();                 // keys pressed since last read
    this.locked = false; this.soft = false; this.enabled = false; this.sens = 1;   // soft: the browser refused to capture the mouse, so read it uncaptured
    this.pad = null;
    const kd = e => {
      if (!this.enabled) return;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.code); this.pressed.add(e.code); }
    };
    const ku = e => { this.keys.delete(e.code); };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    addEventListener('blur', () => { this.keys.clear(); this.btn = [false, false, false]; });
    el.addEventListener('mousedown', e => { if (!this.enabled) return; if (!this.locked) { this.lock(); } this.btn[e.button] = true; this.edges.push({ type: 'down', b: e.button, t: performance.now() }); e.preventDefault(); });
    addEventListener('mouseup', e => { if (!this.enabled) return; if (this.btn[e.button]) { this.btn[e.button] = false; this.edges.push({ type: 'up', b: e.button, t: performance.now() }); } });
    addEventListener('mousemove', e => { if (!this.enabled) return; if (this.locked || this.soft) { this.mx += e.movementX; this.my += e.movementY; } });
    document.addEventListener('pointerlockerror', () => { this.soft = true; if (this.onLock) this.onLock(true); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; if (this.locked) this.soft = false; if (this.onLock) this.onLock(this.locked); });
  }
  // Capture the mouse. If the browser will not allow it, carry on with the free cursor.
  lock() {
    const plain = () => { try { const q = this.el.requestPointerLock(); if (q && q.catch) q.catch(() => { this.soft = true; if (this.onLock) this.onLock(true); }); } catch (e) { this.soft = true; } };
    try { const p = this.el.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(plain); } catch (e) { plain(); }
  }
  get active() { return this.locked || this.soft; }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
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
  takeMouse() { const r = { x: this.mx * this.sens, y: this.my * this.sens }; this.mx = this.my = 0; const p = this.pad; if (p) { r.x += p.rx * 14; r.y += p.ry * 14; } return r; }
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
