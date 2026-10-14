/**
 * Still frames from a title's local video, for "still playback": the TV shows
 * the frame for the current second instead of a video surface. Vega's
 * screenshot tooling cannot capture a video surface, so this is how the
 * player UI gets checked and photographed. Frames are cut with ffmpeg once
 * and cached on disk.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Frames are cut on a half-second grid, so nearby requests share a file. */
export function frameSecond(t: number): number {
  return Math.max(0, Math.round(t * 2) / 2);
}

export async function frameAt(videoPath: string, cacheDir: string, t: number): Promise<string> {
  const second = frameSecond(t);
  const out = join(cacheDir, `${second.toFixed(1)}.jpg`);
  if (existsSync(out)) return out;
  await mkdir(cacheDir, { recursive: true });
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(second),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=1280:-2",
    "-q:v",
    "4",
    "-y",
    out,
  ]);
  return out;
}
