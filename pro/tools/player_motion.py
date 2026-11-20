# Each player's own strokes as full-body 3D clips, from footage in which he is large in the
# picture (court-level cameras, slow-motion replays), tracked with track.py --big.
#
#   python -I player_motion.py manifest.json out.json [--js playermotion.js] [--sheets dir] [--only Federer,Nadal]
#
# manifest.json lists single strokes, one per entry:
#   { "player": "Nadal", "stroke": "serve", "video": ".../clip1.mp4", "track": ".../x.npz", "t0": 64.3, "t1": 65.95,
#     "hand": "L", "slow": 1, "psi": 90, "contact": 65.56, "src": "clip1 1:05 court-level side" }
# ("peak" may stand in for "contact": the moment the hitting wrist is fastest, from which contact is reckoned)
# t0-t1 is the stretch of the video (its own seconds) that holds the stroke; slow is how many times
# slower than life the video runs; psi is the direction of the net in the picture, in degrees,
# turning from "straight away from the camera" (0, the camera is behind him) toward "to the right
# of the picture" (90, the camera is at his side with the net on the right); 180 is a camera in
# front. psi and contact are worked out when left out.
#
# What is taken from the tracker: MediaPipe's 3D estimate of the body about the hips, for the
# shape of the body; and the joints in the picture, for where the hips travel, how high they are
# above the ground, and when each foot is down. Bones are held at their median length so limbs
# do not stretch; smoothing is light and lighter still on the hands. Nothing is averaged over
# many strokes: a clip is one stroke, or the per-frame median of the few that agree.
#
# A clip: fps 60; u0 = seconds from contact at frame 0; J[joint] = x,y,z per frame, metres for a
# 1.85 m man, x to his right, y up from the ground, z toward the net, about the point on the
# ground under his hips at contact; root = x,z of the hips over the ground per frame; yaw = which
# way the hips face (0 toward the net, positive toward his right); plant = left,right foot down.
#
# A manifest may also pair two cameras of the same stroke: "fuse": [{"player", "stroke", "primary": id, "secondary": id,
# "axis": "x" | "z" | "tri", "ok", "why"}] (see fuse()). Once a clip is in the game, its racket in the take-back is the
# shared keys' racket carried by the tracked forearm; where that differs from the footage, tools/racket_ovr.py works
# out the key directions (RACKET_OVR in js/figure.js) that put it right.
import sys, os, json, math, argparse
import numpy as np

JOINTS = ['pelvis', 'lhip', 'rhip', 'lknee', 'rknee', 'lankle', 'rankle', 'ltoe', 'rtoe', 'neck', 'head', 'lsho', 'rsho', 'lelb', 'relb', 'lwri', 'rwri', 'lhand', 'rhand']
JI = {n: i for i, n in enumerate(JOINTS)}
# bones, parent before child: (child, parent, name of its length)
BONES = [('lhip', 'pelvis', 'hip'), ('rhip', 'pelvis', 'hip'), ('lknee', 'lhip', 'thigh'), ('rknee', 'rhip', 'thigh'), ('lankle', 'lknee', 'shank'), ('rankle', 'rknee', 'shank'),
         ('ltoe', 'lankle', 'foot'), ('rtoe', 'rankle', 'foot'), ('neck', 'pelvis', 'spine'), ('head', 'neck', 'headn'), ('lsho', 'neck', 'clav'), ('rsho', 'neck', 'clav'),
         ('lelb', 'lsho', 'upper'), ('relb', 'rsho', 'upper'), ('lwri', 'lelb', 'fore'), ('rwri', 'relb', 'fore'), ('lhand', 'lwri', 'palm'), ('rhand', 'rwri', 'palm')]
HT = 1.85; CHAIN = 0.895             # ankle to ear along the bones, as a share of standing height
FPS = 60
WIN = {'serve': (-1.6, 0.9), 'overhead': (-1.0, 0.8)}; WIN_DEFAULT = (-1.1, 0.95)

def from_mp(w):
    """MediaPipe's 33 points (x right, y down, z away) -> the nineteen joints, x right, y up, z away from the camera."""
    p = np.stack([w[..., 0], -w[..., 1], w[..., 2]], -1); mid = lambda a, b: (p[:, a] + p[:, b]) / 2
    ball = lambda toe, heel: 0.75 * p[:, toe] + 0.25 * p[:, heel]
    J = [mid(23, 24), p[:, 23], p[:, 24], p[:, 25], p[:, 26], p[:, 27], p[:, 28], ball(31, 29), ball(32, 30), mid(11, 12), mid(7, 8), p[:, 11], p[:, 12], p[:, 13], p[:, 14], p[:, 15], p[:, 16], mid(17, 19), mid(18, 20)]
    return np.stack(J, 1), np.stack([p[:, 29], p[:, 30], p[:, 31], p[:, 32]], 1)        # and heels, toe tips

def savgol(a, win, order=2):
    """Savitzky-Golay smoothing along the first axis: keeps peaks that a moving average would flatten."""
    win = int(win) | 1
    if win < 5 or len(a) < win: return a.copy()
    h = win // 2; x = np.arange(-h, h + 1); c = np.linalg.pinv(np.vander(x, order + 1, increasing=True))[0]
    pad = np.concatenate([a[h:0:-1] * 0 + a[:1] * 2 - a[h:0:-1], a, a[-1:] * 2 - a[-2:-h - 2:-1]], 0)
    return np.stack([np.tensordot(c, pad[i:i + win], axes=(0, 0)) for i in range(len(a))], 0)

def bone_lengths(J):
    """Median length of every bone in the tracker's 3D estimate, left and right taken together."""
    L = {}
    for c, p, n in BONES: L.setdefault(n, []).append(np.linalg.norm(J[:, JI[c]] - J[:, JI[p]], axis=1))
    return {n: float(np.median(np.concatenate(v))) for n, v in L.items()}

