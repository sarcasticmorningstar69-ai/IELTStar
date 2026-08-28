#!/bin/bash
# IELTStar view tour: Learn, Review, Recordings, Practice Again, Notes, Settings,
# Videos + mobile responsive check + day mode check.
set -u
pkill -f "agent-browser-linux" 2>/dev/null; sleep 1
pkill -f "chrome-151.0.7922.34/chrome" 2>/dev/null; sleep 2
for i in $(seq 1 10); do curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1 || break; sleep 1; done
PROFILE="/tmp/chrome-tour-$RANDOM"
rm -rf "$PROFILE"
setsid /home/z/.agent-browser/browsers/chrome-151.0.7922.34/chrome \
  --headless=new --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --no-first-run --no-default-browser-check --disable-gpu \
  --user-data-dir="$PROFILE" about:blank < /dev/null > /tmp/chrome-tour.log 2>&1 &
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

step "1 LEARN — problems tab"
R=$(grab '^  - button "Learn" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 2
ab snapshot -c | grep -E "Answering Naturally|Vocabulary Range|14 areas" | head -3
step "1b expand first area"
R=$(grab 'button "01|button "Answering Naturally'); echo "area: $R"
R=$(ab snapshot -i -c | grep -E 'Answering Naturally' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "One-word / overly short|Overusing basic" | head -2
step "1c open a problem detail"
R=$(ab snapshot -i -c | grep -E 'One-word / overly short answers' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "What you may notice|Why it happens|How to work on it|Practice Activity" | head -4

step "2 LEARN — techniques tab"
R=$(ab snapshot -i -c | grep -E 'button "Techniques"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "Build a natural Part 1 answer|technique groups" | head -2
step "2b reveal technique group"
R=$(ab snapshot -i -c | grep -E 'Build a natural Part 1 answer' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "DIRECT ANSWER FIRST|A.R.E." | head -2

step "3 LEARN — tips tab"
R=$(ab snapshot -i -c | grep -E 'button "Tips"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -cE "Answer the question you were actually asked|tip" | head -1
ab snapshot -c | grep -E "General|Test Day|Practice Quality" | head -3

step "4 REVIEW hub"
R=$(grab '^  - button "Review" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "Look back|YOUR FIRST SESSION|haven't recorded" | head -3

step "5 RECORDINGS"
R=$(ab snapshot -i -c | grep -E 'button "Recordings"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "rec-nav: $R"
# navigate via review hub link if present, else via menu
if [ -z "$R" ]; then
  ab find role button click --name "Recordings" > /dev/null 2>&1
else
  ab click "$R" > /dev/null
fi
sleep 1.5
ab snapshot -c | grep -E "recordings will appear here|My Recordings" | head -2

step "6 PRACTICE AGAIN"
R=$(ab snapshot -i -c | grep -E 'button "Practice Again" \[ref' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "Nothing needs revisiting|Keep practicing" | head -2

step "7 NOTES"
R=$(grab '^  - button "Notes" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "No notes yet|New note" | head -2
step "7b create a note"
R=$(ab snapshot -i -c | grep -iE 'button "New note|button "Add note|button "Create' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
echo "new-note: $R"; [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
ab snapshot -i -c | grep -E 'textbox' | head -3

step "8 SETTINGS"
R=$(grab '^  - button "Settings" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 1.5
ab snapshot -c | grep -E "Appearance|Recordings|Backup|Export Progress|Import Progress|stored only|dark" | head -6

step "9 VIDEOS"
R=$(grab '^  - button "YouTube Mocks" \[ref'); [ -n "$R" ] && ab click "$R" > /dev/null
sleep 2.5
ab snapshot -c | grep -E "YouTube Mock Library|Mock 0" | head -3
echo "video card count: $(ab snapshot -c | grep -cE 'button "Practice Alongside')"

step "10 day mode toggle"
R=$(ab snapshot -i -c | grep -E 'button "Switch to day mode"' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/')
[ -n "$R" ] && ab click "$R" > /dev/null
sleep 1
ab eval "document.documentElement.className" | head -1
ab screenshot /tmp/day-mode-videos.png > /dev/null

step "11 mobile responsive (390x844)"
ab set viewport 390 844 > /dev/null
ab reload > /dev/null
sleep 3
ab eval "JSON.stringify({overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, bottomNav: !!document.querySelector('nav[aria-label=\"Primary\"]')})" | head -1
ab screenshot /tmp/mobile-dashboard.png > /dev/null

step "12 mobile: practice → part1 no overflow"
ab find role button click --name "Practice" > /dev/null 2>&1; sleep 1.5
ab find role button click --name "Part 1 Everyday Conversation" > /dev/null 2>&1; sleep 2
ab eval "JSON.stringify({overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth})" | head -1
ab screenshot /tmp/mobile-part1.png > /dev/null

step "13 sticky footer check (short page)"
ab find role button click --name "Home" > /dev/null 2>&1; sleep 1.5
ab eval "const f=document.querySelector('footer'); const b=document.body; JSON.stringify({footerExists: !!f, footerAtBottom: f ? f.getBoundingClientRect().bottom <= window.innerHeight + 2 : null, bodyH: b.scrollHeight, vh: window.innerHeight})" | head -1

step "14 page errors"
ab errors | head -6
echo "(tour end)"
