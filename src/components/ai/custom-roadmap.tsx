"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProgress } from "@/lib/store/progress";
import { useApp } from "@/lib/store/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Target,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  SlidersHorizontal,
  Flame,
  Mic,
  Award,
} from "lucide-react";

interface BandBenchmark {
  fluency: string;
  lexical: string;
  grammar: string;
  pronunciation: string;
}

const BAND_BENCHMARKS: Record<number, BandBenchmark> = {
  5.5: {
    fluency: "Keep speaking continuously on familiar topics with simple connectives.",
    lexical: "Use sufficient vocabulary to talk about everyday matters; paraphrase when stuck.",
    grammar: "Control basic sentence forms with reasonable grammatical accuracy.",
    pronunciation: "Maintain intelligible pronunciation with clear basic word stress.",
  },
  6.0: {
    fluency: "Willing to speak at length, though self-correction and occasional pauses occur.",
    lexical: "Use a wide enough vocabulary to discuss topics at length with general clarity.",
    grammar: "Mix simple and complex sentence structures with frequent errors that don't block meaning.",
    pronunciation: "Use a range of phonological features with generally clear pronunciation.",
  },
  6.5: {
    fluency: "Speak at length with developing coherence and fewer language-search hesitations.",
    lexical: "Demonstrate some less common vocabulary and idiomatic phrases with minor slip-ups.",
    grammar: "Produce a variety of complex structures with increasing error-free sentences.",
    pronunciation: "Show good rhythm, intonation chunking, and clear sentence stress.",
  },
  7.0: {
    fluency: "Speak at length effortlessly without noticeable loss of coherence. Flexible connectives.",
    lexical: "Use vocabulary flexibly with awareness of style, collocation, and idioms.",
    grammar: "Frequently produce error-free complex sentences with good grammatical control.",
    pronunciation: "Show all positive pronunciation features with easy-to-understand delivery.",
  },
  7.5: {
    fluency: "Natural flow with minimal hesitation; pauses are idea-driven rather than language searches.",
    lexical: "Rich, precise vocabulary with rare inaccuracies in collocation or word choice.",
    grammar: "High degree of grammatical flexibility; majority of sentences are completely error-free.",
    pronunciation: "Natural rhythm, nuanced intonation, and effortless intelligibility throughout.",
  },
  8.0: {
    fluency: "Fluent with only rare repetition or hesitation. Coherence is full and effortless.",
    lexical: "Wide, sophisticated vocabulary used with complete flexibility and precision.",
    grammar: "Consistently accurate complex structures with wide variety and natural control.",
    pronunciation: "Nuanced pronunciation with sustained rhythm and effective tone across all parts.",
  },
  8.5: {
    fluency: "Total fluency; effortless discourse with seamless transitions between ideas.",
    lexical: "Native-level idiomatic agility; exceptional precision and stylistic nuance.",
    grammar: "Virtually flawless grammatical range with mastery of rare and complex forms.",
    pronunciation: "Effortless, natural pronunciation with complete phonological mastery.",
  },
  9.0: {
    fluency: "Full, effortless fluency; completely coherent with precise, natural discourse.",
    lexical: "Masterful lexical resource; native-like command of subtle nuances and idioms.",
    grammar: "Effortless mastery of full grammatical range; faultless sentence construction.",
    pronunciation: "Precise, effortless articulation and intonation across every topic.",
  },
};

const TIMELINE_METRICS: Record<
  string,
  { label: string; dailyMinByBand: (band: number) => number; mocksPerWeek: number }
> = {
  "1m": {
    label: "Under 1 Month (Sprint)",
    dailyMinByBand: (b) => (b >= 8 ? 45 : b >= 7 ? 35 : 25),
    mocksPerWeek: 3,
  },
  "3m": {
    label: "1 – 3 Months (Core Prep)",
    dailyMinByBand: (b) => (b >= 8 ? 35 : b >= 7 ? 25 : 20),
    mocksPerWeek: 2,
  },
  "6m": {
    label: "3 – 6 Months (Foundational)",
    dailyMinByBand: (b) => (b >= 8 ? 25 : b >= 7 ? 15 : 15),
    mocksPerWeek: 1,
  },
  flexible: {
    label: "Just Practicing (Flexible)",
    dailyMinByBand: (b) => (b >= 8 ? 20 : b >= 7 ? 15 : 10),
    mocksPerWeek: 1,
  },
};

