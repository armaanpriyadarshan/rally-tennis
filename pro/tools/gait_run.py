# Running straight, measured from 3D motion capture: the numbers footage shot from behind the
# court cannot give. Reads ASF skeletons and AMC motions from the CMU Graphics Lab Motion
# Capture Database (mocap.cs.cmu.edu, free for any use) and prints step rate, ground contact,
# where the foot lands and leaves, ankle lift, hip rise, lean and arm swing against speed,
# rescaled to a 1.85 m player. js/figure.js's straight-running GAIT numbers are read off it.
#   python3 -I tools/gait_run.py <dir holding NN.asf and NN_TT.amc files>
# Used: subject 9 trials 1,3,5,7; 16: 15,21,35,36,45,55,56; 35: 17,19,21; 127: 3,6,7.
import sys, glob, os, math
import numpy as np
def rot(ax, ay, az):
    cx, sx, cy, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx
def read_asf(path):
    L = [l.strip() for l in open(path, errors='replace') if l.strip() and not l.startswith('#')]
    bones = {'root': dict(name='root', dir=np.zeros(3), length=0.0, C=np.eye(3), dof=['tx', 'ty', 'tz', 'rx', 'ry', 'rz'], children=[], parent=None)}
    i = 0; unit = 0.45
    while i < len(L):
        l = L[i]
        if l.startswith('length') and i < 12: unit = float(l.split()[1])
        if l == ':bonedata':
            i += 1
            while i < len(L) and not L[i].startswith(':hierarchy'):
                if L[i] == 'begin':
                    b = dict(dof=[], children=[], parent=None, C=np.eye(3)); i += 1
                    while L[i] != 'end':
                        k = L[i].split()
                        if k[0] == 'name': b['name'] = k[1]
                        elif k[0] == 'direction': b['dir'] = np.array([float(x) for x in k[1:4]])
                        elif k[0] == 'length': b['length'] = float(k[1])
                        elif k[0] == 'axis': b['C'] = rot(*[math.radians(float(x)) for x in k[1:4]])
                        elif k[0] == 'dof': b['dof'] = k[1:]
                        i += 1
                    bones[b['name']] = b
                i += 1
            continue
        if l == ':hierarchy':
            i += 2
            while i < len(L) and L[i] != 'end':
                k = L[i].split()
                for c in k[1:]: bones[k[0]]['children'].append(c); bones[c]['parent'] = k[0]
                i += 1
        i += 1
    return bones, (1.0 / unit) * 0.0254
def read_amc(path):
    frames = []; cur = None
    for l in open(path, errors='replace'):
        l = l.strip()
        if not l or l[0] in '#:': continue
        k = l.split()
        if len(k) == 1 and k[0].isdigit(): cur = {}; frames.append(cur); continue
        if cur is not None: cur[k[0]] = [float(x) for x in k[1:]]
    return frames
def pose(bones, fr, scale):
    P = {}; M = {}
    r = fr['root']; P['root'] = np.array(r[:3]) * scale; M['root'] = rot(*[math.radians(x) for x in r[3:6]])
    stack = list(bones['root']['children'])
    while stack:
        n = stack.pop(); b = bones[n]; a = [0.0, 0.0, 0.0]; v = fr.get(n, [])
        for d, x in zip(b['dof'], v): a['rx ry rz'.split().index(d)] = math.radians(x)
        M[n] = M[b['parent']] @ b['C'] @ rot(*a) @ b['C'].T
        P[n] = P[b['parent']] + (M[n] @ b['dir']) * b['length'] * scale
        stack.extend(b['children'])
    return P
def load(asf, amc, step=2):
    bones, scale = read_asf(asf); F = read_amc(amc)[::step]
    names = ['root', 'lhipjoint', 'rhipjoint', 'lfemur', 'rfemur', 'ltibia', 'rtibia', 'lfoot', 'rfoot', 'ltoes', 'rtoes', 'lowerback', 'thorax', 'lowerneck', 'head', 'lclavicle', 'rclavicle', 'lhumerus', 'rhumerus', 'lradius', 'rradius', 'lwrist', 'rwrist']
    out = {n: [] for n in names}
    for fr in F:
        P = pose(bones, fr, scale)
        for n in names: out[n].append(P[n])
    return {n: np.array(v) for n, v in out.items()}, 120.0 / step

