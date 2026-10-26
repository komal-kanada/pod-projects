import { AppShell } from "@pod/ui/rag/app-shell";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { InspectScreen } from "@/components/inspect/inspect-screen";
import { RunsBadge } from "@/components/runs-badge";
import { SetupState } from "@/components/setup-state";
import { CONFIG, DEFAULT_PRESET } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { presetOptions } from "@/lib/presets";
import { getAppStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function InspectPage() {
  const status = await getAppStatus();
  return (
    <AppShell slug="imac-report" nav={NAV}>
      <PageIntro eyebrow="Developer view" title="Inspect retrieval" aside={status.state === "ready" ? <RunsBadge runs={status.runs} /> : null}>
        What a question retrieves at each stage — chunk hits with their kind and ranks, the elements they expand
        to, and the context (with any images) the model would receive.
      </PageIntro>
      {status.state !== "ready" ? (
        <SetupState status={status} />
      ) : (
        <InspectScreen presets={presetOptions(Object.keys(status.runs))} defaultPreset={DEFAULT_PRESET} budget={CONFIG.retrieval.contextTokenBudget} />
      )}
    </AppShell>
  );
}
