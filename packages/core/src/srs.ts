/**
 * Spaced repetition for saved words: a small SM-2 variant (the family Anki
 * uses), with four answers that map onto the remote and the phone.
 *
 * New cards and lapses go through short learning steps measured in minutes;
 * once a card graduates, its interval grows by an ease factor that answers
 * nudge up or down. Everything is pure: pass in the state and "now", get the
 * next state back, so the TV, the phone and the server always agree.
 */

export type Grade = "again" | "hard" | "good" | "easy";

export interface CardState {
  /** Epoch milliseconds when the card is next due. */
  due: number;
  /** Current interval in days; 0 while in learning steps. */
  intervalDays: number;
  /** Multiplier for the next interval, never below MIN_EASE. */
  ease: number;
  /** Successful reviews in a row since the last lapse. */
  streak: number;
  /** Times the learner forgot the card after it had graduated. */
  lapses: number;
  /** Index into LEARNING_STEPS while learning; -1 once graduated. */
  step: number;
}

export const DAY_MS = 86_400_000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
/** Learning steps in minutes: see it again shortly, then tomorrow. */
export const LEARNING_STEPS_MIN = [1, 10] as const;
export const GRADUATING_INTERVAL_DAYS = 1;
export const EASY_INTERVAL_DAYS = 4;
/** Interval after which a word counts as learned and stops being highlighted. */
export const MASTERED_INTERVAL_DAYS = 21;

export function newCard(now: number): CardState {
  return { due: now, intervalDays: 0, ease: START_EASE, streak: 0, lapses: 0, step: 0 };
}

export function isDue(card: CardState, now: number): boolean {
  return card.due <= now;
}

export function isMastered(card: CardState): boolean {
  return card.step === -1 && card.intervalDays >= MASTERED_INTERVAL_DAYS;
}

function inMinutes(now: number, minutes: number): number {
  return now + minutes * 60_000;
}

function inDays(now: number, days: number): number {
  return now + Math.round(days * DAY_MS);
}

export function review(card: CardState, grade: Grade, now: number): CardState {
  // Learning or relearning: walk the minute steps, then graduate.
  if (card.step !== -1) {
    switch (grade) {
      case "again":
        return { ...card, step: 0, streak: 0, due: inMinutes(now, LEARNING_STEPS_MIN[0]) };
      case "hard":
        return { ...card, due: inMinutes(now, LEARNING_STEPS_MIN[card.step] ?? LEARNING_STEPS_MIN[0]) };
      case "good": {
        const next = card.step + 1;
        if (next < LEARNING_STEPS_MIN.length) {
          return { ...card, step: next, due: inMinutes(now, LEARNING_STEPS_MIN[next]!) };
        }
        // A relapsed card keeps part of its old interval; a new one starts at a day.
        const interval = Math.max(GRADUATING_INTERVAL_DAYS, card.intervalDays);
        return { ...card, step: -1, intervalDays: interval, streak: card.streak + 1, due: inDays(now, interval) };
      }
      case "easy": {
        const interval = Math.max(EASY_INTERVAL_DAYS, card.intervalDays);
        return { ...card, step: -1, intervalDays: interval, streak: card.streak + 1, due: inDays(now, interval) };
      }
    }
  }

  // Graduated (review) cards.
  switch (grade) {
    case "again":
      return {
        ...card,
        step: 0,
        lapses: card.lapses + 1,
        streak: 0,
        ease: Math.max(MIN_EASE, card.ease - 0.2),
        // Keep half the interval for when it graduates again.
        intervalDays: Math.max(1, card.intervalDays / 2),
        due: inMinutes(now, LEARNING_STEPS_MIN[0]),
      };
    case "hard": {
      const interval = Math.max(card.intervalDays + 1, card.intervalDays * 1.2);
      return {
        ...card,
        ease: Math.max(MIN_EASE, card.ease - 0.15),
        intervalDays: interval,
        streak: card.streak + 1,
        due: inDays(now, interval),
      };
    }
    case "good": {
      const interval = Math.max(card.intervalDays + 1, card.intervalDays * card.ease);
      return { ...card, intervalDays: interval, streak: card.streak + 1, due: inDays(now, interval) };
    }
    case "easy": {
      const interval = Math.max(card.intervalDays + 1, card.intervalDays * card.ease * 1.3);
      return {
        ...card,
        ease: card.ease + 0.15,
        intervalDays: interval,
        streak: card.streak + 1,
        due: inDays(now, interval),
      };
    }
  }
}

/** Order due cards: overdue first, then the ones the learner keeps forgetting. */
export function sortForReview<T extends { state: CardState }>(cards: readonly T[], now: number): T[] {
  return cards
    .filter((c) => isDue(c.state, now))
    .sort((a, b) => a.state.due - b.state.due || b.state.lapses - a.state.lapses);
}
