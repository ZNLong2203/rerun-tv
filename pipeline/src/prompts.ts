import type { Cue } from "@rerun/core";

/**
 * The whole script goes first and never changes between chunks, so it forms a
 * cacheable prefix; only the chunk of line ids differs per request.
 */
export function scriptBlock(title: string, synopsis: string, cues: readonly Cue[]): string {
  const lines = cues.map((c) => `[${c.id}] ${c.text}`).join("\n");
  return `FILM: ${title}\nSYNOPSIS: ${synopsis}\n\nFULL SUBTITLE SCRIPT (line id in brackets):\n${lines}`;
}

export const ANALYSIS_SYSTEM = `You prepare film subtitles for people learning English by watching on a TV.
They pause on a line, step through its words with a remote control, and open a card for anything they do not understand.

For each line you are given, choose what such a learner would want to look up:
- idioms, phrasal verbs, slang and fixed phrases, as ONE item covering the whole expression ("freaked out", "follow our passions");
- single words at CEFR B1 or above, or easier words used in a surprising sense;
- a character or place name only if a learner could mistake it for a word (kind "name").
Skip basic function words and words a CEFR A2 learner already knows in this sense. Most lines need 1-3 items; a line may have none.

Rules for each item:
- "surface" must be copied exactly from the line (same spelling, same word order, contiguous words).
- "level" is the CEFR level of this sense, not of the word's easiest sense.
- "in_context_en" explains this scene: who says it, the tone (joking, angry, sarcastic), and why this wording. Use the full script for context.
- "example" is a short sentence from everyday life, not from the film.
Return every line id you were asked about, in order, even when its items list is empty.`;

export function analysisRequest(chunk: readonly Cue[]): string {
  const ids = chunk.map((c) => c.id).join(", ");
  return `Analyse these lines: ${ids}.`;
}

export function translationSystem(languageName: string): string {
  return `You translate film subtitles for ${languageName} speakers who are learning English by watching on a TV.

For each line:
- "translation": a natural ${languageName} subtitle for the whole line, in the spoken register a good human subtitler would use. Keep it consistent with the rest of the script (names, who is talking to whom, formality).
- For each learning item (given with its id, English expression and English notes): "meaning" is a short ${languageName} gloss of the expression in this sense; "in_context" explains, in ${languageName}, what it means in this scene and why it is said this way. Quote the English expression in the explanation where it helps.
Write for a learner: plain, warm, no linguistics jargon. Return every line id and every item id you were given, in order.`;
}

export function translationRequest(
  chunk: readonly { id: number; text: string; items: readonly { id: string; surface: string; meaning_en: string; in_context_en: string }[] }[],
): string {
  return `Translate these lines and their learning items:\n${JSON.stringify(chunk, null, 1)}`;
}