def medfilt(a, k):
    h = k // 2; return np.stack([np.median(a[max(0, i - h):i + h + 1], axis=0) for i in range(len(a))], 0)

def solve(J, L, rate):
    """The pose re-solved so that no bone stretches. Across the picture the tracker is steady and is smoothed
    only lightly; its depth jumps about from frame to frame and is smoothed harder (about a tenth of a second
    of real time) before it is used. Each bone then keeps its direction and takes its fixed length, outward
    from the hips."""
    wxy, wz = max(5, int(round(0.04 * rate)) | 1), max(7, int(round(0.10 * rate)) | 1)
    S = np.concatenate([savgol(medfilt(J[..., :2], 3), wxy), savgol(medfilt(J[..., 2:], 5), wz)], -1); out = np.zeros_like(J)
    for c, p, n in BONES:
        d = S[:, JI[c]] - S[:, JI[p]]; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9; out[:, JI[c]] = out[:, JI[p]] + d * L[n]
    return out, S

ARM_L, ARM_R = [13, 15, 17, 19, 21], [14, 16, 18, 20, 22]; LEG_L, LEG_R = [25, 27, 29, 31], [26, 28, 30, 32]
def unswap(xy, W, vis, hand, rate):
    """Seen from the side, as the hitting arm swings through in front of the body the tracker is apt for a moment
    to give it the other arm's name and to guess the hitting arm somewhere against the chest. That shows as
    the hitting wrist jumping away and, within a quarter of a second, jumping back, while the other wrist
    carries on along its path. Only then, and only for those frames, are the two arms' names exchanged."""
    xy = xy.copy(); W = W.copy(); vis = vis.copy(); n = len(xy); size = np.median(np.linalg.norm(xy[:, 11] - xy[:, 27], axis=1)) + 1e-9; total = 0
    hit, oth = (16, 15) if hand == 'R' else (15, 16); p, q = xy[:, hit] / size, xy[:, oth] / size
    acc = lambda a: np.concatenate([[0, 0], np.linalg.norm(a[2:] - 2 * a[1:-1] + a[:-2], axis=1)])
    a = acc(p); tau = max(0.04, 400.0 / rate ** 2 / 1.4, 6 * float(np.median(a)))      # more than a hand can do between two frames
    jumps = np.where(a > tau)[0]; span = int(0.25 * rate) + 2; i = 0
    while i < len(jumps):
        t1 = int(jumps[i]); later = jumps[(jumps > t1 + 3) & (jumps <= t1 + span)]
        if len(later):
            t2 = int(later[0]); mix = p.copy(); mix[t1 - 1:t2 - 1] = q[t1 - 1:t2 - 1]; lo, hi = max(2, t1 - 2), min(n, t2 + 3)
            if acc(mix)[lo:hi].max() < 0.4 * a[lo:hi].max():
                sl = slice(t1 - 1, t2 - 1); xy[sl][:, ARM_L + ARM_R] = xy[sl][:, ARM_R + ARM_L]; W[sl][:, ARM_L + ARM_R] = W[sl][:, ARM_R + ARM_L]; vis[sl][:, ARM_L + ARM_R] = vis[sl][:, ARM_R + ARM_L]; total += t2 - t1
                i = int(np.searchsorted(jumps, t2 + 3)); continue
        i += 1
    return xy, W, vis, total

