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

export type AiMode = "context-chat" | "ielts-evaluation" | "topic-wheel-feedback";

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

export interface AiCriterionScore {
  criterion: IeltsCriterion;
  band: number | null;
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
