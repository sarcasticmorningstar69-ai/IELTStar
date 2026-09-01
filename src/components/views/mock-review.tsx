"use client";

/**
 * Full Mock review: master recording playback with a seekable question
 * timeline, per-segment recordings, Part 2 preparation notes, the handoff to
 * Stella for AI analysis, and the self-review questionnaire that feeds the
 * diagnostic system.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type MockMeta } from "@/lib/store/progress";
import { getAudioURL, computePeaks } from "@/lib/storage/audio-db";
import { topicTitle, SYMPTOMS, CAUSES, diagnoseProblem, problemById, areaOfProblem, type Symptom, type Cause } from "@/lib/data/content";
import { AudioPlayer, formatTime, StaticWaveform } from "@/components/audio/audio-ui";
import { StarMark } from "@/components/shared/brand";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Pause, Gauge, NotebookPen, ChevronDown, ChevronRight, Check, Sparkles } from "lucide-react";

const SPEEDS = [0.75, 1, 1.25, 1.5];

function MockPlayer({ mock }: { mock: MockMeta }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [speedIdx, setSpeedIdx] = React.useState(1);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);

  React.useEffect(() => {
    if (!mock.fullRecordingId) return;
    let revoke: string | null = null;
    let alive = true;
    getAudioURL(mock.fullRecordingId).then((u) => {
      if (!alive) return;
      if (u) {
        revoke = u;
        setUrl(u);
      }
    });
    computePeaks(mock.fullRecordingId!, 120).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [mock.fullRecordingId]);

  // Smooth playback tracking at 60fps so the timeline playhead and active
  // segment highlight glide instead of stepping.
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

  /**
   * MediaRecorder blobs (webm/opus) report Infinity duration until seeked —
   * force the browser to compute the real duration for the mock timeline.
   */
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

  if (!mock.fullRecordingId) return null;

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) await el.play().catch(() => {});
    else el.pause();
  };

  const seekTo = (time: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, time);
    setCurrent(time);
    if (el.paused) el.play().catch(() => {});
  };

  const progress = duration && current ? current / duration : 0;
  const completed = mock.segments.filter((s) => s.completed);

  return (
    <div className="rounded-2xl border border-brand-bright/30 bg-card p-5 shadow-sm sm:p-6">
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
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause full recording" : "Play full recording"}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-1 h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <StaticWaveform
            peaks={peaks}
            progress={progress}
            onSeek={(r) => duration && seekTo(r * duration)}
            className="h-12"
          />
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(current)}</span>
            <button
              type="button"
              onClick={() => {
                const next = (speedIdx + 1) % SPEEDS.length;
                setSpeedIdx(next);
                if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
              }}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-brand-bright/50"
              aria-label={`Playback speed ${SPEEDS[speedIdx]}x`}
            >
              <Gauge className="h-3 w-3" />
              {SPEEDS[speedIdx]}×
            </button>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-5">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Timeline
        </div>
        <div className="flex h-11 w-full gap-1 overflow-hidden rounded-xl border border-border bg-surface p-1">
          {completed.map((seg) => {
            const start = seg.startOffset ?? 0;
            const end = seg.endOffset ?? start + seg.duration;
            const active = current >= start && current < end;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => seekTo(start)}
                aria-label={`Seek to ${seg.label}: ${topicTitle(seg.topicId || "")}`}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-[10px] font-semibold tracking-wide transition-colors",
                  active
                    ? "bg-brand-bright text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-brand-bright/25 hover:text-foreground"
                )}
                style={{ flexGrow: Math.max(0.4, end - start) }}
              >
                <span className="truncate">{seg.label}</span>
              </button>
            );
          })}
          {!completed.length && (
            <div className="flex w-full items-center justify-center text-xs text-muted-foreground">
              No segments were recorded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hands the finished mock over to Stella.
 *
 * Both routes the student asked for are here: send everything, or pick exactly
 * which answers to send. Only the per-answer segment recordings are offered —
 * the master full-mock recording contains the same speech end to end, so
 * sending both would transcribe every word twice for no extra insight.
 */
function StellaHandoff({ mock }: { mock: MockMeta }) {
  const navigate = useApp((s) => s.navigate);
  const recordings = useProgress((s) => s.recordings);

  const answers = React.useMemo(
    () =>
      recordings
        .filter(
          (r) =>
            r.mockId === mock.id &&
            r.id !== mock.fullRecordingId &&
            !r.label.includes("complete session")
        )
        .slice()
        .sort((a, b) => a.startedAt - b.startedAt),
    [recordings, mock.id, mock.fullRecordingId]
  );

  const [picking, setPicking] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  const open = (ids: string[]) => {
    if (!ids.length) return;
    navigate({ name: "mock-analysis", mockId: mock.id, recordingIds: ids });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalSeconds = answers.reduce((a, r) => a + r.duration, 0);
  const parts = [1, 2, 3] as const;

  if (!answers.length) return null;

  return (
    <div className="rounded-2xl border border-brand-bright/30 bg-card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <StellaAvatar state="idle" size={56} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">Send this mock to Stella</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {answers.length} answers · {formatTime(totalSeconds)} of speaking. A whole
            mock gives a far more dependable estimate than a single answer.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => open(answers.map((a) => a.id))} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Analyse entire mock
        </Button>
        <Button
          variant="outline"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          className="gap-2"
        >
          Choose answers to analyse
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", picking && "rotate-180")}
          />
        </Button>
      </div>

      {picking && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Quick select
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(answers.map((a) => a.id)))}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              All
            </button>
            {parts.map((p) => {
              const ids = answers.filter((a) => a.part === p).map((a) => a.id);
              if (!ids.length) return null;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelected(new Set(ids))}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Part {p}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              None
            </button>
          </div>

          <div className="scrollbar-thin mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {answers.map((r) => {
              const isSelected = selected.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    isSelected
                      ? "border-brand-bright/50 bg-brand-soft"
                      : "border-border bg-surface hover:border-brand-bright/30"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      isSelected
                        ? "border-brand-bright bg-primary text-primary-foreground"
                        : "border-border"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{r.label}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Part {r.part} · {formatTime(r.duration)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            onClick={() => open([...selected])}
            disabled={!selected.size}
            className="mt-3 w-full gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {selected.size
              ? `Analyse ${selected.size} ${selected.size === 1 ? "answer" : "answers"}`
              : "Select at least one answer"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SelfReview({ mockId }: { mockId: string }) {
  const recordings = useProgress((s) => s.recordings);
  const saveDiagnosis = useProgress((s) => s.saveDiagnosis);
  const navigate = useApp((s) => s.navigate);
  const [symptoms, setSymptoms] = React.useState<Symptom[]>([]);
  const [causes, setCauses] = React.useState<Cause[]>([]);
  const [saved, setSaved] = React.useState(false);

  const mockRecordings = recordings.filter((r) => r.mockId === mockId);

  const save = () => {
    const problems = symptoms.map((s) => diagnoseProblem(s, causes[0] || undefined));
    // attach diagnosis to the most recent recording of this mock
    const target = mockRecordings[0];
    if (target) {
      saveDiagnosis(
        target.id,
        { symptoms, causes, quick: symptoms[0]?.includes("word") ? "WORD" : undefined },
        [...new Set(problems)]
      );
    }
    setSaved(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-sm font-semibold tracking-tight">What did you notice?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick anything that felt difficult — this shapes your Practice Again list.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {SYMPTOMS.map((s) => {
          const active = symptoms.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setSymptoms((prev) => (active ? prev.filter((x) => x !== s) : [...prev, s]))
              }
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-brand-bright/60 bg-brand-soft text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
      {symptoms.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold tracking-tight">
            Why do you think it happened?
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">Optional — pick any that apply.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CAUSES.map((c) => {
              const active = causes.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setCauses((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-brand-bright/60 bg-brand-soft text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!saved ? (
          <Button onClick={save} disabled={symptoms.length === 0} className="gap-2">
            Save self-review
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-success">Saved — good noticing.</span>
            {symptoms.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ name: "problem", problemId: diagnoseProblem(symptoms[0], causes[0]) })}
                className="gap-1.5"
              >
                Look at the matched problem
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MockReviewView({ mockId }: { mockId: string }) {
  const navigate = useApp((s) => s.navigate);
  const mock = useProgress((s) => s.mocks.find((m) => m.id === mockId));
  const recordings = useProgress((s) => s.recordings);
  if (!mock) return null;

  const segRecordings = recordings.filter((r) => r.mockId === mockId && !r.label.includes("complete session"));
  const fullDuration = recordings.find((r) => r.id === mock.fullRecordingId)?.duration || 0;
  const interrupted = mock.status === "interrupted";
  const parts = [1, 2, 3] as const;

  return (
    <div className="fade-up mx-auto max-w-3xl space-y-6 py-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex justify-center">
          <StarMark size={44} />
        </div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-brand-bright uppercase">
          {interrupted ? "Mock interrupted" : "Mock complete"}
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
          Your full recording
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {interrupted
            ? "You ended this mock early — everything up to that point is kept."
            : `${mock.segments.filter((s) => s.completed).length} answers · ${formatTime(fullDuration)} of speaking`}
        </p>
      </div>

      <MockPlayer mock={mock} />

      <StellaHandoff mock={mock} />

      {/* Part 2 preparation notes */}
      {mock.part2Notes && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <NotebookPen className="h-3.5 w-3.5" />
            Part 2 preparation notes
          </div>
          <pre className="mt-2 font-mono text-sm whitespace-pre-wrap text-muted-foreground">
            {mock.part2Notes}
          </pre>
        </div>
      )}

      {/* Part review */}
      <div className="space-y-3">
        <h2 className="px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Part review
        </h2>
        {parts.map((p) => {
          const segs = mock.segments.filter((s) => s.part === p);
          const recs = segRecordings.filter((r) => r.part === p);
          const partDone = segs.filter((s) => s.completed).length;
          return (
            <details key={p} className="group rounded-2xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-bright">
                    {p}
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Part {p}</div>
                    <div className="text-xs text-muted-foreground">
                      {partDone}/{segs.length} answers recorded
                      {p === 1 && ` · ${mock.structure.part1.map((t) => topicTitle(t)).join(", ")}`}
                      {p === 2 && ` · ${topicTitle(mock.structure.part2)}`}
                      {p === 3 && ` · ${mock.structure.part3.map((t) => topicTitle(t)).join(", ")}`}
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-border p-4 sm:p-5">
                {recs.length === 0 && (
                  <p className="py-2 text-sm text-muted-foreground">
                    No Part {p} answers were recorded in this mock.
                  </p>
                )}
                {recs.map((r) => (
                  <div key={r.id}>
                    <div className="mb-1.5 truncate text-xs text-muted-foreground">
                      {r.questionId && p !== 2 ? r.label.split("—")[1] || "" : r.label}
                    </div>
                    <AudioPlayer recordingId={r.id} compact />
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ name: "mock-analysis", mockId, recordingIds: [r.id] })
                      }
                      className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-bright underline-offset-4 hover:underline"
                    >
                      <Sparkles className="h-3 w-3" />
                      Analyse this answer with Stella
                    </button>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <SelfReview mockId={mockId} />

      <div className="flex flex-wrap justify-center gap-2 pb-8">
        <Button variant="outline" onClick={() => navigate({ name: "recordings" })}>
          All recordings
        </Button>
        <Button onClick={() => navigate({ name: "mock-config" })} className="gap-2">
          New mock
        </Button>
      </div>
    </div>
  );
}
