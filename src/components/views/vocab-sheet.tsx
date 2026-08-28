"use client";

import * as React from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { VocabItem } from "@/lib/data/content";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

export function VocabSheet({
  open,
  onOpenChange,
  title,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: VocabItem[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto scrollbar-thin rounded-t-3xl sm:max-w-lg sm:mx-auto sm:rounded-3xl sm:border"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-brand-bright" />
            Useful Language
          </SheetTitle>
          <SheetDescription>
            {title} — words and chunks you <em>can</em> use naturally. No need to force them in.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-8">
          {items.map((v, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand-bright/30"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold tracking-tight">{v.phrase}</span>
                <Badge
                  variant="outline"
                  className="rounded-full border-brand-bright/40 px-2 text-[10px] font-semibold text-brand-bright"
                >
                  {v.level}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{v.definition}</p>
              {v.example && (
                <p className="mt-2 border-l-2 border-brand-bright/40 pl-3 text-sm italic leading-relaxed text-foreground/85">
                  {v.example}
                </p>
              )}
            </div>
          ))}
          {!items.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No vocabulary list is attached to this topic.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
