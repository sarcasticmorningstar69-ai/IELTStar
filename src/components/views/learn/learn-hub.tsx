"use client";

/**
 * Learn hub — Problems & Solutions, Techniques, Tips.
 * All content comes verbatim from the supplied materials via content.ts.
 */

import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type ProblemState } from "@/lib/store/progress";
import {
  CORE_AREAS,
  PROBLEM_LAYERS,
  TECHNIQUE_GROUPS,
  TIP_CATEGORIES,
  problemById,
  techniqueById,
  type CoreArea,
  type OriginalProblem,
  type Technique,
  type TipCategory,
} from "@/lib/data/content";
import { PageHeader, SectionCard } from "@/components/shared/page-kit";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DifficultyPill,
  ProblemStatusDot,
  ProblemStatusPill,
  Reveal,
  TechniqueSections,
  areaDisplayStatus,
  isRecoveryCategory,
  normalizeTip,
  problemDisplayStatus,
} from "./learn-shared";
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Compass,
  Heart,
  Layers,
  LifeBuoy,
  Lightbulb,
  MessageCircle,
  MessagesSquare,
  MoveRight,
  Presentation,
  Shuffle,
  Target,
  Volume2,
  Wind,
  type LucideIcon,
} from "lucide-react";

const LEARN_TABS = [
  { key: "problems", short: "Problems", full: "Problems & Solutions" },
  { key: "techniques", short: "Techniques", full: "Techniques" },
  { key: "tips", short: "Tips", full: "Tips" },
] as const;

const TOTAL_PROBLEMS = CORE_AREAS.reduce((a, x) => a + x.problemIds.length, 0);

