import { describe, expect, it } from "vitest";
import { lastSentence, overlapTail, splitRecursively, splitSentences } from "./split";

describe("splitRecursively", () => {
  it("returns short text whole", () => {
    expect(splitRecursively("Short text.", 100)).toEqual(["Short text."]);
  });

  it("prefers paragraph boundaries and respects the limit", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}`;
    const pieces = splitRecursively(text, 80);
    expect(pieces).toEqual(["a".repeat(60), "b".repeat(60)]);
  });

  it("falls back to sentences and keeps their punctuation", () => {
    const text = "First sentence is here. Second sentence is here. Third sentence is here.";
    const pieces = splitRecursively(text, 50);
    expect(pieces.every((piece) => piece.length <= 50)).toBe(true);
    expect(pieces[0]).toBe("First sentence is here. Second sentence is here.");
    expect(pieces.join(" ")).toBe(text);
  });

  it("never loses characters on an unbreakable run", () => {
    const text = "x".repeat(250);
    expect(splitRecursively(text, 100).join("")).toBe(text);
  });
});

describe("sentences and overlap", () => {
  it("splits sentences on terminal punctuation before a capital", () => {
    expect(splitSentences("Revenue rose 4.2 percent. Costs fell. e.g. not split")).toEqual([
      "Revenue rose 4.2 percent.",
      "Costs fell. e.g. not split",
    ]);
  });

  it("overlap starts at a sentence boundary", () => {
    const tail = overlapTail("One. Two three four. Five six seven eight.", 25);
    expect(tail).toBe("Five six seven eight.");
  });

  it("lastSentence", () => {
    expect(lastSentence("A one. B two.")).toBe("B two.");
  });
});
