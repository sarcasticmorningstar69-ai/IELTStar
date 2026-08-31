"use client";

/**
 * Client-side view routing for the single-route app.
 * Full Mock and active practice sessions run in focus mode (navigation hidden).
 */
import { create } from "zustand";

export type View =
  | { name: "dashboard" }
  | { name: "practice" }
  | { name: "part1" }
  | { name: "part2" }
  | { name: "part3" }
  | { name: "session"; kind: "part1" | "part2" | "part3"; topicIds: string[] }
  | { name: "mock-config" }
  | { name: "mock-check"; mockId: string }
  | { name: "mock-run"; mockId: string }
  | { name: "mock-review"; mockId: string }
  | { name: "learn"; tab?: "problems" | "techniques" | "tips" }
  | { name: "problem"; problemId: string }
  | { name: "technique"; groupId: string }
  | { name: "tips" }
  | { name: "videos" }
  | { name: "video"; videoId: string }
  | { name: "review" }
  | { name: "recordings" }
  | { name: "practice-again" }
  | { name: "notes" }
  | { name: "settings" }
  | { name: "topic-wheel" };

interface AppState {
  view: View;
  history: View[];
  sidebarCollapsed: boolean;
  navigate: (view: View) => void;
  back: () => void;
  canGoBack: () => boolean;
  toggleSidebar: () => void;
  setSidebar: (collapsed: boolean) => void;
}

export const FOCUS_VIEWS = new Set(["session", "mock-run", "mock-check"]);

export const useApp = create<AppState>((set, get) => ({
  view: { name: "dashboard" },
  history: [],
  sidebarCollapsed: false,
  navigate: (view) => {
    const { view: current, history } = get();
    if (JSON.stringify(current) === JSON.stringify(view)) return;
    set({ view, history: [current, ...history].slice(0, 30) });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  },
  back: () => {
    const { history, view } = get();
    if (history.length) {
      const [prev, ...rest] = history;
      set({ view: prev, history: rest });
    } else if (view.name !== "dashboard") {
      set({ view: { name: "dashboard" }, history: [] });
    }
  },
  canGoBack: () => get().history.length > 0,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebar: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));

export const viewTitle = (view: View): string => {
  switch (view.name) {
    case "dashboard": return "Your Speaking Progress";
    case "practice": return "Practice";
    case "part1": return "Part 1 — Everyday Conversation";
    case "part2": return "Part 2 — Long Turn";
    case "part3": return "Part 3 — Discussion";
    case "session": return view.kind === "part2" ? "Part 2 Practice" : `Part ${view.kind} Practice`;
    case "mock-config": return "Full Speaking Mock";
    case "mock-check": return "Microphone Check";
    case "mock-run": return "Full Speaking Mock";
    case "mock-review": return "Mock Review";
    case "learn": return "Learn";
    case "problem": return "Problem & Solution";
    case "technique": return "Technique";
    case "tips": return "Tips";
    case "videos": return "YouTube Mock Library";
    case "video": return "Watch & Practice";
    case "review": return "Recent Practice";
    case "recordings": return "My Recordings";
    case "practice-again": return "Practice Again";
    case "notes": return "Notes";
    case "settings": return "Settings";
    case "topic-wheel": return "Topic Wheel";
  }
};
