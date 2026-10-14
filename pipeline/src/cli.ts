/**
 * Enrich a title's subtitles for learners.
 *
 *   npm run enrich -- tears-of-steel --langs vi,es
 *
 * Reads  content/<title>/meta.json and the English subtitle it names,
 * writes content/<title>/track.json, and prints what it kept and dropped.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseSubtitles, type Cue } from "@rerun/core";
import { anchorAnalysis, assembleTrack, chunked, newReport, type AnchoredItem } from "./assemble.js";
import { DEFAULT_MODELS, pickProvider, StructuredLLM } from "./llm.js";
import { ANALYSIS_SYSTEM, analysisRequest, scriptBlock, translationRequest, translationSystem } from "./prompts.js";
import { AnalysisChunk, LANGUAGE_NAMES, TranslationChunk } from "./schema.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHUNK = 20;

try {
  process.loadEnvFile(join(ROOT, ".env.local"));
} catch {
  // No .env.local: rely on the environment or an `ant auth login` profile.
}

interface TitleMeta {
  id: string;
  title: string;
  synopsis: string;
  subtitles: { en: string };
}

/** Run promises with a small concurrency limit, keeping input order. */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      langs: { type: "string", default: "vi,es" },
      model: { type: "string" },
    },
  });
  const titleId = positionals[0];
  if (!titleId) throw new Error("usage: npm run enrich -- <title-id> [--langs vi,es] [--model id]");
  const langs = values.langs!.split(",").map((l) => l.trim()).filter(Boolean);
  for (const l of langs) if (!LANGUAGE_NAMES[l]) throw new Error(`unknown language "${l}"`);

  const dir = join(ROOT, "content", titleId);
  const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as TitleMeta;
  const cues = parseSubtitles(await readFile(join(dir, meta.subtitles.en), "utf8"));
  const provider = pickProvider();
  const model = values.model ?? process.env.RERUN_MODEL ?? DEFAULT_MODELS[provider];
  const llm = new StructuredLLM(provider, model, join(ROOT, ".cache", "llm", titleId));
  const script = scriptBlock(meta.title, meta.synopsis, cues);
  console.log(`${meta.title}: ${cues.length} lines, ${provider} ${llm.model}, learner languages ${langs.join(", ")}`);

  // Pass 1: what is worth learning in each line.
  const chunks = chunked(cues, CHUNK);
  const analysis = await pool(chunks, 4, (chunk) =>
    llm.parse({
      label: `analysis-${chunk[0]!.id}`,
      system: [ANALYSIS_SYSTEM, script],
      user: analysisRequest(chunk),
      schema: AnalysisChunk,
    }),
  );
  const report = newReport();
  const anchored = anchorAnalysis(cues, analysis, report);
  console.log(
    `analysis: kept ${report.kept} items; dropped ${report.notFound.length} not in line, ` +
      `${report.overlapping.length} overlapping; ${report.missingLines.length} lines skipped by the model`,
  );
  for (const miss of report.notFound) console.log(`  not found in line ${miss.cueId}: "${miss.surface}"`);

  // Pass 2: per learner language, the line and each item's notes.
  const translations: Record<string, TranslationChunk[]> = {};
  for (const lang of langs) {
    translations[lang] = await pool(chunks, 4, (chunk: Cue[]) =>
      llm.parse({
        label: `translate-${lang}-${chunk[0]!.id}`,
        system: [translationSystem(LANGUAGE_NAMES[lang]!), script],
        user: translationRequest(
          chunk.map((c) => ({
            id: c.id,
            text: c.text,
            items: (anchored.get(c.id) ?? []).map((i: AnchoredItem) => ({
              id: i.id,
              surface: i.surface,
              meaning_en: i.meaning_en,
              in_context_en: i.in_context_en,
            })),
          })),
        ),
        schema: TranslationChunk,
      }),
    );
  }

  const { track, gaps } = assembleTrack({
    titleId,
    model: `${provider}:${llm.model}`,
    generatedAt: new Date().toISOString(),
    cues,
    anchored,
    translations,
  });
  if (gaps.lines.length || gaps.items.length) {
    console.log(`translation gaps: ${gaps.lines.length} lines, ${gaps.items.length} items`, gaps);
  }

  await writeFile(join(dir, "track.json"), JSON.stringify(track, null, 1) + "\n");
  const u = llm.usage;
  console.log(
    `wrote content/${titleId}/track.json — ${u.calls} calls (${u.cached} from cache), ` +
      `${u.inputTokens} in / ${u.outputTokens} out / ${u.cacheReadTokens} cache-read tokens`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
