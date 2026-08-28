#!/bin/bash
# Verify: 1) sidebar no expansion  2) calm video hover  3) playback playhead
# follows timestamp smoothly  4) theme transition animation.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-polish-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-polish.log 2>&1 &
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

echo "### 1. Sidebar — no expansion on hover"
R=$(grab 'button "Speak more smoothly" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
NAV=$(ab snapshot -i -c | grep -E '^  - button "Practice" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab eval "(()=>{const b=[...document.querySelectorAll('nav[aria-label=Main] button')].find(x=>x.getAttribute('aria-label')==='Practice'); return JSON.stringify({w_rest: Math.round(b.getBoundingClientRect().width), classHasDock: b.className.includes('nav-dock-item')});})()" | head -1
ab hover "$NAV" > /dev/null 2>&1; sleep 1.2
ab eval "(()=>{const b=[...document.querySelectorAll('nav[aria-label=Main] button')].find(x=>x.getAttribute('aria-label')==='Practice'); return JSON.stringify({w_hover: Math.round(b.getBoundingClientRect().width)});})()" | head -1
ab screenshot /tmp/p-sidebar.png > /dev/null 2>&1

echo ""
echo "### 2. Video hover — calm (small lift, soft border, no fill/collapse)"
R=$(ab snapshot -i -c | grep -E '^  - button "YouTube Mocks" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 3
VC=$(ab snapshot -i -c | grep -E 'button "Practice Alongside"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab hover "$VC" > /dev/null 2>&1; sleep 1.3
ab eval "(()=>{const card=document.querySelector('.video-card'); const cs=getComputedStyle(card); const desc=card.querySelector('p.text-xs'); return JSON.stringify({transform: cs.transform, borderColor: cs.borderColor, descVisible: !!desc && Math.round(desc.getBoundingClientRect().height) > 0, descH: desc ? Math.round(desc.getBoundingClientRect().height) : 0});})()" | head -1
ab screenshot /tmp/p-video.png > /dev/null 2>&1

echo ""
echo "### 3. Playback playhead follows timestamp smoothly"
# record an answer first
R=$(ab snapshot -i -c | grep -E '^  - button "Practice" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 1.5
R=$(ab snapshot -i -c | grep -E '^- button "Part 1 ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1.8
R=$(ab snapshot -i -c | grep -E 'button "Work and Professional Employment' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 0.6
R=$(ab snapshot -i -c | grep -E '^- button "Start" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "Start Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 5
R=$(ab snapshot -i -c | grep -E 'button "Stop Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2.5
R=$(ab snapshot -i -c | grep -E 'button "It went fine"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "Next Question"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "End session"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "Listen to your answers"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null; sleep 2.5
# find the play button in the recordings view and play
PLAY=$(ab snapshot -i -c | grep -E 'button "Play ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "play button: $PLAY"
ab click "$PLAY" > /dev/null; sleep 0.6
# sample playhead position over time — should advance smoothly (many distinct values)
ab eval "
(async () => {
  const ph = document.querySelector('span.pointer-events-none.absolute.top-1');
  if (!ph) return 'NO PLAYHEAD ELEMENT';
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(Math.round(parseFloat(ph.style.left)));
    await new Promise(r => setTimeout(r, 100));
  }
  const distinct = new Set(samples).size;
  const monotonic = samples.every((v, i) => i === 0 || v >= samples[i - 1]);
  return JSON.stringify({ samples, distinct, monotonic, smooth: distinct >= 6 });
})()" | head -2
ab screenshot /tmp/p-playback.png > /dev/null 2>&1

echo ""
echo "### 4. Theme transition"
ab eval "typeof document.startViewTransition" | head -1
R=$(ab snapshot -i -c | grep -E 'button "Switch to day mode"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "toggle: $R"
# capture view transition in flight: click and immediately check for pseudo-element
ab click "$R" > /dev/null
sleep 0.15
ab eval "!!document.querySelector('::view-transition-new(root)') || getComputedStyle(document.documentElement, '::view-transition-new(root)').animationName" 2>&1 | head -1
sleep 1
ab eval "document.documentElement.className" | head -1
ab screenshot /tmp/p-day.png > /dev/null 2>&1
# back to dark
R=$(ab snapshot -i -c | grep -E 'button "Switch to dark mode"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 1
ab eval "document.documentElement.className" | head -1

echo ""
echo "### errors"
ab errors 2>&1 | head -5
echo "(polish verification done)"
