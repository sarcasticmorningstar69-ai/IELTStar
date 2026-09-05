import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedUser, unauthenticated } from "@/lib/supabase/server";
import {
  IELTS_CRITERIA,
  type AiAnalysisResult,
  type AiAnswerAnalysis,
  type AiAnswerFailure,
  type AiCriterionScore,
  type AiProviderStatus,
  type AiReliability,
  type AiUpgradedSample,
} from "@/lib/ai/types";
import {
  DEFAULT_FEEDBACK_MODEL,
  callOpenRouter,
  resolveFeedbackConfig,
} from "@/lib/ai/openrouter-client";
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
  MAX_BAND,
  MIN_BAND,
  overallSpeakingBand,
} from "@/lib/ai/prompts/band-descriptors";
import {
  STELLA_SYSTEM_INSTRUCTION,
  STELLA_CHAT_INSTRUCTION,
  EVALUATION_JSON_SCHEMA_PROMPT,
} from "@/lib/ai/prompts/stella-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEADERS = { "Cache-Control": "no-store" };
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/m4a",
]);

function isAudioMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  const clean = mimeType.toLowerCase().replace(/\s+/g, "");
  return clean.startsWith("audio/") || AUDIO_TYPES.has(clean);
}

/** One mock is many answers, but never an unbounded number of them. */
const MAX_ANSWERS = 20;
/** Keep provider load predictable: at most three transcriptions in flight. */
const TRANSCRIBE_CONCURRENCY = 3;
/** Audio field naming: audio:<recordingId>, so mapping never relies on order. */
const AUDIO_FIELD_PREFIX = "audio:";
const MAX_AUDIO_MB = Math.round(MAX_AUDIO_BYTES / (1024 * 1024));
const MAX_AUDIO_MINUTES = Math.round(MAX_AUDIO_SECONDS / 60);
/** At most three higher-band rewrites per criterion; more is noise. */
const MAX_UPGRADES_PER_CRITERION = 3;
/** Shorter quotes than this cannot be matched against a transcript safely. */
const MIN_UPGRADE_QUOTE_LENGTH = 8;
/** Per-transcript ceiling when the browser replays an evaluation back to chat. */
const MAX_CONTEXT_TRANSCRIPT_CHARS = 4000;
/**
 * Ceiling on the whole assembled evaluation context.
 *
 * Every field below is supplied by the browser, so per-field caps alone still
 * multiply: twenty answers at four thousand characters is eighty thousand
 * characters of billed input on a single chat message. This is the backstop.
 */
const MAX_CONTEXT_CHARS = 20000;

const surfaces = [
  "part1", "part2", "part3", "full-mock", "topic-wheel", "technique",
  "tip", "problem", "recordings", "general",
] as const;
const reliabilitySchema = z.enum(["high", "medium", "low", "insufficient"]);
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

const answerSchema = z.object({
  recordingId: idSchema,
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
  analysisRequestId: idSchema.optional(),
  scope: z.enum(["entire-mock", "selected-answers"]),
  answers: z.array(answerSchema).min(1).max(MAX_ANSWERS),
  /*
   * Deep Dive is gone. The flag is still ACCEPTED because this object is
   * .strict() and a browser holding an older bundle would otherwise get a 400
   * on a perfectly good submission. It is read by nothing: every request now
   * takes the standard analysis path. Remove once no deployed client sends it.
   */
  deepDive: z.boolean().optional(),
}).strict();

/** One entry of prior conversation replayed by the browser. */
const chatHistoryMessageSchema = z.object({
  sender: z.string().max(40).nullish(),
  text: z.string().max(3000).nullish(),
}).passthrough();

/**
 * The evaluation the student is looking at, echoed back so Stella can discuss
 * it without a second round trip.
 *
 * Everything here comes from the browser and is therefore untrusted in two
 * different ways. Injection is handled downstream: the whole block is wrapped
 * by wrapMessageAsData, so it reaches the model as quoted data. Size is handled
 * here, and it is the one that costs money — an unbounded context is an
 * unbounded input bill on every single message.
 *
 * A student can also simply lie about their own bands. That is accepted: the
 * worst case is Stella discussing a score they were never given, which is
 * their own business, and nothing here is written back to the database.
 */
