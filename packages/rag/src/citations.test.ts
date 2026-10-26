import { describe, expect, it } from "vitest";
import { citationNumbers, isRefusal, parseCitations, segmentCitations } from "./citations";

describe("citations", () => {
  it("reads single, grouped and ranged references", () => {
    expect(citationNumbers("A [1]. B [2, 3]. C [4–6]. D [7-8]")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("separates references to sources that don't exist", () => {
    expect(parseCitations("x [1] y [3] z [9] [1]", 6)).toEqual({ valid: [1, 3], invalid: [9] });
  });

  it("ignores bracketed text that isn't a citation", () => {
    expect(citationNumbers("see [Table 2] and [a]")).toEqual([]);
  });

  it("segments text around citation groups", () => {
    expect(segmentCitations("Rose [1, 2].")).toEqual([
      { kind: "text", text: "Rose " },
      { kind: "cite", numbers: [1, 2] },
      { kind: "text", text: "." },
    ]);
  });

  it("recognises the fixed refusal with small variations", () => {
    const refusal = "I couldn't find this in the GPO Annual Report.";
    expect(isRefusal("I couldn’t find this in the GPO Annual Report.", refusal)).toBe(true);
    expect(isRefusal("I couldn't find this in the GPO Annual Report", refusal)).toBe(true);
    expect(isRefusal("Revenue was $1.2 billion [1].", refusal)).toBe(false);
  });
});
