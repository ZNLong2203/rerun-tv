/**
 * Score a shadowing attempt: the learner repeats a line and speech
 * recognition returns what it heard. Words are aligned with an edit-distance
 * table so one missed word does not shift every word after it, and the
 * result says which words landed, which were missed and what was heard
 * instead.
 */

import { tokenize } from "./tokenize";

export type WordOutcome = "hit" | "missed" | "substituted";

export interface ShadowWord {
  /** Word from the subtitle line, as written. */
  word: string;
  outcome: WordOutcome;
  /** What recognition heard in its place, for "substituted". */
  heard?: string;
}

export interface ShadowScore {
  /** 0–100: share of the line's words that were heard correctly. */
  score: number;
  words: ShadowWord[];
  /** Words heard that are not in the line at all. */
  extra: string[];
}

/** Lowercase, strip apostrophes and hyphens: "don't" ≈ "dont", "robot-hand" ≈ "robothand". */
function key(word: string): string {
  return word.toLowerCase().replace(/['’\-]/g, "");
}

function words(text: string): string[] {
  return tokenize(text)
    .filter((t) => t.isWord)
    .map((t) => t.text);
}

export function scoreShadowing(target: string, heard: string): ShadowScore {
  const a = words(target);
  const b = words(heard);
  const ak = a.map(key);
  const bk = b.map(key);

  // dp[i][j] = edit distance between a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const same = ak[i - 1] === bk[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + same);
    }
  }

  // Walk back to recover the alignment.
  const out: ShadowWord[] = [];
  const extra: string[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + (ak[i - 1] === bk[j - 1] ? 0 : 1)) {
      out.push(
        ak[i - 1] === bk[j - 1]
          ? { word: a[i - 1]!, outcome: "hit" }
          : { word: a[i - 1]!, outcome: "substituted", heard: b[j - 1]! },
      );
      i--;
      j--;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      out.push({ word: a[i - 1]!, outcome: "missed" });
      i--;
    } else {
      extra.push(b[j - 1]!);
      j--;
    }
  }
  out.reverse();
  extra.reverse();

  const hits = out.filter((w) => w.outcome === "hit").length;
  const score = a.length === 0 ? 0 : Math.round((hits / a.length) * 100);
  return { score, words: out, extra };
}
