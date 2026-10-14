/**
 * HTTP API for the TV app and the phone companion. Everything the TV needs to
 * play a title comes from GET /api/titles/:id in one request, so playback
 * never waits on the network after it starts.
 */

import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { CEFR_LEVELS, pickLang, type CardView, type EnrichedTrack, type Grade } from "@rerun/core";
import { z } from "zod";
import { AskUnavailableError, type Asker } from "./ask.js";
import type { Catalog, TitleMeta } from "./catalog.js";
import { frameAt } from "./frames.js";
import { serveFile } from "./media.js";
import type { Rooms } from "./rooms.js";
import type { StoredCard, Store } from "./store.js";

export interface Deps {
  store: Store;
  catalog: Catalog;
  rooms: Rooms;
  asker?: Asker;
  /** Built phone companion (apps/phone/dist), if present. */
  phoneDir?: string;
  /** Public base URL for QR codes; otherwise the LAN address is used. */
  publicUrl?: string;
  /** Base URL of the HTTPS listener (HTTPS=1), so the phone gets a microphone. */
  phoneUrl?: string;
  /** Expose GET /api/debug/rooms for on-device smoke tests. Never in production. */
  debugRooms?: boolean;
  /**
   * Tell the TV to show still frames instead of a video surface, so the
   * player can be screenshotted (STILL_VIDEO=1). Needs the local video.
   */
  stillVideo?: boolean;
  /** Where cut frames are cached. */
  frameCacheDir?: string;
  port: number;
}

const ProfileInput = z.object({
  name: z.string().trim().min(1).max(24),
  nativeLang: z.string().min(2).max(8),
  level: z.enum(CEFR_LEVELS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#F59E0B"),
});

const CardInput = z.object({
  titleId: z.string(),
  cueId: z.number().int().nonnegative(),
  itemId: z.string(),
});

const ReplayInput = z.object({ titleId: z.string(), cueId: z.number().int().nonnegative() });
const ReviewInput = z.object({ grade: z.enum(["again", "hard", "good", "easy"]) });
const KnownInput = z.object({ lemma: z.string().min(1), known: z.boolean() });
const AskInput = z.object({
  titleId: z.string(),
  cueId: z.number().int().nonnegative(),
  question: z.string().trim().min(1).max(300),
  lang: z.string().min(2).max(8),
});

/** First non-internal IPv4 address, so a phone on the same Wi-Fi can reach us. */
export function lanAddress(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return undefined;
}

/** The URL a player should load for a title: its HTTPS copy if it has one. */
export function videoUrlFor(meta: TitleMeta, base: string): string {
  return meta.video.streamUrl ?? `${base}/media/${meta.id}/video.mp4`;
}

export function cardView(
  card: StoredCard,
  track: EnrichedTrack | undefined,
  lang: string,
  videoUrl = "",
): CardView | undefined {
  const cue = track?.cues.find((c) => c.id === card.cueId);
  if (!cue) return undefined;
  const line = {
    line: cue.text,
    lineTranslation: pickLang(cue.translations, lang),
    start: cue.start,
    end: cue.end,
    due: card.state.due,
    videoUrl,
  };
  if (card.kind === "line") {
    return {
      id: card.id,
      kind: "line",
      profileId: card.profileId,
      titleId: card.titleId,
      cueId: cue.id,
      itemId: card.itemId,
      surface: "",
      lemma: "",
      meaning: "",
      ...line,
    };
  }
  const item = cue.items.find((i) => i.id === card.itemId);
  if (!item) return undefined;
  return {
    id: card.id,
    kind: "word",
    profileId: card.profileId,
    titleId: card.titleId,
    cueId: cue.id,
    itemId: item.id,
    surface: item.surface,
    lemma: item.lemma,
    meaning: pickLang(item.meaning, lang),
    ...line,
  };
}

async function json<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "body must be JSON" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  return parsed.data;
}

