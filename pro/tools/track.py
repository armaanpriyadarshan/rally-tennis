# Track the near-end player's joints through a broadcast clip, on main-camera shots only.
#
#   python -I track.py clip.mp4 out.npz --model pose_landmarker_heavy.task [--hz 30] [--t0 s] [--t1 s] [--debug dir]
#                     [--windows 12.5-15,40-43.2]  only these stretches of the clip (seconds), e.g. at full frame rate around chosen strokes
#                     [--big]                      the player fills the picture (a court-level camera or a replay), not a small figure on the main camera
#
# The main camera sits high behind one baseline, so the near player is a small figure with his
# back to it. A pose model cannot find a figure that small in the whole picture, so the lower
# part of the frame is searched in overlapping tiles, and once the player is found a square
# crop follows him from frame to frame. Close-ups, crowd shots and replays from other cameras
# drop out by themselves: no whole body of the right size is found in them. Cuts are detected
# from the change between consecutive frames and end a track.
#
# Output (numpy .npz): for every tracked frame its time `t` (s), frame number `f`, shot number
# `shot`, the 33 MediaPipe landmarks in picture pixels `xy` with relative depth `z` and
# visibility `vis`, the model's own 3D estimate `world` (metres about the hips), the mean colour
# `col` of his shirt, shorts and head (BGR, to tell the two players of a match apart), and the
# frame size and rate, and `pan`: how far the background moved in the picture since the frame
# before (pixels; the camera following play), so that movement over the ground can be told from
# movement of the camera. Nothing is smoothed here.
import sys, os, argparse, math
import numpy as np, cv2
import mediapipe as mp
cv2.setNumThreads(2)                    # a background job on a shared machine: keep OpenCV to two threads

ap = argparse.ArgumentParser()
ap.add_argument('clip'); ap.add_argument('out'); ap.add_argument('--model', required=True)
ap.add_argument('--hz', type=float, default=30); ap.add_argument('--t0', type=float, default=0); ap.add_argument('--t1', type=float, default=1e9)
ap.add_argument('--debug', default=None); ap.add_argument('--minh', type=float, default=0.07); ap.add_argument('--maxh', type=float, default=0.55)
ap.add_argument('--windows', default=None); ap.add_argument('--big', action='store_true')
ap.add_argument('--cutd', type=float, default=22)   # how much the small grey picture must change at once to count as a cut (a slow replay's zoom changes it a lot)
A = ap.parse_args()

BaseOptions, vision = mp.tasks.BaseOptions, mp.tasks.vision
LM = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=A.model), running_mode=vision.RunningMode.IMAGE, num_poses=1,
    min_pose_detection_confidence=0.35, min_pose_presence_confidence=0.35, min_tracking_confidence=0.35))

NOSE, LEAR, REAR, LSH, RSH, LHIP, RHIP, LKN, RKN, LAN, RAN, LHEEL, RHEEL = 0, 7, 8, 11, 12, 23, 24, 25, 26, 27, 28, 29, 30
CORE = [LSH, RSH, LHIP, RHIP, LKN, RKN, LAN, RAN]

def pose_in(frame, x0, y0, side):
    """Run the model on a square crop; landmarks come back in picture pixels."""
    H, W = frame.shape[:2]
    x0 = int(round(x0)); y0 = int(round(y0)); side = int(round(side))
    crop = np.zeros((side, side, 3), np.uint8)
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + side), min(H, y0 + side)
    if xb <= xa or yb <= ya: return None
    crop[ya - y0:yb - y0, xa - x0:xb - x0] = frame[ya:yb, xa:xb]
    if side < 320: crop = cv2.resize(crop, (320, 320), interpolation=cv2.INTER_CUBIC)
    elif side > 640: crop = cv2.resize(crop, (640, 640), interpolation=cv2.INTER_AREA)
    r = LM.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop[:, :, ::-1])))
    if not r.pose_landmarks: return None
    lm = r.pose_landmarks[0]; wl = r.pose_world_landmarks[0]
    xy = np.array([[p.x * side + x0, p.y * side + y0] for p in lm], np.float32)
    z = np.array([p.z * side for p in lm], np.float32); vis = np.array([p.visibility for p in lm], np.float32)
    world = np.array([[p.x, p.y, p.z] for p in wl], np.float32)
    return dict(xy=xy, z=z, vis=vis, world=world)

