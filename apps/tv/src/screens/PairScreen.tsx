import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Focusable } from "../components/Focusable";
import { QrCode } from "../components/QrCode";
import { useRoom } from "../room";
import { colors, safe, type, dp } from "../theme";

/** The QR code a phone scans to join this TV's room. No app install, no login. */
export function PairScreen({ onDone }: { onDone: () => void }) {
  const room = useRoom();
  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <Text style={styles.heading}>Pair your phone</Text>
        <Text style={styles.body}>1. Open the camera on your phone and point it at the code.</Text>
        <Text style={styles.body}>2. Tap the link. That's it — nothing to install.</Text>
        <Text style={[styles.body, styles.muted]}>
          Words you save on the TV land on your phone. Say a line back to get a score here. Add family members from
          there too.
        </Text>
        <Text style={styles.status}>
          {room.phones === 0 ? "Waiting for a phone…" : `✓ ${room.phones} ${room.phones === 1 ? "phone" : "phones"} connected`}
        </Text>
        <Focusable hasTVPreferredFocus onPress={onDone} style={styles.done}>
          <Text style={styles.doneText}>{room.phones > 0 ? "Done" : "Back"}</Text>
        </Focusable>
      </View>
      <View style={styles.right}>
        {room.url ? <QrCode value={room.url} size={520} /> : <Text style={styles.body}>Getting a code…</Text>}
        {room.code && <Text style={styles.code}>{room.code}</Text>}
        {room.url && <Text style={styles.url}>{room.url}</Text>}
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
    alignItems: "center",
  },
  left: {
    flex: 1,
    paddingRight: dp(80),
  },
  right: {
    alignItems: "center",
  },
  heading: {
    color: colors.text,
    fontSize: type.hero,
    fontWeight: "800",
    marginBottom: dp(32),
  },
  body: {
    color: colors.text,
    fontSize: type.body,
    lineHeight: type.body * 1.5,
    marginBottom: dp(12),
  },
  muted: {
    color: colors.muted,
  },
  status: {
    color: colors.good,
    fontSize: type.body,
    fontWeight: "700",
    marginTop: dp(32),
  },
  done: {
    alignSelf: "flex-start",
    marginTop: dp(40),
    backgroundColor: colors.panel2,
    borderRadius: dp(16),
    paddingVertical: dp(18),
    paddingHorizontal: dp(40),
  },
  doneText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: "700",
  },
  code: {
    color: colors.accent,
    fontSize: type.hero,
    fontWeight: "800",
    letterSpacing: dp(16),
    marginTop: dp(28),
  },
  url: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: dp(8),
  },
});
