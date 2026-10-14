# Run Rerun on the Vega Virtual Device

Tested with Vega SDK 0.24.12112 (CLI 1.4.4) on macOS 27 / Apple Silicon. Commands assume `~/vega/bin` is on `PATH`.

## 1. Install the SDK

```bash
brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
vega --version          # Active SDK Version: 0.24.12112
```

The SDK and simulator are ~1.8 GB together. If the download stops, run `vega sdk install --status-fd 3 3>progress.log`
to see progress; it does not resume, so a dropped connection starts over (see the friction log).

## 2. Start the server and the simulator

```bash
npm ci
scripts/prepare-media.sh tears-of-steel     # local MP4 + poster
npm run build -w @rerun/phone
npm run dev                                 # http://localhost:8787, prints the LAN address

vega virtual-device start
```

Point the TV app at the server: set `SERVER_URL` in `apps/tv/src/config.ts` to the LAN address the server printed
(`http://192.168.x.y:8787`). A real Fire TV on the same Wi-Fi uses the same address. For the simulator alone,
`vega device start-port-forwarding --port 8787 --forward false` also lets the app use `http://127.0.0.1:8787` for the
API.

**Video must come over HTTPS.** Vega's URL-mode player rejects cleartext HTTP sources without fetching them, so each
title can name an HTTPS copy in `content/<id>/meta.json` → `video.streamUrl`, and the server hands that URL to the TV.
Tears of Steel points at Blender's own copy (`download.blender.org`, 1280×534 H.264 in a `.mov` with MP3 audio,
which the player handles). To play the local MP4 instead, serve the server over HTTPS (any tunnel) and set
`PUBLIC_URL`; the server then hands out `PUBLIC_URL/media/<id>/video.mp4`.

## 3. Build, install, launch

```bash
cd apps/tv
npm ci
npm run build:debug
vega run-app build/aarch64-debug/tv_aarch64.vpkg com.rerun.tv.main
```

The VVD is aarch64 on Apple Silicon; use `build/x86_64-debug/…` on an Intel Linux host.

If apps launch but get killed after ~16 s with an ANR ("Creating surfaces" timed out), the VVD's display has gone to
sleep: `vega virtual-device stop && vega virtual-device start`, then redo the port forwards.

## 4. Drive it from the terminal

The on-device automation toolkit accepts remote keys and screenshots over JSON-RPC:

```bash
vega exec vda shell "touch /tmp/automation-toolkit.enable"
vega device start-port-forwarding --port 8383 --forward true

node scripts/vvd.mjs keys select,down,select    # pick a profile, open the film
node scripts/vvd.mjs shot home.png              # works on screens without video
```

`takeScreenshot` blocks while a video surface is on screen, so the player is checked through its pairing room instead:

```bash
DEBUG_ROOMS=1 npm run dev                       # lets the test find the TV's room
node scripts/smoke-vvd.mjs                      # saves a word on the TV, expects it on the "phone"
```

## Remote

| Key | Watching | Word mode | Card |
|---|---|---|---|
| ◀ | Hear the line again (quickly twice: the line before) | Previous word | — |
| ▶ | Next line | Next word | — |
| ▲ | Word mode (pauses) | — | — |
| ▼ | Translation on/off | Back to the film | — |
| OK | Play / pause | Open the card | Save / hear again / I know this |
| ☰ | Auto-pause after every line | — | — |
| BACK | Leave the film | Back to the film | Close the card |
