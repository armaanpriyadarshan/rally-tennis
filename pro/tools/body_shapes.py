# Rally Pro — each player's own body, from MakeHuman's body model, carried onto the game's one body mesh.
#
#   python3 -I tools/body_shapes.py <MPFB 2 extension dir> [--calibrate] [--dry]
#
# The game has one rigged body (the Rocketbox avatar in assets/people/m04.glb). MakeHuman's base mesh and its
# targets (CC0; read here straight from the MPFB 2 Blender extension's data folder, no code of it is run) can
# be set to any man's build: muscle, weight, and regional shapes (each arm's biceps and forearm, deltoids,
# chest, lats, thighs, calves, glutes, waist). For each player this script:
#   1. builds his MakeHuman body: muscle judged from photographs, his traits as modifiers over a shared tour-player
#      base, and weight solved so that MakeHuman's body at his height weighs his listed playing weight;
#   2. lays MakeHuman's body onto the game model's bind pose, segment by segment along the skeleton (its own
#      rig weights blend the segments), so the two bodies coincide;
#   3. takes, for every vertex of the game's body, the nearest point of a reference MakeHuman body that matches
#      the game model as it is (REF, fitted with --calibrate), on the same part of the body;
#   4. moves that vertex by how far the player's body differs from the reference there; and records the step from
#      each vertex onto the reference, which the game takes where his kit leaves the skin bare, so bare forearms
#      and legs are MakeHuman's own surface rather than the model's.
# Limb lengths stay the skeleton's: these targets do not move MakeHuman's joints, except the width of the
# shoulders, which is returned separately (the game moves the arm bones out by it).
# Writes assets/people/m04_shapes.bin (int16 blocks over the body mesh's vertices, in file order: the step onto the
# reference, how bare each vertex is, then each player's offsets) and BODY_SHAPES / BODY_INFO in js/bodydata.js.
# The game applies a player's block to his own copy of the body at load (people.js, Person.applyShape).
# Light: about 300 MB and ten seconds; run it with nice.
import gzip, json, os, struct, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); PRO = os.path.dirname(HERE)
args = [a for a in sys.argv[1:] if not a.startswith('--')]; flags = {a for a in sys.argv[1:] if a.startswith('--')}
MPFB = args[0] if args else '/tmp/rally-work/mpfb-data'

# ---------------------------------------------------------------- MakeHuman data
class MH:
    def __init__(self, root):
        self.root = root; d = os.path.join(root, 'data'); V, F, grp = [], [], None
        with open(os.path.join(d, '3dobjs', 'base.obj')) as f:
            for line in f:
                if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
                elif line.startswith('g '): grp = line.split()[1]
                elif line.startswith('f ') and grp == 'body': F.append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
        self.V = np.array(V) * 0.1                                   # decimetres -> metres; y up, facing +z, his left +x
        self.T = np.array([[f[0], f[k], f[k + 1]] for f in F for k in range(1, len(f) - 1)])
        self.groups = json.load(open(os.path.join(d, 'mesh_metadata', 'basemesh_vertex_groups.json')))
        self.nbody = 13380
        self.macro = json.load(open(os.path.join(d, 'targets', 'macrodetails', 'macro.json')))
        self.weights = json.load(open(os.path.join(d, 'rigs', 'standard', 'weights.default.json')))['weights']
        self._t = {}
    def gidx(self, name): return np.concatenate([np.arange(a, b + 1) for a, b in self.groups[name]])
    def target(self, name):
        if name not in self._t:
            idx, off = [], []
            with gzip.open(os.path.join(self.root, 'data', 'targets', name + '.target.gz'), 'rt') as f:
                for line in f:
                    q = line.split()
                    if len(q) == 4 and q[0][0] != '#': idx.append(int(q[0])); off.append([float(q[1]), float(q[2]), float(q[3])])
            self._t[name] = (np.array(idx, np.int64), np.array(off).reshape(-1, 3) * 0.1)
        return self._t[name]
    def _interp(self, k, v):
        out = []
        for p in self.macro['macrotargets'][k]['parts']:
            if p['lowest'] < v < p['highest']:
                t = (v - p['lowest']) / (p['highest'] - p['lowest'])
                if p['low']: out.append([p['low'], round(1 - t, 4)])
                if p['high']: out.append([p['high'], round(t, 4)])
        return out
    def macro_stack(self, mi, cutoff=0.01):
        # as MPFB 2.0.18 TargetService.calculate_target_stack_from_macro_info_dict, for a man
        C = {k: self._interp(k, mi[k]) for k in ('gender', 'age', 'muscle', 'weight', 'proportions', 'height')}; out = []
        for race, rv in mi['race'].items():
            for a in C['age']:
                for g in C['gender']:
                    if rv * g[1] * a[1] > cutoff: out.append(['macrodetails/%s-%s-%s' % (race, g[0], a[0]), rv * g[1] * a[1]])
        for g in C['gender']:
            for a in C['age']:
                for m in C['muscle']:
                    for w in C['weight']:
                        k = g[1] * a[1] * m[1] * w[1]
                        if k > cutoff: out.append(['macrodetails/universal-%s-%s-%s-%s' % (g[0], a[0], m[0], w[0]), k])
                        for h in C['height']:
                            if k * h[1] > cutoff: out.append(['macrodetails/height/%s-%s-%s-%s-%s' % (g[0], a[0], m[0], w[0], h[0]), k * h[1]])
                        for p in C['proportions']:
                            if k * p[1] > cutoff: out.append(['macrodetails/proportions/%s-%s-%s-%s-%s' % (g[0], a[0], m[0], w[0], p[0]), k * p[1]])
        return out
    def shape(self, muscle, weight, mods=None):
        mi = {'gender': 1.0, 'age': 0.5, 'muscle': muscle, 'weight': weight, 'proportions': 0.5, 'height': 0.5, 'race': {'caucasian': 1.0}}
        V = self.V.copy()
        for name, w in self.macro_stack(mi):
            i, o = self.target(name); V[i] += w * o
        for name, v in (mods or {}).items():
            if abs(v) < 1e-6: continue
            d, b = name.rsplit('/', 1); i, o = self.target('%s/%s-%s' % (d, b, 'incr' if v > 0 else 'decr')); V[i] += abs(v) * o
        return V
    def joint(self, V, n): return V[self.gidx('joint-' + n)].mean(0)

