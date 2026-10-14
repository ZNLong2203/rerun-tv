/**
 * The card that opens on an expression in word mode: what it means here, in
 * the viewer's language, and one everyday example. OK saves it to the deck;
 * "I know this" stops it being highlighted for that viewer (and only them).
 *
 * Watching together, the card gives the meaning in each viewer's language
 * and one save button per person, so each deck stays personal.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { pickLang, viewerLanguages, type LearningItem } from "@rerun/core";
import { colors, type, dp } from "../theme";
import { Focusable } from "./Focusable";

const KIND_LABEL: Record<LearningItem["kind"], string> = {
  word: "word",
  phrasal_verb: "phrasal verb",
  idiom: "idiom",
  phrase: "phrase",
  slang: "slang",
  name: "name",
};

interface CardViewer {
  id: string;
  name: string;
  color: string;
  nativeLang: string;
}

interface Props {
  item: LearningItem;
  viewers: readonly CardViewer[];
  /** Viewer ids who already have this word in their deck. */
  savedFor: ReadonlySet<string>;
  onSave: (viewerId: string) => void;
  /** Only offered to a single viewer: knowing a word is personal. */
  onKnown?: () => void;
  onReplay: () => void;
}

export function WordCard({ item, viewers, savedFor, onSave, onKnown, onReplay }: Props) {
  const first = viewers[0]!;
  const lang = first.nativeLang;
  const accent = first.color;
  const together = viewers.length > 1;
  const meaning = pickLang(item.meaning, lang);
  const inContext = pickLang(item.inContext, lang);
  const english = item.meaning.en;
  const otherLangs = viewerLanguages(viewers).slice(1);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.surface, { color: accent }]}>{item.surface}</Text>
        <View style={styles.badges}>
          <Text style={styles.badge}>{item.level}</Text>
          <Text style={styles.badge}>{KIND_LABEL[item.kind]}</Text>
        </View>
      </View>
      {item.lemma !== item.surface.toLowerCase() && <Text style={styles.lemma}>{item.lemma}</Text>}

      <Text style={styles.meaning}>{meaning}</Text>
      {otherLangs.map((l) => (
        <Text key={l} style={styles.otherMeaning}>
          <Text style={styles.langTag}>{l.toUpperCase()}  </Text>
          {pickLang(item.meaning, l)}
        </Text>
      ))}
      {lang !== "en" && english && english !== meaning ? <Text style={styles.english}>{english}</Text> : null}

      <Text style={styles.label}>In this scene</Text>
      <Text style={styles.body}>{inContext}</Text>

      {item.example ? (
        <>
          <Text style={styles.label}>Everyday use</Text>
          <Text style={[styles.body, styles.example]}>“{item.example}”</Text>
        </>
      ) : null}

      <View style={styles.actions}>
        {viewers.map((v, i) => {
          const done = savedFor.has(v.id);
          const label = together ? (done ? `${v.name} ✓` : `Save for ${v.name}`) : done ? "Saved ✓" : "Save to my deck";
          return (
            <Focusable
              key={v.id}
              hasTVPreferredFocus={i === 0}
              ring={colors.text}
              onPress={() => onSave(v.id)}
              style={[styles.button, { backgroundColor: v.color }]}
              testID={i === 0 ? "save-word" : `save-word-${v.id}`}
            >
              <Text style={[styles.buttonText, styles.onAccent]}>{label}</Text>
            </Focusable>
          );
        })}
        <Focusable ring={accent} onPress={onReplay} style={styles.button}>
          <Text style={styles.buttonText}>↺ Again</Text>
        </Focusable>
        {onKnown && (
          <Focusable ring={accent} onPress={onKnown} style={styles.button} testID="known-word">
            <Text style={styles.buttonText}>I know this</Text>
          </Focusable>
        )}
      </View>
      <Text style={styles.hint}>◀ BACK returns to the film</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    // Below the toast row (top right), so "saved — it is on your phone" never covers the word.
    top: dp(140),
    right: dp(96),
    width: dp(760),
    backgroundColor: colors.panel,
    borderRadius: dp(24),
    padding: dp(40),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  surface: {
    fontSize: type.hero,
    fontWeight: "800",
    flexShrink: 1,
  },
  badges: {
    flexDirection: "row",
  },
  badge: {
    color: colors.muted,
    fontSize: type.small,
    borderWidth: dp(2),
    borderColor: colors.line,
    borderRadius: dp(10),
    paddingHorizontal: dp(12),
    paddingVertical: dp(4),
    marginLeft: dp(10),
  },
  lemma: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: dp(4),
  },
  meaning: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "700",
    marginTop: dp(18),
  },
  otherMeaning: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: "700",
    marginTop: dp(8),
  },
  langTag: {
    color: colors.muted,
    fontSize: type.small - dp(4),
    fontWeight: "800",
  },
  english: {
    color: colors.muted,
    fontSize: type.body,
    marginTop: dp(6),
  },
  label: {
    color: colors.muted,
    fontSize: type.small,
    letterSpacing: dp(2),
    textTransform: "uppercase",
    marginTop: dp(26),
  },
  body: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: type.body * 1.4,
    marginTop: dp(8),
  },
  example: {
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    marginTop: dp(32),
  },
  button: {
    backgroundColor: colors.panel2,
    borderRadius: dp(14),
    paddingVertical: dp(14),
    paddingHorizontal: dp(22),
    marginRight: dp(14),
  },
  buttonText: {
    color: colors.text,
    fontSize: type.small,
    fontWeight: "700",
  },
  onAccent: {
    color: colors.bg,
  },
  hint: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: dp(18),
  },
});
