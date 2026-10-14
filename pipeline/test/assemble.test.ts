import { describe, expect, it } from "vitest";
import { tokenize, type Cue } from "@rerun/core";
import { anchorAnalysis, anchorItems, assembleTrack, chunked, newReport } from "../src/assemble.js";
import type { AnalysisItem, TranslationChunk } from "../src/schema.js";

const cue: Cue = {
  id: 3,
  start: 30.8,
  end: 34,
  text: "Why don't you just admit that you're freaked out by my robot hand?",
};

function item(surface: string, extra: Partial<AnalysisItem> = {}): AnalysisItem {
  return {
    surface,
    lemma: surface.toLowerCase(),
    kind: "word",
    level: "B2",
    meaning_en: `meaning of ${surface}`,
    in_context_en: `context of ${surface}`,
    example: `An example with ${surface}.`,
    ...extra,
  };
}

describe("anchorItems", () => {
  it("places items on the tokens the model named, in line order", () => {
    const report = newReport();
    const items = anchorItems(cue, [item("freaked out", { lemma: "freak out", kind: "phrasal_verb" }), item("admit")], report);
    const tokens = tokenize(cue.text);
    expect(items.map((i) => i.surface)).toEqual(["admit", "freaked out"]);
    const freak = items[1]!;
    expect(tokens.slice(freak.tokenStart, freak.tokenEnd).map((t) => t.text)).toEqual(["freaked", "out"]);
    expect(freak.id).toBe("c3-freaked-out");
    expect(report.kept).toBe(2);
  });

  it("drops what is not in the line and keeps the longest of overlapping items", () => {
    const report = newReport();
    const items = anchorItems(cue, [item("freaked"), item("freaked out"), item("terrified")], report);
    expect(items.map((i) => i.surface)).toEqual(["freaked out"]);
    expect(report.notFound).toEqual([{ cueId: 3, surface: "terrified" }]);
    expect(report.overlapping).toEqual([{ cueId: 3, surface: "freaked" }]);
  });

  it("uses a later occurrence when the first is taken, with a unique id", () => {
    const report = newReport();
    const line: Cue = { id: 9, start: 0, end: 1, text: "Look, Celia, look!" };
    const items = anchorItems(line, [item("look"), item("look")], report);
    expect(items.map((i) => [i.tokenStart, i.id])).toEqual([
      [0, "c9-look"],
      [4, "c9-look-2"],
    ]);
  });
});

describe("anchorAnalysis + assembleTrack", () => {
  const cues: Cue[] = [
    { id: 0, start: 23, end: 24.5, text: "You're a jerk, Thom." },
    cue,
  ];

  it("builds per-language records and reports gaps instead of failing", () => {
    const report = newReport();
    const anchored = anchorAnalysis(
      cues,
      [{ lines: [{ id: 0, items: [item("jerk", { level: "B2" })] }] }],
      report,
    );
    expect(report.missingLines).toEqual([3]);

    const vi: TranslationChunk = {
      lines: [
        { id: 0, translation: " Anh là đồ tồi, Thom. ", items: [{ id: "c0-jerk", meaning: "đồ tồi", in_context: "Celia đang giận." }] },
      ],
    };
    const { track, gaps } = assembleTrack({
      titleId: "tos",
      model: "test",
      generatedAt: "2026-10-14T00:00:00Z",
      cues,
      anchored,
      translations: { vi: [vi] },
    });

    expect(track.learnerLangs).toEqual(["vi"]);
    expect(track.cues[0]!.translations).toEqual({ vi: "Anh là đồ tồi, Thom." });
    expect(track.cues[0]!.items[0]!.meaning).toEqual({ en: "meaning of jerk", vi: "đồ tồi" });
    expect(gaps.lines).toEqual(["vi:3"]);
  });
});

describe("chunked", () => {
  it("splits into fixed-size chunks", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 3)).toEqual([]);
  });
});
