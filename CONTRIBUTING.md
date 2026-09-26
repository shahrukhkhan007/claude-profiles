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

## Building the installers

```bash
pnpm dist:mac      # → release/  (.dmg, Apple Silicon)
pnpm dist:win      # → release/  (.exe)  — run on Windows
pnpm dist:linux    # → release/  (.AppImage, .deb)
```

Builds are **unsigned** (no Apple/Windows certificate), which is fine for
open-source distribution — users get a one-time "unidentified developer" prompt.
On macOS an unsigned local build skips code signing automatically.

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
