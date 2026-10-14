import { describe, expect, it } from "vitest";
import {
  isNewFor,
  newForViewers,
  pickLang,
  shouldAutoPause,
  trackDifficulty,
  viewerLanguages,
  type EnrichedCue,
  type LearningItem,
} from "../src/learning.js";

function item(lemma: string, level: LearningItem["level"], kind: LearningItem["kind"] = "word"): LearningItem {
  return {
    id: lemma,
    surface: lemma,
    tokenStart: 0,
    tokenEnd: 1,
    lemma,
    kind,
    level,
    meaning: { en: lemma },
    inContext: { en: lemma },
  };
}

function cue(id: number, items: LearningItem[]): EnrichedCue {
  return { id, start: id * 10, end: id * 10 + 3, text: "", translations: {}, items };
}

describe("isNewFor", () => {
  const b1 = { level: "B1" as const, known: new Set<string>(["freak out"]) };

  it("flags items above the learner's level", () => {
    expect(isNewFor(item("awesome", "A2"), b1)).toBe(false);
    expect(isNewFor(item("passion", "B1"), b1)).toBe(false);
    expect(isNewFor(item("jerk", "B2"), b1)).toBe(true);
  });

  it("respects what the learner already knows, and never counts names", () => {
    expect(isNewFor(item("freak out", "C1", "phrasal_verb"), b1)).toBe(false);
    expect(isNewFor(item("Thom", "C2", "name"), b1)).toBe(false);
  });
});

describe("trackDifficulty", () => {
  const track = {
    cues: [
      cue(0, [item("jerk", "B2"), item("Thom", "C1", "name")]),
      cue(1, [item("passion", "B1")]),
      cue(2, [item("freak out", "B2", "phrasal_verb"), item("jerk", "B2")]),
      cue(3, []),
    ],
  };

  it("counts distinct new lemmas and lines that contain one, per learner", () => {
    const a2 = trackDifficulty(track, { level: "A2", known: new Set() });
    expect(a2).toMatchObject({ newItems: 3, hardLines: 3, totalLines: 4, label: "Hard" });
    const b2 = trackDifficulty(track, { level: "B2", known: new Set() });
    expect(b2).toMatchObject({ newItems: 0, hardLines: 0, label: "Easy" });
  });

  it("the same film is easier for someone who already knows the words", () => {
    const fresh = trackDifficulty(track, { level: "B1", known: new Set() });
    const studied = trackDifficulty(track, { level: "B1", known: new Set(["jerk"]) });
    expect(studied.newItems).toBeLessThan(fresh.newItems);
  });
});

describe("pickLang", () => {
  it("falls back to English, then to any language", () => {
    expect(pickLang({ en: "hi", vi: "chào" }, "vi")).toBe("chào");
    expect(pickLang({ en: "hi" }, "vi")).toBe("hi");
    expect(pickLang({ es: "hola" }, "vi")).toBe("hola");
    expect(pickLang({}, "vi")).toBe("");
  });
});

describe("watching together", () => {
  const linh = { id: "linh", color: "#F59E0B", level: "B1" as const, known: new Set<string>() };
  const minh = { id: "minh", color: "#38BDF8", level: "A2" as const, known: new Set<string>(["jerk"]) };

  it("marks each item with the viewers it is new for, in viewer order", () => {
    const items = [item("awesome", "B1"), item("freak out", "B2", "phrasal_verb"), item("jerk", "B2"), item("Thom", "C2", "name")];
    const map = newForViewers(items, [linh, minh]);
    expect(map.get("awesome")?.map((v) => v.id)).toEqual(["minh"]);
    expect(map.get("freak out")?.map((v) => v.id)).toEqual(["linh", "minh"]);
    expect(map.get("jerk")?.map((v) => v.id)).toEqual(["linh"]);
    expect(map.has("Thom")).toBe(false);
  });

  it("lists each learner language once and pauses for the least advanced viewer", () => {
    expect(viewerLanguages([{ nativeLang: "vi" }, { nativeLang: "es" }, { nativeLang: "vi" }])).toEqual(["vi", "es"]);
    expect(shouldAutoPause([{ level: "B1" }, { level: "B2" }])).toBe(false);
    expect(shouldAutoPause([{ level: "B1" }, { level: "A2" }])).toBe(true);
  });
});
