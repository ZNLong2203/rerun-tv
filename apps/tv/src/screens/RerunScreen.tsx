/**
 * Daily Rerun: spaced repetition where every flashcard is a moment in a film.
 * A word card plays the moment the learner met the word: recall the meaning,
 * reveal it, say how well you knew it. A listening card is a line the learner
 * had to hear again while watching: the clip plays with the text hidden, and
 * the line appears only when they ask for it.
 */

import { KeplerVideoSurfaceView } from "@amazon-devices/react-native-w3cmedia";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "@amazon-devices/react-native-kepler";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { CardView, Grade } from "@rerun/core";
import { api, type Profile } from "../api";
import { Focusable } from "../components/Focusable";
import { StillFrame } from "../player/StillFrame";
import { useVideo } from "../player/useVideo";
import { colors, safe, type, dp } from "../theme";

const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: "again", label: "Forgot", hint: "again in a minute" },
  { grade: "hard", label: "Hard", hint: "a bit sooner" },
  { grade: "good", label: "Knew it", hint: "on schedule" },
  { grade: "easy", label: "Easy", hint: "much later" },
];

export function RerunScreen({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [cards, setCards] = useState<CardView[]>();
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    api.due(profile.id).then(setCards).catch(() => setCards([]));
  }, [profile.id]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onDone();
      return true;
    });
    return () => sub.remove();
  }, [onDone]);

  if (!cards) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={profile.color} />
      </View>
    );
  }

  const card = cards[index];
  if (!card) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.doneTitle}>
          {reviewed > 0 ? `${reviewed} ${reviewed === 1 ? "card" : "cards"} rerun. Nice, ${profile.name}.` : "Nothing due right now."}
        </Text>
        <Text style={styles.doneBody}>What you knew comes back later; what you forgot comes back sooner.</Text>
        <Focusable hasTVPreferredFocus ring={profile.color} onPress={onDone} style={styles.button}>
          <Text style={styles.buttonText}>Back to films</Text>
        </Focusable>
      </View>
    );
  }

  return (
    // One player per title; cards from the same film reuse it.
    <Review
      key={card.titleId}
      profile={profile}
      card={card}
      position={`${index + 1} / ${cards.length}`}
      onGraded={() => {
        setReviewed((r) => r + 1);
        setIndex((i) => i + 1);
      }}
    />
  );
}

