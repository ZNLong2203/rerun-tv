/**
 * Watching with learner subtitles. The remote is the whole interface:
 * ◀ hear the line again, ▶ next line, ▲ step into the line's words,
 * OK on a word for its card, ▼ translation, ☰ pause after every line.
 */

import { KeplerVideoSurfaceView } from "@amazon-devices/react-native-w3cmedia";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, useTVEventHandler, type HWEvent } from "@amazon-devices/react-native-kepler";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  commandFor,
  cueEndedBetween,
  cueIndexAt,
  lastStartedCueIndex,
  nextLineTarget,
  previousLineTarget,
  type EnrichedCue,
  type LearningItem,
  shouldAutoPause,
  viewerLanguages,
  type PlayerCommand,
  type PlayerMode,
  type Viewer,
} from "@rerun/core";
import { api, type Profile, type TitleDetail } from "../api";
import { LearnerSubtitles } from "../components/LearnerSubtitles";
import { Toast, type ToastMessage } from "../components/Toast";
import { WordCard } from "../components/WordCard";
import { DEBUG_KEYS } from "../config";
import { StillFrame } from "../player/StillFrame";
import { useVideo } from "../player/useVideo";
import { useRoom, useRoomMessages } from "../room";
import { colors, safe, type, dp } from "../theme";

const KEY_DOWN = 0;
/** Seek a hair before the line so its first syllable is not clipped. */
const LEAD_IN = 0.08;

interface Props {
  /** Who is watching: one learner, or several watching together. */
  viewers: Profile[];
  titleId: string;
  onExit: () => void;
}

/** Per-viewer sets, keyed by profile id. */
type PerViewer = Record<string, Set<string>>;

const EMPTY = new Set<string>();

function added(map: PerViewer, viewerId: string, value: string): PerViewer {
  return { ...map, [viewerId]: new Set(map[viewerId] ?? EMPTY).add(value) };
}

