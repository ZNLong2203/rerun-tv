import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { EnrichedTrack } from "@rerun/core";
import { createApp } from "../src/app.js";
import { Catalog } from "../src/catalog.js";
import { parseRange } from "../src/media.js";
import { Rooms, type Peer } from "../src/rooms.js";
import { Store } from "../src/store.js";

const track: EnrichedTrack = {
  titleId: "demo",
  sourceLang: "en",
  learnerLangs: ["vi"],
  model: "test",
  generatedAt: "2026-10-14T00:00:00Z",
  cues: [
    {
      id: 0,
      start: 23,
      end: 24.5,
      text: "You're a jerk, Thom.",
      translations: { vi: "Anh là đồ tồi, Thom." },
      items: [
        {
          id: "c0-jerk",
          surface: "jerk",
          tokenStart: 2,
          tokenEnd: 3,
          lemma: "jerk",
          kind: "word",
          level: "B2",
          meaning: { en: "an unkind person", vi: "đồ tồi" },
          inContext: { en: "Celia is angry.", vi: "Celia đang giận." },
        },
      ],
    },
    {
      id: 1,
      start: 25,
      end: 27,
      text: "Look Celia, we have to follow our passions;",
      translations: { vi: "Nghe này Celia, ta phải theo đuổi đam mê;" },
      items: [],
    },
  ],
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "rerun-"));
  const content = join(root, "content", "demo");
  const media = join(root, "media");
  mkdirSync(content, { recursive: true });
  mkdirSync(media);
  writeFileSync(
    join(content, "meta.json"),
    JSON.stringify({
      id: "demo",
      title: "Demo",
      year: 2026,
      runtimeSeconds: 60,
      synopsis: "",
      video: { file: "demo.mp4", sourceUrl: "" },
      license: { name: "CC BY", url: "", attribution: "" },
    }),
  );
  writeFileSync(join(content, "track.json"), JSON.stringify(track));
  writeFileSync(join(media, "demo.mp4"), Buffer.from("0123456789"));
  return { contentDir: join(root, "content"), mediaDir: media };
}

let now = Date.UTC(2026, 9, 15, 8);
let store: Store;
let app: ReturnType<typeof createApp>;
let rooms: Rooms;

beforeEach(() => {
  now = Date.UTC(2026, 9, 15, 8);
  const { contentDir, mediaDir } = fixture();
  store = new Store(":memory:", () => now);
  rooms = new Rooms(() => now);
  app = createApp({ store, catalog: new Catalog(contentDir, mediaDir), rooms, port: 8787 });
});

