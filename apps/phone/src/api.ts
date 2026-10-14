import type { CardView, CefrLevel } from "@rerun/core";

export interface Profile {
  id: string;
  name: string;
  nativeLang: string;
  level: CefrLevel;
  color: string;
  stats?: { saved: number; due: number; reviewedToday: number; known: number };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  profiles: () => call<Profile[]>("/api/profiles"),
  createProfile: (p: Pick<Profile, "name" | "nativeLang" | "level" | "color">) =>
    call<Profile>("/api/profiles", { method: "POST", body: JSON.stringify(p) }),
  cards: (profileId: string) => call<CardView[]>(`/api/profiles/${profileId}/cards`),
  deleteCard: (id: string) => call<void>(`/api/cards/${id}`, { method: "DELETE" }),
  ask: (input: { titleId: string; cueId: number; question: string; lang: string }) =>
    call<{ answer: string }>("/api/ask", { method: "POST", body: JSON.stringify(input) }),
  presence: (code: string) => call<{ tv: boolean; phones: number }>(`/api/pair/${code}`),
};

/** A clip URL the browser can play: the line's seconds via a media fragment. */
export function clipUrl(titleId: string, start: number, end: number): string {
  return `/media/${titleId}/video#t=${Math.max(0, start - 0.2).toFixed(2)},${(end + 0.3).toFixed(2)}`;
}
