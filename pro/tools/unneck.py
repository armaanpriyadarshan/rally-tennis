# Paint out what a library head's texture carries round the base of its neck (Male_Adult_06's cord necklace, which showed
# above the collar of every player baked onto that head): dark marks in the neck band, darker than the skin round them,
# are filled from that skin. In place, on face textures laid out like the head's (assets/people/faces/<Name>.jpg).
#   python3 -I tools/unneck.py <texture.jpg> [...] [--band 0.585,0.705] [--debug out.jpg]
import sys, cv2, numpy as np
args = [a for a in sys.argv[1:] if not a.startswith('--')]; opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
y0, y1 = (float(v) for v in opt.get('band', '0.585,0.705').split(','))
for f in args:
    img = cv2.imread(f); H, W = img.shape[:2]; a, b = int(y0 * H), int(y1 * H)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32); bg = cv2.medianBlur(g.astype(np.uint8), 31).astype(np.float32)
    m = np.zeros((H, W), np.uint8); band = slice(a, b)
    m[band] = ((g[band] < bg[band] - 18) & (bg[band] > 70)).astype(np.uint8) * 255      # (the unused black of the atlas below the neck is left alone)
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    out = cv2.inpaint(img, m, 6, cv2.INPAINT_TELEA)
    cv2.imwrite(f, out, [cv2.IMWRITE_JPEG_QUALITY, 92]); print(f, int((m > 0).sum()), 'pixels filled')
    if 'debug' in opt: cv2.imwrite(opt['debug'], np.vstack([img[a - 20:b + 20], out[a - 20:b + 20]]))
