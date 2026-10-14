/**
 * Line-by-line navigation with a TV remote.
 *
 * Learners re-listen far more than they skip, so LEFT is the important key:
 * the first press goes back to the start of the line you are hearing, and a
 * second press within a short window goes to the line before it. That matches
 * what a "previous track" button does on every music player.
 */

import type { Cue } from "./subtitles";

/** Index of the cue showing at time t, or -1 between cues. */
export function cueIndexAt(cues: readonly Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Index of the last cue that started at or before t, or -1 before the first. */
export function lastStartedCueIndex(cues: readonly Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** How far into a line you can be and still have LEFT jump to the line before. */
export const RESTART_GRACE_SECONDS = 1.2;

/**
 * Where LEFT should seek to. Inside the first moments of a line it goes to the
 * previous line; later it restarts the current one. Between lines it restarts
 * the line you just heard.
 */
export function previousLineTarget(cues: readonly Cue[], t: number): Cue | undefined {
  const i = lastStartedCueIndex(cues, t);
  if (i === -1) return cues[0];
  const current = cues[i]!;
  if (t - current.start < RESTART_GRACE_SECONDS && i > 0) return cues[i - 1];
  return current;
}

/** Where RIGHT should seek to: the first line that starts after t. */
export function nextLineTarget(cues: readonly Cue[], t: number): Cue | undefined {
  const i = lastStartedCueIndex(cues, t);
  return cues[i + 1];
}

/**
 * Auto-pause: given the previous and current playhead, the cue whose end was
 * just crossed (so the player can pause right after a line is spoken).
 */
export function cueEndedBetween(
  cues: readonly Cue[],
  previousTime: number,
  currentTime: number,
): Cue | undefined {
  if (currentTime <= previousTime) return undefined;
  // A seek forward of more than a few seconds is not "just finished a line".
  if (currentTime - previousTime > 2) return undefined;
  for (let i = lastStartedCueIndex(cues, currentTime); i >= 0; i--) {
    const c = cues[i]!;
    if (c.end <= previousTime) break;
    if (c.end > previousTime && c.end <= currentTime) return c;
  }
  return undefined;
}