export function PlayerScreen({ viewers, titleId, onExit }: Props) {
  const [detail, setDetail] = useState<TitleDetail>();
  const [loadError, setLoadError] = useState<string>();
  const [known, setKnown] = useState<PerViewer>({});
  const [saved, setSaved] = useState<PerViewer>({});
  const ids = viewers.map((v) => v.id).join(",");

  useEffect(() => {
    let alive = true;
    Promise.all([api.title(titleId), Promise.all(viewers.map((v) => Promise.all([api.known(v.id), api.cards(v.id)])))])
      .then(([d, perViewer]) => {
        if (!alive) return;
        const k: PerViewer = {};
        const s: PerViewer = {};
        viewers.forEach((v, i) => {
          const [lemmas, cards] = perViewer[i]!;
          k[v.id] = new Set(lemmas);
          s[v.id] = new Set(cards.filter((c) => c.titleId === titleId).map((c) => c.itemId));
        });
        setDetail(d);
        setKnown(k);
        setSaved(s);
      })
      .catch((e: unknown) => alive && setLoadError(String(e)));
    return () => {
      alive = false;
    };
  }, [titleId, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <Centered text={`Could not load the film. ${loadError}`} />;
  if (!detail) return <Centered spinner text="Getting the film ready…" />;
  return (
    <Player
      viewers={viewers}
      detail={detail}
      known={known}
      saved={saved}
      onKnown={(viewerId, lemma) => setKnown((k) => added(k, viewerId, lemma))}
      onSaved={(viewerId, itemId) => setSaved((s) => added(s, viewerId, itemId))}
      onExit={onExit}
    />
  );
}

interface PlayerProps {
  viewers: Profile[];
  detail: TitleDetail;
  known: PerViewer;
  saved: PerViewer;
  onKnown: (viewerId: string, lemma: string) => void;
  onSaved: (viewerId: string, itemId: string) => void;
  onExit: () => void;
}

function Player({ viewers, detail, known, saved, onKnown, onSaved, onExit }: PlayerProps) {
  const cues = detail.track.cues;
  const room = useRoom();
  // The first viewer is the one the phone companion follows.
  const profile = viewers[0]!;
  const together = viewers.length > 1;
  const langs = useMemo(() => viewerLanguages(viewers), [viewers]);
  const marked: (Viewer & { name: string })[] = useMemo(
    () => viewers.map((v) => ({ id: v.id, name: v.name, color: v.color, level: v.level, known: known[v.id] ?? EMPTY })),
    [viewers, known],
  );
  const savedByAnyone = useMemo(() => new Set(Object.values(saved).flatMap((set) => [...set])), [saved]);
  const [cueIndex, setCueIndex] = useState(-1);
  const [mode, setMode] = useState<PlayerMode>("watch");
  const [wordCue, setWordCue] = useState<EnrichedCue>();
  const [card, setCard] = useState<LearningItem>();
  const [showTranslation, setShowTranslation] = useState(true);
  const [autoPause, setAutoPause] = useState(() => shouldAutoPause(viewers));
  const [toast, setToast] = useState<ToastMessage>();
  const toastId = useRef(0);
  const replayUntil = useRef<number | undefined>(undefined);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const autoPauseRef = useRef(autoPause);
  autoPauseRef.current = autoPause;

  const notify = useCallback((text: string, tone: ToastMessage["tone"] = "accent") => {
    toastId.current++;
    setToast({ id: toastId.current, text, tone });
  }, []);

  const still = detail.meta.playback === "still" && Boolean(detail.meta.frameUrl);
  const video = useVideo(
    detail.meta.videoUrl,
    useCallback(
      (previous: number, current: number) => {
        const index = cueIndexAt(cues, current);
        setCueIndex((old) => (old === index ? old : index));
        if (replayUntil.current !== undefined && current >= replayUntil.current) {
          replayUntil.current = undefined;
          videoRef.current?.pause();
          return;
        }
        if (autoPauseRef.current && modeRef.current === "watch" && cueEndedBetween(cues, previous, current)) {
          videoRef.current?.pause();
        }
      },
      [cues],
    ),
    still,
  );
  const videoRef = useRef(video);
  videoRef.current = video;

  // Start playing once the player is ready.
  useEffect(() => {
    if (video.ready) video.play();
  }, [video.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const cue = cueIndex >= 0 ? cues[cueIndex] : undefined;

  // Tell paired phones what is on screen, so they can shadow it.
  useEffect(() => {
    room.send({
      type: "now",
      profileId: profile.id,
      titleId: detail.meta.id,
      cue: cue
        ? { id: cue.id, text: cue.text, translation: cue.translations[profile.nativeLang] ?? "", start: cue.start, end: cue.end }
        : null,
    });
  }, [cue, room, profile, detail.meta.id]);

  const playLine = useCallback(
    (target: EnrichedCue | undefined) => {
      if (!target) return;
      video.seek(target.start - LEAD_IN);
      video.play();
    },
    [video],
  );

  const run = useCallback(
    (cmd: PlayerCommand) => {
      const t = video.time.current;
      switch (cmd.type) {
        case "previousLine":
          playLine(previousLineTarget(cues, t) as EnrichedCue | undefined);
          break;
        case "nextLine":
          playLine(nextLineTarget(cues, t) as EnrichedCue | undefined);
          break;
        case "enterWords": {
          const i = lastStartedCueIndex(cues, t);
          const line = i >= 0 ? cues[i] : undefined;
          if (!line || line.items.length === 0) {
            notify("Nothing new to learn in this line — ◀ to hear it again.", "muted");
            break;
          }
          video.pause();
          setWordCue(line);
          setMode("words");
          break;
        }
        case "exitWords":
          setMode("watch");
          setWordCue(undefined);
          break;
        case "closeCard":
          replayUntil.current = undefined;
          video.pause();
          setCard(undefined);
          setMode("words");
          break;
        case "toggleTranslation":
          setShowTranslation((s) => !s);
          break;
        case "toggle":
          video.toggle();
          break;
        case "play":
          video.play();
          break;
        case "pause":
          video.pause();
          break;
        case "seekBy":
          video.seek(t + cmd.seconds);
          break;
        case "toggleAutoPause":
          setAutoPause((a) => {
            notify(a ? "Auto-pause off" : "Auto-pause on: the film waits after every line", "muted");
            return !a;
          });
          break;
        case "exit":
          onExit();
          break;
        case "none":
          break;
      }
    },
    [cues, video, playLine, notify, onExit],
  );

  // Vega re-subscribes whenever the handler changes, so keep one stable
  // handler and read the latest state through refs.
  const runRef = useRef(run);
  runRef.current = run;
  const onRemote = useCallback(
    (evt: HWEvent) => {
      if (DEBUG_KEYS) notify(`key ${evt?.eventType} / ${evt?.eventKeyAction}`, "muted");
      if (!evt || evt.eventKeyAction !== KEY_DOWN || evt.eventType === "back") return;
      runRef.current(commandFor(modeRef.current, evt.eventType));
    },
    [notify],
  );
  useTVEventHandler(onRemote);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      run(commandFor(modeRef.current, "back"));
      return true;
    });
    return () => sub.remove();
  }, [run]);

  useRoomMessages((msg) => {
    if (msg.type === "remote") {
      const t = video.time.current;
      if (msg.action === "toggle") video.toggle();
      else if (msg.action === "play") video.play();
      else if (msg.action === "pause") video.pause();
      else if (msg.action === "replay") playLine(cues[lastStartedCueIndex(cues, t)]);
      else if (msg.action === "previous") playLine(previousLineTarget(cues, t) as EnrichedCue | undefined);
      else if (msg.action === "next") playLine(nextLineTarget(cues, t) as EnrichedCue | undefined);
    } else if (msg.type === "shadow.result") {
      const verdict = msg.score >= 90 ? "spot on" : msg.score >= 70 ? "nearly there" : "try once more";
      notify(`🎙 ${profile.name} said it: ${msg.score} — ${verdict}`, msg.score >= 70 ? "good" : "muted");
    }
  });

  const openCard = (item: LearningItem) => {
    setCard(item);
    setMode("card");
  };

  const save = async (viewer: Profile) => {
    if (!card || !wordCue) return;
    if (saved[viewer.id]?.has(card.id)) return;
    try {
      await api.saveCard(viewer.id, room.code, { titleId: detail.meta.id, cueId: wordCue.id, itemId: card.id });
      onSaved(viewer.id, card.id);
      const where = room.phones > 0 && viewer.id === profile.id ? " — it is on your phone" : ` to ${viewer.name}'s deck`;
      notify(`Saved “${card.surface}”${where}`, "good");
    } catch {
      notify("Could not save — is the Rerun server running?", "muted");
    }
  };

  const markKnown = async () => {
    if (!card) return;
    try {
      await api.setKnown(profile.id, card.lemma, true);
      onKnown(profile.id, card.lemma);
      notify(`Got it — “${card.surface}” won't be highlighted for ${profile.name}`, "muted");
      run({ type: "closeCard" });
    } catch {
      notify("Could not update — is the Rerun server running?", "muted");
    }
  };

  const replayLine = () => {
    if (!wordCue) return;
    replayUntil.current = wordCue.end + 0.2;
    playLine(wordCue);
  };

  const shownCue = mode === "watch" ? cue : wordCue;
  const hints = useMemo(
    () =>
      mode === "watch"
        ? `◀ again   ▶ next line   ▲ words   ▼ translation   ☰ auto-pause ${autoPause ? "on" : "off"}`
        : mode === "words"
          ? "◀ ▶ choose   OK open   ▼ back to the film"
          : "",
    [mode, autoPause],
  );

  return (
    <View style={styles.root}>
      {video.ready && !still && <KeplerVideoSurfaceView style={styles.surface} {...video.surface} />}
      {video.ready && still && <StillFrame uri={`${detail.meta.frameUrl}?t=${video.frameTime}`} fit="contain" />}
      {!video.ready && !video.error && <Centered spinner text="" />}
      {video.error && <Centered text={video.error} />}

      <LearnerSubtitles
        cue={shownCue}
        viewers={marked}
        langs={langs}
        saved={savedByAnyone}
        showTranslation={showTranslation}
        wordMode={mode === "words"}
        beside={mode === "card"}
        onSelectItem={openCard}
      />

      {(!video.playing || mode !== "watch") && (
        <View style={styles.hud} pointerEvents="none">
          <View style={styles.hudTop}>
            <Text style={styles.title}>{detail.meta.title}</Text>
            {viewers.map((v) => (
              <View key={v.id} style={[styles.who, { borderColor: v.color }]}>
                <Text style={styles.whoText}>
                  {v.name} · {v.level}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.credit}>
            {detail.meta.license.attribution} · {detail.meta.license.name}
          </Text>
          {hints ? <Text style={styles.hints}>{hints}</Text> : null}
        </View>
      )}

      {mode === "card" && card && (
        <WordCard
          item={card}
          viewers={viewers}
          savedFor={new Set(viewers.filter((v) => saved[v.id]?.has(card.id)).map((v) => v.id))}
          onSave={(id) => {
            const viewer = viewers.find((v) => v.id === id);
            if (viewer) void save(viewer);
          }}
          onKnown={together ? undefined : markKnown}
          onReplay={replayLine}
        />
      )}

      <Toast message={toast} />
      {DEBUG_KEYS && (
        <Text style={styles.debugState}>
          playing={String(video.playing)} mode={mode} ready={String(video.ready)}
        </Text>
      )}
    </View>
  );
}

function Centered({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <View style={styles.centered}>
      {spinner && <ActivityIndicator size="large" color={colors.accent} />}
      {text ? <Text style={styles.centeredText}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  debugState: {
    position: "absolute",
    right: dp(24),
    bottom: dp(12),
    color: "#00FF88",
    fontSize: dp(20),
  },
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  surface: {
    ...StyleSheet.absoluteFillObject,
  },
  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  centeredText: {
    color: colors.muted,
    fontSize: type.body,
    marginTop: dp(24),
    maxWidth: dp(1200),
    textAlign: "center",
  },
  hud: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: safe.x,
    paddingVertical: safe.y,
  },
  hudTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: "800",
  },
  who: {
    marginLeft: dp(24),
    borderWidth: dp(3),
    borderRadius: dp(999),
    paddingHorizontal: dp(18),
    paddingVertical: dp(6),
  },
  whoText: {
    color: colors.text,
    fontSize: type.small,
    fontWeight: "700",
  },
  credit: {
    color: colors.muted,
    fontSize: type.small - dp(4),
    marginTop: dp(8),
  },
  hints: {
    position: "absolute",
    left: safe.x,
    bottom: dp(16),
    color: colors.muted,
    fontSize: type.small,
  },
});
