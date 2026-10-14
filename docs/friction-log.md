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
| FL-003 | Vega SDK installer | Download SDK 0.24 on a slow link | S3 | hours (background) | Waited |

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
