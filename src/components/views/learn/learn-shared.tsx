"use client";

/**
 * Shared building blocks for the Learn views (problems, techniques, tips):
 * status model, accordion reveal, content normalization and practice drills.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/shared/page-kit";
import {
  Activity,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import {
  PART1_TOPICS,
  PART2_CARDS,
  PART3_TOPICS,
  pickRandom,
  type CoreArea,
  type CueCard,
  type OriginalProblem,
  type Question,
  type TechniqueSection,
  type Tip,
} from "@/lib/data/content";
import type { ProblemState } from "@/lib/store/progress";

// ---------------------------------------------------------------------------
// Problem / area status model (border + text + icon, never color alone)
// ---------------------------------------------------------------------------

export type StatusKey = "not-started" | "in-practice" | "ready-to-check" | "kept-fresh";

interface StatusMeta {
  label: string;
  tone: "neutral" | "brand" | "warning" | "success";
  icon: LucideIcon;
}

export const STATUS_META: Record<StatusKey, StatusMeta> = {
  "not-started": { label: "Not Started", tone: "neutral", icon: Circle },
  "in-practice": { label: "In Practice", tone: "brand", icon: Activity },
  "ready-to-check": { label: "Ready to Check", tone: "warning", icon: ClipboardCheck },
  "kept-fresh": { label: "Kept Fresh", tone: "success", icon: CheckCircle2 },
};

const STATUS_TONE_CLASS: Record<StatusKey, string> = {
  "not-started": "border-border text-muted-foreground",
  "in-practice": "border-brand-bright/45 text-brand-bright",
  "ready-to-check": "border-warning/50 text-warning",
  "kept-fresh": "border-success/50 text-success",
};

export function ProblemStatusPill({ status, className }: { status: StatusKey; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <StatusPill tone={meta.tone} icon={<Icon className="h-3 w-3" aria-hidden />} className={className}>
      {meta.label}
    </StatusPill>
  );
}

/** Compact icon-only status for tight mobile rows (label exposed to assistive tech). */
export function ProblemStatusDot({ status, className }: { status: StatusKey; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border",
        STATUS_TONE_CLASS[status],
        className
      )}
      role="img"
      aria-label={meta.label}
      title={meta.label}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}

/** A problem's display status from its store entry (missing entry = Not Started). */
export function problemDisplayStatus(state: ProblemState | undefined): StatusKey {
  if (!state) return "not-started";
  switch (state.status) {
    case "ready-to-check":
      return "ready-to-check";
    case "kept-fresh":
      return "kept-fresh";
    case "practicing":
      return "in-practice";
    default:
      return state.occurrences > 0 ? "in-practice" : "not-started";
  }
}

/** An area's summary status across its problems, plus how many are active. */
export function areaDisplayStatus(
  area: CoreArea,
  problems: Record<string, ProblemState>
): { status: StatusKey; touched: number } {
  const keys = area.problemIds
    .map((id) => problems[id])
    .filter((s): s is ProblemState => Boolean(s))
    .map(problemDisplayStatus);
  let status: StatusKey = "not-started";
  if (keys.includes("ready-to-check")) status = "ready-to-check";
  else if (keys.includes("in-practice")) status = "in-practice";
  else if (keys.includes("kept-fresh")) status = "kept-fresh";
  return { status, touched: keys.filter((k) => k !== "not-started").length };
}

// ---------------------------------------------------------------------------
// Difficulty pill (supplied difficulty, neutral presentation)
// ---------------------------------------------------------------------------

