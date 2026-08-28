#!/bin/bash
# Part 1 only: sidebar + video hover checks (quick).
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-p1-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-p1.log 2>&1 &
for i in $(seq 1 30); do
  curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 && break
  sleep 0.5
done
export AGENT_BROWSER_CDP="9222"
ab() { agent-browser "$@" 2>&1; }

ab open http://localhost:3000 > /dev/null
ab set viewport 1440 900 > /dev/null
ab wait --load networkidle > /dev/null
sleep 2.5

echo "### 1. Sidebar — no expansion"
R=$(ab snapshot -i -c | grep -E 'button "Speak more smoothly"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
ab eval "(()=>{const b=[...document.querySelectorAll('nav[aria-label=Main] button')].find(x=>x.getAttribute('aria-label')==='Practice'); return JSON.stringify({w_rest: Math.round(b.getBoundingClientRect().width), hasDockClass: b.className.includes('nav-dock-item')});})()" | head -1
NAV=$(ab snapshot -i -c | grep -E '^  - button "Practice" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab hover "$NAV" > /dev/null 2>&1; sleep 1.2
ab eval "(()=>{const b=[...document.querySelectorAll('nav[aria-label=Main] button')].find(x=>x.getAttribute('aria-label')==='Practice'); return JSON.stringify({w_hover: Math.round(b.getBoundingClientRect().width)});})()" | head -1
ab screenshot /tmp/p-sidebar.png > /dev/null 2>&1

echo "### 2. Video hover — calm"
R=$(ab snapshot -i -c | grep -E '^  - button "YouTube Mocks" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 3
VC=$(ab snapshot -i -c | grep -E 'button "Practice Alongside"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab hover "$VC" > /dev/null 2>&1; sleep 1.3
ab eval "(()=>{const card=document.querySelector('.video-card'); const cs=getComputedStyle(card); const desc=[...card.querySelectorAll('p')].find(p=>p.className.includes('text-xs')); return JSON.stringify({transform: cs.transform, borderColor: cs.borderColor, descH: desc?Math.round(desc.getBoundingClientRect().height):0});})()" | head -1
ab screenshot /tmp/p-video.png > /dev/null 2>&1

echo "### 4a. Theme transition support + toggle"
ab eval "typeof document.startViewTransition" | head -1
R=$(ab snapshot -i -c | grep -E 'button "Switch to day mode"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null
sleep 0.12
ab eval "getComputedStyle(document.documentElement, '::view-transition-new(root)').animationName" 2>&1 | head -1
sleep 1.2
ab eval "document.documentElement.className" | head -1
ab screenshot /tmp/p-day.png > /dev/null 2>&1
R=$(ab snapshot -i -c | grep -E 'button "Switch to dark mode"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 1.2
ab eval "document.documentElement.className" | head -1
ab errors 2>&1 | head -3
echo "(part 1 done)"
