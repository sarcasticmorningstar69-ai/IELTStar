"use client";

/**
 * My Recordings — every recording, grouped by day and session, in compact
 * expandable rows. Multi-select delete, single delete, retention info.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import {
  useProgress,
  type RecordingMeta,
  type SessionMeta,
  type Settings,
} from "@/lib/store/progress";
import { estimateAudioUsage } from "@/lib/storage/audio-db";
import { QUICK_CATEGORIES, problemById } from "@/lib/data/content";
import { PageHeader, EmptyState, StatusPill } from "@/components/shared/page-kit";
import { AudioPlayer, formatTime } from "@/components/audio/audio-ui";
import { AnalyseAnswerLink } from "@/components/ai/send-to-stella";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Mic,
  ChevronDown,
  Trash2,
  ListChecks,
  HardDrive,
  Stethoscope,
  Settings2,
  Sparkles,
} from "lucide-react";
import { groupByDay, formatBytes, formatStamp, formatDuration, PartBadge, recordingDisplay } from "./shared";

const RETENTION_LABEL: Record<Settings["keepRecordings"], string> = {
  forever: "Keep forever",
  "1d": "Keep for 1 day",
  "1w": "Keep for 1 week",
  "1m": "Keep for 1 month",
  "3m": "Keep for 3 months",
};

function quickLabel(key: string | undefined): string | null {
  if (!key) return null;
  return QUICK_CATEGORIES.find((c) => c.key === key)?.label || null;
}

// ---------------------------------------------------------------------------
// Diagnosis details (shown when a row is expanded)
// ---------------------------------------------------------------------------

function DiagnosisDetails({ diag }: { diag: NonNullable<RecordingMeta["diagnosis"]> }) {
  const quick = quickLabel(diag.quick);
  const problems = (diag.problems || [])
    .map((id) => problemById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Stethoscope className="h-3.5 w-3.5 text-brand-bright" aria-hidden />
        What you noticed
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {quick && <StatusPill tone="brand">{quick}</StatusPill>}
        {(diag.symptoms || []).map((s) => (
          <span
            key={`s-${s}`}
            className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {s}
          </span>
        ))}
        {(diag.causes || []).map((c) => (
          <span
            key={`c-${c}`}
            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {c}
          </span>
        ))}
      </div>
      {problems.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Linked practice problems
          </div>
          <ul className="mt-1.5 space-y-1">
            {problems.map((p) => (
              <li key={p.id} className="text-sm leading-relaxed">
                {p.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {diag.createdAt && (
        <div className="mt-2.5 text-[11px] text-muted-foreground">
          Diagnosed {formatStamp(diag.createdAt)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recording row (compact, expandable)
// ---------------------------------------------------------------------------

function RecordingRow({
  rec,
  selectMode,
  isSelected,
  onToggleSelect,
}: {
  rec: RecordingMeta;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const deleteRecording = useProgress((s) => s.deleteRecording);
  const disp = recordingDisplay(rec);
  const diag = rec.diagnosis;
  const chip = quickLabel(diag?.quick);

  const handleDelete = async () => {
    setDeleting(true);
    await deleteRecording(rec.id);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-all duration-200",
        open ? "border-brand-bright/40 bg-surface" : "border-border bg-card hover:border-brand-bright/25"
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2.5 sm:gap-2.5 sm:px-3">
        {selectMode && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(rec.id)}
            aria-label={`Select recording: ${disp.playerTitle}`}
            className="shrink-0"
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-2.5"
        >
          <PartBadge type={rec.part} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{disp.title}</span>
            {disp.snippet && (
              <span className="block truncate text-xs text-muted-foreground">{disp.snippet}</span>
            )}
          </span>
        </button>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatTime(rec.duration)}
        </span>
        {diag && (
          <span
            className="hidden shrink-0 items-center gap-1 rounded-full border border-brand-bright/45 px-2 py-0.5 text-[10px] font-medium text-brand-bright sm:inline-flex"
            title="This answer has a self-diagnosis"
          >
            <Stethoscope className="h-3 w-3" aria-hidden />
            {chip || "Diagnosed"}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 sm:px-4 sm:py-4">
          <AudioPlayer recordingId={rec.id} title={disp.playerTitle} compact />
          {diag && <DiagnosisDetails diag={diag} />}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[11px] text-muted-foreground">
                Recorded {formatStamp(rec.startedAt)} · {formatDuration(rec.duration)}
              </span>
              <span className="mt-1.5 block">
                <AnalyseAnswerLink
                  recordingId={rec.id}
                  mockId={rec.mockId}
                  sessionId={rec.sessionId}
                />
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              className="gap-1.5 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{disp.title}&rdquo; will be removed from this device. This can&apos;t be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete recording
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

interface SessionCluster {
  key: string;
  session: SessionMeta | null;
  items: RecordingMeta[];
}

interface DayClusters {
  key: string;
  label: string;
  clusters: SessionCluster[];
  count: number;
}

export function RecordingsView() {
  const recordings = useProgress((s) => s.recordings);
  const sessions = useProgress((s) => s.sessions);
  const settings = useProgress((s) => s.settings);
  const deleteRecordings = useProgress((s) => s.deleteRecordings);
  const navigate = useApp((s) => s.navigate);
  const { toast } = useToast();

  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [usage, setUsage] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    estimateAudioUsage().then((u) => {
      if (alive) setUsage(u);
    });
    return () => {
      alive = false;
    };
  }, [recordings]);

  const sessionById = React.useMemo(
    () => new Map(sessions.map((s) => [s.id, s] as const)),
    [sessions]
  );

  const dayClusters = React.useMemo<DayClusters[]>(() => {
    const groups = groupByDay(recordings, (r) => r.startedAt);
    return groups.map((g) => {
      const clusters = g.items.reduce<SessionCluster[]>((acc, r) => {
        const last = acc.length ? acc[acc.length - 1] : null;
        if (last && last.key === r.sessionId) {
          last.items.push(r);
        } else {
          acc.push({
            key: r.sessionId,
            session: sessionById.get(r.sessionId) || null,
            items: [r],
          });
        }
        return acc;
      }, []);
      // inside a session, replay in the order the questions were answered
      for (const c of clusters) c.items.sort((a, b) => a.startedAt - b.startedAt);
      return { key: g.key, label: g.label, clusters, count: g.items.length };
    });
  }, [recordings, sessionById]);

  const allSelected = recordings.length > 0 && selected.size === recordings.length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === recordings.length) return new Set();
      return new Set(recordings.map((r) => r.id));
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    setBulkDeleting(true);
    await deleteRecordings(ids);
    setBulkDeleting(false);
    setSelected(new Set());
    setConfirmOpen(false);
    toast({
      title: "Recordings deleted",
      description: `${ids.length} ${ids.length === 1 ? "recording was" : "recordings were"} removed from this device.`,
    });
  };

  /** Send a whole session or mock to Stella from its group header. */
  const analyseCluster = (cluster: SessionCluster) => {
    const isMock = cluster.session?.type === "full-mock";
    navigate({
      name: "analysis",
      recordingIds: cluster.items.map((r) => r.id),
      sessionId: cluster.session?.id,
      mockId: cluster.items.find((r) => r.mockId)?.mockId,
      heading: isMock ? "Send this mock to Stella" : "Get this session evaluated",
    });
  };

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="My Recordings"
        title="Every answer, ready to replay."
        subtitle="Your recordings stay on this device — listen back, notice patterns, delete what you no longer need."
      />

      {recordings.length === 0 ? (
        <EmptyState
          title="No recordings yet"
          body="Your recordings will appear here after your first practice."
          action={
            <Button onClick={() => navigate({ name: "practice" })} className="gap-2">
              <Mic className="h-4 w-4" />
              Start Part 1
            </Button>
          }
        />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] sm:p-5">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
                {usage !== null && ` · ${formatBytes(usage)} on this device`}
              </span>
              <span aria-hidden>·</span>
              <span>{RETENTION_LABEL[settings.keepRecordings]}</span>
              <button
                type="button"
                onClick={() => navigate({ name: "settings" })}
                className="inline-flex items-center gap-1 font-medium text-brand-bright underline-offset-2 transition-colors hover:underline"
              >
                <Settings2 className="h-3 w-3" aria-hidden />
                Change
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectMode ? (
                <>
                  <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                    Done
                  </Button>
                  <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                    {allSelected ? "Deselect all" : "Select all"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    disabled={selected.size === 0 || bulkDeleting}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setSelectMode(true)}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Select
                </Button>
              )}
            </div>
          </div>

          {/* Hierarchical list */}
          <div className="mt-4 max-h-[60vh] space-y-5 overflow-y-auto pr-1 scrollbar-thin">
            {dayClusters.map((day) => (
              <div key={day.key}>
                <div className="sticky top-0 z-10 -mx-1 mb-2 bg-card/95 px-1 py-1 backdrop-blur-sm">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {day.label}
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      {day.count} {day.count === 1 ? "recording" : "recordings"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {day.clusters.map((cluster) => (
                    <React.Fragment key={cluster.key}>
                      {cluster.session && cluster.items.length > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5 pt-1">
                          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
                            {cluster.session.type === "full-mock"
                              ? "Full Speaking Mock"
                              : `Part ${cluster.session.type === "part1" ? 1 : cluster.session.type === "part2" ? 2 : 3} session`}
                            {" · "}
                            {cluster.items.length} answers
                          </div>
                          <button
                            type="button"
                            onClick={() => analyseCluster(cluster)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-bright underline-offset-4 hover:underline"
                          >
                            <Sparkles className="h-3 w-3" />
                            Analyse all {cluster.items.length}
                          </button>
                        </div>
                      )}
                      {cluster.items.map((r) => (
                        <RecordingRow
                          key={r.id}
                          rec={r}
                          selectMode={selectMode}
                          isSelected={selected.has(r.id)}
                          onToggleSelect={toggleSelect}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {selected.size} {selected.size === 1 ? "recording" : "recordings"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The selected recordings will be removed from this device. Your practice history
                  and notes are not affected. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep them</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete {selected.size === 1 ? "recording" : "recordings"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      )}
    </div>
  );
}
