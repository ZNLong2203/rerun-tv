import { describe, expect, it } from "vitest";
import { scoreShadowing } from "../src/shadowing.js";
import { isPairCode, parseRoomMessage } from "../src/protocol.js";

describe("scoreShadowing", () => {
  it("gives 100 for a perfect repeat, ignoring case, punctuation and apostrophes", () => {
    const r = scoreShadowing("You're a jerk, Thom.", "youre a jerk thom");
    expect(r.score).toBe(100);
    expect(r.words.every((w) => w.outcome === "hit")).toBe(true);
  });

  it("marks a missed word without shifting the rest", () => {
    const r = scoreShadowing("we have to follow our passions", "we have follow our passions");
    expect(r.words.map((w) => w.outcome)).toEqual(["hit", "hit", "missed", "hit", "hit", "hit"]);
    expect(r.score).toBe(83);
  });

  it("reports substitutions with what was heard, and extra words", () => {
    const r = scoreShadowing("I'm freaked out", "I'm freak out man");
    expect(r.words[1]).toEqual({ word: "freaked", outcome: "substituted", heard: "freak" });
    expect(r.extra).toEqual(["man"]);
    expect(r.score).toBe(67);
  });

  it("scores silence as zero", () => {
    expect(scoreShadowing("Hello there", "").score).toBe(0);
    expect(scoreShadowing("", "anything").score).toBe(0);
  });
});

describe("protocol", () => {
  it("accepts known messages and rejects anything else", () => {
    expect(parseRoomMessage('{"type":"remote","action":"play"}')).toEqual({ type: "remote", action: "play" });
    expect(parseRoomMessage('{"type":"rm -rf"}')).toBeUndefined();
    expect(parseRoomMessage("not json")).toBeUndefined();
  });

  it("validates pairing codes", () => {
    expect(isPairCode("7KQ2M")).toBe(true);
    expect(isPairCode("7KQ2")).toBe(false);
    expect(isPairCode("7KQ0M")).toBe(false); // 0 is excluded
  });
});
