import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

/**
 * A frame that never flashes: the last frame that finished loading stays on
 * screen underneath until the next one has loaded on top of it.
 */
export function StillFrame({ uri, fit }: { uri: string; fit: "contain" | "cover" }) {
  const [shown, setShown] = useState<string>();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {shown && <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} resizeMode={fit} />}
      {uri !== shown && (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={fit} onLoad={() => setShown(uri)} />
      )}
    </View>
  );
}
