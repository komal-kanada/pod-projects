/**
 * A per-key sliding-window limiter, kept in memory.
 *
 * The RAG apps have no accounts, so this is the abuse guard on the endpoints
 * that spend Gemini quota. In-memory means per serverless instance — enough to
 * stop a loop hammering one instance, not a determined attacker.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return function check(key: string): { ok: boolean; retryAfterMs: number } {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, retryAfterMs: windowMs - (now - recent[0]) };
    }

    recent.push(now);
    hits.set(key, recent);

    // Keep the map from growing forever on a long-lived instance.
    if (hits.size > 5000) {
      for (const [k, times] of hits) {
        if (times.every((time) => now - time >= windowMs)) hits.delete(k);
      }
    }
    return { ok: true, retryAfterMs: 0 };
  };
}

/** The caller's IP as reported by the platform proxy. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
