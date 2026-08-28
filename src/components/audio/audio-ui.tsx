"use client";

/**
 * Shared audio UI: live waveform, volume meter, mic status surfaces,
 * and a polished playback player. No NaN/undefined ever displayed:
 * unknown durations render as --:--.
 */
import * as React from "react";
import { micManager, type MicStatus } from "@/lib/audio/microphone";
import { getAudioURL, computePeaks } from "@/lib/storage/audio-db";
import { Play, Pause, Gauge, RotateCcw, RotateCw, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Live level polling hook
//
// The waveform is a rolling TIME-SERIES: every ~80ms the current input level
// is appended to a history buffer (newest sample on the right). The display
// therefore scrolls in real time and tracks the recording timeline like a
// voice memo, instead of flickering with instantaneous noise.
// ---------------------------------------------------------------------------

const WAVEFORM_BARS = 56;
const SAMPLE_INTERVAL_MS = 80;

export function useMicLevel(active: boolean) {
  const [level, setLevel] = React.useState(0);
  const [waveform, setWaveform] = React.useState<number[]>(() => new Array(WAVEFORM_BARS).fill(0));
  const historyRef = React.useRef<number[]>([]);
  const smoothedRef = React.useRef(0);

  React.useEffect(() => {
    if (!active) {
      setLevel(0);
      setWaveform(new Array(WAVEFORM_BARS).fill(0));
      historyRef.current = [];
      smoothedRef.current = 0;
      return;
    }
    let raf = 0;
    let alive = true;
    let lastSample = 0;
    const tick = (t: number) => {
      if (!alive) return;
      const raw = micManager.getLevel();
      // attack/decay smoothing so the meter rises quickly and falls gently
      const k = raw > smoothedRef.current ? 0.55 : 0.12;
      smoothedRef.current = smoothedRef.current + (raw - smoothedRef.current) * k;
      setLevel(smoothedRef.current);

      if (t - lastSample >= SAMPLE_INTERVAL_MS) {
        lastSample = t;
        const h = historyRef.current;
        // gentle visual gain so normal speech reads clearly
        h.push(Math.min(1, smoothedRef.current * 2.4));
        if (h.length > WAVEFORM_BARS) h.shift();
        setWaveform([...h]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [active]);
  return { level, waveform };
}

// ---------------------------------------------------------------------------
// Mic status subscription hook
// ---------------------------------------------------------------------------

export function useMicStatus() {
  const [state, setState] = React.useState<{ status: MicStatus; detail: string }>({
    status: micManager.status,
    detail: micManager.detail,
  });
  React.useEffect(() => micManager.subscribe((status, detail) => setState({ status, detail })), []);
  return state;
}

// ---------------------------------------------------------------------------
// Live waveform canvas
// ---------------------------------------------------------------------------

export function LiveWaveform({
  waveform,
  active,
  className,
  barClassName,
}: {
  waveform: number[];
  active: boolean;
  className?: string;
  barClassName?: string;
}) {
  // Pad on the left so the display is always full width — the newest sample
  // arrives at the right edge and history trails off to the left, exactly
  // like a real-time recorder timeline.
  const bars = waveform.length >= WAVEFORM_BARS
    ? waveform
    : [...new Array(WAVEFORM_BARS - waveform.length).fill(0), ...waveform];
  const lastIdx = bars.length - 1;

  return (
    <div
      role="img"
      aria-label={active ? "Live speaking waveform — follows your voice in real time" : "Waveform idle"}
      className={cn("flex h-14 items-center gap-[2.5px] px-1", className)}
    >
      {bars.map((v, i) => {
        // fade the trail: older bars dimmer, newest bars brightest
        const age = (lastIdx - i) / lastIdx; // 0 = newest, 1 = oldest
        const opacity = active ? 0.35 + (1 - age) * 0.65 : 1;
        const isLeading = active && i >= lastIdx - 2;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full transition-[height] duration-100 ease-out",
              active
                ? isLeading
                  ? "bg-brand-bright shadow-[0_0_10px_color-mix(in_oklab,var(--brand-bright)_55%,transparent)]"
                  : "bg-brand-bright"
                : "bg-muted-foreground/25",
              barClassName
            )}
            style={{
              height: `${Math.max(5, Math.min(100, v * 100))}%`,
              opacity: active ? opacity : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume meter with LOW / GOOD / HIGH label
// ---------------------------------------------------------------------------

export function VolumeMeter({ level, showLabel = true }: { level: number; showLabel?: boolean }) {
  const pct = Math.min(100, Math.round(level * 220));
  const zone = level < 0.015 ? "low" : level > 0.5 ? "high" : "good";
  return (
    <div className="w-full">
      <div className="flex h-2 w-full gap-[3px] overflow-hidden" aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => {
          const lit = pct > (i + 1) * (100 / 24);
          return (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-full transition-colors duration-100",
                lit
                  ? zone === "high"
                    ? "bg-warning"
                    : "bg-brand-bright"
                  : "bg-muted-foreground/20"
              )}
            />
          );
        })}
      </div>
      {showLabel && (
        <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          <span>Live input level</span>
          <span
            className={cn(
              zone === "good" && "text-brand-bright",
              zone === "high" && "text-warning"
            )}
          >
            {zone === "low" ? "Low" : zone === "good" ? "Good" : "High"}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time formatting (never NaN)
// ---------------------------------------------------------------------------

export function formatTime(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || !isFinite(seconds) || isNaN(seconds) || seconds < 0)
    return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Static waveform display for playback (computed peaks)
// ---------------------------------------------------------------------------

export function StaticWaveform({
  peaks,
  progress,
  onSeek,
  className,
}: {
  peaks: number[] | null;
  progress: number; // 0..1
  onSeek?: (ratio: number) => void;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const bars = peaks || new Array(80).fill(0.12);
  const handleSeek = (e: React.MouseEvent) => {
    if (!onSeek || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };
  return (
    <div
      ref={ref}
      onClick={handleSeek}
      role={onSeek ? "slider" : undefined}
      aria-label={onSeek ? "Seek position" : undefined}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={onSeek ? 0 : undefined}
      onKeyDown={
        onSeek
          ? (e) => {
              if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
              if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
            }
          : undefined
      }
      className={cn(
        "relative flex h-16 items-center gap-[2px] overflow-hidden px-1",
        onSeek && "cursor-pointer",
        className
      )}
    >
      {bars.map((v, i) => {
        const played = i / bars.length <= progress;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full",
              played ? "bg-brand-bright" : "bg-muted-foreground/25"
            )}
            style={{ height: `${Math.max(8, Math.min(100, v * 100))}%` }}
          />
        );
      })}
      {/* Playhead — glides across the waveform in real time while playing */}
      {progress > 0 && (
        <span
          className="pointer-events-none absolute top-1 bottom-1 w-[2px] -translate-x-1/2 rounded-full bg-foreground/85 mix-blend-difference"
          style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          aria-hidden
        >
          <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brand-bright shadow-[0_0_10px_color-mix(in_oklab,var(--brand-bright)_65%,transparent)]" />
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio player — real <audio> element, real progress, speed control
// ---------------------------------------------------------------------------

const SPEEDS = [0.75, 1, 1.25, 1.5];

export function AudioPlayer({
  recordingId,
  title,
  compact = false,
  onEnded,
  className,
}: {
  recordingId: string;
  title?: string;
  compact?: boolean;
  onEnded?: () => void;
  className?: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [speedIdx, setSpeedIdx] = React.useState(1);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    setUrl(null);
    setFailed(false);
    setPeaks(null);
    setCurrent(0);
    setDuration(null);
    getAudioURL(recordingId).then((u) => {
      if (!alive) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      if (!u) {
        setFailed(true);
        return;
      }
      revoke = u;
      setUrl(u);
    });
    computePeaks(recordingId, compact ? 56 : 88).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [recordingId, compact]);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        /* autoplay blocked or format issue */
      }
    } else {
      el.pause();
    }
  };

  /**
   * MediaRecorder blobs (webm/opus) frequently report Infinity duration until
   * the element is seeked — force the browser to compute the real duration
   * by seeking to the end, then snap back to the start.
   */
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.currentTarget;
    if (isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
      return;
    }
    const onSeeked = () => {
      el.removeEventListener("timeupdate", onSeeked);
      if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", onSeeked);
    try {
      el.currentTime = 1e101; // seek past the end → duration becomes known
    } catch {
      /* seek failed — times will render as --:-- */
    }
  };

  // Smooth playback tracking: read audio.currentTime on every animation frame
  // while playing, so the waveform progress and playhead glide at 60fps
  // instead of stepping once per timeupdate (~4x/sec).
  React.useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      const t = el.currentTime;
      if (Math.abs(t - last) > 0.016) {
        last = t;
        setCurrent(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (ratio: number) => {
    const el = audioRef.current;
    if (!el || !duration || !isFinite(duration)) return;
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta));
  };

  if (failed) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground", className)}>
        The audio for this recording is no longer available on this device.
      </div>
    );
  }

  const progress = duration && current ? current / duration : 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-4 shadow-sm",
        className
      )}
    >
      <audio
        ref={audioRef}
        src={url || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDuration(d);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? `Pause ${title || "recording"}` : `Play ${title || "recording"}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-40"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <StaticWaveform peaks={peaks} progress={progress} onSeek={seek} className={compact ? "h-10" : "h-14"} />
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        {!compact && (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => skip(-5)}
                aria-label="Back 5 seconds"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => skip(5)}
                aria-label="Forward 5 seconds"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Playback speed ${SPEEDS[speedIdx]}x`}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:text-foreground"
            >
              <Gauge className="h-3.5 w-3.5" />
              {SPEEDS[speedIdx]}×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mic status presentation helpers
// ---------------------------------------------------------------------------

export const MIC_STATUS_COPY: Record<MicStatus, { title: string; body: string }> = {
  unknown: {
    title: "Microphone not checked yet",
    body: "Tap the button and allow microphone access when your browser asks.",
  },
  insecure: {
    title: "Secure connection required",
    body: "Microphone access requires a secure connection. Open IELTStar using HTTPS or a supported localhost environment.",
  },
  unsupported: {
    title: "Microphone not supported",
    body: "This browser does not support microphone capture. Try Chrome, Safari, Edge or Firefox.",
  },
  requesting: {
    title: "Waiting for permission…",
    body: "Tap Allow when your browser asks for microphone access.",
  },
  granted: {
    title: "Microphone ready",
    body: "Your microphone is working. You can start speaking practice.",
  },
  denied: {
    title: "Microphone not allowed",
    body: "Microphone permission was declined. You can try again — tap the button and choose Allow.",
  },
  blocked: {
    title: "Microphone blocked",
    body: "Your browser has blocked microphone access for this site. Re-enable it in your browser settings, then try again.",
  },
  unavailable: {
    title: "No microphone found",
    body: "No microphone input was detected. Check that a microphone is connected and enabled.",
  },
  error: {
    title: "Microphone problem",
    body: "Your microphone connection was interrupted. Reconnect it to continue.",
  },
  recovering: {
    title: "Reconnecting…",
    body: "Trying to restore your microphone connection.",
  },
};

export function MicStatusIcon({ status, className }: { status: MicStatus; className?: string }) {
  const good = status === "granted";
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full",
        good ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Mic className="h-4 w-4" />
    </span>
  );
}
