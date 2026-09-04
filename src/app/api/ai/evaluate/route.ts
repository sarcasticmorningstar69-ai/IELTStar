import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedUser, unauthenticated } from "@/lib/supabase/server";
import {
  IELTS_CRITERIA,
  type AiAnalysisResult,
  type AiCriterionScore,
  type AiProviderStatus,
  type AiReliability,
  type AiTranscriptWord,
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

const NO_STORE = { "Cache-Control": "no-store" };
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
]);

const surfaceSchema = z.enum([
  "part1",
  "part2",
  "part3",
  "full-mock",
  "topic-wheel",
  "technique",
  "tip",
  "problem",
  "recordings",
  "general",
]);

const answerInputSchema = z
  .object({
    recordingId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
    part: z.number().int().min(1).max(3),
    questionLabel: z.string().trim().min(1).max(500),
    topicId: z.string().max(128).optional(),
    questionId: z.string().max(128).optional(),
    duration: z.number().finite().positive().max(MAX_AUDIO_SECONDS),
    startOffset: z.number().finite().min(0).optional(),
  })
  .strict();

const analysisRequestSchema = z
  .object({
    mode: z.literal("mock-analysis"),
    surface: surfaceSchema,
    mockId: z.string().max(128).optional(),
    sessionId: z.string().max(128).optional(),
    scope: z.enum(["entire-mock", "selected-answers"]),
    answers: z.array(answerInputSchema).min(1).max(20),
  })
  .strict();

const recentMessageSchema = z
  .object({
    sender: z.string().max(20),
    text: z.string().trim().min(1).max(2000),
  })
  .strip();

const chatRequestSchema = z
  .object({
    mode: z.string().max(64).optional(),
    question: z.string().trim().min(1).max(2000).optional(),
    correctedText: z.string().trim().max(5000).optional(),
    pageTitle: z.string().trim().max(200).optional(),
    recentMessages: z.array(recentMessageSchema).max(8).optional(),
  })
  .strip();

const grammarCorrectionSchema = z
  .object({
    original: z.string().trim().min(1).max(500),
    corrected: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(1200),
  })
  .strip();

const modelCriterionSchema = z
  .object({
    criterion: z.string().trim().min(1).max(100),
    band: z.number().finite().min(0).max(9).nullable(),
    summary: z.string().trim().min(1).max(2000),
    evidence: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
    strengths: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
    weaknesses: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
    nextStep: z.string().trim().min(1).max(1200),
    reliability: z.enum(["high", "medium", "low", "insufficient"]).optional(),
  })
  .strip();

const modelEvaluationSchema = z
  .object({
    overallBand: z.number().finite().min(0).max(9).nullable(),
    criteria: z.array(modelCriterionSchema).min(4).max(4),
    grammarCorrections: z.array(grammarCorrectionSchema).max(30).default([]),
    strengths: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
    priorities: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
    reliability: z.enum(["high", "medium", "low", "insufficient"]).optional(),
  })
  .strip();

type ModelEvaluation = z.infer<typeof modelEvaluationSchema>;
type CriterionName = (typeof IELTS_CRITERIA)[number];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function providerStatus(): AiProviderStatus & { openrouter: boolean } {
  return {
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    glm: false,
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    transcriptionModel: process.env.DEEPGRAM_MODEL || "nova-3",
    feedbackModel:
      process.env.OPENROUTER_MODEL || "meta/muse-spark-1.3-contributor",
  };
}

function quotaStatus(reason: string): number {
  return reason === "QUOTA_BACKEND_UNAVAILABLE" ||
    reason === "QUOTA_CHECK_FAILED"
    ? 503
    : 429;
}

function cleanModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

function criterionName(value: string): CriterionName | null {
  const lower = value.toLowerCase();
  if (lower.includes("fluency") && lower.includes("coherence")) {
    return "Fluency & Coherence";
  }
  if (lower.includes("lexical")) return "Lexical Resource";
  if (lower.includes("grammatical")) {
    return "Grammatical Range & Accuracy";
  }
  if (lower.includes("pronunciation")) return "Pronunciation";
  return null;
}

function roundedBand(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(9, Math.round(value * 2) / 2));
}

