/**
 * "Who's learning tonight?" — one tile per household member. New people are
 * added from the phone, because typing a name with a remote is miserable.
 * "Watch together" picks several people for one film: each sees their own
 * new words in their own colour.
 */

import { BackHandler } from "@amazon-devices/react-native-kepler";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, type Profile } from "../api";
import { Focusable } from "../components/Focusable";
import { useRoomMessages } from "../room";
import { colors, safe, type, dp } from "../theme";

const LANG_NAMES: Record<string, string> = {
  vi: "Tiếng Việt",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  "pt-PT": "Português",
  id: "Bahasa Indonesia",
  en: "English",
};

export function ProfilesScreen({ onPick, onAdd }: { onPick: (viewers: Profile[]) => void; onAdd: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>();
  const [error, setError] = useState<string>();
  const [together, setTogether] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  useEffect(() => {
    if (!together) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setTogether(false);
      setChosen([]);
      return true;
    });
    return () => sub.remove();
  }, [together]);

  const choose = (p: Profile) => {
    if (!together) return onPick([p]);
    setChosen((c) => (c.includes(p.id) ? c.filter((id) => id !== p.id) : [...c, p.id]));
  };

  const load = useCallback(() => {
    api
      .profiles()
      .then((p) => {
        setProfiles(p);
        setError(undefined);
      })
      .catch(() => setError("Can't reach the Rerun server. Is it running on your computer?"));
  }, []);

  useEffect(load, [load]);
  useRoomMessages((msg) => {
    if (msg.type === "profiles.changed") load();
  });

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>
        Rerun<Text style={{ color: colors.accent }}>.</Text>
      </Text>
      <Text style={styles.heading}>{together ? "Who's watching together?" : "Who's learning tonight?"}</Text>
      {error && (
        <Focusable onPress={load} style={styles.retry} hasTVPreferredFocus>
          <Text style={styles.retryText}>{error} — press OK to retry</Text>
        </Focusable>
      )}
      <View style={styles.row}>
        {profiles?.map((p, i) => (
          <Focusable
            // Remount the tiles when the mode changes, so focus lands on the
            // first person instead of vanishing with the button that was pressed.
            key={`${p.id}-${together ? "together" : "one"}`}
            ring={p.color}
            hasTVPreferredFocus={i === 0}
            onPress={() => choose(p)}
            style={[styles.tile, chosen.includes(p.id) && { borderColor: p.color }]}
            testID={`profile-${p.name}`}
          >
            <View style={[styles.avatar, { backgroundColor: p.color }]}>
              <Text style={styles.initial}>{p.name[0]}</Text>
            </View>
            <Text style={styles.name}>
              {p.name}
              {chosen.includes(p.id) ? " ✓" : ""}
            </Text>
            <Text style={styles.meta}>
              English {p.level} · {LANG_NAMES[p.nativeLang] ?? p.nativeLang}
            </Text>
            <Text style={styles.meta}>
              {p.stats.due > 0 ? `${p.stats.due} words to rerun` : `${p.stats.saved} words saved`}
            </Text>
          </Focusable>
        ))}
        {profiles && !together && (
          <Focusable onPress={onAdd} style={[styles.tile, styles.add]} hasTVPreferredFocus={profiles.length === 0}>
            <View style={[styles.avatar, styles.addAvatar]}>
              <Text style={[styles.initial, { color: colors.muted }]}>+</Text>
            </View>
            <Text style={styles.name}>Add someone</Text>
            <Text style={styles.meta}>from your phone</Text>
          </Focusable>
        )}
      </View>
      {profiles && profiles.length > 1 && (
        <View style={styles.togetherRow}>
          {!together ? (
            <Focusable onPress={() => setTogether(true)} style={styles.togetherButton} testID="watch-together">
              <Text style={styles.togetherText}>👥  Watch together</Text>
            </Focusable>
          ) : (
            <>
              <Focusable
                onPress={chosen.length >= 2 ? () => onPick(profiles.filter((p) => chosen.includes(p.id))) : undefined}
                style={[styles.togetherButton, chosen.length >= 2 && styles.togetherReady]}
                testID="start-together"
              >
                <Text style={[styles.togetherText, chosen.length >= 2 && styles.togetherReadyText]}>
                  {chosen.length >= 2 ? `Start watching together (${chosen.length})` : "Pick two or more people"}
                </Text>
              </Focusable>
              <Text style={styles.togetherHint}>BACK to cancel</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  togetherRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: dp(56),
  },
  togetherButton: {
    backgroundColor: colors.panel,
    borderRadius: dp(16),
    paddingVertical: dp(18),
    paddingHorizontal: dp(36),
  },
  togetherReady: {
    backgroundColor: colors.accent,
  },
  togetherText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: "700",
  },
  togetherReadyText: {
    color: colors.bg,
  },
  togetherHint: {
    color: colors.muted,
    fontSize: type.small,
    marginLeft: dp(24),
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: safe.x,
    paddingVertical: safe.y,
  },
  brand: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "800",
  },
  heading: {
    color: colors.text,
    fontSize: type.hero,
    fontWeight: "800",
    marginTop: dp(120),
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: dp(80),
  },
  tile: {
    width: dp(320),
    alignItems: "center",
    marginHorizontal: dp(24),
    paddingVertical: dp(32),
    borderRadius: dp(28),
    backgroundColor: colors.panel,
  },
  avatar: {
    width: dp(160),
    height: dp(160),
    borderRadius: dp(80),
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontSize: dp(80),
    fontWeight: "800",
    color: colors.bg,
  },
  name: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "700",
    marginTop: dp(20),
  },
  meta: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: dp(6),
  },
  add: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderColor: colors.line,
  },
  addAvatar: {
    borderWidth: dp(4),
    borderColor: colors.line,
  },
  retry: {
    alignSelf: "center",
    marginTop: dp(40),
    padding: dp(24),
    borderRadius: dp(16),
    backgroundColor: colors.panel,
  },
  retryText: {
    color: colors.text,
    fontSize: type.body,
  },
});
