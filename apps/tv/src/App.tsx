/**
 * Rerun on Fire TV. Five screens and no navigation library: a small state
 * machine is easier to reason about with a remote, and BACK always goes one
 * step up.
 */

import React, { useEffect, useState } from "react";
import { BackHandler } from "@amazon-devices/react-native-kepler";
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
  | { name: "home"; profile: Profile }
  | { name: "player"; profile: Profile; titleId: string }
  | { name: "rerun"; profile: Profile }
  | { name: "pair"; back: Screen };

export const App = () => {
  const [screen, setScreen] = useState<Screen>({ name: "profiles" });

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
          onPick={(profile) => setScreen({ name: "home", profile })}
          onAdd={() => setScreen({ name: "pair", back: screen })}
        />
      );
      break;
    case "home":
      content = (
        <HomeScreen
          profile={screen.profile}
          onPlay={(titleId) => setScreen({ name: "player", profile: screen.profile, titleId })}
          onRerun={() => setScreen({ name: "rerun", profile: screen.profile })}
          onPair={() => setScreen({ name: "pair", back: screen })}
        />
      );
      break;
    case "player":
      content = (
        <PlayerScreen
          profile={screen.profile}
          titleId={screen.titleId}
          onExit={() => setScreen({ name: "home", profile: screen.profile })}
        />
      );
      break;
    case "rerun":
      content = <RerunScreen profile={screen.profile} onDone={() => setScreen({ name: "home", profile: screen.profile })} />;
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