export function DifficultyPill({ difficulty }: { difficulty: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
      <Gauge className="h-3 w-3" aria-hidden />
      {difficulty}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reveal — calm accordion via CSS grid-rows transition (no layout thrash)
// ---------------------------------------------------------------------------

export function Reveal({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content normalization (render-time cleanups; supplied text kept verbatim
// apart from stripping parser divider artifacts and rejoining split lines)
// ---------------------------------------------------------------------------

/** Strip decorative divider runs (e.g. "=====") the source parser left behind. */
export function cleanBody(body: string): string {
  return body
    .split("\n")
    .map((line) =>
      line
        .replace(/\s*[=\-_*~]{3,}\s*$/, "")
        .replace(/^\s*[=\-_*~]{3,}\s*/, "")
    )
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

export interface NormalizedTip {
  /** The rule itself (title, or title + continuation when the parser split a sentence). */
  title: string;
  /** Longer explanation when the supplied tip has one; null for pure rules. */
  body: string | null;
}

/**
 * Most supplied tips are title-only rules; some carry a body explanation.
 * Two tips were split mid-sentence by the parser (body starts lowercase,
 * title has no terminal punctuation) — those are rejoined into one rule.
 */
export function normalizeTip(tip: Tip): NormalizedTip {
  const title = tip.title.trim();
  const body = cleanBody(tip.body);
  if (body && /^[a-z]/.test(body) && !/[.!?…:]$/.test(title)) {
    return { title: `${title} ${body}`, body: null };
  }
  return { title, body: body.length > 0 ? body : null };
}

/** The Recovery category supplies short title + short action pairs. */
export function isRecoveryCategory(name: string): boolean {
  return /recovery/i.test(name);
}

// ---------------------------------------------------------------------------
// Area includes most relevant to one detailed problem (token overlap match)
// ---------------------------------------------------------------------------

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

export function relevantIncludes(problem: OriginalProblem, area: CoreArea): string[] {
  const titleTokens = new Set(tokenize(problem.title));
  const matches = area.includes.filter((inc) => {
    const tokens = tokenize(inc);
    const overlap = tokens.filter((t) => titleTokens.has(t)).length;
    return tokens.length > 0 && overlap > 0 && overlap / tokens.length >= 0.34;
  });
  return matches.length > 0 ? matches : area.includes;
}

// ---------------------------------------------------------------------------
// Why-it-happens framing — 1–2 calm glue sentences per area, derived from the
// supplied area names and includes lists (no invented symptoms or scores)
// ---------------------------------------------------------------------------

export const WHY_FRAMING: Record<string, string> = {
  area1:
    "Conversational answers come from treating each question as a small exchange, not a task to fill. When the habit is a one-word reply or a padded mini-essay, the change is expecting a reason and one real detail from yourself — nothing more.",
  area2:
    "This is a precision issue rather than a vocabulary-size issue: words are available, but the habit is to reach for the safest general ones. Precision grows from practicing specific replacements and collocations inside real answers.",
  area3:
    "Usually the word is already known — it is simply not available under time pressure. That makes this a retrieval issue, not a knowledge gap, and retrieval responds to paraphrasing and describing-around practice.",
  area4:
    "These forms are typically known from study but not yet stable in spontaneous speech, so the safest structures get reused. Accuracy and variety grow when a small set of structures is practiced inside real answers.",
  area5:
    "This is the classic automaticity gap: grammar that is known but breaks during spontaneous speaking, especially under pressure or speed. The route forward is retrieval practice in short, real answers rather than more study.",
  area6:
    "Clear speech comes from a set of trainable habits — individual sounds, word stress, sentence stress, rhythm and chunking — not from changing accent. Working on one recurring feature at a time is what makes progress visible.",
  area7:
    "Fillers, long pauses and repetitions usually mark the moments when planning happens out loud. The aim is not speed — it is controlling where and how you pause, so planning happens silently.",
  area8:
    "The ideas usually exist; what is missing under time pressure is sequence and elaboration — a clear path through the answer with room for detail. Organization improves fastest when practiced as a simple structure for each part.",
  area9:
    "Abstract Part 3 questions ask for explanation moves — cause and effect, comparison, examples, speculation — that everyday conversation rarely demands. These moves can be practiced directly, one at a time.",
  area10:
    "Prepared language only transfers to new questions if flexibility is trained on purpose. Paraphrasing, re-answering and changing angle are what turn memorized material into usable material.",
  area11:
    "Listening, adapting and repairing in real time is a separate skill from producing prepared speech. It grows from practice that rewards responding to the actual question, not the expected one.",
  area12:
    "Translating sentence by sentence overloads working memory, so formulation slows and can break down. The long-term fix is practicing directly in English; the short-term fix is lightening the planning load.",
  area13:
    "Over-monitoring competes with composing: attention spent checking every word is attention not available for the idea. Confidence grows from finishing answers and reviewing them afterwards, not from perfecting them mid-sentence.",
  area14:
    "Evaluation pressure changes how familiar skills run — many speakers are stable in comfortable practice and shakier in test conditions. Practicing under mild, increasing pressure is what closes that gap.",
};

// ---------------------------------------------------------------------------
// Practice drills — which part each area is best drilled in
// ---------------------------------------------------------------------------

/** Part of the test used for the problem's practice activity. */
export const AREA_DRILL: Record<string, 1 | 2 | 3> = {
  area1: 1,
  area2: 3,
  area3: 1,
  area4: 1,
  area5: 1,
  area6: 1,
  area7: 3,
  area8: 2,
  area9: 3,
  area10: 3,
  area11: 3,
  area12: 1,
  area13: 1,
  area14: 3,
};

export type Drill =
  | { kind: "q"; part: 1 | 3; topicId: string; topicTitle: string; question: Question }
  | { kind: "card"; card: CueCard };

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function pickAt<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

/** Deterministic first drill (stable across server render and hydration). */
export function initialDrill(areaId: string, seed: string): Drill {
  const part = AREA_DRILL[areaId] ?? 1;
  if (part === 2) {
    return { kind: "card", card: pickAt(PART2_CARDS, hashString(seed)) };
  }
  const topics: { id: string; title: string; questions: Question[] }[] =
    part === 1 ? PART1_TOPICS : PART3_TOPICS;
  const topic = pickAt(topics, hashString(`${seed}::topic`));
  const question = pickAt(topic.questions, hashString(`${seed}::q`));
  return {
    kind: "q",
    part: part === 1 ? 1 : 3,
    topicId: topic.id,
    topicTitle: topic.title,
    question,
  };
}

/** Random replacement drill for the "New question / New card" shuffle. */
export function shuffleDrill(areaId: string, exclude: Drill): Drill {
  const part = AREA_DRILL[areaId] ?? 1;
  if (part === 2) {
    const pool = PART2_CARDS.filter(
      (c) => !(exclude.kind === "card" && exclude.card.id === c.id)
    );
    const [card] = pickRandom(pool.length > 0 ? pool : PART2_CARDS, 1);
    return { kind: "card", card };
  }
  const topics: { id: string; title: string; questions: Question[] }[] =
    part === 1 ? PART1_TOPICS : PART3_TOPICS;
  const entries: { topicId: string; topicTitle: string; question: Question }[] = [];
  for (const t of topics) {
    for (const q of t.questions) {
      entries.push({ topicId: t.id, topicTitle: t.title, question: q });
    }
  }
  const pool = entries.filter(
    (e) => !(exclude.kind === "q" && exclude.question.id === e.question.id)
  );
  const [picked] = pickRandom(pool.length > 0 ? pool : entries, 1);
  return { kind: "q", part: part === 1 ? 1 : 3, ...picked };
}

// ---------------------------------------------------------------------------
// Technique sections rendering (supplied labels + bodies, all preserved)
// ---------------------------------------------------------------------------

const PRACTICE_LABELS = new Set([
  "Practice",
  "TRY",
  "DISCOVER",
  "PRACTICE",
  "BUILD",
  "Try",
  "Discover",
  "Build",
  "Procedure",
  "Process",
  "Basic method",
  "IELTS adaptation",
  "Correct cycle",
  "Pronunciation loop",
]);

const CAUTION_LABELS = new Set([
  "Common mistake",
  "Avoid",
  "Do not",
  "Bad",
  "Avoid artificial phrases like",
  "Do not think",
]);

function labelTint(label: string): string {
  if (CAUTION_LABELS.has(label)) return "text-warning";
  if (PRACTICE_LABELS.has(label)) return "text-brand-bright";
  return "text-muted-foreground";
}

/**
 * Renders every supplied section of a technique. Short labels become small
 * tinted eyebrows; long labels (sentence-like ones from the source material)
 * render as normal-case lead-ins so they stay readable.
 */
export function TechniqueSections({ sections }: { sections: TechniqueSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section, i) => {
        const body = cleanBody(section.body);
        if (!body) return null;
        const long = section.label.length > 28;
        return (
          <div key={`${section.label}-${i}`}>
            <div
              className={cn(
                long
                  ? "text-sm font-semibold tracking-tight text-foreground"
                  : cn("text-[11px] font-semibold tracking-[0.12em] uppercase", labelTint(section.label))
              )}
            >
              {section.label}
            </div>
            <p
              className={cn(
                "mt-1 text-sm leading-relaxed whitespace-pre-line",
                long ? "text-muted-foreground" : "text-foreground/90"
              )}
            >
              {body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
