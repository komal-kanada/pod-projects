import { jsonError } from "@/lib/http";
import { missingEnv } from "@/lib/env";
import { getServices } from "@/lib/server";

export const runtime = "nodejs";

/**
 * Daily Vercel Cron (see vercel.json). A free Supabase project pauses after a
 * week without activity, and this one only serves the three report apps, so a
 * tiny query once a day keeps it awake for all of them. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` with cron calls; anything else is 401.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Unauthorized.", 401);
  }
  if (missingEnv().length) return jsonError("Not configured.", 503);

  await getServices().sql`select 1`;
  return Response.json({ ok: true, at: new Date().toISOString() });
}
