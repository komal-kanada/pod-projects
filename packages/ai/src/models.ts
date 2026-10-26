/**
 * One place to change the models for every POD app.
 *
 * `gemini-3.6-flash` was chosen in PrepSprint on measured behaviour, not
 * version number: `gemini-3.8-flash` returned 503 "high demand" on two of
 * three structured calls, while 3.6 completed three of three at roughly 1.7s
 * each. `gemini-2.5-flash` is rejected for accounts created after it retired.
 */
export const GENERATION_MODEL = "gemini-3.6-flash";
export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Tried in order when the chosen model is out of quota, rate limited or
 * overloaded. Each model has its own free-tier quota (per project, as of
 * 2026-10-15): the Flash models 5/min and 20/day, the Flash Lite models
 * 15/min and 500/day. All accept images. The Flash models come first for
 * quality; the Flash Lite models take over only once those are used up.
 * `gemini-3.8-flash` is the last Flash for the 503s noted above.
 */
export const FALLBACK_MODELS = [
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

/**
 * 768 keeps vectors small and under pgvector's 2000-dimension index limit. It
 * must match `vector(768)` in every app's migrations — changing one without
 * the other breaks inserts.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Models that reject `thinkingBudget: 0` with a 400 INVALID_ARGUMENT (checked
 * 2026-10-16). For these the client leaves the thinking config out instead.
 */
export const NO_ZERO_THINKING_BUDGET = new Set(["gemini-3.5-flash-lite"]);
