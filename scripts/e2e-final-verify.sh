#!/bin/bash
# Final verification: focus-within fix (clean, mouse away), full flow health.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-final-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-final.log 2>&1 &
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

echo "### focus-within clean check (mouse parked far away first)"
# navigate to videos
R=$(grab '^  - button "Watch" \[ref'); ab click "$R" > /dev/null; sleep 3
# park mouse at neutral location (page top-left corner, over the header)
ab mouse move 700 10 > /dev/null 2>&1; sleep 0.5
ab eval "
(async () => {
  const card = document.querySelector('.video-card');
  const btn = card.querySelector('button');
  btn.focus();
  await new Promise(r => setTimeout(r, 350));
  const transform = getComputedStyle(card).transform;
  const border = getComputedStyle(card).borderColor;
  btn.blur();
  return JSON.stringify({ focusTransform: transform, focusBorder: border, stuck: transform !== 'none' });
})()" | head -1

echo "### dock pill z-order vs video cards"
ab eval "
(async () => {
  // hover the first dock pill via synthetic mouse
  const pill = document.querySelector('.nav-dock-item');
  const r = pill.getBoundingClientRect();
  // use CDP-free approach: dispatch mousemove through elementFromPoint check
  const el = document.elementFromPoint(r.x + 10, r.y + 10);
  return JSON.stringify({ elementAtPill: el?.className?.slice(0, 60) || el?.tagName });
})()" | head -1

echo "### mic test panel waveform (gate view)"
R=$(grab '^  - button "Mocks" \[ref'); ab click "$R" > /dev/null; sleep 1.5
R=$(ab snapshot -i -c | grep -E 'button "Start Full Mock" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 1.5
R=$(ab snapshot -i -c | grep -E 'button "Test Microphone" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 3
ab screenshot /tmp/fix-mic-gate.png > /dev/null 2>&1
ab eval "document.body.innerText.includes('Microphone ready') ? 'MIC-READY' : 'mic-state-otherwise'" | head -1

echo "### errors + final screenshot of dashboard"
R=$(grab 'button "Switch to day mode" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 1
ab screenshot /tmp/fix-day-full.png > /dev/null 2>&1
R=$(grab 'button "Switch to dark mode" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 1
ab errors 2>&1 | head -5
echo "(final verification done)"
