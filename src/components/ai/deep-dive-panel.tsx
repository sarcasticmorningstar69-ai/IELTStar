"use client";

import * as React from "react";
import {
  type AiDeepDiveAnalysis,
  type AiInteractiveVocabItem,
  type AiGrammarDeepCategory,
} from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  BookOpen,
  CheckCircle2,
  Volume2,
  Copy,
  MessageSquareQuote,
  Lightbulb,
  ArrowRight,
  HelpCircle,
  Zap,
  Layers,
  ChevronDown,
  Flame,
  Rocket,
} from "lucide-react";

interface DeepDivePanelProps {
  deepDive: AiDeepDiveAnalysis;
  onAskStella?: (prompt: string) => void;
  className?: string;
}

type TabKey = "vocab" | "grammar" | "discourse";

export function DeepDivePanel({ deepDive, onAskStella, className }: DeepDivePanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabKey>("vocab");
  const [vocabFilter, setVocabFilter] = React.useState<"all" | "C2" | "C1" | "program">("all");
  const [copiedPhrase, setCopiedPhrase] = React.useState<string | null>(null);
  const [playingPhrase, setPlayingPhrase] = React.useState<string | null>(null);
  const [expandedGrammar, setExpandedGrammar] = React.useState<Record<number, boolean>>({ 0: true });

  const { vocabularyMastery, grammarDissection, discourseFluencyTactics } = deepDive;

  const handleCopy = (phrase: string, example: string) => {
    navigator.clipboard.writeText(`${phrase} — ${example}`);
    setCopiedPhrase(phrase);
    setTimeout(() => setCopiedPhrase(null), 2000);
  };

  const handleSpeak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.92;
    setPlayingPhrase(text);
    utterance.onend = () => setPlayingPhrase(null);
    utterance.onerror = () => setPlayingPhrase(null);
    window.speechSynthesis.speak(utterance);
  };

  const filteredVocab = React.useMemo(() => {
    const list = vocabularyMastery.interactiveSuggestions || [];
    if (vocabFilter === "C2") return list.filter((v) => v.level === "C2");
    if (vocabFilter === "C1") return list.filter((v) => v.level === "C1");
    if (vocabFilter === "program") return list.filter((v) => v.fromProgram);
    return list;
  }, [vocabularyMastery.interactiveSuggestions, vocabFilter]);

  const toggleGrammarCategory = (idx: number) => {
    setExpandedGrammar((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-b from-surface/90 via-surface/60 to-surface/90 p-5 shadow-2xl backdrop-blur-md transition-all sm:p-6",
        className
      )}
    >
      {/* Top Ambient Glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />

      {/* Header Banner */}
      <div className="relative mb-6 flex flex-col justify-between gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3.5 py-1 text-xs font-bold text-amber-300 shadow-sm">
            <Flame className="h-4 w-4 animate-pulse text-amber-400 fill-amber-500/30" />
            <span className="tracking-wide uppercase">Jet-Booster Mode Active · In-Depth Telemetry</span>
          </div>
          <h3 className="mt-2 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>In-Depth Linguistic Analysis</span>
            <Rocket className="h-5 w-5 text-amber-400 -rotate-45 hidden sm:inline" />
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Exhaustive, category-by-category dissection of your lexical range, grammatical architecture, and discourse mechanics.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-xl border border-border/80 bg-surface/80 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab("vocab")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
              activeTab === "vocab"
                ? "bg-brand text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Lexical Lab</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("grammar")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
              activeTab === "grammar"
                ? "bg-brand text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Grammar Dissection</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("discourse")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
              activeTab === "discourse"
                ? "bg-brand text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Discourse & Fluency</span>
          </button>
        </div>
      </div>

      {/* ──────────────── TAB 1: LEXICAL LABORATORY ──────────────── */}
      {activeTab === "vocab" && (
        <div className="space-y-6">
          {/* Overview */}
          {vocabularyMastery.overview && (
            <div className="rounded-xl border border-border/70 bg-surface/50 p-4 text-sm leading-relaxed text-foreground/90">
              <span className="font-semibold text-brand-bright">Examiner Appraisal: </span>
              {vocabularyMastery.overview}
            </div>
          )}

          {/* Repetitive Words Spotlight */}
          {vocabularyMastery.repetitiveWords && vocabularyMastery.repetitiveWords.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-warning" />
                <h4 className="text-xs font-bold tracking-wider text-warning uppercase">
                  Repetitive & Generic Wording Detected
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vocabularyMastery.repetitiveWords.map((rep, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border/60 bg-surface/60 p-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-rose-400">
                        "{rep.word}"
                      </span>
                      {rep.countApprox && (
                        <span className="text-[10px] text-muted-foreground">
                          {rep.countApprox}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span>Upgrade to: </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rep.alternatives.map((alt, j) => (
                          <button
                            key={j}
                            type="button"
                            onClick={() => onAskStella?.(`How can I naturally use "${alt}" instead of "${rep.word}" in IELTS Speaking?`)}
                            className="inline-flex items-center rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-bright hover:bg-brand/20 transition-colors"
                            title="Ask Stella for an example"
                          >
                            {alt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-foreground">Interactive Lexical Upgrades</h4>
              <span className="text-xs text-muted-foreground">({filteredVocab.length} suggestions)</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-surface/50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setVocabFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-all",
                  vocabFilter === "all" ? "bg-brand/20 text-brand-bright font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setVocabFilter("C2")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-all",
                  vocabFilter === "C2" ? "bg-emerald-500/20 text-emerald-400 font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                C2 Mastery
              </button>
              <button
                type="button"
                onClick={() => setVocabFilter("C1")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-all",
                  vocabFilter === "C1" ? "bg-cyan-500/20 text-cyan-400 font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                C1 Advanced
              </button>
              <button
                type="button"
                onClick={() => setVocabFilter("program")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-all",
                  vocabFilter === "program" ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                ⭐ From Program
              </button>
            </div>
          </div>

          {/* Interactive Cards Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredVocab.map((item, idx) => {
              const isPlaying = playingPhrase === item.phrase;
              const isCopied = copiedPhrase === item.phrase;
              return (
                <div
                  key={idx}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-surface/70 p-4 transition-all hover:border-brand/60 hover:shadow-lg"
                >
                  <div>
                    {/* Header: Phrase & Badges */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground group-hover:text-brand-bright transition-colors">
                          {item.phrase}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSpeak(item.phrase)}
                          title="Listen to pronunciation"
                          className={cn(
                            "rounded-full p-1 text-muted-foreground transition-all hover:bg-brand/20 hover:text-brand-bright",
                            isPlaying && "text-brand-bright animate-bounce"
                          )}
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            item.level === "C2"
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : item.level === "C1"
                                ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
                                : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                          )}
                        >
                          {item.level}
                        </span>
                        {item.fromProgram && (
                          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            Program
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Original Utterance Comparison */}
                    {item.originalUtterance && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="shrink-0 text-[10px] font-semibold text-rose-400">Spoken:</span>
                        <span className="truncate italic">"{item.originalUtterance}"</span>
                      </div>
                    )}

                    {/* Definition */}
                    <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                      {item.definition}
                    </p>

                    {/* Nuance / Why Examiners Value It */}
                    {item.nuanceExplanation && (
                      <div className="mt-2 rounded-lg bg-surface/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground/90">Linguistic Nuance: </span>
                        {item.nuanceExplanation}
                      </div>
                    )}

                    {/* Example in Context */}
                    <div className="mt-3 rounded-lg border border-brand/20 bg-brand/5 p-2.5">
                      <div className="text-[10px] font-bold tracking-wider text-brand-bright uppercase">
                        IELTS Band 8+ Sample Context
                      </div>
                      <p className="mt-1 text-xs italic leading-relaxed text-foreground/90">
                        "{item.exampleSentence}"
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.phrase, item.exampleSentence)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy phrase</span>
                        </>
                      )}
                    </button>

                    {onAskStella && (
                      <button
                        type="button"
                        onClick={() =>
                          onAskStella(
                            `Can you teach me how to use "${item.phrase}" (${item.level}) naturally in IELTS Speaking, and test me with a question?`
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-bright hover:underline"
                      >
                        <MessageSquareQuote className="h-3.5 w-3.5" />
                        <span>Ask Stella to drill this</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collocations and Idioms */}
          {vocabularyMastery.collocationsAndIdioms && vocabularyMastery.collocationsAndIdioms.length > 0 && (
            <div className="mt-6 rounded-xl border border-border/70 bg-surface/40 p-4">
              <div className="mb-3 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                High-Yield Topic Collocations & Idioms
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {vocabularyMastery.collocationsAndIdioms.map((colloc, k) => (
                  <div key={k} className="rounded-lg border border-border/60 bg-surface/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">{colloc.idiom}</span>
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-bright">
                        {colloc.bandLevel}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{colloc.context}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────── TAB 2: SURGICAL GRAMMAR DISSECTION ──────────────── */}
      {activeTab === "grammar" && (
        <div className="space-y-6">
          {/* Overview */}
          {grammarDissection.overview && (
            <div className="rounded-xl border border-border/70 bg-surface/50 p-4 text-sm leading-relaxed text-foreground/90">
              <span className="font-semibold text-brand-bright">Structural Diagnosis: </span>
              {grammarDissection.overview}
            </div>
          )}

          {/* Category Dissections */}
          <div className="space-y-4">
            {(grammarDissection.categories || []).map((cat, idx) => {
              const isExpanded = Boolean(expandedGrammar[idx]);
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-xl border border-border/80 bg-surface/60 transition-all"
                >
                  {/* Category Header */}
                  <button
                    type="button"
                    onClick={() => toggleGrammarCategory(idx)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface/80"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-foreground sm:text-base">
                        {cat.category}
                      </h4>
                      <p className="mt-1 text-xs text-amber-400 font-medium">
                        {cat.verdict}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <div className="border-t border-border/60 p-4 space-y-4 bg-surface/30">
                      {/* Detailed Breakdown */}
                      <p className="text-xs leading-relaxed text-foreground/85 sm:text-sm">
                        {cat.detailedBreakdown}
                      </p>

                      {/* Observed Flaws & Upgrades */}
                      {cat.observedFlaws && cat.observedFlaws.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                            Surgical Sentence Reconstruction
                          </div>
                          {cat.observedFlaws.map((flaw, fIdx) => (
                            <div
                              key={fIdx}
                              className="rounded-xl border border-border/70 bg-surface/70 p-3.5 space-y-2.5"
                            >
                              <div className="flex items-start gap-2">
                                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 shrink-0">
                                  Spoken
                                </span>
                                <span className="text-xs italic text-rose-300">
                                  "{flaw.original}"
                                </span>
                              </div>

                              <div className="text-xs text-muted-foreground leading-relaxed pl-1 border-l-2 border-warning/40">
                                <span className="font-semibold text-foreground/90">Limitation: </span>
                                {flaw.explanation}
                              </div>

                              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-400">
                                  <Sparkles className="h-3 w-3" />
                                  <span>Band 8/9 Structural Upgrade</span>
                                </div>
                                <p className="mt-1 text-xs font-medium text-emerald-300">
                                  "{flaw.upgradedVersion}"
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Advanced Patterns to Adopt */}
                      {cat.advancedPatternsToAdopt && cat.advancedPatternsToAdopt.length > 0 && (
                        <div className="rounded-lg border border-brand/20 bg-brand/5 p-3">
                          <div className="text-[11px] font-bold tracking-wider text-brand-bright uppercase">
                            Advanced Structural Patterns to Integrate
                          </div>
                          <div className="mt-2 space-y-2">
                            {cat.advancedPatternsToAdopt.map((pat, pIdx) => (
                              <div key={pIdx} className="text-xs">
                                <span className="font-semibold text-foreground">
                                  • {pat.pattern}:{" "}
                                </span>
                                <span className="italic text-muted-foreground">"{pat.example}"</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────────── TAB 3: DISCOURSE & FLUENCY ──────────────── */}
      {activeTab === "discourse" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Filler Analysis */}
            <div className="rounded-xl border border-border/70 bg-surface/50 p-4">
              <div className="mb-2 text-xs font-bold tracking-wider text-warning uppercase">
                Filler & Rhythm Audit
              </div>
              <p className="text-xs leading-relaxed text-foreground/85 sm:text-sm">
                {discourseFluencyTactics.fillerAnalysis}
              </p>
            </div>

            {/* Topic Development */}
            <div className="rounded-xl border border-border/70 bg-surface/50 p-4">
              <div className="mb-2 text-xs font-bold tracking-wider text-cyan-400 uppercase">
                Topic Progression & Depth
              </div>
              <p className="text-xs leading-relaxed text-foreground/85 sm:text-sm">
                {discourseFluencyTactics.topicDevelopment}
              </p>
            </div>

            {/* Examiner Perception */}
            <div className="rounded-xl border border-border/70 bg-surface/50 p-4">
              <div className="mb-2 text-xs font-bold tracking-wider text-emerald-400 uppercase">
                Official Examiner Impression
              </div>
              <p className="text-xs leading-relaxed text-foreground/85 sm:text-sm">
                {discourseFluencyTactics.examinerPerception}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
