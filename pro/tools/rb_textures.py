# Turn the avatar's photo textures into a re-colourable tennis kit: garments are reduced to
# their folds and shading (neutral grey) with masks saying which garment is where, so the
# game can dress every player in his own colours. A short-sleeved shirt is laid over the
# sleeveless top using the mesh's own geometry (texels within a sleeve's length of the shoulder).
import sys, json, numpy as np
from PIL import Image, ImageFilter
src, bake, out, name, pre = sys.argv[1:6]
J = json.load(open(f'{bake}/{name}_joints.json'))['joints']
def load(f, size=None, mode='RGB'):
    im = Image.open(f).convert(mode)
    if size: im = im.resize((size, size), Image.LANCZOS)
    return im
def hsv(a):
    mx = a.max(-1); mn = a.min(-1); v = mx; s = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, s, v
def blur(a, r): return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
def up(a, n): return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((n, n), Image.BILINEAR)).astype(np.float32) / 255

# ---------------- body ----------------
B = np.load(f'{bake}/{name}_body_bake.npz'); pos, part, cov = B['pos'], B['part'], B['cov']
N = part.shape[0]
col = np.asarray(load(f'{src}/{pre}_body_color.tga', N)).astype(np.float32) / 255
h, s, v = hsv(col)
P = lambda *ids: np.isin(part, ids)
torso = P(1, 2, 3, 4, 5, 7); arm = P(8, 9); leg = P(12, 13); foot = P(14, 15)
# existing garments by colour
tank = (h > 0.53) & (h < 0.74) & (s > 0.28) & (v > 0.06)
shorts = cov & P(1, 2, 12) & (s < 0.20) & (v > 0.40) & (pos[..., 2] > 0.55)
shoe = cov & (foot | P(13)) & ((s < 0.22) | (v < 0.28)) & (pos[..., 2] < 0.20)
# the waistband and anything pale between top and shorts belongs to the shorts
shorts |= cov & P(1, 2) & (s < 0.24) & (v > 0.35) & ~tank
# short sleeves and a crew neck, from geometry: left arm is +x in the model's own space
shL = np.array(J['L UpperArm']); elL = np.array(J['L Forearm']); d = (elL - shL) / np.linalg.norm(elL - shL)
ax = np.abs(pos[..., 0]); p2 = np.stack([ax, pos[..., 1], pos[..., 2]], -1)
t = (p2 - shL) @ d
sleeve = cov & P(8, 7) & (t < 0.185)
neckZ = J['Neck'][2]
tee = cov & ((torso & ~shorts & (pos[..., 2] < neckZ - 0.012)) | sleeve) & ~tank & ~shorts
tee &= pos[..., 2] > 0.80
def grow(m):                                       # carry a mask a few texels past the edge of its UV island
    im = Image.fromarray((m.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(9))
    return np.where(cov, m, np.asarray(im) > 127)
def soft(m, r=1.2): return blur(m.astype(np.float32), r)
shorts = grow(shorts); shoe = grow(shoe); tee = grow(tee) & ~tank
mask = np.stack([soft(tank), soft(shorts), soft(shoe), soft(tee)], -1)
Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'RGBA').save(f'{out}/{name}_body_mask.png', optimize=True)
# albedo at full size with the garments neutralised
M = 2048
big = np.asarray(load(f'{src}/{pre}_body_color.tga', M)).astype(np.float32) / 255
gm = up(np.clip(mask[..., 0] + mask[..., 1], 0, 1), M)
V = big.max(-1)
def detail(mk, r, lim):                            # value over its own local mean, kept to a narrow band
    w = up(mk, M); num = blur(V * w, r); den = blur(w, r)
    return np.clip(V / np.maximum(num / np.maximum(den, 1e-3), 0.04), 1 - lim, 1 + lim)
# the top's printed panels must not survive, only the weave: fine detail in a tight band.
# shorts were plain to begin with, so they keep their real folds.
dT = detail(mask[..., 0], 5, 0.07); dS = detail(mask[..., 1], 22, 0.3); dA = detail(mask[..., 3], 5, 0.05)
wT, wS, wA = up(mask[..., 0], M), up(mask[..., 1], M), up(mask[..., 3], M)
grey = (dT * wT + dS * wS) / np.maximum(wT + wS, 1e-3) * 0.80
# skin: keep only the broad light and shade of the photograph, none of its pores or hair
STY = 0.62
def smooth_rgb(a, r): return np.stack([blur(a[..., k], r) for k in range(3)], -1)
skin_w = up((cov & ~tank & ~shorts & ~shoe & (s > 0.2) & (v > 0.25)).astype(np.float32), M)
skin_mean = big[skin_w > 0.5].mean(0)
# average over skin only, so cloth colours never bleed into the skin beside them
den_s = np.maximum(blur(skin_w, 14), 1e-3)
soft_skin = np.stack([blur(big[..., k] * skin_w, 14) / den_s for k in range(3)], -1)
soft_skin = np.where((den_s > 0.05)[..., None], soft_skin, skin_mean) * (1 - STY) + skin_mean * STY
shoe_w = up(mask[..., 2], M)[..., None]
skin_layer = soft_skin * (1 - shoe_w) + smooth_rgb(big, 2.5) * shoe_w            # shoes keep their shape, lose the print noise
grey = 0.80 + (grey - 0.80) * 0.6
outc = skin_layer * (1 - gm[..., None]) + grey[..., None] * gm[..., None]
Image.fromarray((np.clip(outc, 0, 1) * 255).astype(np.uint8)).save(f'{out}/{name}_body_color.jpg', quality=90, optimize=True)
skinm = cov & ~tank & ~shorts & ~shoe & ~tee & (s > 0.2)
skin = col[skinm].mean(0)
def calm_normal(f, size, keep):
    n = np.asarray(load(f, size)).astype(np.float32) / 255
    flat = np.array([0.5, 0.5, 1.0], np.float32)
    n = smooth_rgb(n, 2.0) * keep + flat * (1 - keep)
    return Image.fromarray((np.clip(n, 0, 1) * 255).astype(np.uint8))
