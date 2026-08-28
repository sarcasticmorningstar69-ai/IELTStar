"use client";

/**
 * IELTStar progress store — all real activity, no fake data.
 * Persisted to localStorage (metadata only); audio blobs live in IndexedDB.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { putAudio, deleteAudio, deleteAudioMany, clearAllAudio } from "@/lib/storage/audio-db";
import type { Symptom, Cause } from "@/lib/data/content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PartNum = 1 | 2 | 3;
export type SessionType = "part1" | "part2" | "part3" | "full-mock";
export type MockStatus =
  | "not_started"
  | "microphone_check"
  | "in_progress"
  | "paused"
  | "completed"
  | "interrupted"
  | "abandoned"
  | "review";

export interface RecordingMeta {
  id: string;
  sessionId: string;
  mockId?: string;
  part: PartNum;
  topicId?: string;
  questionId?: string;
  startedAt: number;
  duration: number;
  mimeType: string;
  size: number;
  label: string;
  diagnosis?: {
    quick?: string;
    symptoms?: Symptom[];
    causes?: Cause[];
    problems?: string[];
    createdAt?: number;
  };
}

export interface SessionMeta {
  id: string;
  type: SessionType;
  title: string;
  startedAt: number;
  endedAt?: number;
  topicIds: string[];
  answered: number;
  totalQuestions: number;
  practiceSeconds: number;
  status: "in-progress" | "completed" | "interrupted";
}

export interface MockSegment {
  id: string;
  index: number;
  part: PartNum;
  topicId?: string;
  questionId?: string;
  label: string;
  startOffset?: number;
  endOffset?: number;
  duration: number;
  completed: boolean;
}

export interface MockMeta {
  id: string;
  status: MockStatus;
  startedAt?: number;
  completedAt?: number;
  structure: { part1: string[]; part2: string; part3: string[] };
  segments: MockSegment[];
  fullRecordingId?: string;
  part2Notes?: string;
  currentSegment: number;
}

export interface TopicProgress {
  status: "not-started" | "in-progress" | "completed";
  attempted: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  category: "vocabulary" | "phrase" | "mistake" | "technique" | "reflection" | "mock" | "other";
  sourceTopicId?: string;
}

export type ProblemStatus = "new" | "practicing" | "ready-to-check" | "kept-fresh";

export interface ProblemState {
  problemId: string;
  status: ProblemStatus;
  identifiedAt?: number;
  lastPracticedAt?: number;
  occurrences: number;
  nextReviewAt?: number;
}

export interface ReviewItem {
  id: string;
  kind: "problem" | "topic";
  refId: string;
  group: "work-on-this" | "try-again" | "keep-fresh";
  createdAt: number;
  lastActivityAt: number;
}

export interface Settings {
  keepRecordings: "forever" | "1d" | "1w" | "1m" | "3m";
  micGuardDismissed: boolean;
}

export interface ProgressState {
  version: number;
  onboardingDone: boolean;
  focus: string | null;
  sessions: SessionMeta[];
  recordings: RecordingMeta[];
  mocks: MockMeta[];
  topics: Record<string, TopicProgress>;
  notes: NoteItem[];
  problems: Record<string, ProblemState>;
  reviewItems: ReviewItem[];
  settings: Settings;
  streak: { current: number; lastPracticeDay: string | null };
  dailyPractice: Record<string, number>;
  lastBackupReminderAt: number | null;

  // Actions
  completeOnboarding: (focus: string | null) => void;
  setFocus: (focus: string | null) => void;
  startSession: (type: SessionType, title: string, topicIds: string[], totalQuestions: number) => SessionMeta;
  finishSession: (id: string, status: "completed" | "interrupted") => void;
  addSeconds: (sessionId: string, seconds: number) => void;
  saveRecording: (
    meta: Omit<RecordingMeta, "id">,
    blob: Blob
  ) => Promise<RecordingMeta>;
  deleteRecording: (id: string) => Promise<void>;
  deleteRecordings: (ids: string[]) => Promise<void>;
  clearAllRecordings: () => Promise<void>;
  saveDiagnosis: (
    recordingId: string,
    diagnosis: NonNullable<RecordingMeta["diagnosis"]>,
    problemIds: string[]
  ) => void;
  createMock: (structure: MockMeta["structure"], segments: MockSegment[]) => string;
  updateMock: (id: string, patch: Partial<MockMeta>) => void;
  setMockNotes: (id: string, notes: string) => void;
  addNote: (note: Omit<NoteItem, "id" | "createdAt" | "updatedAt">) => NoteItem;
  updateNote: (id: string, patch: Partial<NoteItem>) => void;
  deleteNote: (id: string) => void;
  markProblemPracticed: (problemId: string) => void;
  refreshReviewItems: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markBackupReminder: () => void;
  exportData: () => string;
  importData: (json: string) => boolean;
  resetAll: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MAX_SESSIONS = 300;
const MAX_RECORDINGS = 600;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      version: 1,
      onboardingDone: false,
      focus: null,
      sessions: [],
      recordings: [],
      mocks: [],
      topics: {},
      notes: [],
      problems: {},
      reviewItems: [],
      settings: { keepRecordings: "forever", micGuardDismissed: false },
      streak: { current: 0, lastPracticeDay: null },
      dailyPractice: {},
      lastBackupReminderAt: null,

      completeOnboarding: (focus) => set({ onboardingDone: true, focus }),
      setFocus: (focus) => set({ focus }),

      startSession: (type, title, topicIds, totalQuestions) => {
        const session: SessionMeta = {
          id: uid("s"),
          type,
          title,
          startedAt: Date.now(),
          topicIds,
          answered: 0,
          totalQuestions,
          practiceSeconds: 0,
          status: "in-progress",
        };
        set((s) => ({ sessions: [session, ...s.sessions].slice(0, MAX_SESSIONS) }));
        return session;
      },

      finishSession: (id, status) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, status, endedAt: Date.now() } : x
          ),
        })),

      addSeconds: (sessionId, seconds) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId ? { ...x, practiceSeconds: x.practiceSeconds + seconds } : x
          ),
        })),

      saveRecording: async (meta, blob) => {
        const id = uid("rec");
        const full: RecordingMeta = { ...meta, id };
        await putAudio(id, blob, meta.mimeType);
        const now = Date.now();
        const day = dayKey(now);

        set((s) => {
          // streak logic (real activity only)
          let streak = s.streak;
          if (s.streak.lastPracticeDay !== day) {
            const current =
              s.streak.lastPracticeDay === yesterdayKey() ? s.streak.current + 1 : 1;
            streak = { current, lastPracticeDay: day };
          }

          // topic progress: only genuine recordings count
          const topics = { ...s.topics };
          if (meta.topicId && meta.questionId) {
            const prev =
              topics[meta.topicId] ||
              ({ status: "not-started", attempted: [] } as TopicProgress);
            const attempted = prev.attempted.includes(meta.questionId)
              ? prev.attempted
              : [...prev.attempted, meta.questionId];
            topics[meta.topicId] = {
              ...prev,
              attempted,
              startedAt: prev.startedAt || now,
              status: prev.status === "completed" ? "completed" : "in-progress",
            };
          }

          const sessions = s.sessions.map((x) =>
            x.id === meta.sessionId
              ? {
                  ...x,
                  answered: x.answered + 1,
                  practiceSeconds: x.practiceSeconds + meta.duration,
                }
              : x
          );

          return {
            recordings: [full, ...s.recordings].slice(0, MAX_RECORDINGS),
            topics,
            sessions,
            streak,
            dailyPractice: {
              ...s.dailyPractice,
              [day]: (s.dailyPractice[day] || 0) + meta.duration,
            },
          };
        });
        return full;
      },

      deleteRecording: async (id) => {
        await deleteAudio(id);
        set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) }));
      },

      deleteRecordings: async (ids) => {
        await deleteAudioMany(ids);
        const idSet = new Set(ids);
        set((s) => ({ recordings: s.recordings.filter((r) => !idSet.has(r.id)) }));
      },

      clearAllRecordings: async () => {
        await clearAllAudio();
        set((s) => ({
          recordings: [],
          mocks: s.mocks.map((m) => ({ ...m, fullRecordingId: undefined })),
        }));
      },

      saveDiagnosis: (recordingId, diagnosis, problemIds) =>
        set((s) => {
          const problems = { ...s.problems };
          const now = Date.now();
          for (const pid of problemIds) {
            const prev =
              problems[pid] || { problemId: pid, status: "new", occurrences: 0 };
            const occurrences = prev.occurrences + 1;
            // gentle internal scheduling: resurface after ~3 days
            const nextReviewAt = now + 3 * 24 * 60 * 60 * 1000;
            problems[pid] = {
              ...prev,
              occurrences,
              status: occurrences >= 3 ? "ready-to-check" : "practicing",
              identifiedAt: prev.identifiedAt || now,
              nextReviewAt,
            };
          }
          return {
            recordings: s.recordings.map((r) =>
              r.id === recordingId
                ? { ...r, diagnosis: { ...diagnosis, problems: problemIds, createdAt: now } }
                : r
            ),
            problems,
          };
        }),

      createMock: (structure, segments) => {
        const id = uid("mock");
        const mock: MockMeta = {
          id,
          status: "microphone_check",
          startedAt: Date.now(),
          structure,
          segments,
          currentSegment: 0,
        };
        set((s) => ({ mocks: [mock, ...s.mocks].slice(0, 60) }));
        return id;
      },

      updateMock: (id, patch) =>
        set((s) => ({
          mocks: s.mocks.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      setMockNotes: (id, notes) =>
        set((s) => ({
          mocks: s.mocks.map((m) => (m.id === id ? { ...m, part2Notes: notes } : m)),
        })),

      addNote: (note) => {
        const now = Date.now();
        const full: NoteItem = { ...note, id: uid("note"), createdAt: now, updatedAt: now };
        set((s) => ({ notes: [full, ...s.notes] }));
        return full;
      },

      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
          ),
        })),

      deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

      markProblemPracticed: (problemId) =>
        set((s) => {
          const prev =
            s.problems[problemId] || { problemId, status: "new", occurrences: 0 };
          const now = Date.now();
          return {
            problems: {
              ...s.problems,
              [problemId]: {
                ...prev,
                lastPracticedAt: now,
                status: prev.status === "ready-to-check" ? "kept-fresh" : prev.status === "new" ? "practicing" : prev.status,
                nextReviewAt: now + 5 * 24 * 60 * 60 * 1000,
              },
            },
          };
        }),

      refreshReviewItems: () =>
        set((s) => {
          const now = Date.now();
          const items: ReviewItem[] = [];
          for (const p of Object.values(s.problems)) {
            if (!p.occurrences) continue;
            const due = p.nextReviewAt ? p.nextReviewAt <= now : false;
            let group: ReviewItem["group"] = "try-again";
            if (p.status === "kept-fresh" || p.status === "ready-to-check") group = "keep-fresh";
            if (due || p.occurrences >= 2) group = "work-on-this";
            items.push({
              id: `problem-${p.problemId}`,
              kind: "problem",
              refId: p.problemId,
              group,
              createdAt: p.identifiedAt || now,
              lastActivityAt: p.lastPracticedAt || p.identifiedAt || now,
            });
          }
          for (const [topicId, t] of Object.entries(s.topics)) {
            if (t.status === "completed") {
              items.push({
                id: `topic-${topicId}`,
                kind: "topic",
                refId: topicId,
                group: "keep-fresh",
                createdAt: t.completedAt || now,
                lastActivityAt: t.completedAt || now,
              });
            }
          }
          return { reviewItems: items };
        }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      markBackupReminder: () => set({ lastBackupReminderAt: Date.now() }),

      exportData: () => {
        const s = get();
        const payload = {
          app: "ieltstar-speaking-lab",
          version: 1,
          exportedAt: new Date().toISOString(),
          progress: {
            onboardingDone: s.onboardingDone,
            focus: s.focus,
            sessions: s.sessions,
            recordings: s.recordings,
            mocks: s.mocks,
            topics: s.topics,
            notes: s.notes,
            problems: s.problems,
            reviewItems: s.reviewItems,
            settings: s.settings,
            streak: s.streak,
            dailyPractice: s.dailyPractice,
          },
        };
        return JSON.stringify(payload, null, 2);
      },

      importData: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (parsed?.app !== "ieltstar-speaking-lab" || !parsed?.progress) return false;
          const p = parsed.progress;
          set({
            onboardingDone: !!p.onboardingDone,
            focus: p.focus ?? null,
            sessions: p.sessions || [],
            recordings: p.recordings || [],
            mocks: p.mocks || [],
            topics: p.topics || {},
            notes: p.notes || [],
            problems: p.problems || {},
            reviewItems: p.reviewItems || [],
            settings: p.settings || get().settings,
            streak: p.streak || { current: 0, lastPracticeDay: null },
            dailyPractice: p.dailyPractice || {},
          });
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () =>
        set({
          onboardingDone: false,
          focus: null,
          sessions: [],
          recordings: [],
          mocks: [],
          topics: {},
          notes: [],
          problems: {},
          reviewItems: [],
          settings: { keepRecordings: "forever", micGuardDismissed: false },
          streak: { current: 0, lastPracticeDay: null },
          dailyPractice: {},
          lastBackupReminderAt: null,
        }),
    }),
    {
      name: "ieltstar-progress",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function selectStats(s: ProgressState) {
  const questionsPracticed = s.recordings.length;
  const practiceSeconds = s.recordings.reduce((a, r) => a + r.duration, 0);
  const fullMocks = s.mocks.filter((m) => m.status === "completed").length;
  const problemsIdentified = Object.values(s.problems).filter((p) => p.occurrences > 0).length;
  return { questionsPracticed, practiceSeconds, fullMocks, problemsIdentified };
}

/** training-area activity derived from actual diagnosis data */
export function selectTrainingAreas(s: ProgressState) {
  const areas: Record<string, number> = {};
  for (const r of s.recordings) {
    if (r.diagnosis?.quick) {
      areas[r.diagnosis.quick] = (areas[r.diagnosis.quick] || 0) + 1;
    }
  }
  return areas;
}

export function selectTopicStatus(topicId: string, s: ProgressState): TopicProgress {
  return s.topics[topicId] || { status: "not-started", attempted: [] };
}
