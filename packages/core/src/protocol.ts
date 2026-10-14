/**
 * Messages between the TV and the phones paired with it. The server relays
 * them inside a room named by the pairing code; it only checks the shape.
 */

export type Role = "tv" | "phone";

export type RemoteAction = "play" | "pause" | "toggle" | "replay" | "previous" | "next";

export type CardKind = "word" | "line";

/** The item id of the listening card for a line: one per line and person. */
export function lineItemId(cueId: number): string {
  return `line:${cueId}`;
}

/**
 * A card in someone's deck, as the TV and the phone show it: a word they
 * saved, or a line they had to hear again (`kind: "line"`, with no word).
 */
export interface CardView {
  id: string;
  kind: CardKind;
  profileId: string;
  titleId: string;
  cueId: number;
  itemId: string;
  surface: string;
  lemma: string;
  meaning: string;
  line: string;
  lineTranslation: string;
  start: number;
  end: number;
  due: number;
  /** Where the film plays from, so the card can replay its moment. */
  videoUrl: string;
  /** Set when the server runs in still mode: frames instead of video. */
  frameUrl?: string;
}

export type RoomMessage =
  /** Server → everyone: who is in the room. */
  | { type: "presence"; tv: boolean; phones: number }
  /** TV → phones: which profile is watching what, and the line on screen. */
  | {
      type: "now";
      profileId: string;
      titleId: string | null;
      cue: { id: number; text: string; translation: string; start: number; end: number } | null;
    }
  /** TV → phones: a word was just saved. */
  | { type: "card.saved"; card: CardView }
  /** Phone → TV: remote-control actions. */
  | { type: "remote"; action: RemoteAction }
  /** Phone → TV: result of a shadowing attempt, shown on the big screen. */
  | { type: "shadow.result"; cueId: number; score: number; heard: string }
  /** Phone → TV: a profile was created or changed from the phone. */
  | { type: "profiles.changed" };

const TYPES = new Set<RoomMessage["type"]>([
  "presence",
  "now",
  "card.saved",
  "remote",
  "shadow.result",
  "profiles.changed",
]);

/** Which messages each role may send. Presence comes only from the server. */
export const ALLOWED_FROM: Record<Role, ReadonlySet<RoomMessage["type"]>> = {
  tv: new Set(["now", "card.saved"]),
  phone: new Set(["remote", "shadow.result", "profiles.changed"]),
};

export function parseRoomMessage(raw: string): RoomMessage | undefined {
  try {
    const msg = JSON.parse(raw) as { type?: unknown };
    if (msg && typeof msg === "object" && TYPES.has(msg.type as RoomMessage["type"])) {
      return msg as RoomMessage;
    }
  } catch {
    // fall through
  }
  return undefined;
}

/** Pairing codes avoid look-alike characters (0/O, 1/I/L) for reading off a TV. */
export const PAIR_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIR_CODE_LENGTH = 5;

export function isPairCode(code: string): boolean {
  return code.length === PAIR_CODE_LENGTH && [...code].every((c) => PAIR_ALPHABET.includes(c));
}
