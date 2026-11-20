# How a tour player moves between shots, measured from tracked joints (17 keypoints at 15 Hz,
# seen from behind and above). Prints the tables that js/figure.js's GAIT numbers come from.
#   python3 -I tools/gait.py <dir with data.json and pose.bin>
# Sideways movement is used throughout because, from behind, both the direction of travel and
# height lie in the picture: a run to the side is seen side-on, a shuffle face-on.
import json, sys, math, numpy as np
from collections import defaultdict
base = sys.argv[1]
d = json.load(open(base + '/data.json'))
RAW = np.frombuffer(open(base + '/pose.bin', 'rb').read(), np.int16).reshape(-1, 17, 2)
P = d['pieces']; N = len(P['x']); SC = d['scale']; PH = d['pose_hz']; HZ = d['hz']; H = 1.85
names = {c['id']: c['name'] for c in d['clusters']}
HEAD, LSH, RSH, LEL, REL, LWR, RWR, LHIP, RHIP, LKN, RKN, LAN, RAN = range(13)
SWAP = [HEAD, RSH, LSH, REL, LEL, RWR, LWR, RHIP, LHIP, RKN, LKN, RAN, LAN]
byPt = defaultdict(list)
for i in range(N): byPt[P['point'][i]].append(i)
np.set_printoptions(precision=2, suppress=True, linewidth=220)

def windows(mask, minlen):
    out = []; i = 0; n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]: j += 1
            if j - i >= minlen: out.append((i, j))
            i = j
        else: i += 1
    return out
