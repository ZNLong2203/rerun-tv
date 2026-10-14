/**
 * A first-run household so the TV has someone to pick: two Vietnamese
 * learners at different levels and a Spanish speaker. Linh gets a few words
 * already due, so the Daily Rerun has something to show on day one.
 */

import { isNewFor } from "@rerun/core";
import type { Catalog } from "./catalog.js";
import type { Store } from "./store.js";

const HOUSEHOLD = [
  { name: "Linh", nativeLang: "vi", level: "B1", color: "#F59E0B" },
  { name: "Minh", nativeLang: "vi", level: "A2", color: "#38BDF8" },
  { name: "Ana", nativeLang: "es", level: "B2", color: "#A78BFA" },
] as const;

/** How many of the film's first new-for-her words Linh starts with. */
const LINH_DECK_SIZE = 3;

export function seedDemo(store: Store, catalog: Catalog) {
  if (store.listProfiles().length > 0) return;
  const profiles = HOUSEHOLD.map((p) => store.createProfile({ ...p }));
  const linh = profiles[0]!;

  const track = catalog.get("tears-of-steel")?.track;
  if (!track) return;
  const known = new Set<string>();
  const picks = track.cues
    .flatMap((cue) => cue.items.map((item) => ({ cue, item })))
    .filter(({ item }) => isNewFor(item, { level: linh.level, known }))
    .slice(0, LINH_DECK_SIZE);
  for (const { cue, item } of picks) {
    store.saveCard({ profileId: linh.id, titleId: track.titleId, cueId: cue.id, itemId: item.id, lemma: item.lemma });
  }
}
