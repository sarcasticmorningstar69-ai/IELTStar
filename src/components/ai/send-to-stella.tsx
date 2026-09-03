"use client";

/**
 * The single way recordings reach Stella.
 *
 * This card lives directly under the recordings it refers to — on the
 * session-complete screen and in mock review — so the student never has to hunt
 * for a floating button to get their speaking evaluated.
 *
 * Two routes, both one click away:
 *   • Go Full Window with Stella (analyse everything)
 *   • Choose exactly which answers to send
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import type { RecordingMeta } from "@/lib/store/progress";
import { formatTime } from "@/components/audio/audio-ui";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Maximize2, Sparkles } from "lucide-react";

export function SendToStella({
  recordings,
  mockId,
  sessionId,
  heading = "Go Full Window with Stella",
  blurb,
}: {
  recordings: RecordingMeta[];
  mockId?: string;
  sessionId?: string;
  heading?: string;
  blurb?: string;
}) {
  const navigate = useApp((s) => s.navigate);
  const [picking, setPicking] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  const ordered = React.useMemo(
    () => recordings.slice().sort((a, b) => a.startedAt - b.startedAt),
    [recordings]
  );

  const open = (ids: string[]) => {
    if (!ids.length) return;
    navigate({ name: "analysis", recordingIds: ids, mockId, sessionId, heading });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!ordered.length) return null;

  const totalSeconds = ordered.reduce((a, r) => a + r.duration, 0);
  const parts = [1, 2, 3] as const;
  const availableParts = parts.filter((p) => ordered.some((r) => r.part === p));

  return (
    <div className="rounded-2xl border border-brand-bright/35 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <StellaAvatar state="idle" size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">{heading}</h3>
            <span className="hidden items-center gap-1 rounded-full border border-brand-bright/40 bg-brand-soft/60 px-2 py-0.5 text-[10px] font-medium text-brand-bright sm:inline-flex">
              <Maximize2 className="h-2.5 w-2.5" /> Full Window AI
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {blurb ??
              `${ordered.length} ${ordered.length === 1 ? "answer" : "answers"} • ${formatTime(totalSeconds)} of speaking. Open the full-window workspace with AI thinking, IELTS reports, and interactive chat on the left, paired with exact audio playback and synchronized transcripts on the right.`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => open(ordered.map((r) => r.id))} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {ordered.length === 1
            ? "Go Full Window with Stella"
            : `Go Full Window with Stella (${ordered.length} answers)`}
        </Button>
        {ordered.length > 1 && (
          <Button
            variant="outline"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="gap-2"
          >
            Choose answers
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", picking && "rotate-180")}
            />
          </Button>
        )}
      </div>

      {picking && ordered.length > 1 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Quick select
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(ordered.map((r) => r.id)))}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              All
            </button>
            {availableParts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setSelected(
                    new Set(ordered.filter((r) => r.part === p).map((r) => r.id))
                  )
                }
                className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Part {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              None
            </button>
          </div>

          <div className="scrollbar-thin mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
            {ordered.map((r) => {
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
                      Part {r.part} • {formatTime(r.duration)}
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
              ? `Open Full Window with ${selected.size} ${selected.size === 1 ? "answer" : "answers"}`
              : "Select at least one answer"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Small inline link placed under an individual recording. */
export function AnalyseAnswerLink({
  recordingId,
  mockId,
  sessionId,
}: {
  recordingId: string;
  mockId?: string;
  sessionId?: string;
}) {
  const navigate = useApp((s) => s.navigate);
  return (
    <button
      type="button"
      onClick={() =>
        navigate({ name: "analysis", recordingIds: [recordingId], mockId, sessionId })
      }
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-bright underline-offset-4 hover:underline"
    >
      <Sparkles className="h-3 w-3" />
      Go Full Window with Stella
    </button>
  );
}