# ---------------------------------------------------------------- the game's body
CT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read_glb(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
    o = 20 + n; bl = struct.unpack('<I', b[o:o + 4])[0]; bin_ = b[o + 8:o + 8 + bl]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; nc = NC[a['type']]
        assert not bv.get('byteStride') or bv['byteStride'] == np.dtype(dt).itemsize * nc
        return np.frombuffer(bin_, dt, a['count'] * nc, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], nc).copy()
    prims = [dict({k: acc(v) for k, v in p['attributes'].items()}, indices=acc(p['indices']).reshape(-1, 3), material=j['materials'][p['material']]['name'])
             for m in j['meshes'] for p in m['primitives']]
    skin = j['skins'][0]; names = [j['nodes'][k]['name'].replace('Bip01 ', '') for k in skin['joints']]
    ibm = acc(skin['inverseBindMatrices']).reshape(-1, 4, 4)
    joints = {nm: np.linalg.inv(m.T)[:3, 3] for nm, m in zip(names, ibm)}        # bind-space position of every bone
    return prims, names, joints

# ---------------------------------------------------------------- body segments and their joints
SIDES = ('L', 'R')
SEGS = ['torso', 'neck', 'head'] + [p + s for s in SIDES for p in ('clav', 'uarm', 'farm', 'hand', 'thigh', 'calf', 'foot')]
SI = {s: i for i, s in enumerate(SEGS)}
def mh_seg(bone):
    b, s = (bone[:-2], bone[-1]) if bone[-2:] in ('.L', '.R') else (bone, '')
    if b in ('root', 'pelvis', 'breast') or b.startswith('spine'): return 'torso'
    if b.startswith('neck'): return 'neck'
    for pre, seg in (('clavicle', 'clav'), ('shoulder', 'clav'), ('upperarm', 'uarm'), ('lowerarm', 'farm'), ('wrist', 'hand'), ('metacarpal', 'hand'),
                     ('finger', 'hand'), ('upperleg', 'thigh'), ('lowerleg', 'calf'), ('foot', 'foot'), ('toe', 'foot')):
        if b.startswith(pre) and s: return seg + s
    return 'head'
def m04_seg(bone):
    if bone in ('Pelvis', 'Spine', 'Spine1', 'Spine2'): return 'torso'
    if bone == 'Neck': return 'neck'
    if bone[:2] in ('L ', 'R '):
        s, b = bone[0], bone[2:]
        for pre, seg in (('Clavicle', 'clav'), ('UpperArm', 'uarm'), ('Forearm', 'farm'), ('Hand', 'hand'), ('Finger', 'hand'), ('Thigh', 'thigh'), ('Calf', 'calf'), ('Foot', 'foot'), ('Toe', 'foot')):
            if b.startswith(pre): return seg + s
    return 'head'
# each segment from joint to joint: (MakeHuman joint cubes, the game model's bones)
def seg_ends(s):
    if s == 'torso': return ('pelvis', 'neck'), ('Pelvis', 'Neck')
    if s == 'neck': return ('neck', 'head'), ('Neck', 'Head')
    if s == 'head': return None, None
    S, x = s[-1], s[-1].lower(); k = s[:-1]
    return {'clav': ((x + '-clavicle', x + '-shoulder'), (S + ' Clavicle', S + ' UpperArm')),
            'uarm': ((x + '-shoulder', x + '-elbow'), (S + ' UpperArm', S + ' Forearm')),
            'farm': ((x + '-elbow', x + '-hand'), (S + ' Forearm', S + ' Hand')),
            'hand': ((x + '-hand', x + '-finger-3-1'), (S + ' Hand', S + ' Finger2')),
            'thigh': ((x + '-upper-leg', x + '-knee'), (S + ' Thigh', S + ' Calf')),
            'calf': ((x + '-knee', x + '-ankle'), (S + ' Calf', S + ' Foot')),
            'foot': ((x + '-ankle', x + '-toe-3-1'), (S + ' Foot', S + ' Toe0'))}[k]
def swing(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(a @ b); K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)

class Fit:
    """MakeHuman's body laid onto the game model's skeleton: one transform per segment, blended by MakeHuman's rig weights."""
    def __init__(self, mh, Vref, J4, H4):
        n = mh.nbody; W = np.zeros((n, len(SEGS)))
        for bone, lst in mh.weights.items():
            k = SI[mh_seg(bone)]
            for vi, w in lst:
                if vi < n: W[vi, k] += w
        W[W.sum(1) == 0, SI['torso']] = 1; self.W = W / W.sum(1, keepdims=True)
        top = Vref[:n, 1].max(); bot = Vref[:n, 1].min(); self.s = H4 / (top - bot)      # girth scales with height
        self.A, self.L, self.a = [], [], []
        for sname in SEGS:
            mj, gj = seg_ends(sname)
            if mj is None:                                                               # the head: carried with the neck's top
                a = mh.joint(Vref, 'head'); A = J4['Head']; L = np.eye(3) * self.s
            else:
                a, b = mh.joint(Vref, mj[0]), mh.joint(Vref, mj[1]); A, B = J4[gj[0]], J4[gj[1]]
                u = (b - a) / np.linalg.norm(b - a); par = np.linalg.norm(B - A) / np.linalg.norm(b - a)
                L = swing(b - a, B - A) @ (par * np.outer(u, u) + self.s * (np.eye(3) - np.outer(u, u)))
            self.A.append(A); self.L.append(L); self.a.append(a)
        self.A, self.L, self.a = np.array(self.A), np.array(self.L), np.array(self.a)
    def place(self, V):
        V = V[:len(self.W)]
        P = self.A[None] + np.einsum('sij,nsj->nsi', self.L, V[:, None, :] - self.a[None])   # (n, seg, 3)
        return np.einsum('ns,nsi->ni', self.W, P)
    def carry(self, D):
        """an offset at each MakeHuman vertex, turned as its segments turn"""
        return np.einsum('ns,sij,nj->ni', self.W[:len(D)], self.L, D[:len(self.W)])

