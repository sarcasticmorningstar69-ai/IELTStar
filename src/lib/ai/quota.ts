import { serviceRoleClient } from "@/lib/supabase/server";

export type QuotaDecision = {
  allowed: boolean;
  reason: string;
  secondsUsed: number;
  secondsLimit: number;
  messagesUsed: number;
  messagesLimit: number;
};

const EMPTY: Omit<QuotaDecision, "allowed" | "reason"> = {
  secondsUsed: 0,
  secondsLimit: 0,
  messagesUsed: 0,
  messagesLimit: 0,
};

/**
 * Atomically check and record AI usage for a student.
 *
 * Delegates to the `consume_ai_quota` Postgres function so the check and the
 * increment happen in one transaction; doing it in two round trips would let
 * concurrent requests both pass the check.
 *
 * Fails closed. A student is never charged against a quota we cannot read, but
 * we also never call a paid provider without a successful reservation.
 */
export async function consumeQuota(
  userId: string,
  usage: { seconds?: number; messages?: number }
): Promise<QuotaDecision> {
  const admin = serviceRoleClient();
  if (!admin) {
    return {
      allowed: false,
      reason: "QUOTA_BACKEND_UNAVAILABLE",
      ...EMPTY,
    };
  }

  const { data, error } = await admin.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_seconds: Math.max(0, Math.round(usage.seconds ?? 0)),
    p_messages: Math.max(0, Math.round(usage.messages ?? 0)),
  });

  if (error || !Array.isArray(data) || data.length === 0) {
    console.error("[quota] consume_ai_quota failed", error);
    return { allowed: false, reason: "QUOTA_CHECK_FAILED", ...EMPTY };
  }

  const row = data[0] as {
    allowed: boolean;
    reason: string;
    seconds_used: number;
    seconds_limit: number;
    messages_used: number;
    messages_limit: number;
  };

  return {
    allowed: Boolean(row.allowed),
    reason: row.reason,
    secondsUsed: row.seconds_used ?? 0,
    secondsLimit: row.seconds_limit ?? 0,
    messagesUsed: row.messages_used ?? 0,
    messagesLimit: row.messages_limit ?? 0,
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

/** Show usage in the UI only once a student is close to the limit. */
export function shouldWarn(decision: QuotaDecision): boolean {
  if (decision.secondsLimit <= 0) return false;
  return decision.secondsUsed / decision.secondsLimit >= 0.75;
}
