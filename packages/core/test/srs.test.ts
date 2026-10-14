import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  isDue,
  isMastered,
  MIN_EASE,
  newCard,
  review,
  sortForReview,
  type CardState,
  type Grade,
} from "../src/srs.js";

const T0 = Date.UTC(2026, 9, 15, 8);
const MIN = 60_000;

function run(grades: Grade[], start = newCard(T0)): CardState {
  let card = start;
  for (const g of grades) card = review(card, g, card.due);
  return card;
}

describe("learning steps", () => {
  it("a new card is due immediately", () => {
    expect(isDue(newCard(T0), T0)).toBe(true);
  });

  it("good walks 1 min → 10 min → graduates to 1 day", () => {
    let c = review(newCard(T0), "good", T0);
    expect(c).toMatchObject({ step: 1, due: T0 + 10 * MIN });
    c = review(c, "good", c.due);
    expect(c).toMatchObject({ step: -1, intervalDays: 1, streak: 1 });
    expect(c.due).toBe(T0 + 10 * MIN + DAY_MS);
  });

  it("easy graduates straight to 4 days", () => {
    const c = review(newCard(T0), "easy", T0);
    expect(c).toMatchObject({ step: -1, intervalDays: 4 });
  });

  it("again restarts the steps", () => {
    const c = review(review(newCard(T0), "good", T0), "again", T0 + 10 * MIN);
    expect(c).toMatchObject({ step: 0, streak: 0, due: T0 + 11 * MIN });
  });
});

describe("review cards", () => {
  it("intervals grow by the ease factor", () => {
    const c = run(["good", "good", "good", "good"]);
    // 1 day, then max(2, 1*2.5)=2.5, then 2.5*2.5=6.25
    expect(c.intervalDays).toBeCloseTo(6.25);
  });

  it("a lapse lowers ease, halves the interval and relearns", () => {
    const before = run(["good", "good", "good", "good"]);
    const lapsed = review(before, "again", before.due);
    expect(lapsed).toMatchObject({ step: 0, lapses: 1, streak: 0 });
    expect(lapsed.ease).toBeCloseTo(before.ease - 0.2);
    const relearned = run(["good", "good"], lapsed);
    expect(relearned.step).toBe(-1);
    expect(relearned.intervalDays).toBeCloseTo(6.25 / 2);
  });

  it("ease never drops below the floor", () => {
    let c = run(["easy"]);
    for (let i = 0; i < 20; i++) c = review(c, "hard", c.due);
    expect(c.ease).toBe(MIN_EASE);
  });

  it("hard still moves the card forward", () => {
    const c = run(["easy"]);
    const h = review(c, "hard", c.due);
    expect(h.intervalDays).toBeGreaterThan(c.intervalDays);
  });

  it("a word counts as mastered after three weeks", () => {
    let c = run(["easy"]);
    while (!isMastered(c)) c = review(c, "good", c.due);
    expect(c.intervalDays).toBeGreaterThanOrEqual(21);
  });
});

describe("sortForReview", () => {
  it("returns only due cards, most overdue first, then most-forgotten", () => {
    const mk = (id: string, due: number, lapses = 0) => ({ id, state: { ...newCard(due), lapses } });
    const cards = [mk("later", T0 + DAY_MS), mk("a", T0 - 5 * MIN), mk("b", T0 - 10 * MIN), mk("c", T0 - 5 * MIN, 3)];
    expect(sortForReview(cards, T0).map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});
