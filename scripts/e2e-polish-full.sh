#!/bin/bash
# Full polish verification with timeouts on every agent-browser call.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151" 2>/dev/null; sleep 2
PROFILE="/tmp/chrome-full-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-full.log 2>&1 &
sleep 5
export AGENT_BROWSER_CDP="9222"
ab() { timeout 30 agent-browser "$@" 2>&1; }
ref() { ab snapshot -i -c | grep -E "$1" | head -1 | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'; }

ab open http://localhost:3000 > /dev/null
ab set viewport 1440 900 > /dev/null
ab wait --load networkidle > /dev/null
sleep 2.5

echo "### 1. Sidebar: no expansion"
R=$(ref 'button "Speak more smoothly"'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
NAV=$(ref 'button "Practice"')
ab hover "$NAV" > /dev/null; sleep 1.2
ab eval "(()=>{const b=[...document.querySelectorAll('nav[aria-label=Main] button')].find(x=>x.getAttribute('aria-label')==='Practice'); return JSON.stringify({w_hover: Math.round(b.getBoundingClientRect().width)});})()" | head -1
ab screenshot /tmp/p-sidebar.png > /dev/null

echo "### 2. Video hover: calm"
VID=$(ref 'button "YouTube Mocks"'); ab click "$VID" > /dev/null; sleep 3
VC=$(ref 'button "Practice Alongside"')
ab hover "$VC" > /dev/null; sleep 1.3
ab eval "(()=>{const card=document.querySelector('.video-card'); const cs=getComputedStyle(card); const desc=[...card.querySelectorAll('p')].find(p=>p.className.includes('text-xs')); return JSON.stringify({transform: cs.transform, borderColor: cs.borderColor, descH: desc?Math.round(desc.getBoundingClientRect().height):0});})()" | head -1
ab screenshot /tmp/p-video.png > /dev/null

echo "### 3. Playback playhead smoothness"
ab find role button click --name "Practice" > /dev/null; sleep 1.5
R=$(ref '^- button "Part 1 '); ab click "$R" > /dev/null; sleep 1.8
R=$(ref 'button "Work and Professional Employment'); ab click "$R" > /dev/null; sleep 0.6
R=$(ab snapshot -i -c | grep -E '^- button "Start" ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(ref 'button "Start Recording"'); ab click "$R" > /dev/null; sleep 5
R=$(ref 'button "Stop Recording"'); ab click "$R" > /dev/null; sleep 2.5
R=$(ref 'button "It went fine"'); ab click "$R" > /dev/null; sleep 1
R=$(ref 'button "Next Question"'); ab click "$R" > /dev/null; sleep 1
R=$(ref 'button "End session"'); ab click "$R" > /dev/null; sleep 2
R=$(ref 'button "Listen to your answers"'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 2.5
PLAY=$(ab snapshot -i -c | grep -E 'button "Play ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "play: $PLAY"
ab click "$PLAY" > /dev/null; sleep 0.7
ab eval "
(async () => {
  const ph = document.querySelector('span.pointer-events-none.absolute.top-1');
  if (!ph) return 'NO PLAYHEAD';
  const s = [];
  for (let i = 0; i < 10; i++) {
    s.push(Math.round(parseFloat(ph.style.left)));
    await new Promise(r => setTimeout(r, 90));
  }
  return JSON.stringify({ s, distinct: new Set(s).size, monotonic: s.every((v,i)=>i===0||v>=s[i-1]) });
})()" | head -1
ab screenshot /tmp/p-playback.png > /dev/null

echo "### 4. Theme transition"
ab eval "typeof document.startViewTransition" | head -1
TOG=$(ref 'button "Switch to day mode"')
ab click "$TOG" > /dev/null; sleep 0.12
ab eval "getComputedStyle(document.documentElement, '::view-transition-new(root)').animationName" | head -1
sleep 1.2
ab eval "document.documentElement.className" | head -1
ab screenshot /tmp/p-day.png > /dev/null
TOG2=$(ref 'button "Switch to dark mode"')
ab click "$TOG2" > /dev/null; sleep 1.2
ab eval "document.documentElement.className" | head -1

echo "### errors"
ab errors | head -3
echo "(all done)"
