import json, sys
d=json.load(open('/tmp/rally-research/tournaments.json'))
out=[]
keymap={'Australian Open':'ao','Rotterdam':'rot','Dallas':'dal','Doha':'doh','Rio':'rio','Dubai':'dub','Acapulco':'aca','Indian Wells':'iw','Miami':'mia','Monte-Carlo':'mc','Barcelona':'bar','Munich':'mun','Madrid':'mad','Rome':'rom','Hamburg':'ham','Roland Garros':'rg','Halle':'hal',"Queen's Club":'que','Wimbledon':'wim','Washington':'was','Canada':'can','Cincinnati':'cin','US Open':'us','Tokyo':'tok','Beijing':'bei','Shanghai':'sha','Basel':'bas','Vienna':'vie','Paris':'par','ATP Finals':'fin'}
for t in d['tournaments']:
    st=t.get('stats') or {}; cc=t.get('centreCourt') or {}; col=t.get('colours') or {}; cpi=t.get('courtPaceIndex') or {}
    o=dict(key=keymap.get(t['name'], t['name'][:3].lower()), name=t['name'], city=t.get('city'), country=t.get('country'), level=t['level'], month=t.get('startMonth'), week=t.get('weekOf2026'),
      surface=t['surface'], indoor=bool(t.get('indoor')), cpi=cpi.get('value'), cpiYear=cpi.get('year'), speed=st.get('surfaceSpeedRating'),
      alt=t.get('altitudeM'), temp=t.get('temperatureC'), hum=t.get('humidityPct'), windKmh=(t.get('windKmh') if not t.get('indoor') else 0), night=t.get('nightSessions'),
      court=cc.get('name'), cap=cc.get('capacity'), roof=cc.get('hasRoof'), inner=col.get('inner'), outer=col.get('outer'),
      draw=t.get('drawSize'), bestOf=t.get('bestOf'), pts=t.get('pointsByRound'), balls=t.get('balls'),
      ace=st.get('aceRateRawPct'), rallyLen=st.get('avgRallyLength'), hold=st.get('holdPct'), backdrop=t.get('backdrop'), finalSet=t.get('finalSetRule'))
    out.append(o)
if len(sys.argv)>1:
    js='// Generated from researched tournament facts (calendar, surfaces, court pace, weather, venues).\n// Sources and method are listed in the project notes; hex colours are estimates.\nexport const TOUR_FACTS = '+json.dumps(out,indent=1,ensure_ascii=False)+';\n'
    open(sys.argv[1],'w').write(js)
for o in out: print(o['key'],o['name'],o['level'],o['surface'],'cpi',o['cpi'],'spd',o['speed'],'alt',o['alt'],'T',o['temp'],'wind',o['windKmh'],'night',o['night'],'|',o['court'],o['cap'],o['roof'],'|',o['inner'],o['outer'],'| draw',o['draw'],'| ace',o['ace'],'rally',o['rallyLen'],'hold',o['hold'])
print(json.dumps(out[7]['pts']), json.dumps(out[1]['pts']), json.dumps(out[-1]['pts']))
