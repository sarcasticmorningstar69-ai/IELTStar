"use client";

import * as React from "react";
import { type RecordingMeta } from "@/lib/store/progress";
import { getAudioURL, computePeaks } from "@/lib/storage/audio-db";
import { formatTime, StaticWaveform } from "@/components/audio/audio-ui";
import { CriteriaFlipCards } from "@/components/ai/criteria-flip-card";
import { DeepDivePanel } from "@/components/ai/deep-dive-panel";
import type {
  AiAnalysisResult,
  AiAnswerAnalysis,
  AiAnswerFailure,
  AiReliability,
} from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Flame,
  Rocket,
  ExternalLink,
} from "lucide-react";

const SPEEDS = [0.75, 1, 1.25, 1.5];

const RELIABILITY_LABEL: Record<AiReliability, string> = {
  high: "Strong evidence",
  medium: "Reasonable evidence",
  low: "Weak evidence",
  insufficient: "Not enough to judge",
};

export function ReliabilityChip({ value }: { value: AiReliability }) {
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
export function toParagraphs(text: string): string[] {
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

/* =========================================================================
 * One recording: player, status, and its own expandable transcript.
 * ========================================================================= */

export function AnswerCard({
  answer,
  index,
  total,
  analysis,
  failure,
  running = false,
  studentCorrection,
  onSaveCorrection,
}: {
  answer: RecordingMeta;
  index: number;
  total: number;
  analysis?: AiAnswerAnalysis;
  failure?: AiAnswerFailure;
  running?: boolean;
  studentCorrection?: string;
  onSaveCorrection?: (recordingId: string, corrected: string, questionLabel: string) => void;
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
  const [transcriptView, setTranscriptView] = React.useState<"text" | "interactive">("text");

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

      <h4 className="mt-2 text-sm leading-snug font-semibold tracking-tight sm:text-base break-words [overflow-wrap:anywhere]">
        {answer.label}
      </h4>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!url}
          aria-label={playing ? "Pause this answer" : "Play this answer"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 cursor-pointer"
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
              "rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors cursor-pointer",
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
        <p className="mt-3 rounded-xl border border-border bg-surface/50 p-3 text-xs leading-relaxed text-foreground/90 break-words [overflow-wrap:anywhere]">
          {analysis.summary}
        </p>
      )}

      {failure && (
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-warning break-words [overflow-wrap:anywhere]">
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
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:border-brand-bright/50 hover:text-foreground disabled:opacity-50 cursor-pointer"
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
          <div id={transcriptId} className="mt-3 space-y-3">
            {words.length > 0 && (
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                <div className="inline-flex rounded-lg border border-border/80 bg-surface/80 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTranscriptView("text")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                      transcriptView === "text"
                        ? "bg-brand text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Full Transcript
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranscriptView("interactive")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                      transcriptView === "interactive"
                        ? "bg-brand text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Interactive Follow-Along
                  </button>
                </div>
                {transcriptView === "interactive" && (
                  <span className="text-[10px] text-muted-foreground">
                    Tap a word to jump audio
                  </span>
                )}
              </div>
            )}

            {transcriptView === "text" || words.length === 0 ? (
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
            ) : (
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
                      if (onSaveCorrection) {
                        onSaveCorrection(answer.id, draft.trim(), answer.label);
                      }
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
                className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20 cursor-pointer"
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

/* =========================================================================
 * Full Review & Recordings Panel (Shared between Workspace & Old Chats)
 * ========================================================================= */

export interface WorkspaceReviewPanelProps {
  answers: RecordingMeta[];
  analysisByRecording: Map<string, AiAnswerAnalysis>;
  failureByRecording?: Map<string, AiAnswerFailure>;
  result: AiAnalysisResult | null;
  running?: boolean;
  deepDiveMode?: boolean;
  deepDiveRunning?: boolean;
  uploadRatio?: number;
  stage?: string;
  failures?: AiAnswerFailure[];
  corrections?: Record<string, string>;
  heading?: string;
  onSaveCorrection?: (recordingId: string, corrected: string, questionLabel: string) => void;
  onRunAnalysis?: (onlyRecordingIds?: string[], forceDeepDive?: boolean) => void;
  onAskStella?: (promptText: string) => void;
  onOpenFullWorkspace?: () => void;
  className?: string;
}

export function WorkspaceReviewPanel({
  answers,
  analysisByRecording,
  failureByRecording = new Map(),
  result,
  running = false,
  deepDiveMode = false,
  deepDiveRunning = false,
  uploadRatio = 0,
  stage = "idle",
  failures = [],
  corrections = {},
  heading,
  onSaveCorrection,
  onRunAnalysis,
  onAskStella,
  onOpenFullWorkspace,
  className,
}: WorkspaceReviewPanelProps) {
  const hasCriteria = (result?.criteria?.length || 0) === 4;

  // Fallback: If answers is empty but result has answers, build lightweight placeholders
  const displayAnswers: RecordingMeta[] = React.useMemo(() => {
    if (answers.length > 0) return answers;
    if (!result?.answers?.length) return [];
    return result.answers.map((a, i) => ({
      id: a.recordingId,
      sessionId: "saved",
      part: (a.part as 1 | 2 | 3) || 1,
      startedAt: Date.now(),
      duration: a.durationSeconds || 0,
      mimeType: "audio/webm",
      size: 0,
      label: a.questionLabel || `Question ${i + 1}`,
    }));
  }, [answers, result]);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Top action bar if rendered inside assistant drawer/full-window */}
      {onOpenFullWorkspace && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface/80 p-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-foreground">
              {heading || "Speaking Evaluation & Recordings"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenFullWorkspace}
            className="h-7 cursor-pointer gap-1 text-xs font-semibold hover:bg-brand-soft hover:text-brand-bright"
          >
            <span>Open Dedicated Workspace</span>
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Running Banner */}
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
                Uploading {displayAnswers.length === 1 ? "your recording" : `${displayAnswers.length} recordings`} —{" "}
                {Math.round(uploadRatio * 100)}%
              </span>
            )}
            {stage === "reviewing" && (
              <span>
                {deepDiveRunning
                  ? "Stella is firing high-reasoning boosters (In-Depth Analysis — 2–4 minutes)…"
                  : "Stella is transcribing and reviewing…"}
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                "h-full rounded-full bg-brand-bright transition-[width] duration-200",
                stage === "reviewing" && "animate-pulse"
              )}
              style={{
                width: stage === "uploading" ? `${Math.max(4, uploadRatio * 100)}%` : "100%",
              }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Please keep this page open. Your recordings stay saved on this device, so nothing is lost.
          </p>
        </div>
      )}

      {/* Failures Banner */}
      {failures.length > 0 && onRunAnalysis && (
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
            onClick={() => void onRunAnalysis(failures.map((f) => f.recordingId))}
            className="mt-3 h-8 cursor-pointer gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry failed recordings
          </Button>
        </div>
      )}

      {/* Pre-Analysis Engine Selector (when not started yet) */}
      {!running && !result && failures.length === 0 && onRunAnalysis && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              Select Analysis Engine
            </p>
            <p className="text-[11px] text-muted-foreground">
              Choose standard evaluation (~30s) or ignite high-reasoning jet boosters for in-depth linguistic depth (2–4 min).
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8.5 cursor-pointer px-3.5 text-xs"
              onClick={() => void onRunAnalysis(undefined, false)}
            >
              Standard Analysis
            </Button>
            <Button
              size="sm"
              className="group h-8.5 cursor-pointer gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-4 text-xs font-black uppercase tracking-wider text-black shadow-md shadow-orange-500/20 hover:scale-[1.02] hover:shadow-orange-500/35 transition-all"
              onClick={() => void onRunAnalysis(undefined, true)}
            >
              <Flame className="h-4 w-4 fill-black text-black transition-transform group-hover:scale-110" />
              <span>In-Depth Analysis (Jet Boosters)</span>
            </Button>
          </div>
        </div>
      )}

      {/* Answers & Recordings List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">
            {displayAnswers.length === 1 ? "Your answer" : `Your ${displayAnswers.length} answers`}
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Each answer keeps its own audio and transcript
          </span>
        </div>

        {displayAnswers.map((answer, index) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            index={index}
            total={displayAnswers.length}
            analysis={analysisByRecording.get(answer.id)}
            failure={failureByRecording.get(answer.id)}
            running={running}
            studentCorrection={corrections[answer.id]}
            onSaveCorrection={onSaveCorrection}
          />
        ))}
      </div>

      {/* AI Evaluation Report (Band score, Jet Boosters, Criteria, Strengths, Priorities) */}
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

          {result.offTopicWarning && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-300 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Topic Relevance Alert</span>
              </div>
              <p className="mt-1 leading-relaxed text-rose-200/90 break-words">
                {result.offTopicWarning}
              </p>
            </div>
          )}

          {/* Jet Booster Console: In-Depth Linguistic Analysis */}
          {!result.deepDive && onRunAnalysis && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-5 shadow-[0_0_35px_rgba(245,158,11,0.14)]">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" />
              <div className="pointer-events-none absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl" />

              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-black tracking-widest uppercase text-amber-400">
                      <Flame className="h-3.5 w-3.5 text-amber-400 animate-pulse fill-amber-500/30" />
                      BOOSTERS READY · MAXIMUM REASONING
                    </span>
                    <span className="text-[11px] font-medium text-zinc-400">
                      2–4 min supersonic deliberation
                    </span>
                  </div>
                  <h4 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                    <span>Ignite In-Depth Analysis</span>
                    <Rocket className="h-4 w-4 text-amber-400 -rotate-45" />
                  </h4>
                  <p className="text-xs text-zinc-300 leading-relaxed max-w-xl">
                    Fire Stella’s highest reasoning engine. Replaces spoken phrasing with Band 8–9 curriculum vocabulary and performs an exhaustive category-by-category forensic grammar breakdown.
                  </p>
                </div>

                <div className="shrink-0 flex items-center">
                  <Button
                    size="sm"
                    disabled={running}
                    onClick={() => void onRunAnalysis(undefined, true)}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-orange-500/25 transition-all hover:scale-[1.03] hover:shadow-orange-500/40 active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="relative flex items-center gap-2">
                      <Flame className="h-4 w-4 fill-black text-black transition-transform group-hover:scale-125" />
                      <span>{running && deepDiveRunning ? "Firing Boosters…" : "Ignite Boosters"}</span>
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {result.deepDive && (
            <DeepDivePanel
              deepDive={result.deepDive}
              onAskStella={onAskStella}
            />
          )}

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
    </div>
  );
}
