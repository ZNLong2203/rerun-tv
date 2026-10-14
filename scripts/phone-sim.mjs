#!/usr/bin/env node
/**
 * A phone in the TV's pairing room, simulated in Google Chrome with a phone
 * screen. It opens exactly the link the TV's QR code shows.
 *
 *   node scripts/phone-sim.mjs           a phone window for you to use
 *   node scripts/phone-sim.mjs --test    drive the TV on the Vega Virtual Device and the phone together
 *                                        and check every tab; screenshots go to .cache/phone-sim/
 *
 * Options: --headful (watch the test), --shots <dir>, --tv-shots (also capture the
 * TV at the moments that matter; needs the server in still mode, STILL_VIDEO=1).
 *
 * In --test the browser's speech recognition is replaced by a stand-in that
 * "says" the line on screen with one word missing, so the run is repeatable;
 * scoring, the room message and the TV's toast are the real thing.
 *
 * Needs the server with DEBUG_ROOMS=1 (so the script can find the TV's room)
 * and, for --test, the TV app freshly launched on the Vega Virtual Device with
 * the automation toolkit forwarded (see docs/run-on-vega.md). Uses the Chrome
 * installed on this machine through playwright-core; nothing is downloaded.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices } from "playwright-core";

const SERVER = process.env.RERUN_SERVER ?? "http://127.0.0.1:8787";
const RPC = process.env.VVD_RPC ?? "http://127.0.0.1:8383/";
const KEYS = { up: "103", down: "108", left: "105", right: "106", select: "28", back: "158" };
const args = process.argv.slice(2);
const testing = args.includes("--test");
const headless = testing && !args.includes("--headful");
const shotsDir = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : join(".cache", "phone-sim");
const tvShots = args.includes("--tv-shots");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);

async function tvRoom(waitMs) {
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

async function openPhone() {
  const room = await tvRoom(testing ? 30_000 : 120_000);
  log(`TV room ${room.code}: ${room.url}`);
  const browser = await chromium.launch({
    channel: "chrome",
    headless,
    args: headless ? [] : ["--window-size=460,980"],
  });
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    ignoreHTTPSErrors: true, // the LAN listener's certificate is self-signed
    permissions: ["microphone"],
  });
  if (testing) await context.addInitScript(fakeSpeech);
  const page = await context.newPage();
  await page.goto(room.url);
  return { browser, page, room };
}

/**
 * Stands in for the browser's SpeechRecognition: on start() it reads the line
 * on screen and reports it word by word, leaving one word out.
 */
function fakeSpeech() {
  class FakeRecognition {
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
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
}

async function press(...names) {
  for (const name of names) {
    await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "injectInputKeyEvent", params: { inputKeyEvent: KEYS[name], holdDuration: 0 } }),
    });
    log("TV key", name);
    await sleep(700);
  }
}

async function tvShot(name) {
  if (!tvShots) return;
  // The toolkit can hand back the previously presented frame; the second capture shows the current one.
  const capture = async () => {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "takeScreenshot", params: {} }),
    });
    return (await res.json()).result;
  };
  await capture();
  await sleep(300);
  writeFileSync(join(shotsDir, `${name}.png`), Buffer.from(await capture(), "base64"));
}

async function tvTexts() {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getPageSource", params: {} }),
  });
  const xml = String((await res.json()).result ?? "");
  return [...xml.matchAll(/<text>([^<]*)<\/text>/g)].map((m) =>
    m[1].replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
}

// ── Interactive: a phone window for a person ──────────────────────────────

if (!testing) {
  const { browser, page } = await openPhone();
  log("phone window open — use it like a phone; the microphone is the computer's. Close the window to finish.");
  await new Promise((resolve) => {
    page.on("close", resolve);
    browser.on("disconnected", resolve);
  });
  await browser.close().catch(() => {});
  process.exit(0);
}

// ── Test: the TV and the phone together ───────────────────────────────────

