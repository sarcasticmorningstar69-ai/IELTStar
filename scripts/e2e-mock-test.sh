#!/bin/bash
# IELTStar Full Mock E2E test: configurator → mic check → automated recording →
# end early (interrupted) → review with timeline. Runs in one shot.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-mock-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-mock.log 2>&1 &
for i in $(seq 1 30); do
  curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 && break
  sleep 0.5
done
export AGENT_BROWSER_CDP="9222"

ab() { agent-browser "$@" 2>&1; }
step() { echo ""; echo "### $1"; }
grab() { ab snapshot -i -c | grep -E "$1" | head -1 | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'; }

step "0 open + onboarding"
ab open http://localhost:3000 > /dev/null
ab set viewport 1440 900 > /dev/null
ab wait --load networkidle > /dev/null
sleep 2.5
R=$(grab 'button "Speak more smoothly" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1

step "1 mock configurator via sidebar Mocks"
R=$(grab '^  - button "Mocks" \[ref'); echo "mocks-nav: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -i -c | grep -E 'heading "Build your mock|button "Start Full Mock"' | head -2

step "2 start full mock"
R=$(grab 'button "Start Full Mock" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -i -c | grep -E "heading \"Let's check your microphone|button \"Test Microphone\"" | head -2

step "3 mic check → continue"
R=$(grab 'button "Test Microphone" \[ref'); echo "test-mic: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 4
ab snapshot -i -c | grep -E "Microphone ready|button \"Continue\"" | head -3
R=$(grab 'button "Continue" \[ref'); echo "continue: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 2

step "4 mock part intro"
ab snapshot -i -c | grep -E 'heading "Part 1 — Everyday|button "Begin Part 1"' | head -2
R=$(grab 'button "Begin Part 1" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5

step "5 transition countdown visible?"
ab snapshot -i -c | grep -E "Recording starts in" | head -1
sleep 4

step "6 recording auto-started?"
ab snapshot -i -c | grep -E "RECORDING|button \"Done — next question\"" | head -3

step "7 answer Q1 (wait 3s then Done)"
sleep 3
R=$(grab 'button "Done — next question" \[ref'); echo "done-btn: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 5

step "8 Q2 auto-recording (after 3s transition)?"
ab snapshot -i -c | grep -E 'heading "Why did you choose|RECORDING|button "Done' | head -3

step "9 answer Q2 then End mock early"
sleep 3
R=$(grab 'button "Done — next question" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 4
R=$(grab 'button "End mock early" \[ref'); echo "end-btn: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
R=$(grab 'button "End & review" \[ref'); echo "end-confirm: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 4

step "10 mock review page"
ab snapshot -i -c | grep -E "Mock interrupted|Your full recording|button \"Play Full|Timeline" | head -4

step "11 persisted mock data"
ab eval "const p=JSON.parse(localStorage.getItem('ieltstar-progress')||'{}').state||{}; const m=(p.mocks||[])[0]; JSON.stringify({mockStatus:m?.status, segmentsTotal:m?.segments?.length, segmentsCompleted:m?.segments?.filter(s=>s.completed).length, fullRecordingId:!!m?.fullRecordingId, segOffsets:m?.segments?.slice(0,3).map(s=>[s.label,Math.round(s.startOffset||0),Math.round(s.endOffset||0)]), recordings:(p.recordings||[]).length})" | head -1

step "12 IndexedDB master blob"
ab eval "(async()=>{const db=await new Promise((res)=>{const q=indexedDB.open('ieltstar-audio');q.onsuccess=()=>res(q.result);}); const tx=db.transaction('recordings','readonly'); const all=await new Promise(res=>{const q=tx.objectStore('recordings').getAll(); q.onsuccess=()=>res(q.result);}); return JSON.stringify({blobs:all.length, sizes:all.map(a=>a.blob.size)});})()" | head -1

step "13 reload persistence"
ab eval "location.reload()" > /dev/null
sleep 3
ab eval "const p=JSON.parse(localStorage.getItem('ieltstar-progress')||'{}').state||{}; JSON.stringify({recordings:(p.recordings||[]).length, mocks:(p.mocks||[]).length})" | head -1

step "14 page errors"
ab errors | head -6
echo "(mock test end)"
