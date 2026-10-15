/**
 * Where the Rerun server lives, as seen from the TV.
 *
 * On the Vega Virtual Device, `vega device start-port-forwarding --port 8787
 * --forward false` makes the computer's server the device's own port 8787, so
 * this keeps working when the computer changes networks. A real Fire TV uses
 * the computer's LAN address instead (the server prints it), e.g.
 * "http://192.168.1.20:8787". Video comes over HTTPS from the title's
 * streamUrl either way.
 */
export const SERVER_URL = "http://127.0.0.1:8787";

/** How often the player reads the playhead to move subtitles, in ms. */
export const PLAYHEAD_POLL_MS = 100;

/** Show every remote event on screen (eventType/eventKeyAction) while testing. */
export const DEBUG_KEYS = false;
