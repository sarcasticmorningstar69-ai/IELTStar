#!/bin/bash
# Verify chart fix + English labels + video card hover, in one shot.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/charte-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/charte.log 2>&1 &
for i in $(seq 1 30); do
  curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 && break
  sleep 0.5
done
export AGENT_BROWSER_CDP="9222"
ab() { agent-browser "$@" 2>&1; }
grab() { ab snapshot -i -c | grep -E "$1" | head -1 | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'; }

ab open http://localhost:3000 > /dev/null
ab set viewport 1440 900 > /dev/null
ab wait --load networkidle > /dev/null
sleep 2.5

# onboarding
R=$(grab 'button "Speak more smoothly" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1

# record one answer
R=$(grab '^  - button "Practice" \[ref'); ab click "$R" > /dev/null; sleep 1.5
R=$(ab snapshot -i -c | grep -E '^- button "Part 1 ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1.8
R=$(ab snapshot -i -c | grep -E 'button "Work and Professional Employment' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 0.6
R=$(ab snapshot -i -c | grep -E '^- button "Start" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "Start Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 4
R=$(ab snapshot -i -c | grep -E 'button "Stop Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2.5
R=$(ab snapshot -i -c | grep -E 'button "It went fine"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "Next Question"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "End session"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2

# home + chart inspection
R=$(grab '^  - button "Home" \[ref'); ab click "$R" > /dev/null; sleep 2
echo "=== CHART LABELS ==="
ab eval "(()=>{const labels=[...document.querySelectorAll('.chart-col span:last-child')].map(s=>s.textContent); return JSON.stringify(labels);})()" 2>&1 | head -1
echo "=== BAR HEIGHTS (last 3 cols) ==="
ab eval "(()=>{const cols=[...document.querySelectorAll('.chart-col')]; return JSON.stringify(cols.slice(-3).map(c=>{const bar=c.querySelector('.chart-bar'); return bar?Math.round(bar.getBoundingClientRect().height):null}));})()" 2>&1 | head -1
echo "=== has Cyrillic anywhere on dashboard? ==="
ab eval "document.body.innerText.match(/[А-Яа-яЁё]/) ? 'CYRILLIC-FOUND(BUG)' : 'NO-CYRILLIC'" 2>&1 | head -1
ab screenshot /tmp/chart-fixed.png > /dev/null 2>&1

# Videos view hover check
R=$(grab '^  - button "Watch" \[ref'); ab click "$R" > /dev/null; sleep 3
echo "=== VIDEO CARDS present ==="
ab eval "document.querySelectorAll('.video-card').length" 2>&1 | head -1
echo "=== video card hover state (transform + collapsed text) ==="
VC=$(ab snapshot -i -c | grep -E 'button "Practice Alongside"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "first card btn: $VC"
ab hover "$VC" > /dev/null 2>&1; sleep 1
ab eval "(()=>{const card=document.querySelector('.video-card'); const st=getComputedStyle(card); const collapsible=card.querySelector('.video-card-collapsible'); return JSON.stringify({transform: st.transform, border: st.borderColor, collapsibleH: Math.round(collapsible.getBoundingClientRect().height)});})()" 2>&1 | head -1
ab screenshot /tmp/video-hover.png > /dev/null 2>&1

echo "=== errors ==="
ab errors 2>&1 | head -5
echo "(end)"
