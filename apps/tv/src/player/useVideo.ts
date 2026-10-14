/**
 * One Vega W3C media player for a screen: created and initialised on mount,
 * given the video surface when React Native creates it, torn down on unmount.
 *
 * The playhead is read on a short interval into a ref rather than state, so
 * the screen re-renders only when something visible changes (the line).
 *
 * In still mode there is no player at all: a JavaScript clock stands in for
 * the playhead and the screen shows the frame for the current second. Vega's
 * screenshot tooling cannot capture a video surface, so this is how the
 * player UI is checked and photographed.
 */

import { VideoPlayer } from "@amazon-devices/react-native-w3cmedia";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYHEAD_POLL_MS } from "../config";

export interface VideoControls {
  ready: boolean;
  playing: boolean;
  error: string | undefined;
  /** Latest playhead in seconds; read it, do not render from it. */
  time: React.MutableRefObject<number>;
  /** In still mode, the whole second whose frame is on screen. */
  frameTime: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  surface: {
    onSurfaceViewCreated: (handle: string) => void;
    onSurfaceViewDestroyed: (handle: string) => void;
  };
}

export function useVideo(
  src: string,
  onTick?: (previous: number, current: number) => void,
  still = false,
): VideoControls {
  const player = useRef<VideoPlayer | null>(null);
  const time = useRef(0);
  const wantPlay = useRef(false);
  const hasSurface = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();
  const [frameTime, setFrameTime] = useState(0);
  const tick = useRef(onTick);
  tick.current = onTick;

  useEffect(() => {
    if (still) {
      setReady(true);
      return;
    }
    const video = new VideoPlayer();
    player.current = video;
    let alive = true;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      const e = video.error as { code?: number; message?: string } | null;
      // MediaError codes: 1 aborted, 2 network, 3 decode, 4 source not supported.
      const why = e?.code === 2 ? "the network" : e?.code === 3 ? "decoding" : e?.code === 4 ? "an unsupported source" : "an unknown reason";
      setError(`The video could not be played (${why}${e?.message ? `: ${e.message}` : ""}).`);
    };

    video
      .initialize()
      .then(() => {
        if (!alive) return;
        video.autoplay = false;
        video.addEventListener("playing", onPlay);
        video.addEventListener("pause", onPause);
        video.addEventListener("ended", onPause);
        video.addEventListener("error", onError);
        video.src = src;
        video.load();
        setReady(true);
      })
      .catch((e: unknown) => alive && setError(String(e)));

    return () => {
      alive = false;
      video.removeEventListener("playing", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("error", onError);
      try {
        video.pause();
        video.deinitializeSync(1500);
      } catch {
        // Already torn down by the platform.
      }
      player.current = null;
    };
  }, [src, still]);

  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      last = now;
      const previous = time.current;
      let current: number;
      if (still) {
        if (!wantPlay.current) return;
        current = previous + elapsed;
        if (Math.floor(current) !== Math.floor(previous)) setFrameTime(Math.floor(current));
      } else {
        const video = player.current;
        if (!video) return;
        current = video.currentTime;
      }
      time.current = current;
      if (current !== previous) tick.current?.(previous, current);
    }, PLAYHEAD_POLL_MS);
    return () => clearInterval(id);
  }, [still]);

  const play = useCallback(() => {
    wantPlay.current = true;
    if (still) setPlaying(true);
    else if (hasSurface.current) void player.current?.play();
  }, [still]);

  const pause = useCallback(() => {
    wantPlay.current = false;
    if (still) setPlaying(false);
    else player.current?.pause();
  }, [still]);

  const toggle = useCallback(() => {
    const isPlaying = still ? wantPlay.current : player.current?.paused === false;
    if (isPlaying) pause();
    else play();
  }, [still, play, pause]);

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.max(0, seconds);
      if (still) {
        time.current = target;
        setFrameTime(Math.floor(target));
        return;
      }
      const video = player.current;
      if (!video) return;
      video.currentTime = target;
      time.current = video.currentTime;
    },
    [still],
  );

  const surface = {
    onSurfaceViewCreated: useCallback((handle: string) => {
      player.current?.setSurfaceHandle(handle);
      hasSurface.current = true;
      if (wantPlay.current) void player.current?.play();
    }, []),
    onSurfaceViewDestroyed: useCallback((handle: string) => {
      hasSurface.current = false;
      player.current?.clearSurfaceHandle(handle);
    }, []),
  };

  return { ready, playing, error, time, frameTime, play, pause, toggle, seek, surface };
}
