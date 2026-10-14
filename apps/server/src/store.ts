/**
 * Learner profiles, known words and saved cards in SQLite (node:sqlite, no
 * native build step). One file per server; ":memory:" for tests.
 */

import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CEFR_LEVELS,
  newCard,
  review,
  isMastered,
  type CardState,
  type CefrLevel,
  type Grade,
} from "@rerun/core";

export interface Profile {
  id: string;
  name: string;
  nativeLang: string;
  level: CefrLevel;
  /** Accent colour for the profile tile, e.g. "#F59E0B". */
  color: string;
  createdAt: number;
}

export interface StoredCard {
  id: string;
  profileId: string;
  titleId: string;
  cueId: number;
  itemId: string;
  lemma: string;
  createdAt: number;
  state: CardState;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  native_lang TEXT NOT NULL,
  level TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS known (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lemma TEXT NOT NULL,
  PRIMARY KEY (profile_id, lemma)
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  cue_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  lemma TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  due INTEGER NOT NULL,
  interval_days REAL NOT NULL,
  ease REAL NOT NULL,
  streak INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  step INTEGER NOT NULL,
  UNIQUE (profile_id, title_id, item_id)
);
CREATE INDEX IF NOT EXISTS cards_due ON cards (profile_id, due);
CREATE TABLE IF NOT EXISTS reviews (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  at INTEGER NOT NULL
);
`;

type Row = Record<string, string | number | null>;

function toProfile(r: Row): Profile {
  return {
    id: String(r.id),
    name: String(r.name),
    nativeLang: String(r.native_lang),
    level: r.level as CefrLevel,
    color: String(r.color),
    createdAt: Number(r.created_at),
  };
}

function toCard(r: Row): StoredCard {
  return {
    id: String(r.id),
    profileId: String(r.profile_id),
    titleId: String(r.title_id),
    cueId: Number(r.cue_id),
    itemId: String(r.item_id),
    lemma: String(r.lemma),
    createdAt: Number(r.created_at),
    state: {
      due: Number(r.due),
      intervalDays: Number(r.interval_days),
      ease: Number(r.ease),
      streak: Number(r.streak),
      lapses: Number(r.lapses),
      step: Number(r.step),
    },
  };
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  // ── Profiles ────────────────────────────────────────────────

  listProfiles(): Profile[] {
    return (this.db.prepare("SELECT * FROM profiles ORDER BY created_at").all() as Row[]).map(toProfile);
  }

  getProfile(id: string): Profile | undefined {
    const r = this.db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as Row | undefined;
    return r ? toProfile(r) : undefined;
  }

  createProfile(input: { name: string; nativeLang: string; level: CefrLevel; color: string }): Profile {
    if (!CEFR_LEVELS.includes(input.level)) throw new Error(`bad level ${input.level}`);
    const p: Profile = { id: randomUUID(), createdAt: this.now(), ...input };
    this.db
      .prepare("INSERT INTO profiles (id, name, native_lang, level, color, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(p.id, p.name, p.nativeLang, p.level, p.color, p.createdAt);
    return p;
  }

  updateProfile(id: string, patch: Partial<Pick<Profile, "name" | "nativeLang" | "level" | "color">>): Profile | undefined {
    const current = this.getProfile(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.db
      .prepare("UPDATE profiles SET name = ?, native_lang = ?, level = ?, color = ? WHERE id = ?")
      .run(next.name, next.nativeLang, next.level, next.color, id);
    return next;
  }

  deleteProfile(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM profiles WHERE id = ?").run(id).changes) > 0;
  }

  // ── Known words ─────────────────────────────────────────────

  knownLemmas(profileId: string): Set<string> {
    const rows = this.db.prepare("SELECT lemma FROM known WHERE profile_id = ?").all(profileId) as Row[];
    return new Set(rows.map((r) => String(r.lemma)));
  }

  setKnown(profileId: string, lemma: string, known: boolean) {
    if (known) {
      this.db.prepare("INSERT OR IGNORE INTO known (profile_id, lemma) VALUES (?, ?)").run(profileId, lemma);
    } else {
      this.db.prepare("DELETE FROM known WHERE profile_id = ? AND lemma = ?").run(profileId, lemma);
    }
  }

  // ── Cards ───────────────────────────────────────────────────

  /** Save a word; saving it again returns the existing card unchanged. */
  saveCard(input: { profileId: string; titleId: string; cueId: number; itemId: string; lemma: string }): {
    card: StoredCard;
    created: boolean;
  } {
    const existing = this.db
      .prepare("SELECT * FROM cards WHERE profile_id = ? AND title_id = ? AND item_id = ?")
      .get(input.profileId, input.titleId, input.itemId) as Row | undefined;
    if (existing) return { card: toCard(existing), created: false };

    const now = this.now();
    const card: StoredCard = { id: randomUUID(), createdAt: now, state: newCard(now), ...input };
    const s = card.state;
    this.db
      .prepare(
        `INSERT INTO cards (id, profile_id, title_id, cue_id, item_id, lemma, created_at, due, interval_days, ease, streak, lapses, step)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(card.id, card.profileId, card.titleId, card.cueId, card.itemId, card.lemma, now, s.due, s.intervalDays, s.ease, s.streak, s.lapses, s.step);
    return { card, created: true };
  }

  getCard(id: string): StoredCard | undefined {
    const r = this.db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as Row | undefined;
    return r ? toCard(r) : undefined;
  }

  listCards(profileId: string): StoredCard[] {
    return (this.db.prepare("SELECT * FROM cards WHERE profile_id = ? ORDER BY created_at DESC").all(profileId) as Row[]).map(toCard);
  }

  dueCards(profileId: string, limit: number): StoredCard[] {
    return (
      this.db
        .prepare("SELECT * FROM cards WHERE profile_id = ? AND due <= ? ORDER BY due, lapses DESC LIMIT ?")
        .all(profileId, this.now(), limit) as Row[]
    ).map(toCard);
  }

  deleteCard(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM cards WHERE id = ?").run(id).changes) > 0;
  }

  /** Grade a card; a card that reaches the mastered interval marks its lemma known. */
  reviewCard(id: string, grade: Grade): StoredCard | undefined {
    const card = this.getCard(id);
    if (!card) return undefined;
    const now = this.now();
    const s = review(card.state, grade, now);
    this.db
      .prepare("UPDATE cards SET due = ?, interval_days = ?, ease = ?, streak = ?, lapses = ?, step = ? WHERE id = ?")
      .run(s.due, s.intervalDays, s.ease, s.streak, s.lapses, s.step, id);
    this.db.prepare("INSERT INTO reviews (card_id, grade, at) VALUES (?, ?, ?)").run(id, grade, now);
    if (isMastered(s)) this.setKnown(card.profileId, card.lemma, true);
    return { ...card, state: s };
  }

  stats(profileId: string): { saved: number; due: number; reviewedToday: number; known: number } {
    const dayStart = new Date(this.now());
    dayStart.setHours(0, 0, 0, 0);
    const one = (sql: string, ...args: (string | number)[]) =>
      Number((this.db.prepare(sql).get(...args) as Row).n);
    return {
      saved: one("SELECT COUNT(*) AS n FROM cards WHERE profile_id = ?", profileId),
      due: one("SELECT COUNT(*) AS n FROM cards WHERE profile_id = ? AND due <= ?", profileId, this.now()),
      reviewedToday: one(
        "SELECT COUNT(*) AS n FROM reviews r JOIN cards c ON c.id = r.card_id WHERE c.profile_id = ? AND r.at >= ?",
        profileId,
        dayStart.getTime(),
      ),
      known: one("SELECT COUNT(*) AS n FROM known WHERE profile_id = ?", profileId),
    };
  }
}
