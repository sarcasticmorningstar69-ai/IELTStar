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

/**
 * A higher-band rewrite of something the student actually said.
 *
 * `original` must appear verbatim in that student's transcript. The point is to
 * show a better way to express THEIR idea, so it stays achievable and honest;
 * an invented model answer would teach nothing and imply they said something
 * they did not.
 */
export interface AiUpgradedSample {
  original: string;
  upgraded: string;
  /** The band this rewrite illustrates. Always above the criterion band. */
  targetBand: number;
  /** Which descriptor feature the rewrite demonstrates. */
  whyBetter: string;
}

export interface AiCriterionScore {
  criterion: IeltsCriterion;
  /**
   * Whole band only, 1-9, or null when there is too little language to rate.
   * The official descriptor table has no half levels, so a criterion score is
   * never a decimal. Only the overall average may end in .5.
   */
  band: number | null;
  /** Preferred over a single band wherever the evidence is thin. */
  range?: { low: number; high: number };
  reliability?: AiReliability;
  summary: string;
  evidence: string[];
  /** Higher-band versions of the student's own sentences. */
  upgradedSamples?: AiUpgradedSample[];
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

export interface AiGrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

/**
 * Per-answer result inside a larger analysis.
 *
 * `transcript` and `words` are ALWAYS Deepgram's output for this one recording.
 * The feedback model is an examiner, not a transcriber: it never rewrites,
 * paraphrases or "tidies up" what the student actually said. A student-typed
 * correction lives in `studentCorrectedTranscript` and is labelled as such on
 * screen, so the two are never confused.
 */
export interface AiAnswerAnalysis {
  recordingId: string;
  /** IELTS part this recording belongs to, when known. */
  part?: number;
  questionLabel: string;
  transcript: string;
  /** Optional student-supplied correction. Never treated as verified. */
  studentCorrectedTranscript?: string;
  annotatedTranscript?: string;
  grammarCorrections?: AiGrammarCorrection[];
  words: AiTranscriptWord[];
  events: AiTimestampEvent[];
  audioQuality: AiAudioQuality;
  fluency?: AiFluencyMetrics;
  /** Duration in seconds, as measured on the device that recorded it. */
  durationSeconds?: number;
  /** Examiner comment for this answer only. */
  summary?: string;
  strengths?: string[];
  priorities?: string[];
  topicRelevance?: "on-topic" | "partially-relevant" | "off-topic";
  offTopicReason?: string;
}

/** A recording that could not be analysed, so the student can retry just it. */
export interface AiAnswerFailure {
  recordingId: string;
  questionLabel: string;
  code: "TRANSCRIPTION_FAILED" | "EMPTY_TRANSCRIPT";
  message: string;
}

/**
 * Neither label is an official IELTS result, and both say so on screen.
 * A single answer is far weaker evidence than a whole mock.
 */
export type AiEstimateKind = "practice-estimate" | "full-mock-estimate";

export interface AiAnalysisResult {
  kind: AiEstimateKind;
  answers: AiAnswerAnalysis[];
  /** Recordings that failed. Present only when at least one failed. */
  failedAnswers?: AiAnswerFailure[];
  /**
   * Average of the rated criteria, rounded to the nearest half band exactly as
   * IELTS reports it. Computed on the server, never taken from the model.
   */
  overallBand: number | null;
  overallRange?: { low: number; high: number };
  criteria: AiCriterionScore[];
  grammarCorrections?: AiGrammarCorrection[];
  strengths: string[];
  priorities: string[];
  reliability: AiReliability;
  disclaimer: string;
  isOffTopic?: boolean;
  offTopicWarning?: string;
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
  /**
   * Stable per-submission id. Sent again unchanged when retrying, so quota is
   * reserved once per real submission rather than once per network attempt.
   */
  analysisRequestId?: string;
  answers: AiAnalysisAnswerInput[];
}
