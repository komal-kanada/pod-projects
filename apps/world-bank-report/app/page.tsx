import { AppShell } from "@pod/ui/rag/app-shell";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { AskScreen } from "@/components/ask/ask-screen";
import { RunsBadge } from "@/components/runs-badge";
import { SetupState } from "@/components/setup-state";
import { DEFAULT_PRESET, type RunKind } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { presetOptions } from "@/lib/presets";
import { sampleQuestions } from "@/lib/samples";
import { getAppStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const status = await getAppStatus();
  const available = status.state === "ready" ? (Object.keys(status.runs) as RunKind[]) : [];

  return (
    <AppShell slug="world-bank-report" nav={NAV}>
      <PageIntro
        eyebrow="Project 03 · Advanced document RAG"
        title="Ask the World Bank report"
        aside={status.state === "ready" ? <RunsBadge runs={status.runs} /> : null}
      >
        A ~200-page report, indexed by its structure. Pick a preset to see what each technique adds — B0 is the
        plain baseline.
      </PageIntro>
      {status.state !== "ready" ? (
        <div className="mb-8">
          <SetupState status={status} />
        </div>
      ) : null}
      <AskScreen samples={sampleQuestions()} enabled={status.state === "ready"} presets={presetOptions(available)} defaultPreset={DEFAULT_PRESET} />
    </AppShell>
  );
}