async function post(path: string, body: unknown) {
  return app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("profiles", () => {
  it("creates, lists and validates", async () => {
    const res = await post("/api/profiles", { name: "Linh", nativeLang: "vi", level: "B1" });
    expect(res.status).toBe(201);
    const list = (await (await app.request("/api/profiles")).json()) as { name: string; stats: { saved: number } }[];
    expect(list).toMatchObject([{ name: "Linh", stats: { saved: 0 } }]);

    expect((await post("/api/profiles", { name: "", nativeLang: "vi", level: "B1" })).status).toBe(400);
    expect((await post("/api/profiles", { name: "X", nativeLang: "vi", level: "D9" })).status).toBe(400);
  });
});

describe("titles", () => {
  it("lists titles with difficulty for the chosen profile", async () => {
    const linh = store.createProfile({ name: "Linh", nativeLang: "vi", level: "B1", color: "#000000" });
    const [title] = (await (await app.request(`/api/titles?profile=${linh.id}`)).json()) as {
      playable: boolean;
      difficulty: { newItems: number };
    }[];
    expect(title).toMatchObject({ playable: true, difficulty: { newItems: 1 } });

    store.setKnown(linh.id, "jerk", true);
    const [after] = (await (await app.request(`/api/titles?profile=${linh.id}`)).json()) as {
      difficulty: { newItems: number };
    }[];
    expect(after!.difficulty.newItems).toBe(0);
  });

  it("returns the full track in one request", async () => {
    const body = (await (await app.request("/api/titles/demo")).json()) as { track: EnrichedTrack };
    expect(body.track.cues).toHaveLength(2);
    expect((await app.request("/api/titles/nope")).status).toBe(404);
  });

  it("serves video byte ranges", async () => {
    const res = await app.request("/media/demo/video", { headers: { Range: "bytes=2-5" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(await res.text()).toBe("2345");
    const bad = await app.request("/media/demo/video", { headers: { Range: "bytes=50-60" } });
    expect(bad.status).toBe(416);
  });
});

describe("parseRange", () => {
  it("handles open, suffix and invalid ranges", () => {
    expect(parseRange(undefined, 100)).toBeUndefined();
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=0-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
  });
});

describe("cards and the Daily Rerun", () => {
  it("saves a word once, shows it due, and schedules it after review", async () => {
    const linh = store.createProfile({ name: "Linh", nativeLang: "vi", level: "B1", color: "#000000" });
    const first = await post(`/api/profiles/${linh.id}/cards`, { titleId: "demo", cueId: 0, itemId: "c0-jerk" });
    expect(first.status).toBe(201);
    const card = (await first.json()) as { id: string; meaning: string; lineTranslation: string };
    expect(card).toMatchObject({ meaning: "đồ tồi", lineTranslation: "Anh là đồ tồi, Thom." });

    const again = await post(`/api/profiles/${linh.id}/cards`, { titleId: "demo", cueId: 0, itemId: "c0-jerk" });
    expect(again.status).toBe(200);

    const due = (await (await app.request(`/api/profiles/${linh.id}/review`)).json()) as unknown[];
    expect(due).toHaveLength(1);

    const graded = await post(`/api/cards/${card.id}/review`, { grade: "easy" });
    expect(await graded.json()).toMatchObject({ intervalDays: 4 });
    expect(await (await app.request(`/api/profiles/${linh.id}/review`)).json()).toEqual([]);

    now += 5 * 86_400_000;
    expect(await (await app.request(`/api/profiles/${linh.id}/review`)).json()).toHaveLength(1);
  });

  it("refuses words that are not in the track", async () => {
    const linh = store.createProfile({ name: "Linh", nativeLang: "vi", level: "B1", color: "#000000" });
    const res = await post(`/api/profiles/${linh.id}/cards`, { titleId: "demo", cueId: 1, itemId: "c0-jerk" });
    expect(res.status).toBe(404);
  });

  it("tells the paired phones when a word is saved", async () => {
    const linh = store.createProfile({ name: "Linh", nativeLang: "vi", level: "B1", color: "#000000" });
    const { code } = (await (await post("/api/pair", {})).json()) as { code: string };
    const phone = fakePeer();
    rooms.join(code, "phone", phone);
    await post(`/api/profiles/${linh.id}/cards?room=${code}`, { titleId: "demo", cueId: 0, itemId: "c0-jerk" });
    expect(phone.received.map((m) => JSON.parse(m).type)).toContain("card.saved");
  });
});

describe("live questions", () => {
  it("answers 503 when no model is configured", async () => {
    const res = await post("/api/ask", { titleId: "demo", cueId: 0, question: "Why jerk?", lang: "vi" });
    expect(res.status).toBe(503);
  });
});

function fakePeer(): Peer & { received: string[] } {
  const received: string[] = [];
  return { received, send: (d) => received.push(d), close: () => {} };
}

describe("rooms", () => {
  it("relays allowed messages to the others in the room only", () => {
    const code = rooms.create();
    const tv = fakePeer();
    const phone = fakePeer();
    rooms.join(code, "tv", tv);
    rooms.join(code, "phone", phone);
    expect(JSON.parse(tv.received.at(-1)!)).toEqual({ type: "presence", tv: true, phones: 1 });

    expect(rooms.relay(code, "phone", phone, '{"type":"remote","action":"toggle"}')).toBe(true);
    expect(JSON.parse(tv.received.at(-1)!)).toEqual({ type: "remote", action: "toggle" });

    // A phone cannot pretend to be the TV, and junk is dropped.
    expect(rooms.relay(code, "phone", phone, '{"type":"card.saved","card":{}}')).toBe(false);
    expect(rooms.relay(code, "tv", tv, "nonsense")).toBe(false);
  });

  it("drops empty rooms after they go idle", () => {
    const code = rooms.create();
    now += 7 * 60 * 60 * 1000;
    rooms.sweep();
    expect(rooms.has(code)).toBe(false);
  });
});

describe("still frames", () => {
  it("snaps requested times to a half-second grid", async () => {
    const { frameSecond } = await import("../src/frames.js");
    expect(frameSecond(23.26)).toBe(23.5);
    expect(frameSecond(23.2)).toBe(23);
    expect(frameSecond(-4)).toBe(0);
  });

  it("only offers still playback when asked to", async () => {
    const body = (await (await app.request("/api/titles/demo")).json()) as { meta: { playback: string; frameUrl?: string } };
    expect(body.meta.playback).toBe("video");
    expect(body.meta.frameUrl).toBeUndefined();
  });
});

describe("public URL", () => {
  it("treats an empty PUBLIC_URL as unset, so QR codes and media URLs stay absolute", async () => {
    const { contentDir, mediaDir } = fixture();
    const blank = createApp({ store, catalog: new Catalog(contentDir, mediaDir), rooms, port: 8787, publicUrl: "  " });
    const pair = (await (await blank.request("/api/pair", { method: "POST" })).json()) as { url: string };
    expect(pair.url).toMatch(/^http:\/\/[^/]+:8787\/m\/#/);
    const detail = (await (await blank.request("http://tv.local:8787/api/titles/demo")).json()) as { meta: { videoUrl: string } };
    expect(detail.meta.videoUrl).toBe("http://tv.local:8787/media/demo/video.mp4");
  });

  it("uses PUBLIC_URL without a trailing slash when set", async () => {
    const { contentDir, mediaDir } = fixture();
    const pub = createApp({ store, catalog: new Catalog(contentDir, mediaDir), rooms, port: 8787, publicUrl: "https://rerun.example/" });
    const pair = (await (await pub.request("/api/pair", { method: "POST" })).json()) as { url: string };
    expect(pair.url).toMatch(/^https:\/\/rerun\.example\/m\/#[A-Z0-9]{5}$/);
  });
});
