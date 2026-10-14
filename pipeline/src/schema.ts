/**
 * What the model is asked to return. Two passes keep the learning items
 * identical across learner languages:
 *
 *   1. analysis  — English only: which words and expressions in each line are
 *                  worth learning, their level, and what they mean here.
 *   2. translate — per learner language: the line, and each item's meaning
 *                  and in-context note, written for that learner.
 *
 * Structured outputs need fixed keys, so per-language records are built in
 * code afterwards, never asked of the model.
 */

import { CEFR_LEVELS, ITEM_KINDS } from "@rerun/core";
import { z } from "zod";

export const AnalysisItem = z.object({
  surface: z.string().describe("The expression exactly as written in the line, e.g. 'freaked out'."),
  lemma: z.string().describe("Dictionary form in lowercase, e.g. 'freak out'."),
  kind: z.enum(ITEM_KINDS),
  level: z.enum(CEFR_LEVELS).describe("CEFR level of this sense of the expression."),
  meaning_en: z.string().describe("Plain-English meaning in at most 12 words."),
  in_context_en: z
    .string()
    .describe("What it means in this scene and why the character says it this way, in at most 30 words."),
  example: z.string().describe("One short everyday sentence using the same sense."),
});
export type AnalysisItem = z.infer<typeof AnalysisItem>;

export const AnalysisChunk = z.object({
  lines: z.array(
    z.object({
      id: z.number().int(),
      items: z.array(AnalysisItem),
    }),
  ),
});
export type AnalysisChunk = z.infer<typeof AnalysisChunk>;

export const TranslationChunk = z.object({
  lines: z.array(
    z.object({
      id: z.number().int(),
      translation: z.string().describe("Natural spoken-register translation of the whole line."),
      items: z.array(
        z.object({
          id: z.string(),
          meaning: z.string(),
          in_context: z.string(),
        }),
      ),
    }),
  ),
});
export type TranslationChunk = z.infer<typeof TranslationChunk>;

/** Learner languages the pipeline knows how to name in a prompt. */
export const LANGUAGE_NAMES: Record<string, string> = {
  vi: "Vietnamese",
  es: "Spanish (Latin American)",
  hi: "Hindi",
  id: "Indonesian",
  ja: "Japanese",
  "pt-BR": "Brazilian Portuguese",
  "pt-PT": "European Portuguese",
  de: "German",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  zh: "Simplified Chinese",
};