def lift_arms(P, S, L, vis, u, kind, hand, two, psi):
    """Depth of the arms for a groundstroke, from what a body can do rather than from the tracker's guess.
    Seen from the side the tracker flattens depth and, worse, guesses the arm that is hidden behind the body
    somewhere out beyond it. So for each arm bone only where it lies across the picture is kept; how far it
    leans toward or away from the camera follows from its fixed length (a wrist cannot be further from the
    shoulder than the arm is long), and which way it leans is chosen over the whole stroke at once from: the
    tracker's own depth where the joint is in view; no jumps; and what is always true of the stroke - the
    hands are together on the racket in the turn of a forehand and all through a two-hander, the free arm of a
    forehand is folded against the chest by contact and stays there, the hitting hand meets the ball in front,
    and a hand out of sight is behind the body, not out beyond it."""
    out = P.copy(); n = len(P); cs, sn = math.cos(psi), math.sin(psi); net = np.array([sn, 0.0, cs]); right = np.array([cs, 0.0, -sn])
    H, O = ('r', 'l') if hand == 'R' else ('l', 'r'); VI = {'lsho': 11, 'rsho': 12, 'lelb': 13, 'relb': 14, 'lwri': 15, 'rwri': 16}
    def solve_arm(side, prior):
        sh, el, wr, hd = JI[side + 'sho'], JI[side + 'elb'], JI[side + 'wri'], JI[side + 'hand']; Lu, Lf = L['upper'], L['fore']; cand = np.zeros((n, 4, 2, 3)); un = np.zeros((n, 4))
        ve, vw = vis[:, VI[side + 'elb']], vis[:, VI[side + 'wri']]
        for t in range(n):
            s3 = out[t, sh]; d1 = S[t, el, :2] - S[t, sh, :2]; l1 = np.linalg.norm(d1) + 1e-9
            if l1 > Lu: d1 *= Lu / l1; l1 = Lu
            d2 = S[t, wr, :2] - S[t, el, :2]; l2 = np.linalg.norm(d2) + 1e-9
            if l2 > Lf: d2 *= Lf / l2; l2 = Lf
            z1, z2 = math.sqrt(max(0.0, Lu * Lu - l1 * l1)), math.sqrt(max(0.0, Lf * Lf - l2 * l2)); m1 = (S[t, el, 2] - S[t, sh, 2]) / Lu; m2 = (S[t, wr, 2] - S[t, el, 2]) / Lf
            for k, (a1, a2) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
                e3 = np.array([s3[0] + d1[0], s3[1] + d1[1], s3[2] + a1 * z1]); w3 = np.array([e3[0] + d2[0], e3[1] + d2[1], e3[2] + a2 * z2]); cand[t, k] = [e3, w3]
                c = 1.5 * ve[t] * max(0.0, -a1 * m1) * z1 / Lu + 1.5 * vw[t] * max(0.0, -a2 * m2) * z2 / Lf                   # the tracker's own lean, as far as the joint is seen
                c += (1 - vw[t]) * 1.5 * max(0.0, abs((w3 - out[t, JI['neck']]) @ right) - 0.40)                         # out of sight is behind the body, not out beyond it
                un[t, k] = c + prior(t, e3, w3)
        cost = un[0].copy(); back = np.zeros((n, 4), int)
        for t in range(1, n):
            new = np.zeros(4)
            for k in range(4):
                tr = cost + 40 * np.sum((cand[t, k][None] - cand[t - 1]) ** 2, axis=(1, 2)); back[t, k] = int(np.argmin(tr)); new[k] = tr[back[t, k]] + un[t, k]
            cost = new
        k = int(np.argmin(cost)); path = np.zeros(n, int)
        for t in range(n - 1, -1, -1): path[t] = k; k = back[t, k]
        pe = np.array([cand[t, path[t], 0] for t in range(n)]); pw = np.array([cand[t, path[t], 1] for t in range(n)])
        pe[:, 2] = savgol(pe[:, 2], 5); pw[:, 2] = savgol(pw[:, 2], 5); palm = P[:, hd] - P[:, wr]; out[:, el] = pe; out[:, wr] = pw; out[:, hd] = pw + palm
    def prior_hit(t, e3, w3):
        c = 0.0; s3 = out[t, JI[H + 'sho']]
        if -0.04 <= u[t] <= 0.05: c += 4 * max(0.0, 0.15 - (w3 - s3) @ net)                                                   # the ball is met in front
        return c
    if two:
        # a two-hander: whichever arm the camera sees is followed; the other, hidden behind the body, is put on the grip
        # beside it (a hand's width toward its own side) with its elbow bent down and out, its bones at their lengths
        vh, vo = vis[:, VI[H + 'wri']].mean(), vis[:, VI[O + 'wri']].mean(); seen, hid = (H, O) if vh >= vo else (O, H)
        def prior_seen(t, e3, w3):
            c = 0.0; s3 = out[t, JI[seen + 'sho']]
            if -0.04 <= u[t] <= 0.05: c += 4 * max(0.0, 0.15 - (w3 - s3) @ net)
            return c
        solve_arm(seen, prior_seen); solve_arm(hid, lambda t, e3, w3: 0.0)
        sh_s, sh_h = JI[seen + 'sho'], JI[hid + 'sho']; Lu, Lf = L['upper'], L['fore']
        for t in range(n):
            w = float(np.clip(min((u[t] + 0.85) / 0.12, (0.50 - u[t]) / 0.12), 0, 1))
            if w <= 0: continue
            side = out[t, sh_h] - out[t, sh_s]; side /= np.linalg.norm(side) + 1e-9; tgt = out[t, JI[seen + 'wri']] + 0.07 * side
            s3 = out[t, sh_h]; dv = tgt - s3; dd = float(np.clip(np.linalg.norm(dv), 0.2 * (Lu + Lf), 0.995 * (Lu + Lf))); dirv = dv / (np.linalg.norm(dv) + 1e-9); tgt = s3 + dirv * dd
            a_ = (Lu * Lu - Lf * Lf + dd * dd) / (2 * dd); h_ = math.sqrt(max(0.0, Lu * Lu - a_ * a_)); pole = np.array([0.0, -1.0, 0.0]) + 0.4 * side; pole -= (pole @ dirv) * dirv; pole /= np.linalg.norm(pole) + 1e-9
            el = s3 + dirv * a_ + pole * h_
            for j, v in ((JI[hid + 'elb'], el), (JI[hid + 'wri'], tgt), (JI[hid + 'hand'], tgt + (out[t, JI[hid + 'hand']] - out[t, JI[hid + 'wri']]))): out[t, j] = out[t, j] * (1 - w) + v * w
        return out
    solve_arm(H, prior_hit)
    def prior_off(t, e3, w3):
        c = 0.0; hw = out[t, JI[H + 'wri']]; chest = out[t, JI['neck']] + np.array([0, -0.20, 0]) + 0.10 * net
        if two and -0.7 <= u[t] <= 0.3: c += 4 * max(0.0, np.linalg.norm(w3 - hw) - 0.16)                                    # both hands on the grip
        if kind == 'fh':
            if u[t] < -0.5: c += 2 * max(0.0, np.linalg.norm(w3 - hw) - 0.40)                                               # the free hand cradles the racket through the turn
            if -0.6 <= u[t] <= -0.12: c += 6 * max(0.0, -0.05 - (w3 - out[t, JI['neck']]) @ right * (1 if hand == 'R' else -1))   # then reaches across toward the hitting side, never out to the other
            if u[t] > -0.12: c += 3 * max(0.0, np.linalg.norm(w3 - chest) - 0.32)                                           # and is folded in against the chest by contact
        return c
    solve_arm(O, prior_off)
    return out

