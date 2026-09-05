"use client";

/**
 * Stella's full-window analysis workspace.
 *
 * LEFT: conversation with Stella (or coaching history panel).
 * RIGHT: one card per recording — audio player, status, and an expandable
 *        transcript, followed by the overall assessment for the submission
 *        (rendered via WorkspaceReviewPanel).
 *
 * Nothing on this screen is invented. If Stella has not returned a result for
 * a recording, the card says so; it never shows a sample transcript or a
 * placeholder band score. Deepgram's transcript is the only transcript: a
 * student-typed correction is stored and displayed separately, clearly marked
 * as not verified against the audio.
 */
import * as React from "react";
import { useApp } from "@/lib/store/app";
import { useProgress, type RecordingMeta } from "@/lib/store/progress";
import { useAuth } from "@/lib/auth/auth-context";
import { getAudio } from "@/lib/storage/audio-db";
import { formatTime } from "@/components/audio/audio-ui";
import { StellaAvatar } from "@/components/ai/stella-avatar";
import { type StellaState } from "@/lib/ai/stella-media";
import type {
  AiAnalysisRequest,
  AiAnalysisResult,
  AiAnswerAnalysis,
  AiAnswerFailure,
  AiSurface,
} from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FormattedChatMessage } from "@/components/ai/formatted-chat-message";
import { TypewriterText, useReasoningPhrase } from "@/components/ai/typewriter-text";
import { WorkspaceReviewPanel } from "@/components/ai/workspace-review-panel";
import { StellaHistoryPanel } from "@/components/ai/stella-history-panel";
import {
  createConversation,
  loadConversation,
  saveMessageToConversation,
  saveConversationAnalysis,
  listConversations,
  deleteConversation,
  findConversationByScope,
  type ConversationSummary,
} from "@/lib/ai/chat-history";
import {
  Info,
  Maximize2,
  Minimize2,
  ArrowUp,
  X,
  History as HistoryIcon,
} from "lucide-react";

const REQUEST_TIMEOUT_MS = 6 * 60 * 1000;

type Stage = "idle" | "preparing" | "uploading" | "reviewing" | "done";

interface ChatMessage {
  id: string;
  sender: "stella" | "user";
  text: string;
  timestamp: string;
  isCorrection?: boolean;
}

function clockLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type UploadResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
};

/**
 * POST a multipart body with real upload progress.
 */
function postFormWithProgress(
  url: string,
  form: FormData,
  token: string | null,
  onProgress: (ratio: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        body = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () =>
      reject(new Error("Your connection dropped before Stella received the recordings."));
    xhr.ontimeout = () =>
      reject(new Error("That took too long. Your recordings are still saved on this device."));
    xhr.send(form);
  });
}

