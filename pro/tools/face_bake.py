# A player's own face on the head he wears. Takes a library head (a Rocketbox avatar GLB whose
# 'head' material carries the head's colour texture) and one photograph of the man, finds the
# face in the photograph (MediaPipe face landmarker), finds the same landmarks on the head itself
# (by drawing the head square-on and running the same landmarker on that picture, then reading
# each landmark's place on the mesh), fits a camera from the head's landmarks to the photograph's,
# corrects it with a thin-plate spline so every feature lands exactly, and paints the
# photograph's face into the head texture: lighting
# flattened, colour matched to the head's own skin, blended in bands so there is no seam. Also
# measures how his proportions differ from the head's (the `face` measures of Person.fitFace).
#
#   /tmp/rally-work/pose-env/bin/python -I tools/face_bake.py <head.glb> <photo> <out.jpg> \
#       --model face_landmarker.task [--json out.json] [--bw] [--mirror auto|left|right|none]
#       [--top 0.030] [--strength 1.0] [--debug dir] [--size 1024] [--mouthw 0.004 (an open mouth: how far past its corners the head keeps its own lips)]
#       [--crease 17 (px: the dark creases closed over just outside the mouth's corners; larger for a bearded or open mouth)]
#       [--bottom m (keep the head's own mouth and chin from this far below the base of the nose: a beard he did not play in)]
#
# Photographs must be freely licensed; record each one in assets/people/faces/SOURCES.md.
import sys, os, json, struct, math, argparse
import numpy as np, cv2
cv2.setNumThreads(2)                                       # the game may be running on the same machine: stay light

