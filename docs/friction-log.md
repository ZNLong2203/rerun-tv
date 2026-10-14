# Friction log

Written while building Rerun for the Build, Ship, Shape hackathon, in the order things happened. Every entry is something
we actually hit, with what we tried and what would have helped.

**Environment:** macOS 27.0.1 on Apple Silicon (arm64), Node 22.18, Homebrew 7.0.9, VS Code. Building from Vietnam on a
home connection that measured ~160–300 KB/s to both Amazon's SDK host and Blender's CDN.

**Severity scale:** S0 delight · S1 nit · S2 minor (< 15 min lost) · S3 major (> 1 h lost) · S4 blocker.

| ID | Product | Task | Severity | Time lost | Status |
|---|---|---|---|---|---|
| FL-001 | Vega docs | Read the install guide with an AI assistant | S2 | ~10 min | Worked around |
| FL-002 | Vega SDK installer | Install without prompts | S1 | ~5 min | Worked around |
| FL-003 | Vega SDK installer | Download SDK 0.24 on a slow link | S3 | ~1.5 h | Retried |
| FL-004 | W3C media (URL mode) | Play an MP4 from the dev server | S3 | ~2 h | Worked around |
| FL-005 | W3C media (URL mode) | Play an MP4 from a path without an extension | S2 | ~20 min | Fixed |
| FL-006 | Vega Virtual Device | Keep a playing app alive after the VVD sat idle | S3 | ~1 h | Worked around |
| FL-007 | Automation toolkit | Screenshot the player while a video surface exists | S2 | ~20 min | Avoided |
| FL-008 | React Native for Vega | Lay out a 1080p design | S2 | ~15 min | Fixed |
| FL-009 | Vega focus engine | Move Down from a full-width card to the first tile | S1 | ~10 min | Fixed |
| FL-010 | react-native-kepler | Pause on OK with `useTVEventHandler` | S2 | ~45 min | Fixed |
| FL-011 | react-native-kepler | Keep a `useTVEventHandler` subscription stable | S1 | ~10 min | Fixed |
| FL-012 | Automation toolkit | Screenshot right after a UI change | S2 | ~30 min | Worked around |

---

## FL-001: The install guide's commands disappear when the page is read as text

- **Product / version:** Vega docs, `docs/vega/0.24/install-vega-sdk.html`
- **Task attempted:** Have an AI coding assistant read the install page and run the steps (the hackathon page encourages
  using AI tools to prototype).
- **Steps taken:** 1. Fetched the page through a text/markdown reader. 2. Read the "Install the Vega CLI" section.
- **Expected:** The commands (`brew install …`, the `get_vvm.sh` one-liner, `vega --version`).
- **Actual:** Every code block was empty in the text rendering; the prose said "Run the installation script:" followed
  by nothing. Only the raw HTML's `<pre>` elements had the commands.
- **Severity:** S2 — **Time lost:** ~10 minutes.
- **Workaround:** Downloaded the raw HTML and extracted the `<pre>` blocks.
- **Actionable suggestion:** Publish a Markdown twin of each docs page (or an `llms.txt` index) so assistants — including
  the Amazon Devices Builder Tools MCP server — get the commands verbatim. Rendering code blocks as real `<pre><code>`
  text rather than script-populated widgets would also fix plain readers.

## FL-002: `NONINTERACTIVE=true` skips the VS Code extension even when VS Code is installed

- **Product / version:** `get_vvm.sh` (Vega CLI 1.4.4 installer)
- **Task attempted:** Install the CLI, SDK and Vega Studio without answering prompts (scripted setup).
- **Steps taken:** Read the script, found `NONINTERACTIVE`, ran `NONINTERACTIVE=true bash get_vvm.sh`.
- **Expected:** Defaults applied, the same as pressing Enter at every prompt (which installs Vega Studio).
- **Actual:** In non-interactive mode the extension answer is hard-coded to "no", so Vega Studio is skipped silently even
  though VS Code was found. The interactive default is "yes", so the two modes disagree.
- **Severity:** S1 — **Time lost:** ~5 minutes reading the script.
- **Workaround:** Install the extension separately later.
- **Actionable suggestion:** Make non-interactive mode take the interactive defaults, and document the variables
  (`NONINTERACTIVE`, install dir) on the install page, e.g. `NONINTERACTIVE=true VEGA_INSTALL_VSCODE_EXTENSION=yes`.

## FL-003: The SDK download shows no size or progress and cannot resume