export function createApp(deps: Deps) {
  const { store, catalog, rooms } = deps;
  const app = new Hono();
  const publicUrl = deps.publicUrl?.trim().replace(/\/+$/, "") || undefined;
  const baseUrl = (c: Context) => publicUrl ?? new URL(c.req.url).origin;

  // The TV app and the phone are served from different origins in development.
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  });
  app.options("/api/*", (c) => c.body(null, 204));

  app.get("/api/health", (c) =>
    c.json({ ok: true, titles: catalog.list().length, ask: Boolean(deps.asker) }),
  );

  // ── Titles ──────────────────────────────────────────────────

  app.get("/api/titles", (c) => {
    const profileId = c.req.query("profile");
    const profile = profileId ? store.getProfile(profileId) : undefined;
    const known = profile ? store.knownLemmas(profile.id) : new Set<string>();
    return c.json(
      catalog.list().map((t) => ({
        ...t.meta,
        videoUrl: videoUrlFor(t.meta, baseUrl(c)),
        playable: Boolean(t.track && t.videoPath),
        lines: t.track?.cues.length ?? 0,
        learnerLangs: t.track?.learnerLangs ?? [],
        difficulty: profile ? catalog.difficultyFor(t.meta.id, { level: profile.level, known }) : undefined,
      })),
    );
  });

  app.get("/api/titles/:id", (c) => {
    const title = catalog.get(c.req.param("id"));
    if (!title?.track) return c.json({ error: "not found" }, 404);
    const still = Boolean(deps.stillVideo && title.videoPath);
    return c.json({
      meta: {
        ...title.meta,
        videoUrl: videoUrlFor(title.meta, baseUrl(c)),
        playback: still ? "still" : "video",
        frameUrl: still ? `${baseUrl(c)}/media/${title.meta.id}/frame` : undefined,
      },
      track: title.track,
    });
  });

  // Players pick a demuxer from the URL's extension, so the film is also served as video.mp4.
  app.get("/media/:id/video.mp4", (c) => {
    const path = catalog.get(c.req.param("id"))?.videoPath;
    if (!path) return c.json({ error: "video not prepared" }, 404);
    return serveFile(path, c.req.header("range"));
  });

  app.get("/media/:id/video", (c) => {
    const path = catalog.get(c.req.param("id"))?.videoPath;
    if (!path) return c.json({ error: "video not prepared" }, 404);
    return serveFile(path, c.req.header("range"));
  });

  app.get("/media/:id/frame", async (c) => {
    const title = catalog.get(c.req.param("id"));
    const t = Number(c.req.query("t") ?? 0);
    if (!title?.videoPath || !Number.isFinite(t) || !deps.frameCacheDir) return c.json({ error: "no frames" }, 404);
    const path = await frameAt(title.videoPath, join(deps.frameCacheDir, title.meta.id), t);
    return serveFile(path, undefined);
  });

  app.get("/media/:id/poster", (c) => {
    const path = catalog.get(c.req.param("id"))?.posterPath;
    if (!path) return c.json({ error: "no poster" }, 404);
    return serveFile(path, undefined);
  });

  // ── Profiles ────────────────────────────────────────────────

  app.get("/api/profiles", (c) =>
    c.json(store.listProfiles().map((p) => ({ ...p, stats: store.stats(p.id) }))),
  );

  app.post("/api/profiles", async (c) => {
    const input = await json(c, ProfileInput);
    if (input instanceof Response) return input;
    return c.json(store.createProfile(input), 201);
  });

  app.patch("/api/profiles/:id", async (c) => {
    const input = await json(c, ProfileInput.partial());
    if (input instanceof Response) return input;
    const p = store.updateProfile(c.req.param("id"), input);
    return p ? c.json(p) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/profiles/:id", (c) =>
    store.deleteProfile(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
  );

  app.get("/api/profiles/:id/known", (c) => c.json([...store.knownLemmas(c.req.param("id"))]));

  app.post("/api/profiles/:id/known", async (c) => {
    const input = await json(c, KnownInput);
    if (input instanceof Response) return input;
    if (!store.getProfile(c.req.param("id"))) return c.json({ error: "not found" }, 404);
    store.setKnown(c.req.param("id"), input.lemma.toLowerCase(), input.known);
    return c.body(null, 204);
  });

  // ── Cards ───────────────────────────────────────────────────

  const viewsFor = (c: Context, profileId: string, cards: StoredCard[]) => {
    const profile = store.getProfile(profileId);
    const lang = profile?.nativeLang ?? "en";
    return cards.flatMap((card) => {
      const title = catalog.get(card.titleId);
      if (!title) return [];
      const view = cardView(card, title.track, lang, videoUrlFor(title.meta, baseUrl(c)));
      if (!view) return [];
      return deps.stillVideo && title.videoPath ? { ...view, frameUrl: `${baseUrl(c)}/media/${title.meta.id}/frame` } : view;
    });
  };

  app.get("/api/profiles/:id/cards", (c) => {
    const id = c.req.param("id");
    return c.json(viewsFor(c, id, store.listCards(id)));
  });

  app.post("/api/profiles/:id/cards", async (c) => {
    const input = await json(c, CardInput);
    if (input instanceof Response) return input;
    const profile = store.getProfile(c.req.param("id"));
    const track = catalog.get(input.titleId)?.track;
    const item = track?.cues.find((q) => q.id === input.cueId)?.items.find((i) => i.id === input.itemId);
    if (!profile || !track || !item) return c.json({ error: "not found" }, 404);

    const { card, created } = store.saveCard({ profileId: profile.id, ...input, lemma: item.lemma });
    const view = cardView(card, track, profile.nativeLang, videoUrlFor(catalog.get(input.titleId)!.meta, baseUrl(c)))!;
    const room = c.req.query("room");
    if (room && created) rooms.publish(room, { type: "card.saved", card: view });
    return c.json(view, created ? 201 : 200);
  });

  /** The TV heard a line again for this viewer (◀): it comes back as a listening card. */
  app.post("/api/profiles/:id/replays", async (c) => {
    const input = await json(c, ReplayInput);
    if (input instanceof Response) return input;
    const profile = store.getProfile(c.req.param("id"));
    const title = catalog.get(input.titleId);
    if (!profile || !title?.track?.cues.some((q) => q.id === input.cueId)) return c.json({ error: "not found" }, 404);
    const { count, card, created } = store.recordReplay({ profileId: profile.id, ...input });
    const view = cardView(card, title.track, profile.nativeLang, videoUrlFor(title.meta, baseUrl(c)))!;
    return c.json({ count, created, card: view }, created ? 201 : 200);
  });

  app.delete("/api/cards/:id", (c) =>
    store.deleteCard(c.req.param("id")) ? c.body(null, 204) : c.json({ error: "not found" }, 404),
  );

  /** Cards due now, oldest first: the Daily Rerun. */
  app.get("/api/profiles/:id/review", (c) => {
    const id = c.req.param("id");
    const limit = Math.min(Number(c.req.query("limit") ?? 10) || 10, 50);
    return c.json(viewsFor(c, id, store.dueCards(id, limit)));
  });

  app.post("/api/cards/:id/review", async (c) => {
    const input = await json(c, ReviewInput);
    if (input instanceof Response) return input;
    const card = store.reviewCard(c.req.param("id"), input.grade as Grade);
    if (!card) return c.json({ error: "not found" }, 404);
    return c.json({ id: card.id, due: card.state.due, intervalDays: card.state.intervalDays });
  });

  // ── Pairing ─────────────────────────────────────────────────

  /** What the QR code on the TV opens: the phone page, as reachable from a phone. */
  const phoneLink = (code: string) =>
    `${publicUrl ?? deps.phoneUrl ?? `http://${lanAddress() ?? "localhost"}:${deps.port}`}/m/#${code}`;

  app.post("/api/pair", (c) => {
    const code = rooms.create();
    console.log(`pairing room ${code} opened`);
    return c.json({ code, url: phoneLink(code) }, 201);
  });

  app.get("/api/pair/:code", (c) => {
    const presence = rooms.presence(c.req.param("code").toUpperCase());
    return presence ? c.json(presence) : c.json({ error: "unknown code" }, 404);
  });

  if (deps.debugRooms) app.get("/api/debug/rooms", (c) => c.json(rooms.list().map((r) => ({ ...r, url: phoneLink(r.code) }))));

  // ── Live questions ──────────────────────────────────────────

  app.post("/api/ask", async (c) => {
    const input = await json(c, AskInput);
    if (input instanceof Response) return input;
    const title = catalog.get(input.titleId);
    if (!title?.track) return c.json({ error: "not found" }, 404);
    if (!deps.asker) return c.json({ error: "live questions are not configured" }, 503);
    try {
      const answer = await deps.asker.ask({ title: title.meta.title, track: title.track, ...input });
      return c.json({ answer });
    } catch (err) {
      if (err instanceof AskUnavailableError) return c.json({ error: err.message }, 503);
      throw err;
    }
  });

  // ── Phone companion ─────────────────────────────────────────

  if (deps.phoneDir && existsSync(join(deps.phoneDir, "index.html"))) {
    const root = deps.phoneDir;
    app.get("/m", (c) => c.redirect("/m/"));
    app.use("/m/*", serveStatic({ root, rewriteRequestPath: (p) => p.replace(/^\/m/, "") }));
    app.get("/m/*", serveStatic({ path: join(root, "index.html") }));
  }

  app.get("/", (c) => c.redirect("/m/"));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
