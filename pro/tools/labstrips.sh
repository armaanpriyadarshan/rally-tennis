#!/usr/bin/env bash
# labstrips.sh NAME LAB WING PICK U0 U1 — every 1/60 s frame, front and back views, tiled 10 per row into /tmp/rally-work2/sheet_NAME_LAB.jpg
cd /home/armaan/Documents/rally-tennis/pro/tools; B="file://$(cd .. && pwd)/dev.html"; N=$1; L=$2; W=$3; K=$4; U0=$5; U1=$6; D=/tmp/rally-work2/lab_${N}_${L}_${W}_$K; rm -rf $D; mkdir -p $D
st() { PICK=$K U0=$U0 U1=$U1 OUT=$D/$1 CHROME_FLAGS="--allow-file-access-from-files" timeout 400 node shot.mjs "$B?lab=$L&wing=$W&p=$N&view=$1" --port $2 --steps steps_labstrip.mjs > /dev/null 2>&1; pkill -f "[c]hromium --headless=new --remote-debugging-port=$2"; }
st front 9461 & st back 9462 & wait
args=(); for v in front back; do n=$(ls $D/${v}_*.jpg | wc -l); for r in $(seq 0 10 $((n-1))); do p=$(printf "%02d" $r); args+=("$v u$(python3 -c "print(round($U0+$r/60,2))")=$D/${v}_${p:0:1}[0-9].jpg"); done; done
python3 -I labsheet.py /tmp/rally-work2/sheet_${N}_${L}_${W}_$K.jpg "${args[@]}" > /dev/null; rm -rf $D; echo /tmp/rally-work2/sheet_${N}_${L}_${W}_$K.jpg
