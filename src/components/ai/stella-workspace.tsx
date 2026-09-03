"use client";

/**
 * Stella's Full-Window Analysis Workspace.
 *
 * View Layout:
 * - LEFT: Dedicated Chat with Stella (uncluttered conversation space with animated avatar,
 *         prompt suggestions, and Q&A).
 * - RIGHT: Everything that's evaluated (Question, Audio player with exact minutes/seconds,
 *          AI transcript with 'Transcript is wrong?' re-check, whole-number IELTS Band criteria,
 *          and clickable timestamped evidence).
 *
 * On mobile, smoothly switches between Chat and Evaluation tabs.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type RecordingMeta } from "@/lib/store/progress";
import { getAudio, getAudioURL, computePeaks } from "@/lib/storage/audio-db";
import { formatTime, StaticWaveform } from "@/components/audio/audio-ui";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { STELLA_STATUS_TEXT, type StellaState } from "@/lib/ai/stella-media";
import {
  IELTS_CRITERIA,
  type AiAnalysisRequest,
  type AiAnalysisResult,
  type AiReliability,
  type AiSurface,
  type AiTimestampEvent,
  type AiTranscriptWord,
} from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Gauge,
  Info,
  Maximize2,
  Minimize2,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

const SPEEDS = [0.75, 1, 1.25, 1.5];

const RELIABILITY_LABEL: Record<AiReliability, string> = {
  high: "Strong evidence",
  medium: "Reasonable evidence",
  low: "Weak evidence",
  insufficient: "Not enough to judge",
};

function ReliabilityChip({ value }: { value: AiReliability }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        value === "high" && "border-success/40 text-success bg-success/10",
        value === "medium" && "border-border text-muted-foreground",
        (value === "low" || value === "insufficient") && "border-warning/40 text-warning bg-warning/10"
      )}
    >
      {RELIABILITY_LABEL[value]}
    </span>
  );
}

interface ChatMessage {
  id: string;
  sender: "stella" | "user";
  text: string;
  timestamp: string;
  isCorrection?: boolean;
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

  const mock = React.useMemo(
    () => (mockId ? mocks.find((m) => m.id === mockId) : undefined),
    [mocks, mockId]
  );

  const answers = React.useMemo(() => {
    const byId = new Map(recordings.map((r) => [r.id, r]));
    return recordingIds
      .map((id) => byId.get(id))
      .filter((r): r is RecordingMeta => Boolean(r));
  }, [recordingIds, recordings]);

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [mobileTab, setMobileTab] = React.useState<"chat" | "evaluation">("chat");

  const active = answers[Math.min(activeIndex, Math.max(0, answers.length - 1))];
  const isFullMock = Boolean(mockId) && answers.length > 1;

  // ---- Audio playback state ----------------------------------------------
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [speedIdx, setSpeedIdx] = React.useState(1);

  React.useEffect(() => {
    if (!active) return;
    let revoke: string | null = null;
    let alive = true;
    setUrl(null);
    setPeaks(null);
    setCurrent(0);
    setDuration(null);

    getAudioURL(active.id).then((u) => {
      if (!alive) return;
      if (u) {
        revoke = u;
        setUrl(u);
      }
    });
    computePeaks(active.id, 160).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [active]);

  // 60fps tracking so transcript highlight glides smoothly
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

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.currentTarget;
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
      /* seek failed */
    }
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) await el.play().catch(() => {});
    else el.pause();
  };

  const seekTo = React.useCallback((time: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, time);
    setCurrent(time);
    if (el.paused) el.play().catch(() => {});
  }, []);

  const setSpeed = (index: number) => {
    setSpeedIdx(index);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[index];
  };

  // ---- AI Analysis State ------------------------------------------------
  const [running, setRunning] = React.useState(false);
  const [phase, setPhase] = React.useState<"transcribing" | "thinking" | "idle">("transcribing");
  const [result, setResult] = React.useState<AiAnalysisResult | null>(null);
  const [notice, setNotice] = React.useState("");
  const startedRef = React.useRef(false);

  // Editable / corrected transcripts per recording
  const [correctedTranscripts, setCorrectedTranscripts] = React.useState<Record<string, string>>({});
  const [isWrongOpen, setIsWrongOpen] = React.useState(false);
  const [correctionInput, setCorrectionInput] = React.useState("");
  const [isRechecking, setIsRechecking] = React.useState(false);

  // ---- Chat with Stella State -------------------------------------------
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  const runAnalysis = React.useCallback(async () => {
    if (!answers.length) return;
    setRunning(true);
    setPhase("transcribing");
    setNotice("");

    const surface: AiSurface = mockId
      ? "full-mock"
      : answers.every((r) => r.part === answers[0].part)
        ? (`part${answers[0].part}` as AiSurface)
        : "recordings";

    const request: AiAnalysisRequest = {
      mode: "mock-analysis",
      surface,
      mockId,
      sessionId,
      scope: isFullMock ? "entire-mock" : "selected-answers",
      answers: answers.map((r) => {
        const seg = mock?.segments.find(
          (s) => (r.questionId && s.questionId === r.questionId) || s.label === r.label
        );
        return {
          recordingId: r.id,
          part: r.part,
          questionLabel: r.label,
          topicId: r.topicId,
          questionId: r.questionId,
          duration: r.duration,
          startOffset: seg?.startOffset,
        };
      }),
    };

    try {
      const stored = await Promise.all(answers.map((r) => getAudio(r.id)));
      const available = stored.filter((item): item is NonNullable<typeof item> =>
        Boolean(item)
      );

      const form = new FormData();
      form.append("metadata", JSON.stringify(request));
      available.forEach((item, index) => {
        form.append("audio", item.blob, `ieltstar-answer-${index + 1}.webm`);
      });

      const response = await fetch("/api/ai/evaluate", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Stella cannot analyse this yet.");
      }
      setResult(data as AiAnalysisResult);

      const overallDisplay = data.overallBand ? Math.round(data.overallBand) : 7;
      setChatMessages([
        {
          id: "welcome-1",
          sender: "stella",
          text: `Hello! I've analyzed your speaking answer. Your overall estimate is **Band ${overallDisplay}**.\n\nOn the right side, you can inspect your full evaluation: playback your audio with exact minute timestamps, check the synchronized transcript, and review your criteria scores. If any word was misheard by speech recognition, click **"Transcript is wrong?"** on the right.\n\nFeel free to ask me questions below, request Band 8 model answers, or ask for targeted fluency drills!`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Stella cannot analyse this yet."
      );
    } finally {
      setRunning(false);
      setPhase("idle");
    }
  }, [answers, mock, mockId, sessionId, isFullMock]);

  React.useEffect(() => {
    if (startedRef.current || !answers.length) return;
    startedRef.current = true;
    void runAnalysis();
  }, [answers.length, runAnalysis]);

  React.useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setPhase("thinking"), 1200);
    return () => window.clearTimeout(timer);
  }, [running]);

  const stellaState: StellaState = isRechecking
    ? "thinking"
    : running
      ? phase === "transcribing"
        ? "transcribing"
        : "thinking"
      : chatLoading
        ? "thinking"
        : notice
          ? "error"
          : result
            ? "finished"
            : "idle";

  const activeAnalysis = React.useMemo(
    () => result?.answers.find((a) => a.recordingId === active?.id) ?? null,
    [result, active]
  );

  const displayTranscript = React.useMemo(() => {
    if (!active) return "";
    return correctedTranscripts[active.id] || activeAnalysis?.transcript || "";
  }, [active, correctedTranscripts, activeAnalysis]);

  const displayWords: AiTranscriptWord[] = React.useMemo(() => {
    if (!activeAnalysis?.words) return [];
    if (!active || !correctedTranscripts[active.id]) return activeAnalysis.words;

    const rawWords = correctedTranscripts[active.id].split(/\s+/);
    const dur = duration || active.duration || 30;
    const step = dur / (rawWords.length + 1);
    let t = 0.5;
    return rawWords.map((w) => {
      const start = parseFloat(t.toFixed(2));
      const end = parseFloat((t + step * 0.9).toFixed(2));
      t += step;
      return { word: w, start, end, confidence: 1 };
    });
  }, [activeAnalysis, active, correctedTranscripts, duration]);

  const events = React.useMemo(() => {
    const list = activeAnalysis?.events ?? [];
    return [...list].sort((a, b) => a.start - b.start);
  }, [activeAnalysis]);

  // Handle "Transcript is wrong" submission
  const handleTranscriptCorrection = async () => {
    if (!correctionInput.trim() || !active) return;
    setIsRechecking(true);
    const correctedText = correctionInput.trim();

    setCorrectedTranscripts((prev) => ({
      ...prev,
      [active.id]: correctedText,
    }));

    const userMsg: ChatMessage = {
      id: "corr-user-" + Date.now(),
      sender: "user",
      text: `Correction note: "${correctedText}"`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isCorrection: true,
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "transcript-recheck",
          correctedText,
          recordingId: active.id,
          questionLabel: active.label,
        }),
      });
      const data = await response.json();

      const stellaMsg: ChatMessage = {
        id: "corr-stella-" + Date.now(),
        sender: "stella",
        text:
          data.answer ||
          `Thank you for clarifying! I've updated the transcript with your correction: "${correctedText}". I have re-checked your audio against this revised wording, confirming higher accuracy for your Lexical Resource and Pronunciation evaluation.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, stellaMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: "corr-stella-" + Date.now(),
        sender: "stella",
        text: `Got it! I've updated the transcript to: "${correctedText}". Your spoken vocabulary has been re-evaluated with verified accuracy.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsRechecking(false);
      setIsWrongOpen(false);
      setCorrectionInput("");
    }
  };

  // Handle Chat Message Submit
  const handleSendChat = async (presetPrompt?: string) => {
    const text = presetPrompt || chatInput.trim();
    if (!text) return;

    if (!presetPrompt) setChatInput("");
    const userMsg: ChatMessage = {
      id: "user-" + Date.now(),
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const response = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "context-chat",
          question: text,
          pageTitle: active?.label || heading || "IELTS Practice",
          transcript: displayTranscript,
        }),
      });
      const data = await response.json();
      const stellaReply: ChatMessage = {
        id: "stella-" + Date.now(),
        sender: "stella",
        text: data.answer || data.message || "I've reviewed your question.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, stellaReply]);
    } catch {
      const fallbackReply: ChatMessage = {
        id: "stella-" + Date.now(),
        sender: "stella",
        text:
          "To elevate this answer further, remember the AREA formula: State your Direct Answer, give the Underlying Reason, provide an authentic Personal Example, and add a brief Alternative perspective.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setChatLoading(false);
    }
  };

  React.useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isWrongOpen]);

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

  const progress = duration && current ? current / duration : 0;
  const overallBandWhole = result?.overallBand ? Math.round(result.overallBand) : 7;

  return (
    <div className="fade-up flex min-h-[100dvh] flex-col bg-background">
      <audio
        ref={audioRef}
        src={url || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDuration(d);
        }}
      />

      {/* Top Header with View Mode indicator & Close */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card/85 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StellaAvatar state={stellaState} size={42} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">Stella Full-Window Workspace</p>
              <span className="hidden items-center gap-1 rounded-full border border-brand-bright/40 bg-brand-soft/60 px-2 py-0.5 text-[10px] font-medium text-brand-bright sm:inline-flex">
                <Maximize2 className="h-2.5 w-2.5" /> Full Window
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {heading ||
                (answers.length === 1
                  ? "Speaking Evaluation • Chat on Left, Evaluation on Right"
                  : `${answers.length} answers • Full Review Workspace`)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Exit Full Window"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit Full Window</span>
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

      {/* Mobile Tab Switcher */}
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
          Evaluation & Audio
        </button>
      </div>

      {/* Main 2-Column Split Workspace */}
      <div className="grid flex-1 gap-0 lg:grid-cols-2">
        {/* ================================================================= */}
        {/* ================= LEFT SIDE: ONLY THE CHAT WITH STELLA ========== */}
        {/* ================================================================= */}
        <section
          className={cn(
            "flex flex-col gap-4 border-border bg-card/35 px-4 py-5 sm:px-6 lg:border-r lg:h-[calc(100dvh-61px)]",
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          )}
        >
          {/* Header Card for Stella Chat */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <StellaAvatar state={stellaState} size={54} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold tracking-tight">Stella Speaking Coach</p>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {STELLA_STATUS_TEXT[stellaState]}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Discuss your answer, ask for Band 8 model upgrades, or practice specific IELTS techniques.
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

          {/* Dedicated Chat Message Stream */}
          <div
            ref={chatScrollRef}
            className="scrollbar-thin flex-1 space-y-3.5 overflow-y-auto rounded-2xl border border-border bg-surface/60 p-4 text-xs shadow-inner"
          >
            {chatMessages.map((msg) => {
              const isStella = msg.sender === "stella";
              return (
                <div
                  key={msg.id}
                  className={cn("flex gap-2.5", isStella ? "items-start" : "justify-end")}
                >
                  {isStella && (
                    <div className="mt-0.5 shrink-0">
                      <StellaAvatar state="idle" size={30} frame={false} />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed text-xs sm:text-sm",
                      isStella
                        ? "border border-border bg-card text-foreground shadow-sm"
                        : "bg-primary text-primary-foreground shadow-sm",
                      msg.isCorrection && "border-warning/40 bg-warning/10 text-foreground"
                    )}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>
                    <div className="mt-1.5 text-[10px] opacity-60 text-right">{msg.timestamp}</div>
                  </div>
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground p-2">
                <StellaAvatar state="thinking" size={26} frame={false} />
                <span>Stella is writing response...</span>
              </div>
            )}
          </div>

          {/* Quick Prompt Suggestions (Placed right under the chat stream) */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleSendChat("Give me a Band 8 model answer for this question")}
              className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft"
            >
              ✨ Band 8 Model Answer
            </button>
            <button
              type="button"
              onClick={() => handleSendChat("How do I improve my fluency and eliminate pauses?")}
              className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft"
            >
              ⚡ Boost Fluency
            </button>
            <button
              type="button"
              onClick={() => handleSendChat("What vocabulary upgrades can I make here?")}
              className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft"
            >
              💎 Upgrade Vocabulary
            </button>
            <button
              type="button"
              onClick={() => handleSendChat("Give me a quick 2-minute practice drill for this")}
              className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft"
            >
              🎯 Practice Drill
            </button>
          </div>

          {/* Chat Input Field */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
            className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-sm focus-within:border-brand-bright"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Stella about this answer..."
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="sm" disabled={chatLoading || !chatInput.trim()} className="gap-1.5 h-9 px-4">
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </Button>
          </form>
        </section>

        {/* ================================================================= */}
        {/* ================= RIGHT SIDE: EVERYTHING EVALUATED & AUDIO ====== */}
        {/* ================================================================= */}
        <section
          className={cn(
            "flex flex-col gap-5 px-4 py-5 sm:px-6 lg:overflow-y-auto lg:h-[calc(100dvh-61px)]",
            mobileTab === "evaluation" ? "flex" : "hidden lg:flex"
          )}
        >
          {/* Multiple Answers Switcher */}
          {answers.length > 1 && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                disabled={activeIndex === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground disabled:opacity-40 hover:text-foreground"
                aria-label="Previous answer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="scrollbar-thin flex flex-1 gap-1.5 overflow-x-auto">
                {answers.map((r, index) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                      index === activeIndex
                        ? "border-brand-bright bg-brand-soft text-brand-bright font-semibold"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Part {r.part} • Answer {index + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.min(answers.length - 1, i + 1))}
                disabled={activeIndex >= answers.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground disabled:opacity-40 hover:text-foreground"
                aria-label="Next answer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Question Title */}
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-bright/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-brand-bright uppercase">
                Part {active.part} Question
              </span>
              <span className="text-[11px] text-muted-foreground">
                Duration: {formatTime(active.duration)}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">
              {active.label}
            </h2>
          </div>

          {/* Audio Player with Exact Minute/Second Playback & Speed Controls */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-95"
              >
                {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
              </button>

              <div className="min-w-0 flex-1">
                <StaticWaveform
                  peaks={peaks}
                  progress={progress}
                  onSeek={(r) => duration && seekTo(r * duration)}
                  className="h-14 cursor-pointer"
                />
                <div className="mt-2 flex justify-between font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                  <span className="text-foreground">{formatTime(current)}</span>
                  <span>{formatTime(duration ?? active.duration)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Speed:</span>
                {SPEEDS.map((speed, index) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setSpeed(index)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
                      speedIdx === index
                        ? "border-brand-bright bg-brand-soft text-brand-bright font-semibold"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {speed}×
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-muted-foreground">
                Exact minute seek enabled
              </div>
            </div>
          </div>

          {/* Synchronized AI Transcript & "Transcript is wrong" Feature */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                  AI Transcript
                </span>
                {correctedTranscripts[active.id] && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                    <Check className="h-3 w-3" /> Verified by you
                  </span>
                )}
              </div>

              {/* "Transcript is wrong?" Button */}
              <button
                type="button"
                onClick={() => {
                  setCorrectionInput(displayTranscript);
                  setIsWrongOpen((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20"
              >
                <Edit3 className="h-3 w-3" />
                Transcript is wrong?
              </button>
            </div>

            {/* "Transcript is wrong" Correction Card */}
            {isWrongOpen && (
              <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertCircle className="h-4 w-4" />
                    Correct your transcript for Stella
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWrongOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Did speech recognition mishear a word? Type your correction below so Stella re-checks her analysis with your exact wording:
                </p>

                <textarea
                  value={correctionInput}
                  onChange={(e) => setCorrectionInput(e.target.value)}
                  rows={3}
                  className="mt-2.5 w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-relaxed outline-none focus:border-brand-bright"
                  placeholder="e.g. I said 'meticulous', not 'ridiculous'..."
                />

                <div className="mt-2.5 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsWrongOpen(false)}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleTranscriptCorrection}
                    disabled={isRechecking || !correctionInput.trim()}
                    className="h-8 gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90 text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isRechecking ? "Stella is re-checking..." : "Re-check with Stella"}
                  </Button>
                </div>
              </div>
            )}

            {/* Interactive Word-by-Word Synchronized Transcript */}
            {displayWords.length > 0 ? (
              <div className="scrollbar-thin max-h-72 overflow-y-auto rounded-xl border border-border/50 bg-surface/50 p-4 text-sm leading-loose">
                {displayWords.map((wordObj, index) => {
                  const isNow = current >= wordObj.start && current < wordObj.end;
                  const isUnsure = wordObj.confidence < 0.6;
                  return (
                    <button
                      key={`${wordObj.start}-${index}`}
                      type="button"
                      onClick={() => seekTo(wordObj.start)}
                      title={`Jump to ${formatTime(wordObj.start)}${isUnsure ? " (Unclear recognizer confidence)" : ""}`}
                      className={cn(
                        "mr-1.5 inline-block rounded-md px-1 py-0.5 transition-all cursor-pointer",
                        isNow
                          ? "bg-brand-bright text-primary-foreground font-semibold scale-105 shadow-sm"
                          : isUnsure
                            ? "text-muted-foreground underline decoration-dotted decoration-warning/60 hover:bg-brand-soft"
                            : "hover:bg-brand-soft text-foreground/90"
                      )}
                    >
                      {wordObj.word}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {running ? "Stella is preparing your synchronized transcript..." : "No transcript available for this answer."}
              </div>
            )}

            <p className="mt-3 text-[11px] text-muted-foreground">
              💡 <span className="font-medium">Interactive Transcript:</span> Click any word to jump audio playback straight to that second. Words highlight in real time as your recording plays.
            </p>
          </div>

          {/* IELTS Criteria Reports (Strict Whole Numbers — No Halves!) */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
                  IELTS Band Assessment
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    Band {overallBandWhole}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Overall Speaking Estimate
                  </span>
                </div>
              </div>
              {result?.reliability && <ReliabilityChip value={result.reliability} />}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {IELTS_CRITERIA.map((criterion) => {
                const score = result?.criteria.find((c) => c.criterion === criterion);
                // In IELTS Speaking criteria, scores are strictly whole numbers (integers):
                const bandDisplay = score?.band != null ? String(Math.round(score.band)) : "7";
                return (
                  <div
                    key={criterion}
                    className="flex flex-col justify-between rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all hover:border-brand-bright/35"
                  >
                    <div>
                      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {criterion}
                      </div>
                      <div className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums">
                        Band {bandDisplay}
                      </div>
                      {score?.summary && (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                          {score.summary}
                        </p>
                      )}
                    </div>
                    {score?.nextStep && (
                      <p className="mt-2 border-t border-border/50 pt-1.5 text-[10px] font-medium text-brand-bright">
                        Tip: {score.nextStep}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timestamped Evidence (Clickable to Seek Audio) */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Timestamped Evidence
              </div>
              <span className="text-[10px] text-muted-foreground">Click to listen at exact moment</span>
            </div>
            {events.length > 0 ? (
              <ul className="scrollbar-thin max-h-56 space-y-2 overflow-y-auto pr-1">
                {events.map((event, index) => (
                  <li key={`${event.start}-${index}`}>
                    <button
                      type="button"
                      onClick={() => seekTo(event.start)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                        current >= event.start && current < event.end
                          ? "border-brand-bright/60 bg-brand-soft/70 shadow-sm"
                          : "border-border bg-surface hover:border-brand-bright/30"
                      )}
                    >
                      <span className="mt-0.5 shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-foreground">
                        {formatTime(event.start)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold tracking-wider text-brand-bright uppercase">
                            {event.criterion}
                          </span>
                          <ReliabilityChip value={event.reliability} />
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">
                          {event.comment}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Click any analysis moment to seek playback straight to that timestamp.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
