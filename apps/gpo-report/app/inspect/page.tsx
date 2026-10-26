import { AppShell } from "@pod/ui/rag/app-shell";
import { InspectScreen } from "@/components/inspect/inspect-screen";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { RunBadge } from "@/components/run-badge";
import { SetupState } from "@/components/setup-state";
import { pageBounds } from "@/lib/db/chunks";
import { NAV } from "@/lib/nav";
import { getAppStatus, getServices } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function InspectPage() {
  const status = await getAppStatus();
  const bounds = status.state === "ready" ? await pageBounds(getServices().sql, status.run.id) : null;

  return (
    <AppShell slug="gpo-report" nav={NAV}>
      <PageIntro
        eyebrow="Developer view"
        title="Inspect retrieval"
        aside={status.state === "ready" ? <RunBadge run={status.run} /> : null}
      >
        See exactly which passages a question retrieves and how they score — no generation. Browse what the
        pipeline thinks each page says.
      </PageIntro>

      {status.state === "ready" && bounds ? (
        <InspectScreen firstPage={bounds.first} lastPage={bounds.last} />
      ) : status.state !== "ready" ? (
        <SetupState status={status} />
      ) : null}
    </AppShell>
  );
}
