#!/bin/bash
# Clip check (steps_labclips, every stroke kind) for the players named on the command line, one browser at a time.
# usage: tools/scan_new.sh TAG "Name1" "Name2" ...   → /tmp/rally-work2/lcTAG/<Name>.txt; summarise with scan_summary.py TAG
T=$1; shift; cd "$(dirname "$0")"; R=/tmp/rally-work2; rm -rf $R/lc$T; mkdir -p $R/lc$T
B="file://$(cd .. && pwd)/dev.html"
for n in "$@"; do SEEDS=${SEEDS:-2} KINDS=drive,lob,drop,slice,volley CHROME_FLAGS="--allow-file-access-from-files" timeout 500 node shot.mjs "$B?lab=fh&p=$n" --port 9461 --steps steps_labclips.mjs > "$R/lc$T/${n// /_}.txt" 2>&1; pkill -f "[c]hromium --headless=new --remote-debugging-port=9461"; done; echo done
