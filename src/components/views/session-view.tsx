"use client";

/**
 * Active practice sessions for Part 1, Part 2 and Part 3.
 *
 * Part 1 / Part 3: the student manually starts and stops each answer.
 * Part 2: one minute of keyword preparation (microphone live but not
 * recording — permission is acquired from the user gesture that starts
 * preparation), then an automatic two-minute recording. Notes stay visible.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import {
  useProgress, type SessionMeta,
} from "@/lib/store/progress";
import {
  part1TopicById, part3TopicById, part2CardById, vocabForTopic, topicTitle,
  questionSupport, diagnoseProblem,
  type Symptom, type Cause, SYMPTOMS, CAUSES,
} from "@/lib/data/content";
import { micManager } from "@/lib/audio/microphone";
import { SegmentRecorder } from "@/lib/audio/recorder";
import {
  useMicLevel, LiveWaveform, VolumeMeter, AudioPlayer, formatTime, useMicStatus,
} from "@/components/audio/audio-ui";
import { MicTestPanel } from "@/components/views/mic-gate";
import { VocabSheet } from "@/components/views/vocab-sheet";
import { StarMark } from "@/components/shared/brand";
import { SendToStella, AnalyseAnswerLink } from "@/components/ai/send-to-stella";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Mic, Square, RotateCcw, ChevronRight, BookOpen, Lightbulb, SkipForward,
  CheckCircle2, NotebookPen, ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Quick diagnosis (kept deliberately light)
// ---------------------------------------------------------------------------

const QUICK = [
  { key: "WORD", label: "Word", hint: "Couldn't find the word" },
  { key: "GRAMMAR", label: "Grammar", hint: "Grammar broke" },
  { key: "IDEA", label: "Idea", hint: "Didn't know what to say" },
  { key: "PACE", label: "Pace", hint: "Too fast / too many pauses" },
  { key: "NERVES", label: "Nerves", hint: "Anxiety got in the way" },
  { key: "OTHER", label: "Other", hint: "Something else" },
];

function QuickDiagnosis({
  recordingId,
  onDone,
}: {
  recordingId: string;
  onDone: () => void;
}) {
  const saveDiagnosis = useProgress((s) => s.saveDiagnosis);
  const [quick, setQuick] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(false);
  const [symptom, setSymptom] = React.useState<Symptom | null>(null);
  const [cause, setCause] = React.useState<Cause | null>(null);

  const finish = (q: string | null, s: Symptom | null, c: Cause | null) => {
    const problems: string[] = [];
    if (s) problems.push(diagnoseProblem(s, c || undefined));
    else if (q === "OTHER") problems.push("prob36");
    saveDiagnosis(recordingId, {
      quick: q || undefined,
      symptoms: s ? [s] : undefined,
      causes: c ? [c] : undefined,
    }, problems);
    onDone();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        What happened?
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        One tap is enough — it helps your Practice Again list.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {QUICK.map((q) => (
          <button
            key={q.key}
            type="button"
            onClick={() => setQuick(q.key)}
            aria-pressed={quick === q.key}
            className={cn(
              "rounded-xl border px-2 py-2.5 text-center transition-all",
              quick === q.key
                ? "border-brand-bright/60 bg-brand-soft"
                : "border-border hover:border-brand-bright/35"
            )}
          >
            <span className="block text-sm font-semibold">{q.label}</span>
            <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{q.hint}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {more ? "Hide details" : "Tell me more (optional)"}
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => finish(null, null, null)}
          className="text-muted-foreground"
        >
          It went fine
        </Button>
      </div>

      {more && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">I noticed…</div>
            <div className="flex flex-wrap gap-1.5">
              {SYMPTOMS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSymptom(s)}
                  aria-pressed={symptom === s}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    symptom === s
                      ? "border-brand-bright/60 bg-brand-soft text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {symptom && symptom !== "I don't know" && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Why do you think it happened?</div>
              <div className="flex flex-wrap gap-1.5">
                {CAUSES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCause(c)}
                    aria-pressed={cause === c}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      cause === c
                        ? "border-brand-bright/60 bg-brand-soft text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(symptom || quick) && (
            <Button size="sm" onClick={() => finish(quick, symptom, cause)} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Save
            </Button>
          )}
        </div>
      )}
      {quick && !more && (
        <div className="mt-3">
          <Button size="sm" onClick={() => finish(quick, symptom, cause)} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared question-answer engine for Part 1 / Part 3
// ---------------------------------------------------------------------------

interface QA {
  topicId: string;
  questionId: string;
  prompt: string;
}

function QuestionFlow({
  kind,
  session,
  questions,
  onFinish,
}: {
  kind: "part1" | "part3";
  session: SessionMeta;
  questions: QA[];
  onFinish: () => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const saveRecording = useProgress((s) => s.saveRecording);
  const [idx, setIdx] = React.useState(0);
  const [phase, setPhase] = React.useState<"question" | "recording" | "review">("question");
  const [recordingId, setRecordingId] = React.useState<string | null>(null);
  const [diagDone, setDiagDone] = React.useState(true);
  const [vocabOpen, setVocabOpen] = React.useState(false);
  const [micError, setMicError] = React.useState(false);
  const recorderRef = React.useRef<SegmentRecorder | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const { level, waveform } = useMicLevel(phase === "recording");
  const micStatus = useMicStatus();

  // elapsed recording timer
  React.useEffect(() => {
    if (phase !== "recording") return;
    setElapsed(0);
    const t = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const qa = questions[idx];
  const topic = kind === "part1" ? part1TopicById(qa.topicId) : part3TopicById(qa.topicId);
  const support = kind === "part3" ? questionSupport(qa.prompt) : null;

  // guard against accidental navigation while recording
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (phase === "recording") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const startRecording = async () => {
    setMicError(false);
    const stream = micManager.getLiveStream() || (await micManager.request());
    if (!stream) {
      setMicError(true);
      return;
    }
    const rec = new SegmentRecorder();
    if (!rec.start(stream)) {
      setMicError(true);
      return;
    }
    recorderRef.current = rec;
    setPhase("recording");
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    const result = await rec.stop();
    recorderRef.current = null;
    if (!result || result.blob.size === 0) {
      setPhase("question");
      return;
    }
    const meta = await saveRecording(
      {
        sessionId: session.id,
        part: kind === "part1" ? 1 : 3,
        topicId: qa.topicId,
        questionId: qa.questionId,
        startedAt: Date.now() - result.duration * 1000,
        duration: result.duration,
        mimeType: result.mimeType,
        size: result.blob.size,
        label: `${kind === "part1" ? "Part 1" : "Part 3"} — ${topicTitle(qa.topicId)}`,
      },
      result.blob
    );
    setRecordingId(meta.id);
    setDiagDone(false);
    setPhase("review");
  };

  const next = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setPhase("question");
      setRecordingId(null);
    } else {
      onFinish();
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col px-4 py-6 sm:py-10">
      {/* Session header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
            Part {kind === "part1" ? "1" : "3"}
          </div>
          <div className="mt-0.5 truncate text-lg font-semibold tracking-tight">
            {topic?.title}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {idx + 1}
            <span className="text-muted-foreground/60"> / {questions.length}</span>
          </div>
          <div className="text-[10px] tracking-widest text-muted-foreground uppercase">question</div>
        </div>
      </div>

      {/* Progress dots */}
      <div className="mb-8 flex gap-1.5" aria-hidden>
        {questions.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < idx ? "bg-brand-bright" : i === idx ? "bg-brand-bright/60" : "bg-muted-foreground/20"
            )}
          />
        ))}
      </div>

      {/* Question */}
      <div className="flex-1">
        <h2 className="text-balance text-xl leading-snug font-semibold tracking-tight sm:text-[26px] sm:leading-snug">
          {qa.prompt}
        </h2>

        {support && phase === "question" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
            <p className="text-sm leading-relaxed text-muted-foreground">{support}</p>
          </div>
        )}

        {/* Mic failure guidance */}
        {micError && (
          <div className="mt-6">
            <MicTestPanel compact />
          </div>
        )}
        {micStatus.status === "granted" && !micError && phase === "question" && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={startRecording} className="h-14 gap-2.5 rounded-2xl text-base shadow-md sm:min-w-56">
              <Mic className="h-5 w-5" />
              Start Recording
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setVocabOpen(true)} className="gap-2">
                <BookOpen className="h-4 w-4" />
                Useful Language
              </Button>
              {idx + 1 < questions.length && (
                <Button variant="ghost" onClick={next} className="gap-1.5 text-muted-foreground">
                  <SkipForward className="h-4 w-4" />
                  Skip
                </Button>
              )}
            </div>
          </div>
        )}
        {phase === "question" && micStatus.status !== "granted" && !micError && (
          <div className="mt-8 space-y-4">
            <Button size="lg" onClick={startRecording} className="h-14 gap-2.5 rounded-2xl text-base shadow-md sm:min-w-56">
              <Mic className="h-5 w-5" />
              Start Recording
            </Button>
            {micStatus.status === "unknown" && (
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                Tap Allow when your browser asks for microphone access. Your recording stays on
                this device — nothing is uploaded.
              </p>
            )}
          </div>
        )}

        {/* Recording */}
        {phase === "recording" && (
          <div className="mt-8 rounded-2xl border border-brand-bright/40 bg-card p-5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="rec-dot h-3 w-3 rounded-full bg-brand-bright" aria-hidden />
                <span className="text-sm font-semibold tracking-[0.14em] text-brand-bright uppercase">
                  Recording
                </span>
              </div>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {formatTime(elapsed)}
              </span>
            </div>
            <LiveWaveform waveform={waveform} active className="my-4" />
            <VolumeMeter level={level} />
            <div className="mt-5 flex justify-center">
              <Button
                size="lg"
                variant="destructive"
                onClick={stopRecording}
                className="h-14 gap-2.5 rounded-2xl text-base shadow-md"
              >
                <Square className="h-5 w-5" />
                Stop Recording
              </Button>
            </div>
          </div>
        )}

        {/* Review */}
        {phase === "review" && recordingId && (
          <div className="mt-8 space-y-4">
            <AudioPlayer recordingId={recordingId} title={qa.prompt} />
            {!diagDone && <QuickDiagnosis recordingId={recordingId} onDone={() => setDiagDone(true)} />}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPhase("question");
                  setRecordingId(null);
                }}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button onClick={next} size="lg" className="gap-2">
                {idx + 1 < questions.length ? "Next Question" : "Finish Session"}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setVocabOpen(true)} className="gap-2 text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                Useful Language
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between text-xs text-muted-foreground">
        <span>Practice mode — you control the microphone.</span>
        <button
          type="button"
          onClick={() => {
            if (phase !== "recording") {
              navigate({ name: "practice" });
            }
          }}
          className="underline-offset-4 hover:underline"
        >
          End session
        </button>
      </div>

      <VocabSheet
        open={vocabOpen}
        onOpenChange={setVocabOpen}
        title={topic?.title || ""}
        items={vocabForTopic(qa.topicId)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part 2 session
// ---------------------------------------------------------------------------

function Part2Flow({
  session,
  cardId,
  onFinish,
}: {
  session: SessionMeta;
  cardId: string;
  onFinish: () => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const saveRecording = useProgress((s) => s.saveRecording);
  const card = part2CardById(cardId)!;
  const [stage, setStage] = React.useState<"ready" | "prep" | "speaking" | "review">("ready");
  const [prepLeft, setPrepLeft] = React.useState(60);
  const [speakLeft, setSpeakLeft] = React.useState(120);
  const [notes, setNotes] = React.useState("");
  const [recordingId, setRecordingId] = React.useState<string | null>(null);
  const [diagDone, setDiagDone] = React.useState(true);
  const [vocabOpen, setVocabOpen] = React.useState(false);
  const recorderRef = React.useRef<SegmentRecorder | null>(null);
  const { level, waveform } = useMicLevel(stage === "speaking");
  const notesRef = React.useRef("");
  React.useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (stage === "speaking" || stage === "prep") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [stage]);

  const beginPrep = async () => {
    // user gesture → acquire and keep the microphone stream
    const stream = micManager.getLiveStream() || (await micManager.request());
    if (!stream) return; // MicTestPanel below shows guidance
    setPrepLeft(60);
    setStage("prep");
  };

  const startSpeaking = () => {
    const stream = micManager.getLiveStream();
    if (!stream) {
      setStage("ready");
      return;
    }
    const rec = new SegmentRecorder();
    if (!rec.start(stream)) {
      setStage("ready");
      return;
    }
    recorderRef.current = rec;
    setSpeakLeft(120);
    setStage("speaking");
  };

  const stopSpeaking = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    const result = await rec.stop();
    recorderRef.current = null;
    if (!result || result.blob.size === 0) {
      setStage("review");
      return;
    }
    const meta = await saveRecording(
      {
        sessionId: session.id,
        part: 2,
        topicId: card.id,
        questionId: card.id,
        startedAt: Date.now() - result.duration * 1000,
        duration: result.duration,
        mimeType: result.mimeType,
        size: result.blob.size,
        label: `Part 2 — ${card.title}`,
      },
      result.blob
    );
    setRecordingId(meta.id);
    setDiagDone(false);
    setStage("review");
  };

  const circumference = 2 * Math.PI * 52;

  // timers — declared after the functions they call
  // preparation countdown → auto-start speaking
  React.useEffect(() => {
    if (stage !== "prep") return;
    const t = setInterval(() => {
      setPrepLeft((left) => {
        if (left <= 1) {
          clearInterval(t);
          startSpeaking();
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [stage]);

  // speaking countdown → auto-stop
  React.useEffect(() => {
    if (stage !== "speaking") return;
    const t = setInterval(() => {
      setSpeakLeft((left) => {
        if (left <= 1) {
          clearInterval(t);
          stopSpeaking();
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [stage]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
            Part 2 — Long Turn
          </div>
          <div className="mt-0.5 truncate text-lg font-semibold tracking-tight">{card.title}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setVocabOpen(true)} className="gap-1.5 text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          Words
        </Button>
      </div>

      {/* Cue card */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="text-[15px] leading-relaxed font-medium sm:text-base">{card.prompt}</p>
        <div className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          You should say
        </div>
        <ul className="mt-2 space-y-1.5">
          {card.bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright/70" />
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
          {card.finalPoint}
        </p>
      </div>

      {stage === "ready" && (
        <div className="mt-6 space-y-4">
          <MicTestPanel />
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={beginPrep}
              className="h-14 gap-2.5 rounded-2xl px-8 text-base shadow-md"
            >
              <NotebookPen className="h-5 w-5" />
              Begin Preparation — 1 minute
            </Button>
          </div>
          <p className="mx-auto max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
            The microphone stays silent while you prepare. Speak for two minutes when the timer
            ends — your notes stay visible.
          </p>
        </div>
      )}

      {(stage === "prep" || stage === "speaking") && (
        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          {/* Notes */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Your notes
              </span>
              <span className="text-[10px] text-muted-foreground">
                Use keywords, not full sentences
              </span>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={"when / where\nwho\nwhat happened\nturning point\nfeeling"}
              aria-label="Keyword notes for your Part 2 answer"
              className="min-h-[140px] resize-none border-0 bg-transparent p-1 font-mono text-sm leading-relaxed focus-visible:ring-0"
            />
          </div>

          {/* Timer + stage */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-5">
            <div className="relative h-32 w-32">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" strokeWidth="6" className="stroke-muted-foreground/15" />
                <circle
                  cx="60" cy="60" r="52" fill="none" strokeWidth="6" strokeLinecap="round"
                  className={cn(
                    "transition-[stroke-dashoffset] duration-1000 ease-linear",
                    stage === "speaking" ? "stroke-brand-bright" : "stroke-muted-foreground/50"
                  )}
                  strokeDasharray={circumference}
                  strokeDashoffset={
                    circumference *
                    (1 - (stage === "prep" ? prepLeft : speakLeft) / (stage === "prep" ? 60 : 120))
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("font-mono text-2xl font-semibold tabular-nums", stage === "speaking" && "text-brand-bright")}>
                  {formatTime(stage === "prep" ? prepLeft : speakLeft)}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {stage === "prep" ? "Preparation" : "Speaking"}
                </span>
              </div>
            </div>
            {stage === "speaking" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="rec-dot h-2.5 w-2.5 rounded-full bg-brand-bright" aria-hidden />
                <span className="text-[10px] font-semibold tracking-[0.14em] text-brand-bright uppercase">
                  Recording
                </span>
              </div>
            )}
            {stage === "prep" && (
              <Button
                size="sm"
                variant="outline"
                onClick={startSpeaking}
                className="mt-3 gap-1.5"
              >
                <Mic className="h-4 w-4" />
                Start speaking now
              </Button>
            )}
          </div>
        </div>
      )}

      {stage === "speaking" && (
        <div className="mt-4 rounded-2xl border border-brand-bright/40 bg-card p-4">
          <LiveWaveform waveform={waveform} active className="h-10" />
          <div className="mt-2 flex items-center justify-between">
            <VolumeMeter level={level} showLabel={false} />
            <Button
              variant="outline"
              size="sm"
              onClick={stopSpeaking}
              className="ml-4 gap-1.5"
            >
              <Square className="h-3.5 w-3.5" />
              Done speaking
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Recording stops automatically at 00:00
          </p>
        </div>
      )}

      {stage === "review" && (
        <div className="mt-6 space-y-4">
          <AudioPlayer recordingId={recordingId || ""} title={card.title} />
          {!diagDone && recordingId && (
            <QuickDiagnosis recordingId={recordingId} onDone={() => setDiagDone(true)} />
          )}
          {notes && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Your preparation notes
              </div>
              <pre className="mt-2 font-mono text-sm whitespace-pre-wrap text-muted-foreground">{notes}</pre>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStage("prep");
                setPrepLeft(60);
                setRecordingId(null);
              }}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retry this card
            </Button>
            <Button onClick={onFinish} size="lg" className="gap-2">
              Finish Session
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-10 flex items-center justify-between text-xs text-muted-foreground">
        <span>Notes remain visible throughout your answer.</span>
        {stage !== "speaking" && (
          <button
            type="button"
            onClick={() => navigate({ name: "practice" })}
            className="underline-offset-4 hover:underline"
          >
            End session
          </button>
        )}
      </div>

      <VocabSheet
        open={vocabOpen}
        onOpenChange={setVocabOpen}
        title={card.title}
        items={vocabForTopic(card.id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session wrapper — owns session lifecycle + summary
// ---------------------------------------------------------------------------

export function SessionView({
  kind,
  topicIds,
}: {
  kind: "part1" | "part2" | "part3";
  topicIds: string[];
}) {
  const navigate = useApp((s) => s.navigate);
  const startSession = useProgress((s) => s.startSession);
  const finishSession = useProgress((s) => s.finishSession);
  const recordings = useProgress((s) => s.recordings);
  const [session, setSession] = React.useState<SessionMeta | null>(null);
  const [done, setDone] = React.useState(false);

  const questions: QA[] = React.useMemo(() => {
    const out: QA[] = [];
    if (kind === "part1") {
      for (const tid of topicIds) {
        const t = part1TopicById(tid);
        t?.questions.forEach((q) => out.push({ topicId: tid, questionId: q.id, prompt: q.prompt }));
      }
    } else if (kind === "part3") {
      for (const tid of topicIds) {
        const t = part3TopicById(tid);
        t?.questions.forEach((q) => out.push({ topicId: tid, questionId: q.id, prompt: q.prompt }));
      }
    }
    return out;
  }, [kind, topicIds]);

  React.useEffect(() => {
    const title =
      kind === "part2"
        ? part2CardById(topicIds[0])?.title || "Part 2"
        : topicIds.map(topicTitle).join(" · ");
    const total = kind === "part2" ? 1 : questions.length;
    const s = startSession(kind, title, topicIds, total);
    setSession(s);
    return () => {
      const current = useProgress.getState().sessions.find((x) => x.id === s.id);
      if (current && current.status === "in-progress") {
        finishSession(s.id, "interrupted");
      }
    };
  }, []);

  const finish = () => {
    if (session) finishSession(session.id, "completed");
    micManager.release();
    setDone(true);
  };

  if (!session) return null;

  if (done) {
    const sessionRecordings = recordings
      .filter((r) => r.sessionId === session.id)
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt);
    const totalSeconds = sessionRecordings.reduce((a, r) => a + r.duration, 0);
    return (
      <div className="fade-up mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <div className="text-center">
          <div className="star-burst mx-auto w-fit">
            <StarMark size={64} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Session complete
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {sessionRecordings.length}{" "}
            {sessionRecordings.length === 1 ? "answer" : "answers"} recorded ·{" "}
            {formatTime(totalSeconds)} of speaking.
          </p>
        </div>

        {sessionRecordings.length > 0 && (
          <>
            {/* Evaluation lives here, with the recordings — not behind a corner button. */}
            <div className="mt-8">
              <SendToStella
                recordings={sessionRecordings}
                sessionId={session.id}
                heading="Get this session evaluated"
              />
            </div>

            <div className="mt-6 space-y-3">
              <h2 className="px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Your answers
              </h2>
              {sessionRecordings.map((r, index) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-1.5 truncate text-xs text-muted-foreground">
                    {index + 1}. {r.label}
                  </div>
                  <AudioPlayer recordingId={r.id} compact />
                  <div className="mt-2">
                    <AnalyseAnswerLink recordingId={r.id} sessionId={session.id} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => navigate({ name: "recordings" })}>
            All recordings
          </Button>
          <Button variant="outline" onClick={() => navigate({ name: "practice" })} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Practice something else
          </Button>
        </div>
      </div>
    );
  }

  if (kind === "part2") {
    return <Part2Flow session={session} cardId={topicIds[0]} onFinish={finish} />;
  }
  return <QuestionFlow kind={kind} session={session} questions={questions} onFinish={finish} />;
}
