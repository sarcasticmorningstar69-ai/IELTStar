"use client";

import * as React from "react";
import {
  PART1_TOPICS,
  PART2_CARDS,
  PART3_TOPICS,
  vocabForTopic,
  type VocabItem,
} from "@/lib/data/content";
import { VocabSheet } from "@/components/views/vocab-sheet";
import { cn } from "@/lib/utils";
import { BookOpen, MessageCircle, MessagesSquare, Presentation, Search } from "lucide-react";

type PartFilter = "all" | 1 | 2 | 3;

interface TopicRow {
  id: string;
  title: string;
  part: 1 | 2 | 3;
  cluster: string;
  items: VocabItem[];
}

function allTopics(): TopicRow[] {
  return [
    ...PART1_TOPICS.map((t) => ({
      id: t.id,
      title: t.title,
      part: 1 as const,
      cluster: t.cluster,
      items: vocabForTopic(t.id),
    })),
    ...PART2_CARDS.map((t) => ({
      id: t.id,
      title: t.title,
      part: 2 as const,
      cluster: t.domain,
      items: vocabForTopic(t.id),
    })),
    ...PART3_TOPICS.map((t) => ({
      id: t.id,
      title: t.title,
      part: 3 as const,
      cluster: t.domain,
      items: vocabForTopic(t.id),
    })),
  ].filter((t) => t.items.length > 0);
}

const PART_META = {
  1: { label: "Part 1", icon: MessageCircle },
  2: { label: "Part 2", icon: Presentation },
  3: { label: "Part 3", icon: MessagesSquare },
} as const;

export function VocabTab() {
  const topics = React.useMemo(() => allTopics(), []);
  const [part, setPart] = React.useState<PartFilter>("all");
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const filtered = topics.filter((t) => {
    if (part !== "all" && t.part !== part) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.cluster.toLowerCase().includes(q) ||
      t.items.some((v) => v.phrase.toLowerCase().includes(q) || v.definition.toLowerCase().includes(q))
    );
  });

  const open = topics.find((t) => t.id === openId);
  const totalPhrases = topics.reduce((n, t) => n + t.items.length, 0);

  return (
    <div className="space-y-5">
      <p className="max-w-2xl px-1 text-sm leading-relaxed text-muted-foreground">
        Useful language for every topic — words and chunks you can use naturally.
        Nothing here has to be forced into an answer.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter vocabulary by part" className="flex flex-wrap gap-2">
          {([
            ["all", "All parts"],
            [1, "Part 1"],
            [2, "Part 2"],
            [3, "Part 3"],
          ] as const).map(([key, label]) => (
            <button
              key={String(key)}
              type="button"
              aria-pressed={part === key}
              onClick={() => setPart(key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                part === key
                  ? "border-brand-bright/60 bg-brand-soft text-foreground"
                  : "border-border text-muted-foreground hover:border-brand-bright/35 hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {filtered.length} topics · {totalPhrases} phrases
        </span>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">Search vocabulary</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a topic or phrase"
          className="h-11 w-full rounded-xl border border-border bg-card pr-3 pl-10 text-sm outline-none transition-colors focus:border-brand-bright/50"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map((t) => {
          const MetaIcon = PART_META[t.part].icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className="card-lift group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left sm:p-5"
            >
              <span className="chip-anim mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-bright">
                <MetaIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tracking-tight">{t.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {PART_META[t.part].label} · {t.cluster}
                </span>
                <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-bright">
                  <BookOpen className="h-3.5 w-3.5" />
                  {t.items.length} {t.items.length === 1 ? "phrase" : "phrases"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {!filtered.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No matching vocabulary. Try another part or a shorter search.
        </p>
      )}

      <VocabSheet
        open={Boolean(open)}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title={open?.title ?? ""}
        items={open?.items ?? []}
      />
    </div>
  );
}
