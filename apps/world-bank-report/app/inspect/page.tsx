import { AppShell } from "@pod/ui/rag/app-shell";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { InspectScreen } from "@/components/inspect/inspect-screen";
import { RunsBadge } from "@/components/runs-badge";
import { SetupState } from "@/components/setup-state";
import { CONFIG, DEFAULT_PRESET, type RunKind } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { presetOptions } from "@/lib/presets";
import { getAppStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function InspectPage() {
  const status = await getAppStatus();
  return (
    <AppShell slug="world-bank-report" nav={NAV}>
      <PageIntro eyebrow="Developer view" title="Inspect retrieval" aside={status.state === "ready" ? <RunsBadge runs={status.runs} /> : null}>
        Every stage for one question, without generating an answer — and two presets side by side to see what a
        technique changes.
      </PageIntro>
      {status.state !== "ready" ? (
        <SetupState status={status} />
      ) : (
        <InspectScreen
          presets={presetOptions(Object.keys(status.runs) as RunKind[])}
          defaultPreset={DEFAULT_PRESET}
          budget={CONFIG.retrieval.contextTokenBudget}
        />
      )}
    </AppShell>
  );
}
