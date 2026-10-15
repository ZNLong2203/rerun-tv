/**
 * Where the Rerun server lives, as seen from the TV.
 *
 * The Vega Virtual Device is a QEMU machine whose user-mode network always
 * reaches the computer at 10.0.2.2, whatever network the computer is on and
 * without port forwarding. A real Fire TV uses the computer's LAN address
 * instead (the server prints it), e.g. "http://192.168.1.20:8787". Video
 * comes over HTTPS from the title's streamUrl either way.
 */
export const SERVER_URL = "http://10.0.2.2:8787";

/** How often the player reads the playhead to move subtitles, in ms. */
export const PLAYHEAD_POLL_MS = 100;

/** Show every remote event on screen (eventType/eventKeyAction) while testing. */
export const DEBUG_KEYS = false;
