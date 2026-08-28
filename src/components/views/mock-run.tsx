"use client";

/**
 * Full Speaking Mock engine.
 *
 * - ONE master recording runs continuously for the whole session.
 * - Each question ALSO gets its own segment recording (saved immediately,
 *   so nothing is lost if the session is interrupted).
 * - Timeline metadata (start/end offsets into the master recording) lets the
 *   review seek to any question.
 * - Part 1/3: 3-second transitions, automatic recording, internal safety
 *   limits (no big countdowns — conversational feel).
 * - Part 2: 1:00 preparation with notes (mic live, not recording), then an
 *   automatic 2:00 recording.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import {
  useProgress, type MockMeta, type MockSegment,
} from "@/lib/store/progress";
import {
  PART1_TOPICS, PART2_CARDS, PART3_TOPICS, part1TopicById, part3TopicById,
  part2CardById, topicTitle,
} from "@/lib/data/content";
import { micManager } from "@/lib/audio/microphone";
import { MasterRecorder, SegmentRecorder } from "@/lib/audio/recorder";
import {
  useMicLevel, LiveWaveform, VolumeMeter, formatTime,
} from "@/components/audio/audio-ui";
import { MicTestPanel } from "@/components/views/mic-gate";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Mic, Square, Pause, Play, X, NotebookPen, Volume2 } from "lucide-react";

const P1_SAFETY = 40;
const P3_SAFETY = 60;
const TRANSITION_MS = 3000;
const P2_PREP = 60;
const P2_SPEAK = 120;

type Phase =
  | { t: "part-intro"; part: 1 | 2 | 3 }
  | { t: "transition"; segmentIdx: number }
  | { t: "recording"; segmentIdx: number; since: number }
  | { t: "p2-prep"; segmentIdx: number }
  | { t: "paused"; resume: Phase }
  | { t: "finished" };

export function MockRunView({ mockId }: { mockId: string }) {
  const navigate = useApp((s) => s.navigate);
  const mock = useProgress((s) => s.mocks.find((m) => m.id === mockId));
  const updateMock = useProgress((s) => s.updateMock);
  const setMockNotes = useProgress((s) => s.setMockNotes);
  const saveRecording = useProgress((s) => s.saveRecording);

  const [phase, setPhase] = React.useState<Phase>({ t: "part-intro", part: 1 });
  const [elapsed, setElapsed] = React.useState(0);
  const [prepLeft, setPrepLeft] = React.useState(P2_PREP);
  const [transitionLeft, setTransitionLeft] = React.useState(3);
  const [notes, setNotes] = React.useState("");
  const [completedCount, setCompletedCount] = React.useState(0);
  const masterRef = React.useRef<MasterRecorder | null>(null);
  const segRecRef = React.useRef<SegmentRecorder | null>(null);
  const { level, waveform } = useMicLevel(
    phase.t === "recording" || phase.t === "p2-prep"
  );
  const phaseRef = React.useRef<Phase>(phase);
  const notesRef = React.useRef("");
  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  React.useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const segments = mock?.segments || [];
  const totalSegments = segments.length;

  // ---------------------------------------------------------------- lifecycle
  React.useEffect(() => {
    if (!mock) return;
    updateMock(mockId, { status: "in_progress" });
    const stream = micManager.getLiveStream();
    if (!stream) {
      // Should not happen (mic check precedes), but recover gracefully
      navigate({ name: "mock-check", mockId });
      return;
    }
    const master = new MasterRecorder();
    master.start(stream).then((ok) => {
      if (ok) masterRef.current = master;
    });
    return () => {
      masterRef.current?.abort();
      segRecRef.current?.abort();
    };
     
  }, []);

  // pause / interruption guards
  const pause = React.useCallback((resume: Phase) => {
    masterRef.current?.pause();
    segRecRef.current?.pause();
    updateMock(mockId, { status: "paused" });
    setPhase({ t: "paused", resume });
  }, [mockId, updateMock]);

  React.useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        const p = phaseRef.current;
        if (p.t === "recording" || p.t === "p2-prep" || p.t === "transition") {
          pause(p);
        }
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const p = phaseRef.current;
      if (p.t === "recording" || p.t === "p2-prep" || p.t === "transition") {
        updateMock(mockId, { status: "interrupted" });
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [pause, mockId, updateMock]);

  // ------------------------------------------------------------- segment flow
  // (declared before the timer effects that call them)
  const startSegment = async (idx: number) => {
    const seg = segments[idx];
    if (!seg) return;
    const stream = micManager.getLiveStream();
    if (!stream) {
      pause({ t: "transition", segmentIdx: idx });
      return;
    }
    const rec = new SegmentRecorder();
    if (!rec.start(stream)) {
      pause({ t: "transition", segmentIdx: idx });
      return;
    }
    segRecRef.current = rec;
    setElapsed(0);
    setPhase({ t: "recording", segmentIdx: idx, since: masterRef.current?.now() || 0 });
  };

  const finishSegment = async (idx: number, skip = false) => {
    const seg = segments[idx];
    if (!seg) return;
    const rec = segRecRef.current;
    segRecRef.current = null;
    const endOffset = masterRef.current?.now() || 0;
    const phaseNow = phaseRef.current;
    const startOffset = phaseNow.t === "recording" ? phaseNow.since : endOffset;

    let duration = 0;
    if (rec && !skip) {
      const result = await rec.stop();
      if (result && result.blob.size > 0) {
        duration = result.duration;
        const topicTitleStr =
          seg.part === 2 ? part2CardById(seg.topicId || "")?.title || "" : topicTitle(seg.topicId || "");
        const prompt =
          seg.part === 1
            ? part1TopicById(seg.topicId || "")?.questions.find((q) => q.id === seg.questionId)?.prompt
            : seg.part === 3
              ? part3TopicById(seg.topicId || "")?.questions.find((q) => q.id === seg.questionId)?.prompt
              : part2CardById(seg.topicId || "")?.prompt || "";
        await saveRecording(
          {
            sessionId: `mock-${mockId}`,
            mockId,
            part: seg.part,
            topicId: seg.topicId,
            questionId: seg.questionId,
            startedAt: Date.now() - result.duration * 1000,
            duration: result.duration,
            mimeType: result.mimeType,
            size: result.blob.size,
            label: `Mock · ${seg.label} — ${topicTitleStr}${prompt ? ` · ${prompt.slice(0, 60)}` : ""}`,
          },
          result.blob
        );
      }
    }

    const updatedSegments = segments.map((s, i) =>
      i === idx ? { ...s, completed: !skip, duration: Math.max(duration, endOffset - startOffset), startOffset, endOffset } : s
    );
    updateMock(mockId, {
      segments: updatedSegments,
      currentSegment: idx + 1,
    });
    setCompletedCount((c) => c + 1);

    advance(idx + 1, updatedSegments);
  };

  const advance = (nextIdx: number, segs: MockSegment[]) => {
    if (nextIdx >= segs.length) {
      completeMock(segs);
      return;
    }
    const nextSeg = segs[nextIdx];
    const curSeg = segs[nextIdx - 1];
    if (nextSeg.part !== curSeg.part) {
      setPhase({ t: "part-intro", part: nextSeg.part });
    } else if (nextSeg.part === 2) {
      setPrepLeft(P2_PREP);
      setPhase({ t: "p2-prep", segmentIdx: nextIdx });
    } else {
      setPhase({ t: "transition", segmentIdx: nextIdx });
    }
  };

  const completeMock = async (segs: MockSegment[]) => {
    const master = masterRef.current;
    masterRef.current = null;
    const fullResult = master ? await master.stop() : null;
    let fullRecordingId: string | undefined;
    if (fullResult && fullResult.blob.size > 0) {
      const meta = await saveRecording(
        {
          sessionId: `mock-${mockId}`,
          mockId,
          part: 1,
          startedAt: Date.now() - fullResult.duration * 1000,
          duration: fullResult.duration,
          mimeType: fullResult.mimeType,
          size: fullResult.blob.size,
          label: "Full Speaking Mock — complete session",
        },
        fullResult.blob
      );
      fullRecordingId = meta.id;
    }
    if (notesRef.current) setMockNotes(mockId, notesRef.current);
    updateMock(mockId, {
      status: "completed",
      completedAt: Date.now(),
      fullRecordingId,
      segments: segs,
    });
    micManager.release();
    setPhase({ t: "finished" });
  };

  const endMockEarly = async () => {
    // interrupt: save whatever we have
    const master = masterRef.current;
    masterRef.current = null;
    segRecRef.current?.abort();
    const fullResult = master ? await master.stop() : null;
    let fullRecordingId: string | undefined;
    if (fullResult && fullResult.blob.size > 0) {
      const meta = await saveRecording(
        {
          sessionId: `mock-${mockId}`,
          mockId,
          part: 1,
          startedAt: Date.now() - fullResult.duration * 1000,
          duration: fullResult.duration,
          mimeType: fullResult.mimeType,
          size: fullResult.blob.size,
          label: "Full Speaking Mock — interrupted session",
        },
        fullResult.blob
      );
      fullRecordingId = meta.id;
    }
    if (notesRef.current) setMockNotes(mockId, notesRef.current);
    updateMock(mockId, { status: "interrupted", fullRecordingId });
    micManager.release();
    navigate({ name: "mock-review", mockId });
  };

  // ------------------------------------------------------------- timers
  // (declared after the functions they call)
  React.useEffect(() => {
    if (phase.t !== "transition") return;
    setTransitionLeft(3);
    const idx = phase.segmentIdx;
    const t = setInterval(() => {
      setTransitionLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          startSegment(idx);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  React.useEffect(() => {
    if (phase.t !== "recording") return;
    const idx = phase.segmentIdx;
    const seg = segments[idx];
    const limit = seg?.part === 1 ? P1_SAFETY : seg?.part === 2 ? P2_SPEAK : P3_SAFETY;
    const t = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= limit) {
          clearInterval(t);
          finishSegment(idx);
          return limit;
        }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  React.useEffect(() => {
    if (phase.t !== "p2-prep") return;
    const idx = phase.segmentIdx;
    const t = setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          startSegment(idx);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  if (!mock) return null;

  // ---------------------------------------------------------------- finished
  if (phase.t === "finished") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="star-burst">
          <StarMark size={72} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">Mock complete</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Well done — that was a full speaking test. Let&apos;s listen back.
        </p>
        <Button
          size="lg"
          className="mt-8 gap-2 shadow-md"
          onClick={() => navigate({ name: "mock-review", mockId })}
        >
          <Volume2 className="h-4 w-4" />
          Review your mock
        </Button>
      </div>
    );
  }

  const seg = phase.t === "recording" || phase.t === "transition" || phase.t === "p2-prep"
    ? segments[phase.segmentIdx]
    : null;
  const prompt =
    seg?.part === 1
      ? part1TopicById(seg.topicId || "")?.questions.find((q) => q.id === seg.questionId)?.prompt
      : seg?.part === 3
        ? part3TopicById(seg.topicId || "")?.questions.find((q) => q.id === seg.questionId)?.prompt
        : seg
          ? part2CardById(seg.topicId || "")?.prompt
          : "";

  const part1Topics = mock.structure.part1.map((id) => topicTitle(id));
  const part3Topics = mock.structure.part3.map((id) => topicTitle(id));
  const card = part2CardById(mock.structure.part2);

  // ---------------------------------------------------------------- paused
  if (phase.t === "paused") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Pause className="h-10 w-10 text-muted-foreground" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Mock paused</h1>
        <p className="mt-2 text-sm text-muted-foreground">Recording paused safely.</p>
        <div className="mt-8 flex gap-2">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => {
              masterRef.current?.resume();
              segRecRef.current?.resume();
              updateMock(mockId, { status: "in_progress" });
              const r = phase.resume;
              if (r.t === "recording") {
                // resume the same question
                startSegment(r.segmentIdx);
              } else {
                setPhase(r);
              }
            }}
          >
            <Play className="h-4 w-4" />
            Resume
          </Button>
          <Button variant="outline" onClick={endMockEarly}>
            End &amp; review
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- part intro
  if (phase.t === "part-intro") {
    const p = phase.part;
    return (
      <MockFrame completed={completedCount} total={totalSegments} onPause={() => pause(phase)} onEnd={endMockEarly}>
        <div className="mx-auto max-w-lg text-center">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-brand-bright uppercase">
            {p === 2 ? "Part 2 of 3" : `Part ${p} of 3`}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {p === 1 ? "Part 1 — Everyday Conversation" : p === 2 ? "Part 2 — Long Turn" : "Part 3 — Discussion"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {p === 1 &&
              `Answer naturally about ${part1Topics.join(", ")}. Recording starts automatically after each question.`}
            {p === 2 &&
              `One cue card, one minute of preparation, two minutes of speaking.`}
            {p === 3 &&
              `Longer, more abstract answers about ${part3Topics.join(", ")}.`}
          </p>
          {p === 2 && card && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-left">
              <div className="text-sm font-semibold">{card.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{card.prompt}</p>
            </div>
          )}
          <Button
            size="lg"
            className="mt-8 gap-2 shadow-md"
            onClick={() => {
              const firstIdx = segments.findIndex((s) => s.part === p);
              if (p === 2) {
                setPrepLeft(P2_PREP);
                setPhase({ t: "p2-prep", segmentIdx: firstIdx });
              } else {
                setPhase({ t: "transition", segmentIdx: firstIdx });
              }
            }}
          >
            {p === 2 ? "Begin Part 2" : `Begin Part ${p}`}
          </Button>
        </div>
      </MockFrame>
    );
  }

  // ---------------------------------------------------------------- transition
  if (phase.t === "transition" && seg) {
    return (
      <MockFrame completed={completedCount} total={totalSegments} onPause={() => pause(phase)} onEnd={endMockEarly}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {seg.label} · {topicTitle(seg.topicId || "")}
          </div>
          <p className="mt-6 max-w-lg text-balance text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
            {prompt}
          </p>
          <div className="mt-10 flex items-center gap-3 text-muted-foreground">
            <span className="soft-blink text-sm">Recording starts in</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-bright/40 font-mono text-lg font-semibold tabular-nums text-brand-bright">
              {transitionLeft}
            </span>
          </div>
        </div>
      </MockFrame>
    );
  }

  // ---------------------------------------------------------------- p2 prep
  if (phase.t === "p2-prep" && seg) {
    const card2 = part2CardById(seg.topicId || "");
    return (
      <MockFrame completed={completedCount} total={totalSegments} onPause={() => pause(phase)} onEnd={endMockEarly}>
        <div className="mx-auto grid max-w-2xl gap-5 sm:grid-cols-[1fr_auto]">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Part 2 · Preparation
            </div>
            <div className="mt-2 rounded-2xl border border-border bg-card p-5">
              <p className="text-[15px] leading-relaxed font-medium">{card2?.prompt}</p>
              <div className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                You should say
              </div>
              <ul className="mt-1.5 space-y-1">
                {card2?.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright/70" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Your notes
                </span>
                <span className="text-[10px] text-muted-foreground">Keywords, not sentences</span>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={"when / where\nwho\nwhat happened\nturning point\nfeeling"}
                aria-label="Keyword notes"
                className="min-h-[110px] resize-none border-0 bg-transparent p-1 font-mono text-sm focus-visible:ring-0"
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Your notes stay visible while you speak.
            </p>
          </div>
          <div className="flex flex-col items-center justify-start rounded-2xl border border-border bg-card p-5">
            <div className="relative h-28 w-28">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" strokeWidth="6" className="stroke-muted-foreground/15" />
                <circle
                  cx="60" cy="60" r="52" fill="none" strokeWidth="6" strokeLinecap="round"
                  className="stroke-muted-foreground/50 transition-[stroke-dashoffset] duration-1000 ease-linear"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 * (1 - prepLeft / P2_PREP)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-xl font-semibold tabular-nums">{formatTime(prepLeft)}</span>
                <span className="text-[8px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Prep</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <Mic className="h-3 w-3" />
              Mic silent
            </div>
            <Button
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => startSegment(phase.segmentIdx)}
            >
              <Mic className="h-3.5 w-3.5" />
              Speak now
            </Button>
          </div>
        </div>
      </MockFrame>
    );
  }

  // ---------------------------------------------------------------- recording
  if (phase.t === "recording" && seg) {
    const limit = seg.part === 1 ? P1_SAFETY : seg.part === 2 ? P2_SPEAK : P3_SAFETY;
    return (
      <MockFrame completed={completedCount} total={totalSegments} onPause={() => pause(phase)} onEnd={endMockEarly}>
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {seg.label} · {topicTitle(seg.topicId || "")}
            </div>
            <p className="mx-auto mt-4 max-w-xl text-balance text-xl leading-snug font-semibold tracking-tight sm:text-[26px] sm:leading-snug">
              {prompt}
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-brand-bright/40 bg-card p-5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="rec-dot h-3 w-3 rounded-full bg-brand-bright" aria-hidden />
                <span className="text-sm font-semibold tracking-[0.14em] text-brand-bright uppercase">
                  Recording
                </span>
              </div>
              {/* subtle progress — not a big countdown */}
              <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-muted-foreground/15" aria-hidden>
                <div
                  className="h-full rounded-full bg-brand-bright/70 transition-all duration-1000 ease-linear"
                  style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }}
                />
              </div>
            </div>
            <LiveWaveform waveform={waveform} active className="my-4" />
            <VolumeMeter level={level} />
            <div className="mt-4 flex justify-center">
              <Button
                size="lg"
                onClick={() => finishSegment(phase.segmentIdx)}
                className="h-13 gap-2.5 rounded-2xl px-8 shadow-md"
              >
                <Square className="h-4 w-4" />
                Done — next question
              </Button>
            </div>
            {seg.part === 2 && notes && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Your notes
                </div>
                <pre className="mt-1 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{notes}</pre>
              </div>
            )}
          </div>
        </div>
      </MockFrame>
    );
  }

  return null;
}

