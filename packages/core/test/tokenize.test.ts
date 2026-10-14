import { describe, expect, it } from "vitest";
import { detokenize, locatePhrase, tokenize } from "../src/tokenize.js";

describe("tokenize", () => {
  it("keeps contractions and hyphenated words whole and splits punctuation", () => {
    const tokens = tokenize("...you're freaked out by my robot-hand, aren't you?!");
    expect(tokens.map((t) => t.text)).toEqual([
      "...", "you're", "freaked", "out", "by", "my", "robot-hand", ",", "aren't", "you", "?", "!",
    ]);
    expect(tokens.filter((t) => t.isWord).map((t) => t.norm)).toContain("you're");
  });

  it("normalises curly apostrophes and case", () => {
    const [t] = tokenize("Don’t");
    expect(t).toMatchObject({ text: "Don’t", norm: "don't", isWord: true });
  });

  it("handles non-Latin scripts", () => {
    expect(tokenize("Xin chào, thế giới").filter((t) => t.isWord).map((t) => t.text)).toEqual([
      "Xin", "chào", "thế", "giới",
    ]);
  });

  it("detokenize restores the original spacing", () => {
    for (const line of [
      "I'm not freaked out by- it's...",
      "\"Fourty years later\" Whatever, Thom. We're done.",
      "...alright! Fine!",
    ]) {
      expect(detokenize(tokenize(line))).toBe(line);
    }
  });
});

describe("locatePhrase", () => {
  const tokens = tokenize("Why don't you just admit that you're freaked out by my robot hand?");

  it("finds a multi-word phrase case-insensitively", () => {
    const range = locatePhrase(tokens, "Freaked Out");
    expect(range).toBeDefined();
    const [s, e] = range!;
    expect(tokens.slice(s, e).map((t) => t.text)).toEqual(["freaked", "out"]);
  });

  it("returns undefined when the phrase is not in the line", () => {
    expect(locatePhrase(tokens, "freak out")).toBeUndefined();
    expect(locatePhrase(tokens, "")).toBeUndefined();
  });

  it("skips punctuation between words and can start later in the line", () => {
    const t = tokenize("Look, Celia, look - Celia!");
    expect(locatePhrase(t, "look celia")).toEqual([0, 3]);
    expect(locatePhrase(t, "look celia", 1)).toEqual([4, 7]);
  });
});
