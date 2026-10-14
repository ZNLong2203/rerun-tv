/**
 * Compare a track's translations with the human subtitles the film ships in
 * the same languages, matching lines by time.
 *
 *   npm run eval -- tears-of-steel
 *
 * Prints chrF per language, how many lines matched, and the lines that agree
 * least so a person can read them; writes the summary to
 * content/<title>/eval.json so the README can cite it.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSubtitles, type EnrichedTrack } from "@rerun/core";
import { chrf, overlap } from "./chrf.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface Meta {
  references?: Record<string, string>;
}

export interface LanguageEval {
  lang: string;
  matchedLines: number;
  totalLines: number;
  chrf: number;
  worst: { cueId: number; english: string; ours: string; reference: string; chrf: number }[];
}

export function evaluate(track: EnrichedTrack, lang: string, referenceSrt: string): LanguageEval {
  const refs = parseSubtitles(referenceSrt);
  const scored: LanguageEval["worst"] = [];
  for (const cue of track.cues) {
    const ours = cue.translations[lang];
    if (!ours) continue;
    // The reference cue that overlaps this line the most, if any overlaps at all.
    let best: (typeof refs)[number] | undefined;
    let bestOverlap = 0;
    for (const r of refs) {
      const o = overlap(cue, r);
      if (o > bestOverlap) {
        best = r;
        bestOverlap = o;
      }
    }
    if (!best || bestOverlap < 0.5 * (cue.end - cue.start)) continue;
    scored.push({ cueId: cue.id, english: cue.text, ours, reference: best.text, chrf: chrf(ours, best.text) });
  }
  const mean = scored.length ? scored.reduce((a, s) => a + s.chrf, 0) / scored.length : 0;
  return {
    lang,
    matchedLines: scored.length,
    totalLines: track.cues.length,
    chrf: Math.round(mean * 10) / 10,
    worst: [...scored].sort((a, b) => a.chrf - b.chrf).slice(0, 5),
  };
}

async function main() {
  const titleId = process.argv[2];
  if (!titleId) throw new Error("usage: npm run eval -- <title-id>");
  const dir = join(ROOT, "content", titleId);
  const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as Meta;
  const track = JSON.parse(await readFile(join(dir, "track.json"), "utf8")) as EnrichedTrack;

  const results: LanguageEval[] = [];
  for (const [lang, file] of Object.entries(meta.references ?? {})) {
    if (!track.learnerLangs.includes(lang)) continue;
    const r = evaluate(track, lang, await readFile(join(dir, file), "utf8"));
    results.push(r);
    console.log(`${lang}: chrF ${r.chrf} over ${r.matchedLines}/${r.totalLines} lines`);
    for (const w of r.worst.slice(0, 3)) {
      console.log(`  [${w.cueId}] ${w.chrf.toFixed(0)}  "${w.english}"\n      ours: ${w.ours}\n      ref:  ${w.reference}`);
    }
  }
  await writeFile(
    join(dir, "eval.json"),
    JSON.stringify({ model: track.model, generatedAt: track.generatedAt, results }, null, 1) + "\n",
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
