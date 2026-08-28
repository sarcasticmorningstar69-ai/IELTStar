#!/bin/bash
# Part 2 flow test: browser → cue card → prep (60s, use "speak now") → auto/stop → review
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-p2-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-p2.log 2>&1 &
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

step "1 Part 2 browser"
R=$(grab '^  - button "Practice" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
R=$(grab '^- button "Part 2 Long Turn'); echo "p2-card: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 2
ab snapshot -c | grep -E 'heading "Long Turn"|Cue Card 1' | head -2

step "2 select first cue card"
R=$(ab snapshot -i -c | grep -E 'An Inspiring Individual' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "card: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "Selected cue card|Prepare & Speak" | head -2

step "3 open vocabulary sheet"
R=$(grab 'button "Useful Language" \[ref'); echo "vocab: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "Useful Language|Role model" | head -3
R=$(grab 'button "Close"'); [ -z "$R" ] && R=$(grab 'button "Close$"')
ab eval "document.querySelector('[data-slot=sheet-content] button, [role=dialog] button')?.click(); 'closed'" > /dev/null
sleep 1

step "4 begin preparation"
sleep 1.5
R=$(grab 'button "Begin Preparation — 1 minute" \[ref'); echo "prep: $R"
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 4
ab snapshot -c | grep -E "PREPARATION|Your notes|Begin Preparation|Microphone" | head -4

step "5 wait for prep auto-start (60s) — instead use Speak now"
R=$(grab 'button "Start speaking now" \[ref'); echo "speak-now: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 3
ab snapshot -c | grep -iE "RECORDING|recording stops automatically|Done speaking" | head -3

step "6 stop speaking after 3s"
R=$(grab 'button "Done speaking" \[ref'); echo "done: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 2.5
ab snapshot -c | grep -iE "What happened|Retry this card|Finish Session|Your preparation notes" | head -4

step "7 finish session"
R=$(grab 'button "Finish Session" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 2
ab snapshot -c | grep -E "Session complete|answer" | head -2

step "8 persisted p2 data"
ab eval "const p=JSON.parse(localStorage.getItem('ieltstar-progress')||'{}').state||{}; const r=(p.recordings||[])[0]; JSON.stringify({recordings:(p.recordings||[]).length, label:r?.label, duration:r?.duration, topicAttempted:p.topics?.p2c1?.attempted?.length})" | head -1

step "9 errors"
ab errors | head -5
echo "(p2 test end)"
