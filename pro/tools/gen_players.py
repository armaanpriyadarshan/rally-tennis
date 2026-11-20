import json, sys
d=json.load(open('/tmp/rally-research/players.json'))
out=[]
for p in d['players']:
    pt=p.get('patterns') or {}; w=p.get('winPct') or {}; cov=p.get('coverage') or {}; cs=p.get('chartedSample') or {}
    o=dict(name=p['name'], full=p['fullName'], country=p['country'], born=p['born'], cm=p['heightCm'], lefty=p['lefty'], oneHandBh=p['oneHandBh'],
      rank=p.get('currentRank'), high=p.get('careerHighRank'), slams=p.get('slams'), titles=p.get('titles'),
      s1In=p.get('firstServePct'), s1Won=p.get('firstServeWonPct'), s2Won=p.get('secondServeWonPct'), aces=p.get('acesPerMatch'), dfs=p.get('dfPerMatch'), hold=p.get('serviceGamesWonPct'),
      r1Won=p.get('firstRetWonPct'), r2Won=p.get('secondRetWonPct'), brk=p.get('returnGamesWonPct'), bpConv=p.get('bpConvertedPct'), bpSaved=p.get('bpSavedPct'),
      sMax=p.get('fastestServeKmh'), s1Kmh=p.get('avgFirstServeKmh'), s2Kmh=p.get('avgSecondServeKmh'), fhKmh=p.get('fhSpeedKmh'), bhKmh=p.get('bhSpeedKmh'), fhRpm=p.get('fhRpm'), bhRpm=p.get('bhRpm'),
      netPct=p.get('netPointsPct'), svPct=p.get('serveVolleyPct'), win=w, style=p.get('style'), desc=p.get('styleDesc'),
      wideD=pt.get('deuceWidePct'), wideA=pt.get('adWidePct'), rallyLen=pt.get('avgRallyLen'), fhShare=pt.get('fhShareOfGroundstrokesPct'), slicePct=pt.get('bhSlicePct'), dropPct=pt.get('dropShotPct'), netWon=pt.get('netPointsWonPct'), aggr=pt.get('rallyAggression'),
      rep=cov.get('representative', True), est=p.get('est'))
    out.append(o)
if len(sys.argv)>1:
    open(sys.argv[1],'w').write('// Generated from researched career statistics (ATP stats tables, Tennis Abstract, Match Charting\n// Project, Hawk-Eye/TennisViz speed and spin reports). null = no credible figure exists.\nexport const PLAYER_FACTS = '+json.dumps(out,indent=1,ensure_ascii=False)+';\n')
print('aggr', sorted([(o['aggr'],o['name']) for o in out if o['aggr'] is not None]))
print('rallyLen', sorted([(o['rallyLen'],o['name']) for o in out if o['rallyLen'] is not None])[:5], '...')
print('rep false:', [o['name'] for o in out if not o['rep']])
print([ (o['name'], o['win'].get('overall')) for o in out][:40])
