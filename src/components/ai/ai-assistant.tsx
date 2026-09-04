"use client";

/**
 * Stella Assistant — CSS-driven morph transitions.
 *
 * Architecture: Single always-mounted container with three content layers.
 * CSS transitions on width/height/border-radius/position handle ALL geometry
 * morphing using cubic-bezier(0.175, 0.885, 0.32, 1.275) — the CSS equivalent
 * of outBack(1.7). No scale transforms, no JavaScript animation for geometry,
 * no mount/unmount flashing. Content layers cross-fade via CSS opacity.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { animate } from "animejs";

import { useApp, viewTitle, type View } from "@/lib/store/app";
import type { AiProviderStatus, AiRequestMetadata, AiSurface } from "@/lib/ai/types";
import { type StellaState } from "@/lib/ai/stella-media";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import {
  TECHNIQUE_GROUPS,
  techniqueById,
  problemById,
  areaOfProblem,
  techniquesForArea,
  type Technique,
  VIDEOS,
  type VideoEntry,
} from "@/lib/data/content";
import {
  extractYouTubeId,
  embedUrlWithApi,
  videoById,
  videoIndex,
  mockNumber,
  describeVideo,
} from "@/components/views/video-utils";
import {
  DifficultyPill,
  TechniqueSections,
  WHY_FRAMING,
} from "@/components/views/learn/learn-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createConversation,
  loadConversation,
  saveMessageToConversation,
  listConversations,
  deleteConversation,
  getActiveConversationId,
  setActiveConversationId,
  syncConversationsFromCloud,
  getSlidingWindowContext,
  type ConversationSummary,
  type ChatMessageItem,
} from "@/lib/ai/chat-history";
import {
  Maximize2,
  Minimize2,
  Send,
  X,
  BookOpen,
  Sparkles,
  Play,
  ExternalLink,
  Video as VideoIcon,
  MessageSquare,
  History as HistoryIcon,
  Plus,
  Trash2,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

/**
 * Waiting-state copy.
 *
 * Deliberately never names the model or the gateway. Stella is the coach the
 * student talks to; which provider is behind her is server-side configuration
 * that changes, and the system prompt forbids her from naming it. Also no
 * duration promises here — nothing in the app measures how long a reply takes,
 * and a long transcript takes far longer than a one-line question.
 */
const REASONING_PHRASES = [
  "Stella is reasoning",
  "Stella is triangulating",
  "Stella is reckoning",
  "Stella is weighing the descriptors",
  "Stella is joining the dots",
  "Stella is choosing her words",
  "Stella is double-checking herself",
];

const REASONING_PHRASE_INTERVAL_MS = 1900;

function useReasoningPhrase(active: boolean): string {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % REASONING_PHRASES.length);
    }, REASONING_PHRASE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return REASONING_PHRASES[index] ?? REASONING_PHRASES[0];
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Words revealed per tick, and the gap between ticks. */
const TYPEWRITER_WORDS_PER_TICK = 2;
const TYPEWRITER_TICK_MS = 26;

/**
 * Reveals text word by word instead of dropping a wall of text in one frame.
 *
 * Only ever used for a reply that has just arrived — reopening a conversation
 * shows history instantly, because re-typing messages a student has already
 * read is a delay pretending to be a feature. Honours prefers-reduced-motion.
 */
function TypewriterText({
  text,
  animateReveal,
  onTick,
  onDone,
}: {
  text: string;
  animateReveal: boolean;
  onTick?: () => void;
  onDone?: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  // Keep trailing whitespace attached so newlines survive the join.
  const tokens = React.useMemo(() => text.match(/\S+\s*/g) ?? [], [text]);
  const shouldReveal = animateReveal && !reduced && tokens.length > 1;
  const [count, setCount] = React.useState(() => (shouldReveal ? 0 : tokens.length));

  const onTickRef = React.useRef(onTick);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onTickRef.current = onTick;
    onDoneRef.current = onDone;
  });

  React.useEffect(() => {
    if (!shouldReveal) {
      setCount(tokens.length);
      return;
    }

    setCount(0);
    let shown = 0;
    const id = window.setInterval(() => {
      shown += TYPEWRITER_WORDS_PER_TICK;
      if (shown >= tokens.length) {
        setCount(tokens.length);
        window.clearInterval(id);
        onDoneRef.current?.();
      } else {
        setCount(shown);
      }
      onTickRef.current?.();
    }, TYPEWRITER_TICK_MS);

    return () => window.clearInterval(id);
  }, [tokens, shouldReveal]);

  const isTyping = count < tokens.length;

  return (
    <p className="whitespace-pre-line">
      {tokens.slice(0, count).join("")}
      {isTyping && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] rounded-full bg-brand-bright align-middle animate-pulse"
        />
      )}
    </p>
  );
}

export function openStella(opts: { mode?: "drawer" | "full-window" } = { mode: "drawer" }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("stella:open", { detail: opts }));
  }
}

function surfaceForView(view: View): AiSurface {
  if (view.name === "session") return view.kind;
  if (view.name === "mock-run" || view.name === "mock-review") return "full-mock";
  if (view.name === "topic-wheel") return "topic-wheel";
  if (view.name === "technique") return "technique";
  if (view.name === "problem") return "problem";
  if (view.name === "recordings") return "recordings";
  if (view.name === "learn" && view.tab === "tips") return "tip";
  if (view.name === "part1" || view.name === "part2" || view.name === "part3") return view.name;
  return "general";
}

interface ChatItem {
  id: string;
  sender: "stella" | "user";
  text: string;
  timestamp: string;
}

/**
 * Rich Formatted Right-Side Study Panel for Full-Window Study Mode.
 */
