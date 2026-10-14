/**
 * A first-run household so the TV has someone to pick: two French speakers
 * learning English at different levels, and a Spanish speaker. Camille gets a
 * few words already due, so the Daily Rerun has something to show on day one.
 */

import { isNewFor } from "@rerun/core";
import type { Catalog } from "./catalog.js";
import type { Store } from "./store.js";

const HOUSEHOLD = [
  { name: "Camille", nativeLang: "fr", level: "B1", color: "#F59E0B" },
  { name: "Hugo", nativeLang: "fr", level: "A2", color: "#38BDF8" },
  { name: "Ana", nativeLang: "es", level: "B2", color: "#A78BFA" },
] as const;

/** How many of the film's first new-for-her words Camille starts with. */
const STARTER_DECK_SIZE = 3;

export function seedDemo(store: Store, catalog: Catalog) {
  if (store.listProfiles().length > 0) return;
  const profiles = HOUSEHOLD.map((p) => store.createProfile({ ...p }));
  const camille = profiles[0]!;

  const track = catalog.get("tears-of-steel")?.track;
  if (!track) return;
  const known = new Set<string>();
  const picks = track.cues
    .flatMap((cue) => cue.items.map((item) => ({ cue, item })))
    .filter(({ item }) => isNewFor(item, { level: camille.level, known }))
    .slice(0, STARTER_DECK_SIZE);
  for (const { cue, item } of picks) {
    store.saveCard({ profileId: camille.id, titleId: track.titleId, cueId: cue.id, itemId: item.id, lemma: item.lemma });
  }
}
