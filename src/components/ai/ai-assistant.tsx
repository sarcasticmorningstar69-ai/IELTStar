"use client";

/**
 * The corner assistant — deliberately one job only: answering questions about
 * whatever is currently on screen.
 *
 * Sending recordings for evaluation lives under the recordings themselves (see
 * `send-to-stella.tsx`), because that is where students look for it. Having two
 * entry points for the AI made the whole thing confusing.
 */
import * as React from "react";
import { useApp, viewTitle, type View } from "@/lib/store/app";
import type { AiProviderStatus, AiRequestMetadata, AiSurface } from "@/lib/ai/types";
import { STELLA_STATUS_TEXT, type StellaState } from "@/lib/ai/stella-media";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoaderCircle, Send, Square, Volume2, X } from "lucide-react";

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
  return [
    selection ? `Student-selected text:\n${selection}` : "",
    visible ? `Current screen:\n${visible.slice(0, 12000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
  const [open, setOpen] = React.useState(false);
  const [context, setContext] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [status, setStatus] = React.useState<AiProviderStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [speaking, setSpeaking] = React.useState(false);
  const [stellaState, setStellaState] = React.useState<StellaState>("idle");

  const surface = surfaceForView(view);
  const title = viewTitle(view);

  const openAssistant = () => {
    setContext(captureVisibleContext());
    setMessage("");
    setAnswer("");
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
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  React.useEffect(() => {
    if (speaking) {
      setStellaState("speaking");
      return;
    }
    if (loading) {
      setStellaState("thinking");
      return;
    }
    if (message) {
      setStellaState("error");
      return;
    }
    if (answer) {
      setStellaState("finished");
      const timer = window.setTimeout(() => setStellaState("idle"), 1100);
      return () => window.clearTimeout(timer);
    }
    setStellaState("idle");
  }, [speaking, loading, message, answer]);

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

  const submit = async () => {
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
      if (!response.ok) throw new Error(data.message || "Stella is not available yet.");
      setAnswer(data.answer || data.message || "Response received.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stella is not available yet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className="fixed right-4 bottom-20 z-40 flex h-12 items-center gap-2 rounded-full border border-brand-bright/35 bg-primary pr-4 pl-2 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:right-6 sm:bottom-6"
        aria-label="Ask Stella about this page"
      >
        <StellaAvatar state="idle" size={34} frame={false} quiet />
        Ask Stella
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/55 backdrop-blur-sm" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Ask Stella about this page"
            className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-3xl border border-border bg-card shadow-2xl sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[420px] sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <StellaAvatar state={stellaState} size={50} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Stella</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Looking at: {title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ask about anything on this screen. Stella already knows which technique,
                tip or question you have open — you don’t need to name it.
              </p>

              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="How can I use this in my next answer?"
                aria-label="Your question"
                className="mt-3 min-h-28 w-full resize-none rounded-2xl border border-border bg-surface p-3.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-bright/60"
              />

              <div className="mt-3 flex flex-wrap gap-2">
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
                onClick={submit}
                disabled={loading || !question.trim() || !status?.glm}
                className="mt-4 w-full gap-2"
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Ask Stella
              </Button>

              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                To get your speaking evaluated, use the Stella card under your
                recordings after a session or mock.
              </p>

              {loading && (
                <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-6 text-center">
                  <StellaAvatar state={stellaState} size={128} />
                  <p className="text-xs text-muted-foreground">
                    {STELLA_STATUS_TEXT[stellaState]}
                  </p>
                </div>
              )}

              {message && (
                <div
                  role="status"
                  className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  <StellaAvatar state="error" size={38} />
                  <p className="pt-1">{message}</p>
                </div>
              )}

              {answer && (
                <div className="mt-4 rounded-2xl border border-brand-bright/35 bg-brand-soft p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StellaAvatar state={stellaState} size={28} frame={false} quiet />
                      <span className="text-[10px] font-semibold tracking-[0.14em] text-brand-bright uppercase">
                        Stella
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={speaking ? stopSpeaking : readAnswer}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {speaking ? (
                        <Square className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                      {speaking ? "Stop" : "Listen"}
                    </button>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
