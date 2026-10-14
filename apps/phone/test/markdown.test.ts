import { describe, expect, it } from "vitest";
import { inlineRuns } from "../src/markdown";

describe("inlineRuns", () => {
  it("turns **bold** and *italics* into styled runs", () => {
    expect(inlineRuns("Câu này **thô lỗ (rude)** và *hơi* đùa.")).toEqual([
      { text: "Câu này " },
      { text: "thô lỗ (rude)", bold: true },
      { text: " và " },
      { text: "hơi", italic: true },
      { text: " đùa." },
    ]);
  });

  it("leaves plain text and stray asterisks alone", () => {
    expect(inlineRuns("Plain answer.")).toEqual([{ text: "Plain answer." }]);
    expect(inlineRuns("5 * 3 = 15")).toEqual([{ text: "5 * 3 = 15" }]);
  });
});
