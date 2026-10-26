import { AppShell } from "@pod/ui/rag/app-shell";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { InfoNote } from "@pod/ui/rag/states";
import { MapScreen } from "@/components/map/map-screen";
import { SetupState } from "@/components/setup-state";
import { listSections } from "@/lib/db/sections";
import { NAV } from "@/lib/nav";
import { getAppStatus, getServices } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const status = await getAppStatus();
  const run = status.state === "ready" ? status.runs.hierarchical : undefined;
  const sections = run ? await listSections(getServices().sql, run.id) : [];

  return (
    <AppShell slug="world-bank-report" nav={NAV}>
      <PageIntro eyebrow="Structure" title="Document map">
        The report as the pipeline understands it — chapters, sections, boxes, page ranges and sizes. The first
        place to look when a question misses a section.
      </PageIntro>
      {status.state !== "ready" ? (
        <SetupState status={status} />
      ) : !run ? (
        <InfoNote>The map needs a hierarchical run: <code>pnpm ingest --kind hierarchical --activate</code>.</InfoNote>
      ) : (
        <MapScreen sections={sections} />
      )}
    </AppShell>
  );
}
