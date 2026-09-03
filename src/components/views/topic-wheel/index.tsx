"use client";

import * as React from "react";
import { StarMark } from "@/components/shared/brand";
import { TopicPicker, ITEM_H, VISIBLE } from "./picker";
import { WheelAudio } from "./audio-fx";
import {
  WHEEL_TOPICS,
  wrapIndex,
  randomEligibleWheelTopic,
  wheelTopicIndex,
} from "@/lib/data/topic-wheel";
import { useApp } from "@/lib/store/app";
import { useProgress } from "@/lib/store/progress";
import { micManager } from "@/lib/audio/microphone";
import { SegmentRecorder } from "@/lib/audio/recorder";
import { AudioPlayer, formatTime } from "@/components/audio/audio-ui";
import { AnalyseAnswerLink } from "@/components/ai/send-to-stella";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { TIP_CATEGORIES, TECHNIQUE_GROUPS } from "@/lib/data/content";
import { cn } from "@/lib/utils";
import { Sparkles, ChevronDown, Maximize2 } from "lucide-react";

type Phase = "idle" | "prepare" | "speak" | "review";

const PREPARE_SECS = 15 * 60;
const SPEAK_SECS = 60;
const BARS = 64;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function hashPick<T>(seed: string, items: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}

/**
 * Fast, punchy input energy. Deliberately NOT the shared smoothed meter:
 * high gain, near-instant attack, gentle release, so a raised voice throws
 * real amplitude and silence collapses to a hairline.
 */
