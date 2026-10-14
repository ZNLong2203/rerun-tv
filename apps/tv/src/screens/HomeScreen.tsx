/**
 * A learner's home: today's Daily Rerun first, then the films, each with how
 * hard it is *for this person* — the same film reads "Stretch" for Minh and
 * "Comfortable" for Linh.
 */

import React, { useEffect, useState } from "react";
import { TVFocusGuideView } from "@amazon-devices/react-native-kepler";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type Profile, type TitleSummary } from "../api";
import { Focusable } from "../components/Focusable";
import { SERVER_URL } from "../config";
import { useRoom } from "../room";
import { colors, safe, type, dp } from "../theme";

interface Props {
  profile: Profile;
  onPlay: (titleId: string) => void;
  onRerun: () => void;
  onPair: () => void;
}

export function HomeScreen({ profile, onPlay, onRerun, onPair }: Props) {
  const [titles, setTitles] = useState<TitleSummary[]>([]);
  const [me, setMe] = useState(profile);
  const room = useRoom();

  useEffect(() => {
    api.titles(profile.id).then(setTitles).catch(() => setTitles([]));
    api
      .profiles()
      .then((ps) => setMe(ps.find((p) => p.id === profile.id) ?? profile))
      .catch(() => {});
  }, [profile]);

  const due = me.stats.due;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.brand}>
          Rerun<Text style={{ color: colors.accent }}>.</Text>
        </Text>
        <View style={styles.headerRight}>
          <Text style={styles.stats}>
            {me.stats.saved} saved · {me.stats.known} known · {me.stats.reviewedToday} reviewed today
          </Text>
          <View style={[styles.avatar, { backgroundColor: me.color }]}>
            <Text style={styles.initial}>{me.name[0]}</Text>
          </View>
        </View>
      </View>

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
            ? `${due} ${due === 1 ? "word" : "words"} from your films ${due === 1 ? "is" : "are"} due, ${me.name}`
            : "Nothing due — save words while you watch and they come back here"}
        </Text>
        {due > 0 && <Text style={styles.rerunHint}>Each card replays the moment you met the word. Press OK to start.</Text>}
      </Focusable>

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
              {t.difficulty && (
                <Text style={[styles.difficulty, { color: me.color }]}>
                  {t.difficulty.label} for {me.name} · {t.difficulty.newItems} new words
                </Text>
              )}
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
