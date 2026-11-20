# Movement from 3D motion capture: turns ASF/AMC trials from the CMU Graphics Lab Motion Capture
# Database (mocap.cs.cmu.edu, free for any use) into the looping clips of joint positions that
# js/figure.js plays under a player's feet — walk, jog, run, sprint, backpedal, the side shuffle
# and the ready stance. Every clip is rescaled to a 1.85 m body and written in the body's own
# frame: x to his right, y up from the ground, z the way he faces, the point under his hips at
# the origin. A clip also records how fast the body really travelled, so the game can play it at
# the speed the feet actually cover ground.
#   python3 -I tools/mocap_clips.py <out.js> <dir with NN.asf / NN_TT.amc> [more dirs]
# Trials used: 16_15 walk, 16_36 jog, 127_07 (or 16_45) run, 143_01 sprint, 143_39 backwards,
# 78_30 basketball defensive slides (the side shuffle and the low ready stance).
import sys, os, math, json
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

# the game's joints, and the end of which mocap bone each one is
JOINTS = ['pelvis', 'lhip', 'rhip', 'lknee', 'rknee', 'lankle', 'rankle', 'ltoe', 'rtoe', 'neck', 'head', 'lsho', 'rsho', 'lelb', 'relb', 'lwri', 'rwri', 'lhand', 'rhand']
BONE = dict(pelvis='root', lhip='lhipjoint', rhip='rhipjoint', lknee='lfemur', rknee='rfemur', lankle='ltibia', rankle='rtibia', ltoe='lfoot', rtoe='rfoot', neck='thorax', head='head',
            lsho='lclavicle', rsho='rclavicle', lelb='lhumerus', relb='rhumerus', lwri='lradius', rwri='rradius', lhand='lhand', rhand='rhand')
FPS = 60

def find(dirs, name):
    for d in dirs:
        p = os.path.join(d, name)
        if os.path.exists(p): return p
    raise SystemExit('missing ' + name)

def load(dirs, trial):
    sub = trial.split('_')[0]
    bones, scale = read_asf(find(dirs, sub + '.asf')); F = read_amc(find(dirs, trial + '.amc'))[::2]         # 120 -> 60 frames a second
    # how tall he stands: the skeleton with every joint at rest
    rest = pose(bones, {'root': [0, 0, 0, 0, 0, 0]}, scale)
    tall = rest['head'][1] - min(rest['ltoes'][1], rest['rtoes'][1]) + 0.10                                    # the head bone ends at the crown's centre, the toes above the sole
    k = 1.85 / tall
    J = np.array([[pose(bones, fr, scale)[BONE[j]] for j in JOINTS] for fr in F]) * k                           # frames x joints x 3
    return J

