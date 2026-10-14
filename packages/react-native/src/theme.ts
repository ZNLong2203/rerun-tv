/**
 * Everything visual the subtitle component needs, in layout units. Defaults
 * suit a 1080p TV in density-independent units (960 wide, as on Vega); pass
 * your own sizes when your app lays out differently.
 */
export interface SubtitleTheme {
  text: string;
  muted: string;
  /** Background behind the line while watching. */
  scrim: string;
  /** Background behind the line in word mode. */
  panel: string;
  /** Background of a focusable word. */
  chip: string;
  fontSize: number;
  translationSize: number;
  smallSize: number;
  radius: number;
  paddingX: number;
  paddingY: number;
  /** Distance from the bottom of the screen. */
  bottom: number;
  /** Left margin when the line moves aside for a card. */
  safeX: number;
  maxWidth: number;
  /** Width the line may take while a card is open beside it. */
  besideMaxWidth: number;
  ringWidth: number;
}

export const defaultTheme: SubtitleTheme = {
  text: "#F3F5F9",
  muted: "#94A0B8",
  scrim: "rgba(5, 8, 14, 0.78)",
  panel: "#131A26",
  chip: "#1A2333",
  fontSize: 23,
  translationSize: 16,
  smallSize: 11,
  radius: 9,
  paddingX: 16,
  paddingY: 9,
  bottom: 36,
  safeX: 48,
  maxWidth: 750,
  besideMaxWidth: 434,
  ringWidth: 2,
};
