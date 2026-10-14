import { describe, expect, it } from "vitest";
import { parseSubtitles, toWebVtt } from "../src/subtitles.js";

const SRT = `1
00:00:23,000 --> 00:00:24,500
You're a jerk, Thom.

2
00:00:27,000 --> 00:00:30,500
...you have your robotics, and I
just want to be awesome in space.

3
00:00:25,000 --> 00:00:27,000
<i>Look Celia</i>, we have to follow our passions;
`;

describe("parseSubtitles", () => {
  it("parses SRT, joins wrapped lines, strips markup and sorts by time", () => {
    const cues = parseSubtitles(SRT);
    expect(cues.map((c) => c.text)).toEqual([
      "You're a jerk, Thom.",
      "Look Celia, we have to follow our passions;",
      "...you have your robotics, and I just want to be awesome in space.",
    ]);
    expect(cues.map((c) => c.id)).toEqual([0, 1, 2]);
    expect(cues[0]).toMatchObject({ start: 23, end: 24.5 });
  });

  it("parses WebVTT with a header, cue settings, NOTE blocks and short timestamps", () => {
    const vtt = `WEBVTT - demo

NOTE this is a comment

intro
00:01.5 --> 00:03.250 align:start position:10%
<c.thom>Hello</c> there

00:00:04.000 --> 00:00:05.000
{\\an8}Up top`;
    const cues = parseSubtitles(vtt);
    expect(cues).toEqual([
      { id: 0, start: 1.5, end: 3.25, text: "Hello there" },
      { id: 1, start: 4, end: 5, text: "Up top" },
    ]);
  });

  it("handles a BOM and Windows line endings, and skips empty or inverted cues", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n\r\n2\r\n00:00:05,000 --> 00:00:04,000\r\nBackwards\r\n\r\n3\r\n00:00:06,000 --> 00:00:07,000\r\n<i></i>\r\n";
    expect(parseSubtitles(srt)).toEqual([{ id: 0, start: 1, end: 2, text: "Hi" }]);
  });

  it("accepts a single-dash arrow, as some hand-made SRT files use", () => {
    expect(parseSubtitles("1\n00:00:23,000 -> 00:00:24,500\nVocê é um idiota, Thom.\n")).toEqual([
      { id: 0, start: 23, end: 24.5, text: "Você é um idiota, Thom." },
    ]);
  });

  it("round-trips through WebVTT", () => {
    const cues = parseSubtitles(SRT);
    expect(parseSubtitles(toWebVtt(cues))).toEqual(cues);
  });
});
