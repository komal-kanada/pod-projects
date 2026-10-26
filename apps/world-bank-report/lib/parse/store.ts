import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DOCUMENT } from "../config";
import type { ParsedReport } from "../types";

/** `pnpm parse` writes the parsed report here; tree/ingest read it back. */
const FILE = `${DOCUMENT.cacheDir}/parsed.json`;

export async function saveParsed(parsed: ParsedReport) {
  await mkdir(DOCUMENT.cacheDir, { recursive: true });
  await writeFile(FILE, JSON.stringify(parsed));
}

export async function loadParsed(): Promise<ParsedReport> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as ParsedReport;
  } catch {
    throw new Error(`${FILE} not found. Run \`pnpm parse\` first.`);
  }
}
