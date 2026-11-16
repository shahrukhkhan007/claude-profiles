# Contributing to Claude Profiles

Thanks for your interest in Claude Profiles! This file is for **developers** —
building from source, running the app locally, and contributing changes. If you
just want to *install and use* the app, see the [README](README.md).

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [pnpm 10](https://pnpm.io/installation) — `npm install -g pnpm`
- [Claude Desktop](https://claude.ai/download) installed (the app drives your
  existing Claude)

## Getting started

```bash
git clone https://github.com/shahrukhkhan007/claude-profiles.git
cd claude-profiles
pnpm install
pnpm dev          # Vite + Electron with hot reload
```

- The **engine** (`engine/`) is plain Node with no UI — the cross-platform logic
  lives here and is the easiest place to start.
- The **app shell** is Electron (`electron/`) plus a React renderer (`src/`).

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app from source with hot reload |
| `pnpm build` | Bundle the renderer (Vite) into `dist/` |
| `pnpm test` | Unit tests (engine, store, platform) |
| `pnpm lint` | ESLint (JSX-aware) |
| `pnpm e2e` | Playwright end-to-end test of the Electron app |
| `pnpm format` | Prettier |

## Building an installer locally

This produces a real, double-clickable installer you can test or hand to
someone. **You can only build for the OS you're on** (a Mac builds the macOS
`.dmg`, a Windows machine builds the `.exe`, etc.) — electron-builder packages
native binaries, so there's no cross-building.

**Steps:**

1. Install dependencies once: `pnpm install`
2. Run the one command for your OS:

   ```bash
   pnpm dist:mac      # macOS   → release/Claude Profiles-<version>-arm64.dmg
   pnpm dist:win      # Windows → release/Claude Profiles Setup <version>.exe
   pnpm dist:linux    # Linux   → release/Claude Profiles-<version>.AppImage  (+ .deb)
   ```

   Each command runs `vite build` (bundles the renderer into `dist/`) and then
   `electron-builder` (packages the app). It takes a minute or two.

3. **Find the installer in the `release/` folder** (this is the output directory,
   set by `build.directories.output` in `package.json`). The file you want is the
   `.dmg` / `.exe` / `.AppImage` — that's what you install or share. Everything
   else in `release/` (`.blockmap`, `latest-*.yml`, the `mac-arm64/` unpacked app)
   is electron-builder's supporting output and can be ignored.

4. **Test it:** open the `.dmg` and drag the app to Applications (macOS), or run
   the `.exe` / `.AppImage`. On first launch macOS shows a one-time
   "unidentified developer" prompt (see below) — right-click the app → **Open**.

> **Which command do I run?** On a Mac, it's **`pnpm dist:mac`**, and the result
> is **`release/Claude Profiles-<version>-arm64.dmg`**. That single `.dmg` is the
> whole app.

Builds are **unsigned** (no Apple/Windows certificate), which is fine for
open-source distribution — users get a one-time "unidentified developer" prompt.
On macOS an unsigned local build skips code signing automatically. The `release/`
folder is git-ignored, so build output never gets committed.

## Releasing

Releases are automated. Push a version tag and CI builds and publishes the
installers for all three platforms to the GitHub Releases page:

```bash
git tag v0.1.0
git push origin v0.1.0
```

See [`.github/workflows/release.yml`](.github/workflows/release.yml).

## Deeper docs

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full design and
[`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the per-OS implementation details.

## Guidelines

- Keep the engine free of Electron/React imports so it stays testable on its own.
- Never redistribute Anthropic's Claude app; the tool operates on the user's
  installed copy only.
- Never read, move, or modify a user's conversation transcripts.
- Open an issue before a large change so we can align on approach.

## Pull requests

Small, focused PRs are easiest to review. Describe what you changed and how you
tested it, on which OS.

## Quality gates

Every PR runs in CI and must pass before it can merge into `main`:

- `pnpm lint` — ESLint (JSX-aware)
- `pnpm test` — unit tests (engine launch logic, store CRUD, platform + update detection)
- `pnpm e2e` — Playwright end-to-end test of the Electron app (needs a display; CI uses `xvfb`)
- `pnpm build` — renderer build on macOS / Windows / Linux
- CodeQL, gitleaks (secret scan), and a dependency audit

Tests run against an isolated temp `HOME` and a `CP_TEST` mode, so they never
launch the real Claude app. Run `pnpm format` (Prettier) before committing.
