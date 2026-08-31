"use client";

import * as React from "react";
import { StarMark } from "@/components/shared/brand";
import { TopicPicker } from "./picker";
import {
  WHEEL_TOPICS,
  wrapIndex,
  randomEligibleWheelTopic,
  wheelTopicIndex,
} from "@/lib/data/topic-wheel";
import { useProgress } from "@/lib/store/progress";
import { micManager } from "@/lib/audio/microphone";
import { SegmentRecorder } from "@/lib/audio/recorder";
import { AudioPlayer, formatTime, useMicLevel } from "@/components/audio/audio-ui";
import { TIP_CATEGORIES, TECHNIQUE_GROUPS } from "@/lib/data/content";
import { cn } from "@/lib/utils";

type Phase = "idle" | "prepare" | "speak" | "review";

const PREPARE_SECS = 15 * 60;
const SPEAK_SECS = 60;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function playTick(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    /* audio optional */
  }
}

function hashPick<T>(seed: string, items: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}

const btnBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors disabled:opacity-40";
const btnPrimary =
  "border border-primary bg-primary text-primary-foreground hover:brightness-110";
const btnQuiet =
  "border border-border bg-transparent text-foreground/80 hover:border-brand-bright/35 hover:text-foreground";

function AmbientEnergy({ active }: { active: boolean }) {
  const { level } = useMicLevel(active);
  const bars = 42;
  return (
    <div
      className="pointer-events-none absolute inset-x-6 top-1/2 flex h-14 -translate-y-1/2 items-center gap-px"
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => {
        const mid = (bars - 1) / 2;
        const envelope = 1 - Math.abs(i - mid) / mid;
        const amp = active ? Math.max(0.04, level * 1.8) : 0.045;
        const h = Math.max(2, envelope * amp * 52);
        return (
          <span
            key={i}
            className="flex-1 rounded-full bg-brand-bright"
            style={{
              height: `${h}px`,
              opacity: active ? 0.18 + level * 0.35 : 0.07,
            }}
          />
        );
      })}
    </div>
  );
}

export function TopicWheelView() {
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
  const [micNote, setMicNote] = React.useState("");

  const recorderRef = React.useRef<SegmentRecorder | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef(0);
  const lastTickRef = React.useRef(-1);
  const topic = WHEEL_TOPICS[index] ?? WHEEL_TOPICS[0];
  const excludedSet = React.useMemo(() => new Set(excluded), [excluded]);
  const isExcluded = excludedSet.has(topic.id);

  React.useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      recorderRef.current?.abort();
      micManager.release();
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
    const duration = 2300;
    const t0 = performance.now();
    setSpinning(true);
    lastTickRef.current = start;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const pos = Math.round(start + extra * easeOutCubic(p));
      const next = wrapIndex(pos, n);
      if (next !== lastTickRef.current) {
        lastTickRef.current = next;
        playTick(audioCtxRef);
      }
      setIndex(next);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else {
        setIndex(wheelTopicIndex(landed.id));
        setSpinning(false);
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
        sessionId ||
        startSession("part2", "Topic Wheel", [topic.id], 1).id;
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
    if (phase === "idle") setPhase("speak");
  };

  const discardRecording = async () => {
    if (recordingId) await deleteRecording(recordingId);
    setRecordingId(null);
  };

  const tip = React.useMemo(() => {
    const cat = hashPick(topic.id, TIP_CATEGORIES);
    const item = hashPick(topic.id + "t", cat.tips);
    return { category: cat.name, title: item.title, body: item.body };
  }, [topic.id]);

  const technique = React.useMemo(
    () => hashPick(topic.category, TECHNIQUE_GROUPS),
    [topic.category]
  );

  return (
    <div className="fade-up mx-auto max-w-3xl pb-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-card">
          <StarMark size={26} />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-brand-bright uppercase">
            Topic Wheel
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Spin a prompt. Prepare. Speak. Listen back.
          </p>
        </div>
      </header>

      <div className="relative">
        <AmbientEnergy active={recording} />
        <TopicPicker
          topics={WHEEL_TOPICS}
          index={index}
          onIndexChange={setIndex}
          spinning={spinning}
        />
      </div>

      <div className="mt-1 text-center">
        <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {topic.category}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={spin} disabled={spinning} className={cn(btnBase, btnPrimary)}>
          Spin
        </button>
        <button
          type="button"
          onClick={() => (timerOn ? setTimerOn(false) : startTimer())}
          className={cn(btnBase, btnQuiet)}
        >
          {timerOn ? "Pause" : "Timer"}
        </button>
        <button type="button" onClick={toggleRecord} className={cn(btnBase, recording ? btnPrimary : btnQuiet)}>
          {recording ? "Stop" : "Record for yourself"}
        </button>
        <button type="button" onClick={() => setAiOpen(true)} className={cn(btnBase, btnQuiet)}>
          AI
        </button>
      </div>

      <ol className="mt-8 flex items-center justify-center gap-3 text-[11px] font-semibold tracking-[0.14em] uppercase">
        {(
          [
            ["prepare", "Prepare"],
            ["speak", "Speak"],
            ["review", "Review"],
          ] as const
        ).map(([key, label], i) => {
          const active = phase === key || (phase === "idle" && key === "prepare" && timerOn);
          const done =
            (key === "prepare" && (phase === "speak" || phase === "review")) ||
            (key === "speak" && phase === "review");
          return (
            <li key={key} className="flex items-center gap-3">
              {i > 0 && <span className="text-border">/</span>}
              <span className={cn(active ? "text-brand-bright" : done ? "text-foreground/70" : "text-muted-foreground/50")}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 text-center font-mono text-[28px] font-medium tracking-tight tabular-nums">
        {phase === "review" ? "00:00" : formatTime(phase === "idle" && !timerOn ? PREPARE_SECS : remaining)}
      </div>
      <div className="mt-1 text-center text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {phase === "speak" ? "Speak" : phase === "review" ? "Review" : "Prepare 15:00 · Speak 01:00"}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button type="button" onClick={resetTimer} className={cn(btnBase, btnQuiet)}>
          Reset
        </button>
      </div>

      {recording && (
        <p className="mt-5 text-center text-sm text-brand-bright">
          Recording · {formatTime(elapsed)}
        </p>
      )}
      {micNote && <p className="mt-4 text-center text-sm text-muted-foreground">{micNote}</p>}

      {recordingId && (
        <div className="mx-auto mt-6 max-w-xl">
          <AudioPlayer recordingId={recordingId} title={topic.prompt} compact />
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={discardRecording} className={cn(btnBase, btnQuiet)}>
              Discard recording
            </button>
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => excludeTopic(topic.id)}
            className={cn(btnBase, isExcluded ? btnPrimary : btnQuiet)}
          >
            Exclude topic
          </button>
          <button
            type="button"
            onClick={() => includeTopic(topic.id)}
            className={cn(btnBase, !isExcluded ? btnPrimary : btnQuiet)}
          >
            Keep topic
          </button>
        </div>
      )}
      {isExcluded && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          This topic stays in the library, but will not be chosen by Spin.
        </p>
      )}

      <section className="mt-12 border-t border-border/70 pt-6">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Guidance
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed font-medium tracking-tight">{tip.title}</p>
        {tip.body && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>}
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{technique.title}.</span> {technique.oneLine}
        </p>
      </section>

      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-brand-bright uppercase">AI</div>
            <p className="mt-2 text-base font-medium tracking-tight">Coming soon</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Feedback will connect here later. For now, record for yourself and listen back.
            </p>
            <button type="button" onClick={() => setAiOpen(false)} className={cn(btnBase, btnQuiet, "mt-5")}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