def analytic(v):
    n = len(v); F = np.fft.fft(v); h = np.zeros(n); h[0] = 1
    if n % 2 == 0: h[n // 2] = 1; h[1:n // 2] = 2
    else: h[1:(n + 1) // 2] = 2
    return np.fft.ifft(F * h)
def bandpass(v, lo=0.55, hi=3.2):
    n = len(v); m = 4 * n; x = np.arange(n); v = v - np.polyval(np.polyfit(x, v, 1), x)
    pad = np.zeros(m); o = m // 2 - n // 2; pad[o:o + n] = v * np.hanning(n) ** 0.25
    F = np.fft.rfft(pad); f = np.fft.rfftfreq(m, 1 / PH); F[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(F, m)[o:o + n]
def peak_hz(v):
    v = v - np.polyval(np.polyfit(np.arange(len(v)), v, 1), np.arange(len(v)))
    S = np.abs(np.fft.rfft(v * np.hanning(len(v)), 256)); f = np.fft.rfftfreq(256, 1 / PH); S[(f < 0.5) | (f > 4.5)] = 0
    return f[int(np.argmax(S))]

def frames(pid):
    pt = d['points'][str(pid)]; n = pt['n']
    A = RAW[pt['off']:pt['off'] + n].astype(np.float32) / SC; A[RAW[pt['off']:pt['off'] + n, :, 0] == -32768] = np.nan
    lab = {k: np.zeros(n) for k in ('speed', 'vl', 'vd', 'h', 'hit')}; cl = np.full(n, -9)
    for i in byPt[pid]:
        a, b = int(math.floor(P['g0'][i] * PH / HZ)), int(math.ceil(P['g1'][i] * PH / HZ))
        for k in lab: lab[k][a:b] = P[k][i]
        cl[a:b] = P['c'][i]
    return A, lab, cl

NB = 16
BANDS = [(0.9, 1.7), (1.7, 2.5), (2.5, 3.3), (3.3, 4.1), (4.1, 6.5)]
acc = [dict(n=np.zeros(NB), J=np.zeros((NB, 13, 2)), v=[], f=[], fz=[], shw=[], lift=[], T=0.0) for _ in BANDS]
split = defaultdict(list)
for pid in byPt:
    A, lab, cl = frames(pid); n = len(cl)
    ok = (lab['h'] > 20) & ~np.isnan(A[:, :13]).any(axis=(1, 2)) & (lab['hit'] == 0)
    vl, vd = lab['vl'], lab['vd']
    for a, b in windows(ok & (np.abs(vl) > 0.9) & (np.abs(vd) < 0.5 * np.abs(vl) + 0.25), 14):
        if np.sign(vl[a:b]).min() != np.sign(vl[a:b]).max(): continue
        sg = np.sign(vl[a]); k = H / np.median(lab['h'][a:b])
        J = A[a:b, :13].copy(); J[..., 0] *= k * sg; J[..., 1] *= -k
        if sg < 0: J = J[:, SWAP]                        # 'R' is always the side he is moving toward
        t = np.arange(b - a)
        low = np.minimum(J[:, LAN, 1], J[:, RAN, 1]); g = np.polyval(np.polyfit(t, low, 1), t); g += np.percentile(low - g, 25)
        hipx = (J[:, LHIP, 0] + J[:, RHIP, 0]) / 2
        s = J[:, RAN, 0] - J[:, LAN, 0]
        z = analytic(bandpass(s)); ph = (np.angle(z) / (2 * np.pi)) % 1.0
        v = float(np.mean(np.abs(vl[a:b]))); bi = next((i for i, (lo, hi) in enumerate(BANDS) if lo <= v < hi), None)
        if bi is None: continue
        good = (np.abs(z) > 0.12) & (t >= 2) & (t < b - a - 2)
        if good.sum() < 6: continue
        B = acc[bi]; Jr = J.copy(); Jr[..., 0] -= hipx[:, None]; Jr[..., 1] -= g[:, None]
        for i in np.where(good)[0]: q = int(ph[i] * NB) % NB; B['n'][q] += 1; B['J'][q] += Jr[i]
        dl = J[:, LAN, 1] - J[:, RAN, 1]
        B['v'].append(v); B['f'].append(peak_hz(s)); B['T'] += good.sum() / PH; B['shw'].append(float(np.median(np.abs(J[:, RSH, 0] - J[:, LSH, 0]))))
        B['lift'].append(float((np.percentile(dl, 92) - np.percentile(dl, 8)) / 2))
    # the split step: a window round each one, lined up where both feet are highest
    for i in byPt[pid]:
        nm = names.get(P['c'][i], '?')
        if nm not in ('Split step', 'Ready, bouncing') or P['speed'][i] >= 1.8 or P['h'][i] < 20: continue
        c = (int(P['g0'][i] * PH / HZ) + int(P['g1'][i] * PH / HZ)) // 2; w0, w1 = c - 9, c + 10
        if w0 < 0 or w1 > n: continue
        W = A[w0:w1, :13].copy()
        if np.isnan(W).any(): continue
        k = H / P['h'][i]; W[..., 0] *= k; W[..., 1] *= -k; t = np.arange(w1 - w0)
        lw = np.minimum(W[:, LAN, 1], W[:, RAN, 1]); g = np.polyval(np.polyfit(t, lw, 1), t); g += np.percentile(lw - g, 20)
        up = lw - g; j = 5 + int(np.argmax(up[5:14]))
        if j + 6 > len(t): continue
        split[nm].append(np.stack([up[j - 5:j + 6], (W[:, LHIP, 1] + W[:, RHIP, 1])[j - 5:j + 6] / 2 - g[j - 5:j + 6], np.abs(W[:, LAN, 0] - W[:, RAN, 0])[j - 5:j + 6]]))

print('Sideways movement, by speed (metres for a 1.85 m player; the picture scale runs about 8% small)')
print('  m/s         seconds  cycles/s  ankle lift  shoulder width  lean (shoulders ahead of hips)')
for (lo, hi), B in zip(BANDS, acc):
    if not B['v']: continue
    M = B['J'] / np.maximum(1, B['n'])[:, None, None]
    print(f'  {lo:.1f}-{hi:.1f}   {B["T"]:7.0f}   {np.median(B["f"]):.2f}      {np.median(B["lift"]):.3f}       {np.median(B["shw"]):.2f}            {np.mean((M[:, LSH, 0] + M[:, RSH, 0]) / 2):+.3f}')
print('\nOne step cycle at 1.7-2.5 m/s, sixteen phases from the feet at their widest (offsets from the hips along the direction of travel, heights above the ground)')
M = acc[1]['J'] / np.maximum(1, acc[1]['n'])[:, None, None]
for label, v in (('leading ankle x', M[:, RAN, 0]), ('trailing ankle x', M[:, LAN, 0]), ('leading ankle y', M[:, RAN, 1]), ('trailing ankle y', M[:, LAN, 1]), ('hip height', (M[:, LHIP, 1] + M[:, RHIP, 1]) / 2), ('leading wrist x', M[:, RWR, 0]), ('trailing wrist x', M[:, LWR, 0])): print(f'  {label:17s}', v)
print('\nThe split step, lined up on the top of the hop (seconds from the top)')
for nm, L in split.items():
    L = np.array(L); M = np.median(L, 0)
    print(f'  {nm} (n={len(L)})'); print('    t          ', (np.arange(11) - 5) / PH); print('    feet up    ', M[0]); print('    hip height ', M[1]); print('    ankles apart', M[2])