def measure(p):
    """Height in pixels (head to heels), where the hips are, and whether the whole body is there."""
    xy, vis = p['xy'], p['vis']
    top = min(xy[NOSE, 1], xy[LEAR, 1], xy[REAR, 1]); bot = max(xy[LAN, 1], xy[RAN, 1], xy[LHEEL, 1], xy[RHEEL, 1])
    hip = (xy[LHIP] + xy[RHIP]) / 2
    # the chain of bones is a steadier measure of size than the height of a crouching, lunging body
    seg = lambda a, b: float(np.linalg.norm(xy[a] - xy[b]))
    chain = max(seg(LAN, LKN) + seg(LKN, LHIP), seg(RAN, RKN) + seg(RKN, RHIP)) + float(np.linalg.norm((xy[LSH] + xy[RSH]) / 2 - hip)) + float(np.linalg.norm((xy[LSH] + xy[RSH]) / 2 - (xy[LEAR] + xy[REAR]) / 2))
    return dict(h=max(bot - top, chain), hip=hip, feet=bot, whole=float(np.min(vis[CORE])), seen=float(np.mean(vis[CORE])))

def colours(frame, xy):
    """Mean colour (BGR) of the shirt, the shorts and the head: enough to tell two players apart."""
    H, W = frame.shape[:2]; out = []
    sh, hp = (xy[LSH] + xy[RSH]) / 2, (xy[LHIP] + xy[RHIP]) / 2
    quads = [[xy[LSH], xy[RSH], xy[RHIP], xy[LHIP]], [xy[LHIP], xy[RHIP], (xy[RHIP] + xy[RKN]) / 2, (xy[LHIP] + xy[LKN]) / 2]]
    for q in quads:
        q = np.array(q, np.float32); c = q.mean(0); q = (c + (q - c) * 0.7).astype(np.int32)
        x0, y0, x1, y1 = max(0, q[:, 0].min()), max(0, q[:, 1].min()), min(W, q[:, 0].max() + 1), min(H, q[:, 1].max() + 1)
        if x1 - x0 < 2 or y1 - y0 < 2: out.append([0, 0, 0]); continue
        m = np.zeros((y1 - y0, x1 - x0), np.uint8); cv2.fillConvexPoly(m, q - [x0, y0], 255)
        out.append(cv2.mean(frame[y0:y1, x0:x1], m)[:3] if m.any() else [0, 0, 0])
    e = (xy[LEAR] + xy[REAR]) / 2; r = max(2, int(0.5 * np.linalg.norm(sh - e))); x0, y0, x1, y1 = int(max(0, e[0] - r)), int(max(0, e[1] - r)), int(min(W, e[0] + r)), int(min(H, e[1] + r * 0.4))
    out.append(frame[y0:y1, x0:x1].reshape(-1, 3).mean(0) if x1 > x0 and y1 > y0 else [0, 0, 0])
    return np.array(out, np.float32)

def locate_big(frame):
    """A player who fills the picture: look at the whole frame and at its middle."""
    H, W = frame.shape[:2]; best = None
    for x0, y0, side in ((0, (H - W) / 2, W), ((W - H) / 2, 0, H), (0, 0, H), (W - H, 0, H), ((W - 1.4 * H) / 2, -0.2 * H, 1.4 * H)):
        p = pose_in(frame, x0, y0, side)
        if p is None: continue
        m = measure(p)
        if m['seen'] < 0.5 or not (0.18 * H <= m['h'] <= 1.5 * H): continue
        if best is None or m['seen'] > best[1]['seen']: best = (p, m)
    return best

