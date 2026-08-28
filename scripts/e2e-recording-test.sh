#!/bin/bash
# IELTStar end-to-end recording flow test — ref-based with strict verification.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
# ensure port 9222 is free
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-test-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-test.log 2>&1 &
CHROME_PID=$!
for i in $(seq 1 30); do
  curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 && break
  sleep 0.5
done
export AGENT_BROWSER_CDP="9222"

ab() { agent-browser "$@" 2>&1; }
step() { echo ""; echo "### $1"; }

# get_ref <grep-pattern-for-snapshot-line>
get_ref() {
  local snap
  snap=$(ab snapshot -i -c)
  echo "$snap" | grep -E "$1" | head -1 | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'
}

step "0 open"
ab open http://localhost:3000 > /dev/null
ab set viewport 1440 900 > /dev/null
ab reload > /dev/null
ab wait --load networkidle > /dev/null
sleep 2.5

step "1 onboarding"
REF=$(get_ref 'button "Speak more smoothly" \[ref')
echo "focus-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 0.6
REF=$(get_ref 'button "Continue" \[ref(?!.+\[disabled)')
REF=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "continue-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 1
ab eval "JSON.parse(localStorage.getItem('ieltstar-progress')||'{}').state?.onboardingDone" | head -1

step "2 practice hub"
REF=$(get_ref '^  - button "Practice" \[ref')
echo "practice-nav-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 1.5
ab snapshot -i -c | grep -E 'heading "Choose' | head -1

step "3 part 1 browser"
REF=$(ab snapshot -i -c | grep -E '^- button "Part 1 ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "part1-card-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 1.8
ab snapshot -i -c | grep -E 'heading "Everyday' | head -1

step "4 select topic + start session"
REF=$(ab snapshot -i -c | grep -E 'button "Work and Professional Employment' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "topic-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 0.7
REF=$(ab snapshot -i -c | grep -E '^- button "Start" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "start-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 2.2
ab snapshot -i -c | grep -E 'heading "What is your current' | head -1

step "5 record 4s and stop"
REF=$(ab snapshot -i -c | grep -E 'button "Start Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "rec-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 4
REF=$(ab snapshot -i -c | grep -E 'button "Stop Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "stop-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 2.5

step "6 review state (player + diagnosis)"
ab snapshot -i -c | grep -E "What happened|button \"Play |button \"Save|button \"Retry|Next Question" | head -6

step "7 quick diagnosis WORD + Save"
REF=$(ab snapshot -i -c | grep -E 'button "Word ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "word-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 0.6
REF=$(ab snapshot -i -c | grep -E 'button "Save"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "save-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 1

step "8 next question"
REF=$(ab snapshot -i -c | grep -E 'button "Next Question"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "next-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 1.5
ab snapshot -i -c | grep -E 'heading "Why did you' | head -1

step "9 second answer + fine + end session"
REF=$(ab snapshot -i -c | grep -E 'button "Start Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$REF" ] && ab click "$REF" | head -1
sleep 3
REF=$(ab snapshot -i -c | grep -E 'button "Stop Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$REF" ] && ab click "$REF" | head -1
sleep 2.2
REF=$(ab snapshot -i -c | grep -E 'button "It went fine"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "fine-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 0.8
REF=$(ab snapshot -i -c | grep -E 'button "Next Question"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$REF" ] && ab click "$REF" | head -1
sleep 1.2
REF=$(ab snapshot -i -c | grep -E 'button "End session"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "end-ref: $REF"; [ -n "$REF" ] && ab click "$REF" | head -1
sleep 1.5

step "10 persisted progress"
ab eval "const p=JSON.parse(localStorage.getItem('ieltstar-progress')||'{}').state||{}; JSON.stringify({recordings:(p.recordings||[]).length, firstLabel:(p.recordings||[])[0]?.label, duration:(p.recordings||[])[0]?.duration, mime:(p.recordings||[])[0]?.mimeType, topics:Object.keys(p.topics||{}), attempted:p.topics?.p1t1?.attempted?.length, streak:p.streak, sessions:(p.sessions||[]).length, problems:Object.keys(p.problems||{}), dailySeconds:Object.values(p.dailyPractice||{})})" | head -1

step "11 IndexedDB audio blobs"
ab eval "(async()=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('ieltstar-audio');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}); const tx=db.transaction('recordings','readonly'); const st=tx.objectStore('recordings'); const all=await new Promise(res=>{const q=st.getAll(); q.onsuccess=()=>res(q.result);}); return JSON.stringify({blobs:all.length, sizes:all.map(a=>a.blob.size)});})()" | head -1

step "12 dashboard real activity"
ab snapshot -i -c > /dev/null
ab eval "location.reload()" > /dev/null
sleep 3
ab eval "document.body.innerText.includes('No speaking activity yet') ? 'CHART-EMPTY(BUG)' : 'CHART-HAS-DATA'" | head -1
ab snapshot -i -c | grep -E "Practice streak|consecutive days" | head -2

step "13 page errors"
ab errors | head -5
echo "(end of test)"
