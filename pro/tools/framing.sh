#!/bin/bash
# framing.sh <tv|chase> <outdir>: framing + line-of-sight check (no screenshots) for all 12 players over every phase,
# two browsers at a time. Prints per human player: frames off screen and how many were blocked by the stand or wall.
cd "$(dirname "$0")" || exit 1
CAM=$1; O=$2; F="file://$(cd .. && pwd)/index.html"; rm -rf "$O"; mkdir -p "$O"
fc() { P0=$1 P1=$2 CAM=$CAM POINTS=6 STEP=4 SLOW=6 OCC=1 NOSHOT=1 FPH=live,toss,between,over OUT=$O CHROME_FLAGS="--allow-file-access-from-files" timeout 500 node shot.mjs "$F" --port $3 --steps steps_watch.mjs > "$O/$1.log" 2>&1; }
pairs=("Djokovic Federer Nadal Sampras" "McEnroe Borg Agassi Lendl" "Alcaraz Laver Sinner Connors")
[ "$CAM" = chase ] && pairs=("Djokovic Sinner Nadal Federer" "Alcaraz Djokovic Connors Laver" "Federer Nadal Sampras Agassi" "Sinner Alcaraz Lendl McEnroe" "McEnroe Lendl Borg Connors" "Agassi Sampras Laver Sinner")
for pr in "${pairs[@]}"; do read -r a b c d <<< "$pr"; fc "$a" "$b" 9461 & fc "$c" "$d" 9462 & wait; done
for f in "$O"/*.log; do echo "$(basename "$f" .log): $(grep -h FRAMING "$f" | cut -c1-110) wall/stand: $(grep '^OCC' "$f" | grep -c 'arena < Scene')"; done
