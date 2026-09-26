# Claude Profiles

[![CI](https://github.com/shahrukhkhan007/claude-profiles/actions/workflows/ci.yml/badge.svg)](https://github.com/shahrukhkhan007/claude-profiles/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Run several separate **Claude Desktop logins** side by side on one machine — like
browser profiles, but for Claude. Add a profile, give it a name (and an icon),
and launch it. Your work and personal logins stay signed in at the same time.

Claude Profiles works on your **already-installed** Claude — it never bundles or
redistributes Anthropic's app, and it never touches your conversations.

---

## Install

You don't need Node, a terminal, or any developer setup to use Claude Profiles —
just download the installer for your OS.

> **Requirement:** [Claude Desktop](https://claude.ai/download) must already be
> installed. Claude Profiles launches *your* Claude; it doesn't ship its own.

### macOS

1. Download **`Claude Profiles-<version>.dmg`** from the
   [**Releases**](https://github.com/shahrukhkhan007/claude-profiles/releases) page.
2. Open the `.dmg` and drag **Claude Profiles** into **Applications**.
3. The app isn't notarized yet, so the first time you open it macOS will warn that
   it's from an unidentified developer. To allow it: **right-click the app →
   Open → Open**, or go to **System Settings → Privacy & Security** and click
   **Open Anyway**. You only do this once.
4. When you launch a **Custom** profile the first time, macOS may ask to use
   "Claude Safe Storage" from your keychain — click **Always Allow**. It's your
   own Claude data on your own machine.

### Windows

1. Download the **`.exe`** installer from [Releases](https://github.com/shahrukhkhan007/claude-profiles/releases) and run it.
2. SmartScreen may warn about an unknown publisher (the build isn't signed yet) —
   click **More info → Run anyway**.

### Linux

Download from [Releases](https://github.com/shahrukhkhan007/claude-profiles/releases):

- **AppImage** — `chmod +x 'Claude Profiles-<version>.AppImage'` then run it.
- **.deb** — `sudo dpkg -i 'claude-profiles_<version>_amd64.deb'`.

> **No prebuilt release yet?** Until installers are published on the Releases
> page, you can build your own in one command — see
> [Build the installer yourself](#build-the-installer-yourself) below.

---

## Using it

The app has two tabs — the tab you're in decides how a profile is created, so
there are no confusing toggles:

- **Quick Launch** — the lightweight way. Each profile is the normal Claude app
  pointed at its own data folder. Instant, and it auto-updates with Claude. On
  macOS these share the same Dock icon.
- **Custom** — each profile gets its **own name and icon** in the Dock. On macOS
  this is a renamed copy of Claude so the icon can differ; on Windows and Linux
  it's a shortcut, so custom icons and auto-update both work with no trade-off.

Add a profile with **+ Add**, pick a colour or an image, and **Launch**. Each
profile keeps a completely separate login, history, and settings.

---

## Build the installer yourself

If you'd rather build the DMG / installer from source (or there's no release for
your platform yet):

**Prerequisites:** [Node.js 20+](https://nodejs.org) and
[pnpm 10](https://pnpm.io/installation) (`npm install -g pnpm`).

```bash
git clone https://github.com/shahrukhkhan007/claude-profiles.git
cd claude-profiles
pnpm install

pnpm dist:mac      # → release/Claude Profiles-<version>.dmg
pnpm dist:win      # → release/  (.exe)   — build on Windows
pnpm dist:linux    # → release/  (.AppImage, .deb)
```

The finished installer lands in the **`release/`** folder. On macOS, an unsigned
local build skips code signing automatically; if you hit a signing error, prefix
the command with `CSC_IDENTITY_AUTO_DISCOVERY=false`.

---

## Develop

To run the app from source with hot reload:

```bash
pnpm install
pnpm dev          # Vite + Electron with live reload
```

Other scripts: `pnpm build` (bundle the UI), `pnpm test` (unit tests),
`pnpm lint`, `pnpm e2e` (Playwright).

## How it works

Each profile is just Claude launched with its own `--user-data-dir`, so it keeps
a separate login, history, and settings. The app records your profiles in
`~/.claude-profiles/profiles.json` and reads live status (running / stopped)
from the OS. It never touches your conversations or your main Claude data.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full design and
[`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the per-OS implementation details.

## A note on safety

Claude Profiles operates only on **your already-installed Claude** — it never
bundles or redistributes Anthropic's app. It reads your local files and creates
separate data folders; it never modifies your conversations.

## License

[MIT](LICENSE)