def locate(frame):
    """Search the lower part of the picture for the near player: the largest whole body there."""
    if A.big: return locate_big(frame)
    H, W = frame.shape[:2]; best = None
    for side, ys in ((0.50 * H, (0.34, 0.50)), (0.80 * H, (0.20,))):
        n = max(2, int(math.ceil((W - side) / (side * 0.5))) + 1)
        for yf in ys:
            for i in range(n):
                x0 = (W - side) * i / (n - 1); p = pose_in(frame, x0, yf * H, side)
                if p is None: continue
                m = measure(p)
                if m['whole'] < 0.5 or not (A.minh * H <= m['h'] <= A.maxh * H): continue
                if m['feet'] < 0.42 * H or not (0.06 * W <= m['hip'][0] <= 0.94 * W): continue
                # a body cut by the edge of its tile is measured again from a tile centred on it
                if best is None or m['h'] > best[1]['h']: best = (p, m)
    if best is None: return None
    p, m = best; side = float(np.clip(3.0 * m['h'], 224, 0.95 * H)); q = pose_in(frame, m['hip'][0] - side / 2, m['hip'][1] - side * 0.55, side)
    if q is not None:
        mq = measure(q)
        if mq['whole'] >= 0.5 and 0.7 * m['h'] <= mq['h'] <= 1.4 * m['h']: return q, mq
    return p, m