def body_frame(J):
    """Each frame in the body's own frame. Returns joints, and the body's velocity (right, forward) in m/s."""
    n = len(J); ix = {j: i for i, j in enumerate(JOINTS)}
    right = J[:, ix['rhip']] - J[:, ix['lhip']]; right[:, 1] = 0; right /= np.linalg.norm(right, axis=1)[:, None]
    fwd = np.stack([-right[:, 2], np.zeros(n), right[:, 0]], 1)
    toes = (J[:, ix['ltoe']] + J[:, ix['rtoe']]) / 2 - (J[:, ix['lankle']] + J[:, ix['rankle']]) / 2; toes[:, 1] = 0
    if np.sum(fwd * toes, 1).mean() < 0: fwd = -fwd
    yaw = np.unwrap(np.arctan2(fwd[:, 0], fwd[:, 2]))
    # the way he faces, without the swing of the hips inside each step
    w = int(FPS * 0.5) | 1; pad = np.pad(yaw, w // 2, mode='edge'); yaw_s = np.convolve(pad, np.ones(w) / w, 'valid')
    floor = np.percentile(np.minimum(J[:, ix['ltoe'], 1], J[:, ix['rtoe'], 1]), 5)
    out = np.zeros_like(J); vel = np.zeros((n, 2))
    root = J[:, ix['pelvis']].copy(); v = np.gradient(root, axis=0) * FPS
    for f in range(n):
        c, s = math.cos(yaw_s[f]), math.sin(yaw_s[f]); fx, fz = s, c; rx, rz = c, -s      # forward and right on the ground
        if abs(fx * (-rz) + fz * rx) < 0: pass
        d = J[f] - root[f]; d[:, 1] = J[f][:, 1] - floor
        # right-handed frame: x right, y up, z forward
        out[f, :, 0] = d[:, 0] * rx + d[:, 2] * rz; out[f, :, 1] = d[:, 1]; out[f, :, 2] = d[:, 0] * fx + d[:, 2] * fz
        vel[f] = [v[f, 0] * rx + v[f, 2] * rz, v[f, 0] * fx + v[f, 2] * fz]
    # which way is "right": check the right hip really has the larger x
    if (out[:, ix['rhip'], 0] - out[:, ix['lhip'], 0]).mean() < 0: out[:, :, 0] *= -1; vel[:, 0] *= -1
    return fix_legs(out), vel

def ik2(a, t, l1, l2, pole):
    """The middle joint of a two-bone limb from a to t, bending toward `pole`."""
    d = t - a; L = np.linalg.norm(d); L = min(L, (l1 + l2) * 0.999); u = d / (np.linalg.norm(d) + 1e-9)
    x = (l1 * l1 - l2 * l2 + L * L) / (2 * L); h = math.sqrt(max(0.0, l1 * l1 - x * x))
    p = pole - u * np.dot(pole, u); p = p / (np.linalg.norm(p) + 1e-9)
    return a + u * x + p * h

def fix_legs(P):
    """The database's skeleton is fitted with legs a little too long, so it never straightens them: it
    stands and walks on bent knees (nearly 50 degrees with the foot flat under the hip). Keep each hip
    and ankle where they were and put the knee back with a leg only a little longer than the usual
    distance from hip to ankle, so that it is close to straight under the body; at the very end of a
    push-off, where a real foot points and this one cannot, the game lets the ankle come up short."""
    ix = {j: i for i, j in enumerate(JOINTS)}; out = P.copy()
    reach = max(np.percentile(np.linalg.norm(P[:, ix[s + 'ankle']] - P[:, ix[s + 'hip']], axis=1), 62) for s in 'lr') * 1.03
    for f in range(len(P)):
        for s in 'lr':
            h, k, a = ix[s + 'hip'], ix[s + 'knee'], ix[s + 'ankle']
            out[f, k] = ik2(P[f, h], P[f, a], reach * 0.5, reach * 0.5, P[f, k] - (P[f, h] + P[f, a]) / 2)
    return out

def strikes(P, vel, foot):
    """Frames where a foot comes down: where it reaches furthest ahead of the hips along the way the body is travelling."""
    ix = JOINTS.index(foot); d = vel.mean(0); d = d / (np.linalg.norm(d) + 1e-9)
    r = P[:, ix, 0] * d[0] + P[:, ix, 2] * d[1]; r = np.convolve(np.pad(r, 2, mode='edge'), np.ones(5) / 5, 'valid')
    return [f for f in range(1, len(r) - 1) if r[f] >= r[max(0, f - 4):f + 5].max() - 1e-9 and r[f] > np.percentile(r, 55)]

def loop(P, vel, a, b, blend=0.14):
    """One cycle, frames a..b, made to close on itself: the last stretch eases into the frames before the start."""
    n = b - a; out = P[a:b].copy(); k = max(2, int(n * blend))
    for i in range(k):
        w = (i + 1) / (k + 1); pre = P[a - k + i] if a - k + i >= 0 else P[a]
        out[n - k + i] = out[n - k + i] * (1 - w) + pre * w
    return out, vel[a:b].mean(0)

def best_cycle(P, vel, foot, want=None, steps=2):
    """The stretch between two strikes of the same foot whose two ends look most alike, at steady speed."""
    ev = strikes(P, vel, foot); best = None
    for i in range(len(ev)):
        for j in range(i + 1, len(ev)):
            a, b = ev[i], ev[j]; n = b - a
            if n < FPS * 0.3 or n > FPS * 1.4: continue
            if want is not None and not want(vel[a:b].mean(0)): continue
            err = np.linalg.norm(P[a] - P[b], axis=1).mean() + 0.05 * np.std(np.linalg.norm(vel[a:b], axis=1))
            if best is None or err < best[0]: best = (err, a, b)
    return best

def tennis(P, lean_keep, lean_add, lift):
    """A basketball defender slides bent far forward and very low; a tennis player does the same footwork
    more upright. Keep the legs' action, stand the trunk up, and raise the hips a little."""
    ix = {j: i for i, j in enumerate(JOINTS)}; out = P.copy()
    upper = [ix[j] for j in ('neck', 'head', 'lsho', 'rsho', 'lelb', 'relb', 'lwri', 'rwri', 'lhand', 'rhand')]
    for f in range(len(P)):
        hip = (P[f, ix['lhip']] + P[f, ix['rhip']]) / 2; nk = P[f, ix['neck']]
        lean = math.atan2(nk[2] - hip[2], nk[1] - hip[1]); d = (lean * lean_keep + lean_add) - lean; c, sn = math.cos(d), math.sin(d)
        for k in upper:
            dy, dz = P[f, k, 1] - hip[1], P[f, k, 2] - hip[2]
            out[f, k, 1] = hip[1] + dy * c - dz * sn + lift; out[f, k, 2] = hip[2] + dy * sn + dz * c
        for k in (ix['pelvis'], ix['lhip'], ix['rhip']): out[f, k, 1] += lift
        for sd in 'lr':
            h, kn, an = ix[sd + 'hip'], ix[sd + 'knee'], ix[sd + 'ankle']
            l1 = np.linalg.norm(P[f, kn] - P[f, h]); l2 = np.linalg.norm(P[f, an] - P[f, kn])
            out[f, kn] = ik2(out[f, h], P[f, an], l1, l2, P[f, kn] - (P[f, h] + P[f, an]) / 2)
    return out

def mirror(P):
    out = P.copy(); out[:, :, 0] *= -1
    for i, j in enumerate(JOINTS):
        if j[0] == 'l' and ('r' + j[1:]) in JOINTS: k = JOINTS.index('r' + j[1:]); out[:, [i, k]] = out[:, [k, i]]
    return out

def main():
    outp, dirs = sys.argv[1], sys.argv[2:]
    clips = {}; report = []
    def add(name, P, v, note):
        clips[name] = dict(n=len(P), v=[round(float(v[0]), 3), round(float(v[1]), 3)], J=np.round(P, 3).reshape(len(P), -1).tolist())
        report.append('%-9s %3d frames (%.2f s)  travels right %+.2f forward %+.2f m/s  hips %.2f-%.2f m  %s' % (name, len(P), len(P) / FPS, v[0], v[1], P[:, 0, 1].min(), P[:, 0, 1].max(), note))
    for name, trials in [('walk', ['16_15']), ('jog', ['16_36', '16_35']), ('run', ['127_07', '16_45', '35_21', '09_05']), ('sprint', ['143_01', '127_07']), ('back', ['143_39'])]:
        got = None
        for trial in trials:
            P, vel = body_frame(load(dirs, trial))
            want = (lambda v: v[1] < -1.1) if name == 'back' else None
            for foot in ('lankle', 'rankle'):
                b = best_cycle(P, vel, foot, want)
                if b and (got is None or b[0] < got[0][0]): got = (b, P, vel, trial, foot)
            if got: break
        if not got: raise SystemExit('no cycle for ' + name)
        b, P, vel, trial, foot = got
        C, v = loop(P, vel, b[1], b[2])
        if foot == 'rankle': C = mirror(C); v = np.array([-v[0], v[1]])                       # every forward clip starts on the same foot, so they can be mixed
        add(name, C, v, trial + ' frames %d-%d, ends differ %.3f m' % (b[1], b[2], b[0]))
    # the side shuffle: travelling to his right, low, feet never crossing; its mirror goes left
    P, vel = body_frame(load(dirs, '78_30'))
    b = best_cycle(P, vel, 'rankle', lambda v: v[0] > 1.7 and abs(v[1]) < 0.9)
    if not b: raise SystemExit('no shuffle cycle')
    C, v = loop(P, vel, b[1], b[2]); C = tennis(C, 0.45, 0.10, 0.04); add('shuffleR', C, v, '78_30 frames %d-%d, ends differ %.3f m; trunk stood up' % (b[1], b[2], b[0]))
    M = mirror(C); add('shuffleL', M, [-v[0], v[1]], 'mirror of shuffleR')
    # the ready stance: the stillest half second of the same trial, made symmetric
    sp = np.linalg.norm(vel, axis=1); w = FPS // 2; i = int(np.argmin(np.convolve(sp, np.ones(w) / w, 'valid')))
    still = P[i:i + w].mean(0, keepdims=True); still = (still + mirror(still)) / 2; still = tennis(still, 0.40, 0.10, 0.07)
    add('ready', still, [0, 0], '78_30 frames %d-%d, averaged with its mirror; trunk stood up' % (i, i + w))
    # standing between points: the walk at the moment the feet pass, made symmetric
    Pw, _ = body_frame(load(dirs, '16_15')); ixa = JOINTS.index('lankle'), JOINTS.index('rankle')
    gap = np.abs(Pw[:, ixa[0], 2] - Pw[:, ixa[1], 2]) + np.abs(Pw[:, ixa[0], 1] - Pw[:, ixa[1], 1]) * 3; f = int(np.argmin(gap))
    st = Pw[f:f + 1]; st = (st + mirror(st)) / 2
    ix = {j: i for i, j in enumerate(JOINTS)}; q = st[0]; hips = []
    for sd, sx in (('l', -1), ('r', 1)):
        h, k, a, t = ix[sd + 'hip'], ix[sd + 'knee'], ix[sd + 'ankle'], ix[sd + 'toe']
        l1 = np.linalg.norm(q[k] - q[h]); l2 = np.linalg.norm(q[a] - q[k])
        q[a] = [sx * 0.125, q[a][1], -0.01]; q[t] = [sx * 0.155, q[t][1], 0.125]                      # feet apart, toes a little out
        hips.append((h, k, a, l1, l2, sx))
        sh, e, w, hd = ix[sd + 'sho'], ix[sd + 'elb'], ix[sd + 'wri'], ix[sd + 'hand']
        ua = np.linalg.norm(q[e] - q[sh]); fa = np.linalg.norm(q[w] - q[e])
        d1 = np.array([sx * 0.16, -1.0, -0.06]); d1 /= np.linalg.norm(d1); d2 = np.array([-sx * 0.05, -1.0, 0.36]); d2 /= np.linalg.norm(d2)
        q[e] = q[sh] + d1 * ua; q[w] = q[e] + d2 * fa; q[hd] = q[w] + d2 * 0.08
    # stand tall: the hips at the height that leaves the knees just soft
    h0, k0, a0, l1, l2, _ = hips[0]; want = q[a0][1] + math.sqrt(max(0.0, (0.988 * (l1 + l2)) ** 2 - (q[a0][0] - q[h0][0]) ** 2 - (q[a0][2] - q[h0][2]) ** 2)); lift = want - q[h0][1]
    for k in (ix['pelvis'], ix['lhip'], ix['rhip'], ix['neck'], ix['head'], ix['lsho'], ix['rsho'], ix['lelb'], ix['relb'], ix['lwri'], ix['rwri'], ix['lhand'], ix['rhand']): q[k][1] += lift
    for h, k, a, l1, l2, sx in hips: q[k] = ik2(q[h], q[a], l1, l2, np.array([sx * 0.15, 0.0, 1.0]))
    add('stand', st, [0, 0], '16_15 frame %d, averaged with its mirror; feet set apart, arms eased' % f)
    head = ('// Movement measured by 3D motion capture (CMU Graphics Lab Motion Capture Database, free for any use),\n'
            '// rescaled to a 1.85 m body. Each clip is one cycle that closes on itself: frames of joint positions\n'
            '// (metres; x to his right, y up from the ground, z the way he faces; origin under the hips), and v, the\n'
            '// speed the body really travelled (right, forward) in m/s. Built by tools/mocap_clips.py.\n')
    with open(outp, 'w') as f:
        f.write(head + 'export const LOCO_JOINTS = ' + json.dumps(JOINTS) + ';\nexport const LOCO_FPS = %d;\nexport const LOCO = {\n' % FPS)
        for k, c in clips.items(): f.write(' %s: { n: %d, v: %s, J: %s },\n' % (k, c['n'], json.dumps(c['v']), json.dumps(c['J'], separators=(',', ':'))))
        f.write('};\n')
    print('\n'.join(report)); print('wrote', outp, os.path.getsize(outp) // 1024, 'kB')

main()
