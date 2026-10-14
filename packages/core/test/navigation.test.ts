import { describe, expect, it } from "vitest";
import {
  cueEndedBetween,
  cueIndexAt,
  lastStartedCueIndex,
  nextLineTarget,
  previousLineTarget,
} from "../src/navigation.js";
import type { Cue } from "../src/subtitles.js";

const cues: Cue[] = [
  { id: 0, start: 10, end: 12, text: "one" },
  { id: 1, start: 13, end: 16, text: "two" },
  { id: 2, start: 16, end: 18, text: "three" },
];

describe("cue lookup", () => {
  it("finds the cue showing at a time, and -1 between cues", () => {
    expect(cueIndexAt(cues, 9.9)).toBe(-1);
    expect(cueIndexAt(cues, 10)).toBe(0);
    expect(cueIndexAt(cues, 12.5)).toBe(-1);
    expect(cueIndexAt(cues, 16)).toBe(2); // end is exclusive, start inclusive
    expect(cueIndexAt(cues, 18)).toBe(-1);
  });

  it("finds the last cue that started", () => {
    expect(lastStartedCueIndex(cues, 5)).toBe(-1);
    expect(lastStartedCueIndex(cues, 12.5)).toBe(0);
    expect(lastStartedCueIndex(cues, 100)).toBe(2);
  });
});

describe("previousLineTarget (LEFT)", () => {
  it("restarts the current line once you are into it", () => {
    expect(previousLineTarget(cues, 15)?.id).toBe(1);
  });

  it("goes to the previous line when pressed right after a line starts", () => {
    expect(previousLineTarget(cues, 13.5)?.id).toBe(0);
  });

  it("restarts the line just heard when between lines", () => {
    expect(previousLineTarget(cues, 12.8)?.id).toBe(0);
  });

  it("goes to the first line before any dialogue, and stays on it at the start", () => {
    expect(previousLineTarget(cues, 2)?.id).toBe(0);
    expect(previousLineTarget(cues, 10.2)?.id).toBe(0);
  });

  it("returns undefined for an empty track", () => {
    expect(previousLineTarget([], 5)).toBeUndefined();
  });
});

describe("nextLineTarget (RIGHT)", () => {
  it("goes to the next line, and nothing after the last", () => {
    expect(nextLineTarget(cues, 0)?.id).toBe(0);
    expect(nextLineTarget(cues, 11)?.id).toBe(1);
    expect(nextLineTarget(cues, 17)).toBeUndefined();
  });
});

describe("cueEndedBetween (auto-pause)", () => {
  it("reports a line whose end was crossed during normal playback", () => {
    expect(cueEndedBetween(cues, 11.8, 12.05)?.id).toBe(0);
    // Back-to-back lines: crossing 16 ends "two" exactly as "three" starts.
    expect(cueEndedBetween(cues, 15.9, 16.1)?.id).toBe(1);
  });

  it("ignores seeks and paused playback", () => {
    expect(cueEndedBetween(cues, 5, 12.5)).toBeUndefined();
    expect(cueEndedBetween(cues, 12.1, 11.9)).toBeUndefined();
    expect(cueEndedBetween(cues, 12.1, 12.1)).toBeUndefined();
  });

  it("does nothing mid-line", () => {
    expect(cueEndedBetween(cues, 14, 14.25)).toBeUndefined();
  });
});
