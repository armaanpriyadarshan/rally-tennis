# Racket turn per 1/60 s along every keyed swing in figure.js (Hermite per component, then normalised, as track() does)
import re, sys, math
src = open(sys.argv[1]).read()
for m in re.finditer(r'const (\w+) = track\(\[(.*?)\n\]', src, re.S):
    name, body = m.group(1), m.group(2)
    keys = []
    for km in re.finditer(r'\{([^{}]*?)\}', body):
        t = km.group(1); u = re.search(r'\bu:\s*(-?[\d.]+)', t); d = re.search(r'\bdir:\s*\[([^\]]*)\]', t)
        if u and d: keys.append((float(u.group(1)), [float(x) for x in d.group(1).split(',')]))
    if len(keys) < 2: continue
    n = len(keys); U = [k[0] for k in keys]; V = [k[1] for k in keys]
    M = []
    for i in range(n):
        a, b = max(0, i - 1), min(n - 1, i + 1); du = U[b] - U[a]
        M.append([(V[b][c] - V[a][c]) / du if du > 0 else 0 for c in range(3)])
    def at(u):
        i = 0
        while i < n - 2 and u > U[i + 1]: i += 1
        h = U[i + 1] - U[i]; t = (u - U[i]) / h if h > 0 else 0; t2, t3 = t * t, t * t * t
        h00, h10, h01, h11 = 2*t3 - 3*t2 + 1, t3 - 2*t2 + t, -2*t3 + 3*t2, t3 - t2
        v = [h00*V[i][c] + h10*h*M[i][c] + h01*V[i+1][c] + h11*h*M[i+1][c] for c in range(3)]
        l = math.sqrt(sum(x*x for x in v)) or 1; return [x / l for x in v], l
    worst = []; prev = None; u = U[0]
    while u <= U[-1] + 1e-9:
        d, l = at(u)
        if prev:
            a = math.degrees(math.acos(max(-1, min(1, sum(p*q for p, q in zip(d, prev))))))
            if a > 14 and not (-0.32 < u < 0.26): worst.append((round(u, 3), round(a, 1), round(l, 2)))
        prev = d; u += 1 / 60
    if worst: print(name, worst)
