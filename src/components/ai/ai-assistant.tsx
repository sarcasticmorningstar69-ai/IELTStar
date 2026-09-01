"use client";

import * as React from "react";
import { useApp, viewTitle, type View } from "@/lib/store/app";
import { useProgress, type RecordingMeta } from "@/lib/store/progress";
import { getAudio } from "@/lib/storage/audio-db";
import {
  IELTS_CRITERIA,
  type AiMode,
  type AiProviderStatus,
  type AiRequestMetadata,
  type AiSurface,
} from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AudioLines,
  Bot,
  Check,
  FileText,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";

type Tab = "ask" | "feedback";

function surfaceForView(view: View): AiSurface {
  if (view.name === "session") return view.kind;
  if (view.name === "mock-run" || view.name === "mock-review") return "full-mock";
  if (view.name === "topic-wheel") return "topic-wheel";
  if (view.name === "technique") return "technique";
  if (view.name === "problem") return "problem";
  if (view.name === "recordings") return "recordings";
  if (view.name === "learn" && view.tab === "tips") return "tip";
  if (view.name === "part1" || view.name === "part2" || view.name === "part3") return view.name;
  return "general";
}

function captureVisibleContext(): string {
  if (typeof document === "undefined") return "";
  const selection = window.getSelection()?.toString().trim() || "";
  const main = document.querySelector("main");
  const visible = (main?.textContent || "").replace(/\s+/g, " ").trim();
  const parts = [
    selection ? `Student-selected text:\n${selection}` : "",
    visible ? `Current screen:\n${visible.slice(0, 12000)}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

function relevantRecordings(
  view: View,
  recordings: RecordingMeta[],
  sessions: { id: string; title: string; type: string }[]
): RecordingMeta[] {
  if (view.name === "mock-review" || view.name === "mock-run") {
    return recordings.filter((r) => r.mockId === view.mockId);
  }
  if (view.name === "session") {
    const part = view.kind === "part1" ? 1 : view.kind === "part2" ? 2 : 3;
    return recordings.filter((r) => r.part === part).slice(0, 12);
  }
  if (view.name === "topic-wheel") {
    const wheelSessions = new Set(
      sessions.filter((s) => s.title === "Topic Wheel").map((s) => s.id)
    );
    return recordings.filter((r) => wheelSessions.has(r.sessionId)).slice(0, 12);
  }
  if (view.name === "recordings") return recordings.slice(0, 20);
  return recordings.slice(0, 8);
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function speakText(text: string, onEnd: () => void) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 0.96;
  utterance.pitch = 1;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function AiAssistant() {
  const view = useApp((s) => s.view);
  const recordings = useProgress((s) => s.recordings);
  const sessions = useProgress((s) => s.sessions);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("ask");
  const [context, setContext] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [status, setStatus] = React.useState<AiProviderStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);

  const surface = surfaceForView(view);
  const title = viewTitle(view);
  const candidates = React.useMemo(
    () => relevantRecordings(view, recordings, sessions),
    [view, recordings, sessions]
  );

  const openAssistant = () => {
    setContext(captureVisibleContext());
    setMessage("");
    setAnswer("");
    setPreview(false);
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/ai/evaluate", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: AiProviderStatus) => alive && setStatus(data))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || selectedIds.size || !candidates.length) return;
    setSelectedIds(new Set([candidates[0].id]));
  }, [open, candidates, selectedIds.size]);

  React.useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleRecording = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const readAnswer = () => {
    if (!answer) return;
    setSpeaking(true);
    if (!speakText(answer, () => setSpeaking(false))) {
      setSpeaking(false);
      setMessage("Text-to-speech is not available in this browser.");
    }
  };

  const submitAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setMessage("");
    setAnswer("");
    const metadata: AiRequestMetadata = {
      mode: "context-chat",
      surface,
      pageTitle: title,
      pageContext: context,
      question: question.trim(),
    };
    try {
      const response = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "AI assistance is not available yet.");
      setAnswer(data.answer || data.message || "Response received.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI assistance is not available yet.");
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    const selected = candidates.filter((r) => selectedIds.has(r.id));
    if (!selected.length) {
      setMessage("Choose at least one recording first.");
      return;
    }
    setLoading(true);
    setMessage("");
    setAnswer("");
    try {
      const stored = await Promise.all(selected.map((r) => getAudio(r.id)));
      const available = stored.filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!available.length) throw new Error("The selected audio is no longer available on this device.");

      const mode: AiMode = surface === "topic-wheel" ? "topic-wheel-feedback" : "ielts-evaluation";
      const metadata: AiRequestMetadata = {
        mode,
        surface,
        pageTitle: title,
        pageContext: context,
        recordingIds: selected.map((r) => r.id),
      };
      const form = new FormData();
      form.append("metadata", JSON.stringify(metadata));
      available.forEach((item, index) => {
        form.append("audio", item.blob, `ieltstar-answer-${index + 1}.webm`);
      });

      const response = await fetch("/api/ai/evaluate", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "AI feedback is not available yet.");
      setAnswer(data.answer || data.message || "Feedback received.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI feedback is not available yet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className="fixed right-4 bottom-4 z-40 flex h-12 items-center gap-2 rounded-full border border-brand-bright/35 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:right-6 sm:bottom-6"
        aria-label="Open contextual AI assistant"
      >
        <Sparkles className="h-4 w-4" />
        AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/55 backdrop-blur-sm" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="IELTStar AI assistant"
            className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-3xl border border-border bg-card shadow-2xl sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[430px] sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] text-brand-bright uppercase">
                  <Bot className="h-4 w-4" />
                  Contextual AI
                </div>
                <p className="mt-1 truncate text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  This screen is already attached as context.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close AI assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex gap-1 border-b border-border px-4 pt-3" role="tablist">
              {(["ask", "feedback"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  onClick={() => {
                    setTab(item);
                    setMessage("");
                  }}
                  className={cn(
                    "flex-1 border-b-2 px-3 py-2.5 text-xs font-semibold tracking-wide capitalize transition-colors",
                    tab === item
                      ? "border-brand-bright text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item === "ask" ? "Ask about this" : "Recording feedback"}
                </button>
              ))}
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-medium tracking-wide uppercase">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  {context ? "Page context ready" : "General context"}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                    status?.glm
                      ? "border-success/40 text-success"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  GLM {status?.glm ? "connected" : "not connected"}
                </span>
                {tab === "feedback" && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                      status?.deepgram
                        ? "border-success/40 text-success"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Deepgram {status?.deepgram ? "connected" : "not connected"}
                  </span>
                )}
              </div>

              {tab === "ask" ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="ai-question" className="text-xs font-semibold">
                      Ask naturally
                    </label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      You can say “How do I use this?” — the assistant already knows which
                      technique, tip, problem, or practice screen is open.
                    </p>
                    <textarea
                      id="ai-question"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="How can I use this in my next answer?"
                      className="mt-3 min-h-28 w-full resize-none rounded-2xl border border-border bg-surface p-3.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-bright/60"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Explain this simply", "Give me an example", "Turn this into a drill"].map(
                      (prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setQuestion(prompt)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-brand-bright/40 hover:text-foreground"
                        >
                          {prompt}
                        </button>
                      )
                    )}
                  </div>
                  <Button
                    onClick={submitAsk}
                    disabled={loading || !question.trim() || !status?.glm}
                    className="w-full gap-2"
                  >
                    {loading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Ask with this page attached
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Choose recordings</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Only selected audio will be uploaded after you press Analyse.
                        </p>
                      </div>
                      <AudioLines className="h-5 w-5 shrink-0 text-brand-bright" />
                    </div>
                    {candidates.length ? (
                      <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                        {candidates.map((recording) => {
                          const selected = selectedIds.has(recording.id);
                          return (
                            <button
                              key={recording.id}
                              type="button"
                              onClick={() => toggleRecording(recording.id)}
                              aria-pressed={selected}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                                selected
                                  ? "border-brand-bright/50 bg-brand-soft"
                                  : "border-border bg-surface hover:border-brand-bright/30"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                                  selected
                                    ? "border-brand-bright bg-primary text-primary-foreground"
                                    : "border-border"
                                )}
                              >
                                {selected && <Check className="h-3 w-3" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">
                                  {recording.label}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  Part {recording.part} · {formatDuration(recording.duration)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        Record an answer first. It will appear here automatically.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Feedback preview
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {IELTS_CRITERIA.map((criterion) => (
                        <div key={criterion} className="rounded-xl border border-border bg-card p-3">
                          <div className="text-[10px] leading-tight text-muted-foreground">
                            {criterion}
                          </div>
                          <div className="mt-2 font-mono text-xl font-semibold">—</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreview((value) => !value)}
                      className="mt-3 text-xs font-medium text-brand-bright underline-offset-4 hover:underline"
                    >
                      {preview ? "Hide details" : "Preview everything included"}
                    </button>
                    {preview && (
                      <ul className="mt-3 space-y-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                        <li>Transcript with timings and uncertain words</li>
                        <li>Filler words such as “um”, “uh”, “like”, and repetitions</li>
                        <li>Evidence for every IELTS criterion and focused next steps</li>
                        <li>Separate non-band coaching for Topic Wheel recordings</li>
                      </ul>
                    )}
                  </div>

                  <Button
                    onClick={submitFeedback}
                    disabled={loading || !selectedIds.size || !status?.deepgram || !status?.glm}
                    className="w-full gap-2"
                  >
                    {loading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Analyse selected recordings
                  </Button>

                  <div className="flex gap-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Deepgram will create the transcript. GLM will receive the transcript,
                      timings, question context, and rubric — never your secret API keys.
                    </p>
                  </div>
                </div>
              )}

              {message && (
                <div role="status" className="mt-4 rounded-xl border border-border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground">
                  {message}
                </div>
              )}

              {answer && (
                <div className="mt-4 rounded-2xl border border-brand-bright/35 bg-brand-soft p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold tracking-[0.14em] text-brand-bright uppercase">
                      AI response
                    </div>
                    <button
                      type="button"
                      onClick={speaking ? stopSpeaking : readAnswer}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {speaking ? "Stop" : "Read aloud"}
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
