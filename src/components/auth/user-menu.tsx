"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  User as UserIcon,
  LogOut,
  Cloud,
  Check,
  Target,
  Sparkles,
} from "lucide-react";

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, profile, loading, openAuthModal, signOut } = useAuth();

  if (loading) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted/60" />
    );
  }

  if (!user) {
    if (compact) {
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openAuthModal("signin")}
          className="h-10 w-10 rounded-full text-muted-foreground hover:bg-brand-soft hover:text-brand-bright"
          aria-label="Sign In or Register"
          title="Sign in to sync progress"
        >
          <UserIcon className="h-[19px] w-[19px]" />
        </Button>
      );
    }

    return (
      <Button
        onClick={() => openAuthModal("signin")}
        className="h-9 gap-1.5 rounded-full border border-brand-bright/30 bg-brand-soft px-3.5 text-xs font-semibold text-brand-bright transition-all hover:bg-brand-soft/80 hover:shadow-sm"
      >
        <UserIcon className="h-3.5 w-3.5" />
        <span>Sign In</span>
      </Button>
    );
  }

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email?.slice(0, 2).toUpperCase() || "ST";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-bright/40 bg-brand-soft text-xs font-bold text-brand-bright shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="User Account Menu"
        >
          {profile?.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.avatarUrl}
              alt={profile.name || "User avatar"}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-xl">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold text-foreground">{profile?.name || "Student"}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="my-1.5 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-3.5 w-3.5 text-brand-bright" />
            <span>Target Score</span>
          </div>
          <span className="font-bold text-foreground">
            Band {profile?.targetBand ? profile.targetBand.toFixed(1) : "7.5"}
          </span>
        </div>

        <div className="my-1.5 flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-1.5 font-medium">
            <Cloud className="h-3.5 w-3.5" />
            <span>Cloud Synced</span>
          </div>
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="cursor-pointer gap-2 rounded-xl text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