calm_normal(f'{src}/{pre}_body_normal.tga', 1024, 0.55).save(f'{out}/{name}_body_normal.jpg', quality=90, optimize=True)

# ---------------- head ----------------
H = np.load(f'{bake}/{name}_head_bake.npz'); hp, hpart, hcov = H['pos'], H['part'], H['cov']
hc = np.asarray(load(f'{src}/{pre}_head_color.tga', N)).astype(np.float32) / 255
hh, hs, hv = hsv(hc)
headZ = J['Head'][2]
# hair: dark, and on the scalp or behind the face (forward is -y)
dark = np.clip((0.50 - hv) / 0.22, 0, 1)
scalp = np.clip((hp[..., 2] - (headZ + 0.085)) / 0.03, 0, 1); back = np.clip((hp[..., 1] - 0.0) / 0.03, 0, 1); side = np.clip((np.abs(hp[..., 0]) - 0.06) / 0.015, 0, 1) * np.clip((hp[..., 2] - (headZ + 0.06)) / 0.02, 0, 1)
hair = hcov * dark * np.clip(scalp + back + side, 0, 1)
hair = soft(hair, 1.5)
# skin on the face: everything on the head that is not hair, eyes or the inside of the mouth
ys, xs = np.mgrid[0:N, 0:N] / N
inner = (ys > 0.585) & (xs < 0.72)                 # eye and mouth islands sit bottom-left
fskin = hcov & ~inner
jawZ = headZ + 0.005
beard = hcov & ~inner & (hp[..., 1] < -0.02) & (hp[..., 2] < jawZ + 0.045) & (hp[..., 2] > jawZ - 0.065)
beard = soft(beard.astype(np.float32), 5) * (1 - hair)
hmask = np.stack([hair, soft(fskin.astype(np.float32)) * (1 - hair), beard], -1)
Image.fromarray((np.clip(hmask, 0, 1) * 255).astype(np.uint8)).save(f'{out}/{name}_head_mask.png', optimize=True)
HV = hc.max(-1); num = blur(HV * hair, 10); den = blur(hair, 10)
hd = np.clip(HV / np.maximum(num / np.maximum(den, 1e-3), 0.03), 0.3, 2.2) * 0.5
# face: features become soft suggestions; the modelling of the head does the rest
fmean = hc[fskin & (hair < 0.1) & (hs > 0.2)].mean(0)
fsoft = smooth_rgb(hc, 7) * 0.42 + fmean * 0.58
inner3 = inner[..., None].astype(np.float32)
eyes = smooth_rgb(hc, 3) * 0.75 + np.array([0.16, 0.13, 0.12], np.float32) * 0.25
face_layer = fsoft * (1 - inner3) + eyes * inner3                                 # eyes lose their glassy detail
hd = 0.5 + (hd - 0.5) * 0.45
houtc = face_layer * (1 - hair[..., None]) + hd[..., None] * hair[..., None]
Image.fromarray((np.clip(houtc, 0, 1) * 255).astype(np.uint8)).save(f'{out}/{name}_head_color.jpg', quality=90, optimize=True)
calm_normal(f'{src}/{pre}_head_normal.tga', 1024, 0.5).save(f'{out}/{name}_head_normal.jpg', quality=88, optimize=True)
fs = hc[fskin & (hair < 0.1) & (hs > 0.2)].mean(0)
json.dump({'skin': [float(x) for x in skin], 'faceSkin': [float(x) for x in fs], 'height': 1.807, 'joints': J}, open(f'{out}/{name}.json', 'w'))
print('skin', skin, 'face', fs, 'coverage tank %.3f shorts %.3f shoe %.3f tee %.3f hair %.3f' % (tank.mean(), shorts.mean(), shoe.mean(), tee.mean(), (hair > 0.5).mean()))
# preview
sh = Image.new('RGB', (2048, 1024))
sh.paste(Image.open(f'{out}/{name}_body_color.jpg').resize((512, 512)), (0, 0)); sh.paste(Image.open(f'{out}/{name}_body_mask.png').convert('RGB').resize((512, 512)), (512, 0))
a = np.asarray(Image.open(f'{out}/{name}_body_mask.png'))[..., 3]; sh.paste(Image.fromarray(a).convert('RGB').resize((512, 512)), (1024, 0))
sh.paste(Image.open(f'{out}/{name}_head_color.jpg').resize((512, 512)), (0, 512)); sh.paste(Image.open(f'{out}/{name}_head_mask.png').resize((512, 512)), (512, 512))
sh.save(f'{bake}/{name}_preview.jpg', quality=82)
