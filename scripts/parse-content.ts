/**
 * IELTStar Speaking Lab — Master Content Parser
 * Reads the supplied master TXT and produces structured JSON data files.
 * PRESERVES ALL SUPPLIED CONTENT — no replacement, no shortening.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const SRC = "/home/z/my-project/upload/IELTStar_Speaking_Lab_Master_Content.txt";
const OUT = "/home/z/my-project/src/lib/data/generated";
mkdirSync(OUT, { recursive: true });

const text = readFileSync(SRC, "utf8");
const lines = text.split("\n");

function sectionRange(startMarker: string, endMarker: string): [number, number] {
  const s = lines.findIndex((l) => l.includes(startMarker));
  const e = lines.findIndex((l, i) => i > s && l.includes(endMarker));
  return [s + 1, e === -1 ? lines.length : e];
}

const clean = (s: string) =>
  s.replace(/\r/g, "").replace(/^\\+/, "").replace(/\s+$/g, "").trim();

// ---------------------------------------------------------------------------
// VIDEOS (30)
// ---------------------------------------------------------------------------
{
  const [s, e] = sectionRange("A. SPEAKING MOCK VIDEO LINKS", "B. PROBLEM TAXONOMY");
  const videos: { id: string; url: string; label: string }[] = [];
  const re = /(https:\/\/youtu\.be\/([A-Za-z0-9_\-]+)(\?si=\S+)?)\s*-\s*(.+)$/i;
  for (let i = s; i < e; i++) {
    const m = lines[i].match(re);
    if (m) videos.push({ id: `v${videos.length + 1}`, url: m[1], label: m[4].trim() });
  }
  console.log("videos:", videos.length);
  if (videos.length !== 30) throw new Error("Expected 30 videos, got " + videos.length);
  writeFileSync(`${OUT}/videos.json`, JSON.stringify(videos, null, 1));
}

// ---------------------------------------------------------------------------
// PART 1 — 50 topics x 5 questions
// ---------------------------------------------------------------------------
type P1Topic = {
  id: string;
  title: string;
  cluster: string;
  questions: { id: string; prompt: string }[];
};
{
  const [s, e] = sectionRange("C. PART 1 — 50 TOPICS / QUESTIONS", "D. PART 1 — HIGH-LEVEL LEXICAL");
  const topics: P1Topic[] = [];
  let cur: P1Topic | null = null;
  // Cluster 1's header only appears in the vocabulary section; the supplied
  // name is "Primary Biographical and Foundational Domains" (topics 1–4).
  let cluster = "Primary Biographical and Foundational Domains";
  const pushQ = (raw: string) => {
    if (!cur || !raw) return;
    // some lines contain two questions joined without a line break
    const parts = raw.split(/(?<=\?)\s*(?=[A-Z])/).map(clean).filter(Boolean);
    for (const p of parts) {
      cur.questions.push({ id: `${cur.id}-q${cur.questions.length + 1}`, prompt: p });
    }
  };
  for (let i = s; i < e; i++) {
    const l = lines[i].replace(/\r/g, "");
    if (!l.trim()) continue;
    if (/^-{10,}$/.test(l.trim())) continue;
    const cl = l.match(/^Thematic Cluster \d+:\s*(.+)$/);
    if (cl) {
      cluster = cl[1].trim();
      continue;
    }
    const tm = l.match(/^(\d+)\.\s+(.+)$/);
    if (tm && tm[1] === String(topics.length + 1)) {
      cur = { id: `p1t${tm[1]}`, title: tm[2].trim(), cluster, questions: [] };
      topics.push(cur);
      continue;
    }
    pushQ(l);
  }
  console.log(
    "part1 topics:", topics.length,
    "questions:", topics.reduce((a, t) => a + t.questions.length, 0)
  );
  if (topics.length !== 50) throw new Error("Expected 50 Part 1 topics, got " + topics.length);
  for (const t of topics) {
    if (t.questions.length !== 5)
      throw new Error(`Part 1 topic ${t.id} "${t.title}" has ${t.questions.length} questions`);
  }
  writeFileSync(`${OUT}/part1-topics.json`, JSON.stringify(topics, null, 1));
}

// ---------------------------------------------------------------------------
// PART 1 VOCABULARY — 50 topics x 10 items
// ---------------------------------------------------------------------------
type VocabItem = { phrase: string; level: string; definition: string; example?: string };
{
  const [s, e] = sectionRange("D. PART 1 — HIGH-LEVEL LEXICAL", "E. PART 2 — 30 CUE CARDS");
  const map: Record<string, VocabItem[]> = {};
  let curTopic = "";
  const entryRe = /^(.+?)\s*\((B2|C1|C2)\):\s*(.+)$/;
  for (let i = s; i < e; i++) {
    const l = clean(lines[i]);
    if (!l) continue;
    if (/^Thematic Cluster \d+:/.test(l)) continue;
    const tm = l.match(/^(\d+)\.\s+(.+)$/);
    if (tm && /^\d+$/.test(tm[1]) && Number(tm[1]) >= 1 && Number(tm[1]) <= 50) {
      curTopic = `p1t${tm[1]}`;
      if (!map[curTopic]) map[curTopic] = [];
      continue;
    }
    const em = l.match(entryRe);
    if (em && curTopic) {
      map[curTopic].push({ phrase: em[1].trim(), level: em[2], definition: em[3].trim() });
    } else if (curTopic && map[curTopic]?.length) {
      // continuation of previous definition (wrapped lines)
      const last = map[curTopic][map[curTopic].length - 1];
      last.definition = (last.definition + " " + l).replace(/\s+/g, " ");
    }
  }
  const total = Object.values(map).reduce((a, v) => a + v.length, 0);
  console.log("part1 vocab topics:", Object.keys(map).length, "items:", total);
  if (Object.keys(map).length !== 50) throw new Error("Expected 50 vocab topics");
  for (const [k, v] of Object.entries(map))
    if (v.length !== 10) throw new Error(`Part1 vocab ${k} has ${v.length} items`);
  writeFileSync(`${OUT}/part1-vocab.json`, JSON.stringify(map, null, 1));
}

// ---------------------------------------------------------------------------
// PART 2 — 30 cue cards
// ---------------------------------------------------------------------------
type CueCard = {
  id: string;
  title: string;
  prompt: string;
  bullets: string[];
  finalPoint: string;
  domain: string;
};
{
  const [s, e] = sectionRange("E. PART 2 — 30 CUE CARDS", "F. PART 2 — NATURAL VOCABULARY");
  const cards: CueCard[] = [];
  let domain = "";
  let cur: Partial<CueCard> | null = null;
  let mode: "none" | "bullets" = "none";
  for (let i = s; i < e; i++) {
    const l = clean(lines[i]);
    if (!l) continue;
    const dm = l.match(/^Domain \d+:\s*(.+)$/);
    if (dm) { domain = dm[1]; continue; }
    const pm = l.match(/^Prompt (\d+):\s*(.+)$/);
    if (pm) {
      cur = { id: `p2c${pm[1]}`, title: pm[2], domain, bullets: [] };
      cards.push(cur as CueCard);
      mode = "none";
      continue;
    }
    if (!cur) continue;
    if (l.startsWith("Main Prompt:")) { cur.prompt = l.replace("Main Prompt:", "").trim(); continue; }
    if (l.startsWith("Checkpoints (You should say):")) { mode = "bullets"; continue; }
    if (l.startsWith("Terminal Evaluation:")) { cur.finalPoint = l.replace("Terminal Evaluation:", "").trim(); mode = "none"; continue; }
    if (mode === "bullets" && cur) (cur.bullets as string[]).push(l);
  }
  console.log("part2 cue cards:", cards.length);
  if (cards.length !== 30) throw new Error("Expected 30 cue cards, got " + cards.length);
  for (const c of cards) {
    if (!c.prompt || !c.bullets?.length || !c.finalPoint)
      throw new Error(`Cue card ${c.id} incomplete`);
  }
  writeFileSync(`${OUT}/part2-cards.json`, JSON.stringify(cards, null, 1));
}

// ---------------------------------------------------------------------------
// PART 2 VOCABULARY — 30 cards x 10 chunks
// ---------------------------------------------------------------------------
{
  const [s, e] = sectionRange("F. PART 2 — NATURAL VOCABULARY", "G. PART 3 — 50 DISCUSSION TOPICS");
  const map: Record<string, VocabItem[]> = {};
  let curCard = "";
  let inVocab = false;
  const entryRe = /^(.+?)\s*\((B2|C1|C2)\):\s*(.+)$/;
  for (let i = s; i < e; i++) {
    const l = clean(lines[i]);
    if (!l) continue;
    const pm = l.match(/^Prompt (\d+):\s*(.+)$/);
    if (pm) { curCard = `p2c${pm[1]}`; inVocab = false; if (!map[curCard]) map[curCard] = []; continue; }
    if (l.startsWith("Natural Vocabulary & Chunks:")) { inVocab = true; continue; }
    if (!inVocab || !curCard) continue;
    const em = l.match(entryRe);
    if (em) map[curCard].push({ phrase: em[1].trim(), level: em[2], definition: em[3].trim() });
    else if (map[curCard]?.length) {
      const last = map[curCard][map[curCard].length - 1];
      last.definition = (last.definition + " " + l).replace(/\s+/g, " ");
    }
  }
  const total = Object.values(map).reduce((a, v) => a + v.length, 0);
  console.log("part2 vocab cards:", Object.keys(map).length, "items:", total);
  if (Object.keys(map).length !== 30) throw new Error("Expected 30 vocab cards");
  for (const [k, v] of Object.entries(map))
    if (v.length !== 10) throw new Error(`Part2 vocab ${k} has ${v.length} items`);
  writeFileSync(`${OUT}/part2-vocab.json`, JSON.stringify(map, null, 1));
}

// ---------------------------------------------------------------------------
// PART 3 — 50 topics x 4 questions + cognitive function
// ---------------------------------------------------------------------------
type P3Topic = {
  id: string;
  title: string;
  domain: string;
  questions: { id: string; prompt: string }[];
  cognitiveFunction: string;
};
{
  const [s, e] = sectionRange("G. PART 3 — 50 DISCUSSION TOPICS", "H. PART 3 — VOCABULARY");
  const topics: P3Topic[] = [];
  let domain = "";
  let cur: P3Topic | null = null;
  let funcBuf: string[] = [];

  const flushFunc = () => {
    if (cur && funcBuf.length) {
      cur.cognitiveFunction = funcBuf.join(" ").replace(/\s+/g, " ").trim();
    }
    funcBuf = [];
  };

  const startTopic = (num: number, title: string) => {
    flushFunc();
    cur = { id: `p3t${num}`, title, domain, questions: [], cognitiveFunction: "" };
    topics.push(cur);
  };

  const pushQ = (raw: string) => {
    if (!cur || !raw) return;
    cur.questions.push({ id: `${cur.id}-q${cur.questions.length + 1}`, prompt: raw });
  };

  // handle a compressed line: contains several topics as a flat "•"-separated stream.
  // Layout per topic: [header]•q1•q2•q3•q4?Function.NN2Name — the next topic's header
  // lives at the tail of the previous 4th question segment.
  const handleCompressed = (line: string, startNum: number) => {
    const rest = line.replace(
      /^Topic #\s*Topic Name\s*Representative Authentic Part 3 Questions\s*Target Cognitive & Linguistic Function\s*/,
      ""
    );
    const segs = rest.split("•").map((x) => x.trim());
    let num = startNum;
    let idx = 0;
    let pendingHeader: string | null = null;
    while (num <= 50) {
      let head: string;
      if (pendingHeader !== null) {
        head = pendingHeader;
        pendingHeader = null;
      } else {
        head = segs[idx] || "";
        idx += 1;
      }
      const hm = head.match(new RegExp(`${num}([A-Z][A-Za-z0-9&, '"\\/\\-]*)$`));
      if (!hm) throw new Error(`Compressed head mismatch at topic ${num}: "${head.slice(0, 80)}"`);
      startTopic(num, hm[1].trim());
      for (let k = 0; k < 4; k++) {
        let q = segs[idx] || "";
        idx += 1;
        if (k === 3) {
          const lastQ = q.lastIndexOf("?");
          if (lastQ >= 0) {
            const tail = q.slice(lastQ + 1);
            const nextPos = num + 1 <= 50 ? tail.search(new RegExp(`\\b${num + 1}[A-Z]`)) : -1;
            if (nextPos >= 0) {
              pendingHeader = tail.slice(nextPos).trim();
              const func = tail.slice(0, nextPos).trim();
              if (func) funcBuf.push(func.replace(/\.$/, "").trim());
              q = q.slice(0, lastQ + 1);
              flushFunc();
            } else {
              const func = tail.trim();
              if (func) {
                funcBuf.push(func.replace(/\.$/, "").trim());
                flushFunc();
              }
              q = q.slice(0, lastQ + 1);
            }
          }
        }
        pushQ(q.trim());
      }
      num += 1;
      if (pendingHeader === null && idx >= segs.length) break;
      if (pendingHeader === null && idx < segs.length)
        throw new Error(`Compressed alignment broken at topic ${num}`);
    }
  };

  for (let i = s; i < e; i++) {
    const raw = lines[i].replace(/\r/g, "");
    const l = raw.trim();
    if (!l) continue;
    if (/^-{10,}$/.test(l)) continue;
    const dm = l.match(/^Thematic Domain \d+:\s*(.+)$/);
    if (dm) { domain = dm[1].trim(); continue; }
    if (l === "Part 3 Questions:") continue;
    const hasBullet = l.includes("•");
    const startsWithNum = /^\d{1,2}[A-Z]/.test(l.replace(/^Topic #\s*/, ""));
    if (hasBullet && (startsWithNum || /^Topic #/.test(l))) {
      handleCompressed(l, topics.length + 1);
      continue;
    }
    if (l.startsWith("•")) {
      pushQ(l.replace(/^•\s*/, "").trim());
      continue;
    }
    // multi-line topic header: "1\tPrimary & Secondary Schooling" or "1   Name"
    const tm = l.match(/^(\d{1,2})[\t]\s*(.+?)\s*$/) || l.match(/^(\d{1,2})\s{2,}(.+?)\s*$/);
    if (tm && Number(tm[1]) === topics.length + 1 && !hasBullet) {
      startTopic(Number(tm[1]), tm[2].trim());
      continue;
    }
    // column header line
    if (l.includes("Topic #") && l.includes("Topic Name")) continue;
    // otherwise: cognitive function text for current topic
    if (cur && !hasBullet) { funcBuf.push(l.trim()); flushFunc(); continue; }
  }
  flushFunc();
  console.log("part3 topics:", topics.length, "questions:", topics.reduce((a, t) => a + t.questions.length, 0));
  if (topics.length !== 50) throw new Error("Expected 50 Part 3 topics, got " + topics.length);
  for (const t of topics) {
    if (t.questions.length !== 4)
      throw new Error(`Part3 topic ${t.id} "${t.title}" has ${t.questions.length} questions`);
    if (!t.cognitiveFunction) console.warn(`WARN: ${t.id} "${t.title}" missing function`);
  }
  writeFileSync(`${OUT}/part3-topics.json`, JSON.stringify(topics, null, 1));
}

// ---------------------------------------------------------------------------
// PART 3 VOCABULARY — 50 topics x 6 items (tab separated, multi-line)
// ---------------------------------------------------------------------------
{
  const [s, e] = sectionRange("H. PART 3 — VOCABULARY", "END OF ORIGINAL USER MATERIALS");
  const map: Record<string, VocabItem[]> = {};
  let curTopic = "";
  let cur: VocabItem | null = null;
  let needDef = false;
  let needEx = false;
  for (let i = s; i < e; i++) {
    const l = lines[i].replace(/\r/g, "");
    const t = l.trim();
    if (!t || t === "Part 3 Vocabulary:") continue;
    const tm = t.match(/^Topic (\d+):\s*(.+)$/);
    if (tm) {
      curTopic = `p3t${tm[1]}`;
      if (!map[curTopic]) map[curTopic] = [];
      cur = null; needDef = false; needEx = false;
      continue;
    }
    if (/^Domain \d+:/.test(t)) continue;
    if (/^CEFR Level\t/.test(l)) continue;
    // domain intro sentences (plain prose without tabs) — skip
    if (!l.includes("\t") && !cur) continue;
    const tabs = l.split("\t").map((x) => x.trim());
    if (/^(B2|C1|C2)$/.test(tabs[0])) {
      cur = { phrase: tabs[1] || "", level: tabs[0], definition: tabs[2] || "", example: tabs[3] || "" };
      map[curTopic].push(cur);
      needDef = !cur.definition;
      needEx = !cur.example;
      continue;
    }
    if (cur) {
      if (needDef && t) { cur.definition = t; needDef = false; needEx = !cur.example; continue; }
      if (needEx && t) { cur.example = t; needEx = false; continue; }
    }
  }
  const total = Object.values(map).reduce((a, v) => a + v.length, 0);
  console.log("part3 vocab topics:", Object.keys(map).length, "items:", total);
  if (Object.keys(map).length !== 50) throw new Error("Expected 50 p3 vocab topics, got " + Object.keys(map).length);
  for (const [k, v] of Object.entries(map)) {
    if (v.length !== 6) throw new Error(`Part3 vocab ${k} has ${v.length} items`);
    for (const item of v) {
      if (!item.definition || !item.example) throw new Error(`Part3 vocab ${k} "${item.phrase}" incomplete`);
    }
  }
  writeFileSync(`${OUT}/part3-vocab.json`, JSON.stringify(map, null, 1));
}

// ---------------------------------------------------------------------------
// PROBLEMS — original 36
// ---------------------------------------------------------------------------
{
  const [s, e] = sectionRange("B. PROBLEM TAXONOMY + ORIGINAL 36-PROBLEM LIST", "C. PART 1 — 50 TOPICS");
  const problems: {
    id: string; num: number; title: string; difficulty: string; note: string;
  }[] = [];
  for (let i = s; i < e; i++) {
    const l = lines[i].replace(/\r/g, "");
    if (!l.trim()) continue;
    const m = l.match(/^(\d+)\t(.+?)\t(🟢|🟡|🟠|🔴)\s*(.+?)\t(.+)$/);
    if (m) {
      problems.push({
        id: `prob${m[1]}`,
        num: Number(m[1]),
        title: m[2].trim(),
        difficulty: m[4].trim(),
        note: m[5].trim(),
      });
    }
  }
  console.log("problems:", problems.length);
  if (problems.length !== 36) throw new Error("Expected 36 problems, got " + problems.length);
  writeFileSync(`${OUT}/problems.json`, JSON.stringify(problems, null, 1));
}

// ---------------------------------------------------------------------------
// TECHNIQUES — 50 (full educational content)
// ---------------------------------------------------------------------------
type Technique = {
  id: string;
  title: string;
  sections: { label: string; body: string }[];
};
{
  const [s, e] = sectionRange("IELTSTAR SPEAKING — TECHNIQUES", "END OF TECHNIQUES");
  const techs: Technique[] = [];
  let cur: Technique | null = null;
  let label = "";
  let buf: string[] = [];
  const flush = () => {
    if (cur && label) {
      const body = buf.join(" ").replace(/\s+/g, " ").trim();
      if (body) cur.sections.push({ label, body });
    }
    buf = [];
  };
  for (let i = s; i < e; i++) {
    const l = lines[i].replace(/\r/g, "").trim();
    if (!l) continue;
    if (/^-{10,}$/.test(l)) continue;
    const tm = l.match(/^T(\d+)\.\s*(.+)$/);
    if (tm) {
      flush();
      cur = { id: `t${tm[1]}`, title: tm[2].trim(), sections: [] };
      techs.push(cur);
      label = "";
      continue;
    }
    const lm = l.match(/^([A-Z][A-Za-z0-9 ,'’\-\/&()\.]+):$/);
    if (lm && l.endsWith(":")) {
      flush();
      label = lm[1].trim();
      continue;
    }
    if (cur && !label) {
      // technique body without a label (e.g. T33)
      label = "Overview";
      buf.push(l);
      continue;
    }
    if (cur && label) buf.push(l);
  }
  flush();
  console.log("techniques:", techs.length);
  if (techs.length !== 50) throw new Error("Expected 50 techniques, got " + techs.length);
  for (const t of techs) if (!t.sections.length) throw new Error(`Technique ${t.id} has no sections`);
  writeFileSync(`${OUT}/techniques.json`, JSON.stringify(techs, null, 1));
}

// ---------------------------------------------------------------------------
// TIPS — 11 categories
// ---------------------------------------------------------------------------
type Tip = { title: string; body: string };
{
  const [s, e] = sectionRange("IELTSTAR SPEAKING — TIPS", "END OF TIPS");
  const categories: { key: string; name: string; tips: Tip[] }[] = [];
  let curCat: { key: string; name: string; tips: Tip[] } | null = null;
  let curTip: Tip | null = null;
  const catNames: Record<string, string> = {
    A: "General", B: "Part 1", C: "Part 2", D: "Part 3", E: "Vocabulary",
    F: "Fluency", G: "Pronunciation", H: "Recovery", I: "Confidence",
    J: "Test Day", K: "Practice Quality",
  };
  for (let i = s; i < e; i++) {
    const l = lines[i].replace(/\r/g, "").trim();
    if (!l) continue;
    if (/^-{10,}$/.test(l)) continue;
    const cm = l.match(/^([A-K])\.\s+(.+)$/);
    if (cm && catNames[cm[1]] && l === `${cm[1]}. ${cm[2]}`) {
      curCat = { key: cm[1], name: catNames[cm[1]], tips: [] };
      categories.push(curCat);
      curTip = null;
      continue;
    }
    if (!curCat) continue;
    // recovery category: "Forgot a word?" / "→ Describe it."
    if (curCat.key === "H") {
      if (/^→/.test(l)) {
        if (curTip) curTip.body = l.replace(/^→\s*/, "").trim();
        continue;
      }
      curTip = { title: l, body: "" };
      curCat.tips.push(curTip);
      continue;
    }
    const tm = l.match(/^(\d+)\.\s*(.+)$/);
    if (tm) {
      const content = tm[2].trim();
      const firstSentence = content.split(/(?<=\.)\s/);
      curTip = { title: firstSentence[0], body: firstSentence.slice(1).join(" ") };
      curCat.tips.push(curTip);
      continue;
    }
    if (curTip && l) {
      curTip.body = (curTip.body ? curTip.body + " " : "") + l;
    }
  }
  console.log("tip categories:", categories.length, "tips:", categories.reduce((a, c) => a + c.tips.length, 0));
  if (categories.length !== 11) throw new Error("Expected 11 tip categories, got " + categories.length);
  writeFileSync(`${OUT}/tips.json`, JSON.stringify(categories, null, 1));
}

console.log("\nAll content parsed successfully. Output in", OUT);
