#!/usr/bin/env node
/**
 * Autopilot for recording the demo video: plays the video script's scenes on
 * the TV (Vega Virtual Device) and on a phone window beside it, slowly enough
 * to talk over. Record the screen while it runs.
 *
 *   node scripts/demo.mjs                   every scene, paced for narration
 *   node scripts/demo.mjs --step            wait for Enter before each scene
 *   node scripts/demo.mjs --pace 1.3        30% slower (0.8 for faster)
 *   node scripts/demo.mjs --stand-in-voice  the phone "hears" the line instead of the microphone
 *   node scripts/demo.mjs --phone-at 1400,60  where the phone window opens on screen
 *   node scripts/demo.mjs --record <dir>    headless phone, recorded to <dir> with a scene timeline
 *                                           (pair it with a recording of the TV for the video)
 *
 * Start from a fresh household with the server on DEBUG_ROOMS=1 and the TV
 * app just launched on "Who's learning tonight?" (docs/run-on-vega.md).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { log, openPhone, press, sleep, tvTexts } from "./lib/e2e.mjs";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const pace = Number(option("--pace") ?? 1);
const stepping = args.includes("--step");
const standInVoice = args.includes("--stand-in-voice");
const recordDir = option("--record");
if (recordDir) mkdirSync(recordDir, { recursive: true });

/** Leave the screen alone for a while, scaled by --pace. */
const hold = (seconds) => sleep(seconds * pace * 1000);
const showing = async (text) => (await tvTexts()).some((t) => t.includes(text));

if (!(await showing("Who's learning tonight?"))) {
  console.error("Open Rerun on the TV first: the demo starts on \"Who's learning tonight?\".");
  process.exit(1);
}
const { browser, context, page: phone, openedAt } = await openPhone({
  standInVoice,
  position: option("--phone-at"),
  headless: Boolean(recordDir),
  recordVideoDir: recordDir,
});
const tab = (name) => phone.locator("nav.tabs button", { hasText: name }).click();
/** The line on the TV, as the phone shows it. */
const line = async () => (await phone.locator(".line-card .line").first().textContent().catch(() => "")) ?? "";
/** ▶ until the TV is on the line that matches: timing alone drifts. */
async function nextUntil(pattern) {
  for (let i = 0; i < 10 && !pattern.test(await line()); i++) {
    await press("right");
    await sleep(900);
  }
  if (!pattern.test(await line())) throw new Error(`never reached the line ${pattern}`);
}

const scenes = [
  [
    "Who's learning tonight?",
    async () => {
      await hold(3);
      await press("select"); // Camille
      await hold(4); // how hard the film is for her
    },
  ],
  [
    "Watching with the remote",
    async () => {
      await press("down", "select"); // the film
      await hold(5);
      await nextUntil(/jerk, Thom/); // ▶ the first line
      await hold(3);
      await nextUntil(/follow our passions/); // ▶ the next one
      await sleep(1800); // past the first 1.2 s, so ◀ restarts this line rather than going back one
      await press("left"); // ◀ again — and it comes back in the Daily Rerun
      await hold(4.5);
      await nextUntil(/freaked out by my robot hand/);
      await hold(1.5);
    },
  ],
  [
    "A word, in this scene",
    async () => {
      await press("up"); // word mode: the film pauses
      await hold(2.5);
      await press("select"); // the card: what it means here, in French
      await hold(5);
      await press("select"); // save — it is on the phone
      await hold(1);
      await tab("Words");
      await hold(4);
      await tab("Now");
    },
  ],
  [
    "Say it back",
    async () => {
      await press("back", "back"); // close the card, back to the film
      await phone.getByRole("button", { name: "Replay line" }).click(); // hear it once more
      await sleep(2500); // most of the line, then the microphone pauses the film on it
      await phone.getByRole("button", { name: /Tap, then say the line/ }).click();
      log(standInVoice ? "the stand-in says the line" : ">>> SAY THE LINE NOW <<<");
      try {
        await phone.locator(".result .score span").waitFor({ timeout: 20_000 });
        await hold(4); // the score on the phone, and on the TV
      } catch {
        // Keep the take going: this scene can be shot again on a real phone.
        log("no speech heard — carrying on (try --stand-in-voice, or film this scene on a phone)");
      }
    },
  ],
  [
    "Watch together",
    async () => {
      await press("back"); // leave the film
      await hold(1.5);
      await press("back"); // who's learning
      await hold(1.5);
      await press("down", "select"); // 👥 Watch together
      await hold(1);
      await press("select", "right", "select", "right", "select"); // Camille, Hugo, Ana
      await hold(2);
      await press("down", "select");
      await hold(4); // one film, three levels
      await press("down", "select");
      await hold(5);
      await nextUntil(/robotics, and I just want to be awesome/);
      await hold(5); // everyone's words in their colour, French and Spanish
      await press("up", "select"); // one card, a save button per person
      await hold(5);
      await press("back", "back", "back");
    },
  ],
  [
    "Daily Rerun",
    async () => {
      await hold(1.5);
      await press("back"); // who's learning
      await hold(1.5);
      await press("select"); // Camille: the Daily Rerun has focus
      await hold(3);
      await press("select");
      await hold(4); // the clip plays: what does "jerk" mean here?
      await press("select"); // show meaning
      await hold(3.5);
      await press("select"); // knew it
      // Through the word cards to a line heard again.
      for (let i = 0; i < 8 && !(await showing("What did they say?")); i++) {
        await hold(1.5);
        await press("select", "select");
      }
      await hold(5); // the clip plays with the text hidden
      await press("select"); // show the line
      await hold(4);
      await press("select");
      await hold(2);
    },
  ],
];

const timeline = [];
const rl = stepping ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
for (const [i, [name, play]] of scenes.entries()) {
  if (rl) await rl.question(`\nScene ${i + 1}/${scenes.length}: ${name} — Enter to play `);
  log(`scene ${i + 1}: ${name}`);
  timeline.push({ scene: i + 1, name, startMs: Date.now() });
  await play();
}
rl?.close();
const endMs = Date.now();
log("demo finished");
await context.close(); // finishes the phone video
if (recordDir) {
  const phoneVideo = await phone.video()?.path();
  writeFileSync(join(recordDir, "timeline.json"), JSON.stringify({ phoneVideo, phoneStartMs: openedAt, scenes: timeline, endMs }, null, 2));
  log(`timeline and phone video in ${recordDir}`);
}
await browser.close();
