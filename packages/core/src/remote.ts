/**
 * What each remote key does in a learning player. Watching, word mode and an
 * open card each claim different keys; in word mode and on a card the arrows
 * and OK belong to the platform's focus engine, so they map to "none" here.
 *
 *   watch   ◀ line before / restart line   ▶ next line   ▲ word mode
 *           ▼ translation on/off           OK play/pause  ☰ auto-pause
 *   words   ▼ or BACK: back to the film
 *   card    BACK: close the card
 */

export type PlayerMode = "watch" | "words" | "card";

/** Key names as Vega's TV event handler reports them (useTVEventHandler eventType). */
export type RemoteKey =
  | "left"
  | "right"
  | "up"
  | "down"
  | "select"
  | "enter"
  | "playpause"
  | "play"
  | "pause"
  | "back"
  | "skip_backward"
  | "skip_forward"
  | "menu"
  | "info";

export type PlayerCommand =
  | { type: "previousLine" }
  | { type: "nextLine" }
  | { type: "enterWords" }
  | { type: "exitWords" }
  | { type: "toggleTranslation" }
  | { type: "toggle" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "closeCard" }
  | { type: "exit" }
  | { type: "seekBy"; seconds: number }
  | { type: "toggleAutoPause" }
  | { type: "none" };

const NONE: PlayerCommand = { type: "none" };

export function commandFor(mode: PlayerMode, key: string): PlayerCommand {
  switch (mode) {
    case "card":
      return key === "back" ? { type: "closeCard" } : NONE;
    case "words":
      return key === "back" || key === "down" ? { type: "exitWords" } : NONE;
    case "watch":
      switch (key as RemoteKey) {
        case "left":
          return { type: "previousLine" };
        case "right":
          return { type: "nextLine" };
        case "up":
          return { type: "enterWords" };
        case "down":
          return { type: "toggleTranslation" };
        // A remote's centre key arrives as "select"; Enter on a keyboard (and
        // injected KEY_ENTER in automation) as "enter".
        case "select":
        case "enter":
        case "playpause":
          return { type: "toggle" };
        case "play":
          return { type: "play" };
        case "pause":
          return { type: "pause" };
        case "back":
          return { type: "exit" };
        case "skip_backward":
          return { type: "seekBy", seconds: -10 };
        case "skip_forward":
          return { type: "seekBy", seconds: 10 };
        case "menu":
        case "info":
          return { type: "toggleAutoPause" };
        default:
          return NONE;
      }
  }
}
