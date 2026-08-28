"use client";

/**
 * Practice Again — the retention queue, presented gently.
 * Three student-facing groups fed by real diagnosis and topic progress.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type ReviewItem } from "@/lib/store/progress";
import { problemById, areaOfProblem, topicTitle, topicPart } from "@/lib/data/content";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared/page-kit";
import { Button } from "@/components/ui/button";
import { Mic, Target, Repeat2, Sparkles, ChevronRight } from "lucide-react";
import { formatStamp } from "./shared";

// ---------------------------------------------------------------------------
// Item rows
// ---------------------------------------------------------------------------

function ProblemRow({ item, occurrences }: { item: ReviewItem; occurrences: number }) {
  const navigate = useApp((s) => s.navigate);
  const problem = problemById(item.refId);
  const area = areaOfProblem(item.refId);
  const title = problem?.title || "Practice problem";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-brand-bright/25 sm:px-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
        <Target className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {area ? area.name : "Practice problem"}
          {occurrences > 0 &&
            ` · noticed ${occurrences} ${occurrences === 1 ? "time" : "times"}`}
          {item.lastActivityAt ? ` · ${formatStamp(item.lastActivityAt)}` : ""}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 gap-1.5"
        onClick={() => navigate({ name: "problem", problemId: item.refId })}
      >
        Practice
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function TopicRow({ item }: { item: ReviewItem }) {
  const navigate = useApp((s) => s.navigate);
  const title = topicTitle(item.refId);
  const part = topicPart(item.refId);
  const kind = part === 1 ? "part1" : part === 2 ? "part2" : "part3";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-brand-bright/25 sm:px-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
        <Repeat2 className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {part ? `Part ${part}` : "Topic"}
          {item.lastActivityAt ? ` · practiced ${formatStamp(item.lastActivityAt)}` : ""}
        </div>
      </div>
      {part && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={() => navigate({ name: "session", kind, topicIds: [item.refId] })}
        >
          Practice again
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function sortItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export function PracticeAgainView() {
  const refreshReviewItems = useProgress((s) => s.refreshReviewItems);
  const reviewItems = useProgress((s) => s.reviewItems);
  const problems = useProgress((s) => s.problems);
  const navigate = useApp((s) => s.navigate);

  React.useEffect(() => {
    refreshReviewItems();
  }, [refreshReviewItems]);

  const groups = React.useMemo(
    () => ({
      workOnThis: sortItems(reviewItems.filter((i) => i.group === "work-on-this")),
      tryAgain: sortItems(reviewItems.filter((i) => i.group === "try-again")),
      keepFresh: sortItems(reviewItems.filter((i) => i.group === "keep-fresh")),
    }),
    [reviewItems]
  );

  const hasAny = reviewItems.length > 0;

  if (!hasAny) {
    return (
      <div className="fade-up space-y-6">
        <PageHeader
          eyebrow="Practice Again"
          title="The right thing to practice, at the right time."
          subtitle="These suggestions come from your own diagnoses and completed topics — nothing generic."
        />
        <EmptyState
          title="Nothing needs revisiting yet"
          body="Keep practicing — we'll bring something back when it's useful."
          action={
            <Button onClick={() => navigate({ name: "practice" })} className="gap-2">
              <Mic className="h-4 w-4" />
              Keep practicing
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Practice Again"
        title="The right thing to practice, at the right time."
        subtitle="These suggestions come from your own diagnoses and completed topics — nothing generic."
      />

      <SectionCard title="Work on this" hint="You've struggled with this recently">
        {groups.workOnThis.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nothing here right now.</p>
        ) : (
          <div className="space-y-2">
            {groups.workOnThis.map((item) => (
              <ProblemRow
                key={item.id}
                item={item}
                occurrences={problems[item.refId]?.occurrences ?? 0}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Try again" hint="This is ready for another real question">
        {groups.tryAgain.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nothing here right now.</p>
        ) : (
          <div className="space-y-2">
            {groups.tryAgain.map((item) => (
              <ProblemRow
                key={item.id}
                item={item}
                occurrences={problems[item.refId]?.occurrences ?? 0}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Keep fresh" hint="You improved here — we'll check again later">
        {groups.keepFresh.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Nothing here right now.</p>
        ) : (
          <div className="space-y-2">
            {groups.keepFresh.map((item) =>
              item.kind === "problem" ? (
                <ProblemRow
                  key={item.id}
                  item={item}
                  occurrences={problems[item.refId]?.occurrences ?? 0}
                />
              ) : (
                <TopicRow key={item.id} item={item} />
              )
            )}
          </div>
        )}
      </SectionCard>

      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        <span>This list updates itself as you practice — no streaks to lose, no pressure.</span>
      </div>
    </div>
  );
}
