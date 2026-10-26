import { SetupState as SharedSetupState } from "@pod/ui/rag/setup-state";
import type { AppStatus } from "@/lib/server";

export function SetupState({ status }: { status: Exclude<AppStatus, { state: "ready" }> }) {
  return (
    <SharedSetupState
      status={status}
      app="world-bank-report"
      schema="worldbank"
      role="worldbank_app"
      ingestSteps={[
        { label: "Put the report at data/world-bank-report.pdf, then parse it (Gemini page markdown, cached).", command: "pnpm --filter world-bank-report parse" },
        { label: "Check the section tree against the PDF's contents page.", command: "pnpm --filter world-bank-report tree" },
        { label: "Build and activate all three run kinds (B6 needs --summaries).", command: "pnpm --filter world-bank-report ingest --kind all --summaries --activate" },
      ]}
    />
  );
}
