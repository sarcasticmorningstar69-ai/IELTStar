import { serviceRoleClient } from "@/lib/supabase/server";

export type QuotaUsage = {
  /** Audio seconds to charge against the student's daily transcription wallet. */
  seconds?: number;
  /** Stella chat messages to charge. */
  messages?: number;
  /** Recording-analysis submissions to charge (normally 1 per submission). */
  analyses?: number;
  /** Full-mock submissions to charge (1 when the whole mock is analysed). */
  fullMocks?: number;
  /**
   * Stable per-submission key. The first reservation with this key is charged;
   * later calls with the same key are free, so a double click, a dropped
   * connection, or retrying only a failed provider step never double-charges.
   */
  idempotencyKey?: string | null;
};

export type QuotaDecision = {
  allowed: boolean;
  reason: string;
  secondsUsed: number;
  secondsLimit: number;
  messagesUsed: number;
  messagesLimit: number;
  analysesUsed: number;
  analysesLimit: number;
  fullMocksUsed: number;
  fullMocksLimit: number;
};

const EMPTY: Omit<QuotaDecision, "allowed" | "reason"> = {
  secondsUsed: 0,
  secondsLimit: 0,
  messagesUsed: 0,
  messagesLimit: 0,
  analysesUsed: 0,
  analysesLimit: 0,
  fullMocksUsed: 0,
  fullMocksLimit: 0,
};

type QuotaRowV2 = {
  allowed: boolean;
  reason: string;
  seconds_used: number | null;
  seconds_limit: number | null;
  messages_used: number | null;
  messages_limit: number | null;
  analyses_used: number | null;
  analyses_limit: number | null;
  full_mocks_used: number | null;
  full_mocks_limit: number | null;
};

type QuotaRowV1 = {
  allowed: boolean;
  reason: string;
  seconds_used: number | null;
  seconds_limit: number | null;
  messages_used: number | null;
  messages_limit: number | null;
};

function whole(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0));
}

/**
 * Atomically check and record AI usage for a student.
 *
 * Delegates to the `consume_ai_quota_v2` Postgres function so the check and the
 * increment happen in one transaction; doing it in two round trips would let
 * concurrent requests both pass the check.
 *
 * If `consume_ai_quota_v2` is not present yet (migration 0003 not run), this
 * falls back to the original `consume_ai_quota`, which still enforces minutes,
 * messages, and the global ceiling. The exact submission counters are simply
 * not applied until the migration is run.
 *
 * Fails closed. A student is never charged against a quota we cannot read, but
 * we also never call a paid provider without a successful reservation.
 */
export async function consumeQuota(
  userId: string,
  usage: QuotaUsage
): Promise<QuotaDecision> {
  const admin = serviceRoleClient();
  if (!admin) {
    return { allowed: false, reason: "QUOTA_BACKEND_UNAVAILABLE", ...EMPTY };
  }

  const seconds = whole(usage.seconds);
  const messages = whole(usage.messages);
  const analyses = whole(usage.analyses);
  const fullMocks = whole(usage.fullMocks);
  const key = (usage.idempotencyKey || "").trim() || null;

  const { data, error } = await admin.rpc("consume_ai_quota_v2", {
    p_user_id: userId,
    p_seconds: seconds,
    p_messages: messages,
    p_analyses: analyses,
    p_full_mocks: fullMocks,
    p_idempotency_key: key,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    const row = data[0] as QuotaRowV2;
    return {
      allowed: Boolean(row.allowed),
      reason: row.reason,
      secondsUsed: row.seconds_used ?? 0,
      secondsLimit: row.seconds_limit ?? 0,
      messagesUsed: row.messages_used ?? 0,
      messagesLimit: row.messages_limit ?? 0,
      analysesUsed: row.analyses_used ?? 0,
      analysesLimit: row.analyses_limit ?? 0,
      fullMocksUsed: row.full_mocks_used ?? 0,
      fullMocksLimit: row.full_mocks_limit ?? 0,
    };
  }

  // Migration 0003 has not been applied yet: fall back to the v1 function.
  const legacy = await admin.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_seconds: seconds,
    p_messages: messages,
  });

  if (legacy.error || !Array.isArray(legacy.data) || legacy.data.length === 0) {
    console.error("[quota] quota reservation failed");
    return { allowed: false, reason: "QUOTA_CHECK_FAILED", ...EMPTY };
  }

  const row = legacy.data[0] as QuotaRowV1;
  return {
    allowed: Boolean(row.allowed),
    reason: row.reason,
    secondsUsed: row.seconds_used ?? 0,
    secondsLimit: row.seconds_limit ?? 0,
    messagesUsed: row.messages_used ?? 0,
    messagesLimit: row.messages_limit ?? 0,
    analysesUsed: 0,
    analysesLimit: 0,
    fullMocksUsed: 0,
    fullMocksLimit: 0,
  };
}

/**
 * Student-facing copy. Never show a bare error code or an HTTP status: these
 * messages are read by people who are here to practise English, not to debug.
 */
export function quotaMessage(decision: QuotaDecision): string {
  const minutesLimit = Math.round(decision.secondsLimit / 60);
  const minutesUsed = Math.round(decision.secondsUsed / 60);

  switch (decision.reason) {
    case "DAILY_MINUTES_EXCEEDED":
      return (
        "You have used all " +
        minutesLimit +
        " of your practice minutes for today. They reset tomorrow \u2014 your " +
        "recordings are still saved."
      );
    case "DAILY_MESSAGES_EXCEEDED":
      return (
        "You have reached today's limit for questions to Stella (" +
        decision.messagesLimit +
        "). It resets tomorrow."
      );
    case "DAILY_ANALYSES_EXCEEDED":
      return (
        "You have used all " +
        decision.analysesLimit +
        " of today's Stella analyses. They reset tomorrow \u2014 your " +
        "recordings are still saved."
      );
    case "DAILY_FULL_MOCKS_EXCEEDED":
      return (
        "You have already analysed " +
        decision.fullMocksLimit +
        " full mocks today. Full mocks reset tomorrow \u2014 you can still " +
        "analyse single Part 1, Part 2 or Part 3 answers if you have minutes " +
        "left."
      );
    case "GLOBAL_DAILY_LIMIT":
      return (
        "Stella is unusually busy right now and has paused new feedback for " +
        "today. Please try again tomorrow."
      );
    case "QUOTA_BACKEND_UNAVAILABLE":
    case "QUOTA_CHECK_FAILED":
      return "Stella is temporarily unavailable. Please try again shortly.";
    default:
      return (
        "You have used " +
        minutesUsed +
        " of " +
        minutesLimit +
        " practice minutes today."
      );
  }
}

/** Show usage in the UI only once a student is close to a limit. */
export function shouldWarn(decision: QuotaDecision): boolean {
  const minutes =
    decision.secondsLimit > 0 &&
    decision.secondsUsed / decision.secondsLimit >= 0.75;
  const analyses =
    decision.analysesLimit > 0 &&
    decision.analysesUsed / decision.analysesLimit >= 0.75;
  const mocks =
    decision.fullMocksLimit > 0 &&
    decision.fullMocksUsed >= decision.fullMocksLimit - 1;
  return minutes || analyses || mocks;
}
