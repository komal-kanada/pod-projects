/**
 * The two settings every POD RAG app needs, read the same way everywhere.
 * Nothing throws on import: pages show a setup notice when something is
 * missing, and scripts call `requireEnv()` to fail early with a clear message.
 *
 * Both values are server-only; there are no NEXT_PUBLIC_ variables — the
 * browser only talks to the app's own API routes.
 */
export interface AppEnv {
  databaseUrl: string | null;
  geminiApiKey: string | null;
}

const LABEL: Record<keyof AppEnv, string> = {
  databaseUrl: "DATABASE_URL",
  geminiApiKey: "GEMINI_API_KEY",
};

function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  // Placeholders copied from .env.example count as missing.
  if (!trimmed || trimmed.includes("<") || trimmed.startsWith("your-")) return null;
  return trimmed;
}

export function readEnv(): AppEnv {
  return {
    databaseUrl: value(process.env.DATABASE_URL),
    geminiApiKey: value(process.env.GEMINI_API_KEY),
  };
}

export function missingEnv(env: AppEnv = readEnv()): string[] {
  return (Object.keys(LABEL) as (keyof AppEnv)[]).filter((key) => !env[key]).map((key) => LABEL[key]);
}

export function requireEnv(...names: (keyof AppEnv)[]): AppEnv {
  const env = readEnv();
  const missing = names.filter((name) => !env[name]).map((name) => LABEL[name]);
  if (missing.length) {
    throw new Error(`${missing.join(" and ")} not set. Copy .env.example to .env.local and fill it in.`);
  }
  return env;
}
