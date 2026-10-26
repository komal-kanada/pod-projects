import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A tiny on-disk cache for expensive, deterministic LLM work (page parsing,
 * summaries, extraction). Keys include a content hash and the prompt version,
 * so a changed page or prompt misses the cache and everything else is reused —
 * which also makes long runs resumable after a failure.
 */
export function createDiskCache(directory: string) {
  const file = (key: string) => path.join(directory, `${key.replace(/[^\w.-]/g, "_")}.json`);

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        return JSON.parse(await readFile(file(key), "utf8")) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await mkdir(directory, { recursive: true });
      await writeFile(file(key), JSON.stringify(value, null, 2));
    },
  };
}
