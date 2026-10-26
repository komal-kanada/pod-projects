import { SetupState as SharedSetupState } from "@pod/ui/rag/setup-state";
import type { AppStatus } from "@/lib/server";

export function SetupState({ status }: { status: Exclude<AppStatus, { state: "ready" }> }) {
  return (
    <SharedSetupState
      status={status}
      app="gpo-report"
      schema="gpo"
      role="gpo_app"
      ingestSteps={[
        { label: "Put the report at data/gpo-annual-report.pdf and check the parse by hand.", command: "pnpm --filter gpo-report parse" },
        { label: "Embed and store it as the active run.", command: "pnpm --filter gpo-report ingest --activate" },
      ]}
    />
  );
}