def closest_on_tris(p, a, b, c):
    # closest point to p (k,3) on triangles (k,3 each) -> barycentric (k,3); Ericson, Real-Time Collision Detection 5.1.5
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1); bp = p - b; d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1); cp = p - c; d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    den = np.where(np.abs(va + vb + vc) < 1e-30, 1e-30, va + vb + vc); v, w = vb / den, vc / den; B = np.stack([1 - v - w, v, w], 1)
    def put(m, bary):
        B[m] = bary[m]
    sd = lambda x: np.where(np.abs(x) < 1e-30, 1e-30, x)
    t = d1 / sd(d1 - d3); put((vc <= 0) & (d1 >= 0) & (d3 <= 0), np.stack([1 - t, t, 0 * t], 1))
    t = d2 / sd(d2 - d6); put((vb <= 0) & (d2 >= 0) & (d6 <= 0), np.stack([1 - t, 0 * t, t], 1))
    t = (d4 - d3) / sd((d4 - d3) + (d5 - d6)); put((va <= 0) & (d4 - d3 >= 0) & (d5 - d6 >= 0), np.stack([0 * t, 1 - t, t], 1))
    one = np.ones_like(d1); z = 0 * d1
    put((d1 <= 0) & (d2 <= 0), np.stack([one, z, z], 1)); put((d3 >= 0) & (d4 <= d3), np.stack([z, one, z], 1)); put((d6 >= 0) & (d5 <= d6), np.stack([z, z, one], 1))
    return B

def correspond(P, Wp, Q, T, Wq, K=40):
    """for each point of P, the nearest point of the surface (Q, T) on a triangle of a compatible segment: (tri index, barycentric)"""
    Wt = (Wq[T[:, 0]] + Wq[T[:, 1]] + Wq[T[:, 2]]) / 3; C = Q[T].mean(1); tri = np.zeros(len(P), np.int64); bar = np.zeros((len(P), 3)); dist = np.zeros(len(P))
    for s in range(0, len(P), 128):
        p = P[s:s + 128]; d2 = ((p[:, None, :] - C[None]) ** 2).sum(2)
        ok = (Wp[s:s + 128] @ Wt.T) > 0.15; d2[~ok] = np.inf
        cand = np.argpartition(d2, K, 1)[:, :K]
        for r in range(len(p)):
            ti = cand[r][np.isfinite(d2[r, cand[r]])]; t = T[ti]
            Bc = closest_on_tris(np.repeat(p[r:r + 1], len(ti), 0), Q[t[:, 0]], Q[t[:, 1]], Q[t[:, 2]])
            X = (Bc[:, :, None] * Q[t]).sum(1); dd = ((X - p[r]) ** 2).sum(1); k = np.argmin(dd)
            tri[s + r], bar[s + r], dist[s + r] = ti[k], Bc[k], np.sqrt(dd[k])
    return tri, bar, dist

def volume(V, T):
    c = V.mean(0); a, b, d = V[T[:, 0]] - c, V[T[:, 1]] - c, V[T[:, 2]] - c
    return np.einsum('ij,ij->i', a, np.cross(b, d)).sum() / 6

def section(V, T, a, b, t, side=None, xmax=None, rmax=0.25):
    """girth (convex hull of the cut) of a mesh across the axis a->b at fraction t"""
    u = (b - a) / np.linalg.norm(b - a); c = a + (b - a) * t; d = (V - c) @ u; pts = []
    for e0, e1 in ((0, 1), (1, 2), (2, 0)):
        i0, i1 = T[:, e0], T[:, e1]; m = d[i0] * d[i1] < 0; f = d[i0][m] / (d[i0][m] - d[i1][m]); pts.append(V[i0[m]] + (V[i1[m]] - V[i0[m]]) * f[:, None])
    X = np.concatenate(pts)
    if side: X = X[X[:, 0] * side > 0]
    if xmax: X = X[np.abs(X[:, 0]) < xmax]
    r = np.linalg.norm((X - c) - ((X - c) @ u)[:, None] * u, axis=1); X = X[r < rmax]
    e1 = np.cross(u, [0, 0, 1.0]); e1 = e1 / np.linalg.norm(e1) if np.linalg.norm(e1) > 1e-6 else np.array([1.0, 0, 0]); e2 = np.cross(u, e1)
    q = np.stack([(X - c) @ e1, (X - c) @ e2], 1); q = q[np.lexsort((q[:, 1], q[:, 0]))]
    def half(pts):
        h = []
        for p in pts:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0: h.pop()
            h.append(p)
        return h
    if len(q) < 3: return 0.0
    hull = np.array(half(q)[:-1] + half(q[::-1])[:-1]); return float(np.linalg.norm(hull - np.roll(hull, 1, 0), axis=1).sum())

# ---------------------------------------------------------------- the players
RHO = 1.04             # kg per litre of the body's outside volume: lean tissue (about 1.075) with the air in the lungs
# The game model as it is, in MakeHuman's terms. --calibrate (its bare forearms and calves, and the sleeves, shirt
# and shorts with an allowance for cloth) fits about equally well anywhere from muscle 0.4 / weight 0.2 to muscle
# 0.6 / weight 0.5 (7-8 mm rms; the model has thick forearms and calves and thin upper arms for any MakeHuman man):
# the athletic end is taken. It matters little: offsets are differences from it, and bare skin is laid on directly.
REF = {'muscle': 0.60, 'weight': 0.50}
# Each player: height and listed playing weight (the same figures as js/data.js), how muscular he is (MakeHuman's
# muscle, 0.5 an ordinary man, 1 the most), and his own shape (MakeHuman modifiers, -1..1; l- is his left).
# Judged from freely licensed photographs on Wikimedia Commons; weight is then solved from the listed kilograms.
def arms(side_big, up, fore, sh=0.0, other_up=0.0, other_fore=0.0):
    o = 'r' if side_big == 'l' else 'l'
    return {'arms/%s-upperarm-muscle' % side_big: up, 'arms/%s-lowerarm-muscle' % side_big: fore, 'arms/%s-upperarm-shoulder-muscle' % side_big: sh,
            'arms/%s-upperarm-muscle' % o: other_up, 'arms/%s-lowerarm-muscle' % o: other_fore, 'arms/%s-upperarm-shoulder-muscle' % o: sh * 0.8}
