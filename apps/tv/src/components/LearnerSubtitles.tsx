/**
 * The learner subtitle: the English line with words that are new *for the
 * people watching* marked in their colours, a translation line per learner
 * language, and — in word mode — the learnable expressions as stops the
 * remote can land on.
 *
 * One viewer: new words are underlined in their colour. Several viewers: the
 * underline takes the first viewer's colour and a dot per viewer follows the
 * word, so Linh and Minh each see which words are theirs.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { newForViewers, segmentLine, type EnrichedCue, type LearningItem, type Token, type Viewer } from "@rerun/core";
import { colors, safe, type, dp } from "../theme";
import { Focusable } from "./Focusable";

interface Props {
  cue: EnrichedCue | undefined;
  viewers: readonly (Viewer & { name: string })[];
  /** Learner languages to show translations in, first viewer's first. */
  langs: readonly string[];
  /** Items someone in the room has saved, shown with a tick in word mode. */
  saved: ReadonlySet<string>;
  showTranslation: boolean;
  wordMode: boolean;
  /** A card is open on the right: keep the line on the left, clear of it. */
  beside?: boolean;
  onSelectItem: (item: LearningItem) => void;
}

function text(tokens: Token[], leadingSpace: boolean): string {
  return tokens.map((t, i) => ((i > 0 || leadingSpace) && t.spaceBefore ? " " : "") + t.text).join("");
}

export function LearnerSubtitles({ cue, viewers, langs, saved, showTranslation, wordMode, beside, onSelectItem }: Props) {
  const segments = useMemo(() => (cue ? segmentLine(cue) : []), [cue]);
  const marks = useMemo(() => (cue ? newForViewers(cue.items, viewers) : new Map<string, Viewer[]>()), [cue, viewers]);
  if (!cue) return null;
  const accent = viewers[0]?.color ?? colors.accent;
  const together = viewers.length > 1;
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
              const who = marks.get(s.item.id);
              // The space before a word stays outside the underline.
              const lead = i > 0 && s.tokens[0]?.spaceBefore ? " " : "";
              return (
                <Text key={i}>
                  {lead}
                  <Text style={who ? [styles.newWord, { textDecorationColor: who[0]!.color, color: who[0]!.color }] : undefined}>
                    {text(s.tokens, false)}
                  </Text>
                  {together && who
                    ? who.map((v) => (
                        <Text key={v.id} style={[styles.dot, { color: v.color }]}>
                          ●
                        </Text>
                      ))
                    : null}
                </Text>
              );
            })}
          </Text>
        )}
        {showTranslation &&
          langs.map((lang) =>
            cue.translations[lang] ? (
              <Text key={lang} style={styles.translation}>
                {langs.length > 1 ? <Text style={styles.langTag}>{lang.toUpperCase()}  </Text> : null}
                {cue.translations[lang]}
              </Text>
            ) : null,
          )}
      </View>
      {together && !wordMode && !beside && (
        <View style={styles.legend}>
          {viewers.map((v) => (
            <Text key={v.id} style={[styles.legendItem, { color: v.color }]}>
              ● {v.name}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
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
  dot: {
    fontSize: type.small,
  },
  translation: {
    color: colors.muted,
    fontSize: type.translation,
    marginTop: dp(8),
    textAlign: "center",
  },
  langTag: {
    color: colors.muted,
    fontSize: type.small - dp(4),
    fontWeight: "800",
  },
  legend: {
    flexDirection: "row",
    marginTop: dp(10),
  },
  legendItem: {
    fontSize: type.small,
    fontWeight: "700",
    marginHorizontal: dp(14),
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
