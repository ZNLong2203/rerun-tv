/**
 * Turn model output into an EnrichedTrack, trusting nothing the model says
 * about positions: every item is re-located in its line by code, and items
 * that cannot be found, or duplicate one already placed, are dropped and
 * reported.
 */

import {
  locatePhrase,
  tokenize,
  type Cue,
  type EnrichedCue,
  type EnrichedTrack,
  type LearningItem,
} from "@rerun/core";
import type { AnalysisChunk, AnalysisItem, TranslationChunk } from "./schema.js";

export interface AnchoredItem extends AnalysisItem {
  id: string;
  tokenStart: number;
  tokenEnd: number;
}

export interface AnchorReport {
  kept: number;
  /** Items whose surface text is not in the line. */
  notFound: { cueId: number; surface: string }[];
  /** Items overlapping one already placed in the same line. */
  overlapping: { cueId: number; surface: string }[];
  /** Line ids the model skipped. */
  missingLines: number[];
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Anchor one line's items to its tokens; longest expressions win overlaps. */
export function anchorItems(cue: Cue, items: readonly AnalysisItem[], report: AnchorReport): AnchoredItem[] {
  const tokens = tokenize(cue.text);
  const taken = new Array<boolean>(tokens.length).fill(false);
  const placed: AnchoredItem[] = [];
  const ids = new Set<string>();
  const bySize = [...items].sort((a, b) => b.surface.length - a.surface.length);

  for (const item of bySize) {
    let range = locatePhrase(tokens, item.surface);
    // If the first occurrence is taken, try later ones ("look, Celia, look").
    while (range && taken.slice(range[0], range[1]).some(Boolean)) {
      range = locatePhrase(tokens, item.surface, range[0] + 1);
    }
    if (!range) {
      const exists = locatePhrase(tokens, item.surface) !== undefined;
      (exists ? report.overlapping : report.notFound).push({ cueId: cue.id, surface: item.surface });
      continue;
    }
    for (let i = range[0]; i < range[1]; i++) taken[i] = true;
    let id = `c${cue.id}-${slug(item.surface) || "item"}`;
    for (let n = 2; ids.has(id); n++) id = `c${cue.id}-${slug(item.surface) || "item"}-${n}`;
    ids.add(id);
    placed.push({
      ...item,
      id,
      tokenStart: range[0],
      tokenEnd: range[1],
    });
  }

  report.kept += placed.length;
  return placed.sort((a, b) => a.tokenStart - b.tokenStart);
}

export function newReport(): AnchorReport {
  return { kept: 0, notFound: [], overlapping: [], missingLines: [] };
}

/** Merge analysis chunks into anchored items per cue id. */
export function anchorAnalysis(
  cues: readonly Cue[],
  chunks: readonly AnalysisChunk[],
  report: AnchorReport,
): Map<number, AnchoredItem[]> {
  const byId = new Map<number, AnalysisItem[]>();
  for (const chunk of chunks) {
    for (const line of chunk.lines) byId.set(line.id, line.items);
  }
  const out = new Map<number, AnchoredItem[]>();
  for (const cue of cues) {
    const items = byId.get(cue.id);
    if (!items) report.missingLines.push(cue.id);
    out.set(cue.id, anchorItems(cue, items ?? [], report));
  }
  return out;
}

export interface TranslationGaps {
  /** `${lang}:${cueId}` for lines with no translation. */
  lines: string[];
  /** `${lang}:${itemId}` for items with no translated notes. */
  items: string[];
}

export function assembleTrack(args: {
  titleId: string;
  model: string;
  generatedAt: string;
  cues: readonly Cue[];
  anchored: Map<number, AnchoredItem[]>;
  translations: Record<string, readonly TranslationChunk[]>;
}): { track: EnrichedTrack; gaps: TranslationGaps } {
  const gaps: TranslationGaps = { lines: [], items: [] };
  const learnerLangs = Object.keys(args.translations);

  // lang -> cueId -> translated line
  const lineIndex = new Map<string, Map<number, TranslationChunk["lines"][number]>>();
  for (const [lang, chunks] of Object.entries(args.translations)) {
    const m = new Map<number, TranslationChunk["lines"][number]>();
    for (const chunk of chunks) for (const line of chunk.lines) m.set(line.id, line);
    lineIndex.set(lang, m);
  }

  const cues: EnrichedCue[] = args.cues.map((cue) => {
    const translations: Record<string, string> = {};
    const anchored = args.anchored.get(cue.id) ?? [];
    const items: LearningItem[] = anchored.map((a) => ({
      id: a.id,
      surface: a.surface,
      tokenStart: a.tokenStart,
      tokenEnd: a.tokenEnd,
      lemma: a.lemma.toLowerCase().trim(),
      kind: a.kind,
      level: a.level,
      meaning: { en: a.meaning_en },
      inContext: { en: a.in_context_en },
      example: a.example,
    }));

    for (const lang of learnerLangs) {
      const line = lineIndex.get(lang)!.get(cue.id);
      if (!line || !line.translation.trim()) {
        gaps.lines.push(`${lang}:${cue.id}`);
        continue;
      }
      translations[lang] = line.translation.trim();
      const notes = new Map(line.items.map((i) => [i.id, i]));
      for (const item of items) {
        const n = notes.get(item.id);
        if (!n) {
          gaps.items.push(`${lang}:${item.id}`);
          continue;
        }
        item.meaning[lang] = n.meaning.trim();
        item.inContext[lang] = n.in_context.trim();
      }
    }
    return { ...cue, translations, items };
  });

  return {
    track: {
      titleId: args.titleId,
      sourceLang: "en",
      learnerLangs,
      model: args.model,
      generatedAt: args.generatedAt,
      cues,
    },
    gaps,
  };
}

/** Split into fixed-size chunks; the last may be shorter. */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