export function CustomRoadmapCard({ className }: { className?: string }) {
  const { profile, openAuthModal } = useAuth();
  const dailyPractice = useProgress((s) => s.dailyPractice);
  const streak = useProgress((s) => s.streak);
  const navigate = useApp((s) => s.navigate);

  const targetBand = profile?.targetBand;
  const testTimeline = profile?.testDate || "3m";

  // Today's practice minutes
  const todayKey = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todaySpeakingSeconds = dailyPractice[todayKey] || 0;
  const todaySpeakingMinutes = Math.round(todaySpeakingSeconds / 60);

  // If the user has NOT set a target score, render a clean callout to set it
  if (!targetBand) {
    return (
      <div
        className={cn(
          "rounded-3xl border border-brand-bright/35 bg-gradient-to-br from-brand-soft/70 via-card to-card p-6 shadow-sm sm:p-7",
          className
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-bright shadow-inner">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                  Set Your IELTS Target & Unlock Your Custom AI Roadmap
                </h3>
                <span className="hidden rounded-full border border-brand-bright/40 bg-brand-soft px-2.5 py-0.5 text-[10px] font-semibold text-brand-bright sm:inline-flex">
                  <Sparkles className="mr-1 h-3 w-3" /> No Assumed Goal
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Rotate the band score dial and choose your exam timeline. Stella will build a daily
                speaking quota and personalized criterion roadmap calibrated to your exact target.
              </p>
            </div>
          </div>

          <Button
            onClick={() => openAuthModal("target-band")}
            className="shrink-0 gap-2 rounded-xl px-5 py-5 text-xs font-semibold shadow-md cursor-pointer"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Set Target Score & Time</span>
          </Button>
        </div>
      </div>
    );
  }

  // Target Band is defined: Compute personalized metrics
  const nearestBand = Math.min(
    9,
    Math.max(5.5, Math.round(targetBand * 2) / 2)
  );
  const benchmark =
    BAND_BENCHMARKS[nearestBand] ||
    BAND_BENCHMARKS[7.0];

  const timelineInfo =
    TIMELINE_METRICS[testTimeline] || TIMELINE_METRICS["3m"];

  const dailyTargetMin = timelineInfo.dailyMinByBand(targetBand);
  const progressRatio = Math.min(1, todaySpeakingMinutes / dailyTargetMin);
  const progressPct = Math.round(progressRatio * 100);

  return (
    <div
      className={cn(
        "rounded-3xl border border-brand-bright/35 bg-gradient-to-br from-brand-soft/70 via-card to-card p-6 shadow-sm sm:p-7",
        className
      )}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-bright shadow-inner">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-brand-bright uppercase">
                Custom AI Practice Roadmap
              </span>
              <span className="rounded-full border border-brand-bright/40 bg-brand-soft/80 px-2 py-0.5 text-[10px] font-semibold text-brand-bright">
                Calibrated for Band {targetBand.toFixed(1)}
              </span>
            </div>
            <h3 className="mt-0.5 text-base font-bold tracking-tight text-foreground sm:text-lg">
              Target: Band {targetBand.toFixed(1)} • {timelineInfo.label}
            </h3>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => openAuthModal("target-band")}
          className="h-8.5 gap-1.5 rounded-xl border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:border-brand-bright/50 hover:text-foreground cursor-pointer"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Adjust Goal / Time</span>
        </Button>
      </div>

      {/* Target Breakdown Grid */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Daily Speaking Quota */}
        <div className="rounded-2xl border border-border bg-surface/70 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="h-3.5 w-3.5 text-brand-bright" />
              Daily Speaking Goal
            </span>
            <span className="font-bold text-foreground">{dailyTargetMin}m / day</span>
          </div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {todaySpeakingMinutes}m
            </span>
            <span className="text-xs text-muted-foreground">completed today</span>
          </div>

          {/* Progress bar */}
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressRatio >= 1 ? "bg-emerald-500" : "bg-brand-bright"
              )}
              style={{ width: `${Math.max(progressRatio > 0 ? 5 : 0, progressPct)}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {progressRatio >= 1
                ? "🎉 Daily goal hit!"
                : `${Math.max(0, dailyTargetMin - todaySpeakingMinutes)}m left today`}
            </span>
            <span className="font-medium">{progressPct}%</span>
          </div>
        </div>

        {/* Weekly Mock Cadence */}
        <div className="rounded-2xl border border-border bg-surface/70 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <Calendar className="h-3.5 w-3.5 text-brand-bright" />
              Weekly Full Mocks
            </span>
            <span className="font-bold text-foreground">
              {timelineInfo.mocksPerWeek} {timelineInfo.mocksPerWeek === 1 ? "mock" : "mocks"} / wk
            </span>
          </div>

          <div className="mt-3 text-sm font-semibold text-foreground">
            Complete exam simulation
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Full 11–14 minute end-to-end sessions with Stella testing stamina across all 3 parts.
          </p>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate({ name: "mock-config" })}
            className="mt-2.5 h-7 w-full justify-between rounded-lg px-2 text-xs font-semibold text-brand-bright hover:bg-brand-soft cursor-pointer"
          >
            <span>Start a Full Mock</span>
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>

        {/* Practice Streak & Momentum */}
        <div className="rounded-2xl border border-border bg-surface/70 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              Practice Rhythm
            </span>
            <span className="font-bold text-foreground">
              {streak.current} {streak.current === 1 ? "Day" : "Days"} streak
            </span>
          </div>

          <div className="mt-3 text-sm font-semibold text-foreground">
            {streak.current >= 3 ? "Consistent habit locked in" : "Daily consistency is key"}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Speaking 20+ minutes every single day improves cognitive lexical access 3× faster than
            weekly cramming.
          </p>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate({ name: "practice" })}
            className="mt-2.5 h-7 w-full justify-between rounded-lg px-2 text-xs font-semibold text-brand-bright hover:bg-brand-soft cursor-pointer"
          >
            <span>Start Practice Session</span>
            <Mic className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Target Band Criteria Benchmarks */}
      <div className="mt-5 rounded-2xl border border-border/80 bg-surface/50 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-bright" />
            <span className="text-xs font-bold text-foreground sm:text-sm">
              Examiner Benchmarks for Band {targetBand.toFixed(1)}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Official IELTS Speaking Descriptors
          </span>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-brand-bright uppercase tracking-wider">
              Fluency & Coherence
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {benchmark.fluency}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-brand-bright uppercase tracking-wider">
              Lexical Resource
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {benchmark.lexical}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-brand-bright uppercase tracking-wider">
              Grammar & Accuracy
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {benchmark.grammar}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] font-bold text-brand-bright uppercase tracking-wider">
              Pronunciation
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {benchmark.pronunciation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
