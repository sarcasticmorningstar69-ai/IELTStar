"use client";

/**
 * Stella's full-window analysis workspace.
 *
 * LEFT: conversation with Stella.
 * RIGHT: one card per recording — audio player, status, and an expandable
 *        transcript, followed by the overall assessment for the submission.
 *
 * Nothing on this screen is invented. If Stella has not returned a result for
 * a recording, the card says so; it never shows a sample transcript or a
 * placeholder band score. Deepgram's transcript is the only transcript: a
 * student-typed correction is stored and displayed separately, clearly marked
 * as not verified against the audio.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type RecordingMeta } from "@/lib/store/progress";
import { useAuth } from "@/lib/auth/auth-context";
import { getAudio, getAudioURL, computePeaks } from "@/lib/storage/audio-db";
import { formatTime, StaticWaveform } from "@/components/audio/audio-ui";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { STELLA_STATUS_TEXT, type StellaState } from "@/lib/ai/stella-media";
import type {
  AiAnalysisRequest,
  AiAnalysisResult,
  AiAnswerAnalysis,
  AiAnswerFailure,
  AiReliability,
  AiSurface,
} from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CriteriaFlipCards } from "@/components/ai/criteria-flip-card";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Send,
  X,
} from "lucide-react";

const SPEEDS = [0.75, 1, 1.25, 1.5];
const REQUEST_TIMEOUT_MS = 6 * 60 * 1000;

const RELIABILITY_LABEL: Record<AiReliability, string> = {
  high: "Strong evidence",
  medium: "Reasonable evidence",
  low: "Weak evidence",
  insufficient: "Not enough to judge",
};

type Stage = "idle" | "preparing" | "uploading" | "reviewing" | "done";

interface ChatMessage {
  id: string;
  sender: "stella" | "user";
  text: string;
  timestamp: string;
  isCorrection?: boolean;
}

function clockLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ReliabilityChip({ value }: { value: AiReliability }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        value === "high" && "border-success/40 text-success bg-success/10",
        value === "medium" && "border-border text-muted-foreground",
        (value === "low" || value === "insufficient") &&
          "border-warning/40 text-warning bg-warning/10"
      )}
    >
      {RELIABILITY_LABEL[value]}
    </span>
  );
}

/** Group a transcript into readable paragraphs without changing a word. */
function toParagraphs(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    const chunk = sentences.slice(i, i + 3).join(" ").trim();
    if (chunk) paragraphs.push(chunk);
  }
  return paragraphs;
}

type UploadResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
};

/**
 * POST a multipart body with real upload progress.
 *
 * `fetch` cannot report upload progress, and a student uploading a 20-minute
 * mock on a phone needs to see that something is happening.
 */
function postFormWithProgress(
  url: string,
  form: FormData,
  token: string | null,
  onProgress: (ratio: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        body = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () =>
      reject(new Error("Your connection dropped before Stella received the recordings."));
    xhr.ontimeout = () =>
      reject(new Error("That took too long. Your recordings are still saved on this device."));
    xhr.send(form);
  });
}

