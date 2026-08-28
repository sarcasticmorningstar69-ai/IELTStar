#!/bin/bash
# Verify all three fixes: techniques reveal, video hover stability, live waveform.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-fix-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-fix.log 2>&1 &
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

echo "### FIX 1: Techniques reveal"
R=$(grab 'button "Speak more smoothly" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 0.5
R=$(ab snapshot -i -c | grep -E 'button "Continue"' | grep -v disabled | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
R=$(grab '^  - button "Learn" \[ref'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'tab "Techniques"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'Build a Part 2 story' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab click "$R" > /dev/null; sleep 2.5
ab eval "
(() => {
  const arts = [...document.querySelectorAll('article')];
  const open = arts.find(a => a.className.includes('col-span-full'));
  if (!open) return 'NO OPEN CARD';
  const reveal = open.querySelector('[id^=tg-panel]');
  return JSON.stringify({
    articleH: Math.round(open.getBoundingClientRect().height),
    articleScrollH: open.scrollHeight,
    clipped: open.scrollHeight > open.getBoundingClientRect().height + 4,
    revealH: reveal ? Math.round(reveal.getBoundingClientRect().height) : null,
    techniqueTitles: [...open.querySelectorAll('h3')].map(h => h.textContent).slice(0, 5),
  });
})()" | head -2
ab screenshot /tmp/fix-techniques.png > /dev/null 2>&1

echo ""
echo "### FIX 2: Video hover — height stability (no grid reflow)"
R=$(grab '^  - button "Watch" \[ref'); ab click "$R" > /dev/null; sleep 3
# measure card + grid heights before and during hover
ab eval "
(() => {
  const card = document.querySelector('.video-card');
  const grid = card.parentElement;
  return JSON.stringify({
    cardH_rest: Math.round(card.getBoundingClientRect().height),
    gridH_rest: Math.round(grid.getBoundingClientRect().height),
  });
})()" | head -1
VC=$(ab snapshot -i -c | grep -E 'button "Practice Alongside"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
ab hover "$VC" > /dev/null 2>&1; sleep 1.2
ab eval "
(() => {
  const card = document.querySelector('.video-card');
  const grid = card.parentElement;
  const collapsible = card.querySelector('.video-card-collapsible');
  return JSON.stringify({
    cardH_hover: Math.round(card.getBoundingClientRect().height),
    gridH_hover: Math.round(grid.getBoundingClientRect().height),
    collapsibleH: Math.round(collapsible.getBoundingClientRect().height),
    transform: getComputedStyle(card).transform,
  });
})()" | head -1
# check focus-within does NOT trigger hover state anymore
ab eval "
(() => {
  const card = document.querySelector('.video-card');
  const btn = card.querySelector('button');
  btn.focus();
  const st = getComputedStyle(card);
  const hoverWhileFocus = st.transform !== 'none';
  btn.blur();
  return JSON.stringify({ focusTriggersHover: hoverWhileFocus });
})()" | head -1
ab screenshot /tmp/fix-video-hover.png > /dev/null 2>&1

echo ""
echo "### FIX 3: Live waveform — scrolling time-series"
# back to practice, record, and check the waveform history accumulates
R=$(grab '^  - button "Practice" \[ref'); ab click "$R" > /dev/null; sleep 1.5
R=$(ab snapshot -i -c | grep -E '^- button "Part 1 ' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 1.8
R=$(ab snapshot -i -c | grep -E 'button "Work and Professional Employment' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 0.6
R=$(ab snapshot -i -c | grep -E '^- button "Start" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "Start Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); ab click "$R" > /dev/null
sleep 2
ab eval "(() => { const bars=[...document.querySelectorAll('.bg-brand-bright')]; const wf=bars.filter(b=>b.parentElement && b.parentElement.getAttribute('role')==='img'); return JSON.stringify({barCount: wf.length, nonzero: wf.filter(b=>parseFloat(b.style.height)>7).length}); })()" | head -1
sleep 2
ab eval "(() => { const bars=[...document.querySelectorAll('.bg-brand-bright')]; const wf=bars.filter(b=>b.parentElement && b.parentElement.getAttribute('role')==='img'); return JSON.stringify({barCount: wf.length, nonzero: wf.filter(b=>parseFloat(b.style.height)>7).length}); })()" | head -1
ab screenshot /tmp/fix-waveform.png > /dev/null 2>&1
R=$(ab snapshot -i -c | grep -E 'button "Stop Recording"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 2
R=$(ab snapshot -i -c | grep -E 'button "It went fine"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "Next Question"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 1
R=$(ab snapshot -i -c | grep -E 'button "End session"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'); [ -n "$R" ] && ab click "$R" > /dev/null; sleep 2

echo ""
echo "### errors"
ab errors 2>&1 | head -5
echo "(fix verification done)"