function Review({ profile, card, position, onGraded }: { profile: Profile; card: CardView; position: string; onGraded: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const stopAt = useRef<number | undefined>(undefined);
  const video = useVideo(
    card.videoUrl,
    useCallback((_prev: number, current: number) => {
      if (stopAt.current !== undefined && current >= stopAt.current) {
        stopAt.current = undefined;
        videoRef.current?.pause();
      }
    }, []),
    Boolean(card.frameUrl),
  );
  const videoRef = useRef(video);
  videoRef.current = video;

  const playClip = useCallback(() => {
    stopAt.current = card.end + 0.3;
    video.seek(card.start - 0.15);
    video.play();
  }, [card, video]);

  // Each new card starts by replaying its moment.
  useEffect(() => {
    setRevealed(false);
    if (video.ready) playClip();
  }, [card.id, video.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = async (g: Grade) => {
    video.pause();
    try {
      await api.grade(card.id, g);
    } finally {
      onGraded();
    }
  };

  const listening = card.kind === "line";
  const at = listening ? -1 : card.line.toLowerCase().indexOf(card.surface.toLowerCase());
  return (
    <View style={styles.root}>
      <View style={styles.videoBox}>
        {video.ready && !card.frameUrl && <KeplerVideoSurfaceView style={StyleSheet.absoluteFill} {...video.surface} />}
        {video.ready && card.frameUrl && <StillFrame uri={`${card.frameUrl}?t=${video.frameTime}`} fit="cover" />}
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>
          DAILY RERUN · {position}
          {listening ? " · LISTENING" : ""}
        </Text>
        {listening && !revealed ? (
          <Text style={[styles.line, styles.hidden]}>What did they say?</Text>
        ) : (
          <Text style={styles.line}>
            {at >= 0 ? (
              <>
                {card.line.slice(0, at)}
                <Text style={{ color: profile.color, fontWeight: "800" }}>{card.line.slice(at, at + card.surface.length)}</Text>
                {card.line.slice(at + card.surface.length)}
              </>
            ) : (
              card.line
            )}
          </Text>
        )}

        {!revealed ? (
          <>
            <Text style={styles.question}>
              {listening ? "You played this line again while watching. Listen, then check." : `What does “${card.surface}” mean here?`}
            </Text>
            <View style={styles.actions}>
              <Focusable hasTVPreferredFocus ring={colors.text} onPress={() => setRevealed(true)} style={[styles.button, { backgroundColor: profile.color }]} testID="reveal">
                <Text style={[styles.buttonText, { color: colors.bg }]}>{listening ? "Show the line" : "Show meaning"}</Text>
              </Focusable>
              <Focusable ring={profile.color} onPress={playClip} style={styles.button}>
                <Text style={styles.buttonText}>↺ Hear it again</Text>
              </Focusable>
            </View>
          </>
        ) : (
          <>
            {!listening && <Text style={styles.meaning}>{card.meaning}</Text>}
            <Text style={[styles.translation, listening && styles.lineTranslation]}>{card.lineTranslation}</Text>
            <View style={styles.actions}>
              {GRADES.map((g) => (
                <Focusable
                  key={g.grade}
                  ring={profile.color}
                  hasTVPreferredFocus={g.grade === "good"}
                  onPress={() => grade(g.grade)}
                  style={styles.gradeButton}
                  testID={`grade-${g.grade}`}
                >
                  <Text style={styles.buttonText}>{g.label}</Text>
                  <Text style={styles.gradeHint}>{g.hint}</Text>
                </Focusable>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.bg,
    paddingHorizontal: safe.x,
    paddingVertical: safe.y,
  },
  center: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBox: {
    width: dp(860),
    height: dp(484),
    alignSelf: "center",
    borderRadius: dp(24),
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  panel: {
    flex: 1,
    paddingLeft: dp(56),
    justifyContent: "center",
  },
  label: {
    color: colors.muted,
    fontSize: type.small,
    letterSpacing: dp(4),
  },
  line: {
    color: colors.text,
    fontSize: type.title - dp(6),
    lineHeight: (type.title - dp(6)) * 1.35,
    fontWeight: "600",
    marginTop: dp(18),
  },
  hidden: {
    color: colors.muted,
  },
  lineTranslation: {
    fontSize: type.translation,
    marginTop: dp(20),
  },
  question: {
    color: colors.muted,
    fontSize: type.body,
    marginTop: dp(32),
  },
  meaning: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "800",
    marginTop: dp(32),
  },
  translation: {
    color: colors.muted,
    fontSize: type.body,
    marginTop: dp(12),
  },
  actions: {
    flexDirection: "row",
    marginTop: dp(36),
  },
  button: {
    backgroundColor: colors.panel2,
    borderRadius: dp(16),
    paddingVertical: dp(18),
    paddingHorizontal: dp(28),
    marginRight: dp(16),
    marginTop: dp(12),
  },
  gradeButton: {
    backgroundColor: colors.panel2,
    borderRadius: dp(16),
    paddingVertical: dp(14),
    paddingHorizontal: dp(18),
    marginRight: dp(12),
    marginTop: dp(12),
    alignItems: "center",
  },
  buttonText: {
    color: colors.text,
    fontSize: type.small + dp(2),
    fontWeight: "800",
  },
  gradeHint: {
    color: colors.muted,
    fontSize: type.small - dp(4),
    marginTop: dp(4),
  },
  doneTitle: {
    color: colors.text,
    fontSize: type.hero,
    fontWeight: "800",
    textAlign: "center",
  },
  doneBody: {
    color: colors.muted,
    fontSize: type.body,
    marginTop: dp(16),
    marginBottom: dp(32),
  },
});
