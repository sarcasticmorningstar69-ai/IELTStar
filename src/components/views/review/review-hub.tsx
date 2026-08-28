"use client";

/**
 * Review hub — "Look back at your practice."
 * Recent sessions grouped by day with expandable playback, quick links to
 * the other review surfaces, and recent full mocks. All data is real.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type RecordingMeta, type SessionMeta, type MockMeta } from "@/lib/store/progress";
import { PageHeader, SectionCard, EmptyState, StatusPill } from "@/components/shared/page-kit";
import { AudioPlayer } from "@/components/audio/audio-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mic, ChevronDown, ChevronRight, AudioLines, Repeat2, NotebookPen, ClipboardCheck } from "lucide-react";
import {
  groupByDay,
  formatDuration,
  formatStamp,
  partLabel,
  sessionTopics,
  PartBadge,
  MOCK_STATUS_META,
  SESSION_STATUS_META,
  mockIsReviewable,
  recordingDisplay,
} from "./shared";

// ---------------------------------------------------------------------------
// Session row (expandable, with its recordings)
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  recordings,
}: {
  session: SessionMeta;
  recordings: RecordingMeta[];
}) {
  const [open, setOpen] = React.useState(false);
  const status = SESSION_STATUS_META[session.status];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-all duration-200",
        open ? "border-brand-bright/40 bg-surface" : "border-border bg-card hover:border-brand-bright/30"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left sm:gap-3 sm:px-4"
      >
        <PartBadge type={session.type} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {partLabel(session.type)} — {sessionTopics(session)}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {session.answered} {session.answered === 1 ? "answer" : "answers"} ·{" "}
            {formatDuration(session.practiceSeconds)} · {formatStamp(session.startedAt)}
          </div>
        </div>
        <StatusPill tone={status.tone} className="hidden shrink-0 sm:inline-flex">
          {status.label}
        </StatusPill>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-4 sm:px-4">
          <div className="flex items-center justify-between sm:justify-start">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <span className="text-[11px] text-muted-foreground">
              {session.answered} of {session.totalQuestions} questions answered
            </span>
          </div>
          {recordings.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              No recordings were saved from this session.
            </p>
          ) : (
            <div className="space-y-4">
              {recordings.map((r) => {
                const disp = recordingDisplay(r);
                return (
                  <div key={r.id} className="space-y-1.5">
                    {disp.snippet && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {disp.snippet}
                      </p>
                    )}
                    <AudioPlayer recordingId={r.id} title={disp.playerTitle} compact />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock row (clickable when there is something to review)
// ---------------------------------------------------------------------------

function MockRow({ mock }: { mock: MockMeta }) {
  const navigate = useApp((s) => s.navigate);
  const meta = MOCK_STATUS_META[mock.status];
  const reviewable = mockIsReviewable(mock.status);
  const completed = mock.segments.filter((s) => s.completed).length;
  const sub = [
    mock.startedAt ? formatStamp(mock.startedAt) : null,
    `${completed} of ${mock.segments.length} questions`,
  ]
    .filter(Boolean)
    .join(" · ");

  const content = (
    <>
      <PartBadge type="full-mock" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">Full Speaking Mock</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      <StatusPill tone={meta.tone} className="shrink-0">
        {meta.label}
      </StatusPill>
      {reviewable && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </>
  );

  if (!reviewable) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 opacity-80 sm:gap-3 sm:px-4">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "mock-review", mockId: mock.id })}
      className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-left transition-all duration-200 hover:-translate-y-px hover:border-brand-bright/35 hover:shadow-sm sm:gap-3 sm:px-4"
    >
      {content}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Quick links
// ---------------------------------------------------------------------------

function QuickLinks({
  recordingsCount,
  reviewCount,
  notesCount,
}: {
  recordingsCount: number;
  reviewCount: number;
  notesCount: number;
}) {
  const navigate = useApp((s) => s.navigate);
  const links = [
    {
      label: "My Recordings",
      body: "Replay and manage every answer",
      icon: AudioLines,
      count: recordingsCount,
      view: { name: "recordings" } as const,
      countLabel: (n: number) => `${n} ${n === 1 ? "recording" : "recordings"}`,
    },
    {
      label: "Practice Again",
      body: "Revisit what deserves another round",
      icon: Repeat2,
      count: reviewCount,
      view: { name: "practice-again" } as const,
      countLabel: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    },
    {
      label: "Notes",
      body: "Your words, phrases and observations",
      icon: NotebookPen,
      count: notesCount,
      view: { name: "notes" } as const,
      countLabel: (n: number) => `${n} ${n === 1 ? "note" : "notes"}`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {links.map((l) => {
        const Icon = l.icon;
        return (
          <button
            key={l.label}
            type="button"
            onClick={() => navigate(l.view)}
            className="group flex flex-col rounded-2xl border border-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-bright/40 hover:shadow-md sm:p-5"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-bright">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <ChevronRight
                className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </div>
            <div className="mt-3 text-sm font-semibold tracking-tight">{l.label}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{l.body}</p>
            <div className="mt-2 text-[11px] font-medium tracking-wide text-muted-foreground">
              {l.count > 0 ? l.countLabel(l.count) : "Nothing here yet"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function ReviewHubView() {
  const sessions = useProgress((s) => s.sessions);
  const recordings = useProgress((s) => s.recordings);
  const mocks = useProgress((s) => s.mocks);
  const notesCount = useProgress((s) => s.notes.length);
  const reviewCount = useProgress((s) => s.reviewItems.length);
  const navigate = useApp((s) => s.navigate);

  const hasActivity = sessions.length > 0 || mocks.length > 0;

  const sortedSessions = React.useMemo(
    () => [...sessions].sort((a, b) => b.startedAt - a.startedAt),
    [sessions]
  );
  const dayGroups = React.useMemo(
    () => groupByDay(sortedSessions, (s) => s.startedAt),
    [sortedSessions]
  );
  const recordingsBySession = React.useMemo(() => {
    const map = new Map<string, RecordingMeta[]>();
    for (const r of recordings) {
      const list = map.get(r.sessionId);
      if (list) list.push(r);
      else map.set(r.sessionId, [r]);
    }
    return map;
  }, [recordings]);
  const recentMocks = React.useMemo(
    () =>
      [...mocks]
        .sort((a, b) => (b.startedAt || b.completedAt || 0) - (a.startedAt || a.completedAt || 0))
        .slice(0, 5),
    [mocks]
  );

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Review"
        title="Look back at your practice."
        subtitle="Replay your answers, revisit what felt hard, and pick up where you left off."
      />

      {!hasActivity ? (
        <EmptyState
          title="Your first session starts here"
          body="You haven't recorded any speaking practice yet. Answer a few questions and this page will fill up with your real progress."
          action={
            <Button onClick={() => navigate({ name: "practice" })} className="gap-2">
              <Mic className="h-4 w-4" />
              Start Part 1
            </Button>
          }
        />
      ) : (
        <>
          <QuickLinks
            recordingsCount={recordings.length}
            reviewCount={reviewCount}
            notesCount={notesCount}
          />

          <SectionCard
            title="Recent practice"
            hint={sessions.length > 0 ? `${sessions.length} total` : undefined}
          >
            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Your sessions will appear here after your first practice.
              </p>
            ) : (
              <div className="space-y-5">
                {dayGroups.map((group) => (
                  <div key={group.key}>
                    <div className="mb-2 px-0.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      {group.label}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((s) => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          recordings={recordingsBySession.get(s.id) || []}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {mocks.length > 0 && (
            <SectionCard
              title="My mocks"
              hint={mocks.length > 5 ? `showing ${recentMocks.length} of ${mocks.length}` : undefined}
            >
              <div className="space-y-2">
                {recentMocks.map((m) => (
                  <MockRow key={m.id} mock={m} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                <span>Completed and interrupted mocks keep their full recording for review.</span>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
