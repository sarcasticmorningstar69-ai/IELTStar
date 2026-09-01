"use client";

/**
 * Stella's full-screen analysis workspace.
 *
 * Left  — the question, the student's own audio with speed control, and a
 *         transcript that highlights in time with playback.
 * Right — Stella working, then her rubric feedback. Every piece of evidence is
 *         pinned to a timestamp, and clicking it seeks the audio to that
 *         moment so the student can hear what she is talking about.
 *
 * On mobile the two sides become tabs instead of shrinking into uselessness.
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
  type AiTimestampEvent,
} from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Info,
  Pause,
  Play,
  RotateCcw,
  Send,
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
        value === "high" && "border-success/40 text-success",
        value === "medium" && "border-border text-muted-foreground",
        (value === "low" || value === "insufficient") && "border-warning/40 text-warning"
      )}
    >
      {RELIABILITY_LABEL[value]}
    </span>
  );
}

export function StellaWorkspaceView({
  mockId,
  recordingIds,
}: {
  mockId: string;
  recordingIds: string[];
}) {
  const navigate = useApp((s) => s.navigate);
  const back = useApp((s) => s.back);
  const mock = useProgress((s) => s.mocks.find((m) => m.id === mockId));
  const recordings = useProgress((s) => s.recordings);

  const answers = React.useMemo(() => {
    const byId = new Map(recordings.map((r) => [r.id, r]));
    return recordingIds
      .map((id) => byId.get(id))
      .filter((r): r is RecordingMeta => Boolean(r));
  }, [recordingIds, recordings]);

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [mobileTab, setMobileTab] = React.useState<"answer" | "stella">("answer");

  const active = answers[Math.min(activeIndex, Math.max(0, answers.length - 1))];

  // ---- playback ---------------------------------------------------------
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

  // 60fps tracking so the transcript highlight glides rather than steps.
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

  /** webm/opus blobs report Infinity duration until forced to seek. */
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

  const toggle = async () => {
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

  // ---- analysis ---------------------------------------------------------
  const [running, setRunning] = React.useState(false);
  const [phase, setPhase] = React.useState<"transcribing" | "thinking">("transcribing");
  const [result, setResult] = React.useState<AiAnalysisResult | null>(null);
  const [notice, setNotice] = React.useState("");
  const startedRef = React.useRef(false);

  const runAnalysis = React.useCallback(async () => {
    if (!answers.length) return;
    setRunning(true);
    setPhase("transcribing");
    setNotice("");
    setResult(null);

    const request: AiAnalysisRequest = {
      mode: "mock-analysis",
      surface: "full-mock",
      mockId,
      scope: answers.length === 1 ? "selected-answers" : "entire-mock",
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
      if (!available.length) {
        throw new Error("This audio is no longer stored on this device.");
      }

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
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Stella cannot analyse this yet."
      );
    } finally {
      setRunning(false);
    }
  }, [answers, mock, mockId]);

  React.useEffect(() => {
    if (startedRef.current || !answers.length) return;
    startedRef.current = true;
    void runAnalysis();
  }, [answers.length, runAnalysis]);

  // Stella moves from lining up the audio to actually thinking about it.
  React.useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setPhase("thinking"), 1400);
    return () => window.clearTimeout(timer);
  }, [running]);

  const stellaState: StellaState = running
    ? phase
    : notice
      ? "error"
      : result
        ? "finished"
        : "idle";

  const activeAnalysis = React.useMemo(
    () => result?.answers.find((a) => a.recordingId === active?.id) ?? null,
    [result, active]
  );

  const events = React.useMemo(() => {
    const list = activeAnalysis?.events ?? [];
    return [...list].sort((a, b) => a.start - b.start);
  }, [activeAnalysis]);

  if (!answers.length) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <StellaAvatar state="idle" size={110} className="mx-auto" />
        <p className="mt-5 text-sm text-muted-foreground">
          These recordings are no longer available on this device.
        </p>
        <Button className="mt-5" onClick={() => navigate({ name: "mock-review", mockId })}>
          Back to the mock
        </Button>
      </div>
    );
  }

  const progress = duration && current ? current / duration : 0;

  return (
    <div className="fade-up flex min-h-[100dvh] flex-col">
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

      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StellaAvatar state={stellaState} size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Analysis with Stella</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {answers.length === 1
                ? "1 answer · practice estimate"
                : `${answers.length} answers · full mock estimate`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={back}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close analysis"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile tabs */}
      <div className="flex border-b border-border lg:hidden" role="tablist">
        {(["answer", "stella"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mobileTab === item}
            onClick={() => setMobileTab(item)}
            className={cn(
              "flex-1 border-b-2 py-3 text-xs font-semibold transition-colors",
              mobileTab === item
                ? "border-brand-bright text-foreground"
                : "border-transparent text-muted-foreground"
            )}
          >
            {item === "answer" ? "Your answer" : "Stella"}
          </button>
        ))}
      </div>

      <div className="grid flex-1 gap-0 lg:grid-cols-2">
        {/* ================= LEFT: the answer ================= */}
        <section
          className={cn(
            "flex flex-col gap-5 px-4 py-5 sm:px-6 lg:border-r lg:border-border",
            mobileTab === "answer" ? "flex" : "hidden lg:flex"
          )}
        >
          {/* Answer navigation */}
          {answers.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                disabled={activeIndex === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-40 hover:text-foreground"
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
                      "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                      index === activeIndex
                        ? "border-brand-bright/60 bg-brand-soft text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    P{r.part} · {index + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.min(answers.length - 1, i + 1))}
                disabled={activeIndex >= answers.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground disabled:opacity-40 hover:text-foreground"
                aria-label="Next answer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Question */}
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
              Part {active.part} · Question
            </div>
            <h1 className="mt-2 text-lg leading-snug font-semibold tracking-tight sm:text-xl">
              {active.label}
            </h1>
          </div>

          {/* Player */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:shadow-lg active:scale-95"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <div className="min-w-0 flex-1">
                <StaticWaveform
                  peaks={peaks}
                  progress={progress}
                  onSeek={(r) => duration && seekTo(r * duration)}
                  className="h-12"
                />
                <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
                  <span>{formatTime(current)}</span>
                  <span>{formatTime(duration ?? active.duration)}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {SPEEDS.map((speed, index) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setSpeed(index)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
                    speedIdx === index
                      ? "border-brand-bright/60 bg-brand-soft text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>

          {/* Transcript */}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Transcript
              </div>
              {activeAnalysis?.audioQuality &&
                !activeAnalysis.audioQuality.usable && (
                  <span className="text-[10px] font-medium text-warning">
                    Audio quality limited
                  </span>
                )}
            </div>

            {activeAnalysis?.words?.length ? (
              <p className="scrollbar-thin max-h-72 overflow-y-auto text-sm leading-relaxed">
                {activeAnalysis.words.map((word, index) => {
                  const isNow = current >= word.start && current < word.end;
                  const unsure = word.confidence < 0.6;
                  return (
                    <button
                      key={`${word.start}-${index}`}
                      type="button"
                      onClick={() => seekTo(word.start)}
                      title={unsure ? "Unclear to the recogniser" : undefined}
                      className={cn(
                        "mr-1 rounded px-0.5 transition-colors",
                        isNow && "bg-brand-bright text-primary-foreground",
                        !isNow && unsure && "text-muted-foreground underline decoration-dotted",
                        !isNow && !unsure && "hover:bg-brand-soft"
                      )}
                    >
                      {word.word}
                    </button>
                  );
                })}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                The transcript appears here and highlights word by word as your
                recording plays. Tap any word to jump straight to it.
              </p>
            )}
          </div>
        </section>

        {/* ================= RIGHT: Stella ================= */}
        <section
          className={cn(
            "flex flex-col gap-5 bg-background px-4 py-5 sm:px-6",
            mobileTab === "stella" ? "flex" : "hidden lg:flex"
          )}
        >
          {/* Stella herself */}
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-6 text-center">
            <StellaAvatar state={stellaState} size={running ? 190 : 130} />
            <p className="text-sm font-medium">{STELLA_STATUS_TEXT[stellaState]}</p>
            {running && (
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                {answers.length > 1
                  ? `Working through ${answers.length} answers together, not one at a time — a whole mock is much stronger evidence.`
                  : "Listening closely to this one answer."}
              </p>
            )}
            {!running && (
              <button
                type="button"
                onClick={() => void runAnalysis()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Run again
              </button>
            )}
          </div>

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-2xl border border-border bg-muted/35 p-4 text-xs leading-relaxed text-muted-foreground"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{notice}</p>
            </div>
          )}

          {/* Criteria */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {answers.length === 1 ? "Practice estimate" : "Full mock estimate"}
              </div>
              {result?.reliability && <ReliabilityChip value={result.reliability} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {IELTS_CRITERIA.map((criterion) => {
                const score = result?.criteria.find((c) => c.criterion === criterion);
                const display = score?.range
                  ? `${score.range.low}–${score.range.high}`
                  : score?.band != null
                    ? String(score.band)
                    : "—";
                return (
                  <div
                    key={criterion}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="text-[10px] leading-tight text-muted-foreground">
                      {criterion}
                    </div>
                    <div className="mt-1.5 font-mono text-xl font-semibold tabular-nums">
                      {display}
                    </div>
                    {score?.summary && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {score.summary}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              An estimate for practice only — not an official IELTS result.
            </p>
          </div>

          {/* Timestamped evidence */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Evidence you can hear
            </div>
            {events.length ? (
              <ul className="scrollbar-thin max-h-80 space-y-2 overflow-y-auto pr-1">
                {events.map((event, index) => (
                  <EvidenceRow
                    key={`${event.start}-${index}`}
                    event={event}
                    active={current >= event.start && current < event.end}
                    onSeek={seekTo}
                  />
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
                Each point Stella makes will appear here with a timestamp. Click one
                and the audio jumps to that exact moment, so you can hear the
                evidence yourself instead of taking her word for it.
              </div>
            )}
          </div>

          {/* Follow-up */}
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <input
                disabled
                placeholder="Ask Stella about this answer…"
                className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button size="sm" disabled className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Ask
              </Button>
            </div>
            <p className="mt-2 px-1 text-[10px] text-muted-foreground">
              Follow-up questions open once the transcription and feedback models are
              connected.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function EvidenceRow({
  event,
  active,
  onSeek,
}: {
  event: AiTimestampEvent;
  active: boolean;
  onSeek: (time: number) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSeek(event.start)}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
          active
            ? "border-brand-bright/60 bg-brand-soft"
            : "border-border bg-card hover:border-brand-bright/35"
        )}
      >
        <span className="mt-0.5 shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
          {formatTime(event.start)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold tracking-wide text-brand-bright uppercase">
              {event.criterion}
            </span>
            <ReliabilityChip value={event.reliability} />
          </span>
          <span className="mt-1 block text-xs leading-relaxed">{event.comment}</span>
        </span>
      </button>
    </li>
  );
}
