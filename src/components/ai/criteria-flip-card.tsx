"use client";

/**
 * The four IELTS criteria as reveal cards.
 *
 * A card only ever shows what Stella actually returned. If a criterion has no
 * band or no summary, the card says so — it never borrows the overall band,
 * never falls back to Band 7, and never claims a score is "verified".
 */
import * as React from "react";
import type { AiCriterionScore, AiReliability, IeltsCriterion } from "@/lib/ai/types";
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

const RELIABILITY_LABEL: Record<AiReliability, string> = {
  high: "Strong evidence",
  medium: "Reasonable evidence",
  low: "Weak evidence",
  insufficient: "Not enough to judge",
};

interface CriteriaFlipCardsProps {
  criteria: AiCriterionScore[];
  overallBand: number | null;
}

export function CriteriaFlipCards({ criteria, overallBand }: CriteriaFlipCardsProps) {
  const [flipped, setFlipped] = React.useState<Record<string, boolean>>({});

  const toggleFlip = (criterion: string) => {
    setFlipped((prev) => ({ ...prev, [criterion]: true }));
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
            <Sparkles className="h-3 w-3" />
            <span>
              IELTS band assessment
              {overallBand !== null && ` • overall Band ${overallBand}`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap each card to reveal the band and the examiner note for that criterion.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">
            {revealedCount}/{ORDERED_CRITERIA.length} revealed
          </span>
          <Button
            size="sm"
            variant={isAllRevealed ? "outline" : "default"}
            onClick={revealAll}
            disabled={isAllRevealed}
            className="h-8 cursor-pointer gap-1.5 rounded-xl px-3 text-xs font-semibold shadow-xs"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{isAllRevealed ? "All scores revealed" : "Reveal all scores"}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ORDERED_CRITERIA.map((criterionName) => {
          const score = criteria.find(
            (c) =>
              c.criterion === criterionName ||
              c.criterion.replace("&", "and") === criterionName.replace("&", "and")
          );

          const meta = CRITERIA_METADATA[criterionName];
          const Icon = meta.icon;
          const isFlipped = Boolean(flipped[criterionName]);
          // Only this criterion's own band is ever shown. No borrowing, no default.
          const bandNumber = score && score.band != null ? Math.round(score.band) : null;
          const bandLabel = bandNumber === null ? "Not scored" : `Band ${bandNumber}`;

          return (
            <div
              key={criterionName}
              className="criteria-flip-card h-[245px] w-full select-none"
              onClick={() => toggleFlip(criterionName)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") toggleFlip(criterionName);
              }}
              title={
                isFlipped
                  ? `${criterionName}: ${bandLabel}`
                  : `Tap to reveal ${criterionName}`
              }
            >
              <div className={cn("criteria-card-inner", isFlipped && "is-flipped")}>
                {/* ── FRONT ── */}
                <div
                  className={cn(
                    "criteria-card-front flex flex-col justify-between border bg-gradient-to-b from-card to-surface p-5 shadow-md transition-all",
                    meta.glowColor,
                    "hover:scale-[1.01] hover:shadow-lg"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface shadow-xs">
                      <Icon className="h-5 w-5 text-brand-bright" />
                    </div>
                    <span className="rounded-full border border-border bg-muted/70 px-2.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground uppercase">
                      {meta.acronym}
                    </span>
                  </div>

                  <div className="my-auto space-y-1.5 text-center">
                    <h4 className="text-sm font-bold text-foreground">{criterionName}</h4>
                    <p className="line-clamp-2 px-2 text-[11px] text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                      <Lock className="h-3 w-3 opacity-60" />
                      <span>Hidden score</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-bright shadow-2xs">
                      <Sparkles className="h-3 w-3" />
                      <span>Tap to reveal</span>
                    </span>
                  </div>
                </div>

                {/* ── BACK ── */}
                <div
                  className={cn(
                    "criteria-card-back flex flex-col justify-between border border-brand-bright/35 bg-card p-5 shadow-lg",
                    "bg-gradient-to-br from-card via-surface/80 to-brand-soft/30"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                      <div>
                        <div className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                          {criterionName}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                          <span
                            className={cn(
                              "font-mono text-2xl font-black tabular-nums",
                              bandNumber === null
                                ? "text-base font-semibold text-muted-foreground"
                                : "text-brand-bright"
                            )}
                          >
                            {bandLabel}
                          </span>
                          {score?.reliability && (
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                                score.reliability === "high" &&
                                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                score.reliability === "medium" &&
                                  "border-border bg-muted/60 text-muted-foreground",
                                (score.reliability === "low" ||
                                  score.reliability === "insufficient") &&
                                  "border-warning/40 bg-warning/10 text-warning"
                              )}
                            >
                              {RELIABILITY_LABEL[score.reliability]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-bright">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>

                    <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-foreground/90">
                      {score?.summary || "Stella did not return a note for this criterion."}
                    </p>
                  </div>

                  {score?.nextStep && (
                    <div className="mt-2 rounded-xl border border-brand-bright/20 bg-brand-soft/50 p-2 text-[11px] leading-snug font-medium text-brand-bright">
                      <strong className="text-foreground">Next step:</strong> {score.nextStep}
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
