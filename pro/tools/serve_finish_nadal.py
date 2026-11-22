# serve_finish_nadal.py in.json out.json  - a left-hander's serve clip: after contact, how far across the court the hitting (left) wrist, hand
# and elbow are, put where the back-view footage (MGXLV5uwWHM, 7.43-8.63 s) shows them: the racket down through the middle in front of
# him at +0.13 s, at the centre-right by +0.26 s and held by his right hip from +0.39 s (wrist x relative to the hips -0.05, +0.08,
# +0.18). Both cameras lose that hand once it crosses in front of him (from behind it is hidden by his body; from the side across the
# court is a guess), and both left it on his left side. Height and depth stay the clip's; bone lengths are kept.
import sys, json, numpy as np
c = json.load(open(sys.argv[1])); n = len(c['J']['pelvis']) // 3; u = c['u0'] + np.arange(n) / 60
G = {k: np.array(v, float).reshape(n, 3) for k, v in c['J'].items()}
ku = np.array([0.0, 0.13, 0.26, 0.39, 9.0]); kx = np.array([np.nan, -0.05, 0.08, 0.18, 0.18])
k0 = int(np.argmin(np.abs(u))); kx[0] = G['lwri'][k0, 0] - G['pelvis'][k0, 0]
w = np.clip((u - 0.03) / 0.12, 0, 1); w = w * w * (3 - 2 * w)
tx = np.interp(u, ku, kx)
for k in range(n):
    if w[k] <= 0: continue
    P = G['pelvis'][k, 0]; sh = G['lsho'][k].copy(); L1 = np.linalg.norm(G['lelb'][k] - sh); L2 = np.linalg.norm(G['lwri'][k] - G['lelb'][k]); L3 = np.linalg.norm(G['lhand'][k] - G['lwri'][k])
    hand_off = G['lhand'][k] - G['lwri'][k]
    wr = G['lwri'][k].copy(); wr[0] = (1 - w[k]) * wr[0] + w[k] * (P + tx[k])
    el = G['lelb'][k].copy(); el[0] = (1 - w[k]) * el[0] + w[k] * (0.5 * (sh[0] + wr[0]))
    # (kept out of the trunk: an elbow halfway across, at the clip's own depth, sat on the line of his spine - in front of him, at
    # least 0.2 m from the line from the hips to the neck, pushed out the way it already lies from that line, or forward)
    a, b = G['pelvis'][k], G['neck'][k]
    for _ in range(3):
        for q in ('el', 'wr'):
            pt = el if q == 'el' else wr; ab = b - a; t = np.clip(np.dot(pt - a, ab) / np.dot(ab, ab), 0, 1); c0 = a + t * ab; r = pt - c0; r[1] = 0; rl = np.linalg.norm(r)
            if rl < 0.2: r = r / rl if rl > 0.03 else np.array([0.0, 0.0, 1.0]); pt = c0 + r * 0.2 + np.array([0, pt[1] - c0[1], 0]) * 1.0
            if q == 'el': el = pt
            else: wr = pt
        d = el - sh; el = sh + d / np.linalg.norm(d) * L1; d = wr - el; wr = el + d / np.linalg.norm(d) * L2
    G['lelb'][k] = el; G['lwri'][k] = wr; G['lhand'][k] = wr + hand_off / np.linalg.norm(hand_off) * L3
r3 = lambda a: [round(float(v), 3) for v in a.reshape(-1)]
c['J'] = {k: r3(v) for k, v in G.items()}
c['why'] += (' After contact the hitting arm\'s place across the court is set from the back-view footage (racket down through the middle, then '
             'held by his right hip from +0.39 s): both cameras lose that hand as it crosses in front of him, and both had left it on his left side.')
json.dump(c, open(sys.argv[2], 'w'))
for uu in (0.0, 0.13, 0.26, 0.4, 0.6, 0.8):
    k = int(np.argmin(np.abs(u - uu))); print(f'u {uu:+.2f} wrist rel hips', np.round(G['lwri'][k] - G['pelvis'][k], 2), ' elbow', np.round(G['lelb'][k] - G['pelvis'][k], 2))
