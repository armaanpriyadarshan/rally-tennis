# How one man's face differs in shape from the library head he wears, as offsets at landmarks for
# js/facewarp.js. The face landmarker finds its 478 landmarks (with an estimate of depth) in each
# photograph of him and in a square-on picture of the head itself; each photograph is turned,
# scaled and moved onto the head's landmarks (a similarity fit, which removes the pose and the size),
# the differences are averaged over the photographs (expressions count for less where they move
# things: a smile's mouth and cheeks), made symmetric, measured in metres on the head, damped (depth
# by half, since the landmarker only estimates it; nothing more than 1.5 cm) and written out at a
# well-spread set of landmarks. The same warp is applied here and drawn before and after.
#
#   /tmp/rally-work/pose-env/bin/python -I tools/face_shape.py <head.glb> <target model.glb> <out.json> --model face_landmarker.task \
#       --photos a.jpg b.jpg ... [--tex baked.jpg] [--debug dir] [--name Federer] [--max 0.015] [--gain 1.0]
import sys, os, json, math, argparse, importlib.util, struct
import numpy as np, cv2
spec = importlib.util.spec_from_file_location('face_bake', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_bake.py'))
fb = importlib.util.module_from_spec(spec); spec.loader.exec_module(fb)

# landmarks the warp is carried by: jaw and temples, chin, cheekbones and cheeks, brows, eye corners
# and lids, nose bridge, tip and wings, mouth corners and lips (no forehead: it is under hair or a band)
SEL = [162, 21, 54, 284, 251, 389, 127, 356, 234, 454, 93, 323, 132, 361, 58, 288, 172, 397, 136, 365, 150, 379, 149, 378, 176, 400, 148, 377, 152,
       175, 199, 200, 70, 63, 105, 66, 107, 300, 293, 334, 296, 336, 33, 133, 362, 263, 159, 386, 145, 374, 168, 6, 197, 195, 5, 4, 1, 2, 98, 327,
       129, 358, 48, 278, 61, 291, 0, 17, 37, 267, 84, 314, 50, 280, 116, 345, 123, 352, 205, 425, 187, 411, 192, 416]
EYES = {33, 133, 362, 263, 159, 386, 145, 374}
MOUTH = {61, 291, 0, 17, 37, 267, 84, 314, 13, 14, 78, 308, 82, 312, 87, 317}
SMILE = MOUTH | {205, 425, 187, 411, 192, 416, 50, 280, 123, 352}
SIGMA, LAMBDA, FADE0, FADE1 = 0.02, 0.02, 0.03, 0.055

def joints_of(path):
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    skin = j['skins'][0]; a = j['accessors'][skin['inverseBindMatrices']]; bv = j['bufferViews'][a['bufferView']]
    m = np.frombuffer(b, '<f4', a['count'] * 16, bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, 4, 4).transpose(0, 2, 1)
    return {j['nodes'][ni]['name'].replace('Bip01 ', '').replace('Bip01_', ''): np.linalg.inv(m[k])[:3, 3] for k, ni in enumerate(skin['joints'])}

def umeyama(src, dst, w):
    """s, R, t with dst ~ s R src + t (weighted)."""
    w = w / w.sum(); ms = (src * w[:, None]).sum(0); md = (dst * w[:, None]).sum(0); A = src - ms; B = dst - md
    C = (B * w[:, None]).T @ A; U, S, Vt = np.linalg.svd(C); d = np.sign(np.linalg.det(U @ Vt)); E = np.diag([1, 1, d])
    R = U @ E @ Vt; var = ((A ** 2).sum(1) * w).sum(); s = (S * np.diag(E)).sum() / var
    return s, R, md - s * R @ ms

def rbf(points, P, D, sigma=SIGMA, lam=LAMBDA, f0=FADE0, f1=FADE1):
    """The same field as js/facewarp.js warpHead: returns the displaced points."""
    if not len(P): return points.copy()
    d2 = ((P[:, None] - P[None]) ** 2).sum(2); K = np.exp(-d2 / (2 * sigma ** 2)) + lam * np.eye(len(P)); W = np.linalg.solve(K, D)
    out = points.copy()
    for a in range(0, len(points), 4000):
        q = points[a:a + 4000]; dd = ((q[:, None] - P[None]) ** 2).sum(2); G = np.exp(-dd / (2 * sigma ** 2)); off = G @ W
        t = np.clip((np.sqrt(dd.min(1)) - f0) / (f1 - f0), 0, 1); f = 1 - t * t * (3 - 2 * t); out[a:a + 4000] = q + off * f[:, None]
    return out

def smooth_normals(pos, idx):
    key = {}; vid = np.zeros(len(pos), int)
    for v, p in enumerate(np.round(pos * 1e5).astype(np.int64)): vid[v] = key.setdefault(tuple(p), len(key))
    acc = np.zeros((len(key), 3)); a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]; fn = np.cross(b - a, c - a)
    for k in range(3): np.add.at(acc, vid[idx[:, k]], fn)
    n = acc[vid]; return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('target'); ap.add_argument('out'); ap.add_argument('--model', required=True); ap.add_argument('--photos', nargs='+', required=True)
    ap.add_argument('--tex'); ap.add_argument('--debug'); ap.add_argument('--name', default='face'); ap.add_argument('--max', type=float, default=0.015); ap.add_argument('--gain', type=float, default=1.0)
    a = ap.parse_args()
    head = fb.read_glb(a.glb); J = head['joints']; RS = 768
    img, dpos, dhit, dmap = fb.render(head, head['tex'], 0.0, RS, want_pos=True)
    Ld = fb.landmarks(img, a.model)
    if Ld is None: raise SystemExit('no face found on the head')
    Ld = Ld[:468]; sc = dmap['sc']
    # mirror pairs, from the head's own (symmetric) face
    cx = Ld[[1, 4, 6, 168, 152], 0].mean(); mir = np.array([int(np.argmin(np.hypot(Ld[:, 0] - (2 * cx - Ld[i, 0]), Ld[:, 1] - Ld[i, 1]))) for i in range(468)])
    io = np.linalg.norm(Ld[33, :2] - Ld[263, :2])
    core = np.array([k for k in range(468) if k not in MOUTH]); wcore = np.ones(len(core)); wcore[np.isin(core, [33, 133, 362, 263, 168, 6, 1, 4])] = 4
    acc = np.zeros((468, 3)); wsum = np.zeros(468); used = []
    for p in a.photos:
        ph = cv2.imread(p)
        if ph is None: print('cannot read', p); continue
        L = fb.landmarks(ph, a.model)
        if L is None: print('no face:', p); continue
        L = L[:468]; fw = np.ptp(L[:, 0]); _, turn = fb.frontal(L)
        if fw < 90 or abs(turn['yaw']) > 32: print('skip (face %.0f px, yaw %.0f): %s' % (fw, turn['yaw'], p)); continue
        s, R, t = umeyama(L[core], Ld[core], wcore); Al = (s * (R @ L.T)).T + t
        rms = float(np.sqrt((((Al[core] - Ld[core])[:, :2]) ** 2).sum(1).mean()) / io)
        if rms > 0.16: print('skip (fit %.2f of the eye spacing: not a face like this one): %s' % (rms, p)); continue
        opened = float(np.linalg.norm(L[13, :2] - L[14, :2]) / fw); mw = float(np.linalg.norm(L[61, :2] - L[291, :2]) / np.linalg.norm(L[33, :2] - L[263, :2]))
        smiling = opened > 0.018 or mw > 0.98
        w = np.full(468, max(0.15, 1 - abs(turn['yaw']) / 36) * min(1.0, fw / 260) * max(0.3, 1 - max(0, abs(turn['pitch']) - 12) / 25))
        if smiling: w[list(SMILE)] *= 0.12
        acc += (Al - Ld) * w[:, None]; wsum += w; used.append(dict(photo=os.path.basename(p), face=round(fw), yaw=round(turn['yaw']), pitch=round(turn['pitch']), fit=round(rms, 3), smiling=smiling))
        print('used %s: face %.0f px, yaw %.0f, pitch %.0f, fit %.3f%s' % (os.path.basename(p), fw, turn['yaw'], turn['pitch'], rms, ', smiling' if smiling else ''))
    if not used: raise SystemExit('no usable photograph')
    d = acc / np.maximum(wsum, 1e-6)[:, None]
    d = (d + d[mir] * [-1, 1, 1]) / 2                                                                # a face is near enough symmetric: halves the noise
    # pixels of the head's picture -> metres on the head (y and depth flip: the picture's y runs down, the landmarker's depth is toward the camera)
    off = np.stack([d[:, 0] / sc, -d[:, 1] / sc, -d[:, 2] / sc * 0.5], 1) * a.gain
    tp = joints_of(a.target)['Head']; hp = J['Head']; shift = tp - hp
    ix = np.clip(Ld[:, 0].astype(int), 0, RS - 1); iy = np.clip(Ld[:, 1].astype(int), 0, RS - 1)
    pts, offs, names = [], [], []
    for k in SEL:
        if not dhit[iy[k], ix[k]]: continue
        o = off[k].copy(); lim = 0.006 if k in EYES else a.max; n = np.linalg.norm(o)
        if n > lim: o *= lim / n
        pts.append(dpos[iy[k], ix[k]] + shift); offs.append(o); names.append(k)
    pts = np.array(pts); offs = np.array(offs)
    warp = dict(pts=np.round(pts, 4).tolist(), off=np.round(offs, 4).tolist(), sigma=SIGMA, **{'lambda': LAMBDA}, fade0=FADE0, fade1=FADE1)
    stats = dict(n=len(pts), mean_mm=round(float(np.linalg.norm(offs, axis=1).mean() * 1000), 1), max_mm=round(float(np.linalg.norm(offs, axis=1).max() * 1000), 1), photos=used, shift=np.round(shift, 4).tolist())
    json.dump(dict(warp=warp, stats=stats), open(a.out, 'w'))
    print(json.dumps(stats)[:400])
    if a.debug:
        os.makedirs(a.debug, exist_ok=True); tex = cv2.imread(a.tex) if a.tex else head['tex']
        moved = rbf(head['pos'] + shift, pts, offs) - shift
        h2 = dict(head); h2['pos'] = moved; h2['nrm'] = smooth_normals(moved, head['idx']); h1 = dict(head); h1['nrm'] = smooth_normals(head['pos'], head['idx'])
        ims = [fb.render(h1, tex, 0.0, 300), fb.render(h2, tex, 0.0, 300), fb.render(h2, tex, math.radians(32), 300)]
        ph = cv2.imread(a.photos[0]); L = fb.landmarks(ph, a.model); fw = np.ptp(L[:, 0]); x0, x1 = int(max(0, L[:, 0].min() - fw * 0.35)), int(min(ph.shape[1], L[:, 0].max() + fw * 0.35)); y0, y1 = int(max(0, L[:, 1].min() - fw * 0.55)), int(min(ph.shape[0], L[:, 1].max() + fw * 0.3))
        crop = cv2.resize(ph[y0:y1, x0:x1], (int((x1 - x0) * 300 / (y1 - y0)), 300)); row = np.hstack([crop] + ims)
        cv2.putText(row, '%s: photo | before | after | after 3/4  (mean %.1f mm, max %.1f mm, %d photos)' % (a.name, stats['mean_mm'], stats['max_mm'], len(used)), (6, 292), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        cv2.imwrite(os.path.join(a.debug, a.name + '_shape.jpg'), row, [cv2.IMWRITE_JPEG_QUALITY, 86])

if __name__ == '__main__': main()
