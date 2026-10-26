/**
 * What went wrong, for code that reacts differently to each case:
 * - `quota`      — the daily (or billing) quota is used up; retrying won't help today
 * - `rate_limit` — a per-minute limit; clears within seconds
 * - `busy`       — Gemini is overloaded or briefly unavailable
 * - `auth`       — the key is wrong or lacks permission
 * - `blocked`    — the model declined (safety)
 * - `cancelled`  — the caller aborted
 * - `error`      — anything else
 */
export type GeminiErrorKind = "quota" | "rate_limit" | "busy" | "auth" | "blocked" | "cancelled" | "error";

/** A failure we can explain to the user without leaking internals. */
export class GeminiError extends Error {
  readonly kind: GeminiErrorKind;
  /** Seconds Gemini asked us to wait, when it said so. */
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown; kind?: GeminiErrorKind; retryAfterSeconds?: number | null },
  ) {
    super(message, options);
    this.name = "GeminiError";
    this.kind = options?.kind ?? "error";
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}

export const QUOTA_MESSAGE =
  "This app has used up its Gemini quota for today. The quota resets at midnight Pacific time; questions will work again after that.";

const NO_QUOTA_MESSAGE =
  "This app's Gemini key has no quota left for this model. Check the Google Cloud project's plan and billing.";

/**
 * A 429 is either a per-minute limit (wait and retry) or a daily/billing
 * quota (nothing to do until it resets). Gemini says which in the error body:
 * the violated `quotaId` names its window, e.g.
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`.
 */
function classifyRateLimit(raw: string): { daily: boolean; exhausted: boolean; retryAfterSeconds: number | null } {
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"|retry in (\d+(?:\.\d+)?)\s*s/i.exec(raw);
  const retryAfterSeconds = delay ? Math.ceil(Number(delay[1] ?? delay[2])) : null;
  return {
    daily: /PerDay/i.test(raw),
    // limit 0: the project has no allowance for this model at all; credits/billing: prepaid credit ran out.
    exhausted: /limit:\s*0\b|"quotaValue"\s*:\s*"0"|credits? (are |is )?(depleted|exhausted)/i.test(raw),
    retryAfterSeconds,
  };
}

/** Maps an SDK or HTTP failure onto a message a person can act on. */
export function describeGeminiError(cause: unknown): GeminiError {
  if (cause instanceof GeminiError) return cause;
  const raw = cause instanceof Error ? cause.message : String(cause);

  if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(raw)) {
    const { daily, exhausted, retryAfterSeconds } = classifyRateLimit(raw);
    if (exhausted) return new GeminiError(NO_QUOTA_MESSAGE, false, { cause, kind: "quota" });
    if (daily) return new GeminiError(QUOTA_MESSAGE, false, { cause, kind: "quota" });
    return new GeminiError(
      retryAfterSeconds
        ? `The model is rate limited right now. Try again in about ${retryAfterSeconds} seconds.`
        : "The model is rate limited right now. Give it a few seconds and try again.",
      true,
      { cause, kind: "rate_limit", retryAfterSeconds },
    );
  }
  if (/50[0-9]|UNAVAILABLE|overloaded|high demand/i.test(raw)) {
    return new GeminiError("The model is busy. Trying again usually works.", true, { cause, kind: "busy" });
  }
  if (/API key|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(raw)) {
    return new GeminiError("Gemini rejected the API key. Check GEMINI_API_KEY.", false, { cause, kind: "auth" });
  }
  if (/SAFETY|blocked/i.test(raw)) {
    return new GeminiError("The model declined to answer that. Try rewording it.", false, { cause, kind: "blocked" });
  }
  if (/abort/i.test(raw)) {
    return new GeminiError("The request was cancelled.", false, { cause, kind: "cancelled" });
  }
  return new GeminiError("Gemini couldn't complete that request. Try again in a moment.", true, { cause });
}

/** True when the daily or billing quota is used up — stop, don't retry. */
export function isQuotaExhausted(cause: unknown): boolean {
  return describeGeminiError(cause).kind === "quota";
}

/**
 * Retries only what is worth retrying, with exponential backoff.
 * Rate limits and overloads usually clear within a few seconds. When Gemini
 * says how long to wait, that wait is used — unless it is longer than
 * `maxWaitMs`, in which case the error goes straight back to the caller.
 */
export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxWaitMs?: number;
}

/**
 * For CLI scripts: free-tier keys allow ~5 requests a minute and 503s come in
 * spikes. One patient retry per model, then the client moves on to the next
 * of its `fallbackModels`.
 */
export const SCRIPT_RETRY: RetryOptions = { attempts: 2, baseDelayMs: 10_000, maxWaitMs: 90_000 };

export async function withRetry<T>(
  operation: () => Promise<T>,
  { attempts = 3, baseDelayMs = 700, maxWaitMs = 15_000 }: RetryOptions = {},
): Promise<T> {
  let lastError: GeminiError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (cause) {
      lastError = describeGeminiError(cause);
      if (!lastError.retryable || attempt === attempts) throw lastError;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const asked = (lastError.retryAfterSeconds ?? 0) * 1000;
      if (asked > maxWaitMs) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, Math.max(backoff, asked)));
    }
  }

  throw lastError ?? new GeminiError("Unknown Gemini failure.", false);
}
