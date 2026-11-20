# Finding the walks for tools/walk_footage.py: in pose scans of whole videos (tools/track.py --big at 10 Hz), the stretches where
# a player crosses the picture side-on at a walking pace with his nose leading (not a shuffle, not a backpedal), the figure's
# size steady and the ankles swapping sides.   python -I walk_find.py scan.npz [...]   → t0-t1 per stretch; pad each by a
# second, track those windows at 30 Hz with track.py --big --windows, and list them in walk_footage.py's manifest.
import sys, numpy as np
for fn in sys.argv[1:]:
    d = np.load(fn); t = d['t'].astype(float); xy = d['xy'].astype(float); vis = d['vis']; shot = d['shot']
    pan = np.nan_to_num(d['pan'].astype(float)) if 'pan' in d.files else np.zeros((len(t), 2))
    hip = (xy[:, 23] + xy[:, 24]) / 2; h = np.linalg.norm((xy[:, 11] + xy[:, 12]) / 2 - (xy[:, 27] + xy[:, 28]) / 2, axis=1) + 1e-6
    gx = hip[:, 0] - np.cumsum(pan[:, 0])                  # across the picture, the camera's own turn taken out
    out = []; i = 0
    while i < len(t):
        j = np.searchsorted(t, t[i] + 1.8)
        if j - i >= 8 and j <= len(t) and t[j - 1] - t[i] > 1.4 and (shot[i:j] == shot[i]).all() and vis[i:j][:, [23, 24, 25, 26, 27, 28]].min(-1).mean() > 0.6:
            hh = np.median(h[i:j]); dt = t[j - 1] - t[i]; vx = (gx[j - 1] - gx[i]) / dt / hh          # body-lengths (shoulder to ankle, ~1.45 m) per second
            grow = abs(np.log(h[j - 1] / h[i]))
            ax = xy[i:j, 27, 0] - xy[i:j, 28, 0]; zc = np.sum(np.diff(np.sign(ax)) != 0)
            mono = np.mean(np.sign(np.diff(gx[i:j])) == np.sign(vx))
            hw = np.median(np.abs(xy[i:j, 23, 0] - xy[i:j, 24, 0])) / hh                                  # hips side-on to the camera: narrow in the picture
            face = np.median(xy[i:j, 0, 0] - (xy[i:j, 7, 0] + xy[i:j, 8, 0]) / 2) * np.sign(vx)              # the nose ahead of the ears, the way he goes
            if 0.5 < abs(vx) < 1.15 and grow < 0.3 and zc >= 2 and mono > 0.8 and hw < 0.13 and face > 0.004 * hh:
                out.append((t[i], t[j - 1], vx, grow, zc, hh)); i = j; continue
        i += 1
    print(fn, len(t))
    for o in out: print('   %.2f-%.2f  v %.2f body/s  grow %.2f  zc %d  h %.0fpx' % o)
