"use client";

/**
 * Full Speaking Mock configurator.
 * RANDOM / CUSTOM / MIXED structure for Part 1 (3 topics), Part 2 (1 cue card),
 * Part 3 (3 topics). The generated structure is shown before starting.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress } from "@/lib/store/progress";
import {
  PART1_TOPICS, PART2_CARDS, PART3_TOPICS, pickRandom,
} from "@/lib/data/content";
import { PageHeader } from "@/components/shared/page-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Shuffle, Check, ClipboardCheck, Info } from "lucide-react";

type Mode = "random" | "custom";

interface ConfigState {
  mode: Mode;
  part1: string[];
  part2: string;
  part3: string[];
}

export function MockConfigView() {
  const navigate = useApp((s) => s.navigate);
  const createMock = useProgress((s) => s.createMock);
  const [config, setConfig] = React.useState<ConfigState>(() => ({
    mode: "random",
    part1: pickRandom(PART1_TOPICS, 3).map((t) => t.id),
    part2: pickRandom(PART2_CARDS, 1)[0].id,
    part3: pickRandom(PART3_TOPICS, 3).map((t) => t.id),
  }));
  const [customizing, setCustomizing] = React.useState<null | "p1" | "p2" | "p3">(null);

  const randomizeAll = () =>
    setConfig({
      mode: "random",
      part1: pickRandom(PART1_TOPICS, 3).map((t) => t.id),
      part2: pickRandom(PART2_CARDS, 1)[0].id,
      part3: pickRandom(PART3_TOPICS, 3).map((t) => t.id),
    });

  const randomizePart = (part: "p1" | "p2" | "p3") => {
    if (part === "p1")
      setConfig((c) => ({ ...c, part1: pickRandom(PART1_TOPICS, 3).map((t) => t.id) }));
    if (part === "p2") setConfig((c) => ({ ...c, part2: pickRandom(PART2_CARDS, 1)[0].id }));
    if (part === "p3")
      setConfig((c) => ({ ...c, part3: pickRandom(PART3_TOPICS, 3).map((t) => t.id) }));
  };

  const title = (id: string) =>
    PART1_TOPICS.find((t) => t.id === id)?.title ||
    PART2_CARDS.find((c) => c.id === id)?.title ||
    PART3_TOPICS.find((t) => t.id === id)?.title ||
    id;

  const startMock = () => {
    // build segments
    const segments: {
      id: string; index: number; part: 1 | 2 | 3; topicId?: string; questionId?: string;
      label: string; duration: number; completed: boolean;
    }[] = [];
    let i = 0;
    for (const tid of config.part1) {
      const t = PART1_TOPICS.find((x) => x.id === tid)!;
      t.questions.forEach((q) => {
        segments.push({
          id: `seg-${i}`, index: i, part: 1, topicId: tid, questionId: q.id,
          label: `P1 Q${segments.filter((s) => s.part === 1).length + 1}`, duration: 0, completed: false,
        });
        i++;
      });
    }
    const card = PART2_CARDS.find((c) => c.id === config.part2)!;
    segments.push({
      id: `seg-${i}`, index: i, part: 2, topicId: card.id, questionId: card.id,
      label: "P2", duration: 0, completed: false,
    });
    i++;
    for (const tid of config.part3) {
      const t = PART3_TOPICS.find((x) => x.id === tid)!;
      t.questions.forEach((q) => {
        segments.push({
          id: `seg-${i}`, index: i, part: 3, topicId: tid, questionId: q.id,
          label: `P3 Q${segments.filter((s) => s.part === 3).length + 1}`, duration: 0, completed: false,
        });
        i++;
      });
    }
    createMock(
      { part1: config.part1, part2: config.part2, part3: config.part3 },
      segments
    );
    // navigate to mic check for the newest mock
    const mocks = useProgress.getState().mocks;
    navigate({ name: "mock-check", mockId: mocks[0].id });
  };

  const totalQuestions =
    config.part1.reduce((a, tid) => a + (PART1_TOPICS.find((t) => t.id === tid)?.questions.length || 0), 0) +
    1 +
    config.part3.reduce((a, tid) => a + (PART3_TOPICS.find((t) => t.id === tid)?.questions.length || 0), 0);

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Full Speaking Mock"
        title="Build your mock."
        subtitle="Randomize everything, customize any part, or mix both. About 14 minutes end to end."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={randomizeAll} variant="outline" className="gap-2 rounded-xl">
          <Shuffle className="h-4 w-4" />
          Randomize all
        </Button>
        <div className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {totalQuestions} recorded answers · ~{Math.round((totalQuestions * 35 + 180) / 60)} min
        </div>
      </div>

      {/* Structure preview */}
      <div className="space-y-3">
        {(
          [
            { key: "p1", part: "Part 1", items: config.part1, bank: PART1_TOPICS.length },
            { key: "p2", part: "Part 2", items: [config.part2], bank: PART2_CARDS.length },
            { key: "p3", part: "Part 3", items: config.part3, bank: PART3_TOPICS.length },
          ] as const
        ).map((row) => (
          <div key={row.key} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                {row.part}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => randomizePart(row.key)}
                  className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-brand-bright"
                >
                  <Shuffle className="h-3 w-3" />
                  Random
                </button>
                <button
                  type="button"
                  onClick={() => setCustomizing(customizing === row.key ? null : row.key)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    customizing === row.key
                      ? "border-brand-bright/60 bg-brand-soft text-foreground"
                      : "border-border text-muted-foreground hover:border-brand-bright/50 hover:text-brand-bright"
                  )}
                >
                  <Check className="h-3 w-3" />
                  {customizing === row.key ? "Done" : "Customize"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.items.map((id, i) => (
                <span
                  key={id}
                  className="rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium"
                >
                  {title(id)}
                  {row.items.length > 1 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">#{i + 1}</span>
                  )}
                </span>
              ))}
            </div>
            {customizing === row.key && (
              <div className="mt-4 max-h-64 overflow-y-auto scrollbar-thin rounded-xl border border-border p-2">
                <div className="grid gap-1 sm:grid-cols-2">
                  {(row.key === "p1"
                    ? PART1_TOPICS
                    : row.key === "p2"
                      ? PART2_CARDS
                      : PART3_TOPICS
                  ).map((item) => {
                    const selected = row.items.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (row.key === "p2") {
                            setConfig((c) => ({ ...c, part2: item.id }));
                          } else if (row.key === "p1") {
                            setConfig((c) => {
                              const has = c.part1.includes(item.id);
                              let next = has
                                ? c.part1.filter((x) => x !== item.id)
                                : [...c.part1, item.id];
                              if (next.length > 3) next = next.slice(-3);
                              return { ...c, part1: next };
                            });
                          } else {
                            setConfig((c) => {
                              const has = c.part3.includes(item.id);
                              let next = has
                                ? c.part3.filter((x) => x !== item.id)
                                : [...c.part3, item.id];
                              if (next.length > 3) next = next.slice(-3);
                              return { ...c, part3: next };
                            });
                          }
                        }}
                        aria-pressed={selected}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "bg-brand-soft font-medium"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <span className="truncate">{item.title}</span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-brand-bright" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-bright/35 bg-card p-5 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-brand-bright" />
              Your mock structure is ready
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A microphone check comes first — nothing records until you continue.
            </p>
          </div>
          <Button size="lg" onClick={startMock} className="btn-glow gap-2 shadow-md">
            Start Full Mock
          </Button>
        </div>
      </div>
    </div>
  );
}
