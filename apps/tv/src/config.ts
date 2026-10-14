/**
 * Where the Rerun server lives, as seen from the TV.
 *
 * The Vega Virtual Device reaches the Mac through its LAN address; a real
 * Fire TV on the same Wi-Fi does too. `npm run tv:server-url` rewrites this
 * line with the current LAN address (see docs/run-on-vega.md).
 */
export const SERVER_URL = "http://192.168.1.6:8787";

/** How often the player reads the playhead to move subtitles, in ms. */
export const PLAYHEAD_POLL_MS = 100;
