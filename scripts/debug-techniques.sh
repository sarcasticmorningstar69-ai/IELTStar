#!/bin/bash
# Debug techniques reveal empty space issue.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-tech-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-tech.log 2>&1 &
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

# Learn → Techniques tab
R=$(grab '^  - button "Learn" \[ref'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'tab "Techniques"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "techniques tab: $R"; ab click "$R" > /dev/null; sleep 2

# Click "Build a Part 2 story" group
R=$(ab snapshot -i -c | grep -E 'Build a Part 2 story' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "group: $R"; ab click "$R" > /dev/null; sleep 2

echo "=== DOM inspection of the expanded card ==="
ab eval "
(() => {
  const arts = [...document.querySelectorAll('article')];
  const open = arts.find(a => a.className.includes('col-span-full'));
  if (!open) return 'NO OPEN CARD FOUND';
  const reveal = open.querySelector('[id^=tg-panel]');
  const grid = reveal?.parentElement;
  const inner = reveal?.firstElementChild;
  const cs = reveal ? getComputedStyle(reveal) : null;
  return JSON.stringify({
    articleH: Math.round(open.getBoundingClientRect().height),
    articleScrollH: open.scrollHeight,
    revealExists: !!reveal,
    revealH: reveal ? Math.round(reveal.getBoundingClientRect().height) : null,
    revealScrollH: reveal?.scrollHeight,
    gridRows: cs?.gridTemplateRows,
    innerH: inner ? Math.round(inner.getBoundingClientRect().height) : null,
    innerScrollH: inner?.scrollHeight,
    childCount: inner?.children.length,
    opacity: cs?.opacity,
    inert: reveal?.inert,
  });
})()" | head -3
ab screenshot /tmp/tech-bug.png > /dev/null 2>&1
echo "(done)"
