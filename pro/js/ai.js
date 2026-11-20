// Rally Pro — the computer player. It reads the incoming ball with the same physics the
// ball obeys, runs to a contact point it can actually reach, and picks a shot from where
// both players are standing. Nothing here is told the outcome: errors come from the
// engine's execution model, so a stretched AI misses for the same reason a human does.
import { COURT, clamp, lerp, netHeightAt, inCourt, inServiceBox, BALL } from './physics.js';
import { TIMING, REACH, serveTarget, WALK_K } from './sim.js';

// Tactical dials. Margins are metres inside the lines; the first of each pair is a cautious
// player, the second an all-out attacker.
export const AIT = {
  atkComfort: 0.5, atkDepth: 12.2, atkRoll: 0.45,
  atkX0: 1.00, atkX1: 0.70, atkD0: 3.0, atkD1: 2.3, atkP0: 0.90, atkP1: 1.0,
  neuX0: 1.7, neuX1: 1.15, neuD0: 3.1, neuD1: 2.1, neuP0: 0.50, neuP1: 0.70,
};

export class AI {
  constructor(o = {}) {
    this.seen = null; this.plan = null; this.reactAt = 0;
    this.recover = null; this.serveDelay = 2; this.swingAt = null;
    this.human = !!o.human;          // drive a human-side player (demo / full assist)
    this.goNet = false;
  }

  update(m, i, dt) {
    const p = m.players[i], s = m.score;
    p.move.x = 0; p.move.z = 0;
    switch (m.phase) {
      case 'between': case 'over': case 'done':
        if (m.phase !== 'between') { this.plan = null; this.seen = null; break; }
        if (p.spot) this.goTo(p, p.spot.x, p.spot.z);
        this.serveDelay = (2.2 + m.rng.u() * 2.5) * m.pace + 0.4; this.intent = null; this.goNet = false;
        break;
      case 'ready':
        if (p.spot) this.goTo(p, p.spot.x, p.spot.z);
        if (s.server === i && m.phaseT > (m.quick ? (m.ritual ? m.ritual.end : 1.3) : Math.max(this.serveDelay, m.ritual ? m.ritual.end : 0))) {
          this.intent = this.planServe(m, i);
          if (m.toss(i)) this.swingAt = m.tossIdeal - TIMING.serveSwing + m.rng.g() * 0.012;
        }
        break;
      case 'toss':
        if (s.server === i && p.stroke && p.stroke.tc == null && m.t >= this.swingAt) {
          m.serveSwing(i, this.intent); p.stroke.auto = true;
        }
        break;
      case 'live': this.rally(m, i); break;
    }
  }