export function LearnView({ tab }: { tab?: "problems" | "techniques" | "tips" }) {
  const navigate = useApp((s) => s.navigate);
  const active = tab ?? "problems";
  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Learn"
        title="Understand what to work on."
        subtitle="Problems, techniques and tips — grounded in real speaking practice."
      />

      <div
        role="tablist"
        aria-label="Learn sections"
        className="scrollbar-thin mb-7 flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-card p-1"
      >
        {LEARN_TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => navigate({ name: "learn", tab: t.key })}
              className={cn(
                "flex-1 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-5",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.full}</span>
            </button>
          );
        })}
      </div>

      <div key={active} className="fade-up">
        {active === "problems" ? (
          <ProblemsTab />
        ) : active === "techniques" ? (
          <TechniquesTab />
        ) : (
          <TipsTab />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Problems & Solutions tab — 14 core areas, one expanded at a time (lazy rows)
// ---------------------------------------------------------------------------

function ProblemsTab() {
  const problems = useProgress((s) => s.problems);
  const [openAreaId, setOpenAreaId] = React.useState<string | null>(null);
  const [mountedAreas, setMountedAreas] = React.useState<ReadonlySet<string>>(() => new Set());
  const [layersOpen, setLayersOpen] = React.useState(false);

  const toggleArea = (areaId: string) => {
    setOpenAreaId((prev) => (prev === areaId ? null : areaId));
    setMountedAreas((prev) => {
      if (prev.has(areaId)) return prev;
      const next = new Set(prev);
      next.add(areaId);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Fourteen core areas, each holding its detailed problems. Open an area to
          explore them — your practice marks show up here as you go.
        </p>
        <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground">
          {CORE_AREAS.length} areas · {TOTAL_PROBLEMS} problems
        </span>
      </div>

      <div className="space-y-3">
        {CORE_AREAS.map((area) => (
          <AreaCard
            key={area.id}
            area={area}
            open={openAreaId === area.id}
            mounted={mountedAreas.has(area.id)}
            problems={problems}
            onToggle={() => toggleArea(area.id)}
          />
        ))}
      </div>

      <SectionCard title="The 8 layers" hint="reference">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The detailed problems above sit somewhere across these eight layers of
          speaking performance — a useful map when a difficulty keeps coming back.
        </p>
        <button
          type="button"
          onClick={() => setLayersOpen((v) => !v)}
          aria-expanded={layersOpen}
          aria-controls="problem-layers-panel"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/40 hover:text-foreground"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          {layersOpen ? "Hide the layers" : "Show the layers"}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", layersOpen && "rotate-180")}
            aria-hidden
          />
        </button>
        <Reveal open={layersOpen} id="problem-layers-panel">
          <ul className="grid gap-3 pt-4 sm:grid-cols-2">
            {PROBLEM_LAYERS.map((layer) => (
              <li key={layer.name} className="rounded-xl border border-border bg-surface p-4">
                <h3 className="text-xs font-semibold tracking-wide text-foreground">{layer.name}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{layer.items}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </SectionCard>
    </div>
  );
}

function AreaCard({
  area,
  open,
  mounted,
  problems,
  onToggle,
}: {
  area: CoreArea;
  open: boolean;
  mounted: boolean;
  problems: Record<string, ProblemState>;
  onToggle: () => void;
}) {
  const { status, touched } = areaDisplayStatus(area, problems);
  const panelId = `area-panel-${area.id}`;
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card transition-all duration-200",
        open ? "border-brand-bright/40 shadow-md" : "border-border hover:border-brand-bright/40 hover:shadow-md"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 p-4 text-left sm:gap-4 sm:p-5"
      >
        <span
          className="mt-0.5 w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground/70 sm:mt-0.5"
          aria-hidden
        >
          {String(area.index).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight text-balance">
            {area.name}
          </span>
          <span
            className={cn(
              "mt-1 block text-xs leading-relaxed text-muted-foreground",
              open ? "line-clamp-3" : "line-clamp-2"
            )}
          >
            {area.includes.join(" · ")}
          </span>
          <span className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <ProblemStatusPill status={status} />
            <span className="text-xs text-muted-foreground">
              {area.problemIds.length} detailed {area.problemIds.length === 1 ? "problem" : "problems"}
              {touched > 0 ? ` · ${touched} in your practice` : ""}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold tracking-wide text-brand-bright">
              {open ? "Close" : "Explore"}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  open && "rotate-180"
                )}
                aria-hidden
              />
            </span>
          </span>
        </span>
      </button>
      {mounted && (
        <Reveal open={open} id={panelId}>
          <div className="border-t border-border">
            <ul className="divide-y divide-border">
              {area.problemIds.map((pid) => {
                const problem = problemById(pid);
                if (!problem) return null;
                return <ProblemRow key={pid} problem={problem} state={problems[pid]} />;
              })}
            </ul>
          </div>
        </Reveal>
      )}
    </article>
  );
}

function ProblemRow({ problem, state }: { problem: OriginalProblem; state?: ProblemState }) {
  const navigate = useApp((s) => s.navigate);
  const status = problemDisplayStatus(state);
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate({ name: "problem", problemId: problem.id })}
        className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:px-5"
        aria-label={`Open problem: ${problem.title}`}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-semibold tabular-nums text-muted-foreground">
          {problem.num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold tracking-tight">{problem.title}</span>
            <DifficultyPill difficulty={problem.difficulty} />
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {problem.note}
          </span>
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-2">
          <ProblemStatusPill status={status} className="hidden sm:inline-flex" />
          <ProblemStatusDot status={status} className="sm:hidden" />
          <ChevronRight
            className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Techniques tab — 15 groups; reveal one in place, or open the full view
// ---------------------------------------------------------------------------

function TechniquesTab() {
  const navigate = useApp((s) => s.navigate);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [mountedIds, setMountedIds] = React.useState<ReadonlySet<string>>(() => new Set());

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
    setMountedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <p className="max-w-2xl px-1 text-sm leading-relaxed text-muted-foreground">
        Fifteen technique groups, fifty techniques in total. Reveal a group in
        place for the essentials, or open the full view for spacious reading.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TECHNIQUE_GROUPS.map((group) => {
          const open = openId === group.id;
          const techniques = group.techniqueIds
            .map((id) => techniqueById(id))
            .filter((t): t is Technique => Boolean(t));
          const panelId = `tg-panel-${group.id}`;
          return (
            <article
              key={group.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card transition-all duration-200",
                open
                  ? "col-span-full border-brand-bright/40 shadow-md"
                  : "border-border hover:-translate-y-0.5 hover:border-brand-bright/40 hover:shadow-md"
              )}
            >
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={open}
                aria-controls={panelId}
                className={cn(
                  "flex w-full flex-col p-5 text-left",
                  // h-full only while collapsed so the Reveal row never gets
                  // pushed below the card's clip (expanded cards must size
                  // to their header, not stretch to the article height)
                  !open && "h-full"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {group.category}
                  </span>
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                    {techniques.length} {techniques.length === 1 ? "technique" : "techniques"}
                  </span>
                </span>
                <span className="mt-2 text-[15px] font-semibold tracking-tight text-balance">
                  {group.title}
                </span>
                <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {group.oneLine}
                </span>
                <span className="mt-auto flex items-center justify-between pt-4">
                  <span
                    className={cn(
                      "text-[11px] font-semibold tracking-wide",
                      open ? "text-muted-foreground" : "text-brand-bright"
                    )}
                  >
                    {open ? "Hide" : "Reveal"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      open && "rotate-180"
                    )}
                    aria-hidden
                  />
                </span>
              </button>
              {mountedIds.has(group.id) && (
                <Reveal open={open} id={panelId}>
                  <div className="border-t border-border px-4 py-5 sm:px-5">
                    <div className="max-w-3xl space-y-4">
                      {techniques.map((t, i) => (
                        <div
                          key={t.id}
                          className="rounded-xl border border-border bg-surface p-4 sm:p-5"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <h3 className="text-sm font-semibold tracking-tight">{t.title}</h3>
                            <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                              {i + 1} / {techniques.length}
                            </span>
                          </div>
                          <div className="mt-3">
                            <TechniqueSections sections={t.sections} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate({ name: "technique", groupId: group.id })}
                        className="gap-1.5"
                      >
                        Open full view
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </Reveal>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tips tab — a featured daily tip, a visual category browser, and numbered
// tip cards. All 116 supplied tips preserved; categories get icons and
// one-line descriptions so the section reads at a glance.
// ---------------------------------------------------------------------------

const TIP_CATEGORY_META: Record<string, { icon: LucideIcon; subtitle: string }> = {
  A: { icon: Compass, subtitle: "Habits that help in every part" },
  B: { icon: MessageCircle, subtitle: "Short answers, natural tone" },
  C: { icon: Presentation, subtitle: "The two-minute long turn" },
  D: { icon: MessagesSquare, subtitle: "Discussion and reasoning" },
  E: { icon: BookOpen, subtitle: "Words you can actually use" },
  F: { icon: Wind, subtitle: "Keep going calmly" },
  G: { icon: Volume2, subtitle: "Clear beats perfect" },
  H: { icon: LifeBuoy, subtitle: "What to do when it breaks" },
  I: { icon: Heart, subtitle: "Calm under pressure" },
  J: { icon: CalendarCheck, subtitle: "The exam itself" },
  K: { icon: Target, subtitle: "Practice that actually counts" },
};

interface FlatTip {
  catKey: string;
  catName: string;
  index: number;
  title: string;
  body: string | null;
}

function allTipsFlat(): FlatTip[] {
  const out: FlatTip[] = [];
  for (const cat of TIP_CATEGORIES) {
    cat.tips.forEach((tip, i) => {
      const norm = normalizeTip(tip);
      out.push({ catKey: cat.key, catName: cat.name, index: i, title: norm.title, body: norm.body });
    });
  }
  return out;
}

/** Day of the year — used to rotate the featured tip daily. */
function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000));
}

function TipsTab() {
  const [categoryKey, setCategoryKey] = React.useState<string | null>(null);
  const [openTips, setOpenTips] = React.useState<ReadonlySet<string>>(() => new Set());

  const toggleTip = (key: string) => {
    setOpenTips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selected = categoryKey
    ? TIP_CATEGORIES.find((c) => c.key === categoryKey)
    : null;

  return (
    <div className="space-y-6">
      {!selected && <FeaturedTipCard />}

      <div role="group" aria-label="Filter tips by category" className="flex flex-wrap gap-2">
        <FilterChip active={categoryKey === null} onClick={() => setCategoryKey(null)}>
          All categories
        </FilterChip>
        {TIP_CATEGORIES.map((c) => (
          <FilterChip
            key={c.key}
            active={categoryKey === c.key}
            onClick={() => setCategoryKey(c.key)}
          >
            {c.name}
          </FilterChip>
        ))}
      </div>

      {selected ? (
        <CategoryDetail
          category={selected}
          openTips={openTips}
          onToggle={toggleTip}
          onBack={() => setCategoryKey(null)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {TIP_CATEGORIES.map((c) => (
            <CategoryCard key={c.key} category={c} onClick={() => setCategoryKey(c.key)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured tip — one supplied tip, rotating daily, with a shuffle
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-brand-bright/60 bg-brand-soft text-foreground"
          : "border-border text-muted-foreground hover:border-brand-bright/35 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function FeaturedTipCard() {
  const flat = React.useMemo(() => allTipsFlat(), []);
  const todayIdx = React.useMemo(() => dayOfYear() % flat.length, [flat.length]);
  const [shuffledIdx, setShuffledIdx] = React.useState<number | null>(null);

  const shuffle = () => {
    const from = shuffledIdx === null ? todayIdx : shuffledIdx;
    let next = from;
    while (next === from && flat.length > 1) {
      next = Math.floor(Math.random() * flat.length);
    }
    setShuffledIdx(next);
  };

  const tip = flat[shuffledIdx === null ? todayIdx : shuffledIdx] ?? flat[0];
  const meta = TIP_CATEGORY_META[tip.catKey];
  const Icon = meta?.icon ?? Lightbulb;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-bright/30 bg-gradient-to-br from-brand-soft via-card to-card p-6 sm:p-7">
      <div className="pointer-events-none absolute -top-10 -right-10 opacity-[0.07]">
        <StarMark size={190} />
      </div>
      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
              Today&apos;s tip
            </div>
            <div className="truncate text-xs text-muted-foreground">{tip.catName}</div>
          </div>
        </div>
        <h3 className="mt-4 max-w-2xl text-balance text-lg leading-snug font-semibold tracking-tight sm:text-[22px] sm:leading-snug">
          {tip.title}
        </h3>
        {tip.body && (
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {tip.body}
          </p>
        )}
        <div className="mt-5 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={shuffle} className="gap-1.5">
            <Shuffle className="h-3.5 w-3.5" />
            Show another
          </Button>
          <span className="text-[11px] text-muted-foreground">
            A new tip is featured every day
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category card — icon, name, subtitle, count
// ---------------------------------------------------------------------------

function CategoryCard({
  category,
  onClick,
}: {
  category: TipCategory;
  onClick: () => void;
}) {
  const meta = TIP_CATEGORY_META[category.key];
  const Icon = meta?.icon ?? Lightbulb;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${category.name} tips (${category.tips.length})`}
      className="card-lift group flex flex-col items-start rounded-2xl border border-border bg-card p-4 text-left sm:p-5"
    >
      <span className="chip-anim flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-bright">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-3 text-[15px] font-semibold tracking-tight">{category.name}</span>
      <span className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
        {meta?.subtitle}
      </span>
      <span className="mt-3 flex w-full items-center justify-between">
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {category.tips.length} {category.tips.length === 1 ? "tip" : "tips"}
        </span>
        <ChevronRight
          className="h-4 w-4 text-muted-foreground/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand-bright"
          aria-hidden
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Category detail — numbered tip cards
// ---------------------------------------------------------------------------

function CategoryDetail({
  category,
  openTips,
  onToggle,
  onBack,
}: {
  category: TipCategory;
  openTips: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onBack: () => void;
}) {
  const meta = TIP_CATEGORY_META[category.key];
  const Icon = meta?.icon ?? Lightbulb;
  const recovery = isRecoveryCategory(category.name);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/40 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All categories
      </button>

      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-bright">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{category.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {meta?.subtitle} · {category.tips.length} {category.tips.length === 1 ? "tip" : "tips"}
          </p>
        </div>
      </div>

      <ol className="mt-6 space-y-2.5">
        {category.tips.map((tip, i) => {
          const norm = normalizeTip(tip);
          const key = `${category.key}-${i}`;
          const num = String(i + 1).padStart(2, "0");

          // Recovery: problem → action, one compact card per row
          if (recovery) {
            return (
              <li
                key={key}
                className="card-lift flex items-baseline gap-3.5 rounded-2xl border border-border bg-card p-4 sm:px-5"
              >
                <span className="text-lg leading-none font-bold tabular-nums text-brand-bright/35">
                  {num}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <span className="text-[15px] font-semibold tracking-tight">{norm.title}</span>
                  {norm.body && (
                    <>
                      <MoveRight
                        className="h-4 w-4 shrink-0 translate-y-0.5 text-brand-bright"
                        aria-hidden
                      />
                      <span className="text-sm leading-relaxed text-muted-foreground">
                        {norm.body}
                      </span>
                    </>
                  )}
                </span>
              </li>
            );
          }

          // Pure rule — always visible, no expansion
          if (!norm.body) {
            return (
              <li
                key={key}
                className="card-lift flex items-baseline gap-3.5 rounded-2xl border border-border bg-card p-4 sm:px-5"
              >
                <span className="text-lg leading-none font-bold tabular-nums text-brand-bright/35">
                  {num}
                </span>
                <span className="flex-1 text-[15px] leading-relaxed font-medium tracking-tight">
                  {norm.title}
                </span>
              </li>
            );
          }

          // Rule + explanation — expandable
          const open = openTips.has(key);
          const panelId = `tip-panel-${key}`;
          return (
            <li
              key={key}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card transition-colors duration-200",
                open ? "border-brand-bright/40" : "border-border hover:border-brand-bright/25"
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(key)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-baseline gap-3.5 p-4 text-left sm:px-5"
              >
                <span className="text-lg leading-none font-bold tabular-nums text-brand-bright/35">
                  {num}
                </span>
                <span className="flex-1 text-[15px] leading-relaxed font-medium tracking-tight">
                  {norm.title}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform duration-200",
                    open && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              <Reveal open={open} id={panelId}>
                <div className="px-4 pb-4 sm:px-5">
                  <div className="flex gap-3.5">
                    <span className="w-7 shrink-0" aria-hidden />
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      {norm.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
