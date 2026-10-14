/**
 * Rerun's subtitles: the shared learner-subtitles component, themed with the
 * app's colours and 1080p design sizes.
 */

import React from "react";
import { LearnerSubtitles as Shared, type LearnerSubtitlesProps, type SubtitleTheme } from "@rerun/react-native";
import { colors, dp, safe, type } from "../theme";

const theme: Partial<SubtitleTheme> = {
  text: colors.text,
  muted: colors.muted,
  scrim: colors.scrim,
  panel: colors.panel,
  chip: colors.panel2,
  fontSize: type.subtitle,
  translationSize: type.translation,
  smallSize: type.small,
  radius: dp(18),
  paddingX: dp(32),
  paddingY: dp(18),
  bottom: dp(72),
  safeX: safe.x,
  maxWidth: dp(1500),
  besideMaxWidth: dp(1920 - 760 - 96 * 2 - 48),
  ringWidth: dp(4),
};

export function LearnerSubtitles(props: Omit<LearnerSubtitlesProps, "theme">) {
  return <Shared {...props} theme={theme} />;
}
