import React, { useState } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, dp } from "../theme";

interface Props {
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
  onPress?: () => void;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  /** Colour of the focus ring; defaults to the app accent. */
  ring?: string;
  hasTVPreferredFocus?: boolean;
  /** How much the item grows when focused; wide items need less. */
  lift?: number;
  testID?: string;
}

/**
 * Anything the remote can land on. Focus is shown with a thick ring and a
 * slight lift, readable from the sofa; never by colour alone.
 */
export function Focusable({ children, onPress, onFocus, style, focusedStyle, ring, hasTVPreferredFocus, lift = 1.05, testID }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      style={[
        styles.base,
        style,
        focused && [{ borderColor: ring ?? colors.accent, transform: [{ scale: lift }] }, focusedStyle],
      ]}
    >
      {typeof children === "function" ? children(focused) : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: dp(4),
    borderColor: "transparent",
  },
});
