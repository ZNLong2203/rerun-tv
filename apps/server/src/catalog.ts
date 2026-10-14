/**
 * Titles on disk: content/<id>/meta.json plus the enriched track.json the
 * pipeline wrote. Loaded once at start-up; a title without a track is listed
 * but not playable.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { trackDifficulty, type EnrichedTrack, type LearnerProfile, type TrackDifficulty } from "@rerun/core";

export interface TitleMeta {
  id: string;
  title: string;
  year: number;
  runtimeSeconds: number;
  synopsis: string;
  video: { file: string; sourceUrl: string };
  license: { name: string; url: string; attribution: string };
}

export interface Title {
  meta: TitleMeta;
  track: EnrichedTrack | undefined;
  /** Absolute path of the video file, if it has been prepared. */
  videoPath: string | undefined;
  /** Absolute path of the poster image, if present. */
  posterPath: string | undefined;
}

export class Catalog {
  private readonly titles = new Map<string, Title>();

  constructor(contentDir: string, mediaDir: string) {
    if (!existsSync(contentDir)) return;
    for (const entry of readdirSync(contentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(contentDir, entry.name);
      const metaPath = join(dir, "meta.json");
      if (!existsSync(metaPath)) continue;
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as TitleMeta;
      const trackPath = join(dir, "track.json");
      const track = existsSync(trackPath) ? (JSON.parse(readFileSync(trackPath, "utf8")) as EnrichedTrack) : undefined;
      const videoPath = join(mediaDir, meta.video.file);
      const posterPath = join(mediaDir, `${meta.id}.jpg`);
      this.titles.set(meta.id, {
        meta,
        track,
        videoPath: existsSync(videoPath) ? videoPath : undefined,
        posterPath: existsSync(posterPath) ? posterPath : undefined,
      });
    }
  }

  get(id: string): Title | undefined {
    return this.titles.get(id);
  }

  list(): Title[] {
    return [...this.titles.values()].sort((a, b) => a.meta.title.localeCompare(b.meta.title));
  }

  difficultyFor(id: string, profile: Pick<LearnerProfile, "level" | "known">): TrackDifficulty | undefined {
    const track = this.titles.get(id)?.track;
    return track ? trackDifficulty(track, profile) : undefined;
  }
}
