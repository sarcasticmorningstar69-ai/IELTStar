"use client";

/**
 * Problem & Solutions detail — one of the 36 supplied detailed problems,
 * shown inside its core area with techniques, a real practice drill,
 * and direct option to study in Full Window with Stella.
 */

import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress } from "@/lib/store/progress";
import {
  areaOfProblem,
  problemById,
  questionSupport,
  techniquesForArea,
} from "@/lib/data/content";
import { EmptyState, SectionCard } from "@/components/shared/page-kit";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { openStella } from "@/components/ai/ai-assistant";
import {
  DifficultyPill,
  ProblemStatusPill,
  WHY_FRAMING,
  initialDrill,
  problemDisplayStatus,
  relevantIncludes,
  shuffleDrill,
  type Drill,
} from "./learn-shared";
import { BadgeCheck, ChevronRight, Lightbulb, Maximize2, Mic, Shuffle, Wrench } from "lucide-react";

export function ProblemDetailView({ problemId }: { problemId: string }) {
  const navigate = useApp((s) => s.navigate);
  const problems = useProgress((s) => s.problems);
  const markProblemPracticed = useProgress((s) => s.markProblemPracticed);

  const problem = problemById(problemId);
  const area = areaOfProblem(problemId);
  const areaId = area?.id ?? "";

  const [drill, setDrill] = React.useState<Drill>(() => initialDrill(areaId, problemId));
  const [practicedCount, setPracticedCount] = React.useState(0);

  if (!problem || !area) {
    return (
      <div className="fade-up">
        <EmptyState
          title="Problem not found"
          body="This detailed problem doesn't exist in the problem map. Head back to the core areas to find what you're looking for."
          action={
            <Button onClick={() => navigate({ name: "learn", tab: "problems" })} className="gap-2">
              Back to problems
            </Button>
          }
        />
      </div>
    );
  }

  const state = problems[problemId];
  const status = problemDisplayStatus(state);
  const includes = relevantIncludes(problem, area);
  const framing = WHY_FRAMING[area.id] ?? WHY_FRAMING.area1;
  const techGroups = techniquesForArea(area.id);
  const support = drill.kind === "q" ? questionSupport(drill.question.prompt) : null;

  const sessionKind = drill.kind === "card" ? "part2" : drill.part === 1 ? "part1" : "part3";
  const sessionTopicIds = [drill.kind === "card" ? drill.card.id : drill.topicId];

  const handleMarkPracticed = () => {
    markProblemPracticed(problemId);
    setPracticedCount((n) => n + 1);
  };

  return (
    <div className="fade-up space-y-6">
      <header className="mb-1">
        <div className="mb-1.5 text-[11px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
          Problem &amp; Solutions • {area.name}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">
            {problem.title}
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openStella({ mode: "full-window" })}
            className="gap-2 border-brand-bright/40 text-brand-bright hover:bg-brand-soft shrink-0"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Study with Stella (Full Window)
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <DifficultyPill difficulty={problem.difficulty} />
          <ProblemStatusPill status={status} />
          <span className="text-xs text-muted-foreground">
            Detailed problem {problem.num} of 36
            {state && state.occurrences > 0
              ? ` • noticed ${state.occurrences} ${state.occurrences === 1 ? "time" : "times"} in your practice`
              : ""}
          </span>
        </div>
      </header>

      <SectionCard title="What you may notice">
        <div className="rounded-xl border border-brand-bright/25 bg-brand-soft p-4 sm:p-5">
          <p className="text-[15px] leading-relaxed">{problem.note}</p>
        </div>
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Signs this area covers
          </h3>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {includes.map((inc) => (
              <li
                key={inc}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground"
              >
                {inc}
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="Why it happens">
        <p className="max-w-2xl text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
          {framing}
        </p>
      </SectionCard>

      <SectionCard
        title="How to work on it"
        hint={`${techGroups.length} technique ${techGroups.length === 1 ? "group" : "groups"}`}
      >
        <div className="space-y-2.5">
          {techGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => navigate({ name: "technique", groupId: g.id })}
              className="group flex w-full items-center gap-3.5 rounded-xl border border-border bg-surface p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-bright/40 hover:shadow-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
                <Wrench className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight">{g.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {g.oneLine}
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Practice activity"
        hint={drill.kind === "card" ? "Part 2 cue card" : `Part ${drill.part} question`}
      >
        <div className="relative overflow-hidden rounded-2xl border border-brand-bright/30 bg-gradient-to-br from-brand-soft via-card to-card p-5 sm:p-6">
          <div key={drill.kind === "card" ? drill.card.id : drill.question.id} className="fade-up">
            {drill.kind === "q" ? (
              <>
                <div className="text-[11px] font-semibold tracking-[0.14em] text-brand-bright uppercase">
                  Part {drill.part} • {drill.topicTitle}
                </div>
                <p className="mt-2.5 max-w-2xl text-lg leading-snug font-semibold tracking-tight text-balance">
                  {drill.question.prompt}
                </p>
                {support && (
                  <p className="mt-3 flex max-w-xl items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright/80" aria-hidden />
                    {support}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold tracking-[0.14em] text-brand-bright uppercase">
                  Part 2 • {drill.card.domain}
                </div>
                <p className="mt-2.5 max-w-2xl text-lg leading-snug font-semibold tracking-tight text-balance">
                  {drill.card.prompt}
                </p>
                <ul className="mt-3.5 max-w-xl space-y-1.5">
                  {drill.card.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-foreground/90">
                      <span
                        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright/70"
                        aria-hidden
                      />
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-3.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {drill.card.finalPoint}
                </p>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button
              onClick={() =>
                navigate({ name: "session", kind: sessionKind, topicIds: sessionTopicIds })
              }
              className="gap-2"
            >
              <Mic className="h-4 w-4" aria-hidden />
              Practice this once
            </Button>
            <Button
              variant="outline"
              onClick={() => setDrill(shuffleDrill(area.id, drill))}
              className="gap-2"
            >
              <Shuffle className="h-4 w-4" aria-hidden />
              New {drill.kind === "card" ? "card" : "question"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          One deliberate repetition is enough — the goal is noticing this problem
          while it happens, not fixing it in a day.
        </p>
      </SectionCard>

      <SectionCard title="Track your work">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-medium">Practiced this problem just now?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Mark it as practiced — it stays in your review rotation and quietly
              resurfaces in a few days.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3.5">
            {practicedCount > 0 && (
              <span role="status" className="flex items-center gap-2 text-sm font-medium text-success">
                <span key={practicedCount} className="star-burst inline-flex">
                  <StarMark size={18} />
                </span>
                Noted — kept for review
              </span>
            )}
            <Button
              onClick={handleMarkPracticed}
              variant={practicedCount > 0 ? "outline" : "default"}
              className="gap-2"
            >
              <BadgeCheck className="h-4 w-4" aria-hidden />
              {practicedCount > 0 ? "Mark practiced again" : "Mark as practiced"}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