def reconstruct(d, e, lengths=None):
    """One stroke from a track: returns the clip on its own clock (seconds of real time from contact) before resampling."""
    slow = float(e.get('slow', 1)); sel = np.where((d['t'] >= e['t0']) & (d['t'] <= e['t1']))[0]
    if len(sel) < 12: return None
    # one unbroken shot only: the longest run without a cut
    # ...and one unbroken hold on the same man: where the tracked figure jumps or changes size it has let go of him and found someone else
    q = d['xy'][sel].astype(np.float64); sg = lambda a, b: np.linalg.norm(q[:, a] - q[:, b], axis=1); hipc = (q[:, 23] + q[:, 24]) / 2
    size = np.maximum(sg(27, 25) + sg(25, 23), sg(28, 26) + sg(26, 24)) + np.linalg.norm((q[:, 11] + q[:, 12]) / 2 - hipc, axis=1) + 1e-9      # along the bones: a kick or a bend does not change it much
    size = np.array([np.median(size[max(0, i - 2):i + 3]) for i in range(len(size))]); jump = np.linalg.norm(np.diff(hipc, axis=0), axis=1) / size[:-1]; grow = np.abs(np.diff(size)) / size[:-1]
    runs = np.split(sel, np.where((np.diff(d['shot'][sel]) != 0) | (np.diff(d['t'][sel]) > 3.5 * float(d['step'])) | (jump > 0.45) | (grow > 0.3))[0] + 1)
    c0 = e.get('contact', e.get('peak')); inside = [r for r in runs if c0 is not None and d['t'][r[0]] <= c0 <= d['t'][r[-1]]]; sel = inside[0] if inside else max(runs, key=len)
    if len(sel) < 12: return None
    t = d['t'][sel].astype(np.float64) / slow; rate = 1 / np.median(np.diff(t))                    # real seconds; samples per real second
    xy, W, vis, swaps = unswap(d['xy'][sel].astype(np.float64), d['world'][sel].astype(np.float64), d['vis'][sel].astype(np.float64), e.get('hand', 'R'), rate); Jraw, feet3 = from_mp(W)
    face = np.stack([W[:, 0, 0] - (W[:, 7, 0] + W[:, 8, 0]) / 2, W[:, 0, 2] - (W[:, 7, 2] + W[:, 8, 2]) / 2], 1)       # nose from between the ears, across and away
    Jraw -= Jraw[:, :1]
    L0 = bone_lengths(Jraw); cv = float(np.mean([np.std(np.linalg.norm(Jraw[:, JI[c]] - Jraw[:, JI[p]], axis=1)) / L0[n] for c, p, n in BONES if n in ('thigh', 'shank', 'upper', 'fore')]))
    L = dict(lengths or L0); k = HT * CHAIN / (L['shank'] + L['thigh'] + L['spine'] + L['headn']); L = {n: v * k for n, v in L.items()}
    # everything to the size of a 1.85 m man, then every bone to its fixed length
    P, S = solve(Jraw * k, L, rate)                                                              # about the hips, camera axes
    kind = e.get('stroke', ''); lifted = False
    if kind not in ('serve', 'overhead') and e.get('lift', True):
        # where the net is in the picture and when the ball is met are needed to say what the arms may do
        c0 = e.get('contact', (e.get('peak') + float(e.get('peak_offset', 0.03)) * slow) if e.get('peak') is not None else None); tc = (c0 / slow) if c0 is not None else float(t[len(t) // 2])
        if e.get('psi') is not None: psi = math.radians(e['psi'])
        else:
            i1 = int(np.argmin(np.abs(t - tc))); f = face[max(0, i1 - int(0.7 * rate)):i1 + 2]; f = f / (np.linalg.norm(f, axis=1, keepdims=True) + 1e-9); m = np.median(f, 0); psi = math.atan2(m[0], m[1])
        P = lift_arms(P, S, L, vis, t - tc, kind.split('_')[0], e.get('hand', 'R'), bool(e.get('two')), psi); lifted = True
    # ---- from the picture: travel, height, feet ----
    pan = np.nan_to_num(d['pan'][sel].astype(np.float64)) if 'pan' in d else np.zeros((len(sel), 2)); xy = xy - np.cumsum(pan, 0)[:, None, :]
    seg = lambda a, b: np.linalg.norm(xy[:, a] - xy[:, b], axis=1)
    hip = (xy[:, 23] + xy[:, 24]) / 2; sh = (xy[:, 11] + xy[:, 12]) / 2; ear = (xy[:, 7] + xy[:, 8]) / 2
    chain = np.maximum(seg(27, 25) + seg(25, 23), seg(28, 26) + seg(26, 24)) + np.linalg.norm(sh - hip, axis=1) + np.linalg.norm(ear - sh, axis=1)
    s = np.percentile(chain, 90) / (CHAIN * HT)                                                  # pixels per metre (of a 1.85 m man)
    bottom = np.stack([np.maximum(xy[:, 29, 1], xy[:, 31, 1]), np.maximum(xy[:, 30, 1], xy[:, 32, 1])], 1)      # each foot's lowest point in the picture
    low = bottom.max(1); w = max(3, int(round(0.6 * rate))); gl = np.array([low[max(0, i - w):i + w + 1].max() for i in range(len(low))]); gl = savgol(gl, max(5, int(0.5 * rate) | 1), 1)
    foot = np.stack([(xy[:, 27] + xy[:, 29] + xy[:, 31]) / 3, (xy[:, 28] + xy[:, 30] + xy[:, 32]) / 3], 1)
    # a foot is down while it stays put for a twentieth of a second and is at the ground (measured over that long, so that slow motion's many frames do not turn a pixel of jitter into speed)
    kk = max(1, int(round(0.025 * rate))); fs = savgol(foot, max(5, kk | 1), 1); pad = np.concatenate([np.repeat(fs[:1], kk, 0), fs, np.repeat(fs[-1:], kk, 0)], 0)
    sp = np.linalg.norm(pad[2 * kk:] - pad[:-2 * kk], axis=2) / (2 * kk) * rate / s
    # each foot against its own ground line: seen from close by, the far foot's ground is higher in the picture than the near foot's
    own = np.stack([[bottom[max(0, i - w):i + w + 1, j].max() for i in range(len(low))] for j in range(2)], 1)
    plant = (sp < 0.6) & ((own - bottom) / s < 0.05) & ((gl[:, None] - bottom) / s < 0.25)
    for j in range(2):                                                                           # no one-frame flickers
        v = plant[:, j].astype(float); kk2 = max(2, int(round(0.02 * rate))); plant[:, j] = np.array([np.median(v[max(0, i - kk2):i + kk2 + 1]) for i in range(len(v))]) > 0.5
    jump = np.clip((gl - low) / s - 0.03, 0, None); jump = savgol(jump, max(5, int(0.08 * rate) | 1), 2).clip(0)
    floor = np.minimum(np.minimum(P[:, JI['ltoe'], 1], P[:, JI['rtoe'], 1]) - 0.02, np.minimum(P[:, JI['lankle'], 1], P[:, JI['rankle'], 1]) - 0.085)
    ph = savgol(-floor + jump, max(5, int(0.09 * rate) | 1))                                     # height of the hips above the ground
    px = (hip[:, 0] - hip[0, 0]) / s                                                             # the hips' travel across the picture, metres
    return dict(t=t, rate=rate, P=P, ph=ph, px=px, plant=plant, vis=vis, cv=cv, L=L, s=s, sel=sel, jump=jump, face=face, swaps=swaps, lifted=lifted)

def to_court(R, e, kind, hand):
    """Find contact and the direction of the net, and turn the clip to court axes."""
    t, P, rate = R['t'], R['P'], R['rate']; hj = JI['rhand' if hand == 'R' else 'lhand']; wj = JI['rwri' if hand == 'R' else 'lwri']
    # the wrist, not the knuckles: the tracker's fingers wander when the hand is on a racket
    # and its speed across the picture only: the tracker's depth is too unsteady to time a stroke by
    hpos = P[:, wj] + np.stack([R['px'], R['ph'], np.zeros(len(t))], 1); v = np.gradient(savgol(hpos, 5), axis=0) * rate; speed = savgol(medfilt(np.linalg.norm(v[:, :2], axis=1), 5), max(5, int(0.02 * rate) | 1)) * np.clip(savgol(R['vis'][:, 16 if hand == 'R' else 15], 5), 0.2, 1) ** 2      # ...and only where the wrist is really seen: wrapped round behind the head at the finish it is a guess
    if e.get('contact') is not None: ic = int(np.argmin(np.abs(t - e['contact'] / float(e.get('slow', 1)))))
    elif kind in ('serve', 'overhead'): ic = int(np.argmax(hpos[:, 1]))                          # the hitting hand at its highest
    else:
        # the hand is at its fastest a little before the strings meet the ball (the racket is still catching up): 0.04-0.05 s on two Federer forehands and 0.02 s on a Nadal forehand where the ball can be seen on the strings; 0.03 s unless the manifest says otherwise
        ip = int(np.argmin(np.abs(t - e['peak'] / float(e.get('slow', 1))))) if e.get('peak') is not None else int(np.argmax(speed)); ic = min(len(t) - 1, ip + int(round(float(e.get('peak_offset', 0.03)) * rate)))
    if e.get('psi') is not None: psi = math.radians(e['psi'])
    else:
        # he watches the ball come from the net: where his face points through the stroke is where the net is
        a, b = max(0, ic - int(0.7 * rate)), min(len(t), ic + int(0.05 * rate) + 1); f = R['face'][a:b]; f = f / (np.linalg.norm(f, axis=1, keepdims=True) + 1e-9); m = np.median(f, 0); psi = math.atan2(m[0], m[1])
    c, s_ = math.cos(psi), math.sin(psi)
    turn = lambda A: np.stack([A[..., 0] * c - A[..., 2] * s_, A[..., 1], A[..., 0] * s_ + A[..., 2] * c], -1)
    Pc = turn(P); travel = turn(np.stack([R['px'] - R['px'][ic], np.zeros(len(t)), np.zeros(len(t))], 1))
    root = travel[:, [0, 2]]; J = Pc + np.stack([root[:, 0], R['ph'], root[:, 1]], 1)[:, None, :]
    hl = Pc[:, JI['rhip']] - Pc[:, JI['lhip']]; yaw = np.unwrap(np.arctan2(-hl[:, 2], hl[:, 0]))
    return dict(u=t - t[ic], J=J, root=root, yaw=yaw, plant=R['plant'], psi=math.degrees(psi), ic=ic, speed=speed, hand_h=float(J[ic, wj, 1]), hand_z=float(J[ic, wj, 2] - J[ic, 0, 2]))

def resample(C, kind):
    """Onto the game's clock: sixty frames a second about contact."""
    u = C['u']; a, b = WIN.get(kind, WIN_DEFAULT); a, b = max(a, u[0]), min(b, u[-1]); n0, n1 = int(math.ceil(a * FPS)), int(math.floor(b * FPS)); g = np.arange(n0, n1 + 1) / FPS
    it = lambda y: np.interp(g, u, y)
    J = np.stack([np.stack([it(C['J'][:, j, k]) for k in range(3)], -1) for j in range(len(JOINTS))], 1)
    return dict(u0=float(g[0]), J=J, root=np.stack([it(C['root'][:, 0]), it(C['root'][:, 1])], -1), yaw=it(C['yaw']), plant=np.stack([it(C['plant'][:, 0].astype(float)) > 0.5, it(C['plant'][:, 1].astype(float)) > 0.5], -1))

def quality(R, C, kind):
    """Lower is better: how well he was seen and how steady the tracker's limbs were, plus plain checks of the stroke itself."""
    vis = R['vis'][:, [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]]; q = (1 - float(vis.mean())) + 3 * R['cv']; why = []
    # a 1.85 m man reaching flat-footed has his wrist at about 2.07 m: lower than 2.0 m at contact and the arm was not followed to the top
    if kind == 'serve' and C['hand_h'] < 2.0: q += 1; why.append(f'contact wrist only {C["hand_h"]:.2f} m up')
    if kind == 'fh' and C['hand_z'] < 0.05: q += 1; why.append(f'contact hand {C["hand_z"]:+.2f} m from the hips, not in front')
    if C['u'][0] > -0.45 or C['u'][-1] < 0.25: q += 1; why.append('stroke not whole in the shot')
    return q, why

def fuse(A, B, L, axis, psis=None, upto=None):
    """One stroke from two cameras. A camera at the side measures how far forward and how high every joint is but
    only guesses how far across the court; a camera in front of or behind him measures across and high but
    guesses forward. The two are different swings of the same stroke by the same man, lined up on contact. The
    first clip is the stroke that is kept - its legs, its travel, its timing and the two directions its own
    camera measures; from the second comes only the one direction (axis 0 = across, 2 = toward the net) that
    the first camera could not measure, for the trunk, head and arms; and the bones are then set back to their
    lengths. axis 'tri': two cameras at an angle to each other (each a front or rear quarter, neither straight
    side-on) - each measures the direction across its own picture, and the trunk and arms are put where both agree;
    "upto" (s from contact) uses the second camera only before then."""
    a0 = max(A['u0'], B['u0']); b0 = min(A['u0'] + (len(A['J']) - 1) / FPS, B['u0'] + (len(B['J']) - 1) / FPS); n = int(round((b0 - a0) * FPS)) + 1
    if n < 30: return None
    cut = lambda X, key: X[key][int(round((a0 - X['u0']) * FPS)):][:n]
    JA, JB = cut(A, 'J'), cut(B, 'J'); ra, rb = JA - JA[:, :1], JB - JB[:, :1]; f = ra.copy()
    upper = [JI[k] for k in ('neck', 'head', 'lsho', 'rsho', 'lelb', 'relb', 'lwri', 'rwri', 'lhand', 'rhand')]
    if axis == 'tri':
        # two cameras at an angle to each other, neither straight side-on nor straight in front: each measures one
        # horizontal direction (across its picture), and the place over the ground of every joint of the trunk and
        # arms is the one point that both agree on; height stays the first camera's
        ea, eb = [np.array([math.cos(math.radians(p)), math.sin(math.radians(p))]) for p in psis]; M = np.linalg.inv(np.stack([ea, eb]))
        a = ra[:, upper][..., [0, 2]] @ ea; b = rb[:, upper][..., [0, 2]] @ eb; xz = np.stack([a, b], -1) @ M.T
        if upto is not None:
            # the second camera only until 'upto' s from contact (a real-speed camera blurs the arms through the hit): after
            # that the first camera's own estimate, blended over a twelfth of a second
            w = np.clip((upto - (a0 + np.arange(n) / FPS)) / 0.08, 0, 1)[:, None, None]; xz = w * xz + (1 - w) * ra[:, upper][..., [0, 2]]
        f[:, upper, 0] = xz[..., 0]; f[:, upper, 2] = xz[..., 1]
    else: f[:, upper, axis] = rb[:, upper, axis]
    out = np.zeros_like(f)
    for c, p, name in BONES:
        d = f[:, JI[c]] - f[:, JI[p]]; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9; out[:, JI[c]] = out[:, JI[p]] + d * L[name]
    J = out + JA[:, :1]; hl = out[:, JI['rhip']] - out[:, JI['lhip']]; yaw = np.unwrap(np.arctan2(-hl[:, 2], hl[:, 0]))
    return dict(u0=a0, J=J, root=cut(A, 'root'), yaw=yaw, plant=cut(A, 'plant'))

# ---------- drawing, to check a clip against the footage ----------
LIMBS = [('pelvis', 'neck', 0), ('neck', 'head', 0), ('neck', 'lsho', 1), ('lsho', 'lelb', 1), ('lelb', 'lwri', 1), ('lwri', 'lhand', 1), ('neck', 'rsho', 2), ('rsho', 'relb', 2), ('relb', 'rwri', 2), ('rwri', 'rhand', 2),
         ('pelvis', 'lhip', 1), ('lhip', 'lknee', 1), ('lknee', 'lankle', 1), ('lankle', 'ltoe', 1), ('pelvis', 'rhip', 2), ('rhip', 'rknee', 2), ('rknee', 'rankle', 2), ('rankle', 'rtoe', 2)]
def sheet(path, clip, e, R, C, cv2):
    """Eight moments of the stroke: the footage, then the clip as a stick figure from his right side, from in front and from behind."""
    us = np.linspace(max(clip['u0'], -1.25 if e['stroke'] == 'serve' else -0.7), min(clip['u0'] + (len(clip['J']) - 1) / FPS, 0.45), 8); us[np.argmin(np.abs(us))] = 0.0
    S = 220; img = np.full((5 * S, 8 * S, 3), 255, np.uint8); cap = cv2.VideoCapture(e['video']); col = [(60, 60, 60), (0, 170, 230), (220, 110, 0)]
    for c, u in enumerate(us):
        k = int(np.argmin(np.abs(C['u'] - u))); fidx = int(R['d']['f'][R['sel'][k]]); cap.set(cv2.CAP_PROP_POS_FRAMES, fidx); ok, fr = cap.read()
        if ok:
            xy = R['d']['xy'][R['sel'][k]]; cx, cy = xy[[23, 24]].mean(0); h = max(60.0, 1.25 * (xy[:, 1].max() - xy[:, 1].min())); x0, y0 = int(cx - h / 2), int(cy - h * 0.55); pad = int(h)
            pad = int(h) + max(fr.shape[:2]); fr = cv2.copyMakeBorder(fr, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255)); crop = fr[y0 + pad:y0 + pad + int(h), x0 + pad:x0 + pad + int(h)]
            if crop.size: img[0:S, c * S:(c + 1) * S] = cv2.resize(crop, (S, S), interpolation=cv2.INTER_AREA)
        cv2.putText(img, f'u={u:+.2f}', (c * S + 6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
        i = int(round((u - clip['u0']) * FPS)); i = min(max(i, 0), len(clip['J']) - 1); J = clip['J'][i]; pel = J[0]
        for r, (ax, sg, name) in enumerate(((2, 1, 'side: net to the right'), (0, -1, 'from in front'), (0, 1, 'from behind'))):
            ox, oy = c * S + S // 2, (r + 1) * S + S - 14; sc = S / 2.75
            cv2.line(img, (c * S + 4, oy), ((c + 1) * S - 4, oy), (190, 190, 190), 1)
            for a, b, w in LIMBS:
                pa, pb = J[JI[a]], J[JI[b]]; cv2.line(img, (int(ox + sg * (pa[ax] - pel[ax]) * sc), int(oy - pa[1] * sc)), (int(ox + sg * (pb[ax] - pel[ax]) * sc), int(oy - pb[1] * sc)), col[w], 2, cv2.LINE_AA)
            hd = J[JI['head']]; cv2.circle(img, (int(ox + sg * (hd[ax] - pel[ax]) * sc), int(oy - hd[1] * sc)), int(0.10 * sc), (60, 60, 60), 1, cv2.LINE_AA)
            for f, tj in enumerate(('ltoe', 'rtoe')):
                if clip['plant'][i][f]: pt = J[JI[tj]]; cv2.circle(img, (int(ox + sg * (pt[ax] - pel[ax]) * sc), int(oy - pt[1] * sc)), 4, (0, 0, 200), -1)
            if c == 0: cv2.putText(img, name, (6, (r + 1) * S + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1)
        # and from above: the net at the top of the page, his right to the right
        ox, oy = c * S + S // 2, 4 * S + S // 2 + 20; sc = S / 1.7; cv2.line(img, (ox - 6, oy), (ox + 6, oy), (190, 190, 190), 1); cv2.line(img, (ox, oy - 6), (ox, oy + 6), (190, 190, 190), 1)
        for a, b, w in LIMBS:
            if a in ('lknee', 'rknee', 'lankle', 'rankle') or b in ('lknee', 'rknee'): continue      # from above the lower legs only clutter: feet are drawn as dots
            pa, pb = J[JI[a]], J[JI[b]]; cv2.line(img, (int(ox + (pa[0] - pel[0]) * sc), int(oy - (pa[2] - pel[2]) * sc)), (int(ox + (pb[0] - pel[0]) * sc), int(oy - (pb[2] - pel[2]) * sc)), col[w], 2, cv2.LINE_AA)
        for tj, w in (('ltoe', 1), ('rtoe', 2)): pt = J[JI[tj]]; cv2.circle(img, (int(ox + (pt[0] - pel[0]) * sc), int(oy - (pt[2] - pel[2]) * sc)), 5, col[w], -1)
        hd = J[JI['head']]; cv2.circle(img, (int(ox + (hd[0] - pel[0]) * sc), int(oy - (hd[2] - pel[2]) * sc)), int(0.10 * sc), (60, 60, 60), 1, cv2.LINE_AA)
        if c == 0: cv2.putText(img, 'from above: net at the top', (6, 4 * S + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1)
    cv2.putText(img, f"{e['player']} {e['stroke']}  {e.get('src', '')}  yellow=left blue=right  red dot=foot down", (8, 5 * S - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1)
    cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 88])

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('manifest'); ap.add_argument('out'); ap.add_argument('--js'); ap.add_argument('--sheets'); ap.add_argument('--only'); ap.add_argument('--all', action='store_true')
    A = ap.parse_args(); man = json.load(open(A.manifest)); only = set(A.only.split(',')) if A.only else None
    entries = [e for e in man['strokes'] if not e.get('skip') and (only is None or e['player'] in only)]; tracks = {}; built = {}; log = []
    # a player's bones: their median over every frame of his that is used
    per = {}
    for e in entries:
        d = tracks.setdefault(e['track'], np.load(e['track'])); sel = (d['t'] >= e['t0']) & (d['t'] <= e['t1'])
        if sel.sum() >= 12: J, _ = from_mp(d['world'][sel].astype(np.float64)); per.setdefault(e['player'], []).append(J - J[:, :1])
    lengths = {p: bone_lengths(np.concatenate(v)) for p, v in per.items()}
    for e in entries:
        d = tracks[e['track']]; R = reconstruct(d, e, lengths.get(e['player']))
        if R is None: log.append(dict(e, result='too short')); continue
        R['d'] = d; hand = e.get('hand', 'R'); C = to_court(R, e, e['stroke'], hand); q, why = quality(R, C, e['stroke']); clip = resample(C, e['stroke'])
        built.setdefault((e['player'], e['stroke']), []).append(dict(e=e, R=R, C=C, clip=clip, q=q, why=why))
        log.append(dict(player=e['player'], stroke=e['stroke'], src=e.get('src'), q=round(q, 3), why=why, psi=round(C['psi'], 1), wrist_h=round(C['hand_h'], 2), hand_z=round(C['hand_z'], 2), rate=round(R['rate'], 1), frames=len(R['t']), u=[round(float(C['u'][0]), 2), round(float(C['u'][-1]), 2)], limb_cv=round(R['cv'], 3), swaps=R['swaps']))
        print(log[-1])
    out = {}
    if A.sheets: import cv2; os.makedirs(A.sheets, exist_ok=True)
    for (player, stroke), items in built.items():
        items.sort(key=lambda x: (not x['e'].get('ok', False), x['q'])); best = items[0]
        if best['q'] >= 1:
            print('NOT SHIPPED', player, stroke, best['why'])
            if A.sheets and A.all: sheet(os.path.join(A.sheets, f'{player}_{stroke}_REJECTED.jpg'), best['clip'], best['e'], best['R'], best['C'], cv2)
            continue
        if best['e'].get('ok'): items = [x for x in items if x['e'].get('ok')]          # a checked stroke is only ever combined with other checked ones
        # the few that pass and agree with the best are combined frame by frame; otherwise the best stands alone
        good = [x for x in items[:5] if x['q'] < 1]; clip = best['clip']; used = [best]
        if len(good) >= 3:
            a = max(x['clip']['u0'] for x in good); b = min(x['clip']['u0'] + (len(x['clip']['J']) - 1) / FPS for x in good); n = int(round((b - a) * FPS)) + 1
            cut = lambda x, key: x['clip'][key][int(round((a - x['clip']['u0']) * FPS)):][:n]
            dist = [float(np.mean(np.linalg.norm((cut(x, 'J') - cut(x, 'J')[:, :1]) - (cut(best, 'J') - cut(best, 'J')[:, :1]), axis=-1))) for x in good]; agree = [x for x, dd in zip(good, dist) if dd < 0.16]
            if len(agree) >= 3 and n > 30:
                used = agree; clip = dict(u0=a, J=np.median([cut(x, 'J') for x in agree], 0), root=np.median([cut(x, 'root') for x in agree], 0), yaw=np.median([cut(x, 'yaw') for x in agree], 0), plant=np.median([cut(x, 'plant').astype(float) for x in agree], 0) > 0.5)
        # two cameras, where the manifest pairs them
        for fz in man.get('fuse', []):
            if fz['player'] != player or fz['stroke'] != stroke: continue
            ia = [x for x in built[(player, stroke)] if x['e'].get('id') == fz['primary']]; ib = [x for x in built[(player, stroke)] if x['e'].get('id') == fz['secondary']]
            if not ia or not ib: print('fuse: missing', fz); continue
            ax = {'x': 0, 'z': 2, 'tri': 'tri'}[fz.get('axis', 'x')]; fc = fuse(ia[0]['clip'], ib[0]['clip'], ia[0]['R']['L'], ax, (ia[0]['C']['psi'], ib[0]['C']['psi']), fz.get('upto'))
            if fc is None: print('fuse: no overlap', fz); continue
            clip = fc; best = dict(ia[0], e=dict(ia[0]['e'], ok=bool(fz.get('ok', False)), why=fz.get('why', 'two cameras fused; not yet checked against the frames'), src=ia[0]['e'].get('src', '') + ' + ' + ('across-court' if ax == 0 else 'toward-the-net' if ax == 2 else 'over-the-ground') + ' positions of trunk and arms from ' + ib[0]['e'].get('src', '')))
            used = [best]
            if A.sheets: sheet(os.path.join(A.sheets, f'{player}_{stroke}_2.jpg'), clip, ib[0]['e'], ib[0]['R'], ib[0]['C'], cv2)      # the same clip beside the second camera's frames
        r3 = lambda a: [round(float(v), 3) for v in np.asarray(a).reshape(-1)]
        out.setdefault(player, {})[stroke] = dict(fps=FPS, u0=round(clip['u0'], 4), n=len(used), src='; '.join(x['e'].get('src', '') for x in used), hand=best['e'].get('hand', 'R'), ok=bool(best['e'].get('ok', False)), why=best['e'].get('why', ''),
                                                  J={n: r3(clip['J'][:, i]) for i, n in enumerate(JOINTS)}, root=r3(clip['root']), yaw=r3(clip['yaw']), plant=[int(v) for v in np.asarray(clip['plant']).reshape(-1)])
        if A.sheets: sheet(os.path.join(A.sheets, f'{player}_{stroke}.jpg'), clip, best['e'], best['R'], best['C'], cv2)
    json.dump(dict(clips=out, log=log), open(A.out, 'w'))
    if A.js:
        head = ("// Each player's own strokes as full-body clips, tracked from footage in which he is large in the picture\n"
                "// (court-level cameras and slow-motion replays). A clip is one stroke, or the per-frame median of the\n"
                "// few that agree: never an average of many. fps 60; u0 = seconds from contact at frame 0; J[joint] =\n"
                "// x,y,z per frame, metres for a 1.85 m man: x to his right, y up from the ground, z toward the net,\n"
                "// about the point on the ground under his hips at contact. root = x,z of the hips over the ground per\n"
                "// frame; yaw = which way the hips face (radians, 0 = toward the net, positive toward his right);\n"
                "// plant = left,right foot on the ground per frame. hand = the hand he hits with, as filmed (left-handers\n"
                "// are not mirrored). ltoe/rtoe are the ball of the foot; lhand/rhand the middle knuckles.\n"
                "// ok = true only where the stick figure from the side, front, behind and above was checked against the\n"
                "// frames and matched; otherwise why says what is wrong or that it has not been checked.\n"
                "// Built by tools/player_motion.py from tracks made by tools/track.py.\n")
        open(A.js, 'w').write(head + 'export const PLAYER_MOTION = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print('shipped:', {p: list(v) for p, v in out.items()})
