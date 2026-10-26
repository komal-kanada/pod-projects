import { Type, type Gemini, type Part } from "@pod/ai";
import { z } from "zod";
import { forbiddenMentions } from "./checks";

/**
 * LLM-as-judge, shared by all POD evals: correctness against a reference
 * answer, and faithfulness to the context the answer was generated from.
 * Temperature 0 and JSON output keep the grades as repeatable as an LLM
 * allows; the manual review in each app's 07/10 doc checks the judge itself.
 */

export const JUDGE_PROMPT_VERSION = "v2";

const correctnessSchema = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string(),
});
export type CorrectnessVerdict = z.infer<typeof correctnessSchema>;

const faithfulnessSchema = z.object({
  claims: z.array(z.object({ claim: z.string(), supported: z.boolean() })),
  faithful: z.boolean(),
});
export type FaithfulnessVerdict = z.infer<typeof faithfulnessSchema>;

export async function judgeCorrectness(
  gemini: Gemini,
  {
    documentName,
    question,
    expectedAnswer,
    mustInclude,
    mustNotInclude = [],
    answer,
    extraRules = [],
  }: {
    documentName: string;
    question: string;
    expectedAnswer: string;
    mustInclude: string[];
    /** Phrases that make the answer wrong if present (another region, a made-up figure). */
    mustNotInclude?: string[];
    answer: string;
    extraRules?: string[];
  },
): Promise<CorrectnessVerdict> {
  // Checked by string match first: certain, and it costs no model call.
  const forbidden = forbiddenMentions(answer, mustNotInclude);
  if (forbidden.length) {
    return { score: 0, reason: `Mentions what it must not: ${forbidden.map((phrase) => `"${phrase}"`).join(", ")}.` };
  }

  const prompt = `You are grading an answer to a question about the ${documentName}.

Question: ${question}
Reference answer: ${expectedAnswer}
Required facts (must all appear, wording may differ): ${mustInclude.length ? mustInclude.map((fact) => `"${fact}"`).join("; ") : "(none listed)"}
${mustNotInclude.length ? `Forbidden content (score 0 if the answer states any of it, in any wording): ${mustNotInclude.map((fact) => `"${fact}"`).join("; ")}\n` : ""}Candidate answer: ${answer}

Score the candidate:
- 2 = correct and complete: matches the reference and contains every required fact.
- 1 = partially correct: some required facts present, nothing contradicts the reference.
- 0 = incorrect, contradicts the reference, or refuses when an answer exists.
${extraRules.map((rule) => `- ${rule}`).join("\n")}
Ignore citation markers like [1]. Ignore style and length.
Return JSON: {"score": 0|1|2, "reason": "<one sentence>"}`;

  return gemini.generateJson({
    prompt,
    temperature: 0,
    maxOutputTokens: 512,
    schema: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, minimum: 0, maximum: 2 },
        reason: { type: Type.STRING },
      },
      required: ["score", "reason"],
    },
    validate: (value) => correctnessSchema.parse(value),
  });
}

export async function judgeFaithfulness(
  gemini: Gemini,
  {
    context,
    answer,
    images = [],
  }: {
    /** The exact numbered context the answer was generated from. */
    context: string;
    answer: string;
    /** Images the answer model saw, if any (multimodal answers). */
    images?: Part[];
  },
): Promise<FaithfulnessVerdict> {
  const text = `You are checking whether an answer is fully supported by the provided excerpts${images.length ? " and images" : ""}.

<context>
${context}
</context>
Answer: ${answer}

List every factual claim in the answer. For each, decide whether the excerpts
support it. A claim is unsupported if it is not stated in or directly implied by
the excerpts, including numbers, years, and names.

Return JSON:
{"claims": [{"claim": "...", "supported": true|false}], "faithful": true|false}
"faithful" is true only if every claim is supported.`;

  return gemini.generateJson({
    prompt: images.length ? [{ text }, ...images] : text,
    temperature: 0,
    maxOutputTokens: 2048,
    schema: {
      type: Type.OBJECT,
      properties: {
        claims: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              claim: { type: Type.STRING },
              supported: { type: Type.BOOLEAN },
            },
            required: ["claim", "supported"],
          },
        },
        faithful: { type: Type.BOOLEAN },
      },
      required: ["claims", "faithful"],
    },
    validate: (value) => faithfulnessSchema.parse(value),
  });
}
