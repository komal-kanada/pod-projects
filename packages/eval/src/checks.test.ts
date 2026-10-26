import { describe, expect, it } from "vitest";
import { forbiddenMentions } from "./checks";

describe("forbiddenMentions", () => {
  it("finds whole-word phrases, ignoring case, spacing and citations", () => {
    expect(forbiddenMentions("Growth in  sub-saharan Africa[2] firmed.", ["Sub-Saharan Africa", "East Asia"])).toEqual(["Sub-Saharan Africa"]);
  });

  it("doesn't match inside longer words or numbers", () => {
    expect(forbiddenMentions("Eurasia grew 12.5 percent; 2.55 overall.", ["Asia", "2.5"])).toEqual([]);
    expect(forbiddenMentions("It grew 2.5 percent.", ["2.5"])).toEqual(["2.5"]);
  });

  it("ignores empty phrases", () => {
    expect(forbiddenMentions("anything", ["", "  "])).toEqual([]);
  });
});
