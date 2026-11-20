# The walk between points, from footage of the players themselves: court-level video of tour players walking back to
# the line, tracked with track.py --big, cut into strides and made into the one looping cycle js/figure.js plays when a
# player strolls (the clip `walk` in js/locodata.js).
#
#   python -I walk_footage.py manifest.json out.json
#
# manifest.json: [{ "player": "Djokovic", "track": ".../x.npz", "t0": 31.2, "t1": 35.0, "hand": "R", "src": "..." }, ...]
# one entry per stretch of steady walking (the video's own seconds; real-time footage, not slow motion), found with walk_find.py.
# The manifest used for the game's walk (2026-11-20) is ~/.cache/rally-alts-work/walk/manifest.json; the footage is listed in NOTES.md.
#
# For each stretch: MediaPipe's 3D body, every bone held to its median length and scaled to a 1.85 m man (as in
# player_motion.py), turned into the body's own frame (x to his right, y up, z the way he walks, read from his feet; the
# point under the hips at the origin), cut at each left heel strike (the left ankle furthest ahead of the hips) into strides, and each
# stride resampled to the same number of frames. A left-hander's stride is mirrored so the racket is always in the
# right hand. The cycle is the per-frame median of all the strides that agree, smoothed as the periodic thing it is (a
# few harmonics), every bone put back to its length, and set on the ground: the lower foot's sole on the court.
# The speed is what the stance foot says: while a foot is down the body passes over it, so its speed backward under the
# hips is the walking speed.
import sys, os, json, math, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from player_motion import from_mp, solve, bone_lengths, unswap, BONES, JI, JOINTS, HT, CHAIN

N = 70                       # frames in the cycle (played at 60 a second at the filmed speed, then sped or slowed by the game)
VMIN, VMAX = 0.7, 1.6         # m/s: a walk
STEP_W = 0.14                # m, the feet's distance apart across the body as they pass (centre to centre)
FEET = True                  # the heading from the feet (below), not the line through the hips
HARM = 7                     # harmonics kept: a walk's shape is smooth; the tracker's frame-to-frame jitter is not

def mirror(P):
    out = P.copy(); out[..., 0] *= -1
    for j in JOINTS:
        if j[0] == 'l' and ('r' + j[1:]) in JI: a, b = JI[j], JI['r' + j[1:]]; out[..., [a, b], :] = out[..., [b, a], :]
    return out