def legs(up, low, butt=0.0):
    return {'legs/l-upperleg-muscle': up, 'legs/r-upperleg-muscle': up, 'legs/l-lowerleg-muscle': low, 'legs/r-lowerleg-muscle': low, 'buttocks/buttocks-volume': butt}
# What every tour player shares, under his own traits: the playing forearm and arm built up by years of hitting
# (about two centimetres round the forearm over the other), and a runner's thighs and calves. Added to each player's
# own modifiers, which are relative to it.
def tennis(side):
    return {'arms/%s-lowerarm-muscle' % side: 0.45, 'arms/%s-upperarm-muscle' % side: 0.15, **legs(0.30, 0.20, 0.20)}
def spec_mods(S, side):
    out = dict(tennis(side))
    for k, v in S['mods'].items(): out[k] = max(-1.0, min(1.0, out.get(k, 0.0) + v))
    return out
SPEC = {
    # compact and powerful: big thighs and glutes, strong shoulders and arms, the right (playing) arm the bigger
    'Alcaraz': dict(hand='r', cm=183, kg=74, muscle=0.90, mods={**arms('r', 0.70, 0.50, 0.60, 0.50, 0.30), **legs(0.80, 0.40, 0.60),
                    'torso/torso-muscle-pectoral': 0.40, 'torso/torso-muscle-dorsi': 0.30, 'torso/measure-waist-circ': -0.20}),
    # tall and thin: narrow chest and shoulders, slender arms, long thin legs
    'Sinner': dict(hand='r', cm=191, kg=77, muscle=0.65, weight=0.10, mods={**arms('r', -0.20, 0.0, -0.10, -0.35, -0.20), **legs(-0.60, -0.50, -0.40), 'legs/measure-thigh-circ': -0.30,
                   'torso/torso-muscle-pectoral': -0.40, 'torso/torso-muscle-dorsi': -0.30, 'torso/torso-vshape': -0.30, 'torso/torso-scale-depth': -0.30,
                   'neck/measure-neck-circ': -0.30}),
    # lean and long-limbed: little fat anywhere, slim defined arms and legs, a narrow waist
    'Djokovic': dict(hand='r', cm=188, kg=77, muscle=0.85, mods={**arms('r', 0.0, 0.25, 0.0, -0.10, 0.0), **legs(-0.25, -0.30, -0.20),
                     'torso/torso-scale-depth': -0.20, 'torso/measure-waist-circ': -0.30, 'torso/torso-muscle-pectoral': -0.10}),
    # the most muscular: big round shoulders, thick arms (the left, his playing arm, much the bigger), thick back,
    # chest and neck, heavy thighs and calves
    'Nadal': dict(hand='l', cm=185, kg=85, muscle=1.00, mods={**arms('l', 0.90, 0.80, 0.80, 0.15, 0.0), **legs(0.70, 0.50, 0.50),
                  'torso/torso-muscle-pectoral': 0.40, 'torso/torso-muscle-dorsi': 0.60, 'torso/torso-vshape': 0.35, 'neck/measure-neck-circ': 0.60,
                  'torso/measure-waist-circ': -0.20}),
    # athletic, not bulky: an even, solid build, the right forearm the bigger, strong thighs
    'Federer': dict(hand='r', cm=185, kg=85, muscle=0.85, mods={**arms('r', 0.25, 0.40, 0.15, 0.0, 0.0), **legs(0.35, 0.15, 0.30),
                    'torso/torso-scale-depth': 0.05}),
    # broad-shouldered and strong: wide shoulders and back, deep chest, strong arms and legs
    'Sampras': dict(hand='r', cm=185, kg=79, muscle=0.85, mods={**arms('r', 0.40, 0.40, 0.45, 0.20, 0.10), **legs(0.35, 0.30, 0.20),
                    'torso/torso-vshape': 0.45, 'torso/measure-shoulder-dist': 0.20, 'torso/torso-muscle-dorsi': 0.50, 'torso/torso-muscle-pectoral': 0.35}),
    # compact and stocky: a thick, deep chest and trunk, thick neck, sturdy legs
    'Agassi': dict(hand='r', cm=180, kg=80, muscle=0.75, mods={**arms('r', 0.30, 0.35, 0.30, 0.15, 0.10), **legs(0.30, 0.35, 0.25),
                   'torso/torso-scale-depth': 0.50, 'torso/measure-bust-circ': 0.50, 'torso/torso-muscle-pectoral': 0.40, 'neck/measure-neck-circ': 0.50,
                   'torso/torso-vshape': -0.20}),
    # tall, lean and wiry-muscular: a narrow waist, sinewy arms, long muscular legs and big calves
    'Lendl': dict(hand='r', cm=188, kg=79, muscle=0.90, mods={**arms('r', 0.15, 0.35, 0.20, 0.0, 0.0), **legs(0.35, 0.50, 0.10),
                  'torso/measure-waist-circ': -0.40, 'torso/torso-scale-depth': -0.15}),
    # broad shoulders over a narrow waist, strong legs
    'Borg': dict(hand='r', cm=180, kg=72, muscle=0.85, mods={**arms('r', 0.20, 0.30, 0.25, 0.0, 0.0), **legs(0.60, 0.35, 0.40),
                 'torso/torso-vshape': 0.40, 'torso/measure-shoulder-dist': 0.10, 'torso/measure-waist-circ': -0.45, 'torso/torso-muscle-dorsi': 0.35}),
    # slim: narrow through the chest and arms, thin legs
    # (listed at 75 kg, as he is now; slimmer in the photographs of his playing years)
    'McEnroe': dict(hand='l', cm=180, kg=75, muscle=0.70, weight=0.45, mods={**arms('l', -0.10, 0.10, -0.10, -0.30, -0.15), **legs(-0.35, -0.25, -0.30),
                    'torso/torso-muscle-pectoral': -0.35, 'torso/torso-vshape': -0.25, 'torso/torso-scale-depth': -0.20, 'torso/measure-waist-circ': -0.10}),
    # wiry: thin and sinewy, little bulk anywhere, strong thighs for his size
    'Connors': dict(hand='l', cm=178, kg=70, muscle=0.80, mods={**arms('l', 0.0, 0.25, 0.0, -0.20, -0.10), **legs(0.25, 0.0, 0.0),
                    'torso/torso-muscle-pectoral': -0.25, 'torso/measure-waist-circ': -0.35, 'torso/torso-scale-depth': -0.20}),
    # short and sturdy, with a famously huge left forearm (13 inches, 33 cm, round, as his autobiography gives it)
    # and a strong left arm, powerful legs
    'Laver': dict(hand='l', cm=173, kg=68, muscle=0.80, mods={**arms('l', 0.50, 1.00, 0.30, 0.0, 0.0), 'arms/l-lowerarm-fat': 0.65, **legs(0.50, 0.50, 0.25),
                  'torso/measure-waist-circ': -0.10}),
    # (the 2026-11 additions; judged from freely licensed photographs and the listed playing weights)
    # tall and athletic: strong legs and an even build, the right forearm the bigger
    'Murray': dict(hand='r', cm=191, kg=84, muscle=0.85, mods={**arms('r', 0.20, 0.35, 0.20, 0.10, 0.0), **legs(0.35, 0.25, 0.25)}),
    # the strongest of them: thick shoulders, arms and neck, heavy thighs and calves, a stocky trunk
    'Wawrinka': dict(hand='r', cm=183, kg=81, muscle=0.95, mods={**arms('r', 0.60, 0.55, 0.50, 0.40, 0.20), **legs(0.85, 0.60, 0.60),
                     'torso/torso-muscle-pectoral': 0.40, 'torso/torso-muscle-dorsi': 0.40, 'torso/torso-vshape': 0.20, 'neck/measure-neck-circ': 0.40}),
    # very tall and long-limbed, slim through the arms and legs
    'Zverev': dict(hand='r', cm=198, kg=90, muscle=0.75, mods={**arms('r', -0.10, 0.10, 0.0, -0.20, -0.10), **legs(-0.20, -0.20, -0.10),
                   'torso/torso-scale-depth': -0.20, 'torso/measure-waist-circ': -0.20}),
    # compact and muscular: strong shoulders, arms and legs
    'Thiem': dict(hand='r', cm=185, kg=79, muscle=0.95, mods={**arms('r', 0.40, 0.40, 0.40, 0.20, 0.10), **legs(0.60, 0.50, 0.40),
                  'torso/torso-muscle-pectoral': 0.30, 'torso/torso-muscle-dorsi': 0.30, 'torso/torso-vshape': 0.30}),
    # very tall and thin: narrow chest and shoulders, thin arms, long thin legs
    'Medvedev': dict(hand='r', cm=198, kg=83, muscle=0.60, mods={**arms('r', -0.40, -0.20, -0.30, -0.45, -0.30), **legs(-0.70, -0.60, -0.50), 'legs/measure-thigh-circ': -0.30,
                     'torso/torso-muscle-pectoral': -0.50, 'torso/torso-vshape': -0.40, 'torso/torso-scale-depth': -0.35, 'neck/measure-neck-circ': -0.30}),
    # tall and athletic, broad through the shoulders
    'Tsitsipas': dict(hand='r', cm=193, kg=90, muscle=0.85, mods={**arms('r', 0.20, 0.30, 0.30, 0.10, 0.0), **legs(0.30, 0.20, 0.20),
                      'torso/torso-vshape': 0.30, 'torso/torso-muscle-pectoral': 0.20}),
    # very tall and big: a heavy, deep trunk and thick arms
    'del Potro': dict(hand='r', cm=198, kg=97, muscle=0.85, mods={**arms('r', 0.40, 0.50, 0.30, 0.20, 0.10), **legs(0.30, 0.20, 0.30),
                      'torso/torso-scale-depth': 0.20, 'torso/torso-muscle-pectoral': 0.20}),
    # broad shoulders, thick thighs and glutes for his leg drive
    'Roddick': dict(hand='r', cm=188, kg=88, muscle=0.85, mods={**arms('r', 0.30, 0.30, 0.40, 0.15, 0.10), **legs(0.60, 0.40, 0.60),
                    'torso/torso-vshape': 0.30, 'torso/measure-shoulder-dist': 0.15, 'torso/torso-muscle-pectoral': 0.30}),
    # tall, long-limbed, broad shoulders over a lean frame
    'Kyrgios': dict(hand='r', cm=193, kg=85, muscle=0.80, mods={**arms('r', 0.20, 0.25, 0.30, 0.10, 0.0), **legs(0.0, -0.10, 0.0),
                    'torso/torso-vshape': 0.30, 'torso/measure-shoulder-dist': 0.15}),
    # very tall, lean and springy, long thin legs
    'Monfils': dict(hand='r', cm=193, kg=85, muscle=0.80, mods={**arms('r', 0.0, 0.10, 0.0, -0.10, 0.0), **legs(-0.20, -0.30, -0.10),
                    'torso/measure-waist-circ': -0.30, 'torso/torso-scale-depth': -0.20}),
    # strong and solid: powerful thighs and calves, a deep chest
    'Becker': dict(hand='r', cm=190, kg=85, muscle=0.85, mods={**arms('r', 0.30, 0.40, 0.30, 0.10, 0.10), **legs(0.70, 0.50, 0.50),
                   'torso/torso-scale-depth': 0.15, 'torso/torso-muscle-pectoral': 0.20}),
    # slim and athletic, a narrow waist
    'Edberg': dict(hand='r', cm=188, kg=78, muscle=0.75, mods={**arms('r', 0.0, 0.20, 0.0, -0.15, -0.10), **legs(-0.10, -0.10, -0.10),
                   'torso/measure-waist-circ': -0.30, 'torso/torso-scale-depth': -0.15}),
    # tall, lean and rangy: broad bony shoulders, long thin limbs (left-handed)
    'Ivanisevic': dict(hand='l', cm=193, kg=82, muscle=0.75, mods={**arms('l', 0.0, 0.20, 0.10, -0.15, -0.10), **legs(-0.30, -0.30, -0.20),
                       'torso/measure-shoulder-dist': 0.15, 'torso/torso-muscle-pectoral': -0.20, 'torso/torso-scale-depth': -0.20, 'torso/measure-waist-circ': -0.25}),
    # slim and wiry, an endurance build
    'Wilander': dict(hand='r', cm=183, kg=77, muscle=0.75, mods={**arms('r', -0.10, 0.10, -0.05, -0.20, -0.10), **legs(0.0, 0.10, -0.10),
                     'torso/torso-muscle-pectoral': -0.20, 'torso/measure-waist-circ': -0.30, 'torso/torso-scale-depth': -0.20}),
    # tall and rail-thin in his prime: narrow chest, thin arms and legs
    'Kuerten': dict(hand='r', cm=191, kg=80, muscle=0.70, mods={**arms('r', -0.20, 0.0, -0.10, -0.30, -0.20), **legs(-0.40, -0.30, -0.30),
                    'torso/torso-muscle-pectoral': -0.35, 'torso/torso-vshape': -0.20, 'torso/torso-scale-depth': -0.30, 'torso/measure-waist-circ': -0.30}),
    # short and wiry: lean, quick legs (listed 77 kg in his later years; about 72 in the early 2000s photographs)
    'Hewitt': dict(hand='r', cm=178, kg=72, muscle=0.85, mods={**arms('r', 0.0, 0.20, 0.0, -0.15, -0.05), **legs(0.20, 0.20, 0.0),
                   'torso/torso-muscle-pectoral': -0.10, 'torso/measure-waist-circ': -0.35, 'torso/torso-scale-depth': -0.15}),
}

