/**
 * What the AI pipeline produces for a subtitle track, and how a learner's
 * profile turns it into "words that are new for you".
 */

import type { Cue } from "./subtitles.js";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const ITEM_KINDS = ["word", "phrasal_verb", "idiom", "phrase", "slang", "name"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** BCP-47-ish language codes the app ships translations for. */
export type Lang = string;

/** A word or expression worth learning, anchored to tokens in one line. */
export interface LearningItem {
  /** Unique within the track, e.g. "c12-freaked-out". */
  id: string;
  /** Exactly as it appears in the line. */
  surface: string;
  /** Token range [tokenStart, tokenEnd) within the line, from tokenize(). */
  tokenStart: number;
  tokenEnd: number;
  /** Dictionary form, used to track what a learner already knows: "freak out". */
  lemma: string;
  kind: ItemKind;
  /** Estimated CEFR level of this sense of the expression. */
  level: CefrLevel;
  /** Short meaning, per learner language. */
  meaning: Record<Lang, string>;
  /** Why it is said here, in this scene, per learner language. */
  inContext: Record<Lang, string>;
  /** One extra everyday sentence using the same sense (target language). */
  example?: string;
}

export interface EnrichedCue extends Cue {
  /** Natural translation of the whole line, per learner language. */
  translations: Record<Lang, string>;
  items: LearningItem[];
}

export interface EnrichedTrack {
  titleId: string;
  /** Language of the audio and the subtitle being learned. */
  sourceLang: Lang;
  /** Learner languages the track has translations for. */
  learnerLangs: Lang[];
  /** Which model produced it, and when, for reproducibility. */
  model: string;
  generatedAt: string;
  cues: EnrichedCue[];
}

export interface LearnerProfile {
  id: string;
  name: string;
  /** The learner's own language: translations and explanations use it. */
  nativeLang: Lang;
  /** Their current level in the source language. */
  level: CefrLevel;
  /** Lemmas the learner has told us, or shown us, they know. */
  known: ReadonlySet<string>;
}

export function levelRank(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

/**
 * An item is new for a learner when it is above their level and they have not
 * marked it known. Names never count: nobody needs to study "Thom".
 */
export function isNewFor(item: LearningItem, profile: Pick<LearnerProfile, "level" | "known">): boolean {
  if (item.kind === "name") return false;
  if (profile.known.has(item.lemma)) return false;
  return levelRank(item.level) > levelRank(profile.level);
}

export interface TrackDifficulty {
  /** Distinct new lemmas for this learner. */
  newItems: number;
  /** Lines that contain at least one new item. */
  hardLines: number;
  totalLines: number;
  /** New items per minute of dialogue, a rough "how dense is this" signal. */
  newPerMinute: number;
  /** A label the TV can show next to the title. */
  label: "Easy" | "Comfortable" | "Stretch" | "Hard";
}

export function trackDifficulty(
  track: Pick<EnrichedTrack, "cues">,
  profile: Pick<LearnerProfile, "level" | "known">,
): TrackDifficulty {
  const lemmas = new Set<string>();
  let hardLines = 0;
  let dialogueSeconds = 0;
  for (const cue of track.cues) {
    dialogueSeconds += cue.end - cue.start;
    let hard = false;
    for (const item of cue.items) {
      if (isNewFor(item, profile)) {
        lemmas.add(item.lemma);
        hard = true;
      }
    }
    if (hard) hardLines++;
  }
  const minutes = Math.max(dialogueSeconds / 60, 1 / 60);
  const newPerMinute = lemmas.size / minutes;
  const share = track.cues.length ? hardLines / track.cues.length : 0;
  const label = share < 0.1 ? "Easy" : share < 0.25 ? "Comfortable" : share < 0.45 ? "Stretch" : "Hard";
  return { newItems: lemmas.size, hardLines, totalLines: track.cues.length, newPerMinute, label };
}

/** Pick the learner-language string, falling back to English, then anything. */
export function pickLang(values: Record<Lang, string>, lang: Lang): string {
  return values[lang] ?? values["en"] ?? Object.values(values)[0] ?? "";
}