function useEnergy(active: boolean) {
  const [bars, setBars] = React.useState<number[]>(() => new Array(BARS).fill(0));
  const history = React.useRef<number[]>(new Array(BARS).fill(0));
  const value = React.useRef(0);

  React.useEffect(() => {
    if (!active) {
      history.current = new Array(BARS).fill(0);
      value.current = 0;
      setBars(new Array(BARS).fill(0));
      return;
    }
    let raf = 0;
    let lastSample = 0;
    const loop = (t: number) => {
      const raw = micManager.getLevel();
      // Aggressive shaping: normal speech ~0.5, a shout pins near 1.
      const shaped = Math.min(1, Math.pow(Math.max(0, raw) * 6.5, 0.62));
      const k = shaped > value.current ? 0.92 : 0.16;
      value.current += (shaped - value.current) * k;
      if (t - lastSample >= 38) {
        lastSample = t;
        const h = history.current;
        h.push(value.current);
        if (h.length > BARS) h.shift();
        setBars([...h]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return bars;
}

function AmbientEnergy({ active }: { active: boolean }) {
  const bars = useEnergy(active);
  const last = bars.length - 1;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center lg:opacity-60 lg:[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      aria-hidden
    >
      <span className="absolute inset-x-[8%] top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-brand-bright/20 to-transparent lg:block" />
      <div className="flex w-full items-center justify-center gap-[2px] px-2 lg:w-[84%] lg:max-w-[46rem] lg:justify-between lg:gap-0 lg:px-0">
        {bars.map((v, i) => {
          const mid = last / 2;
          const envelope = 0.35 + 0.65 * (1 - Math.abs(i - mid) / mid);
          const h = active ? Math.max(2, v * envelope * 190) : 1.5;
          return (
            <span
              key={i}
              className="flex-1 rounded-full bg-brand-bright transition-[height] duration-75 ease-out lg:w-px lg:max-w-px lg:flex-none lg:rounded-none lg:max-h-[118px]"
              style={{
                height: `${h}px`,
                opacity: active ? 0.1 + v * 0.4 : 0.06,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md text-[11px] font-semibold tracking-[0.14em] uppercase transition-all disabled:opacity-40";
const btnPrimary =
  "border border-primary bg-primary text-primary-foreground hover:brightness-110 hover:-translate-y-px";
const btnQuiet =
  "border border-border bg-transparent text-foreground/80 hover:border-brand-bright/40 hover:text-foreground hover:-translate-y-px";

export function TopicWheelView() {
  const navigate = useApp((s) => s.navigate);
  const excluded = useProgress((s) => s.excludedTopicWheelIds ?? []);
  const excludeTopic = useProgress((s) => s.excludeTopicWheel);
  const includeTopic = useProgress((s) => s.includeTopicWheel);
  const startSession = useProgress((s) => s.startSession);
  const saveRecording = useProgress((s) => s.saveRecording);
  const deleteRecording = useProgress((s) => s.deleteRecording);
  const addSeconds = useProgress((s) => s.addSeconds);

  const [index, setIndex] = React.useState(0);
  const [spinning, setSpinning] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [remaining, setRemaining] = React.useState(PREPARE_SECS);
  const [timerOn, setTimerOn] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [recordingId, setRecordingId] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [tipsOpen, setTipsOpen] = React.useState(false);
  const [micNote, setMicNote] = React.useState("");

  const recorderRef = React.useRef<SegmentRecorder | null>(null);
  const rafRef = React.useRef(0);
  const lastTickRef = React.useRef(-1);
  const audioRef = React.useRef<WheelAudio | null>(null);

  const topic = WHEEL_TOPICS[index] ?? WHEEL_TOPICS[0];
  const excludedSet = React.useMemo(() => new Set(excluded), [excluded]);
  const isExcluded = excludedSet.has(topic.id);

  React.useEffect(() => {
    audioRef.current = new WheelAudio();
    return () => {
      cancelAnimationFrame(rafRef.current);
      recorderRef.current?.abort();
      micManager.release();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!timerOn) return;
    const id = window.setInterval(() => {
      setRemaining((secs) => {
        if (secs > 1) return secs - 1;
        if (phase === "prepare") {
          setPhase("speak");
          return SPEAK_SECS;
        }
        if (phase === "speak") {
          setPhase("review");
          setTimerOn(false);
          return 0;
        }
        setTimerOn(false);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerOn, phase]);

  React.useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setElapsed(recorderRef.current?.elapsed ?? 0);
    }, 200);
    return () => window.clearInterval(id);
  }, [recording]);

  const spin = () => {
    if (spinning) return;
    const landed = randomEligibleWheelTopic(excluded, topic.id);
    const start = index;
    const n = WHEEL_TOPICS.length;
    const delta = (wheelTopicIndex(landed.id) - start + n) % n;
    const extra = n * 2 + delta;
    const duration = 2400;
    const t0 = performance.now();
    setSpinning(true);
    lastTickRef.current = start;

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const pos = Math.round(start + extra * easeOutCubic(p));
      const next = wrapIndex(pos, n);
      if (next !== lastTickRef.current) {
        lastTickRef.current = next;
        // velocity from the derivative of the easing curve
        audioRef.current?.tick(Math.max(0, Math.pow(1 - p, 2)));
      }
      setIndex(next);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setIndex(wheelTopicIndex(landed.id));
        setSpinning(false);
        audioRef.current?.land();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const startTimer = () => {
    if (phase === "idle" || phase === "review") {
      setPhase("prepare");
      setRemaining(PREPARE_SECS);
    }
    setTimerOn(true);
  };

  const resetTimer = () => {
    setTimerOn(false);
    setPhase("idle");
    setRemaining(PREPARE_SECS);
  };

  const toggleRecord = async () => {
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      const result = await rec?.stop();
      micManager.release();
      if (!result || result.blob.size < 800) return;
      const session =
        sessionId || startSession("part2", "Topic Wheel", [topic.id], 1).id;
      if (!sessionId) setSessionId(session);
      const saved = await saveRecording(
        {
          sessionId: session,
          part: 2,
          topicId: topic.id,
          startedAt: Date.now() - result.duration * 1000,
          duration: result.duration,
          mimeType: result.mimeType,
          size: result.blob.size,
          label: topic.prompt,
        },
        result.blob
      );
      addSeconds(session, result.duration);
      setRecordingId(saved.id);
      setPhase("review");
      setTimerOn(false);
      return;
    }
    setMicNote("");
    const stream = await micManager.request();
    if (!stream) {
      setMicNote(micManager.detail || "Microphone is not available.");
      return;
    }
    const rec = new SegmentRecorder();
    if (!rec.start(stream)) {
      setMicNote("Recording could not start in this browser.");
      micManager.release();
      return;
    }
    if (recordingId) {
      await deleteRecording(recordingId);
      setRecordingId(null);
    }
    recorderRef.current = rec;
    setElapsed(0);
    setRecording(true);
    if (phase === "idle" || phase === "prepare") setPhase("speak");
  };

  const discardRecording = async () => {
    if (recordingId) await deleteRecording(recordingId);
    setRecordingId(null);
  };

  /**
   * The AI control is only ever one step from a real analysis: if there is a
   * recording it opens the workspace with it, otherwise it explains what is
   * missing and offers to start recording.
   */
  const openStella = () => {
    if (recordingId) {
      navigate({
        name: "analysis",
        recordingIds: [recordingId],
        sessionId: sessionId ?? undefined,
        heading: `Topic Wheel • ${topic.prompt}`,
      });
      return;
    }
    setAiOpen(true);
  };
  const openFullWindowAnalysis = openStella;

  const tip = React.useMemo(() => {
    const cat = hashPick(topic.id, TIP_CATEGORIES);
    const item = hashPick(topic.id + "t", cat.tips);
    return { category: cat.name, title: item.title, body: item.body };
  }, [topic.id]);

  const technique = React.useMemo(
    () => hashPick(topic.category, TECHNIQUE_GROUPS),
    [topic.category]
  );

  const phases: [Phase, string][] = [
    ["prepare", "Prepare"],
    ["speak", "Speak"],
    ["review", "Review"],
  ];

  return (
    <div className="fade-up pb-6">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-card">
          <StarMark size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-brand-bright uppercase">
            Topic Wheel
          </div>
          <p className="text-xs text-muted-foreground">
            Spin a prompt • prepare • speak • listen back
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14 lg:pt-[10vh]">
        {/* ---------------- wheel + controls ---------------- */}
        <div className="min-w-0">
          <div className="relative" style={{ minHeight: ITEM_H * VISIBLE }}>
            <AmbientEnergy active={recording} />
            <TopicPicker
              topics={WHEEL_TOPICS}
              index={index}
              onIndexChange={setIndex}
              spinning={spinning}
            />
          </div>

          <div className="mt-1 text-center text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {topic.category}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              className={cn(btnBase, btnPrimary, "h-10 px-6 text-[12px]")}
            >
              Spin
            </button>
            <button
              type="button"
              onClick={toggleRecord}
              className={cn(
                btnBase,
                recording ? btnPrimary : btnQuiet,
                "h-10 px-4"
              )}
            >
              {recording ? `Stop • ${formatTime(elapsed)}` : "Record"}
            </button>
            <button
              type="button"
              onClick={openStella}
              className={cn(btnBase, recordingId ? btnPrimary : btnQuiet, "h-10 px-4 gap-1.5")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {recordingId ? "Analyse with Stella" : "AI"}
            </button>
          </div>

          {micNote && (
            <p className="mt-3 text-center text-sm text-muted-foreground">{micNote}</p>
          )}

          {/* Prompt card with direct Full Window Handoff when recording is available */}
          {(phase === "review" || recordingId) && (
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-brand-bright/35 bg-card p-4 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3">
                <StellaAvatar state="idle" size={42} />
                <div>
                  <p className="text-xs font-semibold tracking-tight">Evaluate your answer with Stella</p>
                  <p className="text-[11px] text-muted-foreground">
                    Open Full-Window mode: AI reports & chat on left, exact audio & synchronized transcript on right.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openFullWindowAnalysis}
                className={cn(btnBase, btnPrimary, "h-9 px-4 gap-1.5 shrink-0 whitespace-nowrap")}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Go Full Window
              </button>
            </div>
          )}

          {/* ---------------- guidance ---------------- */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setTipsOpen((v) => !v)}
              aria-expanded={tipsOpen}
              className="group flex w-full items-baseline gap-2 border-t border-border/60 pt-3 text-left"
            >
              <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Guidance
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80">
                {tip.title}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  tipsOpen && "rotate-180"
                )}
              />
            </button>
            {tipsOpen && (
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {tip.body && <p>{tip.body}</p>}
                <p>
                  <span className="font-medium text-foreground">{technique.title}.</span>{" "}
                  {technique.oneLine}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---------------- persistent rail ---------------- */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="space-y-3 rounded-lg border border-border/70 bg-card/40 p-4 lg:space-y-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
            <ol className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
              {phases.map(([key, label], i) => {
                const active = phase === key;
                const done =
                  (key === "prepare" && (phase === "speak" || phase === "review")) ||
                  (key === "speak" && phase === "review");
                return (
                  <li key={key} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-border">•</span>}
                    <span
                      className={cn(
                        active
                          ? "text-brand-bright"
                          : done
                            ? "text-foreground/60"
                            : "text-muted-foreground/45"
                      )}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="font-mono text-[32px] leading-none font-medium tracking-tight tabular-nums">
              {formatTime(phase === "review" ? 0 : remaining)}
            </div>
            <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {phase === "speak"
                ? "Speaking • 01:00"
                : phase === "review"
                  ? "Review your answer"
                  : "Prepare • 15:00"}
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => (timerOn ? setTimerOn(false) : startTimer())}
                className={cn(btnBase, btnQuiet, "h-9 flex-1 px-2")}
              >
                {timerOn ? "Pause" : "Start"}
              </button>
              <button
                type="button"
                onClick={resetTimer}
                className={cn(btnBase, btnQuiet, "h-9 flex-1 px-2")}
              >
                Reset
              </button>
            </div>

            {recording && (
              <p className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs font-medium text-brand-bright">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-bright" />
                Recording • {formatTime(elapsed)}
              </p>
            )}

            {recordingId && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <AudioPlayer
                  recordingId={recordingId}
                  title={topic.prompt}
                  compact
                  className="lg:!rounded-none lg:!border-0 lg:!bg-transparent lg:!p-0 lg:!shadow-none lg:[&_[role=slider]]:!gap-px lg:[&_[role=slider]>div]:min-w-px"
                />
                {/* Evaluation sits with the recording, not behind a corner button. */}
                <AnalyseAnswerLink
                  recordingId={recordingId}
                  sessionId={sessionId ?? undefined}
                />
                <button
                  type="button"
                  onClick={openFullWindowAnalysis}
                  className={cn(btnBase, btnPrimary, "h-9 w-full px-2 gap-1.5")}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Go Full Window with Stella
                </button>
                <button
                  type="button"
                  onClick={discardRecording}
                  className={cn(btnBase, btnQuiet, "h-8 w-full px-2")}
                >
                  Discard
                </button>
              </div>
            )}

            {(phase === "review" || recordingId) && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => excludeTopic(topic.id)}
                    className={cn(
                      btnBase,
                      isExcluded ? btnPrimary : btnQuiet,
                      "h-8 flex-1 px-2"
                    )}
                  >
                    Exclude
                  </button>
                  <button
                    type="button"
                    onClick={() => includeTopic(topic.id)}
                    className={cn(
                      btnBase,
                      !isExcluded ? btnPrimary : btnQuiet,
                      "h-8 flex-1 px-2"
                    )}
                  >
                    Keep
                  </button>
                </div>
                {isExcluded && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Kept in the library, skipped by Spin.
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center gap-2.5">
              <StellaAvatar state="idle" size={36} />
              <div>
                <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
                  Stella AI
                </div>
                <p className="text-sm font-semibold tracking-tight">Record an answer first</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Stella needs something to listen to. Speak on &ldquo;{topic.prompt}&rdquo;, then press Analyse — she&apos;ll evaluate your IELTS Band across all 4 criteria and open the interactive Full-Window review.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiOpen(false);
                  void toggleRecord();
                }}
                className={cn(btnBase, btnPrimary, "h-9 px-4 flex-1")}
              >
                Record now
              </button>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className={cn(btnBase, btnQuiet, "h-9 px-4")}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
