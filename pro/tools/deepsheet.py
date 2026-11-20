# large close-ups of the near player from a steps_watch capture, only frames where he is deep (|z| > ZMIN) or low (hip ratio < HMAX)
import json, sys
from PIL import Image, ImageDraw
cap, out, zmin, hmax = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
meta = json.load(open(cap + '/meta.json'))
sel = [r for r in meta if r['phase'] == 'live' and r['boxes'][0]['vis'] and (r.get('z0', 0) > zmin or r.get('hip0', 1) < hmax)][:32]
W, H, cols = 240, 320, 8
sh = Image.new('RGB', (W * cols, H * max(1, (len(sel) + cols - 1) // cols)))
for i, r in enumerate(sel):
    b = r['boxes'][0]; w, h = b['x1'] - b['x0'], b['y1'] - b['y0']; cx, cy = (b['x0'] + b['x1']) / 2, (b['y0'] + b['y1']) / 2; hh = max(h, w * 1.3) * 1.35; ww = hh * W / H
    im = Image.open(r['f']).crop((int(cx - ww / 2), int(cy - hh / 2), int(cx + ww / 2), int(cy + hh / 2))).resize((W, H))
    ImageDraw.Draw(im).text((3, 3), '%.2f %s z%.1f v%s hip%.2f' % (r['t'], (r['s0'] or '')[:14], r['z0'], r['spd0'], r['hip0']), fill=(255, 255, 0)); sh.paste(im, ((i % cols) * W, (i // cols) * H))
sh.save(out, quality=86); print(out, len(sel))
