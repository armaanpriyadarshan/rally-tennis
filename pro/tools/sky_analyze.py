# Measure each sky: where the sun is, how strong it is against the rest of the sky, and the
# colours of both. Also writes the display panorama (4096x2048 JPG) and a small contact sheet.
import sys, json, os, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, outdir = sys.argv[1], sys.argv[2]
names = sys.argv[3:]

def read_hdr(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = data.index(b'\n\n') + 2
    nl = data.index(b'\n', pos); dims = data[pos:nl].split(); pos = nl + 1
    h, w = int(dims[1]), int(dims[3])
    img = np.zeros((h, w, 4), np.uint8); buf = memoryview(data)
    for y in range(h):
        assert buf[pos] == 2 and buf[pos+1] == 2
        pos += 4
        for c in range(4):
            x = 0
            while x < w:
                n = buf[pos]; pos += 1
                if n > 128:
                    n -= 128; img[y, x:x+n, c] = buf[pos]; pos += 1
                else:
                    img[y, x:x+n, c] = np.frombuffer(buf[pos:pos+n], np.uint8); pos += n
                x += n
    e = img[..., 3].astype(np.float32)
    scale = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0).astype(np.float32)
    return img[..., :3].astype(np.float32) * scale[..., None]

out = {}
for n in names:
    hdr = read_hdr(f'{src}/{n}.hdr'); h, w, _ = hdr.shape
    lum = hdr @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    v = (np.arange(h) + 0.5) / h; u = (np.arange(w) + 0.5) / w
    theta = v * np.pi                      # 0 at zenith
    phi = (u - 0.5) * 2 * np.pi            # longitude; three.js equirect: u=0.5 looks down -Z ... handled in engine
    dOmega = (np.sin(theta) * (np.pi / h) * (2 * np.pi / w))[:, None] * np.ones((1, w))
    cosz = np.cos(theta)[:, None] * np.ones((1, w))
    up = cosz > 0.02
    # the sun: everything within 3 degrees of the brightest point, if it is far brighter than the sky
    iy, ix = np.unravel_index(np.argmax(np.where(up, lum, 0)), lum.shape)
    med = float(np.median(lum[up]))
    peak = float(lum[iy, ix])
    dirs = np.stack([np.sin(theta)[:, None] * np.sin(phi)[None, :], np.cos(theta)[:, None] * np.ones((1, w)), -np.sin(theta)[:, None] * np.cos(phi)[None, :]], -1)
    sd = dirs[iy, ix]
    ang = np.arccos(np.clip(dirs @ sd, -1, 1))
    disc = (ang < np.radians(3.0)) & up
    has_sun = peak > med * 60
    if has_sun:
        wts = (lum * dOmega * disc); sdir = (dirs * wts[..., None]).sum((0, 1)); sdir /= np.linalg.norm(sdir)
        ring = (ang > np.radians(3.0)) & (ang < np.radians(6.0)) & up
        bg = (hdr[ring] * dOmega[ring][:, None]).sum(0) / dOmega[ring].sum()      # sky radiance around the sun
        sunRad = ((hdr[disc] - bg) .clip(0) * dOmega[disc][:, None]).sum(0)       # W/m2-ish, normal incidence
    else:
        sdir = sd; sunRad = np.zeros(3)
    skyMask = up & ~(disc if has_sun else np.zeros_like(up))
    skyIrr = (hdr * (dOmega * cosz * skyMask)[..., None]).sum((0, 1))             # onto a horizontal surface
    skyAvg = (hdr * (dOmega * skyMask)[..., None]).sum((0, 1)) / (dOmega * skyMask).sum()
    el = float(np.degrees(np.arcsin(sdir[1]))); az = float(np.degrees(np.arctan2(sdir[0], -sdir[2])))
    sunIrrH = sunRad * max(0.0, sdir[1])
    L = lambda c: float(c @ np.array([0.2126, 0.7152, 0.0722]))
    # display panorama
    jpg = Image.open(f'{src}/{n}.jpg').convert('RGB')
    small = jpg.resize((4096, 2048), Image.LANCZOS)
    key = n
    small.save(f'{outdir}/{key}.jpg', quality=86, optimize=True, progressive=True)
    # what the display image itself would deliver as sky irradiance if read as linear light
    arr = np.asarray(small.resize((512, 256), Image.BILINEAR)).astype(np.float32) / 255
    lin = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
    th2 = (np.arange(256) + 0.5) / 256 * np.pi; dO2 = (np.sin(th2) * (np.pi / 256) * (2 * np.pi / 512))[:, None] * np.ones((1, 512)); cz2 = np.cos(th2)[:, None] * np.ones((1, 512))
    ldrIrr = (lin * (dO2 * cz2 * (cz2 > 0.02))[..., None]).sum((0, 1))
    ldrAvg = (lin * (dO2 * (cz2 > 0.02))[..., None]).sum((0, 1)) / (dO2 * (cz2 > 0.02)).sum()
    out[key] = dict(sun=bool(has_sun), sunAz=round(az, 1), sunEl=round(el, 1), sunIrr=round(L(sunRad), 3), sunIrrH=round(L(sunIrrH), 3), skyIrr=round(L(skyIrr), 3),
                    ratio=round(L(sunIrrH) / max(1e-6, L(skyIrr)), 2), sunCol=[round(float(x), 3) for x in (sunRad / max(1e-6, sunRad.max()))],
                    skyCol=[round(float(x), 3) for x in (skyAvg / max(1e-6, skyAvg.max()))], skyAvg=round(L(skyAvg), 4), ldrIrr=round(L(ldrIrr), 3), ldrAvg=round(L(ldrAvg), 4),
                    bytes=os.path.getsize(f'{outdir}/{key}.jpg'))
    print(key, out[key])
json.dump(out, open(f'{outdir}/skies.json', 'w'), indent=1)
# contact sheet
tiles = [Image.open(f'{outdir}/{n}.jpg').resize((512, 256)) for n in names]
cols = 3; rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 512, rows * 256))
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 512, (i // cols) * 256))
sheet.save('/tmp/rally-assets/sky/sheet.jpg', quality=80)
