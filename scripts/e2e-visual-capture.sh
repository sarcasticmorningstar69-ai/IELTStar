#!/bin/bash
# Capture polished visuals: dock hover, chart, video hover, mobile nav.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-visual-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-visual.log 2>&1 &
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

# onboarding (fresh profile)
R=$(grab 'button "Speak more smoothly" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1

# 1. Dock at rest
ab screenshot /tmp/v-dock-rest.png > /dev/null 2>&1

# 2. Dock hover on Practice
R=$(grab '^  - button "Practice" \[ref')
ab hover "$R" > /dev/null 2>&1
sleep 1.2
ab screenshot /tmp/v-dock-hover.png > /dev/null 2>&1

# 3. Record quickly to have chart data
R=$(grab '^  - button "Practice" \[ref'); ab click "$R" > /dev/null; sleep 1.5
R=$(ab snapshot -i -c | grep -E '^- button "Part 1 ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1.8
R=$(ab snapshot -i -c | grep -E 'button "Work and Professional Employment' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 0.6
R=$(ab snapshot -i -c | grep -E '^- button "Start" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "Start Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 4
R=$(ab snapshot -i -c | grep -E 'button "Stop Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2.5
R=$(ab snapshot -i -c | grep -E 'button "It went fine"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "Next Question"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "End session"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(grab '^  - button "Home" \[ref'); ab click "$R" > /dev/null; sleep 2

# 4. Dashboard with chart data
ab screenshot /tmp/v-dashboard.png > /dev/null 2>&1

# 5. Videos + hover
R=$(grab '^  - button "Watch" \[ref'); ab click "$R" > /dev/null; sleep 3
ab screenshot /tmp/v-videos-rest.png > /dev/null 2>&1
VC=$(ab snapshot -i -c | grep -E 'button "Practice Alongside"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab hover "$VC" > /dev/null 2>&1
sleep 1.2
ab screenshot /tmp/v-videos-hover.png > /dev/null 2>&1

# 6. Mobile view with new bottom nav
ab set viewport 390 844 > /dev/null
ab reload > /dev/null
ab wait --load networkidle > /dev/null
sleep 3
ab screenshot /tmp/v-mobile.png > /dev/null 2>&1
echo "=== mobile overflow check ==="
ab eval "JSON.stringify({overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth})" 2>&1 | head -1

echo "=== day mode dock ==="
ab set viewport 1440 900 > /dev/null
ab reload > /dev/null; ab wait --load networkidle > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "Switch to day mode"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null; sleep 1.2
ab screenshot /tmp/v-day-dock.png > /dev/null 2>&1

echo "=== errors ==="
ab errors 2>&1 | head -4
echo "(visual capture done)"