const evaluationContextSchema = z.object({
  prompt: z.string().max(500).nullish(),
  overallBand: z.number().finite().min(0).max(9).nullish(),
  isOffTopic: z.boolean().nullish(),
  offTopicWarning: z.string().max(1000).nullish(),
  criteria: z.array(z.object({
    criterion: z.string().max(100).nullish(),
    band: z.number().finite().min(0).max(9).nullish(),
    summary: z.string().max(1200).nullish(),
  }).passthrough()).max(IELTS_CRITERIA.length).nullish(),
  answers: z.array(z.object({
    part: z.union([z.number(), z.string().max(20)]).nullish(),
    question: z.string().max(500).nullish(),
    transcript: z.string().max(MAX_CONTEXT_TRANSCRIPT_CHARS).nullish(),
  }).passthrough()).max(MAX_ANSWERS).nullish(),
}).passthrough();

/**
 * Chat request shape.
 *
 * Kept .passthrough() so an unknown key from a newer client is ignored rather
 * than rejected, but every field we actually read is typed and length-capped.
 * The previous version declared each field as z.any(), which stopped the
 * INVALID_CHAT_REQUEST failures by removing the validation rather than fixing
 * the mismatch that caused them.
 */
const chatSchema = z.object({
  mode: z.string().max(64).nullish(),
  action: z.string().max(64).nullish(),
  text: z.string().max(4000).nullish(),
  question: z.string().max(4000).nullish(),
  metadata: z.object({
    pageTitle: z.string().max(500).nullish(),
  }).passthrough().nullish(),
  correctedText: z.string().max(5000).nullish(),
  pageTitle: z.string().max(500).nullish(),
  recentMessages: z.array(chatHistoryMessageSchema).max(50).nullish(),
  evaluationContext: evaluationContextSchema.nullish(),
}).passthrough();

const correctionSchema = z.object({
  original: z.string().trim().min(1).max(500),
  corrected: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(1200),
}).strip();

/**
 * A higher-band rewrite of the student's own sentence.
 *
 * `targetBand` is an integer for the same reason criterion bands are: it names
 * a level in the descriptor table, and there is no level 7.5.
 */
const upgradedSampleSchema = z.object({
  original: z.string().trim().min(1).max(700),
  upgraded: z.string().trim().min(1).max(700),
  targetBand: z.number().int().min(MIN_BAND).max(MAX_BAND),
  whyBetter: z.string().trim().min(1).max(700),
}).strip();

/**
 * Criterion bands are INTEGERS 1-9.
 *
 * Rejecting a decimal rather than rounding it is deliberate. The official
 * descriptor table has no half levels, so a 6.5 means the model ignored the
 * rubric; silently rounding it would hide that and hand the student a score
 * that corresponds to no descriptor at all. Band 0 is excluded too: it means
 * "did not attend", which is not a language judgement we can make.
 */
const criterionSchema = z.object({
  criterion: z.string().trim().min(1).max(100),
  band: z.number().int().min(MIN_BAND).max(MAX_BAND).nullable(),
  summary: z.string().trim().min(1).max(2000),
  evidence: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
  strengths: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
  weaknesses: z.array(z.string().trim().min(1).max(700)).max(8).optional(),
  upgradedSamples: z.array(upgradedSampleSchema).max(6).optional(),
  nextStep: z.string().trim().min(1).max(1200),
  reliability: reliabilitySchema.optional(),
}).strip();

/**
 * Per-answer examiner notes. `recordingId` is how a note gets attached to the
 * right audio player on screen. The model never returns transcript text here:
 * anything it sends that looks like a transcript is ignored.
 */
const answerNoteSchema = z.object({
  recordingId: z.string().trim().min(1).max(128),
  summary: z.string().trim().min(1).max(2000).optional(),
  strengths: z.array(z.string().trim().min(1).max(700)).max(6).optional(),
  priorities: z.array(z.string().trim().min(1).max(700)).max(6).optional(),
  grammarCorrections: z.array(correctionSchema).max(15).optional(),
}).strip();

