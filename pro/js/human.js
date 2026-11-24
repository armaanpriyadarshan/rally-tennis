// Rally Pro — the human at the controls. Kept free of anything graphical so the same code
// that reads a player's mouse and keys can be driven by a test bot outside the browser.
import { AI } from './ai.js';
import { COURT, lerp } from './physics.js';
import { TIMING, REACH } from './sim.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Two ways to play. CLASSIC is the first Rally's: arrows or WASD move, Space tosses, serves and
// hits, and whichever arrow is held as the racket swings aims the ball — left or right for the
// angle, up for depth (a lob over a man at the net), down for the drop shot. A press a moment
// early is remembered and the swing goes as the ball comes into reach. MOUSE is this game's own:
// Mouse aims a spot on the far court. Hold a button to take the racket back (longer = more
// pace), release to swing; the ball should arrive as the racket does. Left is topspin,
// right is slice; Shift flattens it out, Q lobs, E plays the drop shot. Space is the split
// step — land it as he hits and the first step comes for free.
// Can he get to this ball? Where its path crosses the line he meets balls on (a little in front of him), and when; how far that is to
// the side of him, less what he can run in the time left. A ball that goes by out of his reach gets no wind-up and no swing: he runs.
// (He said "i dont like how the player takebacks for balls theyre not going to get": with Space pressed, or by his own reading of
// the ball, a full take-back and swing went at balls passing six to twelve metres away.) side: which of his sides it will be on.
export function reachOf(m, p) {
  const inc = m.incoming; if (!inc || !inc.path || !m.ball.live) return null;
  const s = p.sgn, cz = p.z - s * 0.42, path = inc.path; let best = 1e9, bx = null, bt = null;
  for (let q = 0; q + 3 < path.length; q += 4) { const tt = inc.t0 + path[q + 3]; if (tt < m.t) continue; const d = Math.abs(path[q + 2] - cz); if (d < best) { best = d; bx = path[q]; bt = tt; } if (path[q + 2] * s > cz * s + 0.5) break; }
  // (a ball whose path never comes near his line, wide of him or already by him: judged by its nearest approach from here on)
  if (bt == null || best > 3.0) { let nd = 1e9, nt = null, nx = null; for (let q = 0; q + 3 < path.length; q += 4) { const tt = inc.t0 + path[q + 3]; if (tt < m.t) continue; const d = Math.hypot(path[q] - p.x, path[q + 2] - p.z); if (d < nd) { nd = d; nt = tt; nx = path[q]; } }
    if (nt == null) return { ok: false, gap: 1e9, left: 0, side: 'fh', relX: 0 };
    const left = Math.max(0, nt - m.t), run = p.prof.speed * 1.0 * Math.max(0, left - 0.1), reach = REACH.max * 1.12 * (p.prof.height / 1.85) + 1.4, relX = (nx - p.x) * s * p.hs;
    return { ok: nd - run <= reach, gap: nd, left, side: relX >= -0.05 ? 'fh' : 'bh', relX }; }
  const left = Math.max(0, bt - m.t), relX = (bx - p.x) * s * p.hs, gap = Math.abs(bx - p.x), run = p.prof.speed * 1.0 * Math.max(0, left - 0.1);
  // (generous: his controls reach further than this, most of all behind him, and the game's legs take him there faster than a sum of
  // speed and time; only a ball clearly beyond him is refused - judged strictly, a third of the returns he made went unswung)
  const reach = REACH.max * 1.12 * (p.prof.height / 1.85) + 1.4;
  return { ok: gap - run <= reach, gap, left, side: relX >= -0.05 ? 'fh' : 'bh', relX };
}
export class Human {
  constructor(game) {
    this.isHuman = true; this.g = game; this.coach = new AI(); this.coach.eagerPre = true; this.coach.noLob = true; this.coach.noSlice = true; this.coach.noDrop = true; this.aim = { X: 0, D: -9.5 }; this.hold = null; this.power = 0; this.lastTiming = null; this.tau = null; this.kind = 'drive';
    this.safe = [0.35, 0.9]; this.srvSafe = 0.35;       // how far inside the lines the aim marker is kept (set from the difficulty)
    this.readAt = 0; this.readInc = null; this.buf = -9;
    this.build = 'classic-9';                        // named in the local play log, so a browser running a stale copy shows up
  }
  update(m, i, dt) {
    const p = m.players[i], inp = this.g.input, s = p.sgn, g = this.g;
    p.move.x = 0; p.move.z = 0;
    if (!inp) return;
    const serving = m.score.server === i, ph = m.phase;
    if (serving && (ph === 'ready' || ph === 'toss' || ph === 'between')) {
      // keep the marker in the box being served to
      const side = m.deuceSide ? -1 : 1;
      if (this.srvSide !== side || this.srvNo !== m.score.pointNo) { this.srvSide = side; this.srvNo = m.score.pointNo; this.aim.X = side * 1.2; this.aim.D = -5.4; }
      const sm = this.srvSafe;
      this.aim.X = side > 0 ? clamp(this.aim.X, sm, COURT.halfW - sm) : clamp(this.aim.X, -COURT.halfW + sm, -sm);
      this.aim.D = clamp(this.aim.D, -COURT.svc + sm, -2.4);
    } else {
      if (this.srvNo != null && ph === 'live' && m.rally === 1 && serving && !this.reset) { this.aim.D = -9.5; this.reset = true; }
      if (ph !== 'live') this.reset = false;
      this.aim.X = clamp(this.aim.X, -COURT.halfW + this.safe[0], COURT.halfW - this.safe[0]); this.aim.D = clamp(this.aim.D, -COURT.halfLen + this.safe[1], -1.0);
    }
    // ---- feet ----
    const mv = inp.moveKeys ? inp.moveKeys() : inp.move();
    let plan = this.plan = ph === 'live' ? this.coach.track(m, i) : null; this.helpedNow = false;
    // Running round the ball, as moving did in the first game: an arrow held toward the side the ball is coming to takes him
    // on past it, so he meets it on the other side of his body (round a backhand to hit a forehand, or round a forehand), the
    // footwork doing the running. Held away from the ball it changes nothing. Up to a third of a second before he meets it.
    if (plan && !plan.leave && plan.tc != null && plan.tc - m.t > 0.3 && m.ball.live && m.ball.lastHit !== i && !(p.stroke && p.stroke.tc != null)) {
      const lk = (inp.down('ArrowRight') || inp.down('KeyD') ? 1 : 0) - (inp.down('ArrowLeft') || inp.down('KeyA') ? 1 : 0);
      let want = lk ? (-lk * p.hs > 0 ? 'fh' : 'bh') : null;
      // (decided early and then kept for this ball: an arrow pressed late is the aim, not a run round the ball, and released it
      // does not swing him back; let either happen part way into the take-back, and the racket was set up on one side and
      // thrown across to the other, and sometimes back)
      if (this.rrFor === m.incoming && this.rrWing) want = this.rrWing;
      else if (want && want !== plan.wing && plan.tc - m.t > 0.55 && !(p.stroke && !p.stroke.done && m.t - p.stroke.t0 > 0.12)) { this.rrFor = m.incoming; this.rrWing = want; }
      else want = null;
      if (want && want !== plan.wing) { const np = this.coach.makePlan(m, i, want); if (np && !np.leave && np.tc != null) { np.rebuilt = plan.rebuilt; this.coach.cplan = np; plan = this.plan = np; } }
    }
    if (ph !== 'live') { this.coach.goNet = false; p.approach = false; p.atNet = false; this.choice = null; }
    if (ph === 'between' || ph === 'over' || ph === 'done') { if (ph === 'between' && p.spot) this.coach.goTo(p, p.spot.x, p.spot.z); }
    else if (ph === 'ready' && serving) {
      // shuffle along the baseline to choose where to serve from
      const side = m.deuceSide ? 1 : -1, bx = p.x * s;
      if (!this.placed || this.placedNo !== m.score.pointNo) { this.placed = true; this.placedNo = m.score.pointNo; }
      // (at his ordinary pace, not a crawl: he said "the walk to move side to side preserve should be normal speed not slow" - the
      // input was halved and the server held to 1.6 m/s, so it went at 0.8. With ← → as well as A D: nothing is aimed until he serves,
      // and with W A S D alone to move he said "you cant walk side to side before serving anymore")
      const mvS = inp.move ? inp.move() : mv;
      p.move.x = mvS.x * s; p.srvFree = true;
      const lim = side > 0 ? [0.15, COURT.halfW + 0.2] : [-COURT.halfW - 0.2, -0.15];
      if ((bx <= lim[0] && mv.x < 0) || (bx >= lim[1] && mv.x > 0)) p.move.x = 0;
      p.x = clamp(bx, lim[0], lim[1]) * s;
      p.move.z = (s * (COURT.halfLen + 0.35) - p.z) * 2;
    } else if (ph === 'toss' && serving) { /* rooted */ }
    else {
      const A = g.opts.assist == null ? 2 : g.opts.assist;
      const committed = (this.buf > m.t || (!!p.stroke && !p.stroke.done && p.stroke.tc != null));
      // In the classic game the arrows held as you swing are the aim. So while a ball is on its way to him the
      // legs are the game's own (all the way with Auto footwork, the last three metres with Assist) and the
      // arrows do not walk him off it; with the ball going away, or with Manual footwork, they move him.
      const coming = ph === 'live' && m.ball.live && m.ball.lastHit !== i && plan && !plan.leave;
      // (how near the ball he must have got himself before the game's legs take over: Assist does the last
      // five metres, Manual the last adjusting steps, as a player's feet settle without his thinking about them)
      const near = A >= 2 ? 1e9 : A >= 1 ? 5.0 : 1.6;
      // With Assist a ball dropping short in front of him is the game's to run down from the start, as with Auto: by the time
      // a person has seen a drop shot for what it is and pressed a key, three or four tenths of a second, the run up from the
      // baseline is lost, and in the last five metres the legs that take over can no longer make it up.
      const shortRun = A === 1 && coming && (((p.z - plan.S.z) * s > 3.0) || (m.incoming && (m.incoming.apex || 0) > 4 && plan.pre));   /* (and back under a lob for the overhead, from the start) */
      const helped = coming && (shortRun || Math.hypot(plan.S.x - p.x, plan.S.z - p.z) < near); this.helpedNow = !!helped;
      const any = (!(p.stroke && !p.stroke.done && p.stroke.tc != null)) && Math.abs(mv.x) + Math.abs(mv.y) > 0.01;   /* (W A S D held, he moves himself, the game's legs standing aside until he lets go; not through the swing itself) */
      if (any) {
        p.move.x = mv.x * s; p.move.z = -mv.y * s; p.goDist = null;
        // (and where the arrows point at where the ball is to be met, the figure is told how far that is, as the game's own legs tell
        // it: a long run starts with a turn and is run, a step or two is shuffled. Left unknown, every run with the arrows to a ball
        // three or four metres away was shuffled sideways square to the net at up to 3.6 m/s, feet together and upright, turning
        // only part way and late, where the same run on Auto footwork turned and ran from the first step.)
        if (ph === 'live' && plan && !plan.leave && plan.S) { const dx = plan.S.x - p.x, dz = plan.S.z - p.z, d = Math.hypot(dx, dz), ml = Math.hypot(p.move.x, p.move.z);
          if (d > 0.5 && ml > 0.01 && (dx * p.move.x + dz * p.move.z) / (d * ml) > 0.75) p.goDist = d; }
        if (p.burstOK) m.burst(i, p.move.x, p.move.z);
      }
      // the legs that run for you still have to see the ball first: they start after his own
      // reaction time, later for a big serve. Your own keys are not held back — guess right and go.
      const inc = m.incoming;
      if (inc && inc !== this.readInc && m.ball.lastHit !== i) {
        this.readInc = inc; const sp = m.ball.lastSpeed || 30, srv = m.ball.isServe;
        this.readAt = m.t + p.prof.react * (srv ? 0.92 + 0.30 * clamp((sp - 45) / 15, 0, 1) : 1) * (0.85 + m.rng.u() * 0.3);
        m.splitStep(i);
      }
      if (plan && !plan.leave) {
        const dx = plan.S.x - p.x, dz = plan.S.z - p.z, d = Math.hypot(dx, dz);
        if (!any && m.t >= this.readAt && (A >= 2 || shortRun || d < (A >= 1 ? 5.0 : 1.6) || (committed && A > 0))) { this.coach.goTo(p, plan.S.x, plan.S.z, 0.05); if (p.burstOK && d > 0.6) m.burst(i, dx, dz); }
      } else if (!any && A >= 1 && ph === 'live' && m.ball.lastHit === i) {
        // after his shot: back to cover the court, or, behind an approach, in to the net (the game chose it with the shot)
        const r = this.coach.recoverSpot(m, i);
        this.coach.goTo(p, r.x, r.z, A >= 2 ? 0.2 : 0.6);
      }
      else if (!any && ph === 'ready' && p.spot) this.coach.goTo(p, p.spot.x, p.spot.z);
    }
    // ---- timing read-out: seconds until the ideal moment to let go ----
    this.tau = null;
    // (can he get to it at all: see reachOf)
    this.rch = ph !== 'live' ? null : reachOf(m, p); this.outOfReach = !!(this.rch && !this.rch.ok);
    // with the game's legs bringing him to the ball, the ball arrives when the plan says it will meet him
    // (only while his legs can still get him to that spot in the time left; otherwise the ball is met where he is)
    // (or wherever the game's own plan says the ball can be reached, at a stretch: judged only by four-fifths of his speed, a drop
    // shot he was being run up to was not, the swing was timed to a ball crossing just in front of where he stood, which a drop
    // shot never does, and went off at once into thin air; the computer's swing goes by its plan)
    const canMake = plan && plan.S && plan.tc != null && ((plan.hit && !plan.leave) || Math.hypot(plan.S.x - p.x, plan.S.z - p.z) <= p.prof.speed * 0.8 * Math.max(0, plan.tc - m.t) + 0.25);
    const planned = this.helpedNow && plan && !plan.leave && canMake && plan.tc > m.t - 0.02 ? plan.tc : null;
    if (planned != null && ph === 'live' && m.ball.live && m.ball.lastHit !== i) this.tau = planned - m.t - TIMING.swing;
    else if (ph === 'live' && m.ball.live && m.ball.lastHit !== i && m.incoming && !(m.ball.isServe && m.ball.bounces === 0 && false)) {
      const inc = m.incoming, path = inc.path, cz = p.z - s * 0.42; let best = 1e9, bt = null;
      for (let q = 0; q + 3 < path.length; q += 4) { const tt = inc.t0 + path[q + 3]; if (tt < m.t) continue; const d = Math.abs(path[q + 2] - cz); if (d < best) { best = d; bt = tt; } if (path[q + 2] * s > cz * s + 0.5) break; }
      if (bt != null && best < 3.0) this.tau = bt - m.t - TIMING.swing;
      // (and where it will be then, for a wind-up with no plan to go by)
      this.npCP = null; if (bt != null && best < 1.5) for (let q = 0; q + 3 < path.length; q += 4) if (inc.t0 + path[q + 3] >= bt - 1e-6) { this.npCP = { x: path[q], y: path[q + 1], z: path[q + 2] }; break; }
    }
    // ---- hands: the first game's way ----
    {
      const pressed = inp.takePressed(); inp.takeEdges();
      // (W A S D move him, he asked for "wasd movement"; the arrows alone aim.)
      const dn = c => inp.down(c) && (!/^Key[WASD]$/.test(c)), pr = c => pressed.has(c) && (!/^Key[WASD]$/.test(c));
      let lat = (dn('ArrowRight') || dn('KeyD') ? 1 : 0) - (dn('ArrowLeft') || dn('KeyA') ? 1 : 0), fk = (dn('ArrowUp') || dn('KeyW') ? 1 : 0) - (dn('ArrowDown') || dn('KeyS') ? 1 : 0);
      const go = pressed.has('Space') || pressed.has('Enter');
      // (an arrow tapped between two frames is a press too: read from the keys pressed since the last frame as well as those held)
      const latT = lat || (pr('ArrowRight') || pr('KeyD') ? 1 : 0) - (pr('ArrowLeft') || pr('KeyA') ? 1 : 0), fkT = fk || (pr('ArrowUp') || pr('KeyW') ? 1 : 0) - (pr('ArrowDown') || pr('KeyS') ? 1 : 0);
      if (go && this.log) this.log.push(['press', +m.t.toFixed(2), ph, this.tau == null ? null : +this.tau.toFixed(3), m.ball.lastHit, m.ball.live ? 1 : 0, +Math.hypot(m.ball.x - p.x, m.ball.z - p.z).toFixed(1), lat, fk, serving ? 1 : 0]);
      this.power = 0; this.kindNow = null; this.hold = null;
      if (ph !== 'live') this.aimPreview = null;
      if (ph === 'ready' && serving) { this.srvWant = false; if (go && m.phaseT > 0.4) { m.toss(i); g.audio && g.audio.event('toss'); } }
      else if (ph === 'toss' && serving) {
        // pressed again any time after the toss has started: the swing goes no sooner than a moment before the
        // ball is back at full reach, so an eager press is a slightly early serve and not a swing at thin air
        if (go) { this.srvWant = true; this.srvL = latT; this.srvF = fkT; }
        // (the arrows pressed with Space, or any time after it, count until the swing goes: read only at the swing, a moment after the
        // press, an arrow let go of in between was not the aim at all, and the serve went where the game chose; he said "sometimes the
        // aiming on the stroke doesnt listen to keypresses")
        if (this.srvWant) { if (latT) this.srvL = latT; if (fkT) this.srvF = fkT; }
        if (this.srvWant && m.ball.held < 0 && p.stroke && p.stroke.tc == null && m.t >= m.tossIdeal - TIMING.serveSwing - 0.08) {
          this.srvWant = false; lat = lat || this.srvL || 0; fk = fk || this.srvF || 0;
          // left and right place it in the box: the T, the body, or wide
          const side = m.deuceSide ? -1 : 1, smg = this.srvSafe + 0.3, a = smg, b = COURT.halfW - smg, u = 0.5 + 0.5 * lat * side, X = side * (a + (b - a) * u), D = -(COURT.svc - this.srvSafe - 0.55);
          this.aim.X = X; this.aim.D = D;
          // ↑ held as he swings is a kick serve (high over the net, jumping up and away), ↓ a slice (curving away and
          // staying low); neither is the usual flat first serve and kick second
          const type = fk > 0 ? 'kick' : fk < 0 ? 'slice' : m.score.serveNum === 1 ? 'flat' : 'kick';
          m.serveSwing(i, { tx: X * s, tz: D * s, type, pace: 1 });
        }
      } else if (ph === 'live') {
        // As in the first game: Space swings. If the ball is close enough to be met inside the swing it
        // goes at once, and how well it is timed is how near the press was to the moment the circle
        // closes; pressed earlier than that, it is remembered and goes as the ball comes into reach
        // (a touch early, never a miss). Pressed late, it is late. The arrows held as the swing starts are the aim.
        const mine = m.ball.live && m.ball.lastHit !== i, st0 = p.stroke, swinging = !!st0 && !st0.done && st0.tc != null;
        if (go && mine && !swinging) { this.buf = m.t + 1.6; this.aimFor = m.incoming; this.aimL = latT; this.aimF = fkT; this.pressAt = m.t; }   // armed for this ball: pressed early, the swing still goes when the ball is on him
        // (and the arrows pressed with Space, or any time after it until the swing goes, are the aim: read only as it went, a sixth of a
        // second before the ball, an arrow pressed with an early Space and let go of in between was not the aim, and the ball went where
        // the game chose; he said "sometimes the aiming on the stroke doesnt listen to keypresses". One held as it goes still wins.)
        // Timed aim (as Tennis Elbow 4's): how long ← or → has been held for this ball sets the angle - a tap goes a little off the middle,
        // held four tenths of a second or more it goes for the line, closer to it than the old fixed angle and so more often out. Kept after
        // the key is let go, until the swing goes. (He chose it, took it out on 2026-11-23 with the aim circle, and asked for it back the same
        // day, "just dont make the aiming thing visible until the ball is hit": no circle before the hit, the landing circle after.)
        if (this.aimHFor !== m.incoming) { this.aimHFor = m.incoming; this.aimHDir = 0; this.aimHT = null; this.aimHDur = 0; }
        if (mine) { if (lat) { if (this.aimHDir !== lat || this.aimHT == null) { this.aimHDir = lat; this.aimHT = m.t; } this.aimHDur = m.t - this.aimHT; }
          else { this.aimHT = null; if (latT && this.aimHDir !== latT) { this.aimHDir = latT; this.aimHDur = 1 / 60; } } }
        if (mine && this.buf > m.t && this.aimFor === m.incoming) { if (latT) this.aimL = latT; if (fkT) this.aimF = fkT; if (!lat) lat = this.aimL || 0; if (!fk) fk = this.aimF || 0; }
        // He reads the ball and turns for it on his own, as early as a player does (about 0.85 s out, as the computer does):
        // the shoulders turn and the racket goes back on the side the ball is coming to, whether or not Space has been
        // pressed yet. Space says when he swings. (By the sooner of the plan's clock and the ball's own, which times the wind-up: by the
        // plan's alone, on a sprint the ball reached him a quarter of a second before the plan said, the take-back began with 0.6 s left
        // and crammed into a third of a second, the racket whipped across him - "the arms flail". Waiting for the press, the take-back used to start a tenth of a second
        // before contact, and he swung from the ready position with no wind-up at all.)
        const rch = this.rch, outOfReach = this.outOfReach;
        if (mine && !swinging && !outOfReach && plan && !plan.leave && plan.tc != null && plan.cp && Math.min(plan.tc - m.t, this.tau != null ? this.tau + TIMING.swing : 9) < 0.85 && plan.tc - m.t > 0.1 && (!p.stroke || p.stroke.done) && (m.incoming == null || this.prepGone !== m.incoming)) {
          if (!this.choice || this.choiceFor !== m.incoming) { this.choiceFor = m.incoming; this.choice = this.coach.decide(m, i, plan); }
          if (m.prep(i, this.choice ? this.choice.kind : 'drive') && p.stroke && !p.stroke.done && p.stroke.tc == null && plan.wing) p.stroke.wing = plan.wing;
        }
        // (and a ball the planner has made nothing of, no plan or no time for it, that is still coming to within his reach: he
        // turns for it all the same, on the side it will reach him, by its own path. Without it a ball he then swung at had no
        // wind-up at all, the whole stroke begun at the press a seventh of a second before the ball.)
        else if (mine && !swinging && !outOfReach && (!plan || (!plan.leave && (plan.tc == null || !plan.cp))) && this.tau != null && this.npCP && this.tau + TIMING.swing < 0.8 && this.tau + TIMING.swing > 0.25 && (!p.stroke || p.stroke.done) && (m.incoming == null || this.prepGone !== m.incoming)) {
          const latN = (this.npCP.x - p.x) * p.sgn * p.hs;
          if (Math.abs(latN) < 2.0 && m.prep(i, 'drive') && p.stroke && !p.stroke.done && p.stroke.tc == null) { p.stroke.wing = latN >= -0.15 ? 'fh' : 'bh'; p.stroke.cpPlan = this.npCP; }
        }
        // (the side follows the plan while the racket is still going back: a ball he decides to run round is met on the other side)
        if (mine && !swinging && p.stroke && !p.stroke.done && p.stroke.tc == null && plan && !plan.leave && plan.wing && (m.t - p.stroke.t0 < 0.15 || (plan.tc != null && plan.tc - m.t > 0.6 && Math.abs((plan.cp ? plan.cp.x : p.x) - p.x) > 0.35))) p.stroke.wing = plan.wing;   /* (not later than about half a second before contact: a side changed later had the racket thrown across and back in a few frames) */
        // (and the wind-up is timed by when the ball will reach him: the figure plays it to that clock, not its own)
        // (by the same reckoning the swing itself goes by: the plan's contact while his legs can make it there, otherwise
        // where the ball reaches him now; timed by a plan he could not make, the wind-up ran a fifth of a second behind
        // the swing he let go, and caught up at twice the speed)
        if (mine && !swinging && p.stroke && !p.stroke.done && p.stroke.tc == null && this.tau != null) p.stroke.tcPlan = m.t + this.tau + TIMING.swing;
        else if (mine && !swinging && p.stroke && !p.stroke.done && p.stroke.tc == null && plan && !plan.leave && plan.tc != null) p.stroke.tcPlan = plan.tc;
        // (and where it will be met, as the plan has it: the figure bends the wind-up toward that before he lets go, so the
        // swing he releases is already on its way to the ball and nothing jumps toward it in the frame he lets go)
        if (mine && !swinging && p.stroke && !p.stroke.done && p.stroke.tc == null) p.stroke.cpPlan = plan && !plan.leave && plan.cp ? plan.cp : (!plan || !plan.leave) && this.npCP ? this.npCP : null;
        // (and a drop shot or a lob he is holding the key for is drawn as one from the start of the wind-up: decided only as he let
        // go, a sixth of a second before contact, by which time the figure keeps the swing it has begun, his drop shots and lobs
        // were played with the full swing of the drive the game had prepared, the ball dying over the net off a big forehand)
        if (mine && !swinging && p.stroke && !p.stroke.done && p.stroke.tc == null) {
          const bl = m.ball, cy = plan && plan.cp ? plan.cp.y : bl.y, vin = Math.hypot(bl.vx, bl.vy, bl.vz), oppUp = Math.abs(m.players[1 - i].z) < 4.2;
          const vinC = bl.bounces > 0 || m.ball.isServe ? vin : vin * 0.68;   /* (as it will be when he meets it: it slows to about two-thirds at the bounce) */
          const ownNow = fk < 0 && cy < 1.75 && vinC < 22 ? 'drop' : fk > 0 && oppUp ? 'lob' : null;
          if (ownNow && p.stroke.kind !== ownNow && /^(drive|flat|loop|slice|drop|lob)$/.test(p.stroke.kind)) { if (!p.stroke.__kind0) p.stroke.__kind0 = p.stroke.kind; p.stroke.kind = ownNow; }
          else if (!ownNow && p.stroke.__kind0) { p.stroke.kind = p.stroke.__kind0; p.stroke.__kind0 = null; }
        }
        // (with no plan to time it by, by when the ball will be on him: timed from its own start instead, a wind-up begun late
        // was still near its beginning when he let go a sixth of a second before contact, and the rest of it was crammed into
        // that sixth of a second, the arms thrashing)
        else if (mine && !swinging && p.stroke && !p.stroke.done && p.stroke.tc == null && this.tau != null) p.stroke.tcPlan = m.t + this.tau + TIMING.swing;
        // (a wind-up for a ball that has gone by him, or that is no longer his, is let go of, and not begun again for the same
        // ball: kept, he stood in it until the ball stopped bouncing, two seconds and more, both arms out at the place it had
        // been. Judged by where the ball is, not by when the plan last said it would arrive: by that, a plan behind the ball let
        // the wind-up go and the next frame began it again, the arms thrown fifty degrees between the two)
        { const sp = p.stroke, bl = m.ball; if (sp && !sp.done && sp.tc == null && !sp.auto && sp.kind !== 'serve') {
            const past = mine && (bl.z - p.z) * p.sgn > 0.6 && !(this.buf > m.t && this.tau != null);
            if (!mine || past) { p.stroke = null; this.prepGone = m.incoming; } } }
        if (mine && !swinging && outOfReach && p.stroke && !p.stroke.done && p.stroke.tc == null && p.stroke.kind !== 'serve') { p.stroke = null; this.prepGone = m.incoming; }
        // (no circle where he is aiming before he hits: he asked for the old controls back, the lime circle only once his ball is away)
        this.aimPreview = null;
        if (!mine) this.buf = -9;
        if (mine && !swinging && this.buf > m.t) {
          const opp = m.players[1 - i], oppUp = Math.abs(opp.z) < 4.2;
          // Which shot it is the game chooses, as it does for the computer and in his style: a moonball or a slice when
          // he is pushed back or stretched, a lob over a man at the net, now and then a drop shot, an approach he then
          // follows in to volley, a drive otherwise. He chooses when (Space) and the angle (left, right).
          if (!this.choice || this.choiceFor !== m.incoming) { this.choiceFor = m.incoming; this.choice = plan && !plan.leave && plan.cp ? this.coach.decide(m, i, plan) : null; }
          // ...unless he plays one himself, as in the first game: ↓ held as he swings is a drop shot (only off a ball below
          // the shoulders that is not coming too fast to take the pace off), ↑ a lob over a man at the net, or with him back
          // a deeper ball
          const bl = m.ball, cy = plan && plan.cp ? plan.cp.y : bl.y, vin = Math.hypot(bl.vx, bl.vy, bl.vz);
          // (and a drop shot the wind-up already showed, ↓ held through it, stays one: judged again at the press from the ball's speed
          // after its bounce instead of the estimate the wind-up used, a heavy ball came out a drive swung with a drop's arms, or the
          // other way round)
          const shownDrop = fk < 0 && p.stroke && p.stroke.kind === 'drop' && p.stroke.__kind0;
          const own = fk < 0 && cy < 1.75 && (vin < 22 || shownDrop) ? 'drop' : fk > 0 && oppUp ? 'lob' : null, deep = fk > 0 && !oppUp;
          // (↓ held on a ball too quick or too high to take the pace off is the short angle: crosscourt, or to the side an arrow
          // holds, landing near the side line about the service line - he said "there are no short + wide shots")
          const angle = fk < 0 && !own;
          const ch = own ? null : this.choice;
          const kind = own || (angle ? 'drive' : ch ? (deep && !/^(drive|flat|loop)$/.test(ch.kind) ? 'drive' : ch.kind) : 'drive');
          if (!outOfReach && this.prepGone !== m.incoming) m.prep(i, kind);   // the racket goes back at once (if he can get to it, and has not let it go)
          const tauC = this.tau != null ? this.tau + TIMING.swing : null;     // seconds until the ball is on him
          const fire = tauC != null ? tauC <= TIMING.swing + 0.012 : Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 3.0;     // early presses wait for the right moment; late ones go at once, late
          if (fire && !outOfReach) {
            // (swung on the side the ball will be: a wind-up begun for one side, the ball coming through on the other, was swung on the
            // wrong side, a forehand at a ball going by his backhand - "if theyre close to a ball but miss sometimes its the wrong animation")
            if (rch && p.stroke && !p.stroke.done && p.stroke.wing && p.stroke.wing !== rch.side && Math.abs(rch.relX) > 0.35) p.stroke.wing = rch.side;
            // the angle is his if he holds one
            // (no aim but his own: with no arrow held the ball goes down the middle and deep - the game used to choose where for him,
            // crosscourt, into the open court, a short angle; he said "there shouldnt be autoaim on my shots")
            const chX = 0, chD = -(COURT.halfLen - Math.max(2.4, this.safe[1] + 1.6));
            const aimF = clamp(((this.aimHDir === lat ? this.aimHDur : 0) - 0.05) / 0.35, 0, 1);
            const latX = 1.3 + (COURT.halfW - this.safe[0] - 0.3 - 1.3) * aimF;
            let X = lat ? lat * latX : chX, D = chD, power = ch ? ch.power : 0.74;
            // (the angle there is to have opens up with where he is: closer to the net, or out wide going crosscourt, an arrow held to the
            // line goes for the sharp angle - shorter and nearer the side line, running off the court - as far as he holds it; from the
            // middle of the baseline it is the deep ball to near the line. He said "if youre wider / closer to the net you should be able to
            // hit wider shots".)
            if (lat && !own && !angle) { const cD = Math.abs(p.z), cX = p.x * s, netK = clamp((12.5 - cD) / 7, 0, 1), wideK = Math.sign(cX) === -lat ? clamp((Math.abs(cX) - 1.5) / 2.5, 0, 1) : 0;
              const aK = Math.max(netK, 0.7 * wideK) * aimF;
              if (aK > 0.001) { X = lat * lerp(latX, COURT.halfW - Math.max(0.25, this.safe[0]), aK); D = -lerp(-D, Math.max(4.2, COURT.svc - 0.9), 0.75 * aK); } }
            // his own drop shot dies just over the net, his lob lands deep; with no angle held, both straight down the middle
            if (angle) { const side = lat || -Math.sign(p.x * s || 1); X = side * (COURT.halfW - Math.max(0.6, this.safe[0] + 0.3)); D = -5.3; power = 0.6; }
            else if (own === 'drop') { X = lat ? lat * (COURT.halfW - 1.5) : 0; D = -2.1; power = 0.4; }
            else if (own === 'lob') { X = lat ? lat * (COURT.halfW - 1.6) : 0; D = -(COURT.halfLen - 1.7); power = 0.55; }
            else if (deep) D = -(COURT.halfLen - Math.max(1.3, this.safe[1] + 0.8));
            this.aim.X = X; this.aim.D = D;
            // (how long before this moment Space was pressed: an early press is held and goes now, as it always has, but only one
            // pressed on the moment is Perfect - sim.js, the Perfect shot)
            const st = m.release(i, { kind, tx: X * s, tz: D * s, power, merciful: true, tcAt: planned != null ? planned : undefined, spot: planned != null && plan && plan.S ? { x: plan.S.x, z: plan.S.z } : undefined, pressLead: this.pressAt != null ? Math.max(0, m.t - this.pressAt) : 0, pressAt: this.pressAt != null && m.t - this.pressAt < 1.7 ? this.pressAt : m.t });
            this.choice = null;
            this.kind = kind; this.buf = -9; if (st) this.lastSwing = { t: m.t, timing: st.timing };
          }
        }
      } else this.buf = -9;
      return;
    }
  }
}
