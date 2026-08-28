"use client";

/**
 * YouTube Mock Library (30 supplied mocks) + Watch & Practice Alongside.
 *
 * The band labels attached to each video are supplied descriptions of that
 * recording — they are displayed as provided and never presented as a
 * prediction of the student's own result.
 *
 * Practice Alongside: one session per visit (created on mount, finished on
 * unmount), a user-gesture mic check, manual answer recording with live
 * waveform, and automatic save-and-release when the student leaves.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type SessionMeta } from "@/lib/store/progress";
import { VIDEOS } from "@/lib/data/content";
import { micManager } from "@/lib/audio/microphone";
import { SegmentRecorder } from "@/lib/audio/recorder";
import {
  useMicLevel,
  LiveWaveform,
  VolumeMeter,
  AudioPlayer,
  formatTime,
} from "@/components/audio/audio-ui";
import { MicTestPanel } from "@/components/views/mic-gate";
import {
  PageHeader,
  EmptyState,
  StatusPill,
  SectionCard,
} from "@/components/shared/page-kit";
import { Button } from "@/components/ui/button";
import { VideoCard, WatchDialog } from "@/components/views/video-card";
import {
  extractYouTubeId,
  videoById,
  videoIndex,
  mockNumber,
  embedUrlWithApi,
} from "@/components/views/video-utils";
import {
  Clapperboard,
  Info,
  Play,
  ExternalLink,
  Mic,
  Square,
  Lightbulb,
  RotateCcw,
  LogOut,
  MessagesSquare,
  Loader2,
  ChevronLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// VideosView — the library
// ---------------------------------------------------------------------------

export function VideosView() {
  const navigate = useApp((s) => s.navigate);
  const [watchId, setWatchId] = React.useState<string | null>(null);

  return (
    <div className="fade-up pb-28 lg:pb-10">
      <PageHeader
        eyebrow="Mocks"
        title="YouTube Mock Library"
        subtitle="Watch real speaking mocks, or practice alongside one — pause the video, answer yourself, and compare."
        actions={
          <StatusPill tone="brand" icon={<Clapperboard className="h-3 w-3" />}>
            {VIDEOS.length} mocks
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {VIDEOS.map((video, i) => (
          <VideoCard
            key={video.id}
            video={video}
            index={i}
            onWatch={() => setWatchId(video.id)}
            onPractice={() => navigate({ name: "video", videoId: video.id })}
          />
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Band labels are supplied by each video&apos;s creator and describe that
        recording only — they are not a prediction of your own result.
      </p>

      <WatchDialog videoId={watchId} onClose={() => setWatchId(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoPracticeView — watch & practice alongside one video
// ---------------------------------------------------------------------------

export function VideoPracticeView({ videoId }: { videoId: string }) {
  const navigate = useApp((s) => s.navigate);
  const startSession = useProgress((s) => s.startSession);
  const finishSession = useProgress((s) => s.finishSession);
  const saveRecording = useProgress((s) => s.saveRecording);
  const recordings = useProgress((s) => s.recordings);

  const video = videoById(videoId);
  const index = video ? videoIndex(video.id) : -1;
  const num = index >= 0 ? mockNumber(index) : "";
  const ytId = video ? extractYouTubeId(video.url) : null;

  const [session, setSession] = React.useState<SessionMeta | null>(null);
  const [micReady, setMicReady] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [lastRecordingId, setLastRecordingId] = React.useState<string | null>(null);
  const [micError, setMicError] = React.useState(false);
  const recorderRef = React.useRef<SegmentRecorder | null>(null);
  const startedAtRef = React.useRef(0);
  const playerRef = React.useRef<HTMLIFrameElement | null>(null);
  const { level, waveform } = useMicLevel(recording);

  // This session's recordings, oldest first (the store keeps newest first).
  const sessionRecordings = React.useMemo(() => {
    if (!session) return [];
    return recordings.filter((r) => r.sessionId === session.id).reverse();
  }, [recordings, session]);

  // One session per visit. On unmount: stop+save an active answer, finish the
  // session, and release the microphone stream (same safe pattern as SessionView).
  React.useEffect(() => {
    if (!video) return;
    const s = startSession("part1", `Practice Alongside — ${num}`, [], 0);
    setSession(s);
    return () => {
      const rec = recorderRef.current;
      if (rec) {
        recorderRef.current = null;
        rec
          .stop()
          .then((result) => {
            if (result && result.blob.size > 0) {
              return useProgress
                .getState()
                .saveRecording(
                  {
                    sessionId: s.id,
                    part: 1,
                    startedAt: startedAtRef.current || Date.now() - result.duration * 1000,
                    duration: result.duration,
                    mimeType: result.mimeType,
                    size: result.blob.size,
                    label: `Alongside ${num} — answer (saved on exit)`,
                  },
                  result.blob
                );
            }
            return undefined;
          })
          .catch(() => {
            /* leaving anyway — nothing more to do */
          });
      }
      const current = useProgress.getState().sessions.find((x) => x.id === s.id);
      if (current && current.status === "in-progress") {
        finishSession(s.id, "interrupted");
      }
      micManager.release();
    };
  }, []);

  // Elapsed time while recording (state-driven; recorder refs are never read
  // during render).
  React.useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Guard against accidental page reloads while an answer is being recorded.
  React.useEffect(() => {
    if (!recording) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [recording]);

  /** Best-effort pause of the embedded player (works when the embed is live). */
  const pauseVideo = () => {
    try {
      playerRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        "*"
      );
    } catch {
      /* the student can pause the video manually */
    }
  };

  const beginAnswer = async () => {
    if (recording) return;
    setMicError(false);
    const stream = micManager.getLiveStream() || (await micManager.request());
    if (!stream) {
      setMicError(true);
      return;
    }
    const rec = new SegmentRecorder();
    if (!rec.start(stream)) {
      setMicError(true);
      return;
    }
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setLastRecordingId(null);
    setRecording(true);
    pauseVideo();
  };

  const finishAnswer = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setRecording(false);
    setSaving(true);
    const result = await rec.stop();
    if (!result || result.blob.size === 0 || !session) {
      setSaving(false);
      return;
    }
    const count = useProgress
      .getState()
      .recordings.filter((r) => r.sessionId === session.id).length;
    try {
      const meta = await saveRecording(
        {
          sessionId: session.id,
          part: 1,
          startedAt: startedAtRef.current,
          duration: result.duration,
          mimeType: result.mimeType,
          size: result.blob.size,
          label: `Alongside ${num} — answer ${count + 1}`,
        },
        result.blob
      );
      setLastRecordingId(meta.id);
    } catch {
      setMicError(true);
    }
    setSaving(false);
  };

  const exitPractice = () => {
    // The unmount cleanup stops and saves any active answer, finishes the
    // session and releases the microphone.
    navigate({ name: "videos" });
  };

  if (!video) {
    return (
      <div className="fade-up pb-28 lg:pb-10">
        <EmptyState
          title="This mock isn't available"
          body="The video you're looking for wasn't found in the library. Head back and pick another mock."
          action={
            <Button
              onClick={() => navigate({ name: "videos" })}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to the library
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="fade-up space-y-5 pb-28 lg:pb-10">
      {/* Header — the shell renders a Back affordance; this exits the practice */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 text-[11px] font-semibold tracking-[0.16em] text-brand-bright uppercase">
            Watch &amp; Practice
          </div>
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">
            Practice Alongside
            <span className="text-sm font-medium text-muted-foreground">
              {num} · {video.label}
            </span>
          </h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={exitPractice}
          className="gap-1.5 text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          Exit practice
        </Button>
      </div>

      {/* Video player */}
      <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-sm">
        <div className="aspect-video w-full">
          {ytId ? (
            <iframe
              ref={playerRef}
              key={video.id}
              src={embedUrlWithApi(ytId)}
              title={`${num} — IELTS speaking mock`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
                <Play className="ml-0.5 h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">
                This video can&apos;t be previewed here — you can still practice
                alongside it with the audio from YouTube.
              </p>
              <Button
                variant="outline"
                onClick={() => window.open(video.url, "_blank", "noopener")}
                className="gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />
                Open Video
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mic check first (user gesture), then the practice panel */}
      {!micReady ? (
        <div>
          <MicTestPanel onReady={() => setMicReady(true)} />
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
            A quick check before you start — your microphone only turns on when
            you tap, and everything you record stays on this device.
          </p>
        </div>
      ) : (
        <SectionCard title="Practice alongside this mock">
          {/* Instructions */}
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Play the video. When the examiner asks a question, pause and
              answer yourself out loud. Record your answers, then compare with
              the candidate in the video.
            </p>
          </div>

          <div className="mt-5">
            {recording ? (
              <div className="rounded-2xl border border-brand-bright/40 bg-card p-5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="rec-dot h-3 w-3 rounded-full bg-brand-bright" aria-hidden />
                    <span className="text-sm font-semibold tracking-[0.14em] text-brand-bright uppercase">
                      Recording
                    </span>
                  </div>
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    {formatTime(elapsed)}
                  </span>
                </div>
                <LiveWaveform waveform={waveform} active className="my-4" />
                <VolumeMeter level={level} />
                <div className="mt-5 flex justify-center">
                  <Button
                    size="lg"
                    variant="destructive"
                    onClick={finishAnswer}
                    className="h-14 gap-2.5 rounded-2xl text-base shadow-md"
                  >
                    <Square className="h-5 w-5" />
                    Stop Recording
                  </Button>
                </div>
              </div>
            ) : saving ? (
              <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving your answer…
              </div>
            ) : lastRecordingId ? (
              <div className="space-y-3">
                <AudioPlayer
                  recordingId={lastRecordingId}
                  title="Your latest answer"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={beginAnswer} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Record another answer
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    The video pauses itself whenever you record.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  onClick={beginAnswer}
                  className="h-14 gap-2.5 rounded-2xl text-base shadow-md sm:min-w-56"
                >
                  <Mic className="h-5 w-5" />
                  Start Recording
                </Button>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  Pause the video whenever the examiner asks — your microphone
                  stays on this device, and nothing is uploaded. The video
                  pauses itself when recording starts.
                </p>
              </div>
            )}

            {micError && !recording && (
              <div className="mt-4">
                <MicTestPanel compact />
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* This session's answers */}
      {sessionRecordings.length > 0 && (
        <SectionCard
          title="This practice session"
          hint={`${sessionRecordings.length} ${
            sessionRecordings.length === 1 ? "answer" : "answers"
          }`}
        >
          <div className="max-h-96 space-y-3 overflow-y-auto scrollbar-thin pr-1">
            {sessionRecordings.map((r) => (
              <div key={r.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                    {r.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {formatTime(r.duration)}
                  </span>
                </div>
                <AudioPlayer recordingId={r.id} title={r.label} compact />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Compare note — calm coaching, no score promises */}
      <SectionCard title="How to compare">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-bright">
            <MessagesSquare className="h-5 w-5" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Compare with the video: listen for how the candidate organizes
            answers, handles follow-ups, and keeps going when a word is missing.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
