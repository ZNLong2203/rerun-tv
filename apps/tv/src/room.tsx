/**
 * The TV's side of pairing. The TV opens one room when the app starts and
 * keeps it for the session, so a phone paired once stays paired while the
 * learner moves between screens.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RoomMessage } from "@rerun/core";
import { api } from "./api";
import { SERVER_URL } from "./config";

type Listener = (msg: RoomMessage) => void;

interface RoomContextValue {
  code: string | undefined;
  url: string | undefined;
  phones: number;
  send: (msg: RoomMessage) => void;
  /** Subscribe to messages from phones; returns an unsubscribe function. */
  subscribe: (fn: Listener) => () => void;
}

const RoomContext = createContext<RoomContextValue>({
  code: undefined,
  url: undefined,
  phones: 0,
  send: () => {},
  subscribe: () => () => {},
});

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [pairing, setPairing] = useState<{ code: string; url: string }>();
  const [phones, setPhones] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<Listener>());

  // Bumped when the server forgets our room (e.g. it restarted), to pair again.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () =>
      api
        .pair()
        .then((p) => !cancelled && setPairing(p))
        .catch(() => {
          retry = setTimeout(open, 3000);
        });
    open();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [generation]);

  useEffect(() => {
    if (!pairing) return;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(`${SERVER_URL.replace(/^http/, "ws")}/ws?room=${pairing.code}&role=tv`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as RoomMessage;
        if (msg.type === "presence") setPhones(msg.phones);
        listeners.current.forEach((fn) => fn(msg));
      };
      ws.onclose = async () => {
        socket.current = null;
        if (closed) return;
        // A room the server no longer knows cannot be rejoined; get a new code.
        const res = await fetch(`${SERVER_URL}/api/pair/${pairing.code}`).catch(() => undefined);
        if (closed) return;
        if (res?.status === 404) {
          setPhones(0);
          setGeneration((g) => g + 1);
          return;
        }
        attempt++;
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket.current?.close();
    };
  }, [pairing]);

  const send = useCallback((msg: RoomMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return (
    <RoomContext.Provider value={{ code: pairing?.code, url: pairing?.url, phones, send, subscribe }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  return useContext(RoomContext);
}

/** Run a handler for each message from a phone while the component is mounted. */
export function useRoomMessages(handler: Listener) {
  const { subscribe } = useRoom();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => subscribe((msg) => latest.current(msg)), [subscribe]);
}
