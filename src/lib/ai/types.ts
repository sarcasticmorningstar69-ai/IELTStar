export const IELTS_CRITERIA = [
  "Fluency & Coherence",
  "Lexical Resource",
  "Grammatical Range & Accuracy",
  "Pronunciation",
] as const;

export type IeltsCriterion = (typeof IELTS_CRITERIA)[number];

export type AiSurface =
  | "part1"
  | "part2"
  | "part3"
  | "full-mock"
  | "topic-wheel"
  | "technique"
  | "tip"
  | "problem"
  | "recordings"
  | "general";

export type AiMode =
  | "context-chat"
  | "ielts-evaluation"
  | "topic-wheel-feedback"
  | "mock-analysis";

export interface AiProviderStatus {
  deepgram: boolean;
  glm: boolean;
  transcriptionModel: string;
  feedbackModel: string;
}

export interface AiRequestMetadata {
  mode: AiMode;
  surface: AiSurface;
  pageTitle: string;
  pageContext: string;
  question?: string;
  recordingIds?: string[];
}

/**
 * How much we are willing to stand behind a judgement.
 *
 * Deepgram confidence is a weak signal about pronunciation and says nothing
 * about how confident the speaker sounded. Anything acoustic must carry one of
 * these so Stella can show a range instead of inventing precision.
 */
export type AiReliability = "high" | "medium" | "low" | "insufficient";

/**
 * Runs before any scoring. If the audio is unusable, Stella should say so
 * rather than blame the student's pronunciation for a bad microphone.
 */
export interface AiAudioQuality {
  usable: boolean;
  reliability: AiReliability;
  /** e.g. "background noise", "clipping", "very quiet", "far from microphone", "echo". */
  issues: string[];
}

export type AiEventType =
  | "filler"
  | "pause"
  | "repetition"
  | "repair"
  | "false-start"
  | "word-search"
  | "grammar"
  | "vocabulary"
  | "pronunciation"
  | "coherence"
  | "strength";

/**
 * A single piece of evidence pinned to a moment in the audio. Clicking one in
 * the workspace seeks playback to `start`, so the student hears the thing being
 * described instead of taking Stella's word for it.
 */
export interface AiTimestampEvent {
  start: number;
  end: number;
  criterion: IeltsCriterion;
  type: AiEventType;
  word?: string;
  comment: string;
  reliability: AiReliability;
}

export interface AiTranscriptWord {
  word: string;
  start: number;
  end: number;
  /** Deepgram word confidence, 0-1. Low values mean "unclear to the recogniser", not "mispronounced". */
  confidence: number;
}

/** Fluency measures that come from timings rather than from the words. */
export interface AiFluencyMetrics {
  wordsPerMinute: number | null;
  articulationRate: number | null;
  meanLengthOfRun: number | null;
  silentPauses: number | null;
  filledPauses: number | null;
  pausesInsideClauses: number | null;
  repetitions: number | null;
  repairs: number | null;
}

export interface AiCriterionScore {
  criterion: IeltsCriterion;
  band: number | null;
  /** Preferred over a single band wherever the evidence is thin. */
  range?: { low: number; high: number };
  reliability?: AiReliability;
  summary: string;
  evidence: string[];
  nextStep: string;
}

export interface AiFillerWord {
  word: string;
  count: number;
  timestamps: number[];
}

export interface AiEvaluation {
  transcript: string;
  fillers: AiFillerWord[];
  overallBand: number | null;
  criteria: AiCriterionScore[];
  strengths: string[];
  priorities: string[];
  answer?: string;
  disclaimer: string;
}

/** Per-answer result inside a larger analysis. */
export interface AiAnswerAnalysis {
  recordingId: string;
  questionLabel: string;
  transcript: string;
  words: AiTranscriptWord[];
  events: AiTimestampEvent[];
  audioQuality: AiAudioQuality;
  fluency?: AiFluencyMetrics;
}

/**
 * Neither label is an official IELTS result, and both say so on screen.
 * A single answer is far weaker evidence than a whole mock.
 */
export type AiEstimateKind = "practice-estimate" | "full-mock-estimate";

export interface AiAnalysisResult {
  kind: AiEstimateKind;
  answers: AiAnswerAnalysis[];
  overallBand: number | null;
  overallRange?: { low: number; high: number };
  criteria: AiCriterionScore[];
  strengths: string[];
  priorities: string[];
  reliability: AiReliability;
  disclaimer: string;
}

export interface AiAnalysisAnswerInput {
  recordingId: string;
  part: number;
  questionLabel: string;
  topicId?: string;
  questionId?: string;
  duration: number;
  /** Offset inside the master mock recording, when one exists. */
  startOffset?: number;
}

export interface AiAnalysisRequest {
  mode: "mock-analysis";
  surface: AiSurface;
  mockId?: string;
  sessionId?: string;
  scope: "entire-mock" | "selected-answers";
  answers: AiAnalysisAnswerInput[];
}