export function StellaWorkspaceView({
  recordingIds,
  mockId,
  sessionId,
  heading,
}: {
  recordingIds: string[];
  mockId?: string;
  sessionId?: string;
  heading?: string;
}) {
  const navigate = useApp((s) => s.navigate);
  const back = useApp((s) => s.back);
  const mocks = useProgress((s) => s.mocks);
  const recordings = useProgress((s) => s.recordings);
  const { user, session, openAuthModal } = useAuth();

  const mock = React.useMemo(
    () => (mockId ? mocks.find((m) => m.id === mockId) : undefined),
    [mocks, mockId]
  );

  /** Only real recordings. A missing recording is reported, never invented. */
  const answers = React.useMemo(() => {
    const byId = new Map(recordings.map((r) => [r.id, r]));
    return recordingIds
      .map((id) => byId.get(id))
      .filter((r): r is RecordingMeta => Boolean(r));
  }, [recordingIds, recordings]);

  const isFullMock = Boolean(mockId) && answers.length > 1;

  const [mobileTab, setMobileTab] = React.useState<"chat" | "evaluation">("evaluation");

  // ---- Conversation & History state --------------------------------------
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const conversationIdRef = React.useRef<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [historyList, setHistoryList] = React.useState<ConversationSummary[]>([]);

  const scopeKey = mockId
    ? `mock:${mockId}`
    : sessionId
      ? `session:${sessionId}`
      : `recordings:${recordingIds.slice(0, 3).join(",")}`;

  const convTitle =
    heading ||
    (mockId
      ? "Full Mock Review"
      : answers.length === 1
        ? `${answers[0].label} Review`
        : `${answers.length} Answers Evaluation`);

  // ---- Analysis state ----------------------------------------------------
  const [stage, setStage] = React.useState<Stage>("idle");
  const [uploadRatio, setUploadRatio] = React.useState(0);
  const [result, setResult] = React.useState<AiAnalysisResult | null>(null);
  const [failures, setFailures] = React.useState<AiAnswerFailure[]>([]);
  const [notice, setNotice] = React.useState("");
  const [corrections, setCorrections] = React.useState<Record<string, string>>({});
  const startedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const requestIdRef = React.useRef<string>(
    `req${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  );

  const running = stage === "preparing" || stage === "uploading" || stage === "reviewing";

  // ---- Chat state --------------------------------------------------------
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  /**
   * Only the newest reply types itself out. Older messages, and anything
   * restored from saved history, render immediately.
   */
  const [revealMessageId, setRevealMessageId] = React.useState<string | null>(null);

  /** What Stella is doing right now, rotated while the request is open. */
  const reasoningPhrase = useReasoningPhrase(chatLoading);

  const scrollChatToBottom = React.useCallback(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const analysisByRecording = React.useMemo(() => {
    const map = new Map<string, AiAnswerAnalysis>();
    (result?.answers || []).forEach((item) => map.set(item.recordingId, item));
    return map;
  }, [result]);

  const failureByRecording = React.useMemo(() => {
    const map = new Map<string, AiAnswerFailure>();
    failures.forEach((item) => map.set(item.recordingId, item));
    return map;
  }, [failures]);

  // Sync active conversationId to ref
  React.useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Load existing session or create conversation on mount
  React.useEffect(() => {
    if (!answers.length) return;
    const found = findConversationByScope({ mockId, sessionId, recordingIds });
    if (found) {
      setConversationId(found.id);
      conversationIdRef.current = found.id;
      if (found.analysisResult) {
        setResult(found.analysisResult);
        setStage("done");
        startedRef.current = true;
      }
      if (found.messages && found.messages.length > 0) {
        setChatMessages(
          found.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            timestamp: m.timestamp,
          }))
        );
      }
    } else {
      const newConv = createConversation(scopeKey, convTitle, {
        recordingIds,
        mockId,
        sessionId,
        heading,
      });
      setConversationId(newConv.id);
      conversationIdRef.current = newConv.id;
    }
  }, [answers.length, mockId, sessionId, recordingIds, scopeKey, convTitle, heading]);

  const runAnalysis = React.useCallback(
    async (onlyRecordingIds?: string[]) => {
      if (!answers.length || inFlightRef.current) return;

      const selected = onlyRecordingIds
        ? answers.filter((r) => onlyRecordingIds.includes(r.id))
        : answers;
      if (!selected.length) return;

      inFlightRef.current = true;
      setNotice("");
      setUploadRatio(0);
      setStage("preparing");

      const surface: AiSurface = mockId
        ? "full-mock"
        : selected.every((r) => r.part === selected[0].part)
          ? (`part${selected[0].part}` as AiSurface)
          : "recordings";

      try {
        const stored = await Promise.all(
          selected.map(async (r) => ({ meta: r, audio: await getAudio(r.id) }))
        );
        const available = stored.filter(
          (item): item is { meta: RecordingMeta; audio: NonNullable<typeof item.audio> } =>
            Boolean(item.audio)
        );
        const lost = stored.filter((item) => !item.audio);

        if (!available.length) {
          setNotice(
            "The audio for these answers is no longer stored on this device, so Stella cannot analyse them."
          );
          setStage("idle");
          return;
        }

        const request: AiAnalysisRequest = {
          mode: "mock-analysis",
          surface,
          mockId,
          sessionId,
          analysisRequestId: requestIdRef.current,
          scope: isFullMock && !onlyRecordingIds ? "entire-mock" : "selected-answers",
          answers: available.map(({ meta }) => {
            const segment = mock?.segments.find(
              (s) =>
                (meta.questionId && s.questionId === meta.questionId) ||
                s.label === meta.label
            );
            return {
              recordingId: meta.id,
              part: meta.part,
              questionLabel: meta.label,
              topicId: meta.topicId,
              questionId: meta.questionId,
              duration: meta.duration,
              startOffset: segment?.startOffset,
            };
          }),
        };

        const form = new FormData();
        form.append("metadata", JSON.stringify(request));
        available.forEach(({ meta, audio }) => {
          const isMp4 = audio.mimeType?.includes("mp4") || audio.blob.type?.includes("mp4");
          const ext = isMp4 ? "mp4" : "webm";
          const mime = audio.blob.type || audio.mimeType || (isMp4 ? "audio/mp4" : "audio/webm");
          const blob = audio.blob.type ? audio.blob : new Blob([audio.blob], { type: mime });
          form.append(`audio:${meta.id}`, blob, `${meta.id}.${ext}`);
        });

        setStage("uploading");
        const response = await postFormWithProgress(
          "/api/ai/evaluate",
          form,
          session?.access_token || null,
          (ratio) => {
            setUploadRatio(ratio);
            if (ratio >= 1) setStage("reviewing");
          }
        );
        setStage("reviewing");

        const body = response.body || {};
        if (!response.ok) {
          const failed = Array.isArray(body.failedAnswers)
            ? (body.failedAnswers as AiAnswerFailure[])
            : [];
          setFailures(failed);
          setNotice(
            typeof body.message === "string"
              ? body.message
              : "Stella couldn't analyse this submission. Your recordings are safe on this device."
          );
          setStage("idle");
          return;
        }

        const fresh = body as unknown as AiAnalysisResult;
        setResult((previous) => {
          if (!previous || !onlyRecordingIds) return fresh;
          const merged = new Map<string, AiAnswerAnalysis>();
          previous.answers.forEach((item) => merged.set(item.recordingId, item));
          fresh.answers.forEach((item) => merged.set(item.recordingId, item));
          return { ...fresh, answers: Array.from(merged.values()) };
        });

        const currentConvId = conversationIdRef.current;
        if (currentConvId) {
          saveConversationAnalysis(currentConvId, fresh, answers.map((a) => a.id));
        }

        const stillFailed = [
          ...(fresh.failedAnswers || []),
          ...lost.map(({ meta }) => ({
            recordingId: meta.id,
            questionLabel: meta.label,
            code: "TRANSCRIPTION_FAILED" as const,
            message: "The audio for this answer is not stored on this device.",
          })),
        ];
        setFailures(stillFailed);
        setStage("done");

        setChatMessages((previous) => {
          if (previous.length > 0) return previous;
          const bandLine =
            fresh.overallBand === null || fresh.overallBand === undefined
              ? "I've reviewed your speaking, but there wasn't enough clear speech for me to put a band on it."
              : `I've reviewed your speaking. My estimate is Band ${fresh.overallBand}.`;

          const welcomeMsg: ChatMessage = {
            id: `welcome-${Date.now()}`,
            sender: "stella",
            text: `${bandLine}\n\nEach recording is on the right with its own player. Open "Show transcript" under any answer to read exactly what the speech recogniser heard. Ask me anything about your answers below.`,
            timestamp: clockLabel(),
          };

          if (currentConvId) {
            saveMessageToConversation(
              currentConvId,
              {
                id: welcomeMsg.id,
                sender: "stella",
                text: welcomeMsg.text,
                timestamp: welcomeMsg.timestamp,
              },
              user?.id
            );
          }

          setRevealMessageId(welcomeMsg.id);
          return [welcomeMsg];
        });
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Stella couldn't be reached. Your recordings are safe on this device."
        );
        setStage("idle");
      } finally {
        inFlightRef.current = false;
        setUploadRatio(0);
      }
    },
    [answers, isFullMock, mock, mockId, session?.access_token, sessionId, user?.id]
  );

  React.useEffect(() => {
    if (!user || startedRef.current || !answers.length) return;
    startedRef.current = true;
    void runAnalysis();
  }, [user, answers.length, runAnalysis]);

  const stellaState: StellaState = running
    ? stage === "uploading"
      ? "transcribing"
      : "thinking"
    : chatLoading
      ? "thinking"
      : notice
        ? "error"
        : result
          ? "finished"
          : "idle";

  const handleSendChat = async (presetPrompt?: string) => {
    const text = presetPrompt || chatInput.trim();
    if (!text || chatLoading) return;
    if (!presetPrompt) setChatInput("");

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: clockLabel(),
    };

    setChatMessages((previous) => [...previous, userMsg]);
    setChatLoading(true);

    const currentConvId = conversationIdRef.current;
    if (currentConvId) {
      saveMessageToConversation(
        currentConvId,
        {
          id: userMsg.id,
          sender: "user",
          text: userMsg.text,
          timestamp: userMsg.timestamp,
        },
        user?.id
      );
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const evaluationContext = {
        prompt: heading || "IELTS speaking practice",
        overallBand: result?.overallBand,
        isOffTopic: result?.isOffTopic,
        offTopicWarning: result?.offTopicWarning,
        criteria: result?.criteria?.map((c) => ({
          criterion: c.criterion,
          band: c.band,
          summary: c.summary,
        })),
        answers: answers.map((a) => {
          const analysis = analysisByRecording.get(a.id);
          return {
            part: a.part,
            question: a.label,
            transcript: analysis?.transcript || "",
          };
        }),
      };

      const response = await fetch("/api/ai/evaluate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode: "context-chat",
          question: text,
          pageTitle: heading || "IELTS speaking practice",
          evaluationContext,
          recentMessages: chatMessages.slice(-6).map((m) => ({
            sender: m.sender,
            text: m.text,
          })),
        }),
      });
      const data = (await response.json()) as Record<string, unknown>;
      const answer =
        typeof data.answer === "string"
          ? data.answer
          : typeof data.message === "string"
            ? data.message
            : "Stella couldn't answer just now. Please try again.";

      const stellaMsg: ChatMessage = {
        id: `stella-${Date.now()}`,
        sender: "stella",
        text: answer,
        timestamp: clockLabel(),
      };

      setChatMessages((previous) => [...previous, stellaMsg]);
      setRevealMessageId(stellaMsg.id);

      if (currentConvId) {
        saveMessageToConversation(
          currentConvId,
          {
            id: stellaMsg.id,
            sender: "stella",
            text: stellaMsg.text,
            timestamp: stellaMsg.timestamp,
          },
          user?.id
        );
      }
    } catch {
      const errorReply: ChatMessage = {
        id: `stella-${Date.now()}`,
        sender: "stella",
        text: "Your message didn't reach me — the connection dropped. Please send it again.",
        timestamp: clockLabel(),
      };
      setChatMessages((previous) => [...previous, errorReply]);
      setRevealMessageId(errorReply.id);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveCorrection = React.useCallback(
    (recordingId: string, corrected: string, questionLabel: string) => {
      setCorrections((previous) => ({ ...previous, [recordingId]: corrected }));
      const userCorr: ChatMessage = {
        id: `corr-${Date.now()}`,
        sender: "user",
        text: `Transcript correction for "${questionLabel}": ${corrected}`,
        timestamp: clockLabel(),
        isCorrection: true,
      };
      const stellaCorr: ChatMessage = {
        id: `corr-reply-${Date.now()}`,
        sender: "stella",
        text: "Saved as your own correction and shown next to the original. I haven't re-scored anything: re-checking wording against the audio needs a fresh analysis, which isn't available yet.",
        timestamp: clockLabel(),
      };

      setChatMessages((previous) => [...previous, userCorr, stellaCorr]);
      setRevealMessageId(stellaCorr.id);

      const currentConvId = conversationIdRef.current;
      if (currentConvId) {
        saveMessageToConversation(
          currentConvId,
          {
            id: userCorr.id,
            sender: "user",
            text: userCorr.text,
            timestamp: userCorr.timestamp,
          },
          user?.id
        );
        saveMessageToConversation(
          currentConvId,
          {
            id: stellaCorr.id,
            sender: "stella",
            text: stellaCorr.text,
            timestamp: stellaCorr.timestamp,
          },
          user?.id
        );
      }
    },
    [user?.id]
  );

  React.useEffect(() => {
    scrollChatToBottom();
  }, [chatMessages, scrollChatToBottom]);

  // Refresh history list when history panel opens
  React.useEffect(() => {
    if (isHistoryOpen) {
      setHistoryList(listConversations());
    }
  }, [isHistoryOpen]);

  // ---- Guards ------------------------------------------------------------
  if (!user) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-bright/20 bg-brand-soft shadow-lg">
          <StellaAvatar state="idle" size={48} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Sign in for Stella AI analysis
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Stella evaluates your IELTS speaking recordings using speech recognition and the official
          Cambridge band criteria. Create a free account or sign in to view your analysis.
        </p>
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            size="lg"
            className="w-full cursor-pointer font-semibold shadow-sm sm:w-auto"
            onClick={() => openAuthModal("signup")}
          >
            Create account / Sign in
          </Button>
          <Button variant="outline" size="lg" className="w-full cursor-pointer sm:w-auto" onClick={back}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!answers.length) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <StellaAvatar state="idle" size={110} className="mx-auto" />
        <p className="mt-5 text-sm text-muted-foreground">
          These recordings are no longer available on this device.
        </p>
        <Button
          className="mt-5"
          onClick={() =>
            mockId ? navigate({ name: "mock-review", mockId }) : navigate({ name: "recordings" })
          }
        >
          {mockId ? "Back to the mock" : "All recordings"}
        </Button>
      </div>
    );
  }

  const totalSeconds = answers.reduce((sum, r) => sum + (r.duration || 0), 0);

  return (
    <div className="fade-up flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card/85 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StellaAvatar state={stellaState} size={42} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">Stella full-window workspace</p>
              <span className="hidden items-center gap-1 rounded-full border border-brand-bright/40 bg-brand-soft/60 px-2 py-0.5 text-[10px] font-medium text-brand-bright sm:inline-flex">
                <Maximize2 className="h-2.5 w-2.5" /> Full window
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {heading ||
                (answers.length === 1
                  ? "Speaking evaluation"
                  : `${answers.length} answers • ${formatTime(totalSeconds)} of speaking`)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsHistoryOpen((prev) => !prev);
              setHistoryList(listConversations());
            }}
            className={cn(
              "gap-1.5 text-xs transition-colors cursor-pointer",
              isHistoryOpen
                ? "bg-brand-soft text-brand-bright font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Coaching History"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isHistoryOpen ? "Close History" : "History"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Exit full window"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit full window</span>
          </Button>
          <button
            type="button"
            onClick={back}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex border-b border-border bg-card lg:hidden" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex-1 border-b-2 py-3 text-xs font-semibold transition-colors",
            mobileTab === "chat"
              ? "border-brand-bright text-brand-bright"
              : "border-transparent text-muted-foreground"
          )}
        >
          {isHistoryOpen ? "Coaching History" : "Chat with Stella"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "evaluation"}
          onClick={() => setMobileTab("evaluation")}
          className={cn(
            "flex-1 border-b-2 py-3 text-xs font-semibold transition-colors",
            mobileTab === "evaluation"
              ? "border-brand-bright text-brand-bright"
              : "border-transparent text-muted-foreground"
          )}
        >
          Recordings &amp; evaluation
        </button>
      </div>

      <div className="grid flex-1 gap-0 lg:grid-cols-2">
        {/* ---------------------------- LEFT: CHAT OR HISTORY --------------------------- */}
        <section
          className={cn(
            "flex flex-col gap-4 border-border bg-card/35 px-4 py-5 sm:px-6 lg:h-[calc(100dvh-61px)] lg:border-r overflow-hidden",
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          )}
        >
          {isHistoryOpen ? (
            <StellaHistoryPanel
              historyList={historyList}
              activeConversationId={conversationId}
              onSelectConversation={(id) => {
                const selectedSession = loadConversation(id);
                if (selectedSession) {
                  if (
                    selectedSession.recordingIds &&
                    selectedSession.recordingIds.length > 0 &&
                    selectedSession.recordingIds.some((rid) => !recordingIds.includes(rid))
                  ) {
                    navigate({
                      name: "analysis",
                      recordingIds: selectedSession.recordingIds,
                      mockId: selectedSession.mockId,
                      sessionId: selectedSession.sessionId,
                      heading: selectedSession.heading || selectedSession.title,
                    });
                    return;
                  }
                  setConversationId(selectedSession.id);
                  conversationIdRef.current = selectedSession.id;
                  if (selectedSession.analysisResult) {
                    setResult(selectedSession.analysisResult);
                    setStage("done");
                    startedRef.current = true;
                  }
                  // Restored history is shown as-is, never re-typed.
                  setRevealMessageId(null);
                  setChatMessages(
                    selectedSession.messages.map((m) => ({
                      id: m.id,
                      sender: m.sender,
                      text: m.text,
                      timestamp: m.timestamp,
                    }))
                  );
                  setIsHistoryOpen(false);
                }
              }}
              onDeleteConversation={(id) => {
                deleteConversation(id, user?.id);
                setHistoryList(listConversations());
                if (conversationId === id) {
                  setChatMessages([]);
                }
              }}
              onStartNewChat={() => {
                const newConv = createConversation(scopeKey, convTitle, {
                  recordingIds,
                  mockId,
                  sessionId,
                  heading,
                  analysisResult: result || undefined,
                });
                setConversationId(newConv.id);
                conversationIdRef.current = newConv.id;
                setChatMessages([]);
                setRevealMessageId(null);
                setIsHistoryOpen(false);
                setHistoryList(listConversations());
              }}
              onCloseHistory={() => setIsHistoryOpen(false)}
              onOpenPrivacyNotice={() => {}}
            />
          ) : (
            <>
              {notice && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
                  <p>{notice}</p>
                </div>
              )}

              <div
                ref={chatScrollRef}
                className="scrollbar-thin flex-1 space-y-3.5 overflow-y-auto rounded-2xl border border-border bg-surface/60 p-4 text-xs shadow-inner"
              >
                {chatMessages.length === 0 && !running && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Ask Stella a question about your speaking whenever you are ready.
                  </p>
                )}
                {chatMessages.map((message) => {
                  const isStella = message.sender === "stella";
                  const body = <FormattedChatMessage text={message.text} isUser={!isStella} />;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex gap-2.5", isStella ? "items-start" : "justify-end")}
                    >
                      {isStella && (
                        <div className="mt-0.5 shrink-0">
                          <StellaAvatar state="idle" size={30} frame={false} />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed sm:text-sm shadow-sm",
                          isStella
                            ? "border border-border bg-card text-foreground"
                            : "bg-primary text-white selection:bg-white/20 selection:text-white",
                          message.isCorrection && "border-warning/40 bg-warning/10 text-foreground"
                        )}
                      >
                        {isStella && message.id === revealMessageId ? (
                          <TypewriterText
                            text={message.text}
                            onTick={scrollChatToBottom}
                            onDone={() => setRevealMessageId(null)}
                          >
                            {body}
                          </TypewriterText>
                        ) : (
                          body
                        )}
                        <div
                          className={cn(
                            "mt-1.5 text-right text-[10px]",
                            isStella ? "opacity-60 text-muted-foreground" : "text-white/75"
                          )}
                        >
                          {message.timestamp}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {chatLoading && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2.5 p-2 text-xs text-muted-foreground"
                  >
                    <StellaAvatar state="thinking" size={26} frame={false} />
                    <span className="animate-pulse">{reasoningPhrase}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  ["✨ Band 8 model answer", "Give me a Band 8 model answer for this question"],
                  ["⚡ Boost fluency", "How do I improve my fluency and reduce hesitation?"],
                  ["💎 Upgrade vocabulary", "What vocabulary upgrades can I make here?"],
                  ["🎯 Practice drill", "Give me a two-minute practice drill for this"],
                ].map(([label, prompt]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void handleSendChat(prompt)}
                    className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-bright/50 hover:bg-brand-soft hover:text-foreground cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSendChat();
                }}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-sm focus-within:border-brand-bright"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask Stella about your answers…"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground sm:text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={chatLoading || !chatInput.trim()}
                  className="h-9 gap-1.5 px-4 cursor-pointer"
                >
                  <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                  <span>Send</span>
                </Button>
              </form>
            </>
          )}
        </section>

        {/* ------------------- RIGHT: RECORDINGS + RESULT (WORKSPACE REVIEW PANEL) -------------------- */}
        <section
          className={cn(
            "flex flex-col gap-5 px-4 py-5 sm:px-6 lg:h-[calc(100dvh-61px)] lg:overflow-y-auto",
            mobileTab === "evaluation" ? "flex" : "hidden lg:flex"
          )}
        >
          <WorkspaceReviewPanel
            answers={answers}
            analysisByRecording={analysisByRecording}
            failureByRecording={failureByRecording}
            result={result}
            running={running}
            stage={stage}
            uploadRatio={uploadRatio}
            failures={failures}
            corrections={corrections}
            onRunAnalysis={runAnalysis}
            onSaveCorrection={handleSaveCorrection}
            onAskStella={(prompt) => {
              if (mobileTab !== "chat") setMobileTab("chat");
              void handleSendChat(prompt);
            }}
          />
        </section>
      </div>
    </div>
  );
}
