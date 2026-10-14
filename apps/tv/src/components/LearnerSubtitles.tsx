/**
 * The learner subtitle: the English line with words that are new *for this
 * viewer* underlined in their colour, the translation under it, and — in
 * word mode — the learnable expressions as stops the remote can land on.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { isNewFor, segmentLine, type EnrichedCue, type LearningItem, type Token } from "@rerun/core";
import { colors, safe, type, dp } from "../theme";
import { Focusable } from "./Focusable";

interface Props {
  cue: EnrichedCue | undefined;
  lang: string;
  level: Parameters<typeof isNewFor>[1]["level"];
  known: ReadonlySet<string>;
  saved: ReadonlySet<string>;
  accent: string;
  showTranslation: boolean;
  wordMode: boolean;
  /** A card is open on the right: keep the line on the left, clear of it. */
  beside?: boolean;
  onSelectItem: (item: LearningItem) => void;
}

function text(tokens: Token[], leadingSpace: boolean): string {
  return tokens.map((t, i) => ((i > 0 || leadingSpace) && t.spaceBefore ? " " : "") + t.text).join("");
}

export function LearnerSubtitles({ cue, lang, level, known, saved, accent, showTranslation, wordMode, beside, onSelectItem }: Props) {
  const segments = useMemo(() => (cue ? segmentLine(cue) : []), [cue]);
  if (!cue) return null;
  const firstItem = segments.find((s) => s.kind === "item");

  return (
    <View style={[styles.wrap, beside && styles.wrapBeside]} pointerEvents="box-none">
      <View style={[styles.box, wordMode && styles.boxWordMode, beside && styles.boxBeside]}>
        {wordMode ? (
          <View style={styles.wordRow}>
            {segments.map((s, i) =>
              s.kind === "item" ? (
                <Focusable
                  key={i}
                  ring={accent}
                  hasTVPreferredFocus={s === firstItem}
                  onPress={() => onSelectItem(s.item)}
                  style={styles.chip}
                  testID={`item-${s.item.id}`}
                >
                  {(focused) => (
                    <Text style={[styles.line, styles.chipText, focused && { color: accent }]}>
                      {text(s.tokens, false)}
                      {saved.has(s.item.id) ? " ✓" : ""}
                    </Text>
                  )}
                </Focusable>
              ) : (
                <Text key={i} style={[styles.line, styles.dim]}>
                  {text(s.tokens, i > 0)}
                </Text>
              ),
            )}
          </View>
        ) : (
          <Text style={styles.line}>
            {segments.map((s, i) => {
              if (s.kind === "text") return <Text key={i}>{text(s.tokens, i > 0)}</Text>;
              const fresh = isNewFor(s.item, { level, known });
              // The space before a word stays outside the underline.
              const lead = i > 0 && s.tokens[0]?.spaceBefore ? " " : "";
              return (
                <Text key={i}>
                  {lead}
                  <Text style={fresh ? [styles.newWord, { textDecorationColor: accent, color: accent }] : undefined}>
                    {text(s.tokens, false)}
                  </Text>
                </Text>
              );
            })}
          </Text>
        )}
        {showTranslation && cue.translations[lang] ? (
          <Text style={styles.translation}>{cue.translations[lang]}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: dp(0),
    right: dp(0),
    bottom: dp(72),
    alignItems: "center",
  },
  wrapBeside: {
    alignItems: "flex-start",
    paddingLeft: safe.x,
  },
  boxBeside: {
    maxWidth: dp(1920 - 760 - 96 * 2 - 48),
  },
  box: {
    maxWidth: dp(1500),
    backgroundColor: colors.scrim,
    borderRadius: dp(18),
    paddingVertical: dp(18),
    paddingHorizontal: dp(32),
    alignItems: "center",
  },
  boxWordMode: {
    backgroundColor: colors.panel,
  },
  line: {
    color: colors.text,
    fontSize: type.subtitle,
    lineHeight: type.subtitle * 1.3,
    fontWeight: "600",
    textAlign: "center",
  },
  newWord: {
    textDecorationLine: "underline",
    fontWeight: "800",
  },
  translation: {
    color: colors.muted,
    fontSize: type.translation,
    marginTop: dp(8),
    textAlign: "center",
  },
  wordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  chip: {
    borderRadius: dp(12),
    paddingHorizontal: dp(8),
    marginHorizontal: dp(4),
    backgroundColor: colors.panel2,
  },
  chipText: {
    fontWeight: "800",
  },
  dim: {
    color: colors.muted,
  },
});
