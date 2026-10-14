/**
 * Learner subtitles for a TV: the line with the words that are new *for the
 * people watching* marked in their colours, a translation line per learner
 * language, and — in word mode — the learnable expressions as stops the
 * remote can land on.
 *
 * One viewer: new words are underlined in their colour. Several viewers: the
 * underline takes the first viewer's colour and a dot per viewer follows the
 * word, so each person sees which words are theirs.
 *
 * The component draws; it never touches the player. Feed it the cue at the
 * playhead (cueIndexAt) and handle keys with commandFor from the core.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { newForViewers, segmentLine, type EnrichedCue, type LearningItem, type Token, type Viewer } from "@rerun/core";
import { FocusChip } from "./FocusChip";
import { defaultTheme, type SubtitleTheme } from "./theme";

export interface LearnerSubtitlesProps {
  cue: EnrichedCue | undefined;
  /** Who is watching; the first one's colour leads. */
  viewers: readonly (Viewer & { name: string })[];
  /** Learner languages to show translations in, first viewer's first. */
  langs: readonly string[];
  /** Item ids someone in the room has saved, shown with a tick in word mode. */
  saved?: ReadonlySet<string>;
  showTranslation?: boolean;
  /** Pause-and-pick mode: learnable expressions become focusable. */
  wordMode?: boolean;
  /** A card is open on the right: keep the line on the left, clear of it. */
  beside?: boolean;
  onSelectItem?: (item: LearningItem) => void;
  theme?: Partial<SubtitleTheme>;
}

function text(tokens: Token[], leadingSpace: boolean): string {
  return tokens.map((t, i) => ((i > 0 || leadingSpace) && t.spaceBefore ? " " : "") + t.text).join("");
}

const NONE = new Set<string>();

export function LearnerSubtitles({
  cue,
  viewers,
  langs,
  saved = NONE,
  showTranslation = true,
  wordMode = false,
  beside = false,
  onSelectItem,
  theme: overrides,
}: LearnerSubtitlesProps) {
  const theme = useMemo(() => ({ ...defaultTheme, ...overrides }), [overrides]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const segments = useMemo(() => (cue ? segmentLine(cue) : []), [cue]);
  const marks = useMemo(() => (cue ? newForViewers(cue.items, viewers) : new Map<string, Viewer[]>()), [cue, viewers]);
  if (!cue) return null;
  const accent = viewers[0]?.color ?? theme.text;
  const together = viewers.length > 1;
  const firstItem = segments.find((s) => s.kind === "item");

  return (
    <View style={[styles.wrap, beside && styles.wrapBeside]} pointerEvents="box-none">
      <View style={[styles.box, wordMode && styles.boxWordMode, beside && styles.boxBeside]}>
        {wordMode ? (
          <View style={styles.wordRow}>
            {segments.map((s, i) =>
              s.kind === "item" ? (
                <FocusChip
                  key={i}
                  ring={accent}
                  ringWidth={theme.ringWidth}
                  hasTVPreferredFocus={s === firstItem}
                  onPress={() => onSelectItem?.(s.item)}
                  style={styles.chip}
                  testID={`item-${s.item.id}`}
                >
                  {(focused) => (
                    <Text style={[styles.line, styles.chipText, focused && { color: accent }]}>
                      {text(s.tokens, false)}
                      {saved.has(s.item.id) ? " ✓" : ""}
                    </Text>
                  )}
                </FocusChip>
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

function makeStyles(t: SubtitleTheme) {
  return StyleSheet.create({
    wrap: { position: "absolute", left: 0, right: 0, bottom: t.bottom, alignItems: "center" },
    wrapBeside: { alignItems: "flex-start", paddingLeft: t.safeX },
    box: {
      maxWidth: t.maxWidth,
      backgroundColor: t.scrim,
      borderRadius: t.radius,
      paddingVertical: t.paddingY,
      paddingHorizontal: t.paddingX,
      alignItems: "center",
    },
    boxWordMode: { backgroundColor: t.panel },
    boxBeside: { maxWidth: t.besideMaxWidth },
    line: { color: t.text, fontSize: t.fontSize, lineHeight: t.fontSize * 1.3, fontWeight: "600", textAlign: "center" },
    newWord: { textDecorationLine: "underline", fontWeight: "800" },
    dot: { fontSize: t.smallSize },
    translation: { color: t.muted, fontSize: t.translationSize, marginTop: t.paddingY / 2, textAlign: "center" },
    langTag: { color: t.muted, fontSize: t.smallSize * 0.85, fontWeight: "800" },
    legend: { flexDirection: "row", marginTop: t.paddingY / 2 },
    legendItem: { fontSize: t.smallSize, fontWeight: "700", marginHorizontal: t.paddingX / 2 },
    wordRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center" },
    chip: { borderRadius: t.radius * 0.66, paddingHorizontal: t.paddingX / 4, marginHorizontal: 2, backgroundColor: t.chip },
    chipText: { fontWeight: "800" },
    dim: { color: t.muted },
  });
}
