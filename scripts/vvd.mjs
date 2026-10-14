#!/usr/bin/env node
/**
 * Drive the Vega Virtual Device from the command line through the on-device
 * automation toolkit's JSON-RPC server: press remote keys, take screenshots,
 * dump the UI tree. Used for smoke tests and for the README screenshots.
 *
 * One-time setup (see docs/run-on-vega.md):
 *   vega exec vda shell "touch /tmp/automation-toolkit.enable"
 *   vega device start-port-forwarding --port 8383 --forward true
 *
 *   node scripts/vvd.mjs key right [times]     left|right|up|down|select|back|playpause|menu
 *   node scripts/vvd.mjs keys up,select,down   several keys, 0.6 s apart
 *   node scripts/vvd.mjs shot out.png          screenshot of the TV
 *   node scripts/vvd.mjs tree                  UI tree (XML) of the focused app
 */

import { writeFile } from "node:fs/promises";

const URL = process.env.VVD_RPC ?? "http://127.0.0.1:8383/";

// Linux input event codes, which is what injectInputKeyEvent expects.
const KEYS = {
  up: "103",
  down: "108",
  left: "105",
  right: "106",
  select: "28",
  back: "158",
  playpause: "164",
  menu: "139",
};

let id = 0;
async function rpc(method, params = {}) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function press(name) {
  const code = KEYS[name];
  if (!code) throw new Error(`unknown key "${name}" (${Object.keys(KEYS).join(", ")})`);
  await rpc("injectInputKeyEvent", { inputKeyEvent: code, holdDuration: 0 });
}

const [cmd, arg, extra] = process.argv.slice(2);
try {
  switch (cmd) {
    case "key":
      for (let i = 0; i < Number(extra ?? 1); i++) {
        await press(arg);
        await sleep(400);
      }
      break;
    case "keys":
      for (const k of arg.split(",")) {
        await press(k.trim());
        await sleep(600);
      }
      break;
    case "shot": {
      const png = await rpc("takeScreenshot");
      await writeFile(arg ?? "vvd.png", Buffer.from(png, "base64"));
      console.log(arg ?? "vvd.png");
      break;
    }
    case "tree":
      console.log(await rpc("getPageSource"));
      break;
    default:
      console.log("usage: node scripts/vvd.mjs key <name> [times] | keys a,b,c | shot <file.png> | tree");
      process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