const evaluationSchema = z.object({
  /*
   * Accepted so a model that reports it is not rejected, but never used: the
   * overall band is recomputed from the criterion scores below. Averaging is
   * arithmetic, and a language model should not be the thing that decides
   * which way a borderline result rounds.
   */
  overallBand: z.number().finite().min(0).max(9).nullable().optional(),
  criteria: z.array(criterionSchema).length(4),
  grammarCorrections: z.array(correctionSchema).max(30).default([]),
  answerNotes: z.array(answerNoteSchema).max(MAX_ANSWERS).optional(),
  strengths: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  priorities: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
  reliability: reliabilitySchema.optional(),
  isOffTopic: z.boolean().optional(),
  offTopicWarning: z.string().trim().max(1000).optional(),
}).strip();

type Evaluation = z.infer<typeof evaluationSchema>;
type AnswerInput = z.infer<typeof answerSchema>;
type CriterionName = (typeof IELTS_CRITERIA)[number];

type TranscribedAnswer = {
  answer: AnswerInput;
  transcript: string;
  words: Awaited<ReturnType<typeof transcribeWithDeepgram>>["words"];
  events: Awaited<ReturnType<typeof transcribeWithDeepgram>>["events"];
};

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function providers(): AiProviderStatus {
  const { model } = resolveFeedbackConfig();
  return {
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    glm: Boolean(process.env.GLM_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    transcriptionModel: process.env.DEEPGRAM_MODEL || "nova-3",
    feedbackModel: model,
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

/** Whole bands only, clamped to the range the descriptor table defines. */
function criterionBand(value: number | null) {
  return value === null
    ? null
    : Math.max(MIN_BAND, Math.min(MAX_BAND, Math.round(value)));
}

/**
 * Loose text match used to prove a quotation came from the student.
 *
 * Punctuation and casing are dropped because the model quotes from an
 * unpunctuated recogniser transcript and often adds a capital or a full stop.
 * Word order and wording still have to match.
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep only rewrites we can prove are grounded in what the student said.
 *
 * A fabricated "original" is the worst failure mode for this feature: the
 * student is shown a sentence they never spoke and told it was theirs. So the
 * quote must actually appear in their transcript, and the target band must sit
 * above the band we just awarded, or the "upgrade" is not an upgrade.
 */
function usableUpgrades(
  samples: AiUpgradedSample[] | undefined,
  criterionScore: number | null,
  transcriptHaystack: string
): AiUpgradedSample[] | undefined {
  if (!samples || samples.length === 0) return undefined;

  const kept = samples.filter((sample) => {
    const quote = normalizeForMatch(sample.original);
    if (quote.length < MIN_UPGRADE_QUOTE_LENGTH) return false;
    if (!transcriptHaystack.includes(quote)) return false;
    if (normalizeForMatch(sample.upgraded) === quote) return false;
    if (criterionScore !== null && sample.targetBand <= criterionScore) return false;
    return true;
  });

  const trimmed = kept.slice(0, MAX_UPGRADES_PER_CRITERION);
  return trimmed.length > 0 ? trimmed : undefined;
}

function criteriaFrom(
  evaluation: Evaluation,
  transcriptHaystack: string
): AiCriterionScore[] {
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
    const scored = criterionBand(source.band);
    /*
     * No pronunciation rewrites. We only ever see text, so a "higher band
     * pronunciation" example would be invented advice about sounds nobody
     * here has heard.
     */
    const upgradedSamples = name === "Pronunciation"
      ? undefined
      : usableUpgrades(source.upgradedSamples, scored, transcriptHaystack);
    return {
      criterion: name,
      band: scored,
      reliability,
      summary: source.summary,
      evidence: evidence.length ? evidence : [source.summary],
      upgradedSamples,
      nextStep: source.nextStep,
    };
  });
}

/** Run `task` over `items` with a hard ceiling on concurrent work. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await task(items[index], index);
      }
    })
  );
  return results;
}

function reliabilityFromWordCount(count: number): AiReliability {
  if (count >= 20) return "medium";
  if (count >= 8) return "low";
  return "insufficient";
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
  const answers = metadata.answers;

  // ---- Deterministic audio-to-answer mapping ------------------------------
  const declared = new Set<string>();
  for (const answer of answers) {
    if (declared.has(answer.recordingId)) {
      return reply({
        code: "DUPLICATE_RECORDING_ID",
        message: "Each recording can only be sent once in a request.",
      }, 400);
    }
    declared.add(answer.recordingId);
  }

  const filesById = new Map<string, File>();
  const unknownIds: string[] = [];
  for (const [key, value] of form.entries()) {
    if (!(value instanceof File)) continue;
    if (!key.startsWith(AUDIO_FIELD_PREFIX)) continue;
    const recordingId = key.slice(AUDIO_FIELD_PREFIX.length);
    if (!declared.has(recordingId)) {
      unknownIds.push(recordingId);
      continue;
    }
    if (filesById.has(recordingId)) {
      return reply({
        code: "DUPLICATE_RECORDING_FILE",
        message: "The same recording was uploaded twice. Please try again.",
      }, 400);
    }
    filesById.set(recordingId, value);
  }

  if (unknownIds.length > 0) {
    return reply({
      code: "UNKNOWN_RECORDING_ID",
      message: "The upload contained a recording that was not part of this submission.",
    }, 400);
  }

  // Backwards compatibility: a single answer may still be posted as "audio".
  if (filesById.size === 0 && answers.length === 1) {
    const legacy = form.getAll("audio").filter((entry): entry is File => entry instanceof File);
    if (legacy.length === 1) filesById.set(answers[0].recordingId, legacy[0]);
  }

  const missing = answers
    .filter((answer) => !filesById.has(answer.recordingId))
    .map((answer) => answer.recordingId);
  if (missing.length > 0) {
    return reply({
      code: "MISSING_AUDIO",
      message: "Some recordings did not finish uploading. Please retry them.",
      recordingIds: missing,
    }, 400);
  }

  // ---- Size, format and duration limits -----------------------------------
  let totalBytes = 0;
  let totalSeconds = 0;
  for (const answer of answers) {
    const file = filesById.get(answer.recordingId) as File;
    const type = (file.type || "").toLowerCase();
    if (!isAudioMimeType(type)) {
      return reply({
        code: "UNSUPPORTED_AUDIO_TYPE",
        message: "One of these recordings is in a format Stella cannot read.",
        recordingIds: [answer.recordingId],
      }, 415);
    }
    if (file.size <= 0) {
      return reply({
        code: "EMPTY_RECORDING",
        message: "One of these recordings is empty. Please record it again.",
        recordingIds: [answer.recordingId],
      }, 400);
    }
    totalBytes += file.size;
    totalSeconds += answer.duration;
  }

  if (totalBytes > MAX_AUDIO_BYTES) {
    return reply({
      code: "RECORDING_TOO_LARGE",
      message: `This submission is larger than the ${MAX_AUDIO_MB} MB limit. Please analyse fewer answers at a time.`,
    }, 413);
  }

  const seconds = Math.ceil(totalSeconds);
  if (seconds > MAX_AUDIO_SECONDS) {
    return reply({
      code: "RECORDING_TOO_LONG",
      message: `A submission can include up to ${MAX_AUDIO_MINUTES} minutes of speaking in total.`,
    }, 413);
  }

  // ---- Quota: charged once per submission, retry-safe ----------------------
  const isFullMock = metadata.scope === "entire-mock";
  const quota = await consumeQuota(userId, {
    seconds,
    analyses: 1,
    fullMocks: isFullMock ? 1 : 0,
    idempotencyKey: metadata.analysisRequestId ?? null,
  });
  if (!quota.allowed) {
    return reply(
      { code: quota.reason, message: quotaMessage(quota) },
      quotaHttpStatus(quota.reason)
    );
  }

  // ---- Transcription: one Deepgram call per recording ---------------------
  type Outcome =
    | { ok: true; value: TranscribedAnswer }
    | { ok: false; failure: AiAnswerFailure };

  const outcomes = await mapWithLimit<AnswerInput, Outcome>(
    answers,
    TRANSCRIBE_CONCURRENCY,
    async (answer) => {
      const file = filesById.get(answer.recordingId) as File;
      const type = (file.type || "").toLowerCase();
      try {
        const transcription = await transcribeWithDeepgram(
          await file.arrayBuffer(),
          type
        );
        const transcript = transcription.transcript.trim();
        if (!transcript) {
          return {
            ok: false,
            failure: {
              recordingId: answer.recordingId,
              questionLabel: answer.questionLabel,
              code: "EMPTY_TRANSCRIPT",
              message: "Stella couldn't hear enough speech in this answer.",
            },
          };
        }
        return {
          ok: true,
          value: {
            answer,
            transcript,
            words: transcription.words,
            events: transcription.events,
          },
        };
      } catch (error) {
        console.error("[evaluate] transcription provider failed", error);
        return {
          ok: false,
          failure: {
            recordingId: answer.recordingId,
            questionLabel: answer.questionLabel,
            code: "TRANSCRIPTION_FAILED",
            message: "Stella couldn't transcribe this answer. Your recording is safe.",
          },
        };
      }
    }
  );

  const usable = outcomes
    .filter((outcome): outcome is { ok: true; value: TranscribedAnswer } => outcome.ok)
    .map((outcome) => outcome.value);
  const failures = outcomes
    .filter((outcome): outcome is { ok: false; failure: AiAnswerFailure } => !outcome.ok)
    .map((outcome) => outcome.failure);

  if (usable.length === 0) {
    const allEmpty = failures.every((failure) => failure.code === "EMPTY_TRANSCRIPT");
    return reply({
      code: allEmpty ? "EMPTY_TRANSCRIPT" : "TRANSCRIPTION_FAILED",
      message: allEmpty
        ? "Stella couldn't hear enough speech to analyse. Check your microphone and try again."
        : "Stella couldn't transcribe these recordings. Your recordings are safe \u2014 please retry.",
      failedAnswers: failures,
    }, allEmpty ? 422 : 502);
  }

  // ---- Examiner pass over every transcript in one request -----------------
  const transcriptBlocks = usable.map((item, index) => [
    wrapMessageAsData(
      [
        `Answer ${index + 1} of ${usable.length}`,
        `Recording ID: ${item.answer.recordingId}`,
        `IELTS speaking part: ${item.answer.part}`,
        `Question: ${item.answer.questionLabel}`,
        `Spoken duration (seconds): ${Math.round(item.answer.duration)}`,
      ].join("\n")
    ),
    wrapTranscriptAsData(item.transcript),
  ].join("\n")).join("\n\n");

  const multiAnswerRule = usable.length > 1
    ? [
        `This submission contains ${usable.length} separate recorded answers from one IELTS speaking test.`,
        "Judge the four criteria across ALL answers together, weighting sustained performance over any single answer.",
        'Additionally return an "answerNotes" array with one object per recording, using the exact "recordingId" values above and the keys "summary", "strengths", "priorities" and "grammarCorrections".',
        "Give each answer its own substantive note: what that specific answer did well, what held it back, and the grammar points found in it.",
        'Every "grammarCorrections" entry must quote wording that genuinely appears in that answer\'s transcript.',
        "Never rewrite, re-punctuate or paraphrase a transcript. The transcript is evidence, not a draft.",
      ].join(" ")
    : "";

  const prompt = [
    transcriptBlocks,
    multiAnswerRule,
    EVALUATION_JSON_SCHEMA_PROMPT,
  ]
    .filter(Boolean)
    .join("\n\n");

  let evaluation: Evaluation;
  try {
    const raw = await callOpenRouter({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: `${STELLA_SYSTEM_INSTRUCTION}\n\n${STELLA_SCOPE_RULE}`,
      maxTokens: MAX_ANALYSIS_OUTPUT_TOKENS,
      jsonMode: true,
      /*
       * Band judgements are the one place a reasoning pass earns its cost:
       * four criteria have to stay consistent with each other and with the
       * descriptor table across up to twenty answers. Medium, not high — high
       * effort on a full mock pushed generation past the client timeout, and
       * it failed after Deepgram had already been paid.
       */
      reasoningEffort: "medium",
    });
    evaluation = evaluationSchema.parse(parseJson(raw));
  } catch (error) {
    console.error("[evaluate] feedback provider returned an invalid result", error);
    return reply({
      code: "FEEDBACK_FAILED",
      message: "Stella couldn't produce reliable feedback for this submission. Please try again.",
    }, 502);
  }

  /*
   * Every transcript in this submission, normalized once. Used to verify that
   * a quoted "original" in an upgraded sample really was said by the student.
   */
  const transcriptHaystack = normalizeForMatch(
    usable.map((item) => item.transcript).join(" ")
  );

  let criteria: AiCriterionScore[];
  try {
    criteria = criteriaFrom(evaluation, transcriptHaystack);
  } catch (error) {
    console.error("[evaluate] incomplete feedback criteria", error);
    return reply({
      code: "FEEDBACK_INCOMPLETE",
      message: "Stella couldn't produce complete feedback for this submission. Please try again.",
    }, 502);
  }

  const notesById = new Map(
    (evaluation.answerNotes || []).map((note) => [note.recordingId, note])
  );

  const analysedAnswers: AiAnswerAnalysis[] = usable.map((item) => {
    const note = notesById.get(item.answer.recordingId);
    // With a single answer the top-level corrections belong to it. With several,
    // only per-answer notes may be attached, so no answer inherits another's.
    const corrections = note?.grammarCorrections
      ?? (usable.length === 1 ? evaluation.grammarCorrections : []);
    return {
      recordingId: item.answer.recordingId,
      part: item.answer.part,
      questionLabel: item.answer.questionLabel,
      transcript: item.transcript,
      words: item.words,
      events: item.events,
      grammarCorrections: corrections,
      durationSeconds: Math.round(item.answer.duration),
      summary: note?.summary,
      strengths: note?.strengths,
      priorities: note?.priorities,
      audioQuality: {
        usable: true,
        reliability: reliabilityFromWordCount(item.words.length),
        issues: [],
      },
    };
  });

  // ---- Topic relevance -----------------------------------------------------
  const isOffTopic = Boolean(evaluation.isOffTopic);
  const offTopicWarning = evaluation.offTopicWarning || (
    isOffTopic
      ? "Topic Relevance Alert: Your response did not address the required prompt. In official IELTS, an off-topic response heavily penalises Fluency & Coherence and Lexical Resource (maximum Band 3)."
      : undefined
  );

  if (isOffTopic) {
    /*
     * Under the IELTS rubric, off-topic speech destroys coherence to task and
     * appropriate vocabulary, so these two are capped at Band 3.
     *
     * The summary is amended alongside the number. Clamping the score on its
     * own left the model's prose — written before the cap, and often describing
     * a genuinely fluent answer — sitting directly under a Band 3, which reads
     * as a bug to the student and undermines the rest of the report.
     */
    for (const item of criteria) {
      const capped =
        item.criterion === "Fluency & Coherence" ||
        item.criterion === "Lexical Resource";
      if (capped && item.band !== null && item.band > 3) {
        item.band = 3;
        item.summary =
          "Capped at Band 3 because this answer did not address the question that was asked. " +
          item.summary;
      }
    }
  }

  /*
   * Overall band, computed here rather than trusted from the model.
   *
   * IELTS averages the four equally weighted criteria and reports to the
   * nearest half band, so this value CAN end in .5 even though no individual
   * criterion ever does. That is what a real test report does, and matching it
   * is what keeps this estimate comparable to the real thing.
   *
   * Pronunciation is usually unrated here because a transcript cannot evidence
   * it, so the average is taken over the criteria we could actually rate.
   */
  const ratedBands = criteria
    .map((item) => item.band)
    .filter((value): value is number => value !== null);
  const overallBand = ratedBands.length > 0 ? overallSpeakingBand(ratedBands) : null;
  const totalWords = usable.reduce((sum, item) => sum + item.words.length, 0);
  const reliability = reliabilityFromWordCount(totalWords);

  const result: AiAnalysisResult = {
    kind: isFullMock ? "full-mock-estimate" : "practice-estimate",
    answers: analysedAnswers,
    failedAnswers: failures.length > 0 ? failures : undefined,
    overallBand,
    overallRange: overallBand === null ? undefined : {
      low: Math.max(MIN_BAND, overallBand - 0.5),
      high: Math.min(MAX_BAND, overallBand + 0.5),
    },
    criteria,
    grammarCorrections: evaluation.grammarCorrections,
    strengths: evaluation.strengths,
    priorities: evaluation.priorities,
    reliability,
    disclaimer: "This estimate is for practice and self-reflection. Official IELTS examinations are scored under strict certified test conditions.",
    isOffTopic: isOffTopic || undefined,
    offTopicWarning,
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
    console.error("[evaluate] chatSchema parse failed:", JSON.stringify(checked.error.issues));
    return reply({ code: "INVALID_CHAT_REQUEST", message: "The question was invalid." }, 400);
  }
  const body = checked.data;

  if (body.mode === "transcript-recheck" || body.correctedText) {
    return reply({
      code: "AUDIO_RECHECK_REQUIRED",
      message: "A transcript correction needs the original audio to be analysed again. This option is not available yet.",
    }, 422);
  }

  const question = (body.question ?? body.text ?? "").trim();
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

  const history = (body.recentMessages ?? [])
    .filter((message) => typeof message.text === "string" && message.text.trim().length > 0)
    .slice(-8)
    .map((message) => {
      const text = String(message.text || "").trim();
      return {
        role: message.sender === "stella" ? ("assistant" as const) : ("user" as const),
        content: message.sender === "stella" ? text : wrapMessageAsData(text),
      };
    });

  const pageTitle = (body.pageTitle ?? body.metadata?.pageTitle ?? "").trim();
  const context = pageTitle
    ? wrapMessageAsData(`Current IELTS study page: ${pageTitle}`) + "\n\n"
    : "";

  let speakingContext = "";
  const evaluationContext = body.evaluationContext;
  if (evaluationContext) {
    const lines: string[] = [
      "CURRENT TEST & EVALUATION CONTEXT (VISIBLE TO CANDIDATE ON SCREEN):",
    ];
    if (evaluationContext.prompt) {
      lines.push(`Topic/Prompt: ${evaluationContext.prompt}`);
    }
    if (evaluationContext.overallBand !== undefined && evaluationContext.overallBand !== null) {
      lines.push(`Overall Band Awarded: ${evaluationContext.overallBand}`);
    }
    if (evaluationContext.isOffTopic) {
      lines.push("TOPIC RELEVANCE: OFF-TOPIC PENALTY APPLIED. The candidate failed to address the required topic.");
      if (evaluationContext.offTopicWarning) {
        lines.push(`Off-Topic Warning: ${evaluationContext.offTopicWarning}`);
      }
    }
    if (evaluationContext.criteria && evaluationContext.criteria.length > 0) {
      lines.push("Criteria Breakdown:");
      for (const item of evaluationContext.criteria) {
        lines.push(`- ${item.criterion ?? "Criterion"}: Band ${item.band ?? "N/A"}. Summary: ${item.summary ?? ""}`);
      }
    }
    if (evaluationContext.answers && evaluationContext.answers.length > 0) {
      lines.push("Candidate's Spoken Answers & Transcripts:");
      for (const item of evaluationContext.answers) {
        lines.push(`[Part ${item.part ?? "?"} Question: "${item.question ?? ""}"]`);
        lines.push(`Transcript: "${item.transcript ?? ""}"`);
      }
    }
    lines.push("CRITICAL COACH INSTRUCTION: When the student asks why they received a specific score or asks about their performance, you must directly cite the prompt, their exact transcript words, and the criteria breakdown above. Never say you do not know the question or answer!");
    speakingContext =
      wrapMessageAsData(lines.join("\n").slice(0, MAX_CONTEXT_CHARS)) + "\n\n";
  }

  try {
    const text = await callOpenRouter({
      messages: [...history, {
        role: "user",
        content: `${speakingContext}${context}${wrapMessageAsData(question)}`,
      }],
      systemPrompt: `${STELLA_SYSTEM_INSTRUCTION}\n\n${STELLA_CHAT_INSTRUCTION}\n\n${STELLA_SCOPE_RULE}`,
      maxTokens: MAX_CHAT_OUTPUT_TOKENS,
      /*
       * Low, not off. A coaching reply does not improve for a thinking pass,
       * and reasoning tokens are billed and spent before the first visible
       * character. Omitting the field entirely is worse than asking for low:
       * the provider then applies its own default, which can be a long pass.
       */
      reasoningEffort: "low",
    });
    return reply({ answer: text, message: text, reply: text });
  } catch (error) {
    console.error("[evaluate] chat provider failed", error);
    return reply({ code: "CHAT_FAILED", message: "Stella couldn't answer just now. Please try again." }, 502);
  }
}
