/**
 * Subtitle parsing for SRT and WebVTT.
 *
 * Both formats reduce to the same thing for a learner: a list of timed lines.
 * Real-world files are forgiving about the arrow ("->" as well as "-->").
 * Styling tags are stripped, line breaks inside a cue become spaces, and cues
 * are returned sorted by start time with stable, zero-based ids.
 */

export interface Cue {
  /** Zero-based position in the sorted track; stable across reloads. */
  id: number;
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds from the start of the video; always > start. */
  end: number;
  /** Plain text, single line, no markup. */
  text: string;
}

const TIMESTAMP =
  /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*--?>\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function toSeconds(h: string | undefined, m: string, s: string, ms: string): number {
  return (
    Number(h ?? 0) * 3600 +
    Number(m) * 60 +
    Number(s) +
    Number(ms.padEnd(3, "0")) / 1000
  );
}

/** Remove <i>, <b>, <font>, {\an8}, <c.voice> and similar markup. */
export function stripMarkup(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function normaliseText(lines: string[]): string {
  return stripMarkup(lines.join(" ")).replace(/\s+/g, " ").trim();
}

/**
 * Parse SRT or WebVTT. The format is detected from the content, so a .srt file
 * that is really VTT (or the reverse) still parses.
 */
export function parseSubtitles(source: string): Cue[] {
  const blocks = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);

  const cues: Omit<Cue, "id">[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const timingIndex = lines.findIndex((l) => TIMESTAMP.test(l));
    if (timingIndex === -1) continue; // WEBVTT header, NOTE, STYLE, REGION

    const m = TIMESTAMP.exec(lines[timingIndex]!)!;
    const start = toSeconds(m[1], m[2]!, m[3]!, m[4]!);
    const end = toSeconds(m[5], m[6]!, m[7]!, m[8]!);
    const text = normaliseText(lines.slice(timingIndex + 1));
    if (!text || end <= start) continue;
    cues.push({ start, end, text });
  }

  return cues
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((cue, id) => ({ id, ...cue }));
}

/** Serialise cues back to WebVTT, e.g. to hand a clean track to a player. */
export function toWebVtt(cues: readonly Cue[]): string {
  const stamp = (t: number) => {
    const ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
  };
  const body = cues
    .map((c) => `${c.id + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
