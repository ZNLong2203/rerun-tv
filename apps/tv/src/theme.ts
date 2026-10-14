import { Dimensions } from "react-native";

/**
 * 10-foot UI tokens. The layout is designed at 1920×1080 and keeps text and
 * focusable items inside the 5% title-safe margin Fire TV recommends.
 *
 * Vega lays out in density-independent units (a 1080p screen is 960 wide),
 * so every size goes through dp(), which maps design pixels to the window.
 */
const DESIGN_WIDTH = 1920;
const scale = Dimensions.get("window").width / DESIGN_WIDTH;

/** Design pixels (at 1920×1080) to layout units for this screen. */
export function dp(designPx: number): number {
  return Math.round(designPx * scale * 2) / 2;
}
export const colors = {
  bg: "#0B0F17",
  panel: "#131A26",
  panel2: "#1A2333",
  line: "#243046",
  text: "#F3F5F9",
  muted: "#94A0B8",
  accent: "#F59E0B",
  good: "#34D399",
  bad: "#F87171",
  scrim: "rgba(5, 8, 14, 0.78)",
} as const;

export const safe = { x: dp(96), y: dp(54) } as const;

export const type = {
  hero: dp(64),
  title: dp(44),
  subtitle: dp(46),
  translation: dp(32),
  body: dp(28),
  small: dp(22),
} as const;
