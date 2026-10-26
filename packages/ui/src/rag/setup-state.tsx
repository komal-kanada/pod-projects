import { SetupNotice } from "./setup-notice";

export type SetupStatus =
  | { state: "unconfigured"; missing: string[] }
  | { state: "db-error"; message: string }
  | { state: "not-ingested" };

/**
 * What to do next when a RAG app isn't answering yet — the same three cases
 * in every app, with that app's exact commands.
 */
export function SetupState({
  status,
  app,
  schema,
  role,
  ingestSteps,
}: {
  status: SetupStatus;
  /** pnpm filter name, e.g. "gpo-report". */
  app: string;
  schema: string;
  role: string;
  ingestSteps: { label: string; command?: string }[];
}) {
  if (status.state === "not-ingested") {
    return <SetupNotice title="Connected — the report hasn't been ingested yet" missing={[]} steps={ingestSteps} />;
  }
  if (status.state === "db-error") {
    return (
      <SetupNotice
        title="The database isn't answering"
        missing={[]}
        steps={[
          { label: status.message },
          { label: "Apply the migrations as the app's own role.", command: `pnpm --filter ${app} db:migrate` },
          { label: "Then verify everything end to end.", command: `pnpm --filter ${app} check:setup` },
        ]}
      />
    );
  }
  return (
    <SetupNotice
      missing={status.missing}
      steps={[
        { label: `Run apps/${app}/supabase/bootstrap.sql once in the Supabase SQL editor (creates schema ${schema} and role ${role}).` },
        { label: `Add DATABASE_URL (as ${role}) and GEMINI_API_KEY to apps/${app}/.env.local — and to the Vercel project.` },
        { label: "Create the tables.", command: `pnpm --filter ${app} db:migrate` },
        ...ingestSteps,
      ]}
    />
  );
}
