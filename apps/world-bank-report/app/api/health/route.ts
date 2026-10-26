/**
 * Liveness check. The hub can poll this to show whether each app is up.
 */
export function GET() {
  return Response.json({
    app: "world-bank-report",
    status: "ok",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
}
