# sheet from a steps_film.mjs DBG=1 run: one row per stroke, labelled with the clip picked, the situation wanted and contact height
import glob, json, os, sys
from PIL import Image, ImageDraw
log, pre, out, step = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
S, c = [], []
for l in open(log):
    l = l.strip()
    if l.startswith('filmed'): S.append(c); c = []
    elif l.startswith('{'): c.append(json.loads(l))
W, H, cols = 160, 220, 12
sh = Image.new('RGB', (W * cols, H * max(1, len(S))))
for s, rows in enumerate(S):
    fr = rows[::step]; fs = sorted(glob.glob('%s_%d_*.jpg' % (pre, s)))
    d0 = next((d for d in rows if d.get('pick') is not None or d.get('want')), rows[0] if rows else {})
    for i, f in enumerate(fs[:cols]):
        im = Image.open(f); w, h = im.size; cm = im.crop((w // 2 - 330, h // 2 - 330, w // 2 + 330, h // 2 + 580)).resize((W, H)); d = fr[i] if i < len(fr) else {}
        lab = 'u%s' % d.get('u') if i else 'clip %s want %s cpY %s' % (d0.get('pick'), d0.get('want'), d0.get('cpY'))
        ImageDraw.Draw(cm).text((2, 2), lab, fill=(255, 255, 0)); sh.paste(cm, (i * W, s * H))
sh.save(out, quality=85)
for f in glob.glob(pre + '_*_*.jpg'): os.remove(f)
print(out, len(S), 'strokes')
