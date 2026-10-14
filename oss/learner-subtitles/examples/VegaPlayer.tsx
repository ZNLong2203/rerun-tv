/**
 * Learner subtitles on Vega OS (Fire TV) with the W3C media player.
 * Copy into a React Native for Vega app; see the README for the manifest
 * entries this needs. Not compiled in this repo (it needs the Vega SDK).
 */

import { BackHandler, useTVEventHandler, type HWEvent } from "@amazon-devices/react-native-kepler";
import { KeplerVideoSurfaceView, VideoPlayer } from "@amazon-devices/react-native-w3cmedia";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  commandFor,
  cueEndedBetween,
  cueIndexAt,
  nextLineTarget,
  previousLineTarget,
  type EnrichedTrack,
  type PlayerMode,
} from "learner-subtitles";
import { LearnerSubtitles } from "learner-subtitles/react-native";

export function VegaPlayer({ src, track, onExit }: { src: string; track: EnrichedTrack; onExit: () => void }) {
  const player = useRef<VideoPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [cueIndex, setCueIndex] = useState(-1);
  const [mode, setMode] = useState<PlayerMode>("watch");
  const autoPause = true;
  const cues = track.cues;

  // 1. One player per screen; Vega needs initialize() before src.
  useEffect(() => {
    const video = new VideoPlayer();
    player.current = video;
    video.initialize().then(() => {
      video.autoplay = false;
      video.src = src; // must be HTTPS, and the path must end in .mp4
      video.load();
      setReady(true);
    });
    return () => video.deinitializeSync(1500);
  }, [src]);

  // 2. Follow the playhead: which line is on screen, and pause after each one.
  useEffect(() => {
    let previous = 0;
    const id = setInterval(() => {
      const t = player.current?.currentTime ?? 0;
      setCueIndex(cueIndexAt(cues, t));
      if (autoPause && mode === "watch" && cueEndedBetween(cues, previous, t)) player.current?.pause();
      previous = t;
    }, 100);
    return () => clearInterval(id);
  }, [cues, mode, autoPause]);

  // 3. The remote. Keep the handler stable: Vega re-subscribes when it changes.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onKey = useCallback(
    (evt: HWEvent) => {
      if (evt.eventKeyAction !== 0) return; // key down only
      const video = player.current;
      if (!video) return;
      const cmd = commandFor(modeRef.current, evt.eventType); // "enter" and "select" both toggle
      if (cmd.type === "previousLine" || cmd.type === "nextLine") {
        const target = (cmd.type === "previousLine" ? previousLineTarget : nextLineTarget)(cues, video.currentTime);
        if (target) video.currentTime = target.start - 0.08;
        void video.play();
      } else if (cmd.type === "toggle") {
        if (video.paused) void video.play();
        else video.pause();
      } else if (cmd.type === "enterWords") {
        video.pause();
        setMode("words");
      } else if (cmd.type === "exitWords") {
        setMode("watch");
      }
    },
    [cues],
  );
  useTVEventHandler(onKey);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (modeRef.current !== "watch") setMode("watch");
      else onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {ready && (
        <KeplerVideoSurfaceView
          style={{ flex: 1 }}
          onSurfaceViewCreated={(h) => {
            player.current?.setSurfaceHandle(h);
            void player.current?.play();
          }}
          onSurfaceViewDestroyed={(h) => player.current?.clearSurfaceHandle(h)}
        />
      )}
      <LearnerSubtitles
        cue={cues[cueIndex]}
        viewers={[{ id: "me", name: "Me", color: "#F59E0B", level: "B1", known: new Set() }]}
        langs={["vi"]}
        wordMode={mode === "words"}
        onSelectItem={(item) => console.log("open a card for", item.surface)}
      />
    </View>
  );
}