base = sys.argv[1]
np.set_printoptions(precision=2, suppress=True, linewidth=220)
rows = []
for f in sorted(glob.glob(base + '/*.amc')):
    tag = os.path.basename(f)[:-4]; subj = tag.split('_')[0]
    J, hz = load(f'{base}/{subj}.asf', f, 2)
    n = len(J['root'])
    if n < 30: continue
    floor = min(J['ltoes'][:, 1].min(), J['rtoes'][:, 1].min())
    height = np.percentile(J['head'][:, 1], 90) - floor + 0.06; k = 1.85 / height
    hip = (J['lhipjoint'] + J['rhipjoint']) / 2
    # direction of travel: these are straight runs, so the line from start to finish
    d = hip[-1] - hip[0]; d[1] = 0; dist = np.linalg.norm(d); path = np.sum(np.linalg.norm(np.diff(hip[:, [0, 2]], axis=0), axis=1))
    if dist < 1.5 or dist / path < 0.93: continue
    u0 = d / dist; fwd = np.tile(u0, (n, 1)); side = np.tile(np.array([u0[2], 0, -u0[0]]), (n, 1))
    w = 3; core = slice(w, n - w)
    along = hip @ u0; sp = np.gradient(np.convolve(along, np.ones(9) / 9, 'same')) * hz; sp[:5] = sp[5]; sp[-5:] = sp[-6]
    face = np.cross(J['lhipjoint'] - J['rhipjoint'], [0, 1, 0])
    face[:, 1] = 0; face /= np.linalg.norm(face, axis=1)[:, None]
    facing = float(np.median(np.sum(face * fwd, 1)[core]))
    A = {s: J[s + 'tibia'] for s in 'lr'}                                   # ankles
    rel = {s: np.sum((A[s] - hip) * fwd, 1) * k for s in 'lr'}; lat = {s: np.sum((A[s] - hip) * side, 1) * k for s in 'lr'}
    hgt = {s: (A[s][:, 1] - floor) * k for s in 'lr'}
    av = {s: np.linalg.norm(np.gradient(A[s][:, [0, 2]], axis=0) * hz, axis=1) for s in 'lr'}
    # a foot is down while the ball of the foot is on the floor and not travelling
    B = {s: J[s + 'foot'] for s in 'lr'}; bh = {s: B[s][:, 1] - B[s][:, 1].min() for s in 'lr'}
    bv = {s: np.linalg.norm(np.gradient(B[s][:, [0, 2]], axis=0) * hz, axis=1) for s in 'lr'}
    stance = {s: (bv[s] < 0.35 * np.maximum(np.abs(sp), 0.3)) & (bh[s] < 0.045) for s in 'lr'}
    # touchdowns and toe-offs; the stride time is the gap between one foot's landings (or twice the gap to the other foot's)
    td, to, tdt = [], [], {'l': [], 'r': []}; dur = []
    for s in 'lr':
        st = stance[s]; i0 = None
        for i in range(1, n):
            if st[i] and not st[i - 1]: tdt[s].append(i / hz); i0 = i; (td.append(rel[s][i]) if w <= i < n - w else None)
            if not st[i] and st[i - 1]:
                if w <= i < n - w: to.append(rel[s][i - 1])
                if i0 is not None and i - i0 > 2: dur.append((i - i0) / hz)
    strides = [b - a for s in 'lr' for a, b in zip(tdt[s], tdt[s][1:]) if 0.3 < b - a < 2.5]
    allt = sorted(tdt['l'] + tdt['r']); steps = [b - a for a, b in zip(allt, allt[1:]) if 0.12 < b - a < 1.2]
    T0 = np.median(strides) if strides else (2 * np.median(steps) if steps else float('nan'))
    f0 = 1 / T0 if T0 == T0 else float('nan')
    duty = float(np.median(dur) / T0) if dur and T0 == T0 else float('nan')
    sh = (J['lclavicle'] + J['rclavicle']) / 2; trunk = sh - hip
    lean = float(np.degrees(np.arctan2(np.median(np.sum(trunk * fwd, 1)[core]), np.median(trunk[core, 1]))))
    wr = {s: np.sum((J[s + 'radius'] - J[s + 'clavicle']) * fwd, 1) * k for s in 'lr'}
    hy = (hip[:, 1] - floor) * k
    rows.append(dict(tag=tag, v=float(np.median(np.abs(sp)[core])), f=float(f0), duty=duty, td=float(np.median(td)) if td else float('nan'), to=float(np.median(to)) if to else float('nan'),
                     lift=float(np.mean([np.percentile(hgt[s][core], 97) - hgt[s].min() for s in 'lr'])), ank0=float(np.mean([hgt[s].min() for s in 'lr'])),
                     hip=float(np.median(hy[core])), bob=float(np.percentile(hy[core], 95) - np.percentile(hy[core], 5)), lean=lean, width=float(np.median(np.abs(lat['l'] - lat['r'])[core])),
                     arm=float(np.mean([(np.percentile(wr[s][core], 95) - np.percentile(wr[s][core], 5)) / 2 for s in 'lr'])), facing=facing, height=height, T=n / hz))
print('trial     dir   m/s  cycles/s duty  lands  leaves  lift   hip    bob   lean  width  arm    (subject height, seconds)')
for r in sorted(rows, key=lambda r: (r['facing'] < 0, r['v'])):
    print(f"{r['tag']:8s} {'back' if r['facing'] < 0 else 'fwd ':4s} {r['v']:5.2f}  {r['f']:.2f}    {r['duty']:.2f}  {r['td']:+.2f}  {r['to']:+.2f}   {r['lift']:.2f}   {r['hip']:.2f}   {r['bob']:.3f} {r['lean']:5.1f}  {r['width']:.2f}   {r['arm']:.2f}   ({r['height']:.2f} m, {r['T']:.1f} s)")
import warnings; warnings.simplefilter('ignore')
F = [r for r in rows if r['facing'] > 0 and r['v'] > 2.4 and r['v'] < 5 and not r['tag'].startswith('143') and not math.isnan(r['td']) and not math.isnan(r['f'])]
v = np.array([r['v'] for r in F])
for key in ('f', 'duty', 'lift', 'td', 'to', 'bob', 'lean', 'arm', 'hip'):
    y = np.array([r[key] for r in F]); a, b = np.polyfit(v, y, 1); print(f'  {key:5s} = {b:+.3f} {a:+.3f} * v   (rms {np.sqrt(np.mean((np.polyval([a, b], v) - y) ** 2)):.3f}, v {v.min():.1f}-{v.max():.1f})')