function StudyContextPanel({ view, title }: { view: View; title: string }) {
  if (view.name === "technique") {
    const group = TECHNIQUE_GROUPS.find((g) => g.id === view.groupId);
    if (group) {
      const techniques = group.techniqueIds
        .map((id) => techniqueById(id))
        .filter((t): t is Technique => Boolean(t));

      return (
        <div className="space-y-6 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-brand-bright/35 bg-gradient-to-br from-brand-soft/50 via-card to-card p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-brand-bright uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              Technique • {group.category}
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {group.title}
            </h2>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground font-medium">
              {group.oneLine}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                {techniques.length} {techniques.length === 1 ? "technique" : "techniques"} in this group
              </span>
              <span className="text-xs text-muted-foreground">
                Study side-by-side with Stella on the left.
              </span>
            </div>
          </div>

          <ol className="space-y-5">
            {techniques.map((t, i) => (
              <li key={t.id}>
                <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold tabular-nums text-brand-bright">
                      {i + 1}
                    </span>
                    <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Technique {i + 1} of {techniques.length}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base sm:text-lg font-bold tracking-tight text-foreground">
                    {t.title}
                  </h3>
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <TechniqueSections sections={t.sections} />
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      );
    }
  }

  if (view.name === "problem") {
    const problem = problemById(view.problemId);
    const area = areaOfProblem(view.problemId);
    if (problem && area) {
      const framing = WHY_FRAMING[area.id] ?? WHY_FRAMING.area1;
      const techGroups = techniquesForArea(area.id);
      return (
        <div className="space-y-5 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
            <div className="text-[10px] font-bold tracking-wider text-brand-bright uppercase">
              Problem &amp; Solutions • {area.name}
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {problem.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DifficultyPill difficulty={problem.difficulty} />
              <span className="text-xs text-muted-foreground">
                Detailed problem {problem.num} of 36
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2.5">
            <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              What you may notice
            </div>
            <div className="rounded-xl border border-brand-bright/25 bg-brand-soft p-4 text-xs sm:text-sm leading-relaxed">
              {problem.note}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2.5">
            <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Why it happens
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-foreground/90">
              {framing}
            </p>
          </div>

          {techGroups.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
              <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Recommended Techniques to Practice
              </div>
              <div className="space-y-2">
                {techGroups.map((g) => (
                  <div key={g.id} className="rounded-xl border border-border bg-surface p-3.5 text-xs">
                    <div className="font-semibold text-foreground">{g.title}</div>
                    <div className="text-muted-foreground mt-0.5">{g.oneLine}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  if (view.name === "topic-wheel") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-brand-bright uppercase">
          <BookOpen className="h-3.5 w-3.5" /> Topic Wheel Speaking Drill
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Spontaneous Speaking Practice</h2>
        <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
          Use the Topic Wheel to simulate spontaneous IELTS speaking questions. Ask Stella on the left to brainstorm ideas, suggest Band 8 collocations, or structure your outline!
        </p>
        <div className="rounded-xl border border-brand-bright/25 bg-brand-soft p-4 text-xs leading-relaxed space-y-2">
          <div className="font-semibold text-brand-bright uppercase tracking-wider text-[10px]">
            Key Examiner Tips:
          </div>
          <div>• <strong>Direct Answer First:</strong> Answer the actual question immediately before providing context.</div>
          <div>• <strong>A.R.E. Structure:</strong> Answer → Reason → Example / Contrast.</div>
          <div>• <strong>Natural Cadence:</strong> Maintain steady flow rather than rushing into pauses.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-brand-bright uppercase mb-2">
        <BookOpen className="h-3.5 w-3.5" /> Study Context &amp; Material
      </div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">
        Review your study materials here and chat side-by-side with Stella on the left to get instant coaching, model answers, and drills.
      </p>
    </div>
  );
}

function YouTubeMockPlayerPanel({
  videoId,
  onSelectVideo,
  onPractice,
}: {
  videoId: string;
  onSelectVideo: (id: string) => void;
  onPractice?: (id: string) => void;
}) {
  const video = videoById(videoId) || VIDEOS[0];
  const index = video ? videoIndex(video.id) : 0;
  const num = mockNumber(index);
  const ytId = video ? extractYouTubeId(video.url) : null;
  const desc = video ? describeVideo(video.label) : "";

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-4 max-w-3xl mx-auto w-full">
      {/* Top Header / Video Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border shrink-0">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider text-brand-bright uppercase">
            <VideoIcon className="h-3.5 w-3.5" /> Speaking Mock Video Analysis
          </div>
          <h2 className="text-base sm:text-lg font-bold text-foreground mt-0.5">
            {num} • {video.label}
          </h2>
        </div>

        {/* Video selector dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="mock-select" className="sr-only">Select Mock</label>
          <select
            id="mock-select"
            value={video.id}
            onChange={(e) => onSelectVideo(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:border-brand-bright cursor-pointer"
          >
            {VIDEOS.map((v, i) => (
              <option key={v.id} value={v.id}>
                {mockNumber(i)} — {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 16:9 Responsive Video Player */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black shadow-xl shrink-0">
        {ytId ? (
          <iframe
            key={ytId}
            src={embedUrlWithApi(ytId)}
            title={`${num} — ${video.label}`}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Video unavailable
          </div>
        )}
      </div>

      {/* Mock Description & Actions */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-brand-bright/40 bg-brand-soft/70 px-2.5 py-0.5 text-xs font-semibold text-brand-bright">
              {video.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Candidate Mock #{index + 1} of 30
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onPractice && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPractice(video.id)}
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                <Play className="h-3 w-3 text-brand-bright" />
                <span>Practice Alongside</span>
              </Button>
            )}
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              <span>YouTube</span>
            </a>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {desc} Watch how the candidate handles Part 1 familiar questions, constructs their Part 2 cue card turn, and navigates abstract Part 3 questions.
        </p>
      </div>

      {/* Examiner Rubric Observation Points */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          Key Examiner Observation Points
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
            <div className="font-semibold text-foreground">Fluency &amp; Coherence</div>
            <p className="text-muted-foreground text-[11px]">Notice pauses: are they searching for words or forming complex ideas?</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
            <div className="font-semibold text-foreground">Lexical Resource</div>
            <p className="text-muted-foreground text-[11px]">Listen for topic-specific idioms and natural collocations vs memorized lists.</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
            <div className="font-semibold text-foreground">Grammatical Range</div>
            <p className="text-muted-foreground text-[11px]">Check sentence structure variety: conditionals, concession, and relative clauses.</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
            <div className="font-semibold text-foreground">Pronunciation &amp; Pitch</div>
            <p className="text-muted-foreground text-[11px]">Observe syllable stress, thought-group chunking, and communicative intonation.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StellaHistoryPanelProps {
  historyList: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onStartNewChat: () => void;
  onCloseHistory: () => void;
  onOpenPrivacyNotice: () => void;
}

function StellaHistoryPanel({
  historyList,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onStartNewChat,
  onCloseHistory,
  onOpenPrivacyNotice,
}: StellaHistoryPanelProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-card animate-in fade-in duration-150 h-full overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface/40 shrink-0">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-brand-bright" />
          <span className="text-xs font-semibold text-foreground">Coaching History</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-bright">
            {historyList.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCloseHistory}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
        >
          <MessageSquare className="h-3 w-3" />
          <span>Back to Chat</span>
        </Button>
      </div>

      {/* New Thread CTA */}
      <div className="p-3 border-b border-border bg-card shrink-0">
        <button
          type="button"
          onClick={onStartNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-bright/40 bg-brand-soft py-2 px-3 text-xs font-semibold text-brand-bright transition-all hover:bg-brand-soft/80 shadow-xs cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Start New Coaching Thread</span>
        </button>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin text-xs bg-card">
        {historyList.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <HistoryIcon className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium">No previous coaching sessions.</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-xs mx-auto">
              Conversations you have with Stella across speaking mocks and cue cards will appear here.
            </p>
          </div>
        ) : (
          historyList.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center justify-between gap-2.5 rounded-xl p-3 transition-colors cursor-pointer border text-left",
                  isActive
                    ? "border-brand-bright/40 bg-brand-soft/50 text-foreground shadow-xs"
                    : "border-transparent hover:border-border hover:bg-surface text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs truncate">
                    {conv.scopeKey.startsWith("video:") ? (
                      <VideoIcon className="h-3 w-3 text-brand-bright shrink-0" />
                    ) : (
                      <MessageSquare className="h-3 w-3 text-brand-bright shrink-0" />
                    )}
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <p className="text-[11px] truncate opacity-70 mt-0.5">{conv.lastMessageSnippet}</p>
                  <div className="text-[10px] opacity-50 mt-1 flex items-center gap-2">
                    <span>{formatRelativeTime(conv.updatedAt)}</span>
                    <span>•</span>
                    <span>{conv.messageCount} messages</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity cursor-pointer shrink-0"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 bg-surface/50 text-[11px] space-y-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>Local-first • Synced across devices with Supabase</span>
        </div>
        <button
          type="button"
          onClick={onOpenPrivacyNotice}
          className="flex items-center gap-1 text-brand-bright hover:underline text-[11px] cursor-pointer"
        >
          <ShieldCheck className="h-3 w-3" />
          <span>AI Data Transparency &amp; Privacy Notice</span>
        </button>
      </div>
    </div>
  );
}

export function AiAssistant() {
  const [mounted, setMounted] = React.useState(false);
  const view = useApp((s) => s.view);
  const navigate = useApp((s) => s.navigate);
  const [stellaMode, setStellaMode] = React.useState<"closed" | "drawer" | "full-window">("closed");
  const [question, setQuestion] = React.useState("");
  const [, setStatus] = React.useState<AiProviderStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [stellaState, setStellaState] = React.useState<StellaState>("idle");
  const [messages, setMessages] = React.useState<ChatItem[]>([]);
  /** Id of the one message currently allowed to reveal itself word by word. */
  const [revealMessageId, setRevealMessageId] = React.useState<string | null>(null);
  const { user, session, authModalOpen, openAuthModal } = useAuth();
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isPrivacyNoticeOpen, setIsPrivacyNoticeOpen] = React.useState(false);
  const [activeConversationId, setActiveConversationIdState] = React.useState<string | null>(null);
  const [historyList, setHistoryList] = React.useState<ConversationSummary[]>([]);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const drawerChatScrollRef = React.useRef<HTMLDivElement>(null);

  const reasoningPhrase = useReasoningPhrase(loading);

  // YouTube mock detection & selected video state
  const isVideoMock = view.name === "video" || view.name === "videos";
  const [selectedVideoId, setSelectedVideoId] = React.useState<string>(() => {
    if (view.name === "video") return view.videoId;
    return "v1";
  });

  React.useEffect(() => {
    if (view.name === "video") {
      setSelectedVideoId(view.videoId);
    }
  }, [view]);

  const scrollChatsToBottom = React.useCallback((smooth = true) => {
    const containers = [chatScrollRef.current, drawerChatScrollRef.current];
    for (const el of containers) {
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
      }
    }
  }, []);

  // Auto-scroll chat containers to latest message or reasoning state
  React.useEffect(() => {
    scrollChatsToBottom();
  }, [messages, loading, scrollChatsToBottom]);

  // Mobile segmented tab for full-window mode ("left" vs "right")
  const [mobileFullTab, setMobileFullTab] = React.useState<"left" | "right">("left");

  // Animation element refs
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const fullWindowRef = React.useRef<HTMLDivElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const prevModeRef = React.useRef<"closed" | "drawer" | "full-window">("closed");

  const surface = surfaceForView(view);
  const title = viewTitle(view);

  // Derived booleans
  const isOpen = stellaMode !== "closed";

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Anime.js GPU Compositor 60fps Animations (outBack 1.7)
  React.useEffect(() => {
    if (!mounted) return;
    const prev = prevModeRef.current;
    const curr = stellaMode;
    prevModeRef.current = curr;

    if (prev === "closed" && curr === "drawer") {
      // 1. Button dissolves & scales slightly
      if (buttonRef.current) {
        animate(buttonRef.current, {
          scale: [1, 1.08],
          opacity: [1, 0],
          duration: 140,
          ease: "outQuad",
        });
      }
      // 2. Backdrop fades in
      if (backdropRef.current) {
        animate(backdropRef.current, {
          opacity: [0, 1],
          duration: 300,
          ease: "outQuad",
        });
      }
      // 3. Drawer blooms outward from bottom-right with Anime.js outBack(1.7)
      if (drawerRef.current) {
        animate(drawerRef.current, {
          scale: [0.82, 1],
          opacity: [0, 1],
          duration: 380,
          ease: "outBack(1.7)",
        });
      }
    } else if (curr === "closed") {
      if (drawerRef.current && prev === "drawer") {
        animate(drawerRef.current, {
          scale: [1, 0.84],
          opacity: [1, 0],
          duration: 220,
          ease: "inQuad",
        });
      }
      if (fullWindowRef.current && prev === "full-window") {
        animate(fullWindowRef.current, {
          scale: [1, 0.95],
          opacity: [1, 0],
          duration: 220,
          ease: "inQuad",
        });
      }
      if (backdropRef.current) {
        animate(backdropRef.current, {
          opacity: [1, 0],
          duration: 220,
          ease: "outQuad",
        });
      }
      if (buttonRef.current) {
        animate(buttonRef.current, {
          scale: [0.84, 1],
          opacity: [0, 1],
          duration: 320,
          ease: "outBack(1.7)",
        });
      }
    } else if (curr === "full-window") {
      if (drawerRef.current) {
        animate(drawerRef.current, {
          scale: [1, 1.04],
          opacity: [1, 0],
          duration: 180,
          ease: "outQuad",
        });
      }
      if (fullWindowRef.current) {
        animate(fullWindowRef.current, {
          scale: [0.96, 1],
          opacity: [0, 1],
          duration: 320,
          ease: "outBack(1.2)",
        });
      }
    } else if (prev === "full-window" && curr === "drawer") {
      if (fullWindowRef.current) {
        animate(fullWindowRef.current, {
          scale: [1, 0.96],
          opacity: [1, 0],
          duration: 200,
          ease: "inQuad",
        });
      }
      if (drawerRef.current) {
        animate(drawerRef.current, {
          scale: [0.94, 1],
          opacity: [0, 1],
          duration: 320,
          ease: "outBack(1.7)",
        });
      }
    }
  }, [stellaMode, mounted]);

  const scopeKey = isVideoMock ? `video:${selectedVideoId}` : surface;

  // Sync down conversations when user logs in with Google
  React.useEffect(() => {
    if (user?.id) {
      void syncConversationsFromCloud(user.id).then(() => {
        setHistoryList(listConversations());
      });
    }
  }, [user?.id]);

  // Refresh history list whenever history panel opens
  React.useEffect(() => {
    if (isHistoryOpen) {
      setHistoryList(listConversations());
    }
  }, [isHistoryOpen]);

  // Load or initialize active conversation for the current view / mock
  React.useEffect(() => {
    const existingId = getActiveConversationId(scopeKey);
    if (existingId) {
      const session = loadConversation(existingId);
      if (session && session.messages.length > 0) {
        setActiveConversationIdState(existingId);
        setMessages(session.messages);
        // Already-read history appears at once; only new replies animate.
        setRevealMessageId(null);
        return;
      }
    }

    const greetingText = isVideoMock
      ? `Hello! I'm watching IELTS Speaking Mock #${videoIndex(selectedVideoId) + 1} with you.\n\nAsk me to evaluate candidate fluency, identify grammar slips, suggest Band 9 rephrasings, or drill Part 3 follow-ups!`
      : `Hello! I'm studying "${title}" with you.\n\nAsk me any questions about this material, request model phrasing, or ask for a practice drill!`;

    const convTitle = isVideoMock
      ? `Mock #${videoIndex(selectedVideoId) + 1} Coaching`
      : `${title} Coaching`;

    const initialSession = createConversation(scopeKey, convTitle);
    const initialGreeting: ChatMessageItem = {
      id: `intro-${Date.now()}`,
      sender: "stella",
      text: greetingText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    saveMessageToConversation(initialSession.id, initialGreeting, user?.id);
    setActiveConversationIdState(initialSession.id);
    setMessages([initialGreeting]);
    setRevealMessageId(initialGreeting.id);
  }, [scopeKey, selectedVideoId, title, isVideoMock, user?.id]);

  const handleStartNewChat = () => {
    const greetingText = isVideoMock
      ? `Starting a new coaching thread for Mock #${videoIndex(selectedVideoId) + 1}.\n\nWhat specific part of this candidate's performance should we focus on?`
      : `Starting a new coaching thread for "${title}".\n\nWhat would you like to explore or drill today?`;

    const convTitle = isVideoMock
      ? `Mock #${videoIndex(selectedVideoId) + 1} Session`
      : `${title} Session`;

    const newSession = createConversation(scopeKey, convTitle);
    const greetingMsg: ChatMessageItem = {
      id: `intro-${Date.now()}`,
      sender: "stella",
      text: greetingText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    saveMessageToConversation(newSession.id, greetingMsg, user?.id);
    setActiveConversationIdState(newSession.id);
    setMessages([greetingMsg]);
    setRevealMessageId(greetingMsg.id);
    setIsHistoryOpen(false);
    setHistoryList(listConversations());
  };

  const handleSelectConversation = (convId: string) => {
    const session = loadConversation(convId);
    if (session) {
      setActiveConversationId(session.scopeKey, convId);
      setActiveConversationIdState(convId);
      setMessages(session.messages);
      setRevealMessageId(null);
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteConversation = (convId: string) => {
    deleteConversation(convId, user?.id);
    const updated = listConversations();
    setHistoryList(updated);
    if (activeConversationId === convId) {
      handleStartNewChat();
    }
  };

  const openDrawer = () => {
    setStellaMode("drawer");
  };

  const close = () => {
    setStellaMode("closed");
    setIsHistoryOpen(false);
  };

  React.useEffect(() => {
    const handler = (e: CustomEvent<{ mode?: "drawer" | "full-window" }>) => {
      const m = e.detail?.mode || "drawer";
      setStellaMode(m);
    };
    window.addEventListener("stella:open" as any, handler);
    return () => window.removeEventListener("stella:open" as any, handler);
  }, []);

  const submitQuestion = async (customText?: string) => {
    if (!user) {
      openAuthModal("signup");
      return;
    }
    const q = (customText || question).trim();
    if (!q || loading) return;

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    let convId = activeConversationId;
    if (!convId) {
      const newConv = createConversation(scopeKey, isVideoMock ? `Mock #${videoIndex(selectedVideoId) + 1}` : title);
      convId = newConv.id;
      setActiveConversationIdState(convId);
    }
    saveMessageToConversation(convId, userMsg, user?.id);

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setQuestion("");
    setLoading(true);
    setStellaState("thinking");

    try {
      const metadata: AiRequestMetadata = {
        mode: "context-chat",
        surface,
        pageTitle: title,
        pageContext: title,
        question: q,
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "chat",
          text: q,
          question: q,
          pageTitle: title,
          metadata,
          recentMessages: getSlidingWindowContext(messages, 6),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errorMsg =
          (typeof errorData?.message === "string" && errorData.message.trim()) ||
          `Stella was unable to respond (status ${res.status}). Please try again.`;
        throw new Error(errorMsg);
      }
      const data = await res.json();

      /*
       * No canned fallback here. If the provider returns nothing usable, the
       * student must see a failure, not invented coaching they might act on.
       */
      const reply: string = [data?.reply, data?.answer, data?.message]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .find((value) => value.length > 0) ?? "";

      if (!reply) {
        throw new Error("Stella's reply came back empty. Please ask again.");
      }

      const stellaMsg: ChatMessageItem = {
        id: `stella-${Date.now()}`,
        sender: "stella",
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, stellaMsg]);
      setRevealMessageId(stellaMsg.id);
      saveMessageToConversation(convId, stellaMsg, user?.id);
      setHistoryList(listConversations());
    } catch (err: unknown) {
      const displayError =
        err instanceof Error && err.message
          ? err.message
          : "Stella couldn't answer just now. Please try again.";
      const fallbackMsg: ChatMessageItem = {
        id: `stella-err-${Date.now()}`,
        sender: "stella",
        text: displayError,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      setRevealMessageId(null);
      saveMessageToConversation(convId, fallbackMsg, user?.id);
    } finally {
      setLoading(false);
      setStellaState("idle");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      {/* ── BACKDROP OVERLAY ── */}
      <div
        ref={backdropRef}
        className="stella-backdrop-overlay"
        style={{
          opacity: stellaMode === "drawer" ? 1 : 0,
          pointerEvents: stellaMode === "drawer" ? "auto" : "none",
        }}
        onClick={close}
      />

      {/* ── FLOATING PILL BUTTON ── */}
      {!authModalOpen && (
        <button
          ref={buttonRef}
          type="button"
          className="stella-pill-btn"
          style={{
            opacity: stellaMode === "closed" ? 1 : 0,
            pointerEvents: stellaMode === "closed" ? "auto" : "none",
            transform: stellaMode === "closed" ? "scale(1)" : "scale(0.84)",
          }}
          onClick={() => {
            if (!user) {
              openAuthModal("signup");
              return;
            }
            openDrawer();
          }}
          aria-label="Ask Stella about this page"
        >
          <StellaAvatar state="idle" size={32} frame={false} quiet />
          <span className="text-sm font-semibold tracking-wide whitespace-nowrap">Ask Stella</span>
        </button>
      )}

      {/* ── CORNER DRAWER CARD ── */}
      <div
        ref={drawerRef}
        className="stella-drawer-card"
        style={{
          opacity: stellaMode === "drawer" ? 1 : 0,
          pointerEvents: stellaMode === "drawer" ? "auto" : "none",
          transform: stellaMode === "drawer" ? "scale(1)" : "scale(0.82)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Stella Assistant"
      >
        {/* Header */}
        <header className="shrink-0 flex items-start justify-between gap-4 border-b border-border px-5 py-4 bg-card">
          <div className="flex min-w-0 items-center gap-3">
            <StellaAvatar state={stellaState} size={44} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Stella</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                Looking at: {title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer",
                isHistoryOpen
                  ? "bg-brand-soft text-brand-bright"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title="Coaching History"
              aria-label="Coaching History"
            >
              <HistoryIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setStellaMode("full-window")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              title="Expand to Full Window"
              aria-label="Expand to Full Window"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={close}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {isHistoryOpen ? (
          <StellaHistoryPanel
            historyList={historyList}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            onStartNewChat={handleStartNewChat}
            onCloseHistory={() => setIsHistoryOpen(false)}
            onOpenPrivacyNotice={() => setIsPrivacyNoticeOpen(true)}
          />
        ) : !user ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center bg-card">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft border border-brand-bright/20 shadow-inner">
              <StellaAvatar state="idle" size={32} frame={false} quiet />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Sign In to Ask Stella</h3>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed max-w-xs">
              Stella provides real-time IELTS feedback, Band 8+ vocabulary alternatives, and grammar drills. Create a free account or sign in to start chatting.
            </p>
            <Button
              size="sm"
              className="mt-4 w-full font-medium"
              onClick={() => {
                close();
                openAuthModal("signup");
              }}
            >
              Sign In / Create Account
            </Button>
          </div>
        ) : (
          <>
            {/* Chat Stream */}
            <div
              ref={drawerChatScrollRef}
              className="scrollbar-thin flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 text-xs bg-card"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-xl p-3 leading-relaxed",
                    m.sender === "stella"
                      ? "border border-border bg-surface text-foreground"
                      : "bg-primary text-primary-foreground ml-6"
                  )}
                >
                  {m.sender === "stella" ? (
                    <TypewriterText
                      text={m.text}
                      animateReveal={m.id === revealMessageId}
                      onTick={() => scrollChatsToBottom(false)}
                    />
                  ) : (
                    <p className="whitespace-pre-line">{m.text}</p>
                  )}
                  <div className="mt-1 text-[10px] opacity-60 text-right">{m.timestamp}</div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2 items-start p-1">
                  <div className="mt-0.5 shrink-0">
                    <StellaAvatar state="thinking" size={20} frame={false} />
                  </div>
                  <div className="rounded-xl border border-brand-bright/25 bg-brand-soft/40 px-3 py-2 text-[11px] text-foreground/90">
                    <div className="font-semibold text-brand-bright flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-bright animate-ping" />
                      <span>{reasoningPhrase}…</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Working from the official IELTS band descriptors.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pinned Input Footer */}
            <div className="shrink-0 border-t border-border bg-card p-3 sm:p-4 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {["Explain this simply", "Give me an example", "Turn this into a drill"].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitQuestion(prompt)}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-brand-bright/40 hover:text-foreground cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitQuestion();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={loading ? `${reasoningPhrase}…` : "Ask Stella about this page..."}
                  disabled={loading}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-brand-bright disabled:opacity-60"
                />
                <Button type="submit" size="sm" disabled={loading || !question.trim()} className="h-8 px-3 cursor-pointer">
                  {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── FULL-WINDOW STUDY MODAL ── */}
      <div
        ref={fullWindowRef}
        className="stella-full-modal"
        style={{
          opacity: stellaMode === "full-window" ? 1 : 0,
          pointerEvents: stellaMode === "full-window" ? "auto" : "none",
          transform: stellaMode === "full-window" ? "scale(1)" : "scale(0.96)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Stella Full-Window Study"
      >
        {/* Full-Window Header */}
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <StellaAvatar state={stellaState} size={40} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold tracking-tight">
                  {isVideoMock ? "YouTube Speaking Mock Analysis" : "Stella Full-Window Study"}
                </p>
                <span className="rounded-full border border-brand-bright/40 bg-brand-soft/60 px-2 py-0.5 text-[10px] font-medium text-brand-bright inline-flex items-center gap-1">
                  {isVideoMock ? <VideoIcon className="h-2.5 w-2.5" /> : <Maximize2 className="h-2.5 w-2.5" />}
                  {isVideoMock ? "Video Mock" : "Full Window"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-md">
                {isVideoMock
                  ? `${mockNumber(videoIndex(selectedVideoId))} — ${videoById(selectedVideoId)?.label || "Supplied Mock"}`
                  : `Studying: ${title}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsHistoryOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    if (isVideoMock) setMobileFullTab("right");
                    else setMobileFullTab("left");
                  }
                  return next;
                });
              }}
              className={cn(
                "gap-1.5 text-xs transition-colors cursor-pointer",
                isHistoryOpen
                  ? "bg-brand-soft text-brand-bright font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Coaching History"
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isHistoryOpen ? "Close History" : "History"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStellaMode("drawer")}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              title="Switch to Corner Drawer"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Corner Drawer</span>
            </Button>
            <button
              type="button"
              onClick={close}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Tab Switcher (Visible on mobile/tablet screens < lg) */}
        <div className="flex shrink-0 items-center border-b border-border bg-card px-4 py-2 lg:hidden">
          <div className="grid w-full grid-cols-2 rounded-xl bg-surface p-1 border border-border">
            <button
              type="button"
              onClick={() => setMobileFullTab("left")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                mobileFullTab === "left"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isVideoMock ? (
                <>
                  <VideoIcon className="h-3.5 w-3.5 text-brand-bright" />
                  <span>Video Player</span>
                </>
              ) : (
                <>
                  <MessageSquare className="h-3.5 w-3.5 text-brand-bright" />
                  <span>{isHistoryOpen ? "History" : "Stella Chat"}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileFullTab("right")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                mobileFullTab === "right"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isVideoMock ? (
                <>
                  <MessageSquare className="h-3.5 w-3.5 text-brand-bright" />
                  <span>{isHistoryOpen ? "History" : "Stella Chat"}</span>
                </>
              ) : (
                <>
                  <BookOpen className="h-3.5 w-3.5 text-brand-bright" />
                  <span>Study Material</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2-Column Split: On YouTube mocks, LEFT is Video and RIGHT is Chat. On other views, LEFT is Chat and RIGHT is Study Context */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-2 overflow-hidden" style={{ height: "calc(100% - 60px)" }}>
          {/* COLUMN 1: Video Player (for YouTube mocks) OR Chat (for regular views) */}
          <section
            className={cn(
              "flex-col h-full overflow-hidden border-border bg-card/20 lg:border-r",
              mobileFullTab === "left" ? "flex" : "hidden lg:flex"
            )}
          >
            {isVideoMock ? (
              <YouTubeMockPlayerPanel
                videoId={selectedVideoId}
                onSelectVideo={setSelectedVideoId}
                onPractice={(id) => {
                  setStellaMode("closed");
                  navigate({ name: "video", videoId: id });
                }}
              />
            ) : isHistoryOpen ? (
              <StellaHistoryPanel
                historyList={historyList}
                activeConversationId={activeConversationId}
                onSelectConversation={handleSelectConversation}
                onDeleteConversation={handleDeleteConversation}
                onStartNewChat={handleStartNewChat}
                onCloseHistory={() => setIsHistoryOpen(false)}
                onOpenPrivacyNotice={() => setIsPrivacyNoticeOpen(true)}
              />
            ) : !user ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-card">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-bright/20 shadow-inner">
                  <StellaAvatar state="idle" size={40} frame={false} quiet />
                </div>
                <h3 className="text-base font-bold text-foreground">Sign In to Practice with Stella</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-sm">
                  Stella provides real-time IELTS feedback, Band 8+ vocabulary alternatives, and grammar drills. Create a free account or sign in to start chatting.
                </p>
                <Button
                  size="default"
                  className="mt-5 font-semibold shadow-sm"
                  onClick={() => {
                    close();
                    openAuthModal("signup");
                  }}
                >
                  Sign In / Create Account
                </Button>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                {/* Chat Stream */}
                <div
                  ref={chatScrollRef}
                  className="scrollbar-thin flex-1 min-h-0 space-y-3.5 overflow-y-auto px-4 py-4 sm:px-6 text-xs sm:text-sm"
                >
                  {messages.map((msg) => {
                    const isStella = msg.sender === "stella";
                    return (
                      <div
                        key={msg.id}
                        className={cn("flex gap-2.5", isStella ? "items-start" : "justify-end")}
                      >
                        {isStella && (
                          <div className="mt-0.5 shrink-0">
                            <StellaAvatar state="idle" size={30} frame={false} />
                          </div>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed text-xs sm:text-sm shadow-sm",
                            isStella
                              ? "border border-border bg-card text-foreground"
                              : "bg-primary text-primary-foreground"
                          )}
                        >
                          {isStella ? (
                            <TypewriterText
                              text={msg.text}
                              animateReveal={msg.id === revealMessageId}
                              onTick={() => scrollChatsToBottom(false)}
                            />
                          ) : (
                            <p className="whitespace-pre-line">{msg.text}</p>
                          )}
                          <div className="mt-1.5 text-[10px] opacity-60 text-right">{msg.timestamp}</div>
                        </div>
                      </div>
                    );
                  })}
                  {loading && (
                    <div className="flex gap-2.5 items-start">
                      <div className="mt-0.5 shrink-0">
                        <StellaAvatar state="thinking" size={26} frame={false} />
                      </div>
                      <div className="rounded-2xl border border-brand-bright/30 bg-brand-soft/40 px-4 py-3 text-xs shadow-xs text-foreground/90 space-y-1">
                        <div className="flex items-center gap-2 font-medium text-brand-bright">
                          <span className="inline-block h-2 w-2 rounded-full bg-brand-bright animate-ping" />
                          <span>{reasoningPhrase}…</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Working through the official IELTS band descriptors.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pinned Input */}
                <div className="shrink-0 border-t border-border p-3.5 sm:p-4 space-y-2 bg-card">
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => submitQuestion("Explain this simply with a clear rule")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      ✨ Explain Simply
                    </button>
                    <button type="button" onClick={() => submitQuestion("Give me a Band 8 example applying this")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      💡 Band 8 Example
                    </button>
                    <button type="button" onClick={() => submitQuestion("Turn this into a 2-minute speaking drill")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      🎯 Turn into Drill
                    </button>
                    <button type="button" onClick={() => submitQuestion("What are the common student mistakes with this?")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      ⚠️ Common Mistakes
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitQuestion();
                    }}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm focus-within:border-brand-bright"
                  >
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={loading ? `${reasoningPhrase}…` : `Ask Stella about ${title}...`}
                      disabled={loading}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                    />
                    <Button type="submit" size="sm" disabled={loading || !question.trim()} className="gap-1.5 h-9 px-4 cursor-pointer">
                      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      <span>{loading ? "Reasoning..." : "Send"}</span>
                    </Button>
                  </form>
                </div>
              </div>
            )}
          </section>

          {/* COLUMN 2: Chat (for YouTube mocks) OR Study Context (for regular views) */}
          <section
            className={cn(
              "flex-col h-full overflow-hidden bg-card/10",
              mobileFullTab === "right" ? "flex" : "hidden lg:flex"
            )}
          >
            {isVideoMock ? (
              isHistoryOpen ? (
                <StellaHistoryPanel
                  historyList={historyList}
                  activeConversationId={activeConversationId}
                  onSelectConversation={handleSelectConversation}
                  onDeleteConversation={handleDeleteConversation}
                  onStartNewChat={handleStartNewChat}
                  onCloseHistory={() => setIsHistoryOpen(false)}
                  onOpenPrivacyNotice={() => setIsPrivacyNoticeOpen(true)}
                />
              ) : !user ? (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-card">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-bright/20 shadow-inner">
                    <StellaAvatar state="idle" size={40} frame={false} quiet />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Sign In to Practice with Stella</h3>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-sm">
                    Stella evaluates YouTube mock candidate answers, highlights grammatical errors, and provides Band 9 model answers. Create a free account to unlock this coaching.
                  </p>
                  <Button
                    size="default"
                    className="mt-5 font-semibold shadow-sm"
                    onClick={() => {
                      close();
                      openAuthModal("signup");
                    }}
                  >
                    Sign In / Create Account
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col h-full overflow-hidden">
                {/* Chat Stream with Candidate Feedback */}
                <div
                  ref={chatScrollRef}
                  className="scrollbar-thin flex-1 min-h-0 space-y-3.5 overflow-y-auto px-4 py-4 sm:px-6 text-xs sm:text-sm"
                >
                  <div className="rounded-xl border border-brand-bright/20 bg-brand-soft/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-brand-bright flex items-center gap-1.5 mb-1">
                      <Sparkles className="h-3.5 w-3.5" /> Video Mock Study Coach
                    </p>
                    Ask Stella to evaluate this candidate, critique their pronunciation, or contrast their answers with Band 9 model phrases.
                  </div>

                  {messages.map((msg) => {
                    const isStella = msg.sender === "stella";
                    return (
                      <div
                        key={msg.id}
                        className={cn("flex gap-2.5", isStella ? "items-start" : "justify-end")}
                      >
                        {isStella && (
                          <div className="mt-0.5 shrink-0">
                            <StellaAvatar state="idle" size={30} frame={false} />
                          </div>
                        )}
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed text-xs sm:text-sm shadow-sm",
                            isStella
                              ? "border border-border bg-card text-foreground"
                              : "bg-primary text-primary-foreground"
                          )}
                        >
                          {isStella ? (
                            <TypewriterText
                              text={msg.text}
                              animateReveal={msg.id === revealMessageId}
                              onTick={() => scrollChatsToBottom(false)}
                            />
                          ) : (
                            <p className="whitespace-pre-line">{msg.text}</p>
                          )}
                          <div className="mt-1.5 text-[10px] opacity-60 text-right">{msg.timestamp}</div>
                        </div>
                      </div>
                    );
                  })}
                  {loading && (
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground p-2">
                      <StellaAvatar state="thinking" size={26} frame={false} />
                      <span>{reasoningPhrase}…</span>
                    </div>
                  )}
                </div>

                {/* Pinned Input with YouTube Mock Prompts */}
                <div className="shrink-0 border-t border-border p-3.5 sm:p-4 space-y-2 bg-card">
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => submitQuestion("Score this candidate's Fluency & Coherence with reasons")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      ✨ Score Fluency
                    </button>
                    <button type="button" onClick={() => submitQuestion("Point out the grammatical errors made in Part 2")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      ⚠️ Grammar Errors
                    </button>
                    <button type="button" onClick={() => submitQuestion("Give me a Band 9 rephrase of the candidate's Part 2 story")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      💡 Band 9 Rephrase
                    </button>
                    <button type="button" onClick={() => submitQuestion("Give me an examiner drill based on the Part 3 questions here")} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground hover:bg-brand-soft cursor-pointer">
                      🎯 Part 3 Drill
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitQuestion();
                    }}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm focus-within:border-brand-bright"
                  >
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={
                        loading
                          ? `${reasoningPhrase}…`
                          : `Ask Stella about ${videoById(selectedVideoId)?.label || "this candidate"}...`
                      }
                      disabled={loading}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                    />
                    <Button type="submit" size="sm" disabled={loading || !question.trim()} className="gap-1.5 h-9 px-4 cursor-pointer">
                      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      <span>Send</span>
                    </Button>
                  </form>
                </div>
              </div>
            )) : (
              <div className="flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-5">
                <StudyContextPanel view={view} title={title} />
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── CORPORATE AI PRIVACY & DATA TRANSPARENCY MODAL ── */}
      {isPrivacyNoticeOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsPrivacyNoticeOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-notice-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-bright">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="privacy-notice-title" className="text-base font-bold text-foreground">
                    AI Data Transparency &amp; Privacy Notice
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    IELTStar Speaking Practice Safety &amp; Governance
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivacyNoticeOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">How your practice is processed:</strong> When you submit a recording, it is sent to a speech-recognition service to be turned into text. That transcript, together with the question you were answering, is then sent to an AI model that produces your band feedback. Your email, password and account details are never included.
              </p>
              <p>
                <strong className="text-foreground">Training:</strong> We deliberately do not use the cheaper model tiers that providers offer in exchange for using your prompts to improve their own products. If that ever changes, this notice changes first.
              </p>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
                <strong>Important Privacy Notice:</strong> For your personal data security, please refrain from sharing sensitive personally identifiable information (such as credit cards, government identification numbers, passwords, or confidential employment secrets) during spoken or text practice sessions.
              </div>
              <p>
                Your account, recordings and feedback live in our Supabase Postgres database with row-level security enabled, so one student can never read another student&apos;s data.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                onClick={() => setIsPrivacyNoticeOpen(false)}
                className="rounded-xl px-5 text-xs font-semibold cursor-pointer"
              >
                Understood
              </Button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
