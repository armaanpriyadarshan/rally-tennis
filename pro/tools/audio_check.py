# What the game actually sounded like: line a recording from tools/audio_capture.mjs up with the
# log of sounds the game asked for, and measure each one — is it there, how far above the crowd,
# how bright, how long — plus two faults a listener would notice at once: a second sound trailing
# each racket hit, and a crowd bed that swells and drops out.
#   python3 -I tools/audio_check.py /tmp/cap      (reads /tmp/cap.wav and /tmp/cap.json)
import sys, json, wave, math, numpy as np
def load(path):
    w = wave.open(path); sr = w.getframerate(); n = w.getnframes(); ch = w.getnchannels()
    a = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768.0
    return a.reshape(-1, ch), sr
def db(x): return 20 * math.log10(max(1e-9, x))
def rms(x): return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0
def centroid(x, sr):
    if len(x) < 64: return 0.0
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; f = np.fft.rfftfreq(len(x), 1 / sr); return float((S * f).sum() / max(1e-12, S.sum()))
def band(x, sr, lo, hi):
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; f = np.fft.rfftfreq(len(x), 1 / sr); return float(S[(f >= lo) & (f < hi)].sum() / max(1e-12, S.sum()))
def decay(x, sr, drop=20):
    e = np.convolve(np.square(x), np.ones(int(sr * 0.004)) / int(sr * 0.004), 'same'); k = int(np.argmax(e)); pk = e[k]
    if pk <= 0: return 0.0
    below = np.where(e[k:] < pk * 10 ** (-drop / 10))[0]; return float(below[0] / sr) if len(below) else float(len(x) - k) / sr
def envelope(m, sr, win=0.005):
    n = int(sr * win); return np.sqrt(np.convolve(np.square(m), np.ones(n) / n, 'same'))

