"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "@/lib/store/app";
import { useProgress, selectStats, selectTrainingAreas, type SessionMeta } from "@/lib/store/progress";
import { useAuth } from "@/lib/auth/auth-context";
import { FOCUS_OPTIONS, topicTitle, PART1_TOPICS, PART2_CARDS, PART3_TOPICS } from "@/lib/data/content";
import { PageHeader, SectionCard, EmptyState, StatusPill } from "@/components/shared/page-kit";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Mic, Clock, ClipboardCheck, Flame, TrendingUp, ChevronRight, Sparkles, Check, ArrowRight, Cloud,
} from "lucide-react";
import { CustomRoadmapCard } from "@/components/ai/custom-roadmap";

const QUICK_CATEGORY_LABEL: Record<string, string> = {
  WORD: "Words",
  GRAMMAR: "Grammar",
  IDEA: "Ideas",
  PACE: "Fluency & Pace",
  NERVES: "Confidence",
  OTHER: "Other",
};

function FocusPicker() {
  const focus = useProgress((s) => s.focus);
  const completeOnboarding = useProgress((s) => s.completeOnboarding);
  const setFocus = useProgress((s) => s.setFocus);
  const onboardingDone = useProgress((s) => s.onboardingDone);
  const [selected, setSelected] = React.useState<string | null>(focus);

  if (onboardingDone && focus === null) {
    // user chose "I'm not sure"
    return (
      <SectionCard title="Current focus">
        <p className="text-sm leading-relaxed text-muted-foreground">
          That&apos;s okay. Try a few speaking questions first and we&apos;ll help you identify
          what to work on.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={onboardingDone ? "Current focus" : undefined}
      hint={onboardingDone ? "Change anytime" : undefined}
    >
      {!onboardingDone && (
        <div className="mb-4 flex items-start gap-3">
          <StarMark size={30} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-base font-semibold tracking-tight">
              Welcome to IELTStar Speaking Lab
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              What would you most like to improve? This helps us point you to the right
              practice — you can change it anytime.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FOCUS_OPTIONS.map((opt) => {
          const active = selected === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setSelected(opt.key);
                if (onboardingDone) setFocus(opt.key);
              }}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                active
                  ? "border-brand-bright/60 bg-brand-soft text-foreground"
                  : "border-border text-muted-foreground hover:border-brand-bright/35 hover:text-foreground"
              )}
            >
              {opt.label}
              {active && <Check className="h-4 w-4 text-brand-bright" />}
            </button>
          );
        })}
      </div>
      {!onboardingDone && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => completeOnboarding(selected)}
            disabled={selected === null}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Continue
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function formatChartValue(seconds: number): string {
  if (seconds <= 0) return "No practice";
  if (seconds < 60) return `${Math.round(seconds)}s of speaking`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s of speaking` : `${m} min of speaking`;
}

function PracticeChart() {
  const dailyPractice = useProgress((s) => s.dailyPractice);
  const days = React.useMemo(() => {
    const out: { key: string; label: string; fullLabel: string; seconds: number }[] = [];
    const fmtDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const fmtLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" });
    const fmtFull = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = fmtDay(d);
      out.push({
        key,
        label: i === 0 ? "Today" : fmtLabel(d),
        fullLabel: i === 0 ? "Today" : fmtFull(d),
        seconds: dailyPractice[key] || 0,
      });
    }
    return out;
  }, [dailyPractice]);

  const hasActivity = days.some((d) => d.seconds > 0);
  const maxSeconds = Math.max(...days.map((d) => d.seconds), 60);

  if (!hasActivity) {
    return (
      <EmptyState
        title="No speaking activity yet"
        body="Your first session will appear here."
        action={
          <Button onClick={() => useApp.getState().navigate({ name: "practice" })} className="gap-2">
            <Mic className="h-4 w-4" />
            Start Part 1
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div
        className="relative flex h-40 gap-1.5 sm:gap-2"
        role="img"
        aria-label={`Speaking practice per day over the last two weeks: ${days
          .map((d) => `${d.fullLabel} ${Math.round(d.seconds)} seconds`)
          .join(", ")}`}
      >
        {/* baseline */}
        <span
          className="pointer-events-none absolute right-0 bottom-[22px] left-0 h-px bg-border"
          aria-hidden
        />
        {days.map((d) => {
          const isToday = d.label === "Today";
          const pct = d.seconds > 0 ? Math.max(8, (d.seconds / maxSeconds) * 100) : 0;
          return (
            <div key={d.key} className="chart-col group relative flex min-w-0 flex-1 flex-col">
              {/* hover value */}
              <span
                className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-elevated px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-foreground opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100"
                role="tooltip"
              >
                {formatChartValue(d.seconds)}
              </span>
              {/* bar track — columns stretch so bars anchor to the baseline */}
              <div className="flex w-full flex-1 items-end overflow-hidden rounded-t-md bg-muted-foreground/[0.06]">
                <div
                  className={cn(
                    "chart-bar w-full rounded-t-md transition-[height] duration-700 ease-out",
                    d.seconds > 0
                      ? isToday
                        ? "bg-brand-bright"
                        : "bg-brand-bright/65"
                      : ""
                  )}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span
                className={cn(
                  "mt-1.5 h-4 truncate text-center text-[9px] font-medium tracking-wide sm:text-[10px]",
                  isToday ? "font-bold text-brand-bright" : "text-muted-foreground"
                )}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Speaking time per day — from your real recorded answers. Hover a bar for the exact amount.
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card-lift group rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <span className="chip-anim flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums transition-transform duration-300 group-hover:scale-[1.04] origin-left sm:text-3xl">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function sessionDescription(s: SessionMeta): string {
  if (s.type === "full-mock") return "Full Speaking Mock";
  return s.topicIds.slice(0, 3).map(topicTitle).join(" · ") + (s.topicIds.length > 3 ? " · …" : "");
}

function RecentPractice() {
  const sessions = useProgress((s) => s.sessions);
  const navigate = useApp((s) => s.navigate);
  const completed = sessions.filter((s) => s.status !== "in-progress");

  if (!completed.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Your recent practice will appear here after your first session.
      </p>
    );
  }

  const dayLabel = (ts: number) => {
    const now = new Date();
    const d = new Date(ts);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (day === today) return "Today";
    if (day === yesterday) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const grouped = completed.slice(0, 8).reduce<
    { s: SessionMeta; day: string; showDay: boolean }[]
  >((acc, s) => {
    const day = dayLabel(s.startedAt);
    const prev = acc.length ? acc[acc.length - 1].day : "";
    acc.push({ s, day, showDay: day !== prev });
    return acc;
  }, []);
  return (
    <div className="divide-y divide-border">
      {grouped.map(({ s, day, showDay }) => {
        return (
          <React.Fragment key={s.id}>
            {showDay && (
              <div className="px-1 pt-4 pb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase first:pt-0">
                {day}
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate({ name: "recordings" })}
              className="row-hover group -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl py-3 text-left"
            >
              <span className="chip-anim flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
                {s.type === "full-mock" ? <ClipboardCheck className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {s.type === "part1" ? "Part 1" : s.type === "part2" ? "Part 2" : s.type === "part3" ? "Part 3" : "Full Mock"} — {sessionDescription(s)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.answered} {s.answered === 1 ? "answer" : "answers"} · {formatMinutes(s.practiceSeconds)}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function DashboardView() {
  // useShallow keeps the selector result referentially stable — required by
  // zustand v5 + React 19 useSyncExternalStore (object-returning selectors
  // otherwise trigger an infinite getSnapshot loop and crash the app).
  const stats = useProgress(useShallow(selectStats));
  const trainingAreas = useProgress(useShallow(selectTrainingAreas));
  const streak = useProgress((s) => s.streak);
  const onboardingDone = useProgress((s) => s.onboardingDone);
  const navigate = useApp((s) => s.navigate);

  const areaEntries = Object.entries(trainingAreas)
    .filter(([k]) => k !== "OTHER")
    .sort((a, b) => b[1] - a[1]);

  const coverage = React.useMemo(() => {
    const total = PART1_TOPICS.length + PART2_CARDS.length + PART3_TOPICS.length;
    return total;
  }, []);

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Your speaking progress"
        title="See how much you've practiced and what you've worked on."
        actions={
          <Button onClick={() => navigate({ name: "practice" })} size="lg" className="btn-glow gap-2 shadow-sm">
            <Mic className="h-4 w-4" />
            Start Practice
          </Button>
        }
      />

      <CustomRoadmapCard />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={Mic}
          label="Questions practiced"
          value={String(stats.questionsPracticed)}
          sub="real recorded answers"
        />
        <StatCard
          icon={Clock}
          label="Practice time"
          value={formatMinutes(stats.practiceSeconds)}
          sub="time spent speaking"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Full mocks"
          value={String(stats.fullMocks)}
          sub="completed end-to-end"
        />
        <StatCard
          icon={Flame}
          label="Practice streak"
          value={String(streak.current)}
          sub={streak.current > 0 ? "consecutive days" : "start today"}
        />
      </div>

      <SectionCard title="Practice" hint="last 14 days">
        <PracticeChart />
      </SectionCard>

      {!onboardingDone ? (
        <FocusPicker />
      ) : (
        <>
          <SectionCard title="Training areas" hint="activity, not ability">
            {areaEntries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                After you review a few answers and tell us what felt difficult, your training
                activity will show up here.
              </p>
            ) : (
              <div className="space-y-3">
                {areaEntries.map(([key, count]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm font-medium sm:w-36">
                      {QUICK_CATEGORY_LABEL[key] || key}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand-bright/80 transition-all duration-500"
                        style={{ width: `${Math.min(100, (count / Math.max(...areaEntries.map((e) => e[1]))) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {count} {count === 1 ? "session" : "sessions"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <FocusPicker />
        </>
      )}

      <SectionCard
        title="Recent practice"
        hint={`${coverage} topics available`}
        contentClassName=""
      >
        <RecentPractice />
      </SectionCard>

      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>All numbers come from your real activity — nothing is estimated as a band score.</span>
      </div>
    </div>
  );
}
