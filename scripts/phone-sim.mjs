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

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SERVER, log, openPhone as open, press, sleep, tvScreenshot, tvTexts } from "./lib/e2e.mjs";

const args = process.argv.slice(2);
const testing = args.includes("--test");
const headless = testing && !args.includes("--headful");
const shotsDir = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : join(".cache", "phone-sim");
const tvShots = args.includes("--tv-shots");

const openPhone = () => open({ headless, standInVoice: testing, waitMs: testing ? 30_000 : 120_000 });
const tvShot = (name) => (tvShots ? tvScreenshot(join(shotsDir, `${name}.png`)) : undefined);

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
  // Straight away: a seek sent before the film has loaded must still land.
  await page.getByRole("button", { name: "Next line" }).click();
  await page.waitForFunction(() => {
    const t = document.querySelector(".line-card .line")?.textContent;
    return t && t !== "…";
  }, null, { timeout: 15_000 });
  const first = await lineText();
  await page.getByRole("button", { name: "Next line" }).click();
  // The gap between two lines shows "…": wait for the next real line.
  await page.waitForFunction((prev) => {
    const t = document.querySelector(".line-card .line")?.textContent;
    return t && t !== "…" && t !== prev;
  }, first, { timeout: 15_000 });
  const second = await lineText();
  await sleep(300);
  await shot(page, "phone-now");
  return `"${first}" → "${second}"`;
});

await step("say it back: the TV pauses, the phone scores, the TV shows it", async () => {
  if ((await lineText()) === "…") await page.getByRole("button", { name: "Replay line" }).click();
  await page.waitForFunction(() => (document.querySelector(".line-card .line")?.textContent ?? "…") !== "…", null, { timeout: 10_000 });
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

await step("hear it again: the line joins the Daily Rerun", async () => {
  const line = await lineText();
  const who = (await page.locator(".who > span:last-child").textContent()).trim();
  const profile = (await (await fetch(`${SERVER}/api/profiles`)).json()).find((p) => who.startsWith(`${p.name} ·`));
  const before = await (await fetch(`${SERVER}/api/profiles/${profile.id}/cards`)).json();
  const known = before.some((c) => c.kind === "line" && c.line === line); // the TV only says so the first time
  await page.getByRole("button", { name: "Replay line" }).click();
  // The TV counts the line once the "press twice for the line before" window has passed.
  let toast;
  for (let i = 0; i < 15 && !toast; i++) {
    await sleep(300);
    toast = (await tvTexts()).find((t) => t.includes("Daily Rerun"));
  }
  if (!toast && !known) throw new Error("the TV did not say the line comes back");
  if (!toast) toast = "(already in the deck, so no toast)";
  await tvShot("tv-heard-again");
  const deck = await (await fetch(`${SERVER}/api/profiles/${profile.id}/cards`)).json();
  const card = deck.find((c) => c.kind === "line" && c.line === line);
  if (!card) throw new Error(`no listening card for "${line}"`);
  return `TV: "${toast}"; ${profile.name}'s deck has "${line}"`;
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
      await page.waitForFunction((prev) => {
        const t = document.querySelector(".line-card .line")?.textContent;
        return t && t !== "…" && t !== prev;
      }, text, { timeout: 15_000 });
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
