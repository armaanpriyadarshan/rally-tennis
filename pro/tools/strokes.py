# Contact-aligned average strokes from tracked joints (17 keypoints, 15 Hz, seen from behind
# and above), lifted to 3D for the arms with bone lengths, and written as animation tracks.
import json, sys, array, math, numpy as np
base = sys.argv[1]
d = json.load(open(base + '/data.json')); POSE = array.array('h'); POSE.frombytes(open(base + '/pose.bin', 'rb').read())
POSE = np.frombuffer(POSE, np.int16).reshape(-1, 17, 2).astype(np.float32)
P = d['pieces']; N = len(P['x']); SC = d['scale']; PH = d['pose_hz']; HZ = d['hz']
names = {c['id']: c['name'] for c in d['clusters']}
H = 1.85; ALPHA = math.radians(15)
HEAD, LSH, RSH, LEL, REL, LWR, RWR, LHIP, RHIP, LKN, RKN, LAN, RAN = range(13)
def frames(pt):
    a = POSE[pt['off']:pt['off'] + pt['n']] / SC
    a = a.copy(); a[POSE[pt['off']:pt['off'] + pt['n'], :, 0] == -32768] = np.nan
    return a
def sample(F, t):                       # joints at time t (s), linear between 15 Hz frames
    u = t * PH; f = int(math.floor(u)); w = u - f
    if f < 0 or f + 1 >= len(F): return None
    return F[f] * (1 - w) + F[f + 1] * w
hitName = {1: 'fh', 2: 'bh', 3: 'serve'}
WIN = {'fh': (-0.85, 0.85), 'bh': (-0.85, 0.85), 'serve': (-1.30, 0.75)}
out = {}
stats = {}
for hit, key in hitName.items():
    idx = [i for i in range(N) if P['hit'][i] == hit]
    cl = {}
    for i in idx: cl[names.get(P['c'][i], '?')] = cl.get(names.get(P['c'][i], '?'), 0) + 1
    t0, t1 = WIN[key]; ts = np.arange(t0, t1 + 1e-6, 1 / 30)
    inst = []
    seen = set()
    for i in idx:
        pt = d['points'][str(P['point'][i])]; F = frames(pt); h = P['h'][i]
        if h <= 0: continue
        a, b = P['g0'][i] / HZ, P['g1'][i] / HZ
        # contact: fastest hitting-wrist frame inside the labelled piece (serve: wrist at its highest)
        tt = np.arange(max(0.07, a - 0.15), min((pt['n'] - 2) / PH, b + 0.15), 1 / 60)
        if len(tt) < 6: continue
        wr = np.array([sample(F, t)[RWR] if sample(F, t) is not None else [np.nan, np.nan] for t in tt])
        if np.isnan(wr).any(): continue
        if key == 'serve': k = int(np.argmin(wr[:, 1]))
        else:
            sp = np.linalg.norm(np.gradient(wr, axis=0), axis=1); sp = np.convolve(sp, np.ones(5) / 5, 'same'); k = int(np.argmax(sp))
        tc = tt[k]
        if (P['point'][i], round(tc, 1)) in seen: continue
        seen.add((P['point'][i], round(tc, 1)))
        seq = [sample(F, max(0.0, tc + t)) for t in ts]                                  # a serve opens the point: hold the first frame before it
        if any(s is None for s in seq): continue
        seq = np.array(seq)[:, :13]
        if np.isnan(seq).mean() > 0.02: continue
        # the player moves through the picture during a stroke, so each frame is measured from
        # its own ground (the lower ankle) and its own hips: what is left is the body's shape
        gy = np.nanmax(seq[:, [LAN, RAN], 1], axis=1)[:, None]
        gx = ((seq[:, LHIP, 0] + seq[:, RHIP, 0]) / 2)[:, None]
        root = (seq[:, LAN, 0] + seq[:, RAN, 0]) / 2
        seq2 = np.stack([(seq[..., 0] - gx) / h * H, (gy - seq[..., 1]) / h * H], -1)     # x right, Yc up, metres
        seq2 = np.concatenate([seq2, np.stack([(root[:, None] - gx)[:, 0] / h * H, np.zeros(len(ts))], -1)[:, None, :]], 1)   # joint 13: mid-feet relative to hips
        inst.append(seq2)
    inst = np.array(inst)
    # keep the instances closest to the typical one, then average: a crisp, denoised stroke
    med = np.nanmedian(inst, 0)
    dist = np.nanmean(np.linalg.norm(inst[:, :, [RWR, LWR, RSH, LSH, RHIP, LHIP]] - med[:, [RWR, LWR, RSH, LSH, RHIP, LHIP]], axis=-1), axis=(1, 2))
    keep = np.argsort(dist)[:max(12, int(len(inst) * 0.35))]
    mean = np.nanmean(inst[keep], 0)
    stats[key] = dict(n=len(inst), used=len(keep), clusters=cl)
    out[key] = dict(ts=ts, mean=mean)
    print(key, 'instances', len(inst), 'used', len(keep), cl)

