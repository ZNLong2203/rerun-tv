#!/usr/bin/env node
/**
 * End-to-end smoke test on the Vega Virtual Device: drive the real TV app with
 * remote keys while listening to its pairing room like a phone would.
 *
 *   1. pick the first profile, open the first film
 *   2. wait until the TV reports a line whose first learnable word is not
 *      saved yet
 *   3. ▲ word mode, OK on that word, OK on "Save to my deck"
 *   4. pass if the phone side receives card.saved for that line
 *
 * Needs the server on :8787, the app installed and the toolkit forwarded
 * (see docs/run-on-vega.md). Usage: node scripts/smoke-vvd.mjs [timeoutSeconds]
 */

const SERVER = process.env.RERUN_SERVER ?? "http://127.0.0.1:8787";
const RPC = process.env.VVD_RPC ?? "http://127.0.0.1:8383/";
const KEYS = { up: "103", down: "108", left: "105", right: "106", select: "28", back: "158" };
const timeout = Number(process.argv[2] ?? 120) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);

async function press(...names) {
  for (const name of names) {
    await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "injectInputKeyEvent", params: { inputKeyEvent: KEYS[name], holdDuration: 0 } }),
    });
    log("key", name);
    await sleep(700);
  }
}

async function roomCode() {
  // The TV opens a room at start-up; the newest code is in the server log
  // only, so ask the server for rooms that have a TV in them.
  const res = await fetch(`${SERVER}/api/debug/rooms`).catch(() => undefined);
  if (!res?.ok) throw new Error("start the server with DEBUG_ROOMS=1 so the test can find the TV's room");
  const rooms = await res.json();
  const withTv = rooms.filter((r) => r.tv);
  if (!withTv.length) throw new Error("no TV is paired yet — is the app running?");
  return withTv.at(-1).code;
}

const code = await roomCode();
log("TV room", code);
// The first profile is the one the test picks; skip words already in its deck.
const [profile] = await (await fetch(`${SERVER}/api/profiles`)).json();
const deck = new Set((await (await fetch(`${SERVER}/api/profiles/${profile.id}/cards`)).json()).map((c) => c.itemId));
log(`profile ${profile.name}, ${deck.size} word(s) already saved`);
const ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws?room=${code}&role=phone`);
let target;
let saved;
let opened = false;

ws.onmessage = async (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "now" && m.cue) {
    log(`TV shows [${m.cue.id}] "${m.cue.text}"`);
    if (!target && opened) {
      const detail = await (await fetch(`${SERVER}/api/titles/${m.titleId}`)).json();
      const cue = detail.track.cues.find((c) => c.id === m.cue.id);
      if (cue?.items.length && !deck.has(cue.items[0].id)) {
        target = cue;
        log(`line has ${cue.items.length} learnable item(s): ${cue.items.map((i) => i.surface).join(", ")}`);
        await press("up", "select", "select");
      }
    }
  } else if (m.type === "card.saved") {
    saved = m.card;
    log(`phone received card.saved: "${m.card.surface}" — ${m.card.meaning}`);
  }
};

ws.onopen = async () => {
  await press("select"); // profile
  await sleep(2500);
  await press("down", "select"); // first film
  opened = true;
};

while (Date.now() - t0 < timeout && !saved) await sleep(500);
ws.close();
if (saved && target && saved.cueId === target.id) {
  log("PASS: saved a word from the line on screen, and the phone heard about it");
  await press("back", "back", "back");
  process.exit(0);
}
log("FAIL:", saved ? "saved a word from a different line" : "no card.saved within the timeout");
process.exit(1);
