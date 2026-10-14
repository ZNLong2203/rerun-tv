/**
 * A learner's home: today's Daily Rerun first, then the films, each with how
 * hard it is *for this person* — the same film reads "Hard" for Hugo and
 * "Stretch" for Camille. Watching together, each film lists every viewer.
 */

import React, { useEffect, useState } from "react";
import { TVFocusGuideView } from "@amazon-devices/react-native-kepler";
import type { TrackDifficulty } from "@rerun/core";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type Profile, type TitleSummary } from "../api";
import { Focusable } from "../components/Focusable";
import { SERVER_URL } from "../config";
import { useRoom } from "../room";
import { colors, safe, type, dp } from "../theme";

interface Props {
  viewers: Profile[];
  onPlay: (titleId: string) => void;
  onRerun: () => void;
  onPair: () => void;
}

/** titleId -> viewerId -> how hard that film is for that viewer. */
type Difficulty = Record<string, Record<string, TrackDifficulty | undefined>>;

export function HomeScreen({ viewers, onPlay, onRerun, onPair }: Props) {
  const [titles, setTitles] = useState<TitleSummary[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>({});
  const [people, setPeople] = useState(viewers);
  const room = useRoom();
  const together = viewers.length > 1;
  const ids = viewers.map((v) => v.id).join(",");

  useEffect(() => {
    Promise.all(viewers.map((v) => api.titles(v.id)))
      .then((lists) => {
        setTitles(lists[0] ?? []);
        const d: Difficulty = {};
        lists.forEach((list, i) => {
          for (const t of list) (d[t.id] ??= {})[viewers[i]!.id] = t.difficulty;
        });
        setDifficulty(d);
      })
      .catch(() => setTitles([]));
    api
      .profiles()
      .then((ps) => setPeople(viewers.map((v) => ps.find((p) => p.id === v.id) ?? v)))
      .catch(() => {});
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = people[0]!;
  const due = together ? 0 : me.stats.due;
  const dueLines = together ? 0 : me.stats.dueLines;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.brand}>
          Rerun<Text style={{ color: colors.accent }}>.</Text>
        </Text>
        <View style={styles.headerRight}>
          {!together && (
            <Text style={styles.stats}>
              {count(me.stats.saved, "word")} · {count(me.stats.lines, "line")} · {me.stats.known} known · {me.stats.reviewedToday}{" "}
              reviewed today
            </Text>
          )}
          {people.map((p) => (
            <View key={p.id} style={[styles.avatar, { backgroundColor: p.color }]}>
              <Text style={styles.initial}>{p.name[0]}</Text>
            </View>
          ))}
        </View>
      </View>

      {together ? (
        <View style={[styles.rerun, { borderLeftColor: me.color }]}>
          <Text style={styles.rerunLabel}>WATCHING TOGETHER</Text>
          <Text style={styles.rerunTitle}>{people.map((p) => p.name).join(" & ")}</Text>
          <Text style={styles.rerunHint}>
            Each of you sees your own new words, marked in your colour, with a translation in your language. Words you
            save go to your own deck.
          </Text>
        </View>
      ) : (
        <Focusable
          ring={me.color}
          hasTVPreferredFocus={due > 0}
          onPress={due > 0 ? onRerun : undefined}
          lift={1.015}
          style={[styles.rerun, { borderLeftColor: me.color }]}
          testID="daily-rerun"
        >
          <Text style={styles.rerunLabel}>DAILY RERUN</Text>
          <Text style={styles.rerunTitle}>
            {due > 0
              ? `${dueSummary(due - dueLines, dueLines)} from your films ${due === 1 ? "is" : "are"} due, ${me.name}`
              : "Nothing due — save words, or hear a line again with ◀, and they come back here"}
          </Text>
          {due > 0 && <Text style={styles.rerunHint}>Each card replays its moment in the film. Press OK to start.</Text>}
        </Focusable>
      )}

      <Text style={styles.section}>Your films</Text>
      {/* Down from the Daily Rerun lands on the first film, not the nearest tile. */}
      <TVFocusGuideView autoFocus style={styles.row}>
        {titles.map((t, i) => (
          <Focusable
            key={t.id}
            ring={me.color}
            hasTVPreferredFocus={due === 0 && i === 0}
            onPress={t.playable ? () => onPlay(t.id) : undefined}
            style={styles.titleCard}
            testID={`title-${t.id}`}
          >
            <Image source={{ uri: `${SERVER_URL}/media/${t.id}/poster` }} style={styles.poster} />
            <View style={styles.titleBody}>
              <Text style={styles.titleName}>{t.title}</Text>
              <Text style={styles.titleMeta}>
                {t.year} · {Math.round(t.runtimeSeconds / 60)} min · {t.lines} lines
              </Text>
              {people.map((p) => {
                const d = difficulty[t.id]?.[p.id];
                return d ? (
                  <Text key={p.id} style={[styles.difficulty, { color: p.color }]}>
                    {d.label} for {p.name} · {d.newItems} new words
                  </Text>
                ) : null;
              })}
              {!t.playable && <Text style={styles.titleMeta}>Not prepared yet</Text>}
              <Text style={styles.license}>{t.license.attribution}</Text>
            </View>
          </Focusable>
        ))}

        <Focusable ring={me.color} onPress={onPair} style={[styles.titleCard, styles.pair]} testID="pair-phone">
          <Text style={styles.pairTitle}>{room.phones > 0 ? "📱 Phone connected" : "📱 Pair your phone"}</Text>
          <Text style={styles.pairBody}>
            Save words to your pocket, say lines back for a score, and ask about any line.
          </Text>
          {room.code && <Text style={[styles.pairCode, { color: me.color }]}>{room.code}</Text>}
        </Focusable>
      </TVFocusGuideView>
    </ScrollView>
  );
}

/** "1 word", "3 words". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "3 words and 1 line", "2 lines", "1 word". */
function dueSummary(words: number, lines: number): string {
  return [words > 0 ? count(words, "word") : "", lines > 0 ? count(lines, "line") : ""].filter(Boolean).join(" and ");
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: safe.x,
    paddingVertical: safe.y,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  brand: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "800",
  },
  stats: {
    color: colors.muted,
    fontSize: type.small,
    marginRight: dp(20),
  },
  avatar: {
    width: dp(64),
    height: dp(64),
    borderRadius: dp(32),
    marginLeft: dp(12),
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: colors.bg,
    fontSize: dp(32),
    fontWeight: "800",
  },
  rerun: {
    marginTop: dp(48),
    backgroundColor: colors.panel,
    borderRadius: dp(28),
    padding: dp(40),
    borderLeftWidth: dp(12),
  },
  rerunLabel: {
    color: colors.muted,
    fontSize: type.small,
    letterSpacing: dp(4),
  },
  rerunTitle: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "800",
    marginTop: dp(10),
  },
  rerunHint: {
    color: colors.muted,
    fontSize: type.body,
    marginTop: dp(10),
  },
  section: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: "700",
    marginTop: dp(48),
    marginBottom: dp(20),
  },
  row: {
    flexDirection: "row",
  },
  titleCard: {
    width: dp(560),
    backgroundColor: colors.panel,
    borderRadius: dp(24),
    overflow: "hidden",
    marginRight: dp(32),
  },
  poster: {
    width: dp(552),
    height: dp(300),
    backgroundColor: colors.panel2,
  },
  titleBody: {
    padding: dp(24),
  },
  titleName: {
    color: colors.text,
    fontSize: type.title - dp(4),
    fontWeight: "800",
  },
  titleMeta: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: dp(6),
  },
  difficulty: {
    fontSize: type.small + dp(2),
    fontWeight: "700",
    marginTop: dp(10),
  },
  license: {
    color: colors.muted,
    fontSize: type.small - dp(6),
    marginTop: dp(12),
  },
  pair: {
    width: dp(420),
    padding: dp(32),
    justifyContent: "center",
  },
  pairTitle: {
    color: colors.text,
    fontSize: type.body + dp(4),
    fontWeight: "800",
  },
  pairBody: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: dp(12),
    lineHeight: type.small * 1.4,
  },
  pairCode: {
    fontSize: type.title,
    fontWeight: "800",
    letterSpacing: dp(8),
    marginTop: dp(20),
  },
});