function MockFrame({
  completed,
  total,
  onPause,
  onEnd,
  children,
}: {
  completed: number;
  total: number;
  onPause: () => void;
  onEnd: () => void;
  children: React.ReactNode;
}) {
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/92 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <StarMark size={22} />
          <span className="text-xs font-medium text-muted-foreground">
            Full Mock · {completed}/{total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPause}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Pause mock"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="End mock early"
          >
            <X className="h-3.5 w-3.5" />
            End
          </button>
        </div>
      </div>
      <div className="px-4 py-8 sm:py-12">
        {children}
        {confirmEnd && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="End mock"
          >
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
              <NotebookPen className="mx-auto h-6 w-6 text-muted-foreground" />
              <h3 className="mt-3 text-base font-semibold">End the mock now?</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Everything recorded so far is kept. The mock will be marked as interrupted, not
                completed.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="outline" onClick={() => setConfirmEnd(false)}>
                  Keep going
                </Button>
                <Button variant="destructive" onClick={onEnd}>
                  End &amp; review
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Microphone check view (before the mock)
// ---------------------------------------------------------------------------

export function MockCheckView({ mockId }: { mockId: string }) {
  const navigate = useApp((s) => s.navigate);
  const updateMock = useProgress((s) => s.updateMock);
  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:py-14">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-brand-bright uppercase">
        Before your mock
      </div>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        Let&apos;s check your microphone.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Tap Allow when your browser asks for microphone access, then speak for a few seconds
        until the meter moves.
      </p>
      <div className="mt-6">
        <MicTestPanel
          onReady={() => {
            updateMock(mockId, { status: "in_progress" });
            navigate({ name: "mock-run", mockId });
          }}
        />
      </div>
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => {
            updateMock(mockId, { status: "abandoned" });
            navigate({ name: "mock-config" });
          }}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to configurator
        </button>
      </div>
    </div>
  );
}
