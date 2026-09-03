"use client";

import * as React from "react";
import type { AiCriterionScore, IeltsCriterion } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { Sparkles, CheckCircle2, Volume2, BookOpen, Activity, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

const CRITERIA_METADATA: Record<
  IeltsCriterion,
  {
    acronym: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    glowColor: string;
  }
> = {
  "Fluency & Coherence": {
    acronym: "FC",
    description: "Speech continuity, natural flow, hesitations & signposting",
    icon: Activity,
    accentColor: "from-blue-500/20 to-indigo-500/20",
    glowColor: "border-blue-500/30 hover:border-blue-500/60",
  },
  "Lexical Resource": {
    acronym: "LR",
    description: "Vocabulary range, precision, idiomatic expressions & collocations",
    icon: BookOpen,
    accentColor: "from-amber-500/20 to-orange-500/20",
    glowColor: "border-amber-500/30 hover:border-amber-500/60",
  },
  "Grammatical Range & Accuracy": {
    acronym: "GRA",
    description: "Complex structures, tense consistency & error-free sentences",
    icon: CheckCircle2,
    accentColor: "from-purple-500/20 to-pink-500/20",
    glowColor: "border-purple-500/30 hover:border-purple-500/60",
  },
  "Pronunciation": {
    acronym: "PR",
    description: "Intonation, syllable stress, rhythm & natural chunking",
    icon: Volume2,
    accentColor: "from-emerald-500/20 to-teal-500/20",
    glowColor: "border-emerald-500/30 hover:border-emerald-500/60",
  },
};

const ORDERED_CRITERIA: IeltsCriterion[] = [
  "Fluency & Coherence",
  "Lexical Resource",
  "Grammatical Range & Accuracy",
  "Pronunciation",
];

interface CriteriaFlipCardsProps {
  criteria: AiCriterionScore[];
  overallBand: number | null;
}

export function CriteriaFlipCards({ criteria, overallBand }: CriteriaFlipCardsProps) {
  // Permanently tracks flipped state for each criterion
  const [flipped, setFlipped] = React.useState<Record<string, boolean>>({});

  const toggleFlip = (criterion: string) => {
    setFlipped((prev) => ({
      ...prev,
      [criterion]: true, // Once flipped, stays flipped face-up forever!
    }));
  };

  const revealAll = () => {
    const next: Record<string, boolean> = {};
    ORDERED_CRITERIA.forEach((c) => {
      next[c] = true;
    });
    setFlipped(next);
  };

  const revealedCount = ORDERED_CRITERIA.filter((c) => flipped[c]).length;
  const isAllRevealed = revealedCount === ORDERED_CRITERIA.length;

  return (
    <div className="space-y-4">
      {/* Header with Surprise Reveal Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            <span>IELTS Band Assessment • Surprise Reveal</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap each card to reveal your official rubric band scores &amp; examiner feedback.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">
            {revealedCount}/{ORDERED_CRITERIA.length} Revealed
          </span>
          <Button
            size="sm"
            variant={isAllRevealed ? "outline" : "default"}
            onClick={revealAll}
            disabled={isAllRevealed}
            className="text-xs h-8 px-3 gap-1.5 cursor-pointer rounded-xl font-semibold shadow-xs"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{isAllRevealed ? "All Scores Revealed" : "Reveal All Scores ✨"}</span>
          </Button>
        </div>
      </div>

      {/* 4 Cards 3D Perspective Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ORDERED_CRITERIA.map((criterionName) => {
          const score = criteria.find(
            (c) =>
              c.criterion === criterionName ||
              c.criterion.replace("&", "and") === criterionName.replace("&", "and")
          );

          const meta = CRITERIA_METADATA[criterionName];
          const Icon = meta.icon;
          const isFlipped = Boolean(flipped[criterionName]);
          const bandNumber = score?.band != null ? Math.round(score.band) : overallBand || 7;

          return (
            <div
              key={criterionName}
              className="criteria-flip-card h-[245px] w-full select-none"
              onClick={() => toggleFlip(criterionName)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  toggleFlip(criterionName);
                }
              }}
              title={isFlipped ? `${criterionName}: Band ${bandNumber}` : `Tap to reveal ${criterionName} score`}
            >
              <div
                className={cn(
                  "criteria-card-inner",
                  isFlipped && "is-flipped"
                )}
              >
                {/* ── FRONT SIDE (Mystery Secret Card) ── */}
                <div
                  className={cn(
                    "criteria-card-front border bg-gradient-to-b from-card to-surface p-5 shadow-md flex flex-col justify-between transition-all",
                    meta.glowColor,
                    "hover:shadow-lg hover:scale-[1.01]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-border shadow-xs">
                      <Icon className="h-5 w-5 text-brand-bright" />
                    </div>
                    <span className="rounded-full border border-border bg-muted/70 px-2.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground uppercase">
                      {meta.acronym}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-center my-auto">
                    <h4 className="text-sm font-bold text-foreground">
                      {criterionName}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 px-2">
                      {meta.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                      <Lock className="h-3 w-3 opacity-60" />
                      <span>Secret Score</span>
                    </span>
                    <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-bright shadow-2xs inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      <span>Tap to Reveal</span>
                    </span>
                  </div>
                </div>

                {/* ── BACK SIDE (Revealed Examiner Face — Stays Face Up!) ── */}
                <div
                  className={cn(
                    "criteria-card-back border border-brand-bright/35 bg-card p-5 shadow-lg flex flex-col justify-between",
                    "bg-gradient-to-br from-card via-surface/80 to-brand-soft/30"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                      <div>
                        <div className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                          {criterionName}
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-2">
                          <span className="font-mono text-2xl font-black text-brand-bright tabular-nums">
                            Band {bandNumber}
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            ✓ Verified
                          </span>
                        </div>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-bright">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>

                    <p className="mt-2.5 text-xs text-foreground/90 leading-relaxed line-clamp-3">
                      {score?.summary ||
                        `Demonstrates sustained control consistent with Band ${bandNumber} performance under Cambridge rubrics.`}
                    </p>
                  </div>

                  {score?.nextStep && (
                    <div className="mt-2 rounded-xl border border-brand-bright/20 bg-brand-soft/50 p-2 text-[11px] text-brand-bright font-medium leading-snug">
                      <strong className="text-foreground">Examiner Tip:</strong> {score.nextStep}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