function buildCriteria(evaluation: ModelEvaluation): AiCriterionScore[] {
  return IELTS_CRITERIA.map((requiredName) => {
    const source = evaluation.criteria.find(
      (entry) => criterionName(entry.criterion) === requiredName
    );
    if (!source) {
      throw new Error(`Model response omitted ${requiredName}.`);
    }

    const evidence = [
      ...(source.evidence || []),
      ...(source.strengths || []),
      ...(source.weaknesses || []).map((item) => `Needs work: ${item}`),
    ].slice(0, 8);

    const reliability: AiReliability =
      requiredName === "Pronunciation"
        ? "low"
        : source.reliability === "high"
          ? "medium"
          : source.reliability || "medium";

    return {
      criterion: requiredName,
      band: roundedBand(source.band),
      reliability,
      summary: source.summary,
      evidence: evidence.length > 0 ? evidence : [source.summary],
      nextStep: source.nextStep,
    };
  });
}

export async function GET() {
  return json(providerStatus());
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
    const status = providerStatus();
    if (!status.deepgram || !status.openrouter) {
      return json(
        {
          code: "AI_NOT_CONFIGURED",
          message:
            "Stella's recording analysis is not available yet. Please try again later.",
        },
        503
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return json(
        { code: "INVALID_FORM", message: "The recording request was invalid." },
        400
      );
    }

    const metaRaw = formData.get("metadata");
    if (typeof metaRaw !== "string") {
      return json(
        { code: "INVALID_METADATA", message: "Recording details are missing." },
        400
      );
    }

    let rawMetadata: unknown;
    try {
      rawMetadata = JSON.parse(metaRaw);
    } catch {
      return json(
        { code: "INVALID_METADATA", message: "Recording details are invalid." },
        400
      );
    }

    const metadataResult = analysisRequestSchema.safeParse(rawMetadata);
    if (!metadataResult.success) {
      return json(
        { code: "INVALID_METADATA", message: "Recording details are invalid." },
        400
      );
    }
    const metadata = metadataResult.data;

    const audioEntries = formData
      .getAll("audio")
      .filter((entry): entry is File => entry instanceof File);

    if (audioEntries.length !== 1 || metadata.answers.length !== 1) {
      return json(
        {
          code: "MULTI_RECORDING_PENDING",
          message:
            "Stella cannot safely analyse multiple recordings in one request yet. Choose one answer for now.",
        },
        501
      );
    }

    const audioFile = audioEntries[0];
    const audioType = (audioFile.type || "").toLowerCase();
    if (!ALLOWED_AUDIO_TYPES.has(audioType)) {
      return json(
        {
          code: "UNSUPPORTED_AUDIO_TYPE",
          message: "This recording format is not supported.",
        },
        415
      );
    }
    if (audioFile.size <= 0 || audioFile.size > MAX_AUDIO_BYTES) {
      return json(
        {
          code: "RECORDING_TOO_LARGE",
          message: "The recording is empty or exceeds the 10 MB limit.",
        },
        413
      );
    }

    const declaredSeconds = Math.ceil(metadata.answers[0].duration);
    if (declaredSeconds > MAX_AUDIO_SECONDS) {
      return json(
        {
          code: "RECORDING_TOO_LONG",
          message: "Choose a recording that is five minutes or shorter.",
        },
        413
      );
    }

    const quota = await consumeQuota(user.id, { seconds: declaredSeconds });
    if (!quota.allowed) {
      return json(
        { code: quota.reason, message: quotaMessage(quota) },
        quotaStatus(quota.reason)
      );
    }

    let transcription: Awaited<ReturnType<typeof transcribeWithDeepgram>>;
    try {
      const buffer = await audioFile.arrayBuffer();
      transcription = await transcribeWithDeepgram(buffer, audioType);
    } catch (error) {
      console.error("[evaluate] transcription provider failed", error);
      return json(
        {
          code: "TRANSCRIPTION_FAILED",
          message:
            "Stella couldn't transcribe this recording. Your recording is safe—please try again.",
        },
        502
      );
    }

    const transcript = transcription.transcript.trim();
    if (!transcript) {
      return json(
        {
          code: "EMPTY_TRANSCRIPT",
          message:
            "Stella couldn't hear enough speech to analyse. Check your microphone and try again.",
        },
        422
      );
    }

    const answer = metadata.answers[0];
    const evaluationPrompt = [
      `IELTS speaking part: ${answer.part}`,
      `Question: ${answer.questionLabel}`,
      wrapTranscriptAsData(transcript),
      EVALUATION_JSON_SCHEMA_PROMPT,
    ].join("\n\n");

    let parsed: ModelEvaluation;
    try {
      const raw = await callOpenRouter({
        messages: [{ role: "user", content: evaluationPrompt }],
        systemPrompt: `${STELLA_SYSTEM_INSTRUCTION}\n\n${STELLA_SCOPE_RULE}`,
        maxTokens: MAX_ANALYSIS_OUTPUT_TOKENS,
        jsonMode: true,
      });
      parsed = modelEvaluationSchema.parse(cleanModelJson(raw));
    } catch (error) {
      console.error("[evaluate] feedback provider returned an invalid result", error);
      return json(
        {
          code: "FEEDBACK_FAILED",
          message:
            "Stella couldn't produce reliable feedback for this recording. Please try again.",
        },
        502
      );
    }

    let criteria: AiCriterionScore[];
    try {
      criteria = buildCriteria(parsed);
    } catch (error) {
      console.error("[evaluate] incomplete feedback criteria", error);
      return json(
        {
          code: "FEEDBACK_INCOMPLETE",
          message:
            "Stella couldn't produce complete feedback for this recording. Please try again.",
        },
        502
      );
    }

    const overallBand = roundedBand(parsed.overallBand);
    const words: AiTranscriptWord[] = transcription.words;
    const reliability: AiReliability =
      words.length >= 20 ? "medium" : words.length >= 8 ? "low" : "insufficient";

    const result: AiAnalysisResult = {
      kind:
        metadata.scope === "entire-mock"
          ? "full-mock-estimate"
          : "practice-estimate",
      answers: [
        {
          recordingId: answer.recordingId,
          questionLabel: answer.questionLabel,
          transcript,
          words,
          events: transcription.events,
          grammarCorrections: parsed.grammarCorrections,
          audioQuality: {
            usable: true,
            reliability,
            issues: [],
          },
        },
      ],
      overallBand,
      overallRange:
        overallBand === null
          ? undefined
          : {
              low: Math.max(0, overallBand - 0.5),
              high: Math.min(9, overallBand + 0.5),
            },
      criteria,
      grammarCorrections: parsed.grammarCorrections,
      strengths: parsed.strengths,
      priorities: parsed.priorities,
      reliability,
      disclaimer:
        "This estimate is for practice and self-reflection. Official IELTS examinations are scored under strict certified test conditions.",
    };

    return json(result);
  }

  if (!contentType.includes("application/json")) {
    return json(
      { code: "UNSUPPORTED_CONTENT_TYPE", message: "Unsupported request format." },
      415
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(
      { code: "INVALID_JSON", message: "The request was invalid." },
      400
    );
  }

  const bodyResult = chatRequestSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return json(
      { code: "INVALID_CHAT_REQUEST", message: "The question was invalid." },
      400
    );
  }
  const body = bodyResult.data;

  if (body.mode === "transcript-recheck" || body.correctedText) {
    return json(
      {
        code: "AUDIO_RECHECK_REQUIRED",
        message:
          "A transcript correction needs the original audio to be analysed again. This option is not available yet.",
      },
      422
    );
  }

  const question = body.question || "";
  const scope = prescreenStudentMessage(question);
  if (!scope.allowed) {
    return json(
      { code: `OUT_OF_SCOPE_${scope.reason || "REQUEST"}`, message: scope.message },
      400
    );
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return json(
      {
        code: "AI_NOT_CONFIGURED",
        message: "Stella is not available yet. Please try again later.",
      },
      503
    );
  }

  const quota = await consumeQuota(user.id, { messages: 1 });
  if (!quota.allowed) {
    return json(
      { code: quota.reason, message: quotaMessage(quota) },
      quotaStatus(quota.reason)
    );
  }

  const history = (body.recentMessages || []).map((message) => ({
    role:
      message.sender === "stella"
        ? ("assistant" as const)
        : ("user" as const),
    content:
      message.sender === "stella"
        ? message.text
        : wrapMessageAsData(message.text),
  }));

  const context = body.pageTitle
    ? `Current IELTS study page: ${body.pageTitle}\n\n`
    : "";

  try {
    const responseText = await callOpenRouter({
      messages: [
        ...history,
        {
          role: "user",
          content: `${context}${wrapMessageAsData(question)}`,
        },
      ],
      systemPrompt: `${STELLA_SYSTEM_INSTRUCTION}\n\n${STELLA_SCOPE_RULE}`,
      maxTokens: MAX_CHAT_OUTPUT_TOKENS,
    });

    return json({ answer: responseText, message: responseText });
  } catch (error) {
    console.error("[evaluate] chat provider failed", error);
    return json(
      {
        code: "CHAT_FAILED",
        message: "Stella couldn't answer just now. Please try again.",
      },
      502
    );
  }
}
