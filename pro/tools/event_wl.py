# Career win-loss at each of the game's events (js/eventrecords.js), from Jeff Sackmann's tennis_atp match files
# (CC BY-NC-SA 4.0). usage: python3 -I tools/event_wl.py <dir with atp_matches_YYYY.csv> "Full Name=Key" ... [--check]
# --check recomputes the players already in js/eventrecords.js and lists every event where the result differs.
# Rules are the ones written at the top of js/eventrecords.js (which editions of each event count).
import csv, glob, os, re, sys
d = sys.argv[1]; args = [a for a in sys.argv[2:] if not a.startswith('--')]; check = '--check' in sys.argv
def key_of(name, surface, level, y, date):
    n = name.lower()
    if level == 'D' or level == 'C' or 'davis' in n or 'olymp' in n or 'atp cup' in n or 'united cup' in n or 'laver cup' in n: return None
    if n == 'australian open': return 'ao' if y >= 1988 else None
    if n == 'us open': return 'us' if y >= 1978 else None
    if n == 'roland garros': return 'rg'
    if n == 'wimbledon': return 'wim'
    # (the season-ending Masters is level M in these files; level F is the WCT Finals, which are not counted)
    if 'tour finals' in n or 'atp finals' in n or n in ('masters cup', 'masters', 'masters dec', 'tour final', 'turin') or level == 'Masters Cup':
        if y == 1974 or y in (2003, 2004): return None
        return 'fin'
    if n.startswith('rotterdam'): return 'rot'
    if n.startswith('doha'): return 'doh'
    if n.startswith('rio de janeiro'): return 'rio' if y >= 2014 else None
    if n.startswith('dubai'): return 'dub'
    if n.startswith('acapulco'): return 'aca' if y >= 2014 else None
    if n.startswith('indian wells') or n in ('palm springs', 'la quinta', 'rancho mirage') or (n in ('tucson', 'tuscon') and y in (1974, 1975)): return 'iw'
    if (n.startswith('miami') and y >= 1987) or n == 'key biscayne' or (n == 'delray beach' and y == 1985) or (n == 'boca west' and y == 1986): return 'mia'
    if n.startswith('monte carlo'): return 'mc'
    if n.startswith('barcelona'): return 'bar' if surface == 'Clay' and n != 'barcelona 2' else None
    if n.startswith('munich'): return 'mun' if surface == 'Clay' else None
    if n.startswith('madrid'): return 'mad' if y >= 2009 and surface == 'Clay' else None
    if n.startswith('rome'): return 'rom' if 'wct' not in n else None
    if n.startswith('hamburg'): return 'ham'
    if n.startswith('halle'): return 'hal'
    if 'queen' in n or (n == 'london' and y == 1968): return 'que'
    if n.startswith('washington'): return 'was' if y >= 1987 else None
    if n.startswith('canada') or n in ('montreal', 'toronto', 'montreal / toronto'): return 'can' if y >= 1979 else None
    if n.startswith('cincinnati'): return 'cin' if y >= 1979 else None
    if n.startswith('tokyo'): return 'tok' if y >= 1983 and surface == 'Hard' else None
    if n.startswith('beijing'): return 'bei' if y >= 2004 else None
    if n.startswith('shanghai'): return 'sha' if y >= 2009 else None
    if n.startswith('basel'): return 'bas'
    if n.startswith('vienna'): return 'vie'
    if n.startswith('paris'): return 'par' if y >= 1986 else None
    if n.startswith('dallas'): return 'dal' if y >= 2022 else None
    return None
WL = {}
names = None
for f in sorted(glob.glob(os.path.join(d, 'atp_matches_[0-9][0-9][0-9][0-9].csv'))):
    with open(f, newline='', encoding='utf-8-sig', errors='replace') as fh:
        for r in csv.DictReader(fh):
            sc = (r.get('score') or '')
            if 'W/O' in sc.upper() or 'WALKOVER' in sc.upper(): continue
            date = r.get('tourney_date') or ''; y = int(date[:4]) if date[:4].isdigit() else 0
            k = key_of(r.get('tourney_name') or '', r.get('surface') or '', r.get('tourney_level') or '', y, date)
            if not k: continue
            for side, res in (('winner_name', 0), ('loser_name', 1)):
                nm = r.get(side) or ''; e = WL.setdefault(nm, {}).setdefault(k, [0, 0]); e[res] += 1
ORDER = ['ao', 'rot', 'doh', 'rio', 'dub', 'aca', 'iw', 'mia', 'mc', 'bar', 'mun', 'mad', 'rom', 'ham', 'rg', 'hal', 'que', 'wim', 'was', 'can', 'cin', 'us', 'tok', 'bei', 'sha', 'bas', 'vie', 'par', 'fin', 'dal']
def line(key, full): e = WL.get(full, {}); return '  %s: { %s },' % (key, ', '.join('%s: [%d, %d]' % (k, e[k][0], e[k][1]) for k in ORDER if k in e))
if check:
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'eventrecords.js')).read()
    full = {'Alcaraz': 'Carlos Alcaraz', 'Sinner': 'Jannik Sinner', 'Djokovic': 'Novak Djokovic', 'Nadal': 'Rafael Nadal', 'Federer': 'Roger Federer', 'Sampras': 'Pete Sampras', 'Agassi': 'Andre Agassi', 'Lendl': 'Ivan Lendl', 'Borg': 'Bjorn Borg', 'McEnroe': 'John McEnroe', 'Connors': 'Jimmy Connors', 'Laver': 'Rod Laver'}
    bad = 0
    for k, fn in full.items():
        m = re.search(r'\n  %s: \{([^}]*)\}' % k, src); old = dict((a, [int(b), int(c)]) for a, b, c in re.findall(r'(\w+): \[(\d+), (\d+)\]', m.group(1))) if m else {}
        new = WL.get(fn, {}); diffs = [(e, old.get(e), new.get(e)) for e in sorted(set(old) | set(new)) if old.get(e) != new.get(e)]
        if diffs: bad += 1; print(k, diffs)
    print('players differing:', bad)
for a in args:
    fn, k = a.split('=') if '=' in a else (a, a.split()[-1])
    print(line(k, fn))
