/**
 * IELTStar Speaking Lab — Content module.
 * All educational content is loaded verbatim from the generated JSON
 * (parsed from the supplied master materials). Derived structures
 * (14 core problem areas, consolidated technique groups, diagnosis engine)
 * organize the supplied content without replacing it.
 */
import part1TopicsRaw from "./generated/part1-topics.json";
import part1VocabRaw from "./generated/part1-vocab.json";
import part2CardsRaw from "./generated/part2-cards.json";
import part2VocabRaw from "./generated/part2-vocab.json";
import part3TopicsRaw from "./generated/part3-topics.json";
import part3VocabRaw from "./generated/part3-vocab.json";
import problemsRaw from "./generated/problems.json";
import techniquesRaw from "./generated/techniques.json";
import tipsRaw from "./generated/tips.json";
import videosRaw from "./generated/videos.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Question {
  id: string;
  prompt: string;
}

export interface Part1Topic {
  id: string;
  title: string;
  cluster: string;
  questions: Question[];
}

export interface VocabItem {
  phrase: string;
  level: string;
  definition: string;
  example?: string;
}

export interface CueCard {
  id: string;
  title: string;
  prompt: string;
  bullets: string[];
  finalPoint: string;
  domain: string;
}

export interface Part3Topic {
  id: string;
  title: string;
  domain: string;
  questions: Question[];
  cognitiveFunction: string;
}

export interface OriginalProblem {
  id: string;
  num: number;
  title: string;
  difficulty: string;
  note: string;
}

export interface TechniqueSection {
  label: string;
  body: string;
}

export interface Technique {
  id: string;
  title: string;
  sections: TechniqueSection[];
}

export interface Tip {
  title: string;
  body: string;
}

export interface TipCategory {
  key: string;
  name: string;
  tips: Tip[];
}

