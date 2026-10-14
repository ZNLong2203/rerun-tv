#!/usr/bin/env node
/**
 * Capture the README / Devpost gallery from the real app on the Vega Virtual
 * Device, by driving it with remote keys.
 *
 * Vega's screenshot path cannot capture a video surface, so run the server in
 * still mode, which shows frames from the film instead of video, on a fresh
 * household:
 *
 *   rm -rf .data && STILL_VIDEO=1 npm run dev
 *   vega device launch-app --appName com.rerun.tv.main
 *   node scripts/gallery.mjs [outDir]          # default docs/images
 *
 * Shots are PNG; the README uses JPEG copies
 * (sips -s format jpeg -s formatOptions 85 in.png --out out.jpg).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RPC = process.env.VVD_RPC ?? "http://127.0.0.1:8383/";
const out = process.argv[2] ?? "docs/images";
const KEYS = { up: "103", down: "108", left: "105", right: "106", select: "28", back: "158" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let id = 0;
async function rpc(method, params = {}) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function keys(...names) {
  for (const name of names) {
    await rpc("injectInputKeyEvent", { inputKeyEvent: KEYS[name], holdDuration: 0 });
    await sleep(650);
  }
}

async function shot(name, settle = 1200) {
  await sleep(settle);
  // The toolkit can hand back the previously presented frame; the second
  // capture reliably shows the current one.
  await rpc("takeScreenshot");
  await sleep(500);
  const png = await rpc("takeScreenshot");
  const path = join(out, `${name}.png`);
  await writeFile(path, Buffer.from(png, "base64"));
  console.log(path);
}

await mkdir(out, { recursive: true });

await shot("01-who-is-learning");
await keys("select");
await shot("02-home", 4500);

// Into the film, then line by line to "…you're freaked out by my robot hand?"
await keys("down", "select");
await sleep(3500);
await keys("right", "right", "right", "right");
await keys("select"); // pause: the remote hints appear
await shot("03-learner-subtitles", 3000);
await keys("up");
await shot("04-word-mode");
await keys("select");
await shot("05-word-card");
await keys("select");
await shot("06-saved", 600);

// Back home, then the pairing screen and the Daily Rerun.
await keys("back", "back", "back");
await sleep(2000);
await keys("down", "right", "select");
await shot("07-pair-phone", 2000);
await keys("back");
await sleep(1500);
await keys("up", "up", "select");
await shot("08-daily-rerun", 3000);
await keys("select");
await shot("09-daily-rerun-answer", 2500);
await keys("back");
