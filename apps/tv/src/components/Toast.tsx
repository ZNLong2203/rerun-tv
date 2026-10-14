import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { colors, safe, type, dp } from "../theme";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "accent" | "good" | "muted";
}

/** A short notice in the top-right corner that fades out on its own. */
export function Toast({ message }: { message: ToastMessage | undefined }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<ToastMessage>();

  useEffect(() => {
    if (!message) return;
    setShown(message);
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [message, opacity]);

  if (!shown) return null;
  const border = shown.tone === "good" ? colors.good : shown.tone === "muted" ? colors.line : colors.accent;
  return (
    <Animated.View style={[styles.toast, { opacity, borderColor: border }]} pointerEvents="none">
      <Text style={styles.text}>{shown.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: safe.y,
    right: safe.x,
    maxWidth: dp(720),
    backgroundColor: colors.panel,
    borderLeftWidth: dp(8),
    borderRadius: dp(16),
    paddingVertical: dp(18),
    paddingHorizontal: dp(26),
  },
  text: {
    color: colors.text,
    fontSize: type.body,
  },
});