def body_frame(P, rate):
    """Each frame turned into the body's frame: the hips' heading smoothed over half a second; returns joints about the
    point under the pelvis (y still about the pelvis) and the heading per frame."""
    n = len(P); right = P[:, JI['rhip']] - P[:, JI['lhip']]; right[:, 1] = 0; right /= np.linalg.norm(right, axis=1, keepdims=True) + 1e-9
    fwd = np.stack([-right[:, 2], np.zeros(n), right[:, 0]], 1)
    toes = (P[:, JI['ltoe']] + P[:, JI['rtoe']]) / 2 - (P[:, JI['lankle']] + P[:, JI['rankle']]) / 2; toes[:, 1] = 0
    if np.sum(fwd * toes, 1).mean() < 0: fwd = -fwd
    yaw = np.unwrap(np.arctan2(fwd[:, 0], fwd[:, 2])); w = max(3, int(rate * 0.5)) | 1
    ys = np.convolve(np.pad(yaw, w // 2, mode='edge'), np.ones(w) / w, 'valid')
    if FEET: ys = heading_feet(P, rate)
    out = np.zeros_like(P); c, s = np.cos(ys), np.sin(ys)
    d = P - P[:, :1]
    out[..., 0] = d[..., 0] * c[:, None] - d[..., 2] * s[:, None]; out[..., 1] = d[..., 1]; out[..., 2] = d[..., 0] * s[:, None] + d[..., 2] * c[:, None]
    if not FEET and (out[:, JI['rhip'], 0] - out[:, JI['lhip'], 0]).mean() < 0: out[..., 0] *= -1
    return out, ys

def heading_feet(P, rate):
    """The way he walks, from the feet: about the hips the ankles swing to and fro along it (the long axis of their
    paths over a stride), and a foot moves forward while it is up in the air. The tracker's line through the hips is
    unsure of its depth and turned with it; the feet's to and fro is plain."""
    n = len(P); w = max(4, int(rate * 0.6)); yaw = np.zeros(n)
    A = np.stack([P[:, JI['lankle']] - P[:, :1][:, 0], P[:, JI['rankle']] - P[:, :1][:, 0]], 1)        # ankles about the pelvis
    for f in range(n):
        a, b = max(0, f - w), min(n, f + w + 1); X = A[a:b][:, :, [0, 2]].reshape(-1, 2); X = X - X.mean(0)
        u, sv, vt = np.linalg.svd(X, full_matrices=False); ax = vt[0]
        # signed by the swing: up in the air, a foot travels forward
        sgn = 0.0
        for k in (0, 1):
            y = A[a:b, k, 1]; pz = A[a:b, k][:, [0, 2]] @ ax; v = np.gradient(pz) if len(pz) > 2 else pz * 0
            sgn += np.sum((y - np.median(y)) * v)
        if sgn < 0: ax = -ax
        yaw[f] = math.atan2(ax[0], ax[1])
    yaw = np.unwrap(yaw); k = max(3, int(rate * 0.4)) | 1
    return np.convolve(np.pad(yaw, k // 2, mode='edge'), np.ones(k) / k, 'valid')

def strikes(B):
    z = B[:, JI['lankle'], 2]; zs = np.convolve(np.pad(z, 2, mode='edge'), np.ones(5) / 5, 'valid')
    return [f for f in range(2, len(zs) - 2) if zs[f] >= zs[max(0, f - 6):f + 7].max() - 1e-9 and zs[f] > np.percentile(zs, 60)]

def resample(C, n):
    src = np.linspace(0, 1, len(C)); dst = np.linspace(0, 1, n + 1)[:-1]
    flat = C.reshape(len(C), -1); out = np.stack([np.interp(dst, src, flat[:, k]) for k in range(flat.shape[1])], 1)
    return out.reshape((n,) + C.shape[1:])

def periodic_smooth(C, k):
    F = np.fft.rfft(C, axis=0); F[k + 1:] = 0; return np.fft.irfft(F, n=len(C), axis=0)

def fix_bones(C, L):
    """Every bone to its length, outward from the hips, keeping its direction."""
    out = C.copy()
    for c, p, n in BONES:
        d = C[:, JI[c]] - C[:, JI[p]]; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9; out[:, JI[c]] = out[:, JI[p]] + d * L[n]
    return out

def stretch(e):
    d = np.load(e['track']); sel = np.where((d['t'] >= e['t0']) & (d['t'] <= e['t1']))[0]
    if len(sel) < 20: return None, 'too short'
    if len(set(d['shot'][sel].tolist())) > 1:                       # the longest piece between cuts (and gaps in the tracking)
        runs = np.split(sel, np.where((np.diff(d['shot'][sel]) != 0) | (np.diff(d['t'][sel]) > 0.2))[0] + 1); sel = max(runs, key=len)
        if len(sel) < 20: return None, 'too short between cuts'
    t = d['t'][sel].astype(np.float64); rate = 1 / np.median(np.diff(t))
    xy, W, vis, _ = unswap(d['xy'][sel].astype(np.float64), d['world'][sel].astype(np.float64), d['vis'][sel].astype(np.float64), e.get('hand', 'R'), rate)
    J, _ = from_mp(W); J -= J[:, :1]
    L0 = bone_lengths(J); k = HT * CHAIN / (L0['shank'] + L0['thigh'] + L0['spine'] + L0['headn']); L = {n: v * k for n, v in L0.items()}
    P, _ = solve(J * k, L, rate)
    B, yaw = body_frame(P, rate)
    if e.get('hand', 'R') == 'L': B = mirror(B)
    # the elbow's bend as the picture shows it, side-on frames only (where the arm swings across the picture, not toward the camera),
    # against the 3D estimate's in the same frames: the estimate puts its own guess at depth into the bend
    bend = {}
    hw = np.abs(xy[:, 23, 0] - xy[:, 24, 0]) / (np.linalg.norm(xy[:, 11] - xy[:, 27], axis=1) + 1e-6)
    for sd, (a_, el, w_) in {'l': (11, 13, 15), 'r': (12, 14, 16)}.items():
        ok = (hw < 0.12) & (vis[:, [a_, el, w_]].min(1) > 0.85)
        ang = lambda Q: np.degrees(np.arccos(np.clip(np.sum((Q[ok, el] - Q[ok, a_]) * (Q[ok, w_] - Q[ok, el]), -1) / (np.linalg.norm(Q[ok, el] - Q[ok, a_], axis=-1) * np.linalg.norm(Q[ok, w_] - Q[ok, el], axis=-1) + 1e-9), -1, 1)))
        key = sd if e.get('hand', 'R') == 'R' else ('r' if sd == 'l' else 'l')
        bend[key] = (ang(xy).tolist(), ang(W).tolist()) if ok.sum() else ([], [])
    ev = strikes(B); cyc = []
    for a, b in zip(ev[:-1], ev[1:]):
        dur = (b - a) / rate; turn = abs(math.degrees(yaw[b] - yaw[a]))
        if not (0.8 <= dur <= 1.6) or turn > 30: continue
        C = B[a:b + 1]
        # the stance foot's speed backward under the hips (the left one in its first half, the right in its second)
        zl, zr = C[:, JI['lankle'], 2], C[:, JI['rankle'], 2]; m = len(C)
        vl = -(zl[int(m * 0.1)] - zl[int(m * 0.4)]) / (0.3 * dur); vr = -(zr[int(m * 0.6)] - zr[int(m * 0.9)]) / (0.3 * dur)
        vv = vis[a:b + 1]; va = {'l': float(vv[:, [13, 15]].mean()), 'r': float(vv[:, [14, 16]].mean())}
        if e.get('hand', 'R') == 'L': va = {'l': va['r'], 'r': va['l']}
        cyc.append(dict(C=resample(C[:-1], N), dur=dur, v=-(vl + vr) / 2, turn=turn, va=va))
    return dict(cyc=cyc, L=L, rate=rate, n=len(sel), bend=bend), None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('manifest'); ap.add_argument('out')
    A = ap.parse_args(); man = json.load(open(A.manifest)); allc = []; Ls = []; B2 = {'l': ([], []), 'r': ([], [])}
    for e in man:
        r, why = stretch(e)
        if r is None: print('skip', e.get('player'), e['t0'], why); continue
        print('%-10s %6.2f-%6.2f  %d frames at %.0f/s  %d strides  %s' % (e['player'], e['t0'], e['t1'], r['n'], r['rate'], len(r['cyc']),
              ' '.join('%.2fs %.2fm/s' % (c['dur'], c['v']) for c in r['cyc'])))
        for c in r['cyc']: c['player'] = e['player']; allc.append(c)
        Ls.append(r['L'])
        for sd in 'lr': B2[sd][0].extend(r['bend'][sd][0]); B2[sd][1].extend(r['bend'][sd][1])
    if not allc: raise SystemExit('no strides')
    n0 = len(allc); allc = [c for c in allc if VMIN <= c['v'] <= VMAX]                 # walking pace only: not a jog, not a shuffle on the spot
    print('%d strides at a walking pace (%.1f-%.1f m/s) of %d' % (len(allc), VMIN, VMAX, n0))
    S = np.stack([c['C'] for c in allc]); dur = np.array([c['dur'] for c in allc]); v = np.array([c['v'] for c in allc])
    # the strides that agree: within the middle of the spread, joint by joint
    med = np.median(S, 0); err = np.linalg.norm(S - med, axis=-1).mean((1, 2)); keep = err <= np.percentile(err, 75) + 1e-9
    print('strides %d, kept %d; cycle %.2f s (%.2f-%.2f), speed %.2f m/s (%.2f-%.2f)' % (len(S), keep.sum(), np.median(dur[keep]), dur[keep].min(), dur[keep].max(), np.median(v[keep]), v[keep].min(), v[keep].max()))
    C = np.median(S[keep], 0)
    # each arm from the strides in which the tracker could see it: side-on, the far arm is hidden behind the body and its guessed
    # place was bent up at the waist, which from behind read as a hand on the hip
    for sd in 'lr':
        va = np.array([c['va'][sd] for c in allc]); ok = keep & (va >= np.percentile(va[keep], 50))
        if ok.sum() >= 4:
            for j in (sd + 'elb', sd + 'wri', sd + 'hand'): C[:, JI[j]] = np.median(S[ok][:, :, JI[j]], 0)
        print('%s arm from %d strides (visibility %.2f and up)' % (sd, ok.sum(), np.percentile(va[keep], 50)))
    C = periodic_smooth(C, HARM)
    L = {n: float(np.median([l[n] for l in Ls])) for n in Ls[0]}
    C = fix_bones(C - C[:, :1], L)
    # the shoulders level: the far one, hidden side-on, came out ten centimetres low, a fifteen-degree tilt. Each shoulder (and its
    # arm with it) is moved up or down to the pair's mean height, keeping their small rise and fall in step with the stride.
    sl, sr = JI['lsho'], JI['rsho']; tilt = np.mean(C[:, sr, 1] - C[:, sl, 1])
    for side, sg in (('l', 1), ('r', -1)):
        for j in (side + 'sho', side + 'elb', side + 'wri', side + 'hand'): C[:, JI[j], 1] += sg * tilt / 2
    print('shoulders levelled (right was %+.2f m above left)' % tilt)
    # each elbow bent as much as the picture says, not the 3D estimate: the forearm turned about the elbow in the arm's own plane
    for sd in 'lr':
        if len(B2[sd][0]) < 50: continue
        b2, b3 = float(np.median(B2[sd][0])), float(np.median(B2[sd][1])); k = b2 / max(1.0, b3)
        s_, e_, w_, h_ = JI[sd + 'sho'], JI[sd + 'elb'], JI[sd + 'wri'], JI[sd + 'hand']
        for f in range(len(C)):
            ua = C[f, e_] - C[f, s_]; fa = C[f, w_] - C[f, e_]; lu, lv = np.linalg.norm(ua), np.linalg.norm(fa)
            ca = np.clip(np.dot(ua, fa) / (lu * lv + 1e-9), -1, 1); a0 = math.acos(ca)
            ax = np.cross(ua, fa); la = np.linalg.norm(ax)
            if la < 1e-6: continue
            ax /= la; a1 = a0 * k; un = ua / lu
            # the forearm turned within the arm's plane to make angle a1 with u
            perp = np.cross(ax, un); nv = (un * math.cos(a1) + perp * math.sin(a1)) * lv
            hv = C[f, h_] - C[f, w_]
            C[f, w_] = C[f, e_] + nv; C[f, h_] = C[f, w_] + hv
        print('%s elbow: picture %.0f deg, estimate %.0f deg -> bends scaled by %.2f' % (sd, b2, b3, k))
    # across the body the footage says little: seen side-on, a foot's distance to his left or right is the tracker's guess at depth,
    # and its hips are set wider than the joints are. The legs' sideways places are scaled about the middle so the feet pass
    # STEP_W apart at the ankles (a walker's step width, about 0.1 of his height, centre to centre), the forward and up kept.
    ax = np.abs(C[:, JI['lankle'], 0] - C[:, JI['rankle'], 0]); kx = STEP_W / max(1e-3, float(np.median(ax)))
    for j in ('lhip', 'rhip', 'lknee', 'rknee', 'lankle', 'rankle', 'ltoe', 'rtoe'): C[:, JI[j], 0] *= min(1.0, kx)
    print('legs across scaled by %.2f (step width %.2f m to %.2f)' % (min(1.0, kx), float(np.median(ax)), float(np.median(ax)) * min(1.0, kx)))
    # on the ground: the lower foot's sole on the court (ankle 8.5 cm up, the ball of the foot 2 cm), eased as a periodic curve
    floor = np.minimum(np.minimum(C[:, JI['ltoe'], 1], C[:, JI['rtoe'], 1]) - 0.02, np.minimum(C[:, JI['lankle'], 1], C[:, JI['rankle'], 1]) - 0.085)
    floor = periodic_smooth(floor[:, None], 4)[:, 0]; C[..., 1] -= floor[:, None]
    vel = float(np.median(v[keep])); T = float(np.median(dur[keep]))
    clip = dict(n=N, v=[0.0, round(vel, 3)], fps=round(N / T, 2), J=np.round(C, 3).reshape(N, -1).tolist(), strides=int(keep.sum()), players=sorted(set(c['player'] for c, k in zip(allc, keep) if k)))
    json.dump(clip, open(A.out, 'w'))
    hy = C[:, 0, 1]; ka = lambda s: np.degrees(np.arccos(np.clip(np.sum((C[:, JI[s + 'hip']] - C[:, JI[s + 'knee']]) * (C[:, JI[s + 'ankle']] - C[:, JI[s + 'knee']]), -1) / (np.linalg.norm(C[:, JI[s + 'hip']] - C[:, JI[s + 'knee']], axis=-1) * np.linalg.norm(C[:, JI[s + 'ankle']] - C[:, JI[s + 'knee']], axis=-1)), -1, 1)))
    print('hips %.3f-%.3f m; left knee %.0f-%.0f deg; step width %.2f m; wrists fwd R %.2f..%.2f L %.2f..%.2f' % (hy.min(), hy.max(), ka('l').min(), ka('l').max(),
          np.median(np.abs(C[:, JI['lankle'], 0] - C[:, JI['rankle'], 0])), C[:, JI['rwri'], 2].min(), C[:, JI['rwri'], 2].max(), C[:, JI['lwri'], 2].min(), C[:, JI['lwri'], 2].max()))

if __name__ == '__main__': main()
