# Put the walk made by walk_footage.py into js/locodata.js in place of the motion-capture walk (the clip `walk`), so the
# game strolls between points as the players in the footage do.
#   python3 -I walk_into_loco.py walk.json [js/locodata.js]
# The clip keeps the file's form: n frames at 60 a second, v (right, forward) in m/s, J the joints per frame. The footage
# cycle is resampled to the number of frames its real length takes at 60 a second.
import sys, json, re
import numpy as np
src = json.load(open(sys.argv[1])); path = sys.argv[2] if len(sys.argv) > 2 else 'js/locodata.js'
J = np.array(src['J'], dtype=float); n0 = len(J); T = n0 / float(src['fps']); n = max(30, int(round(T * 60)))
F = np.fft.rfft(J, axis=0); out = np.fft.irfft(F, n=n, axis=0) * (n / n0)          # periodic resampling: the loop stays closed
row = ' walk: { n: %d, v: [%.3f, %.3f], J: %s },' % (n, src['v'][0], src['v'][1], json.dumps(np.round(out, 3).tolist(), separators=(',', ':')))
s = open(path).read()
s2, k = re.subn(r'\n walk: \{ n: \d+,[^\n]*', '\n' + row, s, count=1)
if k != 1: raise SystemExit('no walk clip found in ' + path)
note = ('// The walk (clip `walk`) is not motion capture: it is the stride of tour players walking between points, tracked from\n'
        '// court-level footage (%d strides of %s) by tools/walk_footage.py and put here by tools/walk_into_loco.py.\n' % (src.get('strides', 0), ', '.join(src.get('players', []))))
s2 = re.sub(r'// The walk \(clip `walk`\) is not motion capture:[^\n]*\n//[^\n]*\n', '', s2)
i = s2.index('export const LOCO_JOINTS'); s2 = s2[:i] + note + s2[i:]
open(path, 'w').write(s2); print('walk: %d frames (%.2f s), %.2f m/s, %d strides' % (n, T, src['v'][1], src.get('strides', 0)))