mkdirSync(shotsDir, { recursive: true });
const results = [];
const step = async (name, fn) => {
  try {
    const note = await fn();
    results.push([name, "PASS", note ?? ""]);
    log(`PASS ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    results.push([name, "FAIL", e.message]);
    log(`FAIL ${name} — ${e.message}`);
  }
};
const shot = (page, name) => page.screenshot({ path: join(shotsDir, `${name}.png`) });

const { browser, page } = await openPhone();
const lineText = () => page.locator(".line-card .line").first().textContent();

await step("pairs with the TV", async () => {
  await page.locator(".status.ok").waitFor({ timeout: 10_000 });
  return (await page.locator(".status").textContent()).trim();
});

await press("select"); // first profile
await sleep(2500);
await press("down", "select"); // the film

await step("follows the film on the TV", async () => {
  await page.locator(".line-card").waitFor({ timeout: 20_000 });
  await page.locator(".who").waitFor({ timeout: 5_000 });
  return (await page.locator(".who > span:last-child").textContent()).trim();
});

await step("phone remote: next line", async () => {
  await sleep(3000); // let the player start before seeking
  await page.getByRole("button", { name: "Next line" }).click();
  await page.waitForFunction(() => {
    const t = document.querySelector(".line-card .line")?.textContent;
    return t && t !== "…";
  }, null, { timeout: 15_000 });
  const first = await lineText();
  await page.getByRole("button", { name: "Next line" }).click();
  await page.waitForFunction((prev) => document.querySelector(".line-card .line")?.textContent !== prev, first, { timeout: 15_000 });
  const second = await lineText();
  await sleep(300);
  await shot(page, "phone-now");
  return `"${first}" → "${second}"`;
});

await step("say it back: the TV pauses, the phone scores, the TV shows it", async () => {
  const line = await lineText();
  await page.getByRole("button", { name: /Tap, then say the line/ }).click();
  await page.locator(".result .score span").waitFor({ timeout: 15_000 });
  if ((await lineText()) !== line) throw new Error(`the film moved on while speaking: "${line}" → "${await lineText()}"`);
  const score = await page.locator(".result .score span").textContent();
  const missed = await page.locator(".result .words .missed").count();
  const texts = await tvTexts(); // before the toast fades (about 3 s)
  await tvShot("tv-shadow");
  await shot(page, "phone-shadow");
  const toast = texts.find((t) => t.includes("said it"));
  if (!toast) throw new Error(`phone scored ${score}, but the TV shows no result (${texts.slice(0, 6).join(" | ")})`);
  return `phone ${score} (${missed} word missed); TV: "${toast}"`;
});

await step("words saved on the TV appear on the phone", async () => {
  const before = await page.locator("nav.tabs button", { hasText: "Words" }).textContent();
  // Find a line with an expression that is not in the deck yet, stepping with the phone's remote.
  const { track } = await (await fetch(`${SERVER}/api/titles/tears-of-steel`)).json();
  const profiles = await (await fetch(`${SERVER}/api/profiles`)).json();
  const who = (await page.locator(".who > span:last-child").textContent()).trim();
  const profile = profiles.find((p) => who.startsWith(`${p.name} ·`));
  const deck = new Set((await (await fetch(`${SERVER}/api/profiles/${profile.id}/cards`)).json()).map((c) => c.itemId));
  let target;
  for (let i = 0; i < 12 && !target; i++) {
    const text = await lineText();
    const cue = track.cues.find((c) => c.text === text);
    const first = cue?.items.toSorted((a, b) => a.tokenStart - b.tokenStart)[0];
    if (first && !deck.has(first.id)) target = first;
    else {
      await page.getByRole("button", { name: "Next line" }).click();
      await page.waitForFunction((prev) => document.querySelector(".line-card .line")?.textContent !== prev, text, { timeout: 15_000 });
    }
  }
  if (!target) throw new Error("no line with an unsaved word nearby");
  await press("up", "select", "select"); // word mode, open the card, save
  await page.locator("nav.tabs button", { hasText: /Words · \d/ }).waitFor({ timeout: 10_000 });
  await tvShot("tv-saved");
  await page.locator("nav.tabs button", { hasText: "Words" }).click();
  await page.locator(".card.fresh h3").first().waitFor({ timeout: 10_000 });
  const saved = await page.locator(".card.fresh h3").first().textContent();
  if (saved !== target.surface) throw new Error(`expected "${target.surface}", the phone shows "${saved}"`);
  await sleep(400);
  await shot(page, "phone-words");
  return `"${saved}" (tab was "${before.trim()}")`;
});

await step("ask about the line", async () => {
  await page.locator("nav.tabs button", { hasText: "Ask" }).click();
  await page.getByRole("button", { name: "Is this rude or friendly?" }).click();
  const answer = page.locator(".answer");
  const warn = page.locator(".warn");
  await Promise.race([answer.waitFor({ timeout: 45_000 }), warn.waitFor({ timeout: 45_000 })]);
  if (await warn.isVisible()) throw new Error(await warn.textContent());
  await shot(page, "phone-ask");
  const text = (await answer.textContent()).trim();
  return `${text.slice(0, 70)}${text.length > 70 ? "…" : ""}`;
});

await step("household", async () => {
  await page.locator("nav.tabs button", { hasText: "Household" }).click();
  await page.locator(".member").first().waitFor({ timeout: 5_000 });
  const count = await page.locator(".member").count();
  await shot(page, "phone-household");
  return `${count} people`;
});

await press("back", "back", "back"); // card, word mode, film
await browser.close();

const failed = results.filter(([, r]) => r === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed; screenshots in ${shotsDir}/`);
process.exit(failed.length ? 1 : 0);