- **Product / version:** `vega sdk install 0.24.12112` (called by the installer)
- **Task attempted:** Download the SDK (with the Vega Virtual Device) on a slow connection.
- **Steps taken:** Ran the installer at 17:08 local time. The log stops at `starting download request for
  main@0.24.12112 KeplerSDK`. Measured progress by watching the size of `$TMPDIR/kepler-install-*/installer.tmp`.
- **Expected:** Total size, a progress bar or percentage, and an ETA — and the ability to resume if the connection drops.
- **Actual:** No size, no progress, no ETA. ~20 MB per minute here. Nothing in the docs says how large the SDK is
  (only "20 GB available" disk space), so we could not plan the day around it.
- **Severity:** S3 — the SDK is on the critical path; everything else had to be built "blind" while it downloaded.
- **Workaround:** Built the server, phone companion and shared library first; paused other downloads to give the SDK
  the bandwidth.
- **Actionable suggestion:** Print the download size and progress in `vega sdk install`; support resuming
  (`Range` requests on the presigned URL); state the download size on the install page; consider a regional CDN.

**Update (same evening):** the first `vega sdk install` died at ~700 MB with `read tcp …: can't assign requested
address` and deleted its partial download, so it started over. The rerun reported progress through `--status-fd`
(the total turned out to be 883 MB for the SDK plus 923 MB for the simulator) — that information exists, it just is
not shown by default.

## FL-004: Cleartext HTTP video sources fail with "source not supported", before any request is made

- **Product / version:** `@amazon-devices/react-native-w3cmedia` ~2.3.2, URL mode, on the Vega Virtual Device (SDK 0.24.12112)
- **Task attempted:** Play the film from the Rerun dev server on the Mac (`http://<lan-ip>:8787/media/…/video.mp4`,
  and through `vega device start-port-forwarding --forward false` as `http://127.0.0.1:8787/…`).
- **Steps taken:** 1. Confirmed the server answers byte ranges correctly (206, `Content-Range`, `ftyp isom`).
  2. Re-encoded to H.264 Main@3.1, 1280×720, AAC 48 kHz in case of a codec issue. 3. Logged every request the
  server received. 4. Pointed the same player code at an HTTPS copy of the same film.
- **Expected:** Playback, or an error naming the reason.
- **Actual:** `error` event with `MediaError.code === 4` (`MEDIA_ERR_SRC_NOT_SUPPORTED`) and no message. The server
  never saw a request for the video. The HTTPS copy played at once with identical code.
