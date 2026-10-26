/**
 * Liveness check. The hub can poll this to show whether each app is up, and
 * once a database is attached it becomes the daily keep-alive ping.
 */
export function GET() {
  return Response.json({
    app: "imac-report",
    status: "ok",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
}
