"use client";

/**
 * Transcript with grammar annotations.
 *
 * An empty correction list means Stella did not flag anything in this answer.
 * That is NOT the same as flawless grammar, so this component never says it is.
 * A student-typed transcript is labelled as the student's own version, never as
 * "verified", because nothing re-checks it against the audio.
 */
import * as React from "react";
import type { AiTranscriptWord, AiGrammarCorrection } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { formatTime } from "@/components/audio/audio-ui";
import { AlertCircle, CheckCircle2, FileText, Headphones, Info, Sparkles } from "lucide-react";

interface GrammarAnnotatedTranscriptProps {
  transcript: string;
  words: AiTranscriptWord[];
  grammarCorrections?: AiGrammarCorrection[];
  current: number;
  onSeek: (time: number) => void;
  isRunning?: boolean;
  onOpenCorrection?: () => void;
  /** True when the student typed their own version of this transcript. */
  isStudentEdited?: boolean;
}

export function GrammarAnnotatedTranscript({
  transcript,
  words,
  grammarCorrections = [],
  current,
  onSeek,
  isRunning = false,
  onOpenCorrection,
  isStudentEdited = false,
}: GrammarAnnotatedTranscriptProps) {
  const [activeTab, setActiveTab] = React.useState<"sync" | "grammar">("sync");
  const [selectedError, setSelectedError] = React.useState<AiGrammarCorrection | null>(null);

  const hasCorrections = grammarCorrections.length > 0;

  const renderedAnnotatedContent = React.useMemo(() => {
    if (!transcript || grammarCorrections.length === 0) {
      return <span>{transcript || "No transcript available."}</span>;
    }

    interface MatchInterval {
      start: number;
      end: number;
      corr: AiGrammarCorrection;
    }

    const lowerTranscript = transcript.toLowerCase();
    const intervals: MatchInterval[] = [];

    grammarCorrections.forEach((corr) => {
      if (!corr.original) return;
      const target = corr.original.toLowerCase().trim();
      const idx = lowerTranscript.indexOf(target);
      if (idx !== -1) {
        intervals.push({ start: idx, end: idx + target.length, corr });
      }
    });

    intervals.sort((a, b) => a.start - b.start);

    const nonOverlapping: MatchInterval[] = [];
    let lastEnd = 0;
    for (const interval of intervals) {
      if (interval.start >= lastEnd) {
        nonOverlapping.push(interval);
        lastEnd = interval.end;
      }
    }

    if (nonOverlapping.length === 0) {
      return <span>{transcript}</span>;
    }

    const parts: React.ReactNode[] = [];
    let cursor = 0;

    nonOverlapping.forEach((interval, i) => {
      if (interval.start > cursor) {
        parts.push(<span key={`text-${i}`}>{transcript.slice(cursor, interval.start)}</span>);
      }

      const spokenSlip = transcript.slice(interval.start, interval.end);

      parts.push(
        <span
          key={`err-${i}`}
          className="mx-1 my-0.5 inline-flex flex-wrap items-baseline cursor-pointer select-none"
          onClick={() => setSelectedError(interval.corr)}
          title={`Grammar slip: "${spokenSlip}" → suggested: "${interval.corr.corrected}". Click to read the rule.`}
        >
          <span className="grammar-strike">{spokenSlip}</span>
          <span className="grammar-correction-tag">[{interval.corr.corrected}]</span>
        </span>
      );

      cursor = interval.end;
    });

    if (cursor < transcript.length) {
      parts.push(<span key="text-trailing">{transcript.slice(cursor)}</span>);
    }

    return parts;
  }, [transcript, grammarCorrections]);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-bright" />
          <h4 className="text-sm font-bold text-foreground">Transcript &amp; grammar notes</h4>
          {isStudentEdited && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
              <Info className="h-3 w-3" /> Your version · not re-checked against the audio
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenCorrection && (
            <button
              type="button"
              onClick={onOpenCorrection}
              className="cursor-pointer rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20"
            >
              Transcript is wrong?
            </button>
          )}

          <div className="inline-flex rounded-xl border border-border bg-surface p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("sync")}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-all",
                activeTab === "sync"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Headphones className="h-3 w-3" />
              <span>Playback sync</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("grammar")}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-all",
                activeTab === "grammar"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="h-3 w-3 text-brand-bright" />
              <span>Grammar &amp; slips</span>
              {hasCorrections && (
                <span className="rounded-full bg-brand-soft px-1.5 text-[10px] font-bold text-brand-bright">
                  {grammarCorrections.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {activeTab === "sync" && (
        <div className="space-y-3">
          {words.length > 0 ? (
            <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-surface/40 p-4 text-sm leading-loose">
              {words.map((wordObj, index) => {
                const isNow = current >= wordObj.start && current < wordObj.end;
                const isUnsure = wordObj.confidence < 0.6;
                return (
                  <button
                    key={`${wordObj.start}-${index}`}
                    type="button"
                    onClick={() => onSeek(wordObj.start)}
                    title={`Jump to ${formatTime(wordObj.start)}${
                      isUnsure ? " (the recogniser was unsure here)" : ""
                    }`}
                    className={cn(
                      "mr-1.5 inline-block cursor-pointer rounded-md px-1 py-0.5 transition-all",
                      isNow
                        ? "scale-105 bg-brand-bright font-semibold text-primary-foreground shadow-sm"
                        : isUnsure
                          ? "text-muted-foreground underline decoration-dotted decoration-warning/60 hover:bg-brand-soft"
                          : "text-foreground/90 hover:bg-brand-soft"
                    )}
                  >
                    {wordObj.word}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {isRunning
                ? "Stella is preparing your synchronised transcript…"
                : "No transcript available for this answer."}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Click any word to jump playback to that moment. Dotted words are ones the speech
            recogniser was unsure about.
          </p>
        </div>
      )}

      {activeTab === "grammar" && (
        <div className="animate-in fade-in space-y-4 duration-150">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/60 p-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="grammar-strike text-[11px]">spoken slip</span>
              <span className="text-muted-foreground">= what you said</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="grammar-correction-tag text-[11px]">[suggested]</span>
              <span className="text-muted-foreground">= a more standard form</span>
            </div>
          </div>

          <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-surface/30 p-4 text-sm leading-loose">
            {renderedAnnotatedContent}
          </div>

          {hasCorrections ? (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                <span>Grammar notes ({grammarCorrections.length})</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {grammarCorrections.map((corr, idx) => {
                  const isSelected = selectedError === corr;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedError(corr)}
                      className={cn(
                        "cursor-pointer space-y-2 rounded-xl border p-3.5 transition-all",
                        isSelected
                          ? "border-brand-bright bg-brand-soft/40 shadow-xs"
                          : "border-border bg-surface hover:border-brand-bright/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="text-xs">
                            <span className="grammar-strike text-xs">{corr.original}</span>
                            <span className="grammar-correction-tag text-xs">
                              [{corr.corrected}]
                            </span>
                          </div>
                        </div>
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      </div>

                      <p className="border-t border-border/50 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">Rule:</strong> {corr.explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Honest wording: no flags is not proof of perfect grammar.
            <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-xs text-muted-foreground">
              Stella didn&apos;t flag any grammar points in this answer. That isn&apos;t a
              guarantee that everything was accurate — short answers in particular give her very
              little to judge.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
