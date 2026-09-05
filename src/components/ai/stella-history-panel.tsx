"use client";

import * as React from "react";
import { type ConversationSummary } from "@/lib/ai/chat-history";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  History as HistoryIcon,
  MessageSquare,
  Plus,
  Trash2,
  Video as VideoIcon,
  ShieldCheck,
  CheckCircle2,
  Mic,
  Award,
} from "lucide-react";

export function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

export interface StellaHistoryPanelProps {
  historyList: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onStartNewChat: () => void;
  onCloseHistory: () => void;
  onOpenPrivacyNotice?: () => void;
  title?: string;
  className?: string;
}

export function StellaHistoryPanel({
  historyList,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onStartNewChat,
  onCloseHistory,
  onOpenPrivacyNotice,
  title = "Coaching & Review History",
  className,
}: StellaHistoryPanelProps) {
  return (
    <div
      className={cn(
        "flex-1 min-h-0 flex flex-col bg-card animate-in fade-in duration-150 h-full overflow-hidden",
        className
      )}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface/40 shrink-0">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-brand-bright" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-bright">
            {historyList.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCloseHistory}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
        >
          <MessageSquare className="h-3 w-3" />
          <span>Back to Chat</span>
        </Button>
      </div>

      {/* New Thread CTA */}
      <div className="p-3 border-b border-border bg-card shrink-0">
        <button
          type="button"
          onClick={onStartNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-bright/40 bg-brand-soft py-2 px-3 text-xs font-semibold text-brand-bright transition-all hover:bg-brand-soft/80 shadow-xs cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Start New Coaching Thread</span>
        </button>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin text-xs bg-card">
        {historyList.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <HistoryIcon className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium">No previous coaching sessions.</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-xs mx-auto">
              Conversations and speaking evaluations you have with Stella will appear here.
            </p>
          </div>
        ) : (
          historyList.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-start justify-between gap-2.5 rounded-xl p-3 transition-colors cursor-pointer border text-left",
                  isActive
                    ? "border-brand-bright/40 bg-brand-soft/50 text-foreground shadow-xs"
                    : "border-transparent hover:border-border hover:bg-surface text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs truncate">
                    {conv.hasReview ? (
                      <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    ) : conv.scopeKey.startsWith("video:") ? (
                      <VideoIcon className="h-3 w-3 text-brand-bright shrink-0" />
                    ) : (
                      <MessageSquare className="h-3 w-3 text-brand-bright shrink-0" />
                    )}
                    <span className="truncate text-foreground font-semibold">{conv.title}</span>
                  </div>

                  {/* Review / Audio Badges */}
                  {conv.hasReview && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {conv.overallBand !== null && conv.overallBand !== undefined ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Band {Math.round(conv.overallBand)}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <span>Speaking Review</span>
                        </span>
                      )}
                      {(conv.recordingCount || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Mic className="h-2.5 w-2.5" />
                          <span>{conv.recordingCount} recordings</span>
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] truncate opacity-70 leading-snug">{conv.lastMessageSnippet}</p>

                  <div className="text-[10px] opacity-50 flex items-center gap-2">
                    <span>{formatRelativeTime(conv.updatedAt)}</span>
                    <span>•</span>
                    <span>{conv.messageCount} messages</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity cursor-pointer shrink-0"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 bg-surface/50 text-[11px] space-y-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>Local-first • Synced across devices with Supabase</span>
        </div>
        {onOpenPrivacyNotice && (
          <button
            type="button"
            onClick={onOpenPrivacyNotice}
            className="flex items-center gap-1 text-brand-bright hover:underline text-[11px] cursor-pointer"
          >
            <ShieldCheck className="h-3 w-3" />
            <span>AI Data Transparency &amp; Privacy Notice</span>
          </button>
        )}
      </div>
    </div>
  );
}