export function StellaWorkspaceView({
  recordingIds,
  mockId,
  sessionId,
  heading,
}: {
  recordingIds: string[];
  mockId?: string;
  sessionId?: string;
  heading?: string;
}) {
  const navigate = useApp((s) => s.navigate);
  const back = useApp((s) => s.back);
  const mocks = useProgress((s) => s.mocks);
  const recordings = useProgress((s) => s.recordings);
  const { user, session, openAuthModal } = useAuth();

  const mock = React.useMemo(
    () => (mockId ? mocks.find((m) => m.id === mockId) : undefined),
    [mocks, mockId]
  );

  /** Only real recordings. A missing recording is reported, never invented. */
  const answers = React.useMemo(() => {
    const byId = new Map(recordings.map((r) => [r.id, r]));
    return recordingIds
      .map((id) => byId.get(id))
      .filter((r): r is RecordingMeta => Boolean(r));
  }, [recordingIds, recordings]);

  const isFullMock = Boolean(mockId) && answers.length > 1;

  const [mobileTab, setMobileTab] = React.useState<"chat" | "evaluation">("evaluation");

  // ---- Analysis state ----------------------------------------------------
  const [stage, setStage] = React.useState<Stage>("idle");
  const [uploadRatio, setUploadRatio] = React.useState(0);
  const [result, setResult] = React.useState<AiAnalysisResult | null>(null);
  const [failures, setFailures] = React.useState<AiAnswerFailure[]>([]);
  const [notice, setNotice] = React.useState("");
  const [corrections, setCorrections] = React.useState<Record<string, string>>({});
  const startedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  /**
   * One stable id per submission. Sent unchanged on retries so the server
   * reserves quota once, no matter how many network attempts it takes.
   */
  const requestIdRef = React.useRef<string>(
    `req${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  );

  const running = stage === "preparing" || stage === "uploading" || stage === "reviewing";

  // ---- Chat state --------------------------------------------------------
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  const analysisByRecording = React.useMemo(() => {
    const map = new Map<string, AiAnswerAnalysis>();
    (result?.answers || []).forEach((item) => map.set(item.recordingId, item));
    return map;
  }, [result]);

  const failureByRecording = React.useMemo(() => {
    const map = new Map<string, AiAnswerFailure>();
    failures.forEach((item) => map.set(item.recordingId, item));
    return map;
  }, [failures]);

  const runAnalysis = React.useCallback(
    async (onlyRecordingIds?: string[]) => {
      if (!answers.length || inFlightRef.current) return;

      const selected = onlyRecordingIds
        ? answers.filter((r) => onlyRecordingIds.includes(r.id))
        : answers;
      if (!selected.length) return;

      inFlightRef.current = true;
      setNotice("");
      setUploadRatio(0);
      setStage("preparing");

      const surface: AiSurface = mockId
        ? "full-mock"
        : selected.every((r) => r.part === selected[0].part)
          ? (`part${selected[0].part}` as AiSurface)
          : "recordings";

      try {
        const stored = await Promise.all(
          selected.map(async (r) => ({ meta: r, audio: await getAudio(r.id) }))
        );
        const available = stored.filter(
          (item): item is { meta: RecordingMeta; audio: NonNullable<typeof item.audio> } =>
            Boolean(item.audio)
        );
        const lost = stored.filter((item) => !item.audio);

        if (!available.length) {
          setNotice(
            "The audio for these answers is no longer stored on this device, so Stella cannot analyse them."
          );
          setStage("idle");
          return;
        }

        const request: AiAnalysisRequest = {
          mode: "mock-analysis",
          surface,
          mockId,
          sessionId,
          analysisRequestId: requestIdRef.current,
          scope: isFullMock && !onlyRecordingIds ? "entire-mock" : "selected-answers",
          answers: available.map(({ meta }) => {
            const segment = mock?.segments.find(
              (s) =>
                (meta.questionId && s.questionId === meta.questionId) ||
                s.label === meta.label
            );
            return {
              recordingId: meta.id,
              part: meta.part,
              questionLabel: meta.label,
              topicId: meta.topicId,
              questionId: meta.questionId,
              duration: meta.duration,
              startOffset: segment?.startOffset,
            };
          }),
        };

        const form = new FormData();
        form.append("metadata", JSON.stringify(request));
        available.forEach(({ meta, audio }) => {
          // Field name carries the recording id, so the server never has to
          // guess which transcript belongs to which question.
          form.append(`audio:${meta.id}`, audio.blob, `${meta.id}.webm`);
        });

        setStage("uploading");
        const response = await postFormWithProgress(
          "/api/ai/evaluate",
          form,
          session?.access_token || null,
          (ratio) => {
            setUploadRatio(ratio);
            if (ratio >= 1) setStage("reviewing");
          }
        );
        setStage("reviewing");

        const body = response.body || {};
        if (!response.ok) {
          const failed = Array.isArray(body.failedAnswers)
            ? (body.failedAnswers as AiAnswerFailure[])
            : [];
          setFailures(failed);
          setNotice(
            typeof body.message === "string"
              ? body.message
              : "Stella couldn't analyse this submission. Your recordings are safe on this device."
          );
          setStage("idle");
          return;
        }

        const fresh = body as unknown as AiAnalysisResult;
        setResult((previous) => {
          if (!previous || !onlyRecordingIds) return fresh;
          const merged = new Map<string, AiAnswerAnalysis>();
          previous.answers.forEach((item) => merged.set(item.recordingId, item));
          fresh.answers.forEach((item) => merged.set(item.recordingId, item));
          return { ...fresh, answers: Array.from(merged.values()) };
        });

        const stillFailed = [
          ...(fresh.failedAnswers || []),
          ...lost.map(({ meta }) => ({
            recordingId: meta.id,
            questionLabel: meta.label,
            code: "TRANSCRIPTION_FAILED" as const,
            message: "The audio for this answer is not stored on this device.",
          })),
        ];
        setFailures(stillFailed);
        setStage("done");

        setChatMessages((previous) => {
          if (previous.length > 0) return previous;
          const bandLine =
            fresh.overallBand === null || fresh.overallBand === undefined
              ? "I've reviewed your speaking, but there wasn't enough clear speech for me to put a band on it."
              : `I've reviewed your speaking. My estimate is Band ${Math.round(fresh.overallBand)}.`;
          return [
            {
              id: "welcome-1",
              sender: "stella",
              text: `${bandLine}\n\nEach recording is on the right with its own player. Open "Show transcript" under any answer to read exactly what the speech recogniser heard. Ask me anything about your answers below.`,
              timestamp: clockLabel(),
            },
          ];
        });
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Stella couldn't be reached. Your recordings are safe on this device."
        );
        setStage("idle");
      } finally {
        inFlightRef.current = false;
        setUploadRatio(0);
      }
    },
    [answers, isFullMock, mock, mockId, session?.access_token, sessionId]
  );

  React.useEffect(() => {
    if (!user || startedRef.current || !answers.length) return;
    startedRef.current = true;
    void runAnalysis();
  }, [user, answers.length, runAnalysis]);

  const stellaState: StellaState = running
    ? stage === "uploading"
      ? "transcribing"
      : "thinking"
    : chatLoading
      ? "thinking"
      : notice
        ? "error"
        : result
          ? "finished"
          : "idle";

  const handleSendChat = async (presetPrompt?: string) => {
    const text = presetPrompt || chatInput.trim();
    if (!text || chatLoading) return;
    if (!presetPrompt) setChatInput("");

    setChatMessages((previous) => [
      ...previous,
      { id: `user-${Date.now()}`, sender: "user", text, timestamp: clockLabel() },
    ]);
    setChatLoading(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const response = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode: "context-chat",
          question: text,
          pageTitle: heading || "IELTS speaking practice",
        }),
      });
      const data = (await response.json()) as Record<string, unknown>;
      const answer =
        typeof data.answer === "string"
          ? data.answer
          : typeof data.message === "string"
            ? data.message
            : "Stella couldn't answer just now. Please try again.";
      setChatMessages((previous) => [
        ...previous,
        { id: `stella-${Date.now()}`, sender: "stella", text: answer, timestamp: clockLabel() },
      ]);
    } catch {
      // No invented coaching: say plainly that the message did not get through.
      setChatMessages((previous) => [
        ...previous,
        {
          id: `stella-${Date.now()}`,
          sender: "stella",
          text: "Your message didn't reach me — the connection dropped. Please send it again.",
          timestamp: clockLabel(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveCorrection = React.useCallback(
    (recordingId: string, corrected: string, questionLabel: string) => {
      setCorrections((previous) => ({ ...previous, [recordingId]: corrected }));
      setChatMessages((previous) => [
        ...previous,
        {
          id: `corr-${Date.now()}`,
          sender: "user",
          text: `Transcript correction for "${questionLabel}": ${corrected}`,
          timestamp: clockLabel(),
          isCorrection: true,
        },
        {
          id: `corr-reply-${Date.now()}`,
          sender: "stella",
          text: "Saved as your own correction and shown next to the original. I haven't re-scored anything: re-checking wording against the audio needs a fresh analysis, which isn't available yet.",
          timestamp: clockLabel(),
        },
      ]);
    },
    []
  );

  React.useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ---- Guards ------------------------------------------------------------
  if (!user) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-bright/20 bg-brand-soft shadow-lg">
          <StellaAvatar state="idle" size={48} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Sign in for Stella AI analysis
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Stella evaluates your IELTS speaking recordings using speech recognition and the official
          Cambridge band criteria. Create a free account or sign in to view your analysis.
        </p>
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            size="lg"
            className="w-full cursor-pointer font-semibold shadow-sm sm:w-auto"
            onClick={() => openAuthModal("signup")}
          >
            Create account / Sign in
          </Button>
          <Button variant="outline" size="lg" className="w-full cursor-pointer sm:w-auto" onClick={back}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!answers.length) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <StellaAvatar state="idle" size={110} className="mx-auto" />
        <p className="mt-5 text-sm text-muted-foreground">
          These recordings are no longer available on this device.
        </p>
        <Button
          className="mt-5"
          onClick={() =>
            mockId ? navigate({ name: "mock-review", mockId }) : navigate({ name: "recordings" })
          }
        >
          {mockId ? "Back to the mock" : "All recordings"}
        </Button>
      </div>
    );
  }

  const totalSeconds = answers.reduce((sum, r) => sum + (r.duration || 0), 0);
  const hasCriteria = (result?.criteria?.length || 0) === 4;

  return (
    <div className="fade-up flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card/85 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StellaAvatar state={stellaState} size={42} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">Stella full-window workspace</p>
              <span className="hidden items-center gap-1 rounded-full border border-brand-bright/40 bg-brand-soft/60 px-2 py-0.5 text-[10px] font-medium text-brand-bright sm:inline-flex">
                <Maximize2 className="h-2.5 w-2.5" /> Full window
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {heading ||
                (answers.length === 1
                  ? "Speaking evaluation"
                  : `${answers.length} answers • ${formatTime(totalSeconds)} of speaking`)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Exit full window"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit full window</span>
          </Button>
          <button
            type="button"
            onClick={back}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex border-b border-border bg-card lg:hidden" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex-1 border-b-2 py-3 text-xs font-semibold transition-colors",
            mobileTab === "chat"
              ? "border-brand-bright text-brand-bright"
              : "border-transparent text-muted-foreground"
          )}
        >
          Chat with Stella
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "evaluation"}
          onClick={() => setMobileTab("evaluation")}
          className={cn(
            "flex-1 border-b-2 py-3 text-xs font-semibold transition-colors",
            mobileTab === "evaluation"
              ? "border-brand-bright text-brand-bright"
              : "border-transparent text-muted-foreground"
          )}
        >
          Recordings &amp; evaluation
        </button>
      </div>

      <div className="grid flex-1 gap-0 lg:grid-cols-2">
        {/* ---------------------------- LEFT: CHAT --------------------------- */}
        <section
          className={cn(
            "flex flex-col gap-4 border-border bg-card/35 px-4 py-5 sm:px-6 lg:h-[calc(100dvh-61px)] lg:border-r",
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          )}
        >
          <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <StellaAvatar state={stellaState} size={54} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold tracking-tight">Stella speaking coach</p>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {STELLA_STATUS_TEXT[stellaState]}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Discuss your answers, ask for a stronger version, or practise a technique.
              </p>
            </div>
          </div>

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
              <p>{notice}</p>
            </div>
          )}

          <div
            ref={chatScrollRef}
            className="scrollbar-thin flex-1 space-y-3.5 overflow-y-auto rounded-2xl border border-border bg-surface/60 p-4 text-xs shadow-inner"
          >
            {chatMessages.length === 0 && !running && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Ask Stella a question about your speaking whenever you are ready.
              </p>
            )}
            {chatMessages.map((message) => {
              const isStella = message.sender === "stella";
              return (
                <div
                  key={message.id}
                  className={cn("flex gap-2.5", isStella ? "items-start" : "justify-end")}
                >
                  {isStella && (
                    <div className="mt-0.5 shrink-0">
                      <StellaAvatar state="idle" size={30} frame={false} />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed sm:text-sm",
                      isStella
                        ? "border border-border bg-card text-foreground shadow-sm"
                        : "bg-primary text-primary-foreground shadow-sm",
                      message.isCorrection && "border-warning/40 bg-warning/10 text-foreground"
                    )}
                  >
                    <p className="whitespace-pre-line">{message.text}</p>
                    <div className="mt-1.5 text-right text-[10px] opacity-60">{message.timestamp}</div>
                  </div>
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex items-center gap-2.5 p-2 text-xs text-muted-foreground">
                <StellaAvatar state="thinking" size={26} frame={false} />
                <span>Stella is writing a reply…</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              ["✨ Band 8 model answer", "Give me a Band 8 model answer for this question"],
              ["⚡ Boost fluency", "How do I improve my fluency and reduce hesitation?"],
              ["💎 Upgrade vocabulary", "What vocabulary upgrades can I make here?"],
              ["🎯 Practice drill", "Give me a two-minute practice drill for this"],
            ].map(([label, prompt]) => (
              <button
                key={label}
                type="button"
                onClick={() => void handleSendChat(prompt)}
                className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:bg-brand-soft hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSendChat();
            }}
            className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-sm focus-within:border-brand-bright"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask Stella about your answers…"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={chatLoading || !chatInput.trim()}
              className="h-9 gap-1.5 px-4"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </Button>
          </form>
        </section>

        {/* ------------------- RIGHT: RECORDINGS + RESULT -------------------- */}
        <section
          className={cn(
            "flex flex-col gap-5 px-4 py-5 sm:px-6 lg:h-[calc(100dvh-61px)] lg:overflow-y-auto",
            mobileTab === "evaluation" ? "flex" : "hidden lg:flex"
          )}
        >
          {running && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-brand-bright/30 bg-brand-soft/40 p-4"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-bright">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {stage === "preparing" && <span>Preparing your recordings…</span>}
                {stage === "uploading" && (
                  <span>
                    Uploading {answers.length === 1 ? "your recording" : `${answers.length} recordings`} —{" "}
                    {Math.round(uploadRatio * 100)}%
                  </span>
                )}
                {stage === "reviewing" && <span>Stella is transcribing and reviewing…</span>}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={cn(
                    "h-full rounded-full bg-brand-bright transition-[width] duration-200",
                    stage === "reviewing" && "animate-pulse"
                  )}
                  style={{
                    width:
                      stage === "uploading" ? `${Math.max(4, uploadRatio * 100)}%` : "100%",
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Please keep this page open. Your recordings stay saved on this device, so nothing is
                lost if something goes wrong.
              </p>
            </div>
          )}

          {failures.length > 0 && (
            <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-warning">
                <AlertCircle className="h-4 w-4" />
                {failures.length === 1
                  ? "One answer could not be analysed"
                  : `${failures.length} answers could not be analysed`}
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {failures.map((failure) => (
                  <li key={failure.recordingId}>
                    <span className="text-foreground">{failure.questionLabel}</span> — {failure.message}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                disabled={running}
                onClick={() => void runAnalysis(failures.map((f) => f.recordingId))}
                className="mt-3 h-8 cursor-pointer gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry failed recordings
              </Button>
            </div>
          )}

          {!running && !result && failures.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No analysis yet for this submission.
              </p>
              <Button
                size="sm"
                className="mt-3 h-8 cursor-pointer text-xs"
                onClick={() => void runAnalysis()}
              >
                Analyse with Stella
              </Button>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                {answers.length === 1 ? "Your answer" : `Your ${answers.length} answers`}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                Each answer keeps its own audio and transcript
              </span>
            </div>

            {answers.map((answer, index) => (
              <AnswerCard
                key={answer.id}
                answer={answer}
                index={index}
                total={answers.length}
                analysis={analysisByRecording.get(answer.id)}
                failure={failureByRecording.get(answer.id)}
                running={running}
                studentCorrection={corrections[answer.id]}
                onSaveCorrection={handleSaveCorrection}
              />
            ))}
          </div>

          {result && (
            <div className="space-y-3.5 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
                    {result.kind === "full-mock-estimate"
                      ? "Full mock estimate"
                      : "Practice estimate"}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                      {result.overallBand === null || result.overallBand === undefined
                        ? "Not scored"
                        : `Band ${Math.round(result.overallBand)}`}
                    </span>
                    {result.overallRange && (
                      <span className="text-xs text-muted-foreground">
                        likely {result.overallRange.low}–{result.overallRange.high}
                      </span>
                    )}
                  </div>
                </div>
                {result.reliability && <ReliabilityChip value={result.reliability} />}
              </div>

              {hasCriteria && (
                <CriteriaFlipCards
                  criteria={result.criteria}
                  overallBand={
                    result.overallBand === null || result.overallBand === undefined
                      ? null
                      : Math.round(result.overallBand)
                  }
                />
              )}

              {result.strengths.length > 0 && (
                <div className="rounded-xl border border-border bg-surface/50 p-3.5">
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    What worked
                  </div>
                  <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-foreground/90">
                    {result.strengths.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.priorities.length > 0 && (
                <div className="rounded-xl border border-border bg-surface/50 p-3.5">
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Work on next
                  </div>
                  <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-foreground/90">
                    {result.priorities.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                {result.disclaimer}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* =========================================================================
 * One recording: player, status, and its own expandable transcript.
 * ========================================================================= */

function AnswerCard({
  answer,
  index,
  total,
  analysis,
  failure,
  running,
  studentCorrection,
  onSaveCorrection,
}: {
  answer: RecordingMeta;
  index: number;
  total: number;
  analysis?: AiAnswerAnalysis;
  failure?: AiAnswerFailure;
  running: boolean;
  studentCorrection?: string;
  onSaveCorrection: (recordingId: string, corrected: string, questionLabel: string) => void;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [speedIdx, setSpeedIdx] = React.useState(1);
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const transcriptId = `transcript-${answer.id}`;
  const transcript = analysis?.transcript || "";
  const words = analysis?.words || [];
  const paragraphs = React.useMemo(() => toParagraphs(transcript), [transcript]);

  React.useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    setUrl(null);
    setPeaks(null);
    getAudioURL(answer.id).then((u) => {
      if (!alive) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      if (u) {
        revoke = u;
        setUrl(u);
      }
    });
    computePeaks(answer.id, 120).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [answer.id]);

  React.useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      const t = el.currentTime;
      if (Math.abs(t - last) > 0.016) {
        last = t;
        setCurrent(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const handleLoadedMetadata = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = event.currentTarget;
    if (isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
      return;
    }
    const onSeeked = () => {
      el.removeEventListener("timeupdate", onSeeked);
      if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", onSeeked);
    try {
      el.currentTime = 1e101;
    } catch {
      /* duration stays unknown and renders as --:-- */
    }
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) await el.play().catch(() => {});
    else el.pause();
  };

  const seekTo = (time: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, time);
    setCurrent(el.currentTime);
    if (el.paused) void el.play().catch(() => {});
  };

  const progress = duration && current ? current / duration : 0;
  const corrections = analysis?.grammarCorrections || [];

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <audio
        ref={audioRef}
        src={url || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={(event) => {
          const d = event.currentTarget.duration;
          if (isFinite(d) && d > 0) setDuration(d);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-brand-bright/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-brand-bright uppercase">
          Part {answer.part}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Answer {index + 1} of {total}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatTime(duration ?? answer.duration)}
        </span>
        {analysis && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Analysed
          </span>
        )}
        {failure && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
            <AlertCircle className="h-3 w-3" /> Not analysed
          </span>
        )}
      </div>

      <h4 className="mt-2 text-sm leading-snug font-semibold tracking-tight sm:text-base">
        {answer.label}
      </h4>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!url}
          aria-label={playing ? "Pause this answer" : "Play this answer"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <StaticWaveform
            peaks={peaks}
            progress={progress}
            onSeek={(ratio) => duration && seekTo(ratio * duration)}
            className="h-12 cursor-pointer"
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
            <span className="text-foreground">{formatTime(current)}</span>
            <span>{formatTime(duration ?? answer.duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Speed:</span>
        {SPEEDS.map((speed, i) => (
          <button
            key={speed}
            type="button"
            onClick={() => {
              setSpeedIdx(i);
              if (audioRef.current) audioRef.current.playbackRate = speed;
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
              speedIdx === i
                ? "border-brand-bright bg-brand-soft font-semibold text-brand-bright"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {speed}×
          </button>
        ))}
      </div>

      {!url && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          The audio for this answer is not stored on this device any more.
        </p>
      )}

      {analysis?.summary && (
        <p className="mt-3 rounded-xl border border-border bg-surface/50 p-3 text-xs leading-relaxed text-foreground/90">
          {analysis.summary}
        </p>
      )}

      {failure && (
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
          {failure.message}
        </p>
      )}

      {/* -------- Transcript reveal, one per recording -------- */}
      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          disabled={!transcript}
          aria-expanded={expanded}
          aria-controls={transcriptId}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:border-brand-bright/50 hover:text-foreground disabled:opacity-50"
        >
          <span>
            {!transcript
              ? running
                ? "Transcript is being prepared…"
                : "No transcript for this answer yet"
              : expanded
                ? "Hide transcript"
                : "Show transcript"}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")}
          />
        </button>

        {expanded && transcript && (
          <div id={transcriptId} className="mt-3 space-y-4">
            <div className="rounded-xl border border-border/70 bg-surface/40 p-4">
              <div className="mb-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Transcript · speech recognition
              </div>
              <div className="space-y-2.5 text-sm leading-relaxed text-foreground/90">
                {paragraphs.map((paragraph, i) => (
                  <p key={i} className="break-words whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            {words.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-surface/40 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Follow along · tap a word to jump there
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Dotted words were unclear to the recogniser
                  </span>
                </div>
                <div className="scrollbar-thin max-h-60 overflow-y-auto text-sm leading-loose">
                  {words.map((word, i) => {
                    const isNow = current >= word.start && current < word.end;
                    const isUnsure = word.confidence < 0.6;
                    return (
                      <button
                        key={`${word.start}-${i}`}
                        type="button"
                        onClick={() => seekTo(word.start)}
                        title={`Jump to ${formatTime(word.start)}`}
                        className={cn(
                          "mr-1.5 inline-block cursor-pointer rounded-md px-1 py-0.5 transition-all",
                          isNow
                            ? "scale-105 bg-brand-bright font-semibold text-primary-foreground shadow-sm"
                            : isUnsure
                              ? "text-muted-foreground underline decoration-dotted decoration-warning/60 hover:bg-brand-soft"
                              : "text-foreground/90 hover:bg-brand-soft"
                        )}
                      >
                        {word.word}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {corrections.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-surface/40 p-4">
                <div className="mb-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                  Grammar notes for this answer
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {corrections.map((correction, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-3">
                      <div className="text-xs">
                        <span className="grammar-strike text-xs">{correction.original}</span>
                        <span className="grammar-correction-tag text-xs">
                          [{correction.corrected}]
                        </span>
                      </div>
                      <p className="mt-2 border-t border-border/50 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">Rule:</strong> {correction.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {studentCorrection && (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
                <div className="mb-1.5 text-[10px] font-bold tracking-wider text-warning uppercase">
                  Your corrected version · not verified against the audio
                </div>
                <p className="text-sm leading-relaxed break-words text-foreground/90">
                  {studentCorrection}
                </p>
              </div>
            )}

            {editing ? (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Type what you actually said. Your version is saved beside the original and
                  labelled as your own correction — it does not change your band scores.
                </p>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  className="mt-2.5 w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed outline-none focus:border-brand-bright"
                />
                <div className="mt-2.5 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 cursor-pointer text-xs"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 cursor-pointer text-xs"
                    disabled={!draft.trim()}
                    onClick={() => {
                      onSaveCorrection(answer.id, draft.trim(), answer.label);
                      setEditing(false);
                    }}
                  >
                    Save my version
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(studentCorrection || transcript);
                  setEditing(true);
                }}
                className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20"
              >
                Transcript is wrong?
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
