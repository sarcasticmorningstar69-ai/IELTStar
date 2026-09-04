import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedUser, unauthenticated } from "@/lib/supabase/server";
import {
  IELTS_CRITERIA,
  type AiAnalysisResult,
  type AiCriterionScore,
  type AiProviderStatus,
  type AiReliability,
} from "@/lib/ai/types";
import { callOpenRouter } from "@/lib/ai/openrouter-client";
import { transcribeWithDeepgram } from "@/lib/ai/deepgram-client";
import { consumeQuota, quotaMessage } from "@/lib/ai/quota";
import {
  MAX_ANALYSIS_OUTPUT_TOKENS,
  MAX_CHAT_OUTPUT_TOKENS,
  STELLA_SCOPE_RULE,
  prescreenStudentMessage,
  wrapMessageAsData,
  wrapTranscriptAsData,
} from "@/lib/ai/scope-guard";
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "@/lib/storage/r2";
import {
  STELLA_SYSTEM_INSTRUCTION,
  EVALUATION_JSON_SCHEMA_PROMPT,
} from "@/lib/ai/prompts/stella-prompt";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
]);
const surfaces = [
  "part1", "part2", "part3", "full-mock", "topic-wheel", "technique",
  "tip", "problem", "recordings", "general",
] as const;
const reliabilitySchema = z.enum(["high", "medium", "low", "insufficient"]);

const answerSchema = z.object({
  recordingId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  part: z.number().int().min(1).max(3),
  questionLabel: z.string().trim().min(1).max(500),
  topicId: z.string().max(128).optional(),
  questionId: z.string().max(128).optional(),
  duration: z.number().finite().positive().max(MAX_AUDIO_SECONDS),
  startOffset: z.number().finite().min(0).optional(),
}).strict();

const analysisSchema = z.object({
  mode: z.literal("mock-analysis"),
  surface: z.enum(surfaces),
  mockId: z.string().max(128).optional(),
  sessionId: z.string().max(128).optional(),
  scope: z.enum(["entire-mock", "selected-answers"]),
  answers: z.array(answerSchema).min(1).max(20),
}).strict();

const chatSchema = z.object({
  mode: z.string().max(64).optional(),
  question: z.string().trim().min(1).max(2000).optional(),
  correctedText: z.string().trim().max(5000).optional(),
  pageTitle: z.string().trim().max(200).optional(),
  recentMessages: z.array(z.object({
    sender: z.string().max(20),
    text: z.string().trim().min(1).max(2000),
  }).strip()).max(8).optional(),
}).strip();

const correctionSchema = z.object({
  original: z.string().trim().min(1).max(500),
  corrected: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(1200),
}).strip();

const criterionSchema = z.object({
  criterion: z.string().trim().min(1).max(100),
  band: z.number().finite().min(0).max(9).nullable(),
  summary: z.string().trim().min(1).max(2000),
  evidence: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
  strengths: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
  weaknesses: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
  nextStep: z.string().trim().min(1).max(1200),
  reliability: reliabilitySchema.optional(),
}).strip();

const evaluationSchema = z.object({
  overallBand: z.number().finite().min(0).max(9).nullable(),
  criteria: z.array(criterionSchema).length(4),
  grammarCorrections: z.array(correctionSchema).max(30).default([]),
  strengths: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  priorities: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  reliability: reliabilitySchema.optional(),
}).strip();

type Evaluation = z.infer<typeof evaluationSchema>;
type CriterionName = (typeof IELTS_CRITERIA)[number];

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function providers(): AiProviderStatus & { openrouter: boolean } {
  return {
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    glm: false,
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    transcriptionModel: process.env.DEEPGRAM_MODEL || "nova-3",
    feedbackModel: process.env.OPENROUTER_MODEL || "meta/muse-spark-1.3-contributor",
  };
}

function quotaHttpStatus(reason: string) {
  return reason === "QUOTA_BACKEND_UNAVAILABLE" || reason === "QUOTA_CHECK_FAILED"
    ? 503
    : 429;
}

function parseJson(raw: string): unknown {
  return JSON.parse(
    raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  );
}

function normalizeCriterion(value: string): CriterionName | null {
  const name = value.toLowerCase();
  if (name.includes("fluency") && name.includes("coherence")) return "Fluency & Coherence";
  if (name.includes("lexical")) return "Lexical Resource";
  if (name.includes("grammatical")) return "Grammatical Range & Accuracy";
  if (name.includes("pronunciation")) return "Pronunciation";
  return null;
}

