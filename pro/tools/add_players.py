# Add researched players to js/playerdata.js (same mapping as gen_players.py), skipping names already there.
# usage: python3 -I tools/add_players.py batchA.json batchB.json ...   (research JSON: { players: [...] })
import json, os, re, sys
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'playerdata.js')
src = open(P).read(); have = set(re.findall(r'"name": "([^"]+)"', src)); add = []
for f in sys.argv[1:]:
    for p in json.load(open(f))['players']:
        if p['name'] in have: print('have', p['name']); continue
        pt = p.get('patterns') or {}; w = p.get('winPct') or {}
        o = dict(name=p['name'], full=p['fullName'], country=p['country'], born=p['born'], cm=p['heightCm'], lefty=p['lefty'], oneHandBh=p['oneHandBh'],
          rank=p.get('currentRank'), high=p.get('careerHighRank'), slams=p.get('slams'), titles=p.get('titles'),
          s1In=p.get('firstServePct'), s1Won=p.get('firstServeWonPct'), s2Won=p.get('secondServeWonPct'), aces=p.get('acesPerMatch'), dfs=p.get('dfPerMatch'), hold=p.get('serviceGamesWonPct'),
          r1Won=p.get('firstRetWonPct'), r2Won=p.get('secondRetWonPct'), brk=p.get('returnGamesWonPct'), bpConv=p.get('bpConvertedPct'), bpSaved=p.get('bpSavedPct'),
          sMax=p.get('fastestServeKmh'), s1Kmh=p.get('avgFirstServeKmh'), s2Kmh=p.get('avgSecondServeKmh'), fhKmh=p.get('fhSpeedKmh'), bhKmh=p.get('bhSpeedKmh'), fhRpm=p.get('fhRpm'), bhRpm=p.get('bhRpm'),
          netPct=p.get('netPointsPct'), svPct=p.get('serveVolleyPct'), win={k: v for k, v in w.items() if v is not None}, style=p.get('style'), desc=p.get('styleDesc'),
          wideD=pt.get('deuceWidePct'), wideA=pt.get('adWidePct'), rallyLen=pt.get('avgRallyLen'), fhShare=pt.get('fhShareOfGroundstrokesPct'), slicePct=pt.get('bhSlicePct'), dropPct=pt.get('dropShotPct'),
          netWon=pt.get('netWon', p.get('netWon')), aggr=pt.get('aggr', p.get('aggr')), rep=True, est=[e for e in (p.get('est') or []) if e not in ('look', 'build', 'facePhoto', 'mannerisms')])
        add.append(o); have.add(p['name']); print('add', p['name'])
if add:
    body = ',\n'.join(' ' + json.dumps(o, indent=1, ensure_ascii=False).replace('\n', '\n ') for o in add)
    i = src.rstrip().rfind('];'); src = src[:i].rstrip().rstrip(',') + ',\n' + body + '\n];\n'
    open(P, 'w').write(src)
