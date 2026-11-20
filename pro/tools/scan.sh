#!/usr/bin/env bash
# Full arm check: every clip of every player (steps_labclips) + a 150 s human match audit per player (steps_audit).
# Usage: tools/scan.sh TAG   → /tmp/rally-work2/lcTAG, /tmp/rally-work2/faTAG; summarise with scan_summary.py TAG.
# Two headless browsers at a time, never more (ONE=1: one at a time). env: NOCLIPS NOAUDIT, CFLAGS (lab flags a,b=1), SEEDS
T=$1; cd "$(dirname "$0")"; R=/tmp/rally-work2
rm -rf $R/lc$T $R/fa$T; mkdir -p $R/lc$T $R/fa$T
B="file://$(cd .. && pwd)/dev.html"; F="file://$(cd .. && pwd)/index.html"
one() { FLAGS=$CFLAGS SEEDS=${SEEDS:-3} KINDS=drive,lob,drop,slice,volley CHROME_FLAGS="--allow-file-access-from-files" timeout 500 node shot.mjs "$B?lab=fh&p=$1" --port $2 --steps steps_labclips.mjs > $R/lc$T/$1.txt 2>&1; pkill -f "[c]hromium --headless=new --remote-debugging-port=$2"; }
run() { P0=$1 P1=$2 SECS=150 PICS=$R/fa$T/p_$1 CHROME_FLAGS="--allow-file-access-from-files" timeout 600 node shot.mjs "$F" --port $3 --steps steps_audit.mjs > $R/fa$T/aud_$1.txt 2>&1; pkill -f "[c]hromium --headless=new --remote-debugging-port=$3"; }
if [ -z "$NOCLIPS" ]; then for pr in "Djokovic Federer" "Nadal Sampras" "McEnroe Borg" "Agassi Lendl" "Alcaraz Laver" "Sinner Connors"; do set -- $pr; if [ -n "$ONE" ]; then one $1 9461; one $2 9461; else one $1 9461 & one $2 9462 & wait; fi; done; fi
if [ -z "$NOAUDIT" ]; then
if [ -n "$ONE" ]; then for pr in "Djokovic Federer" "Nadal Sampras" "McEnroe Borg" "Agassi Lendl" "Alcaraz Laver" "Sinner Connors"; do set -- $pr; run $1 $2 9461; done
else
run Djokovic Federer 9461 & run Nadal Sampras 9462 & wait
run McEnroe Borg 9461 & run Agassi Lendl 9462 & wait
run Alcaraz Laver 9461 & run Sinner Connors 9462 & wait
fi
fi
rm -rf $R/fa$T/p_*; echo done
