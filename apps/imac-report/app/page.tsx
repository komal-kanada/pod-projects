import { AppShell } from "@pod/ui/rag/app-shell";
import { PageIntro } from "@pod/ui/rag/page-intro";
import { AskScreen } from "@/components/ask/ask-screen";
import { RunsBadge } from "@/components/runs-badge";
import { SetupState } from "@/components/setup-state";
import { DEFAULT_PRESET } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { presetOptions } from "@/lib/presets";
import { sampleQuestions } from "@/lib/samples";
import { getAppStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const status = await getAppStatus();
  return (
    <AppShell slug="imac-report" nav={NAV}>
      <PageIntro eyebrow="Project 04 · Multimodal document RAG" title="Ask the iMac Environmental Report" aside={status.state === "ready" ? <RunsBadge runs={status.runs} /> : null}>
        Answers drawn from tables, charts and footnotes — not just paragraphs. Every figure comes with its unit,
        its conditions, and the element it came from.
      </PageIntro>
      {status.state !== "ready" ? (
        <div className="mb-8">
          <SetupState status={status} />
        </div>
      ) : null}
      <AskScreen samples={sampleQuestions()} enabled={status.state === "ready"} presets={presetOptions(status.state === "ready" ? Object.keys(status.runs) : [])} defaultPreset={DEFAULT_PRESET} />
    </AppShell>
  );
}
