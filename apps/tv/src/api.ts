import type { CardView, EnrichedTrack, TrackDifficulty } from "@rerun/core";
import { SERVER_URL } from "./config";

export interface Profile {
  id: string;
  name: string;
  nativeLang: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  color: string;
  stats: { saved: number; due: number; reviewedToday: number; known: number };
}

export interface TitleSummary {
  id: string;
  title: string;
  year: number;
  runtimeSeconds: number;
  synopsis: string;
  playable: boolean;
  lines: number;
  license: { name: string; attribution: string };
  /** What the player should load: an HTTPS copy when the title has one. */
  videoUrl: string;
  difficulty?: TrackDifficulty;
}

export interface TitleDetail {
  meta: TitleSummary & { license: { name: string; url: string; attribution: string } };
  track: EnrichedTrack;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  profiles: () => call<Profile[]>("/api/profiles"),
  titles: (profileId: string) => call<TitleSummary[]>(`/api/titles?profile=${profileId}`),
  title: (id: string) => call<TitleDetail>(`/api/titles/${id}`),
  known: (profileId: string) => call<string[]>(`/api/profiles/${profileId}/known`),
  setKnown: (profileId: string, lemma: string, known: boolean) =>
    call<void>(`/api/profiles/${profileId}/known`, { method: "POST", body: JSON.stringify({ lemma, known }) }),
  saveCard: (profileId: string, room: string | undefined, card: { titleId: string; cueId: number; itemId: string }) =>
    call<CardView>(`/api/profiles/${profileId}/cards${room ? `?room=${room}` : ""}`, {
      method: "POST",
      body: JSON.stringify(card),
    }),
  cards: (profileId: string) => call<CardView[]>(`/api/profiles/${profileId}/cards`),
  due: (profileId: string) => call<CardView[]>(`/api/profiles/${profileId}/review?limit=10`),
  grade: (cardId: string, grade: "again" | "hard" | "good" | "easy") =>
    call<{ intervalDays: number }>(`/api/cards/${cardId}/review`, { method: "POST", body: JSON.stringify({ grade }) }),
  pair: () => call<{ code: string; url: string }>("/api/pair", { method: "POST" }),
};
