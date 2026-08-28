"use client";

/**
 * MicGate — microphone permission UX with full state coverage.
 * getUserMedia is only ever called from a user gesture here.
 */
import * as React from "react";
import { micManager } from "@/lib/audio/microphone";
import { useMicStatus, MIC_STATUS_COPY, VolumeMeter, LiveWaveform, useMicLevel } from "@/components/audio/audio-ui";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Mic, ShieldQuestion, RefreshCw, LifeBuoy, Smartphone, Check } from "lucide-react";

export function HowToAllowSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80vh] overflow-y-auto scrollbar-thin rounded-t-3xl sm:max-w-lg sm:mx-auto sm:rounded-3xl sm:border"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-brand-bright" />
            How to allow the microphone
          </SheetTitle>
          <SheetDescription>
            The exact wording varies by browser version — look for the microphone or site
            permissions section.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-8">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4 text-brand-bright" />
              iPhone / iPad — Safari
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Tap the “aA” or puzzle icon in Safari&apos;s address bar.</li>
              <li>Choose <strong>Website Settings</strong> (or <strong>Settings for this website</strong>).</li>
              <li>Set <strong>Microphone</strong> to <strong>Allow</strong> (or “Ask”).</li>
              <li>Reload the page, then tap <strong>Test Microphone</strong> again.</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Also check Settings → Safari → Microphone is not set to “Never Allow”.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4 text-brand-bright" />
              Android — Chrome
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Tap the lock (or “ⓘ”) icon next to the address.</li>
              <li>Open <strong>Permissions</strong> / <strong>Site settings</strong>.</li>
              <li>Set <strong>Microphone</strong> to <strong>Allow</strong>.</li>
              <li>Reload the page, then tap <strong>Test Microphone</strong> again.</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              If the site was blocked before, Chrome may need the page reloaded after changing this.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4 text-brand-bright" />
              Desktop browsers
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Click the lock / camera icon in the address bar, find Microphone, choose Allow,
              then reload the page. In Chrome you can also check the camera icon on the right
              side of the address bar while on this page.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Interactive microphone test used before mocks and in session first-run.
 * Requires a real signal before it reports success.
 */
export function MicTestPanel({
  onReady,
  compact = false,
}: {
  onReady?: () => void;
  compact?: boolean;
}) {
  const { status, detail } = useMicStatus();
  const [tested, setTested] = React.useState(false);
  const [signalSeen, setSignalSeen] = React.useState(false);
  const [howTo, setHowTo] = React.useState(false);
  const { level, waveform } = useMicLevel(status === "granted" && tested);
  const copy = MIC_STATUS_COPY[status];

  React.useEffect(() => {
    if (level > 0.02) setSignalSeen(true);
  }, [level]);

  const runTest = async () => {
    const stream = await micManager.request();
    if (stream) {
      setTested(true);
      setSignalSeen(false);
    }
  };

  const errorState = ["denied", "blocked", "unavailable", "error", "insecure", "unsupported"].includes(status);
  const ready = status === "granted" && tested && signalSeen;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 sm:p-6",
        ready ? "border-success/40" : errorState ? "border-warning/40" : "border-border"
      )}
      role="region"
      aria-label="Microphone check"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            ready ? "bg-success/15 text-success" : "bg-brand-soft text-brand-bright"
          )}
        >
          {ready ? <Check className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">{ready ? "Microphone ready." : copy.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {ready
              ? "Your voice is coming through clearly. You're all set."
              : status === "requesting"
                ? "Tap Allow when your browser asks for microphone access."
                : status === "granted" && tested
                  ? "Speak for a few seconds — the meter below should move with your voice."
                  : detail || copy.body}
          </p>

          {status === "granted" && tested && (
            <div className="mt-4 space-y-3">
              <LiveWaveform waveform={waveform} active={true} />
              <VolumeMeter level={level} />
              {!signalSeen && (
                <p className="text-xs text-muted-foreground">
                  Waiting for your voice… say a sentence or two.
                </p>
              )}
              {signalSeen && !ready && (
                <p className="text-xs text-success">Signal detected.</p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {status !== "requesting" && (
              <Button onClick={runTest} className="gap-2" variant={ready ? "outline" : "default"}>
                {status === "granted" && tested ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Test again
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Test Microphone
                  </>
                )}
              </Button>
            )}
            {errorState && (
              <>
                {["denied", "blocked", "error", "unavailable"].includes(status) && (
                  <Button
                    variant="outline"
                    onClick={() => micManager.reconnect().then((s) => s && setTested(true))}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setHowTo(true)} className="gap-2 text-muted-foreground">
                  <ShieldQuestion className="h-4 w-4" />
                  How to Allow
                </Button>
              </>
            )}
            {!compact && ready && onReady && (
              <Button onClick={onReady} className="gap-2">
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
      <HowToAllowSheet open={howTo} onOpenChange={setHowTo} />
    </div>
  );
}
