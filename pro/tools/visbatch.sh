#!/bin/bash
# Film human A v computer B through the real controls (steps_watch.mjs), cut close-up sheets (sheets.py), delete raw frames.
#   pro/tools/visbatch.sh <chase|tv> "A:B C:D ..." [outdir=/tmp/rally-work2/vs]
# chase = the camera behind the human; tv = broadcast (both players' sheets). PAR pairs at once (default 2: his machine has
# 15 GB and /tmp is RAM, so keep it light).
CAM=$1; PAIRS=$2; OUTD=${3:-/tmp/rally-work2/vs}; F="file://$(cd "$(dirname "$0")/.." && pwd)/index.html"
cd "$(dirname "$0")" || exit 1
mkdir -p "$OUTD"
i=0
for pr in $PAIRS; do
  a=${pr%%:*}; b=${pr##*:}; port=$((${PORT0:-9461} + i % ${PAR:-2})); RAW=$OUTD/raw_${CAM}_$a
  ( P0=$a P1=$b CAM=$CAM POINTS=${POINTS:-2} STEP=${STEP:-4} SLOW=${SLOW:-40} OUT=$RAW CHROME_FLAGS="--allow-file-access-from-files" timeout 290 node shot.mjs "$F" --port $port --steps steps_watch.mjs > "$OUTD/${CAM}_$a.log" 2>&1
    python3 -I sheets.py "$RAW" "$OUTD/S_${CAM}_${a}_p0" 0 ${EVERY:-1} ${COLS:-12} ${ROWS:-4} > /dev/null 2>&1
    if [ "$CAM" = "tv" ]; then python3 -I sheets.py "$RAW" "$OUTD/S_${CAM}_${a}_p1" 1 ${EVERY:-1} ${COLS:-12} ${ROWS:-4} > /dev/null 2>&1; fi
    rm -rf "$RAW" ) &
  i=$((i + 1))
  if [ $((i % ${PAR:-2})) -eq 0 ]; then wait; fi
done
wait