cap = cv2.VideoCapture(A.clip); fps = cap.get(cv2.CAP_PROP_FPS) or 25.0; W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
stride = max(1, int(round(fps / A.hz))); step = stride / fps
if A.t0 > 0: cap.set(cv2.CAP_PROP_POS_MSEC, A.t0 * 1000)
f = int(round(cap.get(cv2.CAP_PROP_POS_FRAMES)))
rec = dict(t=[], f=[], shot=[], xy=[], z=[], vis=[], world=[], col=[], pan=[])
WINS = [tuple(float(v) for v in w.split('-')) for w in A.windows.split(',')] if A.windows else None; win_i = -1; prev_bg = None; last_box = None
HAN = cv2.createHanningWindow((320, 180), cv2.CV_32F)
def background(frame, box):
    """The picture small and grey, with the player blanked out: what is left moves only when the camera does."""
    g = cv2.cvtColor(cv2.resize(frame, (320, 180), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
    if box is not None:
        kx, ky = 320 / frame.shape[1], 180 / frame.shape[0]; x0, y0, x1, y1 = int(box[0] * kx), int(box[1] * ky), int(box[2] * kx) + 1, int(box[3] * ky) + 1
        g[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = float(g.mean())
    return g
shot = 0; prev_small = None; lock = None; miss = 0; next_try = 0.0; cuts = []; dbg_n = 0
if A.debug: os.makedirs(A.debug, exist_ok=True)
while True:
    ok = cap.grab()
    if not ok: break
    t = f / fps; f += 1
    if t > A.t1: break
    if WINS is not None:
        k = next((i for i, w in enumerate(WINS) if w[0] <= t <= w[1]), -1)
        if k < 0:
            if t > max(w[1] for w in WINS): break
            continue
        if k != win_i: win_i = k; shot += 1; lock = None; miss = 0; next_try = t; prev_small = None; prev_bg = None
    if (f - 1) % stride: continue
    ok, frame = cap.retrieve()
    if not ok: break
    # a cut: the small grey picture changes all at once
    small = cv2.cvtColor(cv2.resize(frame, (64, 36), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
    if prev_small is not None:
        d = float(np.mean(np.abs(small - prev_small)))
        if d > A.cutd: shot += 1; lock = None; miss = 0; next_try = t + (0.0 if WINS else 0.12); cuts.append(t); prev_bg = None
    prev_small = small
    if lock is None:
        if t < next_try: continue
        got = locate(frame)
        if got is None: next_try = t + (1.0 if t - (cuts[-1] if cuts else 0) < 2 else 2.0); continue
        p, m = got; lock = dict(hip=m['hip'].copy(), vel=np.zeros(2, np.float32), h=m['h']); miss = 0
        if rec['shot'] and rec['shot'][-1] == shot: shot += 1                      # a fresh hold is a fresh stretch: it may be on someone else
    else:
        side = float(np.clip((2.2 if A.big else 3.0) * lock['h'], 224, (2.2 if A.big else 0.95) * H)); c = lock['hip'] + lock['vel']
        p = pose_in(frame, c[0] - side / 2, c[1] - side * 0.55, side); m = measure(p) if p is not None else None
        if m is None or m['seen'] < 0.4 or not (0.6 * lock['h'] <= m['h'] <= 1.6 * lock['h']) or np.linalg.norm(m['hip'] - c) > 0.45 * side:
            miss += 1; prev_bg = None
            if miss > 4: lock = None; next_try = t + 0.2
            continue
        miss = 0; lock['vel'] = 0.5 * lock['vel'] + 0.5 * (m['hip'] - lock['hip']); lock['hip'] = m['hip'].copy(); lock['h'] = 0.9 * lock['h'] + 0.1 * m['h']
    box = (p['xy'][:, 0].min() - 0.25 * m['h'], p['xy'][:, 1].min() - 0.2 * m['h'], p['xy'][:, 0].max() + 0.25 * m['h'], p['xy'][:, 1].max() + 0.1 * m['h'])
    bg = background(frame, box); pan = (np.nan, np.nan)
    if prev_bg is not None:
        (dx, dy), resp = cv2.phaseCorrelate(background(prev_frame, box), bg, HAN); pan = (dx * W / 320, dy * H / 180) if resp > 0.05 else (0.0, 0.0)
    prev_bg = bg; prev_frame = frame; rec['pan'].append(pan)
    rec['t'].append(t); rec['f'].append(f - 1); rec['shot'].append(shot); rec['xy'].append(p['xy']); rec['z'].append(p['z']); rec['vis'].append(p['vis']); rec['world'].append(p['world']); rec['col'].append(colours(frame, p['xy']))
    if A.debug and len(rec['t']) % max(1, int(A.hz * 2)) == 1 and dbg_n < 80:
        im = frame.copy()
        for a, b in ((11, 13), (13, 15), (12, 14), (14, 16), (11, 12), (23, 24), (11, 23), (12, 24), (23, 25), (25, 27), (24, 26), (26, 28), (27, 29), (28, 30)):
            cv2.line(im, tuple(int(v) for v in p['xy'][a]), tuple(int(v) for v in p['xy'][b]), (0, 255, 255) if a % 2 else (255, 128, 0), 2)
        cv2.putText(im, f't={t:.2f} shot={shot} h={m["h"]:.0f}', (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
        cv2.imwrite(os.path.join(A.debug, f'd{dbg_n:03d}.jpg'), cv2.resize(im, (960, int(960 * H / W))), [cv2.IMWRITE_JPEG_QUALITY, 80]); dbg_n += 1
n = len(rec['t'])
np.savez_compressed(A.out, t=np.array(rec['t'], np.float32), f=np.array(rec['f'], np.int32), shot=np.array(rec['shot'], np.int32),
                    xy=np.array(rec['xy'], np.float32).reshape(n, 33, 2), z=np.array(rec['z'], np.float32).reshape(n, 33), vis=np.array(rec['vis'], np.float32).reshape(n, 33),
                    world=np.array(rec['world'], np.float32).reshape(n, 33, 3), col=np.array(rec['col'], np.float32).reshape(n, 3, 3), pan=np.array(rec['pan'], np.float32).reshape(n, 2), size=np.array([W, H], np.int32), fps=np.float32(fps), step=np.float32(step), cuts=np.array(cuts, np.float32))
print(f'{A.clip}: {n} tracked frames, {shot + 1} shots, {fps:.2f} fps, every {stride} frame(s)')
