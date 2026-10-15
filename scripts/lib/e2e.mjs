/**
 * Shared by the end-to-end scripts: the TV on the Vega Virtual Device, driven
 * through the automation toolkit's JSON-RPC (remote keys in; screen text and
 * screenshots out), and a phone simulated in Google Chrome, paired with the TV
 * through the link its QR code shows.
 *
 * Needs the server with DEBUG_ROOMS=1, so the phone can find the TV's room,
 * and the toolkit forwarded (see docs/run-on-vega.md).
 */

import { writeFileSync } from "node:fs";
import { chromium, devices } from "playwright-core";

export const SERVER = process.env.RERUN_SERVER ?? "http://127.0.0.1:8787";
const RPC = process.env.VVD_RPC ?? "http://127.0.0.1:8383/";
/** Linux input event codes, which is what injectInputKeyEvent expects. */
const KEYS = { up: "103", down: "108", left: "105", right: "106", select: "28", back: "158" };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
export const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);

async function rpc(method, params = {}) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

/** Press remote keys on the TV, 0.7 s apart. */
export async function press(...names) {
  for (const name of names) {
    await rpc("injectInputKeyEvent", { inputKeyEvent: KEYS[name], holdDuration: 0 });
    log("TV key", name);
    await sleep(700);
  }
}

/** Every text on the TV's screen. */
export async function tvTexts() {
  const xml = String((await rpc("getPageSource")) ?? "");
  return [...xml.matchAll(/<text>([^<]*)<\/text>/g)].map((m) =>
    m[1]
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

/** A screenshot of the TV; with a film open, only in still mode (STILL_VIDEO=1). */
export async function tvScreenshot(path) {
  // The toolkit can hand back the previously presented frame; the second capture shows the current one.
  await rpc("takeScreenshot");
  await sleep(300);
  writeFileSync(path, Buffer.from(await rpc("takeScreenshot"), "base64"));
}

/** The newest room with a TV in it. */
export async function tvRoom(waitMs) {
  const until = Date.now() + waitMs;
  for (;;) {
    const res = await fetch(`${SERVER}/api/debug/rooms`).catch(() => undefined);
    if (!res?.ok) throw new Error("start the server with DEBUG_ROOMS=1 so the phone can find the TV's room");
    const room = (await res.json()).filter((r) => r.tv).at(-1);
    if (room) return room;
    if (Date.now() > until) throw new Error("no TV in any room — is Rerun open on the TV?");
    await sleep(1000);
  }
}

/**
 * Open the phone page in Chrome with a Pixel-sized screen, at the TV's room.
 * With `standInVoice`, speech recognition is replaced by a stand-in that says
 * the line on screen with one word missing.
 */
export async function openPhone({ headless = false, standInVoice = false, waitMs = 30_000, position, recordVideoDir } = {}) {
  const room = await tvRoom(waitMs);
  log(`TV room ${room.code}: ${room.url}`);
  const windowArgs = ["--window-size=460,980", ...(position ? [`--window-position=${position}`] : [])];
  const browser = await chromium.launch({ channel: "chrome", headless, args: headless ? [] : windowArgs });
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    ignoreHTTPSErrors: true, // the LAN listener's certificate is self-signed
    permissions: ["microphone"],
    // The phone's screen as a video; Playwright records it at the viewport's CSS size.
    ...(recordVideoDir ? { recordVideo: { dir: recordVideoDir, size: devices["Pixel 7"].viewport } } : {}),
  });
  if (standInVoice) await context.addInitScript(standInSpeech);
  const page = await context.newPage();
  const openedAt = Date.now(); // the phone video starts about here
  await page.goto(room.url);
  return { browser, context, page, room, openedAt };
}

/**
 * Stands in for the browser's SpeechRecognition: on start() it reads the line
 * on screen and reports it word by word, leaving one word out.
 */
function standInSpeech() {
  class StandInRecognition {
    lang = "en-US";
    interimResults = false;
    maxAlternatives = 1;
    continuous = false;
    onresult = null;
    onerror = null;
    onend = null;
    #timers = [];
    start() {
      const line = document.querySelector(".line-card .line")?.textContent ?? "";
      const words = line.replace(/[^\p{L}\p{N}' ]+/gu, " ").split(/\s+/).filter(Boolean);
      if (words.length > 4) words.splice(3, 1);
      const result = (n, isFinal) => [Object.assign([{ transcript: words.slice(0, n).join(" ").toLowerCase(), confidence: 0.9 }], { isFinal })];
      words.forEach((_, i) => {
        const done = i === words.length - 1;
        this.#timers.push(setTimeout(() => this.onresult?.({ results: result(i + 1, done) }), 250 * (i + 1)));
      });
      this.#timers.push(setTimeout(() => this.onend?.(), 250 * (words.length + 1)));
    }
    stop() {}
    abort() {
      this.#timers.forEach(clearTimeout);
      this.onend?.();
    }
  }
  window.SpeechRecognition = StandInRecognition;
  window.webkitSpeechRecognition = StandInRecognition;
}
