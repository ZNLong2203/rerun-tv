# Product feedback

Feedback on every Amazon tool, API and SDK Rerun uses, written while building it. Entry numbers (FL-…) refer to the
[friction log](friction-log.md), which has the steps, evidence and workarounds.

## Vega SDK, CLI and Vega Virtual Device (SDK 0.24.12112, CLI 1.4.4)

**Used for:** building, packaging and installing the Fire TV app (`react-native build-vega`, `vega run-app`), the
virtual device we developed and recorded on, port forwarding, log streaming, crash reports.

**What worked well**
- The CLI is coherent and scriptable: `vega device run-cmd`, `start-log-stream`, `copy-logs --artifact
  SYSTEM_TOMBSTONE/acr` and `start-port-forwarding` (both directions) gave us everything we needed to debug without
  a physical device.
- `vega project generate --template helloWorld` produced a project that built first time, and `vega project install`
  picked an OS-compatible version of `react-native-w3cmedia` for us.
- Builds are quick (about a minute) and the manifest validator's messages are clear.
- The VVD on Apple Silicon is fast once running, and logs from the media stack (`W3CMEDIA`, `MEDIA_PLAYER`) are
  detailed enough to see the pipeline choose `souphttpsrc` and `hw_h264`.

**What needs work**
- The SDK download shows no size or progress and cannot resume; a dropped connection after ~700 MB started over
  (FL-003). `--status-fd` already has the data — show it by default.
- When the VVD has been idle, launches time out "Creating surfaces" and video apps are killed with an ACR that blames
  the app (`AppNotResponding`) while the real cause is the virtual display being off (FL-006). This cost us the most
  time of anything in the hackathon.
- The docs never say the layout canvas is 960 units wide at 1080p (FL-008).

**Onboarding:** good once installed; the install itself was the hardest part (FL-001…003). **Would build again:** yes.

## React Native for Vega (`@amazon-devices/react-native-kepler` ~4.0, RN 0.83)

**Used for:** the whole TV app — focus, the remote (`useTVEventHandler`, `BackHandler`), `TVFocusGuideView`,
`usePreventHideSplashScreen` / `useHideSplashScreenCallback`.

**What worked well**
- Standard React Native and TypeScript: our shared TypeScript packages bundled with Metro unchanged.
- `TVFocusGuideView autoFocus` fixed a real focus problem in one line (FL-009).
- `hasTVPreferredFocus` is predictable once you know it applies on mount only.

**What needs work**
- The `select` key type is documented for RETURN, but KEY_ENTER arrives as `"enter"` (FL-010).
- `useTVEventHandler` re-subscribes on every new handler identity (FL-011).
- A template app that never hides the splash screen still runs, so it is easy to miss that the launch transition is
  waiting on it; the helloWorld template could show the splash hooks.

**Would build again:** yes.

## W3C Media for Vega (`@amazon-devices/react-native-w3cmedia` ~2.3)

**Used for:** playing the film, seeking line by line (◀ ▶), auto-pause after each line, and replaying a single line in
the Daily Rerun.

**What worked well:** familiar `HTMLMediaElement` API (`currentTime`, `play`, `pause`, events); seeking a progressive
MP4 over HTTPS was quick enough to jump line to line (~2.5 s).

**What needs work**
- Cleartext HTTP sources and extension-less paths fail with `MEDIA_ERR_SRC_NOT_SUPPORTED` and an empty message, before
  any request (FL-004, FL-005). A message naming the rule would have saved two hours.

**Would build again:** yes.

## Automation toolkit (JSON-RPC on the VVD)

**Used for:** driving the app from scripts — our on-device smoke test (`scripts/smoke-vvd.mjs`) and the screenshots in
this repo (`scripts/gallery.mjs`), via `injectInputKeyEvent`, `takeScreenshot` and `getPageSource`.

**What worked well:** once enabled it is a clean JSON-RPC API that needs no Appium install; keys and the UI tree are
reliable.

**What needs work:** method names and parameter shapes are only discoverable through the Appium docs and trial
(`inputKeyEvent` must be a string); `takeScreenshot` can return the previous frame and blocks once a video surface
has played (FL-007, FL-012). Documenting the JSON-RPC methods directly would make it a great tool for CI.

## Amazon Devices Builder Tools — agent skills (`AmazonAppDev/devices-agent-skills`)

**Used for:** reviewing our focus and input code while writing it.

**What worked well (S0 delight):** `rn-tv-ui-best-practices` told us before the first build that remote events need
`com.amazon.inputd.service` in the manifest and that the TV APIs come from `react-native-kepler` — exactly the silent
failures that are hardest to debug.

**What needs work:** it says it covers SDK 0.22 / RN 0.72 while the hackathon template is 0.24 / RN 0.83.

## Amazon Developer docs (Vega 0.24)

**What worked well:** the media player and focus pages are thorough; release notes are easy to find.
**What needs work:** code blocks vanish in text renderers, so AI assistants (which the hackathon encourages) cannot
read install commands (FL-001); a Markdown twin or `llms.txt` would fix it.

## Gemini API (`gemini-3.8-flash`, `@google/genai`)

**Used for:** preparing each film — choosing what is worth learning in every line and writing in-context notes and
translations in nine languages, as JSON validated against our schema; and live "what does this line mean?" answers.
**What worked well:** structured output with `responseJsonSchema` kept 76 lines × 9 languages schema-valid on the
first run; 45 expressions, 0 anchoring failures; translations scored 52–72 chrF against the film's human subtitles.

## Feature requests

| Request | Why | Urgency |
|---|---|---|
| Resumable SDK downloads with visible progress | Slow or flaky connections outside the US restart from zero | Critical |
| Keep the VVD display awake, or say "display off" in ANR reports | Video apps die after the VVD idles, with a misleading crash reason | Critical |
| A reason in `MediaError.message`, and documented source rules (HTTPS, extension) | Two hours lost to a silent `SRC_NOT_SUPPORTED` | Important |
| Speech recognition API for apps on Vega | Rerun's speaking practice has to run on the phone today | Important |
| Documented automation-toolkit JSON-RPC methods, and screenshots that work with video | On-device tests and store screenshots in CI | Important |
| `eventType` reference per input device | `enter` vs `select` surprises | Nice to have |
| A captions-track API that lets apps style individual words | Learner subtitles could ride on the platform's caption track | Nice to have |
