"use client";

import * as React from "react";
import { useApp, FOCUS_VIEWS, navCategory, type View } from "@/lib/store/app";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { BrandLockup, StarMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Home, Mic, BookOpen, History,
  Sun, Moon, Menu as MenuIcon, Video, SlidersHorizontal,
  NotebookPen, Repeat2, ChevronLeft,
} from "lucide-react";

interface NavItem {
  key: "home" | "speak" | "study" | "watch" | "review" | "settings";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  view: View;
}

const NAV_PRIMARY: NavItem[] = [
  { key: "home", label: "Home", icon: Home, view: { name: "dashboard" } },
  { key: "speak", label: "Speak", icon: Mic, view: { name: "practice" } },
  { key: "study", label: "Study", icon: BookOpen, view: { name: "learn", tab: "problems" } },
  { key: "watch", label: "Watch", icon: Video, view: { name: "videos" } },
  { key: "review", label: "Review", icon: History, view: { name: "review" } },
];

const NAV_SECONDARY: NavItem[] = [
  { key: "settings", label: "Settings", icon: SlidersHorizontal, view: { name: "settings" } },
];

const MENU_EXTRAS: { label: string; icon: React.ComponentType<{ className?: string }>; view: View }[] = [
  { label: "Practice Again", icon: Repeat2, view: { name: "practice-again" } },
  { label: "Notes", icon: NotebookPen, view: { name: "notes" } },
];

function isActive(current: View, item: NavItem): boolean {
  return navCategory(current) === item.key;
}

/**
 * Theme toggle with an animated switch: a circular reveal expands from the
 * button (View Transitions API) or, where unsupported, a brief global color
 * cross-fade. The theme class is swapped with pure DOM operations inside the
 * transition callback — React state (next-themes) is synced after the
 * animation finishes, which keeps the transition capture-safe.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const switchingRef = React.useRef(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true;

  const setDomTheme = (next: "dark" | "light") => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(next);
    root.style.colorScheme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — next-themes will retry */
    }
  };

  const toggle = () => {
    if (switchingRef.current) return;
    const current = document.documentElement.classList.contains("dark")
      ? "dark"
      : ("light" as const);
    const next: "dark" | "light" = current === "dark" ? "light" : "dark";
    const doc = document.documentElement as HTMLElement & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduce && typeof doc.startViewTransition === "function") {
      switchingRef.current = true;
      try {
        const transition = doc.startViewTransition(() => {
          setDomTheme(next);
        });
        transition.finished
          .catch(() => {})
          .finally(() => {
            switchingRef.current = false;
            setDomTheme(next);
            setTheme(next);
          });
      } catch {
        switchingRef.current = false;
        setDomTheme(next);
        setTheme(next);
      }
    } else if (!reduce) {
      doc.classList.add("theme-fading");
      setDomTheme(next);
      setTheme(next);
      window.setTimeout(() => doc.classList.remove("theme-fading"), 480);
    } else {
      setDomTheme(next);
      setTheme(next);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to day mode" : "Switch to dark mode"}
      onClick={toggle}
      className="h-10 w-10 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  );
}

function BackButton() {
  const back = useApp((s) => s.back);
  const canGoBack = useApp((s) => s.history.length > 0);
  const view = useApp((s) => s.view);
  const focus = FOCUS_VIEWS.has(view.name);
  if (!canGoBack || focus) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={back}
      aria-label="Go back"
      className="-ml-2 gap-1 text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const view = useApp((s) => s.view);
  const navigate = useApp((s) => s.navigate);
  const [menuOpen, setMenuOpen] = React.useState(false);

  if (FOCUS_VIEWS.has(view.name)) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  const sidebarNav = [...NAV_PRIMARY, ...NAV_SECONDARY];
  const category = navCategory(view);
  const menuActive = category === "review" || category === "settings";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 z-30 hidden h-screen w-[72px] shrink-0 flex-col items-center border-r border-border bg-sidebar py-5 lg:flex">
        <button
          type="button"
          onClick={() => navigate({ name: "dashboard" })}
          className="mb-6 rounded-xl p-1.5 transition-transform duration-300 hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="IELTStar Speaking Lab home"
        >
          <StarMark size={36} />
        </button>

        <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto scrollbar-thin py-1" aria-label="Main">
          {sidebarNav.map((item, i) => {
            const active = isActive(view, item);
            const Icon = item.icon;
            const isSecondary = i >= NAV_PRIMARY.length;
            return (
              <React.Fragment key={item.label}>
                {isSecondary && i === NAV_PRIMARY.length && (
                  <span className="my-1.5 h-px w-7 bg-border" aria-hidden />
                )}
                <button
                  type="button"
                  onClick={() => navigate(item.view)}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200",
                    active
                      ? "bg-brand-soft text-brand-bright"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  {active && (
                    <span
                      className="absolute top-1/2 -left-[10px] h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-bright"
                      aria-hidden
                    />
                  )}
                  <Icon className="h-[21px] w-[21px] transition-transform duration-200 group-hover:scale-110" />
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="pt-3">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <BackButton />
            <button
              type="button"
              onClick={() => navigate({ name: "dashboard" })}
              aria-label="IELTStar Speaking Lab home"
            >
              <BrandLockup compact />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <MenuIcon className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0">
                <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                <div className="flex h-full flex-col">
                  <div className="flex h-16 items-center border-b border-border px-5">
                    <BrandLockup />
                  </div>
                  <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-3" aria-label="Menu">
                    {[...NAV_PRIMARY, ...MENU_EXTRAS, ...NAV_SECONDARY].map((item) => {
                      const active =
                        "key" in item
                          ? isActive(view, item as NavItem)
                          : view.name === item.view.name;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            navigate(item.view);
                            setMenuOpen(false);
                          }}
                          className={cn(
                            "tap-anim flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors",
                            active
                              ? "bg-brand-soft text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <span className={cn("flex h-6 w-6 items-center justify-center", active && "text-brand-bright")}>
                            <Icon className="h-5 w-5" />
                          </span>
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                    Your speaking recordings are stored on this device.
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <header className="sticky top-0 z-40 hidden h-16 items-center border-b border-border bg-background/90 px-8 backdrop-blur-md lg:flex">
          <BackButton />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
          {children}
        </main>

        <footer className="mt-auto border-t border-border bg-background px-4 py-4 text-center text-xs text-muted-foreground lg:hidden">
          IELTStar Speaking Lab — recordings stay on your device
        </footer>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV_PRIMARY.slice(0, 4).map((item) => {
            const active = isActive(view, item);
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap-anim flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 transition-colors",
                  active ? "text-brand-bright" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-all duration-200",
                    active && "scale-110 bg-brand-soft"
                  )}
                >
                  <Icon className="h-[21px] w-[21px]" />
                </span>
                <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              </button>
            );
          })}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className={cn(
                  "tap-anim flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 transition-colors",
                  menuActive ? "text-brand-bright" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-all duration-200",
                    menuActive && "scale-110 bg-brand-soft"
                  )}
                >
                  <MenuIcon className="h-[21px] w-[21px]" />
                </span>
                <span className="text-[10px] font-medium tracking-wide">More</span>
              </button>
            </SheetTrigger>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}
