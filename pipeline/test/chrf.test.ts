import { describe, expect, it } from "vitest";
import { chrf, overlap } from "../src/chrf.js";

describe("chrf", () => {
  it("is 100 for identical text and 0 for nothing in common", () => {
    expect(chrf("Eres un idiota, Thom.", "Eres un idiota, Thom.")).toBeCloseTo(100);
    expect(chrf("abc", "xyz")).toBe(0);
    expect(chrf("", "abc")).toBe(0);
  });

  it("ignores spaces and case, and rewards closer paraphrases", () => {
    expect(chrf("eres un idiota", "Eres  un idiota")).toBeCloseTo(100);
    const close = chrf("Eres un imbécil, Thom.", "Eres un idiota, Thom.");
    const far = chrf("Hasta luego.", "Eres un idiota, Thom.");
    expect(close).toBeGreaterThan(far);
  });
});

describe("overlap", () => {
  it("measures shared seconds", () => {
    expect(overlap({ start: 1, end: 3 }, { start: 2, end: 5 })).toBe(1);
    expect(overlap({ start: 1, end: 2 }, { start: 3, end: 4 })).toBe(0);
  });
});