export interface VideoEntry {
  id: string;
  url: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Content banks (verbatim from supplied materials)
// ---------------------------------------------------------------------------

export const PART1_TOPICS = part1TopicsRaw as Part1Topic[];
export const PART1_VOCAB = part1VocabRaw as Record<string, VocabItem[]>;
export const PART2_CARDS = part2CardsRaw as CueCard[];
export const PART2_VOCAB = part2VocabRaw as Record<string, VocabItem[]>;
export const PART3_TOPICS = part3TopicsRaw as Part3Topic[];
export const PART3_VOCAB = part3VocabRaw as Record<string, VocabItem[]>;
export const ORIGINAL_PROBLEMS = problemsRaw as OriginalProblem[];
export const TECHNIQUES = techniquesRaw as Technique[];
export const TIP_CATEGORIES = tipsRaw as TipCategory[];
export const VIDEOS = videosRaw as VideoEntry[];

export const CONTENT_STATS = {
  part1Topics: PART1_TOPICS.length,
  part1Questions: PART1_TOPICS.reduce((a, t) => a + t.questions.length, 0),
  part2Cards: PART2_CARDS.length,
  part3Topics: PART3_TOPICS.length,
  part3Questions: PART3_TOPICS.reduce((a, t) => a + t.questions.length, 0),
  problems: ORIGINAL_PROBLEMS.length,
  techniques: TECHNIQUES.length,
  tips: TIP_CATEGORIES.reduce((a, c) => a + c.tips.length, 0),
  videos: VIDEOS.length,
};

// ---------------------------------------------------------------------------
// The 8 problem layers (supplied taxonomy)
// ---------------------------------------------------------------------------

export const PROBLEM_LAYERS: { name: string; items: string }[] = [
  { name: "Layer 1 — Language knowledge", items: "Vocabulary • Grammar • Pronunciation • Collocations • Syntax" },
  { name: "Layer 2 — Automatic access", items: "Lexical retrieval • Grammatical retrieval • Pronunciation automaticity • Processing speed" },
  { name: "Layer 3 — Discourse", items: "Idea generation • Organization • Elaboration • Coherence • Argumentation" },
  { name: "Layer 4 — Interaction", items: "Listening • Turn-taking • Response relevance • Repair • Clarification • Adaptation" },
  { name: "Layer 5 — Performance", items: "Fluency • Pace • Pausing • Intonation • Stress • Self-correction" },
  { name: "Layer 6 — Cognition", items: "Working-memory load • Planning • Attention allocation • L1 translation • Task difficulty" },
  { name: "Layer 7 — Affective factors", items: "Anxiety • Confidence • Fear of mistakes • Fear of judgment • Motivation • Self-image" },
  { name: "Layer 8 — Training ecosystem", items: "Exposure • Practice quality • Feedback quality • Repetition • Individualization • Transfer to spontaneous speech" },
];

// ---------------------------------------------------------------------------
// 14 core problem areas (supplied structure; original 36 problems preserved inside)
// ---------------------------------------------------------------------------

export interface CoreArea {
  id: string;
  index: number;
  name: string;
  includes: string[];
  problemIds: string[];
}

const AREA_INCLUDES: { name: string; includes: string[] }[] = [
  { name: "Answering Naturally & Concisely", includes: ["one-word / overly short answers", "unnecessary detail", "awkward answer openings", "answering with irrelevant material"] },
  { name: "Vocabulary Range & Precision", includes: ["repetitive basic vocabulary", "vague wording", "limited topic vocabulary", "over-formal vocabulary", "forced advanced words"] },
  { name: "Vocabulary Retrieval & Flexibility", includes: ["slow lexical retrieval", "tip-of-the-tongue problems", "weak paraphrasing", "inability to describe an unknown word"] },
  { name: "Grammar Accuracy & Variety", includes: ["basic grammar weaknesses", "tense consistency", "limited structure variety", "grammar errors"] },
  { name: "Grammar Automaticity", includes: ["grammar that is known but breaks during spontaneous speaking", "accuracy collapse under pressure or speed"] },
  { name: "Pronunciation & Intelligibility", includes: ["individual sounds", "word stress", "sentence stress", "rhythm", "chunking", "connected speech", "unclear speech"] },
  { name: "Fluency & Speech Control", includes: ["fillers", "long pauses", "repetitions", "unstable pace", "self-interruption", "breakdowns"] },
  { name: "Answer Organization & Development", includes: ["weak organization", "weak Part 2 development", "weak Part 3 development", "repetition", "limited elaboration"] },
  { name: "Idea Generation & Abstract Thinking", includes: ['"I don\'t know what to say"', "weak explanations", "weak examples", "poor cause/effect", "weak comparison", "weak future speculation", "weak qualification", "weak counterarguments"] },
  { name: "Spontaneity & Flexibility", includes: ["memorized answers", "formula dependence", "difficulty with unfamiliar questions", "inability to transfer prepared language to new questions"] },
  { name: "Real-Time Interaction & Repair", includes: ["follow-up difficulty", "clarification", "response relevance", "adapting after examiner changes", "repairing communication problems"] },
  { name: "L1 Translation & Processing Load", includes: ["sentence-by-sentence translation", "slow formulation", "working-memory overload", "excessive planning"] },
  { name: "Self-Monitoring & Confidence", includes: ["excessive self-correction", "perfectionism", "fear of mistakes", "over-monitoring", "negative self-evaluation"] },
  { name: "Performance Under Pressure", includes: ["test anxiety", "performance collapse", "evaluation pressure", "instability between comfortable practice and real test conditions"] },
];

const AREA_PROBLEM_MAP: number[][] = [
  [1, 2, 6, 7],        // 1 Answering Naturally & Concisely
  [3, 13, 14],         // 2 Vocabulary Range & Precision
  [15, 16, 23],        // 3 Vocabulary Retrieval & Flexibility
  [11, 12],            // 4 Grammar Accuracy & Variety
  [22, 35],            // 5 Grammar Automaticity
  [8, 9, 10, 32],      // 6 Pronunciation & Intelligibility
  [4, 30],             // 7 Fluency & Speech Control
  [17, 18, 19],        // 8 Answer Organization & Development
  [20, 31],            // 9 Idea Generation & Abstract Thinking
  [5, 21, 27],         // 10 Spontaneity & Flexibility
  [28, 29],            // 11 Real-Time Interaction & Repair
  [24, 25, 36],        // 12 L1 Translation & Processing Load
  [26, 34],            // 13 Self-Monitoring & Confidence
  [33],                // 14 Performance Under Pressure
];

export const CORE_AREAS: CoreArea[] = AREA_INCLUDES.map((a, i) => ({
  id: `area${i + 1}`,
  index: i + 1,
  name: a.name,
  includes: a.includes,
  problemIds: AREA_PROBLEM_MAP[i].map((n) => `prob${n}`),
}));

export const problemById = (id: string) => ORIGINAL_PROBLEMS.find((p) => p.id === id);
export const areaOfProblem = (problemId: string) =>
  CORE_AREAS.find((a) => a.problemIds.includes(problemId));

// ---------------------------------------------------------------------------
// Consolidated technique groups (all 50 supplied techniques preserved inside)
// ---------------------------------------------------------------------------

export interface TechniqueGroup {
  id: string;
  title: string;
  oneLine: string;
  category: string;
  techniqueIds: string[];
}

export const TECHNIQUE_GROUPS: TechniqueGroup[] = [
  {
    id: "tg1",
    title: "Build a natural Part 1 answer",
    oneLine: "Answer first, give one reason, then add a real detail — A.R.E. + direct answer + one-why.",
    category: "Part 1",
    techniqueIds: ["t1", "t2", "t3"],
  },
  {
    id: "tg2",
    title: "Make your language precise",
    oneLine: "Specificity upgrades, precision replacements and collocation blocks instead of vague words.",
    category: "Vocabulary",
    techniqueIds: ["t4", "t29", "t28"],
  },
  {
    id: "tg3",
    title: "Add nuance and contrast",
    oneLine: "Contrast patterns, specific → general moves, and finishing the thought after “it depends”.",
    category: "Development",
    techniqueIds: ["t5", "t6", "t19"],
  },
  {
    id: "tg4",
    title: "Build a Part 2 story",
    oneLine: "Story arc, keyword mapping, reflection, “what happened next?” and past → present → future.",
    category: "Part 2",
    techniqueIds: ["t7", "t8", "t9", "t10", "t11"],
  },
  {
    id: "tg5",
    title: "Develop a Part 3 idea",
    oneLine: "P.E.E.P., Why → How → Example, and Cause → Mechanism → Consequence.",
    category: "Part 3",
    techniqueIds: ["t12", "t13", "t14"],
  },
  {
    id: "tg6",
    title: "See more than one side",
    oneLine: "Stakeholder switch, trade-offs, exceptions and the five-direction idea generator.",
    category: "Part 3",
    techniqueIds: ["t15", "t16", "t17", "t18"],
  },
  {
    id: "tg7",
    title: "Keep speaking smoothly",
    oneLine: "Strategic pausing, chunking, natural stalling, filler replacement and controlled speed.",
    category: "Fluency",
    techniqueIds: ["t20", "t21", "t22", "t23", "t25"],
  },
  {
    id: "tg8",
    title: "Build fluency through repetition",
    oneLine: "The 4-3-2 method: same topic, gradually shorter, cleaner every time.",
    category: "Fluency",
    techniqueIds: ["t24"],
  },
  {
    id: "tg9",
    title: "Improve speech rhythm",
    oneLine: "Word stress, sentence stress, thought groups, shadowing and shadow → speak → compare.",
    category: "Pronunciation",
    techniqueIds: ["t31", "t32", "t33", "t34", "t50"],
  },
  {
    id: "tg10",
    title: "Recover a missing word",
    oneLine: "Circumlocution and Category → Function → Description keep the idea alive.",
    category: "Recovery",
    techniqueIds: ["t26", "t27", "t42"],
  },
  {
    id: "tg11",
    title: "Become more flexible",
    oneLine: "Paraphrase ladder, three-version answers, unexpected question transfer and opinion reversal.",
    category: "Spontaneity",
    techniqueIds: ["t30", "t35", "t36", "t37"],
  },
  {
    id: "tg12",
    title: "Handle mistakes calmly",
    oneLine: "One-mistake rule, delayed correction and repairing a small error once.",
    category: "Recovery",
    techniqueIds: ["t38", "t39", "t43"],
  },
  {
    id: "tg13",
    title: "Reframe and clarify",
    oneLine: "Bridges for lost ideas, asking for clarification and follow-up defense.",
    category: "Recovery",
    techniqueIds: ["t44", "t45", "t40"],
  },
  {
    id: "tg14",
    title: "Stay interactive",
    oneLine: "Answer → listen → adapt, and controlled disagreement language.",
    category: "Interaction",
    techniqueIds: ["t46", "t41"],
  },
  {
    id: "tg15",
    title: "Train for transfer",
    oneLine: "Same skill / new question, drill → immediate retry, and TDPB.",
    category: "Practice",
    techniqueIds: ["t47", "t48", "t49"],
  },
];

export const techniqueById = (id: string) => TECHNIQUES.find((t) => t.id === id);

// Techniques relevant to each core area (for problem detail pages)
const AREA_TECHNIQUES: Record<string, string[]> = {
  area1: ["tg1"],
  area2: ["tg2"],
  area3: ["tg10", "tg11"],
  area4: ["tg12"],
  area5: ["tg12", "tg7"],
  area6: ["tg9"],
  area7: ["tg7", "tg8"],
  area8: ["tg1", "tg4", "tg5"],
  area9: ["tg5", "tg6", "tg3"],
  area10: ["tg11"],
  area11: ["tg14", "tg13"],
  area12: ["tg7", "tg15"],
  area13: ["tg12", "tg11"],
  area14: ["tg8", "tg15"],
};

export const techniquesForArea = (areaId: string): TechniqueGroup[] =>
  (AREA_TECHNIQUES[areaId] || [])
    .map((id) => TECHNIQUE_GROUPS.find((g) => g.id === id))
    .filter((g): g is TechniqueGroup => Boolean(g));

// ---------------------------------------------------------------------------
// Diagnosis engine — symptom vs cause (supplied categories)
// ---------------------------------------------------------------------------

export const QUICK_CATEGORIES = [
  { key: "WORD", label: "Word", hint: "Couldn't find or use the right word" },
  { key: "GRAMMAR", label: "Grammar", hint: "Grammar broke while speaking" },
  { key: "IDEA", label: "Idea", hint: "Didn't know what to say" },
  { key: "PACE", label: "Pace", hint: "Too fast, too slow, too many pauses" },
  { key: "NERVES", label: "Nerves", hint: "Anxiety got in the way" },
  { key: "OTHER", label: "Other", hint: "Something else" },
] as const;

export const SYMPTOMS = [
  "I couldn't find a word",
  "I paused too much",
  "I lost my idea",
  "Grammar broke",
  "I repeated myself",
  "I spoke too fast",
  "Pronunciation felt unclear",
  "I felt nervous",
  "I don't know",
] as const;

export const CAUSES = [
  "I didn't know the language",
  "I knew it but couldn't retrieve it",
  "I didn't know what to say",
  "I was translating",
  "I was checking grammar",
  "I was nervous",
  "I was trying to sound advanced",
  "I'm not sure",
] as const;

export type Symptom = (typeof SYMPTOMS)[number];
export type Cause = (typeof CAUSES)[number];

/** symptom → most likely problem when no cause detail is given */
export const SYMPTOM_DEFAULT_PROBLEM: Record<Symptom, string> = {
  "I couldn't find a word": "prob23",
  "I paused too much": "prob30",
  "I lost my idea": "prob20",
  "Grammar broke": "prob22",
  "I repeated myself": "prob3",
  "I spoke too fast": "prob25",
  "Pronunciation felt unclear": "prob8",
  "I felt nervous": "prob34",
  "I don't know": "prob36",
};

/** (symptom, cause) → the problem this combination points at */
const DIAGNOSIS_MAP: Partial<Record<Symptom, Partial<Record<Cause, string>>>> = {
  "I couldn't find a word": {
    "I didn't know the language": "prob14",
    "I knew it but couldn't retrieve it": "prob23",
    "I was trying to sound advanced": "prob3",
    "I'm not sure": "prob15",
  },
  "I paused too much": {
    "I didn't know the language": "prob14",
    "I knew it but couldn't retrieve it": "prob23",
    "I didn't know what to say": "prob20",
    "I was translating": "prob24",
    "I was checking grammar": "prob26",
    "I was nervous": "prob34",
    "I'm not sure": "prob4",
  },
  "I lost my idea": {
    "I didn't know what to say": "prob20",
    "I was translating": "prob24",
    "I was nervous": "prob34",
    "I'm not sure": "prob31",
  },
  "Grammar broke": {
    "I knew it but couldn't retrieve it": "prob22",
    "I was checking grammar": "prob26",
    "I was translating": "prob24",
    "I was nervous": "prob33",
    "I'm not sure": "prob11",
  },
  "I repeated myself": {
    "I didn't know what to say": "prob17",
    "I was translating": "prob24",
    "I'm not sure": "prob3",
  },
  "I spoke too fast": {
    "I was nervous": "prob33",
    "I was translating": "prob25",
    "I'm not sure": "prob25",
  },
  "Pronunciation felt unclear": {
    "I was nervous": "prob32",
    "I'm not sure": "prob8",
  },
  "I felt nervous": {
    "I was nervous": "prob34",
    "I was checking grammar": "prob26",
    "I was trying to sound advanced": "prob34",
    "I'm not sure": "prob33",
  },
  "I don't know": {},
};

export function diagnoseProblem(symptom: Symptom, cause?: Cause): string {
  if (cause) {
    const mapped = DIAGNOSIS_MAP[symptom]?.[cause];
    if (mapped) return mapped;
  }
  return SYMPTOM_DEFAULT_PROBLEM[symptom] || "prob36";
}

/** quick category → core area + representative problems */
export const QUICK_CATEGORY_AREAS: Record<string, string[]> = {
  WORD: ["area2", "area3"],
  GRAMMAR: ["area4", "area5"],
  IDEA: ["area9"],
  PACE: ["area7"],
  NERVES: ["area13", "area14"],
  OTHER: [],
};

// ---------------------------------------------------------------------------
// Current focus options (dashboard cold start)
// ---------------------------------------------------------------------------

export const FOCUS_OPTIONS = [
  { key: "fluency", label: "Speak more smoothly", areaId: "area7" },
  { key: "vocabulary", label: "Find words faster", areaId: "area3" },
  { key: "grammar", label: "Use grammar more accurately", areaId: "area4" },
  { key: "pronunciation", label: "Improve pronunciation", areaId: "area6" },
  { key: "ideas", label: "Develop ideas", areaId: "area9" },
  { key: "natural", label: "Speak more naturally", areaId: "area1" },
  { key: "pressure", label: "Handle pressure", areaId: "area14" },
  { key: "unsure", label: "I'm not sure", areaId: null },
] as const;

// ---------------------------------------------------------------------------
// Part 3 question-specific thinking support
// ---------------------------------------------------------------------------

export function questionSupport(prompt: string): string | null {
  const q = prompt.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  if (has("why do", "why is", "why are", "why does", "why do you think", "reasons"))
    return "Think about the main reasons.";
  if (has("what effects", "consequences", "impact", "what happens"))
    return "Think about short-term and long-term consequences.";
  if (has("difference", "differ", "compare", "better or worse", "versus", " vs "))
    return "Think about how the two situations differ.";
  if (has("in the future", "will ", "could change", "what changes", "years from now", "decades"))
    return "Think about what could change.";
  if (has("who should", "who is responsible", "responsibility"))
    return "Think about who is responsible and why.";
  if (has("advantages", "disadvantages", "pros and cons", "benefit"))
    return "Weigh what we gain against what we sacrifice.";
  if (has("how can", "how do", "how might", "what measures", "what steps", "what actions"))
    return "Think about who could act, and what they could realistically do.";
  if (has("should"))
    return "Consider both sides before you take a position.";
  return null;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export const part1TopicById = (id: string) => PART1_TOPICS.find((t) => t.id === id);
export const part2CardById = (id: string) => PART2_CARDS.find((c) => c.id === id);
export const part3TopicById = (id: string) => PART3_TOPICS.find((t) => t.id === id);
export const vocabForTopic = (topicId: string): VocabItem[] =>
  PART1_VOCAB[topicId] || PART2_VOCAB[topicId] || PART3_VOCAB[topicId] || [];

export function topicTitle(topicId: string): string {
  return (
    part1TopicById(topicId)?.title ||
    part2CardById(topicId)?.title ||
    part3TopicById(topicId)?.title ||
    topicId
  );
}

export function topicPart(topicId: string): 1 | 2 | 3 | null {
  if (part1TopicById(topicId)) return 1;
  if (part2CardById(topicId)) return 2;
  if (part3TopicById(topicId)) return 3;
  return null;
}

export function questionPrompt(questionId: string): string {
  const topicId = questionId.split("-q")[0];
  const p1 = part1TopicById(topicId);
  if (p1) return p1.questions.find((q) => q.id === questionId)?.prompt || "";
  const p3 = part3TopicById(topicId);
  if (p3) return p3.questions.find((q) => q.id === questionId)?.prompt || "";
  return "";
}

/** Random distinct topics from a bank */
export function pickRandom<T>(items: T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
