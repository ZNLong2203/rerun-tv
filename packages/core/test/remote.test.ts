import { describe, expect, it } from "vitest";
import { commandFor } from "../src/remote";
import { segmentLine, type LearningItem } from "../src/learning";

describe("commandFor", () => {
  it("maps the arrows to line navigation and word mode while watching", () => {
    expect(commandFor("watch", "left")).toEqual({ type: "previousLine" });
    expect(commandFor("watch", "right")).toEqual({ type: "nextLine" });
    expect(commandFor("watch", "up")).toEqual({ type: "enterWords" });
    expect(commandFor("watch", "down")).toEqual({ type: "toggleTranslation" });
    expect(commandFor("watch", "select")).toEqual({ type: "toggle" });
    expect(commandFor("watch", "enter")).toEqual({ type: "toggle" });
    expect(commandFor("watch", "skip_backward")).toEqual({ type: "seekBy", seconds: -10 });
    expect(commandFor("watch", "back")).toEqual({ type: "exit" });
    expect(commandFor("watch", "unknown")).toEqual({ type: "none" });
  });

  it("leaves arrows and OK to the focus engine in word mode and on a card", () => {
    for (const key of ["left", "right", "up", "select", "enter"]) {
      expect(commandFor("words", key)).toEqual({ type: "none" });
      expect(commandFor("card", key)).toEqual({ type: "none" });
    }
    expect(commandFor("words", "down")).toEqual({ type: "exitWords" });
    expect(commandFor("words", "back")).toEqual({ type: "exitWords" });
    expect(commandFor("card", "back")).toEqual({ type: "closeCard" });
    expect(commandFor("card", "down")).toEqual({ type: "none" });
  });
});

describe("segmentLine", () => {
  const item = (id: string, tokenStart: number, tokenEnd: number): LearningItem => ({
    id,
    surface: id,
    tokenStart,
    tokenEnd,
    lemma: id,
    kind: "word",
    level: "B2",
    meaning: {},
    inContext: {},
  });

  it("splits a line into text runs and items in reading order", () => {
    const text = "Why don't you just admit that you're freaked out?";
    // tokens: Why don't you just admit that you're freaked out ?
    const segs = segmentLine({ text, items: [item("freaked out", 7, 9), item("admit", 4, 5)] });
    expect(segs.map((s) => (s.kind === "item" ? `[${s.item.id}]` : s.tokens.map((t) => t.text).join(" ")))).toEqual([
      "Why don't you just",
      "[admit]",
      "that you're",
      "[freaked out]",
      "?",
    ]);
  });

  it("renders an out-of-range item as plain text", () => {
    const segs = segmentLine({ text: "Hello there", items: [item("bad", 1, 9)] });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.kind).toBe("text");
  });
});
