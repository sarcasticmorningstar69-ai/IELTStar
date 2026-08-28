"use client";

/**
 * Library card + watch dialog for the YouTube Mock Library.
 * No raw urls are ever shown as text — links live behind buttons.
 */
import * as React from "react";
import { Play, ExternalLink, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { VideoEntry } from "@/lib/data/content";
import {
  extractYouTubeId,
  videoById,
  videoIndex,
  mockNumber,
  describeVideo,
  embedUrl,
  thumbnailUrl,
} from "@/components/views/video-utils";

// ---------------------------------------------------------------------------
// Thumbnail with graceful fallback (never breaks the card layout)
// ---------------------------------------------------------------------------

export function VideoThumb({
  ytId,
  alt,
  className,
}: {
  ytId: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  // Reset the fallback when the underlying video changes.
  React.useEffect(() => {
    setFailed(false);
  }, [ytId]);

  if (!ytId || failed) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full flex-col items-center justify-center gap-2.5 bg-surface",
          className
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
          <Play className="ml-0.5 h-5 w-5" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          Preview unavailable
        </span>
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl(ytId)}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("aspect-video w-full object-cover", className)}
    />
  );
}

// ---------------------------------------------------------------------------
// Library card
// ---------------------------------------------------------------------------

export function VideoCard({
  video,
  index,
  onWatch,
  onPractice,
}: {
  video: VideoEntry;
  index: number;
  onWatch: () => void;
  onPractice: () => void;
}) {
  const ytId = extractYouTubeId(video.url);
  const num = mockNumber(index);

  return (
    <article className="video-card group">
      <button
        type="button"
        onClick={onWatch}
        aria-label={`Watch ${num}`}
        className="relative block w-full cursor-pointer overflow-hidden bg-surface"
      >
        <VideoThumb
          ytId={ytId}
          alt={`${num} — IELTS speaking mock video`}
          className="video-thumb-img"
        />
        {/* Band badge — supplied label of the video itself */}
        <span className="absolute top-3 left-3 z-10 rounded-full bg-brand px-2.5 py-0.5 font-mono text-[11px] font-bold text-white shadow-md">
          {video.label}
        </span>
        {/* Hover overlay + play circle (from the previous IELTStar design) */}
        <span className="video-thumb-overlay absolute inset-0" aria-hidden />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="video-play-circle flex h-12 w-12 items-center justify-center rounded-full bg-brand-bright text-white shadow-[0_4px_20px_rgba(244,63,94,0.6)]">
            <Play className="ml-1 h-5 w-5" />
          </span>
        </span>
      </button>

      <div className="flex flex-1 flex-col bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-bold tracking-[0.15em] text-brand-bright uppercase">
            {num}
          </span>
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
            Speaking Mock
          </span>
        </div>
        <h3 className="video-card-title mt-1 text-[15px] leading-snug font-bold tracking-tight">
          {video.label.includes("jumper") || video.label.includes("jumped")
            ? `Improvement Story — ${video.label}`
            : `Full Speaking Mock — ${video.label}`}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {describeVideo(video.label)}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <Button onClick={onWatch} className="gap-1.5">
            <Play className="h-4 w-4" />
            Watch
          </Button>
          <Button variant="outline" onClick={onPractice} className="flex-1 gap-1.5">
            <Mic className="h-4 w-4" />
            Practice Alongside
          </Button>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Watch dialog — embedded player with an "Open Video" escape hatch
// ---------------------------------------------------------------------------

export function WatchDialog({
  videoId,
  onClose,
}: {
  videoId: string | null;
  onClose: () => void;
}) {
  const video = videoId ? videoById(videoId) : undefined;
  const index = video ? videoIndex(video.id) : -1;
  const num = index >= 0 ? mockNumber(index) : "Mock";
  const ytId = video ? extractYouTubeId(video.url) : null;

  const openOnYouTube = () => {
    if (video) window.open(video.url, "_blank", "noopener");
  };

  return (
    <Dialog
      open={!!videoId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {video && (
        <DialogContent className="gap-4 p-4 sm:max-w-4xl sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-baseline gap-x-3">
              <span>{num}</span>
              <span className="text-sm font-medium text-muted-foreground">
                {video.label}
              </span>
            </DialogTitle>
            <DialogDescription>
              A supplied YouTube speaking mock. If the preview doesn&apos;t load
              here, open it on YouTube instead.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <div className="aspect-video w-full">
              {ytId ? (
                <iframe
                  key={ytId}
                  src={embedUrl(ytId)}
                  title={`${num} — IELTS speaking mock`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
                    <Play className="ml-0.5 h-5 w-5" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    This video can&apos;t be previewed here.
                  </p>
                  <Button onClick={openOnYouTube} className="gap-1.5">
                    <ExternalLink className="h-4 w-4" />
                    Open Video
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              {describeVideo(video.label)}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={openOnYouTube}
              className="gap-1.5"
            >
              <ExternalLink className="h-4 w-4" />
              Open Video
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