# ---- lift ----
Lu, Lf, W = 0.296, 0.281, 0.40          # upper arm, forearm, shoulder width at 1.85 m
def lift_arm(sh3, el2, wr2, prior, ts):
    # choose the sign of each bone's depth so the 3D path is smooth and obeys the priors
    T = len(ts); cand = np.zeros((T, 4, 2, 3)); ok = np.ones((T, 4))
    for t in range(T):
        de = math.sqrt(max(0, Lu * Lu - np.sum((el2[t] - sh3[t, :2]) ** 2))); dw = math.sqrt(max(0, Lf * Lf - np.sum((wr2[t] - el2[t]) ** 2)))
        for k, (s1, s2) in enumerate([(1, 1), (1, -1), (-1, 1), (-1, -1)]):
            e = np.array([el2[t, 0], el2[t, 1], sh3[t, 2] + s1 * de]); w = np.array([wr2[t, 0], wr2[t, 1], e[2] + s2 * dw]); cand[t, k] = [e, w]
    cost = np.full((T, 4), 1e9); back = np.zeros((T, 4), int)
    unary = np.array([[prior(ts[t], cand[t, k, 0], cand[t, k, 1], sh3[t]) for k in range(4)] for t in range(T)])
    cost[0] = unary[0]
    for t in range(1, T):
        for k in range(4):
            tr = [cost[t - 1, j] + 60 * np.sum((cand[t, k] - cand[t - 1, j]) ** 2) for j in range(4)]
            back[t, k] = int(np.argmin(tr)); cost[t, k] = min(tr) + unary[t, k]
    k = int(np.argmin(cost[-1])); path = [k]
    for t in range(T - 1, 0, -1): k = back[t, k]; path.append(k)
    path = path[::-1]
    return np.array([cand[t, path[t]] for t in range(T)])
def world(p):                            # camera space (X, Yc, d) -> body space (x right, y up, f forward)
    ca, sa = math.cos(ALPHA), math.sin(ALPHA)
    return np.stack([p[..., 0], p[..., 1] * ca - p[..., 2] * sa, p[..., 1] * sa + p[..., 2] * ca], -1)
