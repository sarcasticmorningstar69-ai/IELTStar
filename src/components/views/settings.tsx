"use client";

/**
 * Settings — appearance, recording retention, local backup, privacy, about.
 * Destructive actions are always confirmed; nothing leaves the device.
 */
import * as React from "react";
import { useTheme } from "next-themes";
import { useProgress, type Settings } from "@/lib/store/progress";
import { estimateAudioUsage } from "@/lib/storage/audio-db";
import { PageHeader, SectionCard } from "@/components/shared/page-kit";
import { StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Moon, Sun, Check, Download, Upload, Trash2, HardDrive, ShieldCheck, SlidersHorizontal, Target } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { formatBytes } from "./review/shared";

const RETENTION_OPTIONS: {
  value: Settings["keepRecordings"];
  label: string;
  hint: string;
}[] = [
  { value: "forever", label: "Keep forever", hint: "Recommended — nothing is removed" },
  { value: "1d", label: "1 day", hint: "Light on storage" },
  { value: "1w", label: "1 week", hint: "A weekly clean-up rhythm" },
  { value: "1m", label: "1 month", hint: "Room for a long review window" },
  { value: "3m", label: "3 months", hint: "Keep a full season of practice" },
];

function fileStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function SettingsView() {
  const { toast } = useToast();
  const { resolvedTheme, setTheme } = useTheme();
  const { profile, openAuthModal } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const settings = useProgress((s) => s.settings);
  const updateSettings = useProgress((s) => s.updateSettings);
  const clearAllRecordings = useProgress((s) => s.clearAllRecordings);
  const exportData = useProgress((s) => s.exportData);
  const importData = useProgress((s) => s.importData);
  const resetAll = useProgress((s) => s.resetAll);
  const recordingsCount = useProgress((s) => s.recordings.length);

  const [usage, setUsage] = React.useState<number | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [resetStep, setResetStep] = React.useState<0 | 1 | 2>(0);
  const [resetting, setResetting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let alive = true;
    estimateAudioUsage().then((u) => {
      if (alive) setUsage(u);
    });
    return () => {
      alive = false;
    };
  }, [recordingsCount]);

  const activeTheme = mounted ? (resolvedTheme === "light" ? "light" : "dark") : "dark";

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ieltstar-progress-${fileStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({
      title: "Progress exported",
      description: "Your progress file has been downloaded — keep it somewhere safe.",
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const text = await file.text();
    const ok = importData(text);
    if (ok) {
      toast({
        title: "Progress imported",
        description: "Your saved progress has been restored on this device.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: "That file doesn't look like an IELTStar progress export.",
      });
    }
  };

  const handleClearAll = async () => {
    await clearAllRecordings();
    toast({
      title: "All recordings deleted",
      description: "Your practice history and notes were not touched.",
    });
  };

  const handleReset = async () => {
    setResetting(true);
    await clearAllRecordings();
    resetAll();
    setResetting(false);
    setResetStep(0);
    toast({
      title: "All progress cleared",
      description: "You're starting fresh — your first session will rebuild your history.",
    });
  };

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Make it yours."
        subtitle="Everything here applies to this device only — your data stays with you."
      />

      {/* Appearance */}
      <SectionCard title="Appearance" hint={activeTheme === "dark" ? "Dark" : "Day"}>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            aria-pressed={activeTheme === "dark"}
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all",
              activeTheme === "dark"
                ? "border-brand-bright/60 bg-brand-soft text-foreground"
                : "border-border text-muted-foreground hover:border-brand-bright/35 hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              <Moon className="h-4 w-4" aria-hidden />
              Dark
            </span>
            {activeTheme === "dark" && <Check className="h-4 w-4 text-brand-bright" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            aria-pressed={activeTheme === "light"}
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all",
              activeTheme === "light"
                ? "border-brand-bright/60 bg-brand-soft text-foreground"
                : "border-border text-muted-foreground hover:border-brand-bright/35 hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              <Sun className="h-4 w-4" aria-hidden />
              Day
            </span>
            {activeTheme === "light" && <Check className="h-4 w-4 text-brand-bright" aria-hidden />}
          </button>
        </div>
      </SectionCard>

      {/* Target score & timeline */}
      <SectionCard
        title="Target score & exam timeline"
        hint={profile?.targetBand ? `Band ${profile.targetBand.toFixed(1)}` : "Not set"}
      >
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {profile?.targetBand
            ? `Your practice roadmap and Stella's AI feedback are calibrated for Band ${profile.targetBand.toFixed(1)}. You can rotate the dial anytime to adjust your target score and exam timeline.`
            : "No target score has been set yet. Rotate the rotary band dial and choose your exam timeline to unlock your custom AI practice roadmap."}
        </p>
        <Button
          onClick={() => openAuthModal("target-band")}
          className="gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{profile?.targetBand ? "Change Target Score & Timeline" : "Set Target Score & Timeline"}</span>
        </Button>
      </SectionCard>

      {/* Recordings retention */}
      <SectionCard
        title="Recordings retention"
        hint={
          recordingsCount > 0
            ? `${recordingsCount} ${recordingsCount === 1 ? "recording" : "recordings"}${usage !== null ? ` · ${formatBytes(usage)}` : ""}`
            : undefined
        }
      >
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Older recordings may be cleaned up automatically. Your progress and notes are never
          touched.
        </p>
        <RadioGroup
          value={settings.keepRecordings}
          onValueChange={(v) => updateSettings({ keepRecordings: v as Settings["keepRecordings"] })}
          className="gap-2 sm:max-w-lg"
        >
          {RETENTION_OPTIONS.map((o) => (
            <Label
              key={o.value}
              htmlFor={`retention-${o.value}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                settings.keepRecordings === o.value
                  ? "border-brand-bright/60 bg-brand-soft"
                  : "border-border hover:border-brand-bright/35"
              )}
            >
              <RadioGroupItem value={o.value} id={`retention-${o.value}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Free up space by removing every recording at once. Your notes and progress stay.
              </span>
            </div>
            <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recordingsCount === 0}
                  className="gap-1.5 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Clear all recordings
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all recordings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All {recordingsCount} {recordingsCount === 1 ? "recording" : "recordings"} will
                    be removed from this device to free up space. Your practice history, notes and
                    settings are not affected. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep them</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAll}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Delete all recordings
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SectionCard>

      {/* Backup */}
      <SectionCard title="Backup" hint="this device only">
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Export your progress as a small file, and bring it back on this or another device. Audio
          is not included — your recordings remain on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" aria-hidden />
            Export Progress
          </Button>

          <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" aria-hidden />
                Import Progress
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Import replaces your current progress</AlertDialogTitle>
                <AlertDialogDescription>
                  Everything you&apos;ve done on this device so far — sessions, notes, problems,
                  streak — will be replaced by the file you choose. Recordings are not included in
                  backups. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => fileRef.current?.click()}>
                  Choose file
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
          tabIndex={-1}
          aria-hidden
        />
      </SectionCard>

      {/* Data & privacy */}
      <SectionCard title="Data & privacy">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-bright">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your speaking recordings and progress are stored only in this browser on this device.
            Nothing is uploaded.
          </p>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Starting over? This removes everything recorded so far.
            </span>
            <AlertDialog open={resetStep === 1} onOpenChange={(open) => !open && setResetStep(0)}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setResetStep(1)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Reset all progress
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all progress?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears your sessions, recordings, notes, identified problems and settings
                    on this device.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      setResetStep(2);
                    }}
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Second confirmation */}
            <AlertDialog open={resetStep === 2} onOpenChange={(open) => !open && setResetStep(0)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Everything will be gone — recordings, notes, progress. This cannot be undone.
                    Consider exporting a backup first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={resetting}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleReset();
                    }}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Yes, reset everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SectionCard>

      {/* About */}
      <SectionCard title="About">
        <div className="flex items-center gap-4">
          <StarMark size={44} className="shrink-0" />
          <div>
            <div className="text-base font-semibold tracking-tight">IELTStar Speaking Lab</div>
            <div className="mt-0.5 text-sm text-muted-foreground">Local-first speaking practice</div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
