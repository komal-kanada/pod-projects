import { describe, expect, it } from "vitest";
import { describeGeminiError, GeminiError, isQuotaExhausted, withRetry } from "./errors";

/** Shaped like the @google/genai ApiError message for a 429. */
function tooMany(quotaId: string, { retryDelay = "37s", quotaValue = "250" } = {}) {
  const body = {
    error: {
      code: 429,
      message: "You exceeded your current quota, please check your plan and billing details.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId, quotaValue }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
      ],
    },
  };
  return new Error(`got status: 429 Too Many Requests. ${JSON.stringify(body)}`);
}

describe("describeGeminiError", () => {
  it("treats a per-day quota as exhausted for today", () => {
    const error = describeGeminiError(tooMany("GenerateRequestsPerDayPerProjectPerModel-FreeTier"));
    expect(error.kind).toBe("quota");
    expect(error.retryable).toBe(false);
    expect(error.message).toMatch(/quota for today/);
  });

  it("treats a per-minute limit as a short wait, with Gemini's delay", () => {
    const error = describeGeminiError(tooMany("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", { retryDelay: "12s" }));
    expect(error.kind).toBe("rate_limit");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterSeconds).toBe(12);
    expect(error.message).toMatch(/12 seconds/);
  });

  it("treats a zero allowance as exhausted", () => {
    const error = describeGeminiError(tooMany("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", { quotaValue: "0" }));
    expect(error.kind).toBe("quota");
    expect(isQuotaExhausted(error)).toBe(true);
  });

  it("keeps the other kinds", () => {
    expect(describeGeminiError(new Error("503 UNAVAILABLE")).kind).toBe("busy");
    expect(describeGeminiError(new Error("API_KEY_INVALID")).kind).toBe("auth");
    expect(describeGeminiError(new Error("This operation was aborted")).kind).toBe("cancelled");
    expect(describeGeminiError(new Error("socket hang up")).kind).toBe("error");
  });
});

describe("withRetry", () => {
  it("stops at once on an exhausted quota", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw tooMany("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
      }),
    ).rejects.toMatchObject({ kind: "quota" });
    expect(calls).toBe(1);
  });

  it("doesn't sit out a wait longer than maxWaitMs", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw tooMany("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", { retryDelay: "40s" });
        },
        { maxWaitMs: 1000 },
      ),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(calls).toBe(1);
  });

  it("retries a short rate limit", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw tooMany("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", { retryDelay: "0s" });
        return "ok";
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
