import React, { useState } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

/**
 * A word the remote can land on. Pressable gets no focus visuals on Vega or
 * react-native-tvos, so focus is drawn here: a ring in the viewer's colour.
 */
export function FocusChip(props: {
  children: (focused: boolean) => React.ReactNode;
  onPress: () => void;
  ring: string;
  ringWidth: number;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={props.testID}
      hasTVPreferredFocus={props.hasTVPreferredFocus}
      onPress={props.onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        props.style,
        { borderWidth: props.ringWidth, borderColor: focused ? props.ring : "transparent" },
        focused && { transform: [{ scale: 1.05 }] },
      ]}
    >
      {props.children(focused)}
    </Pressable>
  );
}