function band(value: number | null) {
  return value === null ? null : Math.max(0, Math.min(9, Math.round(value * 2) / 2));
}

function criteriaFrom(evaluation: Evaluation): AiCriterionScore[] {
  return IELTS_CRITERIA.map((name) => {
    const source = evaluation.criteria.find(
      (item) => normalizeCriterion(item.criterion) === name
    );
    if (!source) throw new Error(`Model response omitted ${name}.`);
    const evidence = [
      ...(source.evidence || []),
      ...(source.strengths || []),
      ...(source.weaknesses || []).map((item) => `Needs work: ${item}`),
    ].slice(0, 8);
    const reliability: AiReliability = name === "Pronunciation"
      ? "low"
      : source.reliability === "high" ? "medium" : source.reliability || "medium";
    return {
      criterion: name,
      band: band(source.band),
      reliability,
      summary: source.summary,
      evidence: evidence.length ? evidence : [source.summary],
      nextStep: source.nextStep,
    };
  });
}

export async function GET() {
  return reply(providers());
}

export async function POST(request: Request) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthenticated(
      "Please sign in or create an account to use Stella AI analysis and coaching."
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return handleRecording(request, user.id);
  }
  if (contentType.includes("application/json")) {
    return handleChat(request, user.id);
  }
  return reply(
    { code: "UNSUPPORTED_CONTENT_TYPE", message: "Unsupported request format." },
    415
  );
}

async function handleRecording(request: Request, userId: string) {
  const status = providers();
  if (!status.deepgram || !status.openrouter) {
    return reply({
      code: "AI_NOT_CONFIGURED",
      message: "Stella's recording analysis is not available yet. Please try again later.",
    }, 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ code: "INVALID_FORM", message: "The recording request was invalid." }, 400);
  }

  const metadataEntry = form.get("metadata");
  if (typeof metadataEntry !== "string") {
    return reply({ code: "INVALID_METADATA", message: "Recording details are missing." }, 400);
  }

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(metadataEntry);
  } catch {
    return reply({ code: "INVALID_METADATA", message: "Recording details are invalid." }, 400);
  }
  const checked = analysisSchema.safeParse(rawMetadata);
  if (!checked.success) {
    return reply({ code: "INVALID_METADATA", message: "Recording details are invalid." }, 400);
  }
  const metadata = checked.data;
  const files = form.getAll("audio").filter((entry): entry is File => entry instanceof File);

  if (files.length !== 1 || metadata.answers.length !== 1) {
    return reply({
      code: "MULTI_RECORDING_PENDING",
      message: "Stella cannot safely analyse multiple recordings in one request yet. Choose one answer for now.",
    }, 501);
  }

  const audio = files[0];
  const audioType = (audio.type || "").toLowerCase();
  if (!AUDIO_TYPES.has(audioType)) {
    return reply({ code: "UNSUPPORTED_AUDIO_TYPE", message: "This recording format is not supported." }, 415);
  }
  if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
    return reply({ code: "RECORDING_TOO_LARGE", message: "The recording is empty or exceeds the 10 MB limit." }, 413);
  }

  const seconds = Math.ceil(metadata.answers[0].duration);
  if (seconds > MAX_AUDIO_SECONDS) {
    return reply({
      code: "RECORDING_TOO_LONG",
      message: "Choose a recording that is 20 minutes or shorter.",
    }, 413);
  }

  const quota = await consumeQuota(userId, { seconds });
  if (!quota.allowed) {
    return reply({ code: quota.reason, message: quotaMessage(quota) }, quotaHttpStatus(quota.reason));
  }

  let transcription: Awaited<ReturnType<typeof transcribeWithDeepgram>>;
  try {
    transcription = await transcribeWithDeepgram(await audio.arrayBuffer(), audioType);
  } catch (error) {
    console.error("[evaluate] transcription provider failed", error);
    return reply({
      code: "TRANSCRIPTION_FAILED",
      message: "Stella couldn't transcribe this recording. Your recording is safe—please try again.",
    }, 502);
  }

  const transcript = transcription.transcript.trim();
  if (!transcript) {
    return reply({
      code: "EMPTY_TRANSCRIPT",
      message: "Stella couldn't hear enough speech to analyse. Check your microphone and try again.",
    }, 422);
  }

  const answer = metadata.answers[0];
  const prompt = [
    wrapMessageAsData(`IELTS speaking part: ${answer.part}\nQuestion: ${answer.questionLabel}`),
    wrapTranscriptAsData(transcript),
    EVALUATION_JSON_SCHEMA_PROMPT,
  ].join("\n\n");

  let evaluation: Evaluation;
  try {
    const raw = await callOpenRouter({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: `${STELLA_SYSTEM_INSTRUCTION}\n\n${STELLA_SCOPE_RULE}`,
      maxTokens: MAX_ANALYSIS_OUTPUT_TOKENS,
      jsonMode: true,
    });
    evaluation = evaluationSchema.parse(parseJson(raw));
  } catch (error) {
    console.error("[evaluate] feedback provider returned an invalid result", error);
    return reply({
      code: "FEEDBACK_FAILED",
      message: "Stella couldn't produce reliable feedback for this recording. Please try again.",
    }, 502);
  }

  let criteria: AiCriterionScore[];
  try {
    criteria = criteriaFrom(evaluation);
  } catch (error) {
    console.error("[evaluate] incomplete feedback criteria", error);
    return reply({
      code: "FEEDBACK_INCOMPLETE",
      message: "Stella couldn't produce complete feedback for this recording. Please try again.",
    }, 502);
  }

  const overallBand = band(evaluation.overallBand);
  const reliability: AiReliability = transcription.words.length >= 20
    ? "medium"
    : transcription.words.length >= 8 ? "low" : "insufficient";
  const result: AiAnalysisResult = {
    kind: metadata.scope === "entire-mock" ? "full-mock-estimate" : "practice-estimate",
    answers: [{
      recordingId: answer.recordingId,
      questionLabel: answer.questionLabel,
      transcript,
      words: transcription.words,
      events: transcription.events,
      grammarCorrections: evaluation.grammarCorrections,
      audioQuality: { usable: true, reliability, issues: [] },
    }],
    overallBand,
    overallRange: overallBand === null ? undefined : {
      low: Math.max(0, overallBand - 0.5),
      high: Math.min(9, overallBand + 0.5),
    },
    criteria,
    grammarCorrections: evaluation.grammarCorrections,
    strengths: evaluation.strengths,
    priorities: evaluation.priorities,
    reliability,
    disclaimer: "This estimate is for practice and self-reflection. Official IELTS examinations are scored under strict certified test conditions.",
  };
  return reply(result);
}

