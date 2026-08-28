"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app";
import { PageHeader, SectionCard } from "@/components/shared/page-kit";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONTENT_STATS } from "@/lib/data/content";
import { Mic, MessageCircle, Presentation, MessagesSquare, ClipboardCheck, ChevronRight } from "lucide-react";

const PARTS = [
  {
    kind: "part1" as const,
    icon: MessageCircle,
    label: "Part 1",
    tagline: "Everyday Conversation",
    body: "Short personal questions about familiar topics. Answer naturally, give a reason, add one real detail.",
    meta: `${CONTENT_STATS.part1Topics} topics · ${CONTENT_STATS.part1Questions} questions`,
    view: { name: "part1" } as const,
  },
  {
    kind: "part2" as const,
    icon: Presentation,
    label: "Part 2",
    tagline: "Long Turn",
    body: "One cue card, one minute to prepare keywords, two minutes to speak. Your notes stay visible.",
    meta: `${CONTENT_STATS.part2Cards} cue cards`,
    view: { name: "part2" } as const,
  },
  {
    kind: "part3" as const,
    icon: MessagesSquare,
    label: "Part 3",
    tagline: "Discussion",
    body: "Abstract discussion questions with thinking support that adapts to each question.",
    meta: `${CONTENT_STATS.part3Topics} topics · ${CONTENT_STATS.part3Questions} questions`,
    view: { name: "part3" } as const,
  },
];

export function PracticeHubView() {
  const navigate = useApp((s) => s.navigate);
  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Practice"
        title="Choose how you want to speak today."
        subtitle="Every part keeps your recordings on this device, ready to replay."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {PARTS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.kind}
              type="button"
              onClick={() => navigate(p.view)}
              className="card-lift group relative overflow-hidden rounded-2xl border border-border bg-card p-5 text-left sm:p-6"
            >
              <span className="chip-anim flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-bright">
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight">{p.label}</span>
                <span className="text-xs font-medium tracking-wide text-muted-foreground">{p.tagline}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{p.meta}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-300 group-hover:translate-x-1 group-hover:text-brand-bright" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Full Speaking Mock — visually distinct hero card (div, not button, to avoid nested buttons) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate({ name: "mock-config" })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate({ name: "mock-config" });
          }
        }}
        aria-label="Start Full Speaking Mock"
        className="group relative block w-full cursor-pointer overflow-hidden rounded-3xl border border-brand-bright/35 bg-gradient-to-br from-brand-soft via-card to-card p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-bright/60 hover:shadow-xl sm:p-8"
      >
        <div className="pointer-events-none absolute -right-6 -bottom-8 opacity-[0.08] transition-transform duration-500 group-hover:scale-110 group-hover:opacity-[0.12]">
          <StarMark size={220} />
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
              <ClipboardCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="text-[11px] font-semibold tracking-[0.18em] text-brand-bright uppercase">
                The complete test experience
              </div>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
                Full Speaking Mock
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            Part 1 with three topics, a Part 2 cue card with preparation, and Part 3 with three
            discussion topics — recorded automatically as one continuous session with a
            question-by-question timeline.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" className="btn-glow gap-2 shadow-md">
              <Mic className="h-4 w-4" />
              Start Full Mock
            </Button>
            <span className="text-xs text-muted-foreground">
              Microphone check first · about 14 minutes
            </span>
          </div>
        </div>
      </div>

      <SectionCard title="Also here">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate({ name: "videos" })}
            className={cn(
              "flex items-center justify-between rounded-xl border border-border px-4 py-3.5 text-left text-sm font-medium transition-colors",
              "hover:border-brand-bright/35 hover:bg-muted/40"
            )}
          >
            YouTube Mock Library
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: "practice-again" })}
            className={cn(
              "flex items-center justify-between rounded-xl border border-border px-4 py-3.5 text-left text-sm font-medium transition-colors",
              "hover:border-brand-bright/35 hover:bg-muted/40"
            )}
          >
            Practice Again
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
