"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress } from "@/lib/store/progress";
import {
  PART1_TOPICS, PART3_TOPICS, PART1_VOCAB, PART3_VOCAB, pickRandom, topicTitle,
} from "@/lib/data/content";
import { PageHeader } from "@/components/shared/page-kit";
import { VocabSheet } from "@/components/views/vocab-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search, Shuffle, Play, BookOpen, Check, Circle, CheckCircle2, X,
} from "lucide-react";

interface TopicEntry {
  id: string;
  title: string;
  group: string;
  questionCount: number;
}

function StatusBadge({ topicId }: { topicId: string }) {
  // select the stored object directly (stable reference; undefined when absent)
  const stored = useProgress((s) => s.topics[topicId]);
  const status = stored?.status ?? "not-started";
  if (status === "completed")
    return (
      <Badge variant="outline" className="gap-1 border-success/50 text-success">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </Badge>
    );
  if (status === "in-progress")
    return (
      <Badge variant="outline" className="gap-1 border-brand-bright/50 text-brand-bright">
        <Circle className="h-3 w-3 fill-current" /> In Progress
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="h-3 w-3" /> Not Started
    </Badge>
  );
}

export function TopicBrowserView({ part }: { part: 1 | 3 }) {
  const navigate = useApp((s) => s.navigate);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [vocabTopic, setVocabTopic] = React.useState<string | null>(null);

  const topics: TopicEntry[] = React.useMemo(() => {
    const source = part === 1 ? PART1_TOPICS : PART3_TOPICS;
    return source.map((t) => ({
      id: t.id,
      title: t.title,
      group: part === 1 ? t.cluster : t.domain,
      questionCount: t.questions.length,
    }));
  }, [part]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) => t.title.toLowerCase().includes(q) || t.group.toLowerCase().includes(q)
    );
  }, [topics, query]);

  const groups = React.useMemo(() => {
    const map = new Map<string, TopicEntry[]>();
    for (const t of filtered) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const randomThree = () => {
    setSelected(pickRandom(topics, Math.min(3, topics.length)).map((t) => t.id));
  };

  const startSession = () => {
    if (!selected.length) return;
    navigate({ name: "session", kind: part === 1 ? "part1" : "part3", topicIds: selected });
  };

  const vocabItems = vocabTopic
    ? (part === 1 ? PART1_VOCAB[vocabTopic] : PART3_VOCAB[vocabTopic]) || []
    : [];

  const questionTotal = selected.reduce(
    (sum, id) => sum + (topics.find((t) => t.id === id)?.questionCount ?? 0),
    0
  );

  return (
    <div className="fade-up pb-10">
      <PageHeader
        eyebrow={`Part ${part}`}
        title={part === 1 ? "Everyday Conversation" : "Discussion"}
        subtitle={
          part === 1
            ? "Choose one topic, or pick a few — a natural Part 1 set is three topics."
            : "Choose one or more discussion topics. You can practice up to three at a time."
        }
      />

      {/*
        Pinned to the top of the scroll area. This used to sit below every topic
        card, which meant scrolling the whole list to start a session.
      */}
      <div className="sticky top-0 z-30 mb-4 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {selected.length === 0 ? (
              <>
                <p className="text-sm font-medium">Pick your topics below</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tap any card to add it. You can combine several into one session.
                </p>
              </>
            ) : (
              <>
                <p className="truncate text-sm font-medium">
                  {selected.map((id) => topicTitle(id)).join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.length} {selected.length === 1 ? "topic" : "topics"} ·{" "}
                  {questionTotal} {questionTotal === 1 ? "question" : "questions"}
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="ml-2 inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                  >
                    <X className="h-3 w-3" />
                    clear
                  </button>
                </p>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {selected.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setVocabTopic(selected[0])}
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Useful Language</span>
                <span className="sm:hidden">Words</span>
              </Button>
            )}
            <Button onClick={startSession} disabled={!selected.length} className="gap-1.5">
              <Play className="h-4 w-4" />
              Start
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${topics.length} topics…`}
            aria-label="Search topics"
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={randomThree}
          className="h-11 gap-2 rounded-xl"
          aria-label="Select three random topics"
        >
          <Shuffle className="h-4 w-4" />
          Random 3
        </Button>
      </div>

      <div className="space-y-6">
        {groups.map(([group, items]) => (
          <section key={group}>
            <h2 className="mb-2.5 px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => {
                const active = selected.includes(t.id);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "card-lift group relative rounded-2xl border bg-card p-4",
                      active
                        ? "border-brand-bright/60 shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--brand-bright)_40%,transparent)]"
                        : "border-border"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={active}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                          active
                            ? "scale-110 border-brand-bright bg-brand-bright text-primary-foreground"
                            : "border-muted-foreground/40 text-transparent group-hover:scale-110 group-hover:border-brand-bright/60"
                        )}
                        aria-hidden
                      >
                        <Check className={cn("h-3 w-3 transition-transform duration-300", active ? "scale-100" : "scale-0")} strokeWidth={3.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold tracking-tight">
                          {t.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t.questionCount} questions
                        </span>
                        <span className="mt-2 block">
                          <StatusBadge topicId={t.id} />
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVocabTopic(t.id)}
                      className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-brand-bright"
                      aria-label={`View useful language for ${t.title}`}
                    >
                      <BookOpen className="h-3 w-3" />
                      Vocabulary
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!filtered.length && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No topics match “{query}”.
          </p>
        )}
      </div>

      <VocabSheet
        open={!!vocabTopic}
        onOpenChange={(o) => !o && setVocabTopic(null)}
        title={vocabTopic ? topicTitle(vocabTopic) : ""}
        items={vocabItems}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Part 2 — cue card browser
// ---------------------------------------------------------------------------

import { PART2_CARDS, PART2_VOCAB } from "@/lib/data/content";

export function Part2BrowserView() {
  const navigate = useApp((s) => s.navigate);
  const [query, setQuery] = React.useState("");
  const [vocabCard, setVocabCard] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PART2_CARDS;
    return PART2_CARDS.filter(
      (c) => c.title.toLowerCase().includes(q) || c.prompt.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)
    );
  }, [query]);

  const domains = React.useMemo(() => {
    const map = new Map<string, typeof PART2_CARDS>();
    for (const c of filtered) {
      if (!map.has(c.domain)) map.set(c.domain, []);
      map.get(c.domain)!.push(c);
    }
    return [...map.entries()];
  }, [filtered]);

  const previewCard = preview ? PART2_CARDS.find((c) => c.id === preview) : null;
  const randomCard = () => {
    const card = pickRandom(PART2_CARDS, 1)[0];
    setPreview(card.id);
  };

  return (
    <div className="fade-up pb-10">
      <PageHeader
        eyebrow="Part 2"
        title="Long Turn"
        subtitle="Pick a cue card, or go random. You'll get one minute to prepare keywords and two minutes to speak — your notes stay visible the whole time."
      />

      {/* Pinned selection panel — previously at the bottom of the card list. */}
      {previewCard && (
        <div className="sticky top-0 z-30 mb-4 rounded-2xl border border-brand-bright/35 bg-card/95 p-4 shadow-sm backdrop-blur-md sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
                Selected cue card
              </div>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">{previewCard.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{previewCard.prompt}</p>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Clear selected cue card"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => navigate({ name: "session", kind: "part2", topicIds: [previewCard.id] })} className="gap-2">
              <Play className="h-4 w-4" />
              Prepare &amp; Speak
            </Button>
            <Button variant="outline" onClick={() => setVocabCard(previewCard.id)} className="gap-2">
              <BookOpen className="h-4 w-4" />
              Useful Language
            </Button>
            <Button variant="ghost" onClick={randomCard} className="gap-2 text-muted-foreground">
              <Shuffle className="h-4 w-4" />
              Another
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cue cards…"
            aria-label="Search cue cards"
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <Button variant="outline" onClick={randomCard} className="h-11 gap-2 rounded-xl">
          <Shuffle className="h-4 w-4" />
          Random Cue Card
        </Button>
      </div>

      <div className="space-y-6">
        {domains.map(([domain, cards]) => (
          <section key={domain}>
            <h2 className="mb-2.5 px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {domain}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group rounded-2xl border bg-card p-4 transition-all duration-150",
                    preview === c.id
                      ? "border-brand-bright/60 shadow-md"
                      : "border-border hover:border-brand-bright/30 hover:shadow-sm"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreview(c.id)}
                    className="w-full text-left"
                    aria-label={`Preview cue card ${c.title}`}
                  >
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Cue Card {c.id.replace("p2c", "")}
                    </span>
                    <span className="mt-1 block font-semibold tracking-tight">{c.title}</span>
                    <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                      {c.prompt}
                    </span>
                  </button>
                  <div className="mt-3 flex items-center justify-between">
                    <StatusBadge topicId={c.id} />
                    <button
                      type="button"
                      onClick={() => setVocabCard(c.id)}
                      className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-brand-bright"
                      aria-label={`View useful language for ${c.title}`}
                    >
                      <BookOpen className="h-3 w-3" />
                      Vocabulary
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <VocabSheet
        open={!!vocabCard}
        onOpenChange={(o) => !o && setVocabCard(null)}
        title={vocabCard ? PART2_CARDS.find((c) => c.id === vocabCard)?.title || "" : ""}
        items={vocabCard ? PART2_VOCAB[vocabCard] || [] : []}
      />
    </div>
  );
}