async function handleChat(request: Request, userId: string) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return reply({ code: "INVALID_JSON", message: "The request was invalid." }, 400);
  }
  const checked = chatSchema.safeParse(rawBody);
  if (!checked.success) {
    return reply({ code: "INVALID_CHAT_REQUEST", message: "The question was invalid." }, 400);
  }
  const body = checked.data;

  if (body.mode === "transcript-recheck" || body.correctedText) {
    return reply({
      code: "AUDIO_RECHECK_REQUIRED",
      message: "A transcript correction needs the original audio to be analysed again. This option is not available yet.",
    }, 422);
  }

  const question = body.question || "";
  const scope = prescreenStudentMessage(question);
  if (!scope.allowed) {
    return reply({ code: `OUT_OF_SCOPE_${scope.reason || "REQUEST"}`, message: scope.message }, 400);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return reply({ code: "AI_NOT_CONFIGURED", message: "Stella is not available yet. Please try again later." }, 503);
  }

  const quota = await consumeQuota(userId, { messages: 1 });
  if (!quota.allowed) {
    return reply({ code: quota.reason, message: quotaMessage(quota) }, quotaHttpStatus(quota.reason));
  }

  const history = (body.recentMessages || []).map((message) => ({
    role: message.sender === "stella" ? ("assistant" as const) : ("user" as const),
    content: message.sender === "stella" ? message.text : wrapMessageAsData(message.text),
  }));
  const context = body.pageTitle
    ? wrapMessageAsData(`Current IELTS study page: ${body.pageTitle}`) + "\n\n"
    : "";

  try {
    const text = await callOpenRouter({
      messages: [...history, {
        role: "user",
        content: `${context}${wrapMessageAsData(question)}`,
      }],
      systemPrompt: `${STELLA_SYSTEM_INSTRUCTION}\n\n${STELLA_SCOPE_RULE}`,
      maxTokens: MAX_CHAT_OUTPUT_TOKENS,
    });
    return reply({ answer: text, message: text });
  } catch (error) {
    console.error("[evaluate] chat provider failed", error);
    return reply({ code: "CHAT_FAILED", message: "Stella couldn't answer just now. Please try again." }, 502);
  }
}
