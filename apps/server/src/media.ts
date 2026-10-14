/**
 * Serve a file with HTTP Range support: TV players seek by asking for byte
 * ranges, and without 206 responses they cannot jump to a line.
 */

import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  vtt: "text/vtt; charset=utf-8",
};

export function contentType(path: string): string {
  return TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Parse a single "bytes=a-b" range against a file size. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | "invalid" | undefined {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

export function serveFile(path: string, rangeHeader: string | undefined): Response {
  const size = statSync(path).size;
  const type = contentType(path);
  const range = parseRange(rangeHeader, size);
  const common = { "Accept-Ranges": "bytes", "Content-Type": type, "Cache-Control": "public, max-age=3600" };

  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...common, "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...common,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