res = {}
for key, o in out.items():
    ts, m = o['ts'], o['mean']; T = len(ts)
    sm = lambda a: np.apply_along_axis(lambda v: np.convolve(np.pad(v, 2, 'edge'), np.ones(5) / 5, 'valid'), 0, a)
    m = sm(m)
    hipc = (m[:, LHIP] + m[:, RHIP]) / 2; shc = (m[:, LSH] + m[:, RSH]) / 2
    # twist: how much of the shoulder line the camera sees. Sign from the stroke: a forehand and a
    # serve coil toward the racket side and unwind through contact; a backhand coils the other way.
    ratio = np.clip((m[:, RSH, 0] - m[:, LSH, 0]) / W, -1, 1); mag = np.arccos(ratio)
    if key == 'fh': sign = np.where(ts < 0.0, 1, -1.0)
    elif key == 'bh': sign = -np.ones(T)
    else: sign = np.where(ts < 0.02, 1, -1.0)
    tw = sm((mag * sign)[:, None])[:, 0]
    # depth of the trunk: pelvis over the feet; shoulders lean with an assumed forward lean
    lean = 0.26
    dp = -hipc[:, 1] * math.tan(ALPHA)
    dch = dp + 0.55 * math.sin(lean - ALPHA)
    def sh3(side):
        j = RSH if side > 0 else LSH
        return np.stack([m[:, j, 0], m[:, j, 1], dch - side * (W / 2) * np.sin(tw)], -1)
    def prior_hit(t, e, w, s):
        c = 0
        if key in ('fh', 'bh'):
            if -0.03 <= t <= 0.06: c += 6 * max(0, 0.25 - (w[2] - s[2]))            # out in front at contact
            if -0.30 <= t <= -0.12: c += 4 * max(0, (w[2] - s[2]) + 0.05)           # behind on the take-back
            if 0.22 <= t <= 0.45: c += 2 * max(0, (w[2] - s[2]) - 0.25)             # wrapped round on the finish
            if t <= -0.62: c += 3 * max(0, 0.12 - (w[2] - s[2]))                    # starts from the ready position, racket in front
        else:
            if -0.03 <= t <= 0.05: c += 6 * max(0, 0.10 - (w[2] - s[2]))
            if -0.6 <= t <= -0.15: c += 4 * max(0, (w[2] - s[2]) + 0.05)            # trophy and drop are behind the head
            if t < -1.0: c += 2 * max(0, 0.15 - (w[2] - s[2]))                      # starts out in front with the ball
        return c
    def prior_off(t, e, w, s):
        c = 0.4 * max(0, 0.05 - (w[2] - s[2]))                                      # the free arm lives in front
        if key == 'bh' and t > 0.05: c = 3 * max(0, (w[2] - s[2]) + 0.1)            # ...except thrown back on a one-hander
        return c
    R = lift_arm(sh3(1), m[:, REL], m[:, RWR], prior_hit, ts); L = lift_arm(sh3(-1), m[:, LEL], m[:, LWR], prior_off, ts)
    Rw, Lw = world(R[:, 1]), world(L[:, 1]); Re, Le = world(R[:, 0]), world(L[:, 0])
    hipY = hipc[:, 1] / math.cos(ALPHA)
    stance = np.abs(m[:, RAN, 0] - m[:, LAN, 0]) / 2; feetX = m[:, 13, 0]
    res[key] = dict(ts=[round(float(x), 4) for x in ts], R=np.round(Rw, 3).tolist(), L=np.round(Lw, 3).tolist(), Re=np.round(Re, 3).tolist(), Le=np.round(Le, 3).tolist(),
                    twist=np.round(tw, 3).tolist(), hipY=np.round(hipY, 3).tolist(), stance=np.round(stance, 3).tolist(), hipX=np.round(-feetX, 3).tolist(),
                    shX=np.round(shc[:, 0], 3).tolist(), shY=np.round(shc[:, 1] / math.cos(ALPHA), 3).tolist(), headX=np.round(m[:, HEAD, 0], 3).tolist(),
                    tilt=np.round(np.arctan2(m[:, RSH, 1] - m[:, LSH, 1], np.maximum(0.08, np.abs(m[:, RSH, 0] - m[:, LSH, 0]))), 3).tolist(), n=stats[key]['used'])
    print('\n##', key, 'used', stats[key]['used'])
    for t in range(0, T, 3):
        print(f"  u={ts[t]:+.2f}  R=({Rw[t,0]:+.2f},{Rw[t,1]:.2f},{Rw[t,2]:+.2f})  L=({Lw[t,0]:+.2f},{Lw[t,1]:.2f},{Lw[t,2]:+.2f})  twist={math.degrees(tw[t]):+5.0f}  hipY={hipY[t]:.2f}  stance={stance[t]:.2f}  hipX={-feetX[t]:+.2f} shX={shc[t,0]:+.2f} tilt={math.degrees(res[key]['tilt'][t]):+4.0f}")
json.dump(res, open(sys.argv[2], 'w'))
