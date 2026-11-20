# sheet from a steps_run.mjs capture: every captured frame, tight on the legs, labelled; deletes the raw frames
import glob, json, os, sys
from PIL import Image, ImageDraw
log, pre, out = sys.argv[1], sys.argv[2], sys.argv[3]
step = int(sys.argv[4]) if len(sys.argv) > 4 else 2
S, c = [], []
for l in open(log):
    l = l.strip()
    if l.startswith('filmed'): S.append(c); c = []
    elif l.startswith('{'): c.append(json.loads(l))
W, H = 170, 250; cols = 12
rows = sum((len(sorted(glob.glob('%s_%d_*.jpg' % (pre, s)))) + cols - 1) // cols for s in range(len(S)))
sh = Image.new('RGB', (W * cols, H * max(rows, 1))); r0 = 0
for s in range(len(S)):
    fr = S[s][::step]; fs = sorted(glob.glob('%s_%d_*.jpg' % (pre, s)))
    for i, f in enumerate(fs):
        im = Image.open(f); w, h = im.size; cm = im.crop((w // 2 - 300, h // 2 - 300, w // 2 + 300, h // 2 + 580)).resize((W, H)); d = fr[i] if i < len(fr) else {}
        ImageDraw.Draw(cm).text((2, 2), 'v%s f%s u%s %s' % (d.get('sp'), d.get('fwdK'), d.get('u'), ''.join(map(str, d.get('lock', [])))), fill=(255, 255, 0))
        sh.paste(cm, ((i % cols) * W, (r0 + i // cols) * H))
    r0 += (len(fs) + cols - 1) // cols
sh.save(out, quality=85)
for f in glob.glob(pre + '_*_*.jpg'): os.remove(f)
