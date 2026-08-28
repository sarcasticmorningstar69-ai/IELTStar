"use client";

/**
 * Notes — a local-first practice notebook.
 * Category filter chips, new-note dialog, inline editing, safe deletion.
 */
import * as React from "react";
import { useProgress, type NoteItem } from "@/lib/store/progress";
import { topicTitle } from "@/lib/data/content";
import { PageHeader, EmptyState } from "@/components/shared/page-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Pencil, Trash2, NotebookPen } from "lucide-react";
import { formatStamp } from "./shared";

type NoteCategory = NoteItem["category"];

const NOTE_CATEGORIES: { key: NoteCategory; label: string }[] = [
  { key: "vocabulary", label: "Vocabulary" },
  { key: "phrase", label: "Phrases" },
  { key: "mistake", label: "Mistakes" },
  { key: "technique", label: "Techniques" },
  { key: "reflection", label: "Reflections" },
  { key: "mock", label: "Mock observations" },
  { key: "other", label: "Other" },
];

const CATEGORY_LABEL: Record<NoteCategory, string> = NOTE_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c.label;
    return acc;
  },
  {} as Record<NoteCategory, string>
);

interface NoteDraft {
  title: string;
  content: string;
  category: NoteCategory;
}

// ---------------------------------------------------------------------------
// Form fields (shared by the new-note dialog and inline editing)
// ---------------------------------------------------------------------------

function NoteFormFields({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: NoteDraft;
  submitLabel: string;
  onSubmit: (draft: NoteDraft) => void;
  onCancel?: () => void;
}) {
  const uid = React.useId();
  const [title, setTitle] = React.useState(initial.title);
  const [content, setContent] = React.useState(initial.content);
  const [category, setCategory] = React.useState<NoteCategory>(initial.category);
  const valid = title.trim().length > 0 && content.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({ title: title.trim(), content: content.trim(), category });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-title`}>Title</Label>
        <Input
          id={`${uid}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weather vocabulary"
          maxLength={120}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-category`}>Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as NoteCategory)}>
          <SelectTrigger id={`${uid}-category`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTE_CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-content`}>Note</Label>
        <Textarea
          id={`${uid}-content`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Words, phrases, what you noticed in your answers…"
          rows={5}
          className="resize-y"
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Note card (display + inline edit + delete confirm)
// ---------------------------------------------------------------------------

function CategoryPill({ category }: { category: NoteCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function NoteCard({ note }: { note: NoteItem }) {
  const [editing, setEditing] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const updateNote = useProgress((s) => s.updateNote);
  const deleteNote = useProgress((s) => s.deleteNote);
  const { toast } = useToast();

  if (editing) {
    return (
      <article className="rounded-xl border border-brand-bright/40 bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Editing note
        </div>
        <NoteFormFields
          initial={{ title: note.title, content: note.content, category: note.category }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(draft) => {
            updateNote(note.id, draft);
            setEditing(false);
            toast({ title: "Note updated" });
          }}
        />
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-px hover:border-brand-bright/25 hover:shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-balance text-sm font-semibold tracking-tight">{note.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <CategoryPill category={note.category} />
            <span className="text-xs text-muted-foreground">{formatStamp(note.updatedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit note: ${note.title}`}
            onClick={() => setEditing(true)}
            className="h-8 w-8"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete note: ${note.title}`}
            onClick={() => setConfirmOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{note.content}</p>
      {note.sourceTopicId && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          From practice · {topicTitle(note.sourceTopicId)}
        </div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{note.title}&rdquo; will be removed from this device. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteNote(note.id);
                toast({ title: "Note deleted" });
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function NotesView() {
  const notes = useProgress((s) => s.notes);
  const addNote = useProgress((s) => s.addNote);
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<NoteCategory | "all">("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const sorted = React.useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  );
  const filtered = React.useMemo(
    () => (filter === "all" ? sorted : sorted.filter((n) => n.category === filter)),
    [sorted, filter]
  );
  const counts = React.useMemo(() => {
    const map = new Map<NoteCategory, number>();
    for (const n of notes) map.set(n.category, (map.get(n.category) || 0) + 1);
    return map;
  }, [notes]);

  const chips: { key: NoteCategory | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: notes.length },
    ...NOTE_CATEGORIES.map((c) => ({ ...c, count: counts.get(c.key) || 0 })),
  ];

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        eyebrow="Notes"
        title="Your practice notebook."
        subtitle="Save words, phrases and observations from your practice — they stay on this device."
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            New note
          </Button>
        }
      />

      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          body="Save words, phrases and observations from your practice — they stay on this device."
          action={
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="gap-2">
              <NotebookPen className="h-4 w-4" aria-hidden />
              Write your first note
            </Button>
          }
        />
      ) : (
        <>
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin"
            role="group"
            aria-label="Filter notes by category"
          >
            {chips.map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  aria-pressed={active}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-brand-bright/60 bg-brand-soft text-foreground"
                      : "border-border text-muted-foreground hover:border-brand-bright/35 hover:text-foreground"
                  )}
                >
                  {chip.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{chip.count}</span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No notes in this category yet.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filtered.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
            <DialogDescription>
              A quick line is enough — notes are saved on this device only.
            </DialogDescription>
          </DialogHeader>
          <NoteFormFields
            initial={{ title: "", content: "", category: "vocabulary" }}
            submitLabel="Save note"
            onSubmit={(draft) => {
              addNote(draft);
              setDialogOpen(false);
              toast({ title: "Note saved" });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