# ---------- the head ----------
CT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read_glb(path):
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; fmt, sz = CT[a['componentType']]; n = NC[a['type']]
        off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0) or sz * n
        if stride == sz * n: arr = np.frombuffer(b, dtype=np.dtype('<' + fmt), count=a['count'] * n, offset=off).reshape(a['count'], n)
        else: arr = np.stack([np.frombuffer(b, dtype=np.dtype('<' + fmt), count=n, offset=off + k * stride) for k in range(a['count'])])
        arr = arr.astype(np.float64) if fmt == 'f' else arr
        if a.get('normalized'): arr = arr / float(np.iinfo(np.dtype(fmt)).max)
        return arr
    mi = next(i for i, m in enumerate(j['materials']) if m.get('name') == 'head')
    prim = next(p for m in j['meshes'] for p in m['primitives'] if p.get('material') == mi)
    pos = acc(prim['attributes']['POSITION']); uv = acc(prim['attributes']['TEXCOORD_0']).astype(np.float64); idx = acc(prim['indices']).reshape(-1, 3).astype(np.int64)
    nrm = acc(prim['attributes']['NORMAL']) if 'NORMAL' in prim['attributes'] else None
    jn = acc(prim['attributes']['JOINTS_0']).astype(np.int64); jw = acc(prim['attributes']['WEIGHTS_0']).astype(np.float64)
    # the head mesh is skinned: its vertices are in the skin's bind space; joints' bind positions come from the inverse bind matrices
    skin = j['skins'][0]; ibm = acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)          # column-major in the file
    joints = {}
    names = [j['nodes'][ni]['name'].replace('Bip01 ', '').replace('Bip01_', '') for ni in skin['joints']]
    for k, nm in enumerate(names): joints[nm] = np.linalg.inv(ibm[k])[:3, 3]
    owner = np.array([names[jn[i, int(np.argmax(jw[i]))]] for i in range(len(pos))])
    tex = j['textures'][j['materials'][mi]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']; bv = j['bufferViews'][j['images'][tex]['bufferView']]
    img = cv2.imdecode(np.frombuffer(b, np.uint8, bv['byteLength'], bin0 + bv.get('byteOffset', 0)), cv2.IMREAD_COLOR)
    return dict(pos=pos, uv=uv, idx=idx, nrm=nrm, joints=joints, tex=img, owner=owner)

# ---------- the photograph ----------
MP = dict(reye=[33, 133, 159, 145], leye=[263, 362, 386, 374], nose=[1], subnasal=[2], nasion=[168], ulip=[0], llip=[17], lipmid=[13, 14], rmouth=[61], lmouth=[291], chin=[152],
          rcheek=[50], lcheek=[280], rbrow_in=[55, 107], lbrow_in=[285, 336], rbrow_out=[70, 46], lbrow_out=[300, 276], rbrow_mid=[105, 66], lbrow_mid=[334, 296], glabella=[9],
          rjaw=[172], ljaw=[397], rside=[234], lside=[454], rala=[129], lala=[358], forehead=[10], rjaw2=[150], ljaw2=[379])
_FL = {}
def landmarks(img, model):
    """The 478 face landmarks of the biggest face in the picture, in pixels (z in the same units, toward the camera negative).
    The landmarker only finds faces that fill a fair part of what it is shown, so a small face in a wide picture is
    looked for through windows, and whatever is found is then looked at again close in."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    if model not in _FL: _FL[model] = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), num_faces=3, min_face_detection_confidence=0.3, min_face_presence_confidence=0.3))
    fl = _FL[model]
    def run(im, ox=0, oy=0, k=1.0):
        res = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB)))); out = []
        h, w = im.shape[:2]
        for f in res.face_landmarks: out.append(np.array([[p.x * w / k + ox, p.y * h / k + oy, p.z * w / k] for p in f]))
        return out
    H, W = img.shape[:2]; k0 = min(1.0, 1400 / max(H, W)); small = cv2.resize(img, (int(W * k0), int(H * k0)), interpolation=cv2.INTER_AREA) if k0 < 1 else img
    found = run(small, 0, 0, k0)
    if not found:
        # look again through windows over the picture, large ones first
        for frac in (0.5, 0.3):
            win = int(min(H, W) * frac); step = max(8, win // 2)
            for y0 in range(0, max(1, H - win + 1), step):
                for x0 in range(0, max(1, W - win + 1), step):
                    crop = img[y0:y0 + win, x0:x0 + win]; kk = 512 / win
                    found += run(cv2.resize(crop, (512, 512), interpolation=cv2.INTER_CUBIC if kk > 1 else cv2.INTER_AREA), x0, y0, kk)
            if found: break
    if found:
        # look once more, close in on the face found: the landmarks are steadier when the face fills the frame
        L0 = max(found, key=lambda L: np.ptp(L[:, 0])); cx, cy = L0[:, 0].mean(), L0[:, 1].mean(); r = np.ptp(L0[:, 0]) * 1.05
        x0, y0, x1, y1 = int(max(0, cx - r)), int(max(0, cy - r * 1.15)), int(min(W, cx + r)), int(min(H, cy + r * 1.05))
        if x1 - x0 > 40 and (x1 - x0) < 0.7 * W:
            crop = img[y0:y1, x0:x1]; kk = 768 / max(crop.shape[:2]); more = run(cv2.resize(crop, (int(crop.shape[1] * kk), int(crop.shape[0] * kk)), interpolation=cv2.INTER_CUBIC if kk > 1 else cv2.INTER_AREA), x0, y0, kk)
            if more: return max(more, key=lambda L: np.ptp(L[:, 0]))
    if not found: return None
    return max(found, key=lambda L: np.ptp(L[:, 0]))
def lm(L, key): return L[MP[key]].mean(0)

# ---------- camera and warp ----------
def fit_camera(X, P, w=None):
    """Scaled orthographic camera p = s R[:2] X + t from 3D points X to 2D points P (image y down)."""
    w = np.ones(len(X)) if w is None else w; W = w[:, None]
    Xc = (X * W).sum(0) / w.sum(); Pc = (P * W).sum(0) / w.sum(); A = (X - Xc) * np.sqrt(W); B = (P - Pc) * np.sqrt(W)
    M = np.linalg.lstsq(A.T @ A + 1e-9 * np.eye(3), A.T @ B, rcond=None)[0].T                   # 2x3 affine
    # nearest scaled rotation: the two rows orthogonal and of equal length
    U, S, Vt = np.linalg.svd(M, full_matrices=False); s = S.mean(); R2 = U @ Vt; r3 = np.cross(R2[0], R2[1])
    return dict(s=s, R=np.vstack([R2, r3]), t=Pc - s * R2 @ Xc, M=M)
def project(cam, X): return (cam['s'] * (X @ cam['R'][:2].T)) + cam['t']
def tps_fit(src, dst, lam=1e-3):
    n = len(src); d = np.linalg.norm(src[:, None] - src[None], axis=2); K = np.where(d > 0, d * d * np.log(d + 1e-12), 0.0) + lam * np.eye(n) * (d.mean() ** 2)
    Pm = np.hstack([np.ones((n, 1)), src]); A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = Pm; A[n:, :n] = Pm.T
    Y = np.zeros((n + 3, 2)); Y[:n] = dst
    return dict(src=src, W=np.linalg.solve(A, Y))
def tps_apply(t, q):
    out = np.zeros((len(q), 2)); B = 3000                       # small blocks: a few tens of megabytes at a time
    for a in range(0, len(q), B):
        qq = q[a:a + B]; d = np.sqrt(((qq[:, None] - t['src'][None]) ** 2).sum(2)); U = d * d * np.log(d + 1e-12); del d
        out[a:a + B] = U @ t['W'][:-3] + np.hstack([np.ones((len(qq), 1)), qq]) @ t['W'][-3:]
    return out

# ---------- rasterising ----------
def raster(tri_xy, tri_attr, W, H, depth=None):
    """Fill a W x H image with attributes interpolated across triangles (tri_xy: n x 3 x 2 pixels). With `depth` (n x 3) the nearest wins."""
    out = np.zeros((H, W, tri_attr.shape[2])); hit = np.zeros((H, W), bool); zb = np.full((H, W), -1e9)
    for k in range(len(tri_xy)):
        (x0, y0), (x1, y1), (x2, y2) = tri_xy[k]; minx = max(0, int(math.floor(min(x0, x1, x2)))); maxx = min(W - 1, int(math.ceil(max(x0, x1, x2)))); miny = max(0, int(math.floor(min(y0, y1, y2)))); maxy = min(H - 1, int(math.ceil(max(y0, y1, y2))))
        if maxx < minx or maxy < miny: continue
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-12: continue
        xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        a = ((y1 - y2) * (xs - x2) + (x2 - x1) * (ys - y2)) / den; b = ((y2 - y0) * (xs - x2) + (x0 - x2) * (ys - y2)) / den; c = 1 - a - b
        m = (a >= -1e-4) & (b >= -1e-4) & (c >= -1e-4)
        if not m.any(): continue
        sl = (slice(miny, maxy + 1), slice(minx, maxx + 1))
        if depth is not None:
            z = a * depth[k, 0] + b * depth[k, 1] + c * depth[k, 2]; m &= z > zb[sl]; zb[sl][m] = z[m]
        val = a[..., None] * tri_attr[k, 0] + b[..., None] * tri_attr[k, 1] + c[..., None] * tri_attr[k, 2]
        out[sl][m] = val[m]; hit[sl][m] = True
    return out, hit
def render(head, tex, yaw=0.0, size=512, pitch=0.0, want_pos=False):
    """A plain picture of the head with a texture: orthographic, lit a little from the front. For looking at, and for measuring the head itself."""
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    R = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]]) @ np.array([[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]])
    J = head['joints']; c = (J['LEye'] + J['REye']) / 2 + np.array([0, -0.035, 0]); V = (head['pos'] - c) @ R.T; sc = size / 0.30
    xy = np.stack([size / 2 + V[:, 0] * sc, size / 2 - V[:, 1] * sc], 1); T = head['idx']
    th, tw = tex.shape[:2]; at = np.concatenate([head['uv'] * [tw, th], (head['nrm'] @ R.T)[:, 2:3], head['pos']], 1)
    img, hit = raster(xy[T], at[T], size, size, depth=V[:, 2][T])
    col = cv2.remap(tex, img[..., 0].astype(np.float32), img[..., 1].astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float64)
    col *= (0.72 + 0.28 * np.clip(img[..., 2], 0, 1))[..., None]; col[~hit] = (58, 48, 40)
    col = np.clip(col, 0, 255).astype(np.uint8)
    return (col, img[..., 3:6], hit, dict(c=c, sc=sc, size=size)) if want_pos else col

# ---------- measuring a face ----------
def measures(L):
    """Proportions of a face from its landmarks turned square to the camera, each as a multiple of the distance between the eyes."""
    io = np.linalg.norm(lm(L, 'leye')[:2] - lm(L, 'reye')[:2]); eyeY = (lm(L, 'leye')[1] + lm(L, 'reye')[1]) / 2
    d = lambda a, b: np.linalg.norm(lm(L, a)[:2] - lm(L, b)[:2]) / io
    return dict(faceW=d('rside', 'lside'), jawW=d('rjaw', 'ljaw') / d('rside', 'lside'), faceL=(lm(L, 'chin')[1] - eyeY) / io, chinL=(lm(L, 'chin')[1] - lm(L, 'llip')[1]) / io,
                noseL=(lm(L, 'nose')[1] - eyeY) / io, noseW=d('rala', 'lala'), mouthW=d('rmouth', 'lmouth'), browH=(eyeY - (lm(L, 'rbrow_mid')[1] + lm(L, 'lbrow_mid')[1]) / 2) / io)
def frontal(L, cam_R=None):
    """Landmarks with the head's turn taken out (yaw, pitch and roll estimated from the landmarks' own 3D shape)."""
    P = L - L.mean(0); P = P * [1, 1, 1]
    # axes of the face: eye to eye, brow to chin, and their normal
    ex = lm(L, 'leye') - lm(L, 'reye'); ex /= np.linalg.norm(ex); ey = lm(L, 'chin') - lm(L, 'glabella'); ey -= ex * (ey @ ex); ey /= np.linalg.norm(ey); ez = np.cross(ex, ey)
    Rm = np.stack([ex, ey, ez]); Q = P @ Rm.T
    yaw = math.degrees(math.atan2(-ex[2], ex[0])); pitch = math.degrees(math.atan2(ey[2], ey[1])); roll = math.degrees(math.atan2(ex[1], ex[0]))
    return Q, dict(yaw=yaw, pitch=pitch, roll=roll)

# ---------- colour ----------
def lab(img): return cv2.cvtColor((np.clip(img, 0, 255) / 255).astype(np.float32), cv2.COLOR_BGR2Lab).astype(np.float64)
def unlab(x): return np.clip(cv2.cvtColor(x.astype(np.float32), cv2.COLOR_Lab2BGR) * 255, 0, 255)
def blend_bands(a, b, m, levels=5):
    """Laplacian-pyramid blend of b over a through mask m (0..1): fine detail changes over a narrow edge, colour over a wide one."""
    a = a.astype(np.float32); b = b.astype(np.float32); m = m.astype(np.float32); ga, gb, gm = [a], [b], [m]
    for _ in range(levels): ga.append(cv2.pyrDown(ga[-1])); gb.append(cv2.pyrDown(gb[-1])); gm.append(cv2.pyrDown(gm[-1]))
    out = ga[-1] * (1 - gm[-1][..., None]) + gb[-1] * gm[-1][..., None]
    for i in range(levels - 1, -1, -1):
        size = (ga[i].shape[1], ga[i].shape[0]); la = ga[i] - cv2.pyrUp(ga[i + 1], dstsize=size); lb = gb[i] - cv2.pyrUp(gb[i + 1], dstsize=size)
        out = cv2.pyrUp(out, dstsize=size) + la * (1 - gm[i][..., None]) + lb * gm[i][..., None]
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('photo'); ap.add_argument('out'); ap.add_argument('--model', required=True); ap.add_argument('--json'); ap.add_argument('--bw', action='store_true')
    ap.add_argument('--mirror', default='auto'); ap.add_argument('--top', type=float, default=0.030); ap.add_argument('--strength', type=float, default=1.0); ap.add_argument('--debug'); ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--flat', type=float, default=0.85); ap.add_argument('--mid', type=float, default=0.6); ap.add_argument('--socket', type=float, default=0.75); ap.add_argument('--brow', type=float, default=46.0); ap.add_argument('--chroma', type=float, default=0.55); ap.add_argument('--smooth', type=float, default=4e-4)
    ap.add_argument('--inset', type=float, default=0.004); ap.add_argument('--feather', type=float, default=0.006); ap.add_argument('--eyes', default='head'); ap.add_argument('--mouth', default='auto'); ap.add_argument('--fine', type=float, default=1.0); ap.add_argument('--iris'); ap.add_argument('--mouthw', type=float, default=0.004); ap.add_argument('--crease', type=int, default=17); ap.add_argument('--bottom', type=float)
    a = ap.parse_args()
    head = read_glb(a.glb); J = head['joints']; N = a.size; base = cv2.resize(head['tex'], (N, N), interpolation=cv2.INTER_AREA)
    photo = cv2.imread(a.photo, cv2.IMREAD_COLOR)
    if photo is None: raise SystemExit('cannot read ' + a.photo)
    k = 1400 / max(photo.shape[:2])
    if k < 1: photo = cv2.resize(photo, (int(photo.shape[1] * k), int(photo.shape[0] * k)), interpolation=cv2.INTER_AREA)      # a face more than ~500 px across adds nothing to a 1024 texture
    L = landmarks(photo, a.model)
    if L is None: raise SystemExit('no face found in ' + a.photo)
    Lf, turn = frontal(L)
    fw = np.ptp(L[MP['rside'] + MP['lside'], 0]); print('face %.0f px wide; turned yaw %.0f pitch %.0f roll %.0f degrees' % (fw, turn['yaw'], turn['pitch'], turn['roll']))
    # ---- the head's own landmarks: the same landmarker run on a square-on picture of the head, each landmark read back onto the mesh ----
    P3 = head['pos']; RS = 768
    dimg, dpos, dhit, dmap = render(head, head['tex'], 0.0, RS, want_pos=True)
    Ld = landmarks(dimg, a.model)
    if Ld is None: raise SystemExit('no face found on the head itself')
    ix = np.clip(Ld[:, 0].astype(int), 0, RS - 1); iy = np.clip(Ld[:, 1].astype(int), 0, RS - 1); onhead = dhit[iy, ix]; Xd = dpos[iy, ix]
    # which landmarks carry the fit: everything inside the face, the jaw line lightly, nothing up in the hair or on the irises
    UPPER = {10, 338, 297, 332, 284, 251, 389, 109, 67, 103, 54, 21, 162, 356, 127}; LOWER = {152, 148, 176, 149, 150, 136, 172, 377, 400, 378, 379, 365, 397, 58, 132, 93, 234, 288, 361, 323, 454}
    use = np.array([k for k in range(min(468, len(L))) if onhead[k] and k not in UPPER]); wts = np.array([0.35 if k in LOWER else 1.0 for k in use])
    for grp, w8 in ((MP['reye'] + MP['leye'], 3.0), (MP['rmouth'] + MP['lmouth'] + MP['nose'] + MP['ulip'], 2.0)):
        for k in grp: wts[use == k] = w8
    front = P3[:, 2] > J['MNose'][2] - 0.075
    chin_y = float(Xd[152, 1]) if onhead[152] else float(P3[front & (np.abs(P3[:, 0]) < 0.012), 1].min())
    X = Xd[use]; P2 = L[use, :2]; keys = [str(k) for k in use]
    Xf = X * [1, -1, 1]                                      # image y runs down; the avatar's left (+x) is on the picture's right, as in a photograph
    cam = fit_camera(Xf, P2, wts); res = np.linalg.norm(project(cam, Xf) - P2, axis=1)
    print('camera: %d landmarks, scale %.0f px/m, residual mean %.1f px (%.1f%% of the face), worst %.1f px' % (len(use), cam['s'], res.mean(), 100 * res.mean() / fw, res.max()))
    # spline: carry the landmarks (the jaw line loosely), and leave a ring round the face where the camera alone decides
    ring = np.array([[math.cos(t) * 0.17, math.sin(t) * 0.20 - 0.02, 0.0] for t in np.linspace(0, 2 * math.pi, 16, endpoint=False)]) + [0, (J['LEye'][1] + J['MBottomLip'][1]) / 2, J['LEye'][2] - 0.03]
    q_src = np.vstack([project(cam, Xf), project(cam, ring * [1, -1, 1])]); q_dst = np.vstack([P2, project(cam, ring * [1, -1, 1])])
    tps = tps_fit(q_src, q_dst, a.smooth)
    to_photo = lambda X3: tps_apply(tps, project(cam, X3 * [1, -1, 1]))
    HL = dict(rbrow_in=lm(Xd, 'rbrow_in'), lbrow_in=lm(Xd, 'lbrow_in'), glabella=lm(Xd, 'glabella'), rbrow_mid=lm(Xd, 'rbrow_mid'), lbrow_mid=lm(Xd, 'lbrow_mid'))
    # ---- where each texel of the head texture is on the head ----
    T = head['idx']; uvpx = head['uv'] * [N, N]
    inner = np.isin(head['owner'], ['LEye', 'REye', 'MTongue']).astype(np.float64)[:, None]              # eyeballs and tongue: not skin
    att = np.concatenate([P3, head['nrm'], inner], 1); tex3, hit = raster(uvpx[T], att[T], N, N)
    pos = tex3[..., :3]; nrm = tex3[..., 3:6].copy(); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True) + 1e-9; eyeball = tex3[..., 6] > 0.5
    # ---- the face region, soft-edged: inside the head's own face outline, from a little above the brows to the chin ----
    OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
    eyeY = (lm(Xd, 'leye')[1] + lm(Xd, 'reye')[1]) / 2; browY = max(HL['rbrow_mid'][1], HL['lbrow_mid'][1], HL['glabella'][1]); top = browY + a.top
    px_per_m = dmap['sc']; poly = np.array([[Ld[k, 0], Ld[k, 1]] for k in OVAL], np.int32); M2 = np.zeros((RS, RS), np.uint8); cv2.fillPoly(M2, [poly], 255)
    ytop = int(RS / 2 - (top - dmap['c'][1]) * px_per_m); M2[:max(0, ytop), :] = 0
    # a beard he did not wear when he played (an older photograph): from this far below the base of the nose down, the head's own
    # clean-shaven mouth and chin (soft-edged by the blur below)
    if a.bottom is not None: ybot = int(RS / 2 - (lm(Xd, 'subnasal')[1] - a.bottom - dmap['c'][1]) * px_per_m); M2[max(0, ybot):, :] = 0
    M2 = cv2.erode(M2, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(a.inset * px_per_m) * 2 + 1,) * 2)); M2 = cv2.GaussianBlur(M2.astype(np.float32) / 255, (0, 0), a.feather * px_per_m)
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]; sm = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
    mx = (RS / 2 + (x - dmap['c'][0]) * px_per_m).astype(np.float32); my = (RS / 2 - (y - dmap['c'][1]) * px_per_m).astype(np.float32)
    m = cv2.remap(M2, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0).astype(np.float64) * sm((z - (J['MNose'][2] - 0.095)) / 0.02) * hit
    if a.eyes != 'photo': m[eyeball] = 0                                                          # the head keeps its own eyes: a photograph's are usually screwed up against the sun
    opened = float(np.linalg.norm(L[13, :2] - L[14, :2]) / fw)
    if a.mouth == 'head' or (a.mouth == 'auto' and opened > 0.018):
        # his teeth, squeezed onto another man's closed lips, read as a white scar: there the head keeps its own lips
        mcx = (Xd[13, 0] + Xd[14, 0]) / 2; mcy = (Xd[13, 1] + Xd[14, 1]) / 2; hw = abs(Xd[308, 0] - Xd[78, 0]) / 2 + a.mouthw; hh = 0.0045 + 0.06 * min(0.1, opened)
        keep = np.exp(-(((x - mcx) / hw) ** 6 + ((y - mcy) / hh) ** 2)); m = m * (1 - 0.95 * keep); print('mouth open %.3f: the head keeps its lips' % opened)
    # only what the camera saw square-on enough to trust
    view = cam['R'][2] * [1, -1, 1]; view = view / np.linalg.norm(view) * (1 if view[2] > 0 else -1)
    # ---- sample the photograph (the turned-away half can borrow the mirror image of the other) ----
    yawdeg = turn['yaw']; mir = a.mirror
    if mir == 'auto': mir = 'none' if abs(yawdeg) < 9 else ('left' if yawdeg > 0 else 'right')
    if mir in ('left', 'right'):
        gd = 1 if mir == 'left' else -1; wm0 = sm((-(x * gd) + 0.006) / 0.012); facing = (nrm @ view) * (1 - wm0) + ((nrm * [-1, 1, 1]) @ view) * wm0
    else: facing = nrm @ view
    m *= sm((facing - 0.18) / 0.30)
    flat = pos.reshape(-1, 3); sel = (m.reshape(-1) > 0.002); pc = np.zeros((N * N, 2), np.float32)
    Xs = flat[sel].copy()
    if mir in ('left', 'right'):
        good = 1 if mir == 'left' else -1                                                         # which side of the head (sign of x) is well seen
        wmir = sm((-(Xs[:, 0] * good) + 0.006) / 0.012)                                           # 0 on the good side, 1 beyond the midline
        pa = to_photo(Xs); pb = to_photo(Xs * [-1, 1, 1]);
    else: wmir = None; pa = to_photo(Xs)
    # ---- the photograph in bands: its broad lighting (dropped), the shading of brow, nose and cheek (turned down), and fine detail (kept) ----
    pl = lab(photo); Lc = pl[..., 0].copy(); fx0, fx1 = int(max(0, L[:, 0].min())), int(min(photo.shape[1], L[:, 0].max())); fy0, fy1 = int(max(0, L[:, 1].min())), int(min(photo.shape[0], L[:, 1].max()))
    meanL = np.median(Lc[fy0:fy1, fx0:fx1]); hi = meanL + 13; Lc = np.where(Lc > hi, hi + (Lc - hi) * 0.25, Lc)         # shine on the forehead and nose pulled down first
    low = cv2.GaussianBlur(Lc, (0, 0), max(6.0, fw * 0.22)); mid = cv2.GaussianBlur(Lc, (0, 0), max(2.0, fw * 0.055))
    BROW = ([70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276])
    bmask = np.zeros(photo.shape[:2], np.uint8)
    for poly_i in BROW: cv2.fillPoly(bmask, [L[poly_i, :2].astype(np.int32)], 255)
    bmask = cv2.dilate(bmask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, int(fw * 0.035)) | 1,) * 2))
    L0 = pl[..., 0]; fore = L0[bmask > 0]; ref = np.percentile(fore, 88) if fore.size else meanL; dark = np.percentile(fore, 8) if fore.size else meanL - 30
    browhair = np.clip((ref - L0) / max(8.0, ref - dark), 0, 1) ** 1.3 * (cv2.GaussianBlur(bmask, (0, 0), max(1.0, fw * 0.008)) / 255.0)       # 1 where the brow's hair is
    chans = [np.float32(c) for c in (Lc - mid, mid - low, low - meanL, pl[..., 1], pl[..., 2], browhair)]; del low, mid, Lc
    def samp(p):
        mp_ = np.zeros((N * N, 2), np.float32); mp_[sel] = p; mx_ = mp_[:, 0].reshape(N, N); my_ = mp_[:, 1].reshape(N, N)
        return np.stack([cv2.remap(c.astype(np.float32), mx_, my_, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT) for c in chans], -1).astype(np.float64)
    S = samp(pa)
    if wmir is not None:
        Sb = samp(pb); wm = np.zeros(N * N); wm[sel] = wmir; wm = wm.reshape(N, N)[..., None]; S = S * (1 - wm) + Sb * wm
    # ---- colour: his detail on the head's own skin ----
    bl = lab(base); core = (m > 0.85); cheek = core & (y < eyeY - 0.014) & (y > lm(Xd, 'ulip')[1] + 0.006) & (np.abs(x) > 0.022)
    if cheek.sum() < 200: cheek = core
    # the hollows of the eyes sit in the brow's shadow in almost any photograph: lift them further than the rest
    ew = lambda k: np.exp(-(((x - lm(Xd, k)[0]) / 0.016) ** 2 + ((y - (lm(Xd, k)[1] - 0.003)) / 0.009) ** 2))                # the eye and the lid under it, not the brow above
    eyeW = np.maximum(ew('leye'), ew('reye'))
    # the lower face keeps its shading (stubble and the line of the jaw are the man, not the light); round the eyes it is turned down
    lowface = sm((lm(Xd, 'nose')[1] - 0.004 - y) / 0.012)
    sock = np.maximum(np.exp(-(((x - lm(Xd, 'leye')[0]) / 0.024) ** 2 + ((y - lm(Xd, 'leye')[1] - 0.004) / 0.016) ** 2)), np.exp(-(((x - lm(Xd, 'reye')[0]) / 0.024) ** 2 + ((y - lm(Xd, 'reye')[1] - 0.004) / 0.016) ** 2)))
    midk = (a.mid + (1 - a.mid) * lowface) * (1 - a.socket * sock)
    # an older photograph of the man than the age he plays at: the fine lines of age turned down (`--fine`), the features kept
    Lsum = S[..., 0] * a.fine + S[..., 1] * midk + S[..., 2] * (1 - a.flat * (1 - 0.5 * lowface))
    ps, bs = Lsum[cheek], bl[cheek]; bm = np.median(bs, 0); pm_ab = np.median(S[cheek][:, 3:5], 0); psd = S[cheek][:, 0].std() + 1e-6
    # above the brows a photograph often shows a headband, a cap or hair, not forehead: keep only what is skin-coloured there
    Lraw = S[..., 0] + S[..., 1] + S[..., 2]; sk = S[cheek]; Lsk = np.median(Lraw[cheek]); fz = sm((y - (browY + 0.004)) / 0.006)
    ok = (Lraw > Lsk - 24) & (Lraw < Lsk + 32)
    if not a.bw: ok &= (np.abs(S[..., 3] - pm_ab[0]) < 12) & (np.abs(S[..., 4] - pm_ab[1]) < 14)
    okf = cv2.erode(ok.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32); okf = np.minimum(cv2.GaussianBlur(okf, (0, 0), 7) * 1.6 - 0.3, 1).clip(0, 1)
    # the column above a covered patch is covered too (a strap, then cap): once lost going up the forehead, stay lost
    m = m * (1 - fz * (1 - okf)); cover = float((fz * (1 - okf) * (m > 0.01)).sum() / max(1.0, (fz * (m > 0.01)).sum())); print('forehead covered in the photograph: %.0f%%' % (100 * cover))
    out = np.empty(S.shape[:2] + (3,))
    kd = float(np.clip(3.2 / psd, 0.6, 1.5)); dL = (Lsum - np.median(ps)) + S[..., 0] * a.fine * (kd - 1)                              # fine detail at a contrast that suits the head's texture
    # the crease at each corner of the mouth is a shadow, and squeezed onto another man's mouth it reads as a mole: it is smoothed away below
    mc = np.maximum(np.exp(-((x - Xd[61, 0]) ** 2 + (y - Xd[61, 1]) ** 2) / 0.008 ** 2), np.exp(-((x - Xd[291, 0]) ** 2 + (y - Xd[291, 1]) ** 2) / 0.008 ** 2))
    out[..., 0] = bm[0] + np.clip(dL, -60, 13)
    bh = np.clip(S[..., 5], 0, 1); out[..., 0] = out[..., 0] * (1 - bh) + np.minimum(out[..., 0], bm[0] - a.brow) * bh             # the brows: as dark as hair, wherever his are
    if a.bw: out[..., 1:] = bm[1:] + (bl[..., 1:] - bm[1:]) * 0.55                                # a black-and-white picture gives shape only: the colour stays the head's, its lips' red tempered to the new lightness
    else: out[..., 1:] = bm[1:] + np.clip((S[..., 3:5] - pm_ab) * a.chroma * (1 - 0.7 * np.maximum(eyeW, sock * 0.8))[..., None], -11, 11)          # the lids' own colour, not the purple a shadow gives them
    out[..., 1:] = out[..., 1:] * (1 - 0.6 * bh[..., None])                                         # hair is nearer grey than skin is
    face = unlab(out)
    face = cv2.bilateralFilter(np.clip(face, 0, 255).astype(np.uint8), 5, 16, 3).astype(np.float64)
    # just outside each corner of the mouth: small dark creases closed over (grey closing), the lips themselves left alone
    cxm = min(abs(Xd[61, 0]), abs(Xd[291, 0])); zw = 0.014 * max(1.0, a.crease / 17); zone = (np.exp(-(((np.abs(x) - cxm - 0.006) / zw) ** 2 + ((y - (Xd[61, 1] + Xd[291, 1]) / 2 - 0.004) / (0.016 * max(1.0, a.crease / 17))) ** 2)) * sm((np.abs(x) - cxm + 0.003) / 0.004))[..., None]
    kk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (a.crease, a.crease)); closed = cv2.GaussianBlur(cv2.morphologyEx(np.clip(face, 0, 255).astype(np.uint8), cv2.MORPH_CLOSE, kk), (0, 0), 2).astype(np.float64)
    zone = np.clip(zone * 1.8, 0, 1); face = face * (1 - zone) + closed * zone                          # the photograph's grain, down to the head texture's own smoothness
    res_img = blend_bands(base, face, np.clip(m * a.strength, 0, 1))
    res_img = np.where(hit[..., None], res_img, base)
    if a.iris:
        # the coloured part of the head's own eye, moved to his eye colour: hue and depth from the colour given, the iris's own pattern kept
        want = np.array([int(a.iris[5:7], 16), int(a.iris[3:5], 16), int(a.iris[1:3], 16)], np.float64); hsv = cv2.cvtColor(np.clip(res_img, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float64)
        V = hsv[..., 2]; pup = eyeball & (V < 45); ring = np.zeros_like(eyeball)
        if pup.any():
            n_, lab_ = cv2.connectedComponents(pup.astype(np.uint8))
            for c_ in range(1, n_):
                py, px_ = np.where(lab_ == c_)
                if len(py) < 12: continue
                cy_, cx_, r_ = py.mean(), px_.mean(), math.sqrt(len(py) / math.pi); yy, xx = np.ogrid[:N, :N]; d_ = np.hypot(yy - cy_, xx - cx_)
                ring |= eyeball & (d_ > r_ * 0.9) & (d_ < r_ * 2.9) & (V > 30) & (V < 200)
        if ring.any():
            g = res_img[ring].mean(1, keepdims=True); res_img[ring] = np.clip(want[None] * (g / max(1.0, g.mean())) * 1.0, 0, 255)
    cv2.imwrite(a.out, np.clip(res_img, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 88])
    # ---- how his face differs from this head's, measured the same way on both ----
    info = dict(turn=turn, face_px=float(fw), residual_px=float(res.mean()), mirror=mir)
    try:
        if True:
            Md = measures(frontal(Ld)[0]); Mp = measures(Lf); io_m = float(np.linalg.norm(J['LEye'] - J['REye'])); cl = lambda v: float(np.clip(v * 0.7, -0.6, 0.6))
            f = dict(faceW=cl((Mp['faceW'] / Md['faceW'] - 1) / 0.07), jawW=cl((Mp['jawW'] / Md['jawW'] - 1) / 0.13), faceL=cl((Mp['faceL'] / Md['faceL'] - 1) / 0.085),
                     chinL=cl((Mp['chinL'] - Md['chinL']) * io_m / 0.011), noseL=cl((Mp['noseL'] - Md['noseL']) * io_m / 0.007), noseW=cl((Mp['noseW'] / Md['noseW'] - 1) / 0.30))
            info['face'] = {k2: round(v, 2) for k2, v in f.items()}; info['his'] = {k2: round(float(v), 3) for k2, v in Mp.items()}; info['head'] = {k2: round(float(v), 3) for k2, v in Md.items()}
    except Exception as e: info['face_error'] = str(e)
    sk = np.median(res_img[cheek].reshape(-1, 3), 0) if cheek.any() else np.array([128, 128, 128]); info['skin'] = '#%02x%02x%02x' % (int(sk[2]), int(sk[1]), int(sk[0]))
    print(json.dumps(info))
    if a.json: json.dump(info, open(a.json, 'w'), indent=1)
    if a.debug:
        os.makedirs(a.debug, exist_ok=True); stem = os.path.splitext(os.path.basename(a.out))[0]
        head2 = dict(head); tex2 = np.clip(res_img, 0, 255).astype(np.uint8)
        fr = render(head2, tex2, 0.0, 512); tq = render(head2, tex2, math.radians(32), 512); b0 = render(head, base, 0.0, 512)
        x0, x1 = int(max(0, L[:, 0].min() - fw * 0.35)), int(min(photo.shape[1], L[:, 0].max() + fw * 0.35)); y0, y1 = int(max(0, L[:, 1].min() - fw * 0.55)), int(min(photo.shape[0], L[:, 1].max() + fw * 0.3))
        crop = photo[y0:y1, x0:x1]; crop = cv2.resize(crop, (int(crop.shape[1] * 512 / crop.shape[0]), 512))
        cv2.imwrite(os.path.join(a.debug, stem + '_check.jpg'), np.hstack([crop, fr, tq, b0]), [cv2.IMWRITE_JPEG_QUALITY, 88])
        dbg = photo.copy()
        for p in P2[::3]: cv2.circle(dbg, (int(p[0]), int(p[1])), max(1, int(fw / 160)), (0, 255, 0), -1)
        for p in project(cam, Xf)[::3]: cv2.circle(dbg, (int(p[0]), int(p[1])), max(1, int(fw / 160)), (0, 0, 255), 1)
        cv2.imwrite(os.path.join(a.debug, stem + '_fit.jpg'), dbg[y0:y1, x0:x1], [cv2.IMWRITE_JPEG_QUALITY, 85])
        cv2.imwrite(os.path.join(a.debug, stem + '_mask.jpg'), np.hstack([np.repeat((np.clip(m, 0, 1) * 255).astype(np.uint8)[..., None], 3, 2), np.clip(face, 0, 255).astype(np.uint8)])[: N * 6 // 10], [cv2.IMWRITE_JPEG_QUALITY, 80])

if __name__ == '__main__': main()