if __name__ == '__main__':
    base = sys.argv[1]; A, sr = load(base + '.wav'); meta = json.load(open(base + '.json')); mono = A.mean(1)
    T = np.array(meta['times']); t0 = T[0]; CH = 4096
    # each 4096-sample chunk carries the audio clock time it was played at
    def idx(t): k = int(np.searchsorted(T, t, 'right') - 1); k = max(0, min(len(T) - 1, k)); return int(k * CH + (t - T[k]) * sr)
    step = np.diff(T); print(f'{len(mono)/sr:.1f} s recorded at {sr} Hz; chunk spacing median {np.median(step)*1000:.2f} ms (ideal {CH/sr*1000:.2f}), {int((step > CH/sr*1.5).sum())} dropped chunks')
    print(f'peak {db(np.abs(A).max()):.1f} dBFS, overall rms {db(rms(mono)):.1f} dBFS, clipped samples {int((np.abs(A) >= 0.999).sum())}, left/right rms {db(rms(A[:,0])):.1f}/{db(rms(A[:,1])):.1f}')
    log = meta['log']; kinds = {}
    # the recorder hears a sound a fixed time after the game asks for it: find that delay from the hits and bounces
    env_all = envelope(mono, sr, 0.004); ev = [e['t'] for e in log if e['type'] in ('hit', 'bounce')]
    lags = np.arange(-0.10, 0.45, 0.002); score = [np.mean([env_all[min(len(mono) - 1, max(0, idx(t + L)))] for t in ev]) for L in lags]
    LAG = float(lags[int(np.argmax(score))]) - 0.004; print(f'recorder delay {LAG*1000:.0f} ms (sharpness of the fit: best {max(score):.4f} against median {np.median(score):.4f})')
    for e in log: e['t'] += LAG
    for e in log:
        key = e['type'] + (':' + e['kind'] if e['type'] == 'hit' and e.get('kind') else '') + ((':first' if e.get('first') else ':later') if e['type'] == 'bounce' else '')
        if e['type'] in ('ready', 'toss', 'wall'): continue
        i = idx(e['t']); pre = mono[max(0, i - int(0.20 * sr)):max(0, i - int(0.03 * sr))]; post = mono[i:i + int(0.12 * sr)]
        if len(post) < int(0.1 * sr): continue
        env = envelope(mono[max(0, i - int(0.05 * sr)):i + int(0.2 * sr)], sr); onset = (int(np.argmax(env)) - int(0.05 * sr)) / sr
        kinds.setdefault(key, []).append(dict(pk=db(np.abs(post).max()), r=db(rms(post[:int(0.06 * sr)])), bg=db(rms(pre)), cen=centroid(post[:int(0.05 * sr)], sr), dec=decay(mono[i:i + int(0.5 * sr)], sr), lag=onset, lo=band(post[:int(0.05 * sr)], sr, 0, 400), hi=band(post[:int(0.05 * sr)], sr, 2000, 9000), speed=e.get('speed')))
    print(f'\n{"sound":18s}  n   peak dBFS  above background  centroid Hz  <400Hz  >2kHz  decay ms  onset lag ms  heard')
    for k, L in sorted(kinds.items(), key=lambda kv: -len(kv[1])):
        m = lambda q: float(np.median([x[q] for x in L])); heard = sum(1 for x in L if x['r'] - x['bg'] > 6)
        print(f'{k:18s} {len(L):3d}   {m("pk"):6.1f}      {m("r")-m("bg"):+5.1f} dB        {m("cen"):6.0f}      {m("lo")*100:3.0f}%   {m("hi")*100:3.0f}%   {m("dec")*1000:5.0f}     {m("lag")*1000:+5.0f}        {heard}/{len(L)}')
    # the crowd: level while a point is being played, and in the applause after it
    pts = [e for e in log if e['type'] == 'point']; hits = [e for e in log if e['type'] == 'hit']
    quiet = []
    for a, b in zip(hits, hits[1:]):
        if 0.5 < b['t'] - a['t'] < 2.5: seg = mono[idx(a['t'] + 0.30):idx(b['t'] - 0.05)]; quiet.append(rms(seg)) if len(seg) > sr * 0.1 else None
    app = [rms(mono[idx(p['t'] + 0.6):idx(p['t'] + 2.0)]) for p in pts if idx(p['t'] + 2.0) < len(mono)]
    if quiet: print(f'\ncrowd under the rally (between hits and bounces) {db(np.median(quiet)):.1f} dBFS; applause after a point {db(np.median(app)) if app else float("nan"):.1f} dBFS ({len(app)} points)')
    # an echo of the racket: anything loud 150-400 ms after a hit that the game did not ask for
    env = envelope(mono, sr, 0.004); ech = []
    for h in hits:
        other = [x for x in log if x is not h and x['type'] in ('bounce', 'hit', 'net', 'netcord', 'point', 'fault') and 0.10 < x['t'] - h['t'] < 0.45]
        if other: continue
        a0 = env[idx(h['t']):idx(h['t'] + 0.04)].max(); b0 = env[idx(h['t'] + 0.15):idx(h['t'] + 0.40)].max(); ech.append(db(b0) - db(a0))
    if ech: print(f'second sound 150-400 ms after a racket hit, relative to the hit: median {np.median(ech):+.1f} dB over {len(ech)} hits (an echo would be near 0 or above)')
    # how steady the crowd is: its level in half-second steps through the stretches with nothing else sounding
    marks = sorted(e['t'] for e in log if e['type'] in ('hit', 'bounce', 'point', 'fault', 'net', 'squeak')); lv = []
    t = T[0] + 1.0
    while t < T[-1] - 1.0:
        if not any(-0.6 < mk - t < 4.2 for mk in marks if True) or all(abs(mk - t - 0.25) > 0.45 for mk in marks):
            seg = mono[idx(t):idx(t + 0.5)]
            if len(seg) > sr * 0.4 and not any(-5.5 < t - p['t'] < 5.5 for p in pts): lv.append(db(rms(seg)))
        t += 0.5
    if len(lv) > 4: print(f'crowd bed away from points: {len(lv)} half-second steps, median {np.median(lv):.1f} dBFS, spread (5th to 95th) {np.percentile(lv, 5):.1f} to {np.percentile(lv, 95):.1f}')
    print('timeline:', ' '.join(f"{e['t']-t0:.1f}:{e['type']}{(':'+e['kind']) if e.get('kind') and e['type']=='hit' else ''}{(':'+e['why']) if e.get('why') else ''}" for e in log if e['type'] in ('hit', 'point', 'fault', 'net', 'netcord', 'game'))[:1400])