def main():
    mh = MH(MPFB)
    prims, names, J4 = read_glb(os.path.join(PRO, 'assets', 'people', 'm04.glb'))
    body = next(p for p in prims if p['material'].endswith('_body')); P = body['POSITION'].astype(np.float64); T4 = body['indices'].astype(np.int64)
    head = next(p for p in prims if p['material'].endswith('_head')); H4 = max(P[:, 1].max(), head['POSITION'][:, 1].max()) - min(P[:, 1].min(), head['POSITION'][:, 1].min())
    # the game body's segment weights, from its skin
    Wp = np.zeros((len(P), len(SEGS)))
    for k in range(4): np.add.at(Wp, (np.arange(len(P)), [SI[m04_seg(names[j])] for j in body['JOINTS_0'][:, k]]), body['WEIGHTS_0'][:, k])
    Wp /= Wp.sum(1, keepdims=True)
    Vref = mh.shape(REF['muscle'], REF['weight']); fit = Fit(mh, Vref, J4, H4); Qref = fit.place(Vref)
    tri, bar, dist = correspond(P, Wp, Qref, mh.T, fit.W)
    print('model %.3f m tall; MakeHuman body scaled %.3f; distance from the game body to the reference: median %.1f mm, 90%% %.1f mm, max %.1f mm' % (H4, fit.s, np.median(dist) * 1e3, np.percentile(dist, 90) * 1e3, dist.max() * 1e3))
    sample = lambda Q: (bar[:, :, None] * Q[mh.T[tri]]).sum(1)

    if '--calibrate' in flags:
        # bare forearms and calves, and cloth over the rest with an allowance for how loosely it sits
        dom = Wp.argmax(1); nrm = body['NORMAL'].astype(np.float64); regions = {'farmL': 0.0, 'farmR': 0.0, 'calfL': 0.0, 'calfR': 0.0, 'uarmL': 0.006, 'uarmR': 0.006, 'torso': 0.015, 'thighL': 0.02, 'thighR': 0.02}
        best = None
        for mu in np.arange(0.3, 1.01, 0.1):
            for we in np.arange(0.2, 0.81, 0.1):
                Q = fit.place(mh.shape(mu, we)); X = sample(Q); sd = ((P - X) * nrm).sum(1); err = []
                for r, off in regions.items():
                    m = dom == SI[r]; err.append(np.mean(sd[m] - off))
                rms = float(np.sqrt(np.mean(np.square(err))))
                print('muscle %.1f weight %.1f  rms %.1f mm  ' % (mu, we, rms * 1e3) + ' '.join('%s %+.1f' % (r, e * 1e3) for r, e in zip(regions, err)))
                if best is None or rms < best[0]: best = (rms, mu, we)
        print('best', best); return

    # ---- what every player shares: where the game body lies on the reference, and which of it is bare skin
    n4 = len(P); sh = {}; table = {}
    hand = Wp[:, [SI['handL'], SI['handR']]].sum(1); foot = Wp[:, [SI['footL'], SI['footR']]].sum(1); hd = Wp[:, SI['head']] + Wp[:, SI['neck']]
    keep = np.clip(1 - 1.4 * hand - 1.2 * foot - 1.0 * hd, 0, 1)
    # nothing moves at the collar, where the head's neck goes in
    y = P[:, 1]; collar = np.clip((1.505 - y) / 0.05, 0, 1) ** 2; keep *= np.where(np.abs(P[:, 0]) < 0.14, collar, 1)
    # welded neighbours of the game body, to smooth the offsets (a seam's copies of a vertex, not the two faces of a
    # turned-in hem that share its position)
    key = np.hstack([np.round(P * 1e5), np.round(body['NORMAL'] * 2)]).astype(np.int64); _, wid = np.unique(key, axis=0, return_inverse=True); wid = wid.ravel(); nw = wid.max() + 1
    E = np.concatenate([T4[:, [0, 1]], T4[:, [1, 2]], T4[:, [2, 0]]]); E = wid[E]; E = E[E[:, 0] != E[:, 1]]
    def smooth(D, it=2, lam=0.5):
        Dw = np.zeros((nw, D.shape[1])); c = np.zeros(nw); np.add.at(Dw, wid, D); np.add.at(c, wid, 1); Dw /= c[:, None]
        for _ in range(it):
            S = np.zeros_like(Dw); k = np.zeros(nw); np.add.at(S, E[:, 0], Dw[E[:, 1]]); np.add.at(S, E[:, 1], Dw[E[:, 0]]); np.add.at(k, E[:, 0], 1); np.add.at(k, E[:, 1], 1)
            Dw = Dw + lam * (S / np.maximum(k, 1)[:, None] - Dw)
        return Dw[wid]
    # Bare skin (forearms, and the legs below the shorts) is laid exactly on MakeHuman's surface: the game model's
    # own limbs are not a tennis player's (thick forearms and calves, thin upper arms). SNAP is the step from each
    # vertex to its nearest point on the reference; the game takes it where the kit leaves the skin bare.
    Xref = sample(Qref)
    Nq = np.zeros_like(Qref); fn = np.cross(Qref[mh.T[:, 1]] - Qref[mh.T[:, 0]], Qref[mh.T[:, 2]] - Qref[mh.T[:, 0]])
    for k in range(3): np.add.at(Nq, mh.T[:, k], fn)
    Nq /= np.linalg.norm(Nq, axis=1, keepdims=True); nX = sample(Nq); nX /= np.linalg.norm(nX, axis=1, keepdims=True)
    # Under the model's shorts lie three sheets: its own leg skin, which goes on up under the cloth to about 0.68 m;
    # the shorts' shell over it, down to its hem at about 0.59 m; and the shell's lining, turned in at that hem. KIND
    # marks each leg vertex as skin, shell or lining, so that below a shorter hem the game lays the skin on the surface
    # and tucks the shell and lining just under it, rather than piling three sheets onto one surface (a line at the old
    # hem, and the shorts' texels showing as skin).
    Nm = body['NORMAL'].astype(np.float64)
    inward = (Nm * nX).sum(1) < 0.2
    SNAP = Xref - P
    agree = np.clip((0.06 - np.linalg.norm(Xref - P, axis=1)) / 0.02, 0, 1)        # a far one is a poor match: left as it is
    from PIL import Image
    mask = np.asarray(Image.open(os.path.join(PRO, 'assets', 'people', 'm04_body_mask.png')).convert('RGBA')).astype(np.float64) / 255
    uv = body['TEXCOORD_0']; mk = mask[np.clip((uv[:, 1] * mask.shape[0]).astype(int), 0, mask.shape[0] - 1), np.clip((uv[:, 0] * mask.shape[1]).astype(int), 0, mask.shape[1] - 1)]
    tank, cloth, shoe, sleeve = mk[:, 0], mk[:, 1], mk[:, 2], mk[:, 3]
    armSeg = Wp[:, [SI['uarmL'], SI['farmL'], SI['uarmR'], SI['farmR']]].sum(1); legSeg = Wp[:, [SI['thighL'], SI['calfL'], SI['thighR'], SI['calfR']]].sum(1)
    KIND = np.stack([~inward & (cloth < 0.5), ~inward & (cloth >= 0.5), inward], 1).astype(np.float64) * legSeg[:, None]
    base = keep * agree
    bare = np.stack([armSeg * (1 - tank) * (1 - sleeve), armSeg * (1 - tank), legSeg * (1 - shoe)], 1) * base[:, None]   # sleeved arm, sleeveless arm, leg
    bare = np.clip(smooth(bare, 1), 0, 1)
    # A seam's copies of a vertex (same place, another UV or normal) get one value of everything, so they move as one
    # and the seam cannot open.
    pkey = np.round(P * 1e5).astype(np.int64); _, pid = np.unique(pkey, axis=0, return_inverse=True); pid = pid.ravel(); npid = pid.max() + 1
    def same(A):
        S = np.zeros((npid, A.shape[1])); c = np.zeros(npid); np.add.at(S, pid, A); np.add.at(c, pid, 1); return (S / c[:, None])[pid]
    SNAP, bare, KIND = same(SNAP), same(bare), same(KIND); NXs = same(nX); NXs /= np.maximum(np.linalg.norm(NXs, axis=1, keepdims=True), 1e-9)
    OUT = [SNAP, bare, KIND, NXs]
    print('bare skin: sleeved arms %d, sleeveless arms %d, legs %d vertices (skin %d, shell %d, lining %d); snap median %.1f mm' % ((bare[:, 0] > 0.5).sum(), (bare[:, 1] > 0.5).sum(), (bare[:, 2] > 0.5).sum(),
          (KIND[:, 0] > 0.5).sum(), (KIND[:, 1] > 0.5).sum(), (KIND[:, 2] > 0.5).sum(), np.median(np.linalg.norm(SNAP[bare.max(1) > 0.5], axis=1)) * 1e3))

    # ---- each player's offsets
    armW = fit.W[:, [SI['uarmL'], SI['farmL'], SI['handL']]].sum(1), fit.W[:, [SI['uarmR'], SI['farmR'], SI['handR']]].sum(1)
    shL0, shR0 = mh.joint(Vref, 'l-shoulder'), mh.joint(Vref, 'r-shoulder')
    Hmh = Vref[:mh.nbody, 1].max() - Vref[:mh.nbody, 1].min()
    def girth(Q, seg, t0, t1, h, side=0):
        mj, gj = seg_ends(seg); rm = {'uarm': 0.075, 'farm': 0.065, 'thigh': 0.12, 'calf': 0.09}[seg[:-1]]
        return max(section(Q, mh.T, J4[gj[0]], J4[gj[1]], t, side=side, rmax=rm) for t in np.linspace(t0, t1, 9)) * h / H4 * 100
    for name, S in SPEC.items():
        h = S['cm'] / 100
        mods = spec_mods(S, S['hand'])
        def build(we): return mh.shape(S['muscle'], we, mods)
        # his weight: MakeHuman's own body (its proportions are a real man's), at his height
        def mass(we): return RHO * 1000 * volume(build(we)[:mh.nbody], mh.T) * (h / Hmh) ** 3
        lo, hi = 0.0, 1.0
        if 'weight' in S: lo = hi = S['weight']            # where his photographs and his listed weight disagree, the photographs
        elif mass(lo) > S['kg'] + 0.2 or mass(hi) < S['kg'] - 0.2: print('  !', name, 'listed weight out of reach: %.1f..%.1f kg' % (mass(lo), mass(hi)))
        for _ in range(22 if lo < hi else 0):
            mid = (lo + hi) / 2
            if mass(mid) < S['kg']: lo = mid
            else: hi = mid
        we = (lo + hi) / 2; Vp = build(we); kg = mass(we)
        # the shoulders' width: carried by moving the arm bones out, so the arms' own offsets leave it out
        dL, dR = mh.joint(Vp, 'l-shoulder') - shL0, mh.joint(Vp, 'r-shoulder') - shR0
        D = Vp[:mh.nbody] - Vref[:mh.nbody]; D -= armW[0][:, None] * dL + armW[1][:, None] * dR
        Lt = fit.L[SI['torso']]; s_out = float(((Lt @ dL)[0] - (Lt @ dR)[0]) / 2)
        Dm = same(smooth(sample(fit.carry(D)) * keep[:, None]) * (keep > 0)[:, None])
        OUT.append(Dm); sh[name] = round(s_out, 4)
        Qp = fit.place(Vp); r = {}
        r['upper arm L'] = girth(Qp, 'uarmL', 0.3, 0.75, h, 1); r['upper arm R'] = girth(Qp, 'uarmR', 0.3, 0.75, h, -1)
        r['forearm L'] = girth(Qp, 'farmL', 0.1, 0.5, h, 1); r['forearm R'] = girth(Qp, 'farmR', 0.1, 0.5, h, -1)
        r['thigh'] = girth(Qp, 'thighL', 0.15, 0.3, h, 1); r['calf'] = girth(Qp, 'calfL', 0.15, 0.5, h, 1)
        r['chest'] = section(Qp, mh.T, np.array([0, 1.22, 0]), np.array([0, 1.32, 0]), 1.0, xmax=0.2) * h / H4 * 100
        r['waist'] = min(section(Qp, mh.T, np.array([0, yy - 0.1, 0]), np.array([0, yy, 0]), 1.0) for yy in np.linspace(1.0, 1.12, 7)) * h / H4 * 100
        table[name] = dict(cm=S['cm'], kg=S['kg'], body_kg=round(kg, 1), muscle=S['muscle'], weight=round(we, 3), shoulders=round(s_out, 4), girth_cm={k: round(v, 1) for k, v in r.items()})
        print('%-9s %3d cm %3d kg (%4.1f)  muscle %.2f weight %.2f  shoulders %+5.1f mm  offsets max %4.1f mm  ' % (name, S['cm'], S['kg'], kg, S['muscle'], we, s_out * 1e3, np.linalg.norm(Dm, axis=1).max() * 1e3)
              + ' '.join('%s %.1f' % (k, v) for k, v in r.items()))
    if '--dry' in flags: return
    q = np.round(np.stack(OUT) / 1e-4)
    for k in (1, 2, 3): q[k] = np.round(OUT[k] * 10000)
    assert np.abs(q).max() < 32767
    open(os.path.join(PRO, 'assets', 'people', 'm04_shapes.bin'), 'wb').write(q.astype('<i2').tobytes())
    bd = os.path.join(PRO, 'js', 'bodydata.js'); old = open(bd).read(); keepline = [l for l in old.splitlines() if l.startswith('export const BODY_MEASURED')]
    hdr = ('// Limb girth per player against the roster, measured (tools/body_measured.py). Only trusted readings, clamped\n'
           '// to 0.88-1.15; looks.js averages them with the judged build, which is used only where a player has no shape below.\n')
    with open(bd, 'w') as f:
        f.write(hdr + '\n'.join(keepline) + '\n\n')
        f.write('// Each player\'s body (tools/body_shapes.py): MakeHuman\'s body (CC0) set to his height, listed weight, muscle and\n'
                '// build, carried onto the game\'s body mesh. assets/people/m04_shapes.bin is int16 blocks of [vertex][3], one\n'
                '// per body-mesh vertex in file order: the step onto the reference body (units of `unit` m); how bare each vertex\n'
                '// is (sleeved arm, sleeveless arm, leg; 10000 = bare); which sheet of the leg it is on (skin, the model\'s shorts\n'
                '// shell, their lining; 10000 = all); the reference surface\'s normal there (x 10000); then each player\'s offsets\n'
                '// in `names` order (`unit` m). Copies of a vertex at one place carry the same values.\n'
                '// `shoulders` is how far each shoulder joint moves out (m, at the model\'s size); BODY_INFO records what each\n'
                '// body was built from, and its girths in cm at his height as MakeHuman measures them.\n')
        f.write('export const BODY_SHAPES = ' + json.dumps({'file': 'm04_shapes.bin', 'verts': int(n4), 'unit': 1e-4, 'names': list(SPEC), 'shoulders': sh}, separators=(',', ':')) + ';\n')
        f.write('export const BODY_INFO = ' + json.dumps(table, separators=(',', ':')) + ';\n')
    print('wrote', len(SPEC), 'bodies')

if __name__ == '__main__':
    main()
