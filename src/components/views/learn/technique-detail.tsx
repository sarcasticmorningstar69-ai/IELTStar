"use client";

/**
 * Technique detail — one consolidated technique group rendered in full:
 * every underlying technique kept complete, at a comfortable reading width.
 */

import { useApp } from "@/lib/store/app";
import { TECHNIQUE_GROUPS, techniqueById, type Technique } from "@/lib/data/content";
import { EmptyState, PageHeader } from "@/components/shared/page-kit";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { TechniqueSections } from "./learn-shared";
import { ChevronRight, Mic } from "lucide-react";

export function TechniqueDetailView({ groupId }: { groupId: string }) {
  const navigate = useApp((s) => s.navigate);
  const group = TECHNIQUE_GROUPS.find((g) => g.id === groupId);

  if (!group) {
    return (
      <div className="fade-up">
        <EmptyState
          title="Technique not found"
          body="This technique group doesn't exist in the technique set. Head back to see all fifteen groups."
          action={
            <Button onClick={() => navigate({ name: "learn", tab: "techniques" })} className="gap-2">
              Back to techniques
            </Button>
          }
        />
      </div>
    );
  }

  const techniques = group.techniqueIds
    .map((id) => techniqueById(id))
    .filter((t): t is Technique => Boolean(t));

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <PageHeader
        eyebrow={`Technique · ${group.category}`}
        title={group.title}
        subtitle={group.oneLine}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          {techniques.length} {techniques.length === 1 ? "technique" : "techniques"} in this group
        </span>
        <span className="text-xs text-muted-foreground">
          Every technique is kept complete — read it through, then take one into practice.
        </span>
      </div>

      <ol className="space-y-5">
        {techniques.map((t, i) => (
          <li key={t.id}>
            <article className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] sm:p-7">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold tabular-nums text-brand-bright">
                  {i + 1}
                </span>
                <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Technique {i + 1} of {techniques.length}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-semibold tracking-tight text-balance">{t.title}</h2>
              <div className="mt-5">
                <TechniqueSections sections={t.sections} />
              </div>
            </article>
          </li>
        ))}
      </ol>

      <div className="relative mt-8 overflow-hidden rounded-3xl border border-brand-bright/35 bg-gradient-to-br from-brand-soft via-card to-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-6 -bottom-10 opacity-[0.07]">
          <StarMark size={200} />
        </div>
        <div className="relative">
          <h2 className="text-lg font-semibold tracking-tight">Put it into practice</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Techniques only become automatic inside real spoken answers. Take this
            one into a short Part 1 set, a cue card, or a discussion — then listen
            back once.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button onClick={() => navigate({ name: "practice" })} className="gap-2">
              <Mic className="h-4 w-4" aria-hidden />
              Practice now
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ name: "learn", tab: "techniques" })}
              className="gap-2"
            >
              All techniques
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
