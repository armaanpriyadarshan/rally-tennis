#!/usr/bin/env bash
# Every player: a seeded 150 s match per pair through steps_audit.mjs, two browsers at a time. Pictures of the visible fault kinds.
#   tools/roster_audit.sh OUTDIR [FLAGS]   → OUTDIR/aud_<player>.txt, OUTDIR/pics/<player>/; compare two with audit_cmp.py
O=$1; FL=$2; cd "$(dirname "$0")"; F="file://$(cd .. && pwd)/index.html"; mkdir -p "$O"
lane() { local P=$1; shift; for pr in "$@"; do a=${pr%%:*}; b=${pr##*:}; k=${a// /_}
  RSEED=11 P0="$a" P1="$b" SECS=150 FLAGS="$FL" ONLY='legs through|trunk|foot jump|foot pop|gallop' MINV=0 PICS="$O/pics/$k" CHROME_FLAGS="--allow-file-access-from-files" timeout 900 node shot.mjs "$F" --port $P --steps steps_audit.mjs > "$O/aud_$k.txt" 2>&1
  pkill -f "[c]hromium --headless=new --remote-debugging-port=$P"; echo "$a $(grep -c '^pic' "$O/aud_$k.txt")" >> "$O/log"; done; }
lane 9461 "Agassi:Lendl" "Alcaraz:Laver" "Djokovic:Federer" "McEnroe:Borg" "Nadal:Sampras" "Sinner:Connors" "Murray:Wawrinka" &
lane 9462 "Zverev:Thiem" "Medvedev:Tsitsipas" "del Potro:Roddick" "Kyrgios:Monfils" "Becker:Edberg" "Ivanisevic:Wilander" "Kuerten:Hewitt" &
wait; echo ALLDONE >> "$O/log"
