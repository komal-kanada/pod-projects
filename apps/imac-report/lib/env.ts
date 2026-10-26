/** This app's environment: DATABASE_URL (as imac_app), GEMINI_API_KEY, optional X3_MODEL. */
export { readEnv, missingEnv, requireEnv, type AppEnv } from "@pod/rag/app-env";

export function x3Model(): string | null {
  const value = process.env.X3_MODEL?.trim();
  return value ? value : null;
}
