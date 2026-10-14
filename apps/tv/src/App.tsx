/**
 * Rerun on Fire TV. Five screens and no navigation library: a small state
 * machine is easier to reason about with a remote, and BACK always goes one
 * step up.
 */

import React, { useEffect, useState } from "react";
import { BackHandler, useHideSplashScreenCallback, usePreventHideSplashScreen } from "@amazon-devices/react-native-kepler";
import { StyleSheet, View } from "react-native";
import type { Profile } from "./api";
import { RoomProvider } from "./room";
import { HomeScreen } from "./screens/HomeScreen";
import { PairScreen } from "./screens/PairScreen";
import { PlayerScreen } from "./screens/PlayerScreen";
import { ProfilesScreen } from "./screens/ProfilesScreen";
import { RerunScreen } from "./screens/RerunScreen";
import { colors } from "./theme";

type Screen =
  | { name: "profiles" }
  | { name: "home"; viewers: Profile[] }
  | { name: "player"; viewers: Profile[]; titleId: string }
  | { name: "rerun"; viewers: Profile[] }
  | { name: "pair"; back: Screen };

export const App = () => {
  const [screen, setScreen] = useState<Screen>({ name: "profiles" });

  // Vega keeps the app in its launch transition until the splash screen is
  // hidden; an app that never hides it is moved to the background once the
  // transition times out, and its video surface is then rejected.
  usePreventHideSplashScreen();
  const hideSplashScreen = useHideSplashScreenCallback();
  useEffect(() => {
    hideSplashScreen();
  }, [hideSplashScreen]);

  // Player, Rerun and Pair handle BACK themselves; here only the menus do.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name === "home") {
        setScreen({ name: "profiles" });
        return true;
      }
      if (screen.name === "pair") {
        setScreen(screen.back);
        return true;
      }
      return false; // on the profile picker, BACK leaves the app
    });
    return () => sub.remove();
  }, [screen]);

  let content: React.ReactNode;
  switch (screen.name) {
    case "profiles":
      content = (
        <ProfilesScreen
          onPick={(viewers) => setScreen({ name: "home", viewers })}
          onAdd={() => setScreen({ name: "pair", back: screen })}
        />
      );
      break;
    case "home":
      content = (
        <HomeScreen
          viewers={screen.viewers}
          onPlay={(titleId) => setScreen({ name: "player", viewers: screen.viewers, titleId })}
          onRerun={() => setScreen({ name: "rerun", viewers: screen.viewers })}
          onPair={() => setScreen({ name: "pair", back: screen })}
        />
      );
      break;
    case "player":
      content = (
        <PlayerScreen
          viewers={screen.viewers}
          titleId={screen.titleId}
          onExit={() => setScreen({ name: "home", viewers: screen.viewers })}
        />
      );
      break;
    case "rerun":
      // The Daily Rerun is personal: it reviews the first viewer's deck.
      content = <RerunScreen profile={screen.viewers[0]!} onDone={() => setScreen({ name: "home", viewers: screen.viewers })} />;
      break;
    case "pair":
      content = <PairScreen onDone={() => setScreen(screen.back)} />;
      break;
  }

  return (
    <RoomProvider>
      <View style={styles.root}>{content}</View>
    </RoomProvider>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
