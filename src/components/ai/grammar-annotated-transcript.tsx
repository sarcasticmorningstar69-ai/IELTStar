"use client";

import * as React from "react";
import type { AiTranscriptWord, AiGrammarCorrection } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { formatTime } from "@/components/audio/audio-ui";
import { AlertCircle, CheckCircle2, FileText, Headphones, Sparkles } from "lucide-react";

interface GrammarAnnotatedTranscriptProps {
  transcript: string;
  words: AiTranscriptWord[];
  grammarCorrections?: AiGrammarCorrection[];
  current: number;
  onSeek: (time: number) => void;
  isRunning?: boolean;
  onOpenCorrection?: () => void;
  isVerified?: boolean;
}

export function GrammarAnnotatedTranscript({
  transcript,
  words,
  grammarCorrections = [],
  current,
  onSeek,
  isRunning = false,
  onOpenCorrection,
  isVerified = false,
}: GrammarAnnotatedTranscriptProps) {
  const [activeTab, setActiveTab] = React.useState<"sync" | "grammar">("sync");
  const [selectedError, setSelectedError] = React.useState<AiGrammarCorrection | null>(null);

  const hasCorrections = grammarCorrections.length > 0;

  // Build annotated text highlighting corrections with precise non-overlapping intervals
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

    // Find all intervals for each correction
    grammarCorrections.forEach((corr) => {
      if (!corr.original) return;
      const target = corr.original.toLowerCase().trim();
      let searchPos = 0;
      const idx = lowerTranscript.indexOf(target, searchPos);
      if (idx !== -1) {
        intervals.push({
          start: idx,
          end: idx + target.length,
          corr,
        });
      }
    });

    // Sort by start position
    intervals.sort((a, b) => a.start - b.start);

    // Filter out overlapping intervals
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
      // Leading text
      if (interval.start > cursor) {
        parts.push(
          <span key={`text-${i}`}>
            {transcript.slice(cursor, interval.start)}
          </span>
        );
      }

      const spokenSlip = transcript.slice(interval.start, interval.end);

      // Burgundy Strikethrough + Emerald Bracketed Correction
      parts.push(
        <span
          key={`err-${i}`}
          className="inline-flex items-baseline flex-wrap mx-1 my-0.5 cursor-pointer select-none"
          onClick={() => setSelectedError(interval.corr)}
          title={`Grammar slip: "${spokenSlip}" → Standard: "${interval.corr.corrected}". Click to view examiner rule.`}
        >
          <span className="grammar-strike">{spokenSlip}</span>
          <span className="grammar-correction-tag">
            [{interval.corr.corrected}]
          </span>
        </span>
      );

      cursor = interval.end;
    });

    if (cursor < transcript.length) {
      parts.push(
        <span key="text-trailing">{transcript.slice(cursor)}</span>
      );
    }

    return parts;
  }, [transcript, grammarCorrections]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      {/* Header & Tab Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-bright" />
          <h4 className="text-sm font-bold text-foreground">Candidate Transcript &amp; Audit</h4>
          {isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Verified
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenCorrection && (
            <button
              type="button"
              onClick={onOpenCorrection}
              className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20 cursor-pointer"
            >
              Transcript is wrong?
            </button>
          )}

          <div className="inline-flex rounded-xl bg-surface p-1 border border-border text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("sync")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
              activeTab === "sync"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Headphones className="h-3 w-3" />
            <span>Audio Playback Sync</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("grammar")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer",
              activeTab === "grammar"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3 w-3 text-brand-bright" />
            <span>Grammar &amp; Slips</span>
            {hasCorrections && (
              <span className="rounded-full bg-brand-soft px-1.5 py-0.2 text-[10px] font-bold text-brand-bright">
                {grammarCorrections.length}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>

      {/* Mode 1: Interactive Audio Transcript with Word-Level Seeking */}
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
                      isUnsure ? " (Unclear recognizer confidence)" : ""
                    }`}
                    className={cn(
                      "mr-1.5 inline-block rounded-md px-1 py-0.5 transition-all cursor-pointer",
                      isNow
                        ? "bg-brand-bright text-primary-foreground font-semibold scale-105 shadow-sm"
                        : isUnsure
                          ? "text-muted-foreground underline decoration-dotted decoration-warning/60 hover:bg-brand-soft"
                          : "hover:bg-brand-soft text-foreground/90"
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
                ? "Stella is preparing your synchronized transcript..."
                : "No transcript available for this answer."}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            💡 <strong className="text-foreground font-semibold">Interactive Sync:</strong> Click any word to jump audio playback to that second. Words glow in real time as your recording plays.
          </p>
        </div>
      )}

      {/* Mode 2: Burgundy Red Strikethrough & Grammar Diagnostic Breakdown */}
      {activeTab === "grammar" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Burgundy Red & Emerald Legend */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/60 p-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="grammar-strike text-[11px]">spoken slip</span>
              <span className="text-muted-foreground">= Grammatical Error (Burgundy Red)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="grammar-correction-tag text-[11px]">[standard IELTS]</span>
              <span className="text-muted-foreground">= Band 8+ Phrasing</span>
            </div>
          </div>

          {/* Full Annotated Transcript Box */}
          <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-surface/30 p-4 text-sm leading-loose">
            {renderedAnnotatedContent}
          </div>

          {/* Detailed Error Cards */}
          {hasCorrections ? (
            <div className="space-y-2.5 pt-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                <span>Grammar Diagnostics ({grammarCorrections.length} Identified)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {grammarCorrections.map((corr, idx) => {
                  const isSelected = selectedError === corr;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedError(corr)}
                      className={cn(
                        "rounded-xl border p-3.5 space-y-2 transition-all cursor-pointer",
                        isSelected
                          ? "border-brand-bright bg-brand-soft/40 shadow-xs"
                          : "border-border bg-surface hover:border-brand-bright/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="text-xs">
                            <span className="grammar-strike text-xs">{corr.original}</span>
                            <span className="grammar-correction-tag text-xs">[{corr.corrected}]</span>
                          </div>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
                        <strong className="text-foreground">Rule:</strong> {corr.explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-xs text-emerald-700 dark:text-emerald-300">
              ✓ No grammatical inaccuracies identified. Excellent grammatical control and sentence consistency!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
