# Close-up contact sheets of one player from a steps_watch.mjs capture (frames + meta.json with screen boxes).
#   python3 -I sheets.py <capture dir> <out prefix> <player 0|1> <every> <cols> <rows>
# Writes <out prefix>_00.jpg, _01.jpg, ... each frame labelled with time and the stroke state shown.
import json, sys
from PIL import Image, ImageDraw

cap, pre, who, every, cols, rows = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
meta = json.load(open(cap + '/meta.json'))
import os
PH = tuple(os.environ.get('PHASES', 'live,toss,over').split(','))
sel = [r for r in meta if r['phase'] in PH][::every]
CW, CH = 150, 230
sheet, n, page = None, 0, 0


def flush():
    global sheet, page
    if sheet is not None:
        sheet.save('%s_%02d.jpg' % (pre, page), quality=82)
        page += 1


for r in sel:
    b = r['boxes'][who]
    if not b['vis']:
        continue
    w, h = b['x1'] - b['x0'], b['y1'] - b['y0']
    cx, cy = (b['x0'] + b['x1']) / 2, (b['y0'] + b['y1']) / 2
    hh = max(h, w * 1.4) * 1.45
    ww = hh * CW / CH
    im = Image.open(r['f']).crop((int(cx - ww / 2), int(cy - hh / 2), int(cx + ww / 2), int(cy + hh / 2))).resize((CW, CH))
    lab = r['s0'] if who == 0 else r['s1']
    ImageDraw.Draw(im).text((3, 2), '%.2f %s' % (r['t'], (lab or '')[:22]), fill=(255, 255, 0))
    if n % (cols * rows) == 0:
        flush()
        sheet = Image.new('RGB', (cols * CW, rows * CH), 'white')
    sheet.paste(im, ((n % cols) * CW, ((n // cols) % rows) * CH))
    n += 1
flush()
print(pre, 'crops', n, 'pages', page)
