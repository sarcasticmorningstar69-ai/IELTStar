"use client";

/**
 * Shared helpers for the Review views: day grouping, compact formatters,
 * part badges and mock status presentation. No fake data, no emojis.
 */
import { cn } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";
import type { MockStatus, RecordingMeta, SessionMeta, SessionType } from "@/lib/store/progress";
import { topicTitle, questionPrompt } from "@/lib/data/content";

/** Tone strings structurally compatible with StatusPill's Tone type. */
export type PillTone = "neutral" | "brand" | "success" | "warning";

// ---------------------------------------------------------------------------
// Day grouping (Today / Yesterday / short date)
// ---------------------------------------------------------------------------

function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(ts: number): string {
  const now = new Date();
  const today = dayStart(now.getTime());
  const yesterday = today - 86400000;
  const day = dayStart(ts);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const d = new Date(ts);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Group pre-sorted (newest first) items by calendar day, preserving order. */
export function groupByDay<T>(items: T[], getTs: (item: T) => number): DayGroup<T>[] {
  return items.reduce<DayGroup<T>[]>((acc, item) => {
    const ts = getTs(item);
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const last = acc.length ? acc[acc.length - 1] : null;
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      acc.push({ key, label: dayLabel(ts), items: [item] });
    }
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** "45s" / "2m 10s" / "1h 4m" — never NaN (0 → "0s"). */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "412 KB" / "3.4 MB" — for device storage usage display. */
export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** "14:02" for today, "Mar 4, 14:02" otherwise. */
export function formatStamp(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

// ---------------------------------------------------------------------------
// Session / part presentation
// ---------------------------------------------------------------------------

export function partLabel(type: SessionType): string {
  if (type === "part1") return "Part 1";
  if (type === "part2") return "Part 2";
  if (type === "part3") return "Part 3";
  return "Full Mock";
}

/** Human session title: topics joined, capped with an ellipsis after three. */
export function sessionTopics(s: SessionMeta): string {
  if (s.type === "full-mock") return "Full Speaking Mock";
  const shown = s.topicIds.slice(0, 3).map(topicTitle).join(" · ");
  return s.topicIds.length > 3 ? `${shown} · …` : shown;
}

export function PartBadge({
  type,
  className,
}: {
  type: SessionType | 1 | 2 | 3;
  className?: string;
}) {
  const isMock = type === "full-mock";
  const label = isMock
    ? "Mock"
    : typeof type === "number"
      ? `P${type}`
      : type === "part1"
        ? "P1"
        : type === "part2"
          ? "P2"
          : type === "part3"
            ? "P3"
            : "P?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase",
        isMock
          ? "border-brand-bright/45 bg-brand-soft text-brand-bright"
          : "border-border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      {isMock && <ClipboardCheck className="h-3 w-3" />}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mock status presentation
// ---------------------------------------------------------------------------

export const MOCK_STATUS_META: Record<MockStatus, { label: string; tone: PillTone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  microphone_check: { label: "Setup", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  interrupted: { label: "Interrupted", tone: "warning" },
  abandoned: { label: "Abandoned", tone: "neutral" },
  review: { label: "Reviewed", tone: "success" },
};

export const SESSION_STATUS_META: Record<
  SessionMeta["status"],
  { label: string; tone: PillTone }
> = {
  "in-progress": { label: "In progress", tone: "brand" },
  completed: { label: "Completed", tone: "success" },
  interrupted: { label: "Interrupted", tone: "warning" },
};

/** Mocks that have something to review (a full recording to replay). */
export function mockIsReviewable(status: MockStatus): boolean {
  return status === "completed" || status === "interrupted" || status === "review";
}

// ---------------------------------------------------------------------------
// Recording presentation
// ---------------------------------------------------------------------------

export interface RecordingDisplay {
  /** single-line label: "Part 2 · Topic title" */
  title: string;
  /** question prompt snippet when known, else null */
  snippet: string | null;
  /** aria-friendly full label for the audio player */
  playerTitle: string;
}

export function recordingDisplay(r: RecordingMeta): RecordingDisplay {
  const topic = r.topicId ? topicTitle(r.topicId) : null;
  const prompt = r.questionId ? questionPrompt(r.questionId).trim() : "";
  const snippet = prompt || null;
  const head = `Part ${r.part}${topic ? ` · ${topic}` : ""}`;
  return {
    title: topic ? head : r.label || head,
    snippet,
    playerTitle: snippet ? `${head} — ${snippet}` : head,
  };
}