  goTo(p, tx, tz, eps) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < (eps || 0.06)) return;
    const top = p.prof.speed * (p.walk ? WALK_K : 1);
    const v = Math.min(top, Math.sqrt(2 * p.prof.accel * 0.85 * d) + 0.2);
    p.move.x = dx / d * v / top; p.move.z = dz / d * v / top;
  }

  // ---------- serving ----------
  planServe(m, i) {
    const p = m.players[i], prof = p.prof, r = m.rng, first = m.score.serveNum === 1, deuce = m.deuceSide;
    const wb = prof.wideBias;
    let wT = 0.45 - (wb - 0.5) * 0.6, wW = 0.36 + (wb - 0.5) * 0.6, wB = 0.19;
    if (!first) { wT -= 0.08; wW -= 0.10; wB += 0.18; }
    const u = r.u() * (wT + wW + wB);
    const spot = u < wT ? 'T' : u < wT + wW ? 'wide' : 'body';
    let type;
    if (first) {
      // the slider out wide is a right-hander's deuce-court serve and a left-hander's ad-court one
      const sliceWide = spot === 'wide' && (deuce === (p.hs > 0));
      type = r.u() < (sliceWide ? 0.55 : 0.14) ? 'slice' : 'flat';
    } else type = r.u() < 0.84 ? 'kick' : 'slice';
    // big servers paint the lines on a first serve; everyone keeps the second well inside
    const tg = serveTarget(p.sgn, deuce, spot, first ? lerp(0.62, 0.36, prof.aceAim == null ? 0.4 : prof.aceAim) : 0.95);
    this.goNet = r.u() < prof.sv * (first ? 1 : 0.35);
    p.approach = this.goNet;
    return { tx: tg.x, tz: tg.z, type, spot, pace: 1 };
  }

  // ---------- rallying ----------
  rally(m, i) {
    const p = m.players[i], b = m.ball, opp = m.players[1 - i];
    if (!b.live) return;
    if (b.lastHit === i) {
      // my ball is on its way: get back to where the reply is likeliest
      this.plan = null;
      if (this.seen !== m.incoming) { this.seen = m.incoming; this.recover = this.recoverSpot(m, i); }
      // coming in behind a serve or an approach: close until he is about to hit, then split step and hold
      const inc0 = m.incoming, landed = inc0 && inc0.land ? m.t > inc0.t0 + inc0.land.t - 0.08 : false;
      if ((this.goNet || p.approach) && landed) { m.splitStep(i); return; }
      if (this.recover) this.goTo(p, this.recover.x, this.recover.z, 0.15);
      return;
    }
    const inc = m.incoming; if (!inc) return;
    if (this.seen !== inc) {
      this.seen = inc; this.plan = null;
      // a swing booked for the old flight (a net cord, say) is no longer the right swing
      if (p.stroke && p.stroke.auto && !p.stroke.done) p.stroke = null;
      const serve = b.isServe;
      const sp = b.lastSpeed || 30;
      // a faster ball is read later; returners guess a little on a big first serve
      this.reactAt = m.t + p.prof.react * (serve ? lerp(0.92, 1.22, clamp((sp - 45) / 15, 0, 1)) : 1) * (0.85 + m.rng.u() * 0.3);
      // A drop shot starts out looking like the drive it is not, and is read that much later: some at once (he half expected
      // it), some only as the ball floats over the net, the best hands hiding it longest. Read like any other ball, a drop
      // shot from the baseline came back 84% of the time; on the tour (Match Charting Project, 41,400 of them since 2015)
      // about half do, a third are winners or force the error, and the rest are the dropper's own misses.
      if (!serve && (globalThis.__dropRead ?? 0.12) > 0 && m.contactInfo && m.contactInfo.kind === 'drop' && m.contactInfo.who !== i) {
        const dt0 = globalThis.__dropRead ?? 0.12, by = m.players[m.contactInfo.who].prof;
        this.reactAt += dt0 * (0.2 + 1.6 * m.rng.u()) * lerp(0.75, 1.25, clamp(by.touch ?? 0.5, 0, 1));
      }
      m.splitStep(i);
    }
    if (!this.plan) {
      if (m.t < this.reactAt) { if (this.recover && !b.isServe) this.goTo(p, this.recover.x, this.recover.z, 0.2); return; }
      this.plan = this.makePlan(m, i, null);
      if (!this.plan.leave) m.burst(i, this.plan.S.x - p.x, this.plan.S.z - p.z);
    }
    const pl = this.plan;
    if (pl.leave) return;
    // the bounce is where prediction and reality part company on clay and grass
    if (!pl.rebuilt && inc.bounced && !pl.pre) this.refine(m, i, pl);
    const q = this.plan;
    this.goTo(p, q.S.x, q.S.z, 0.05);
    if (q.hit && !p.stroke && m.t >= q.tc - TIMING.prep) {
      if (!q.intent) { q.intent = this.decide(m, i, q); q.intent.state = q.state || 'neutral'; q.intent.slack = q.slack; }
      m.schedule(i, q.wing, q.intent.kind, q.tc, q.intent);
      p.stroke.bad = q.bad || 0; p.stroke.cp = q.cp;
    } else if (q.hit && p.stroke && p.stroke.auto && !p.stroke.done && !q.intent2 && m.t >= q.tc - 0.2) {
      // last look at the opponent before committing direction
      q.intent2 = true;
    }
  }

  // For a human-controlled player: where the coach would stand, with no reaction delay.
  track(m, i) {
    const inc = m.incoming, b = m.ball;
    if (!b.live || b.lastHit === i || !inc) { this.cplan = null; this.cseen = null; return null; }
    if (this.cseen !== inc) { this.cseen = inc; this.cplan = this.makePlan(m, i, null); }
    else if (this.cplan && !this.cplan.leave && !this.cplan.rebuilt && inc.bounced && !this.cplan.pre) this.refine(m, i, this.cplan);
    return this.cplan;
  }

  // After the bounce, look again: same moment, wherever the ball has actually gone.
  refine(m, i, pl) {
    const p = m.players[i], inc = m.incoming, path = inc.path, sgn = p.sgn;
    pl.rebuilt = true;
    let best = -1, bd = 1e9;
    for (let k = 0; k + 3 < path.length; k += 4) { const d = Math.abs(inc.t0 + path[k + 3] - pl.tc); if (d < bd) { bd = d; best = k; } }
    if (best < 0 || bd > 0.05) return;
    const bx = path[best], by = path[best + 1], bz = path[best + 2];
    const dev = Math.hypot(bx - pl.cp.x, by - pl.cp.y, bz - pl.cp.z);
    pl.S.x += bx - pl.cp.x; pl.S.z += bz - pl.cp.z;
    pl.cp.x = bx; pl.cp.y = by; pl.cp.z = bz;
    pl.bad = clamp((dev - 0.05) * 1.4, 0, 0.9);
    const st = p.stroke; if (st && st.auto && !st.done) st.bad = pl.bad;
  }

  // Walk the predicted path and find the best place to meet the ball.
  makePlan(m, i, keepWing) {
    const p = m.players[i], prof = p.prof, b = m.ball, inc = m.incoming, sgn = p.sgn, hs = p.hs, path = inc.path;
    // a ball that will not clear the net, or is plainly going out, is left alone
    if (inc.netY != null && !inc.bounced && inc.from !== i) {
      if (inc.netY - BALL.r < netHeightAt(0) - 0.03 && b.z * sgn < 0) return { leave: true };
    }
    const land = inc.land;
    let callOut = false;
    if (land && !inc.bounced && b.bounces === 0) {
      const side = sgn;
      const good = b.isServe ? inServiceBox(land.x, land.z, side, m.deuceSide ? side > 0 : side < 0) : inCourt(land.x, land.z, side);
      if (!good) {
        const over = b.isServe ? 0.12 : Math.max(Math.abs(land.x) - COURT.halfW, land.z * sgn - COURT.halfLen, -land.z * sgn);
        if (over > 0.10 + (1 - prof.cons) * 0.12) callOut = true;
      }
    }
    const myD = p.z * sgn, vmax = prof.speed, a = prof.accel;
    // ground covered in t seconds from a split step: a head start, then acceleration to top speed
    const v0 = Math.min(vmax, Math.hypot(p.vx, p.vz) * 0.5 + (p.burstOK ? 2.0 : 0));
    const tTop = (vmax - v0) / a, dTop = v0 * tTop + 0.5 * a * tTop * tTop;
    const cover = t => t <= 0 ? 0 : t < tTop ? v0 * t + 0.5 * a * t * t : dTop + (t - tTop) * vmax;
    const lunge = REACH.max * (prof.height / 1.85) - REACH.ideal - 0.12;
    const landT = land ? inc.t0 + land.t : -1;
    // a person's legs (the footwork the game does for him) take a ball out of the air whenever he is inside
    // the court and it comes at a height to volley, as the first game did; the computer volleys by its plan
    const eager = !!this.eagerPre && myD < 10.8;
    const allowPre = !b.isServe && !inc.bounced && (myD < 7.2 || p.approach || this.goNet || eager);
    // how high this ball will sit up after it bounces (the top of its bounce, if it is let come to it)
    let peakB = 0; if (landT >= 0) for (let k = 0; k + 3 < path.length; k += 8) if (inc.t0 + path[k + 3] > landT && path[k + 1] > peakB) peakB = path[k + 1];
    let best = null, bestC = 1e9;
    for (let k = 0; k + 3 < path.length; k += 8) {
      const ts = inc.t0 + path[k + 3];
      if (ts < m.t + 0.07) continue;
      const bx = path[k], by = path[k + 1], bz = path[k + 2];
      const D = bz * sgn;
      if (D < 0.5) continue;
      const pre = !inc.bounced && ts < landT;
      if (pre && callOut) continue;
      if (pre) {
        const lobbed = by > 2.0 && by < REACH.jump - 0.15 && D < 10.5 && myD < 11.5;
        if (!allowPre && !lobbed) continue;
        if (by < 0.45 || by > REACH.jump - 0.15) continue;
      } else {
        if (callOut) continue;
        if (by < 0.2 || by > REACH.hi - 0.1) continue;
      }
      // where to stand: the ball a comfortable arm away, a little in front
      const fhX = bx - sgn * hs * REACH.ideal, bhX = bx + sgn * hs * (REACH.ideal - 0.12);
      let wing;
      if (keepWing) wing = keepWing;
      else if (pre && by > 1.95) wing = 'fh';
      else wing = Math.abs(fhX - p.x) - prof.fhBias <= Math.abs(bhX - p.x) ? 'fh' : 'bh';
      const sx = pre && by > 1.95 ? bx - sgn * hs * 0.3 : wing === 'fh' ? fhX : bhX;
      const sz = bz + sgn * (pre ? 0.3 : 0.42);
      const dist = Math.hypot(sx - p.x, sz - p.z);
      const avail = ts - m.t;
      // how far short of the ideal spot he will be when the ball gets there
      const short = dist - cover(avail - (dist > 1 ? 0.08 : 0.02));
      // `slack` is spare time in seconds: positive = set and waiting, negative = arriving late
      const slack = short <= 0 ? Math.min(0.6, -short / vmax) : -short / vmax;
      // rising or falling?
      const vy = k + 9 < path.length ? (path[k + 9] - by) * 15 : -1;
      let hc;
      if (pre) hc = by > 1.95 ? Math.abs(by - 2.45) * 0.5 : eager ? Math.abs(by - 1.3) * 0.4 - 0.25 + (D > 9.8 ? 0.5 : 0) : Math.abs(by - 1.15) * 0.7 + (D > 6.5 ? 0.6 : 0);
      // a person's legs set him to take the ball near the top of its bounce, where he can hit through it;
      // the computer lets it drop to the waist as its plan prefers
      // Anywhere from the knee to the shoulder a pro hits through the ball; he does not back off a high one and wait for it
      // to drop to his waist (that was the old cost, centred on 0.95 m: every high ball was let fall a metre, and nothing was
      // ever struck above 1.35 m). Inside his comfortable band a ball costs nothing for its height, and the sooner it is met
      // the better (more so the more attacking he is), so a ball that sits up is taken near the top of its bounce, early,
      // from inside the court. Above the band it costs more (a one-handed backhand's band ends lower: high to the one-hander
      // is the old weakness), and a passive player still lets a ball still rising come up to him.
      else { const one = wing === 'bh' && prof.oneHandBh, top = this.eagerPre ? 1.55 : one ? 1.22 : lerp(1.38, 1.55, prof.agg), lowB = this.eagerPre ? 0.6 : 0.55;
        // (where in the band: the top of the bounce, or as near it as his band allows: a ball that sits up above it is met
        // at the top of the band, on the way up by an attacker, on the way down by a player who lets the ball come to him)
        const want = clamp(peakB || 1, lowB + 0.3, top);
        hc = (by < lowB ? (lowB - by) * 1.6 : 0) + (by < 0.45 ? (0.45 - by) * 3 : 0) + (by > top ? (by - top) * 1.9 : 0) + Math.abs(by - want) * 0.9
           + (!this.eagerPre && vy > 0.5 ? 0.22 * (1 - prof.agg) : 0); }
      const dc = sz * sgn > 13.4 ? (sz * sgn - 13.4) * 0.6 : 0;
      let c = short <= 0.05 ? hc + dc + avail * lerp(0.08, 0.3, prof.agg) : 4 + short * 3 + hc * 0.3;
      if (c < bestC) { bestC = c; best = { tc: ts, cp: { x: bx, y: by, z: bz }, wing, S: { x: sx, z: sz }, slack, short, pre, vy, dist }; }
    }
    if (!best) return { leave: true };
    best.hit = best.short < lunge;
    return best;
  }

  // What to hit, from where everyone is standing. Works in "my frame": X to my right as I
  // face the net, D positive on my side — so the same code plays both ends.
  decide(m, i, pl) {
    const p = m.players[i], prof = p.prof, opp = m.players[1 - i], r = m.rng, sgn = p.sgn, b = m.ball;
    const cX = pl.cp.x * sgn, cD = pl.cp.z * sgn, h = pl.cp.y;
    const oX = opp.x * sgn, oD = opp.z * sgn;
    const HW = COURT.halfW, HL = COURT.halfLen;
    const comfort = clamp(pl.slack / 0.28, 0, 1);
    const oppAtNet = oD > -6.8, meAtNet = pl.pre || cD < 6.0;
    const cross = -(Math.sign(cX) || (r.u() < 0.5 ? 1 : -1));
    const open = Math.abs(oX) > 0.8 ? -Math.sign(oX) : cross;
    const oppBh = opp.hs;                               // X sign of the opponent's backhand wing
    const agg = prof.agg;
    const T = (X, D, kind, power) => ({ kind, power, tx: X * sgn, tz: D * sgn });
    let goNet = this.goNet;

    // ---- at the net ----
    if (meAtNet) {
      pl.state = 'net';
      if (pl.pre && h > 1.95) return T(open * (HW - 1.5), -(HL - r.range(3.5, 5.5)), 'smash', 0.9);
      if (r.u() < 0.14 * prof.touch + (oD < -HL - 1 ? 0.12 : 0)) return T(open * (HW - 1.5), -r.range(1.6, 2.6), 'drop', 0.4);
      return T(open * (HW - r.range(1.1, 1.7)), -(HL - r.range(1.8, 4.0)), pl.pre ? 'volley' : 'drive', pl.pre ? 0.62 : 0.6);
    }
    // ---- returning serve ----
    if (b.isServe) {
      pl.state = 'return';
      const first = m.score.serveNum === 1;
      const sp = b.lastSpeed * 3.6;
      if (first && sp > 175) {
        // get it back deep through the middle or cross; chip it if stretched
        const X = r.u() < 0.55 ? r.range(-1.2, 1.2) : cross * (HW - 2.0);
        return T(X, -(HL - r.range(2.2, 3.4)), comfort < 0.25 && pl.wing === 'bh' ? 'slice' : 'drive', lerp(0.3, 0.5, prof.ret));
      }
      const dir = r.u() < 0.6 ? cross : r.u() < 0.5 ? 0 : -cross;
      return T(dir * (HW - lerp(1.9, 1.3, agg)), -(HL - r.range(1.9, 3.0)), 'drive', lerp(0.5, 0.72, prof.ret * 0.6 + agg * 0.4));
    }
    // the computer reads the court: a man pulled out wide or pushed deep is there to be beaten, and it goes for it
    // (the player's own shots come through here too, as his game chooses them, without these sharper reads)
    const cpu = !this.eagerPre, oOut = Math.max(0, Math.abs(oX) - 1.3) + Math.max(0, -oD - (HL + 2.2)) * 0.6;
    let state = 'neutral';
    if (pl.slack < 0.03 || cD > 14.4 || h < 0.36) state = 'defend';
    else if (comfort > (cpu ? 0.32 : AIT.atkComfort) && (cD < AIT.atkDepth || (cpu && oOut > 0.7 && cD < 13.2) || (h > 0.8 && h < 1.7 && cD < 12.8 && r.u() < (h > 1.2 && cD < 12.2 ? 0.25 : 0) + (cpu ? 0.62 : AIT.atkRoll) + agg * 0.45 + Math.max(0, m.rally - 5) * 0.045))) state = 'attack';
    pl.state = state;

    // ---- he is at the net: pass or lob ----
    if (oppAtNet) {
      pl.state = 'pass';
      const lobP = state === 'defend' ? 0.5 : (oD > -4.2 ? 0.22 : 0.10);
      if (r.u() < lobP) return T(cross * r.range(1.0, 2.6), -(HL - r.range(1.2, 2.2)), 'lob', state === 'defend' ? 0.7 : 0.45);
      const dir = r.u() < 0.56 ? open : -open;
      return T(dir * (HW - r.range(0.75, 1.2)), -(HL - r.range(2.6, 5.8)), 'drive', state === 'defend' ? 0.5 : 0.82);
    }
    if (state === 'defend') {
      const X = r.u() < 0.65 ? cross * (HW - r.range(1.9, 2.6)) : r.range(-1, 1);
      if (pl.wing === 'bh' && r.u() < 0.35 + prof.slice * 1.6) return T(X, -(HL - r.range(2.2, 3.2)), 'slice', 0.45);
      return T(X, -(HL - r.range(2.0, 3.0)), 'loop', 0.4);
    }
    if (state === 'attack') {
      // the drop shot, when he is camped behind the baseline
      if (oD < -(HL + 0.9) && cD < 11.6 && r.u() < prof.drop * (cpu ? 6.5 : 3.2) + (cpu && oD < -(HL + 2.2) ? 0.08 : 0))
        return T(open * (HW - r.range(1.2, 1.8)), -r.range(1.5, 2.7), 'drop', 0.4);
      // the short angle crosscourt, from inside the court: it lands near the side line in front of the service line and
      // goes off the court, dragging him with it
      if (cpu && cD < 11.4 && Math.abs(cX) > 0.6 && r.u() < 0.18 + agg * 0.2)
        return T(-Math.sign(cX) * (HW - r.range(0.45, 0.8)), -r.range(4.6, 6.2), 'drive', 0.62);
      // into the open court, almost always when he is out of position
      const dir = r.u() < (cpu ? 0.72 + Math.min(0.24, oOut * 0.2) : 0.72) ? open : -open;
      const short = cD < 8.8;
      if (!goNet && cD < 10.2 && r.u() < prof.net * (cpu ? 3.2 : 2.0) + (cD < 7.5 ? 0.45 : 0) + (cpu && short ? 0.2 : 0)) goNet = true;
      this.goNet = goNet; p.approach = goNet;
      const mX = lerp(AIT.atkX0, AIT.atkX1, agg) * (cpu ? 0.82 : 1) + r.range(-0.1, 0.2), mD = short ? r.range(2.4, 4.6) : lerp(AIT.atkD0, AIT.atkD1, agg) + r.range(-0.2, 0.4);
      const kind = goNet && pl.wing === 'bh' && r.u() < prof.slice * 2 ? 'slice' : r.u() < prof.flat * (cpu ? 1.4 : 1) ? 'flat' : 'drive';
      return T(dir * (HW - mX), -(HL - mD), kind, Math.min(1, lerp(AIT.atkP0, AIT.atkP1, agg) + (cpu ? 0.06 : 0)));
    }
    // ---- neutral: build the point ----
    const u = r.u();
    let X;
    // building the point: a man out of position is moved again, into the space he has left
    if (cpu && oOut > 0.4 && r.u() < 0.7) X = open * (HW - (lerp(AIT.neuX0, AIT.neuX1, agg) * 0.85 + r.range(-0.1, 0.3)));
    else if (u < 0.60) X = cross * (HW - (lerp(AIT.neuX0, AIT.neuX1, agg) + r.range(-0.15, 0.4)));
    else if (u < 0.80) X = r.u() < 0.6 ? oppBh * r.range(0.3, 1.6) : r.range(-1.2, 1.2);
    else X = -cross * (HW - (lerp(AIT.neuX0, AIT.neuX1, agg) + r.range(0, 0.4)));
    const D = -(HL - (lerp(AIT.neuD0, AIT.neuD1, agg) + r.range(-0.4, 0.7)));
    if (pl.wing === 'bh' && r.u() < prof.slice) return T(X * 0.9, D, 'slice', 0.55);
    // a ball sitting up at the shoulders: an aggressive player, set in time, takes it on and drives it; others loop it back
    if (h > 1.5) { if (h < 1.85 && pl.slack > 0.08 && r.u() < agg * 0.9) return T(X * 1.05, D, 'drive', lerp(0.72, 0.9, agg)); return T(X, D, 'loop', 0.6); }
    return T(X, D, 'drive', lerp(AIT.neuP0, AIT.neuP1, agg) + r.range(-0.05, 0.08));
  }

  recoverSpot(m, i) {
    const p = m.players[i], prof = p.prof, sgn = p.sgn, inc = m.incoming, surf = m.env.surf.key;
    const Xl = inc && inc.land ? inc.land.x * sgn : 0, Dl = inc && inc.land ? inc.land.z * sgn : -9;
    if (this.goNet || p.approach) {
      p.atNet = true;
      // close behind the ball and shade toward the line it can be passed down
      return { x: clamp(Xl * 0.42, -2.4, 2.4) * sgn, z: sgn * lerp(4.6, 3.0, clamp((p.z * sgn < 7 ? 1 : 0), 0, 1)) };
    }
    const base = COURT.halfLen + (surf === 'clay' ? 1.7 : surf === 'grass' ? 0.8 : 1.15) - prof.agg * 0.5;
    // a drop shot of mine pulls him in, so I step up too
    const up = Dl > -4 ? 1.2 : 0;
    return { x: clamp(-0.18 * Xl, -1.2, 1.2) * sgn, z: sgn * (base - up) };
  }
}
