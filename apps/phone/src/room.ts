/**
 * The phone's side of the pairing room: one WebSocket that reconnects with
 * backoff, and a hook that exposes the latest TV state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardView, RoomMessage } from "@rerun/core";

export type Now = Extract<RoomMessage, { type: "now" }>;

export interface RoomState {
  status: "connecting" | "open" | "closed" | "unknown-code";
  tvOnline: boolean;
  now: Now | undefined;
  /** Cards saved on the TV since this phone joined, newest first. */
  saved: CardView[];
  send: (msg: RoomMessage) => void;
}

export function useRoom(code: string | undefined): RoomState {
  const [status, setStatus] = useState<RoomState["status"]>("connecting");
  const [tvOnline, setTvOnline] = useState(false);
  const [now, setNow] = useState<Now>();
  const [saved, setSaved] = useState<CardView[]>([]);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code) return;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?room=${code}&role=phone`);
      socket.current = ws;
      setStatus("connecting");
      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as RoomMessage;
        if (msg.type === "presence") setTvOnline(msg.tv);
        else if (msg.type === "now") setNow(msg);
        else if (msg.type === "card.saved") setSaved((s) => [msg.card, ...s.filter((c) => c.id !== msg.card.id)]);
      };
      ws.onclose = async () => {
        socket.current = null;
        if (closed) return;
        // A 404 on upgrade looks like an immediate close; ask whether the code exists.
        const res = await fetch(`/api/pair/${code}`).catch(() => undefined);
        if (res?.status === 404) {
          setStatus("unknown-code");
          return;
        }
        setStatus("closed");
        attempt++;
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, [code]);

  const send = useCallback((msg: RoomMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  }, []);

  return { status, tvOnline, now, saved, send };
}
