#!/usr/bin/env bash
# tracemoment.sh P0 P1 WHO T0 T1 [SECS] — the seeded match (RSEED, default 11) traced every frame for player WHO between T0 and
# T1 (TRC lines into /tmp/rally-work2/det/trace_P0_T0.txt). FLAGS env passes through (a,b=1 → globalThis.__a ...).
cd "$(dirname "$0")"; F="file://$(cd .. && pwd)/index.html"; mkdir -p /tmp/rally-work2/det
K=$1; O=/tmp/rally-work2/det/trace_${K// /_}_$4.txt
RSEED=${RSEED:-11} P0=$1 P1=$2 SECS=${6:-$(python3 -c "import math; print(math.ceil($5) + 1)")} TRACE=$3:$4:$5 CHROME_FLAGS="--allow-file-access-from-files" timeout 900 node shot.mjs "$F" --port 9461 --steps steps_audit.mjs > $O 2>&1
pkill -f "[c]hromium --headless=new --remote-debugging-port=9461"; echo $O
