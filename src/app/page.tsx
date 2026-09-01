"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/lib/store/app";
import { AppShell } from "@/components/shared/app-shell";
import { AiAssistant } from "@/components/ai/ai-assistant";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => (
  <div className="space-y-4 pt-4">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-4 w-96 max-w-full" />
    <div className="grid grid-cols-2 gap-4 pt-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  </div>
);

const DashboardView = dynamic(() => import("@/components/views/dashboard").then((m) => m.DashboardView), { loading: Loading });
const PracticeHubView = dynamic(() => import("@/components/views/practice-hub").then((m) => m.PracticeHubView), { loading: Loading });
const TopicBrowserView = dynamic(() => import("@/components/views/topic-browsers").then((m) => m.TopicBrowserView), { loading: Loading });
const Part2BrowserView = dynamic(() => import("@/components/views/topic-browsers").then((m) => m.Part2BrowserView), { loading: Loading });
const SessionView = dynamic(() => import("@/components/views/session-view").then((m) => m.SessionView), { loading: () => <div className="pt-16 text-center text-sm text-muted-foreground">Preparing your session…</div> });
const MockConfigView = dynamic(() => import("@/components/views/mock-config").then((m) => m.MockConfigView), { loading: Loading });
const MockCheckView = dynamic(() => import("@/components/views/mock-run").then((m) => m.MockCheckView), { loading: Loading });
const MockRunView = dynamic(() => import("@/components/views/mock-run").then((m) => m.MockRunView), { loading: () => <div className="pt-16 text-center text-sm text-muted-foreground">Starting your mock…</div> });
const MockReviewView = dynamic(() => import("@/components/views/mock-review").then((m) => m.MockReviewView), { loading: Loading });
const StellaWorkspaceView = dynamic(() => import("@/components/ai/stella-workspace").then((m) => m.StellaWorkspaceView), { loading: () => <div className="pt-16 text-center text-sm text-muted-foreground">Opening your analysis…</div> });
const LearnView = dynamic(() => import("@/components/views/learn/learn-hub").then((m) => m.LearnView), { loading: Loading });
const ProblemDetailView = dynamic(() => import("@/components/views/learn/problem-detail").then((m) => m.ProblemDetailView), { loading: Loading });
const TechniqueDetailView = dynamic(() => import("@/components/views/learn/technique-detail").then((m) => m.TechniqueDetailView), { loading: Loading });
const VideosView = dynamic(() => import("@/components/views/videos").then((m) => m.VideosView), { loading: Loading });
const VideoPracticeView = dynamic(() => import("@/components/views/videos").then((m) => m.VideoPracticeView), { loading: Loading });
const ReviewHubView = dynamic(() => import("@/components/views/review/review-hub").then((m) => m.ReviewHubView), { loading: Loading });
const RecordingsView = dynamic(() => import("@/components/views/review/recordings").then((m) => m.RecordingsView), { loading: Loading });
const PracticeAgainView = dynamic(() => import("@/components/views/review/practice-again").then((m) => m.PracticeAgainView), { loading: Loading });
const NotesView = dynamic(() => import("@/components/views/review/notes").then((m) => m.NotesView), { loading: Loading });
const SettingsView = dynamic(() => import("@/components/views/settings").then((m) => m.SettingsView), { loading: Loading });
const TopicWheelView = dynamic(() => import("@/components/views/topic-wheel").then((m) => m.TopicWheelView), { loading: Loading });

function CurrentView() {
  const view = useApp((s) => s.view);
  switch (view.name) {
    case "dashboard":
      return <DashboardView />;
    case "practice":
      return <PracticeHubView />;
    case "part1":
      return <TopicBrowserView part={1} />;
    case "part2":
      return <Part2BrowserView />;
    case "part3":
      return <TopicBrowserView part={3} />;
    case "session":
      return <SessionView kind={view.kind} topicIds={view.topicIds} />;
    case "mock-config":
      return <MockConfigView />;
    case "mock-check":
      return <MockCheckView mockId={view.mockId} />;
    case "mock-run":
      return <MockRunView mockId={view.mockId} />;
    case "mock-review":
      return <MockReviewView mockId={view.mockId} />;
    case "mock-analysis":
      return <StellaWorkspaceView mockId={view.mockId} recordingIds={view.recordingIds} />;
    case "learn":
      return <LearnView tab={view.tab} />;
    case "problem":
      return <ProblemDetailView problemId={view.problemId} />;
    case "technique":
      return <TechniqueDetailView groupId={view.groupId} />;
    case "videos":
      return <VideosView />;
    case "video":
      return <VideoPracticeView videoId={view.videoId} />;
    case "review":
      return <ReviewHubView />;
    case "recordings":
      return <RecordingsView />;
    case "practice-again":
      return <PracticeAgainView />;
    case "notes":
      return <NotesView />;
    case "settings":
      return <SettingsView />;
    case "topic-wheel":
      return <TopicWheelView />;
    default:
      return <DashboardView />;
  }
}

export default function Home() {
  const view = useApp((s) => s.view);
  // The analysis workspace is the whole screen; the floating assistant would
  // just sit on top of Stella talking to herself.
  const hideAssistant = view.name === "mock-analysis";
  return (
    <AppShell>
      <CurrentView />
      {!hideAssistant && <AiAssistant />}
    </AppShell>
  );
}
