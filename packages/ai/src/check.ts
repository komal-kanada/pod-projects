import { Type } from "@google/genai";
import { createGemini } from "./client";
import { createGeminiEmbedder } from "./embeddings";

/** Used by every app's `check:setup`: can this key generate and embed? */
export async function checkGemini(apiKey: string): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  let ok = true;
  const gemini = createGemini({ apiKey });
  try {
    const reply = await gemini.generateJson<{ reply: string }>({
      prompt: "Reply with exactly: ok",
      schema: { type: Type.OBJECT, properties: { reply: { type: Type.STRING } }, required: ["reply"] },
      maxOutputTokens: 64,
    });
    lines.push(`ok    ${gemini.generationModel} answered (${JSON.stringify(reply)})`);
  } catch (error) {
    ok = false;
    lines.push(`FAIL  ${gemini.generationModel}: ${(error as Error).message}`);
  }
  try {
    const embedder = createGeminiEmbedder({ sdk: gemini.sdk });
    const vector = await embedder.embedQuery("annual report");
    lines.push(`ok    ${embedder.model} returned ${vector.length} dims`);
  } catch (error) {
    ok = false;
    lines.push(`FAIL  embeddings: ${(error as Error).message}`);
  }
  return { ok, lines };
}