- **Severity:** S3 — **Time lost:** ~2 hours, most of it ruling out codecs and the container.
- **Workaround:** Titles carry an HTTPS `streamUrl`; the server hands the TV whichever URL to play.
- **Actionable suggestion:** Put the reason in `MediaError.message` (e.g. "cleartext HTTP is not allowed for media
  sources"), log it under `W3CMEDIA`, and document the rule — plus how to allow a dev server — on the media player
  page. A local dev server is the first thing most people will try.

## FL-005: A source URL without a file extension is rejected

- **Product / version:** W3C media URL mode, same as above.
- **Task attempted:** Play `…/media/tears-of-steel/video` (served as `Content-Type: video/mp4`).
- **Actual:** `MEDIA_ERR_SRC_NOT_SUPPORTED` without fetching anything; adding `.mp4` to the path changed the behaviour.
- **Severity:** S2 — **Time lost:** ~20 minutes.
- **Actionable suggestion:** Sniff the content type (the pipeline already logs `typefinder Found MP4 content`), or
  document that URL mode chooses the demuxer from the extension.

## FL-006: After the VVD sits idle, launched apps time out "Creating surfaces" and video apps are killed as ANR

- **Product / version:** Vega Virtual Device, SDK 0.24.12112, macOS arm64.
- **Task attempted:** Play video in our app ~2 hours after starting the VVD.
- **Steps taken:** Collected ACRs with `vega device copy-logs --artifact SYSTEM_TOMBSTONE/acr` and streamed logs with
  `vega device start-log-stream`. Rebuilt the unmodified `helloWorld` template to compare.
- **Expected:** The app launches and plays as it did earlier in the session.
- **Actual:** `lcm-transition-monitor: Transition timed out - appInst[…]: Creating surfaces` 16 s after every launch
  (the template too), `splashservice … Display width 0 height 0`, then `Surface present is rejected as application is
  in background` and an ACR with `CrashReason: AppNotResponding`, `LCM_ANR_REASON: Lifecycle Callback`,
  `Screen: Off`. Apps without video stay on screen, so the problem only shows up when playback starts — and the crash
  report blames the app.
- **Severity:** S3 — **Time lost:** ~1 hour.
- **Workaround:** `vega virtual-device stop` / `start`, then redo the port forwards.
- **Actionable suggestion:** Keep the VVD display awake while it is running (or wake it on `launch-app`), and when an
  ANR is caused by the display being off, say so in the ACR instead of `AppNotResponding`.

## FL-007: `takeScreenshot` hangs, and the playing app is killed, when a video surface is on screen

- **Product / version:** Automation toolkit JSON-RPC on the VVD (`takeScreenshot`), `gwsi-tool-screenshooter`.
- **Task attempted:** Screenshot the player for testing and for the README.
- **Actual:** The JSON-RPC call never returns while `KeplerVideoSurfaceView` exists, the video stalls
  (`No Time update even in Playing state`), and the app is eventually reported as not responding.
  `gwsi-tool-screenshooter` on the device writes a 0-byte file and hangs. Screens without video capture fine.
- **Severity:** S2 — **Time lost:** ~20 minutes.
- **Workaround:** Verify the player through the pairing room (the TV reports the line on screen) and record the demo
  with a screen recorder.
- **Actionable suggestion:** Return an error (or a frame with the video plane blacked out) instead of blocking.

## FL-008: The 1080p template is laid out in 960-wide units, which the docs do not say

- **Product / version:** React Native for Vega 0.83 template (`helloWorld`).
- **Actual:** A design built at 1920×1080 rendered at twice the intended size; `Dimensions.get("window").width` is 960
  on the 1080p VVD. The UI tree reports 1920 wide, so the two disagree.
- **Workaround:** A `dp()` helper scales design pixels by `window.width / 1920`.
- **Actionable suggestion:** State the layout unit and the design canvas in the template's README or the UX
  guidelines, as Android TV docs do for dp.

## FL-009: Down from a full-width card skips to the nearest tile, not the first

- **Product / version:** Vega focus engine (Cartesian).
- **Actual:** From the full-width Daily Rerun card, Down landed on the "Pair your phone" tile in the middle of the row
  instead of the first film. Expected from the docs' description of edge overlap, but surprising in practice.
- **Fix:** Wrap the row in `TVFocusGuideView autoFocus` (from `@amazon-devices/react-native-kepler`).
- **Delight (S0):** The Amazon Devices Builder Tools agent skill `rn-tv-ui-best-practices` flagged, before we ran
  anything, that `useTVEventHandler` must come from `react-native-kepler` and that `manifest.toml` needs
  `com.amazon.inputd.service` or remote events never fire. That saved a silent failure.

## FL-010: The OK key from a keyboard arrives as `enter`, while the type docs promise `select`

- **Product / version:** `@amazon-devices/react-native-kepler` ~4.0.0, `useTVEventHandler`, VVD.
- **Task attempted:** Pause the film on OK while nothing on screen has focus.
- **Expected:** `TVTypes.d.ts` documents `select - This event is received when the RETURN DPaD control is triggered.`
- **Actual:** RETURN (`KEY_ENTER`, what a keyboard and the automation toolkit send) arrives as `eventType: "enter"`; our
  handler only knew `"select"`, so OK did nothing in the player while it still activated focused buttons elsewhere —
  which made it look intermittent. Found by putting every event on screen.
- **Severity:** S2 — **Time lost:** ~45 minutes.
- **Fix:** Treat `"enter"` like `"select"` (`packages/core/src/remote.ts`).
- **Actionable suggestion:** List the real `eventType` values per input device in the docs (remote, keyboard,
  injected), and correct the `select` comment in `TVTypes.d.ts`.

## FL-011: `useTVEventHandler` re-subscribes whenever the handler's identity changes

- **Actual:** The hook's effect depends on the handler, so the natural inline arrow function unsubscribes and
  resubscribes on every render — here, every time the subtitle line changed. Not broken, but presses that land during
  the swap can be lost, and nothing in the docs says to memoise the handler.
- **Fix:** One `useCallback` handler that reads the latest state through refs.
- **Actionable suggestion:** Keep the latest handler in a ref inside the hook (as many React event hooks do), or
  say "memoise the handler" in the docs and samples.

## FL-012: `takeScreenshot` can return the frame from before the last change

- **Product / version:** Automation toolkit JSON-RPC on the VVD.
- **Actual:** A capture taken 1–3 s after a key press sometimes shows the screen as it was before the press (we
  chased a "missing pause overlay" that was actually there). A second capture right after shows the current frame.
  Separately, once a video surface has played, `takeScreenshot` blocks for every screen until the VVD restarts.
- **Workaround:** `scripts/gallery.mjs` captures twice and keeps the second; screenshots are taken in still mode only.
- **Actionable suggestion:** Capture the current composition on demand, or document that the result is the last
  presented frame.
