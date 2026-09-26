# CLAUDE.md

Guidance for AI agents (and humans) working in this repository. **Read this first**
and follow it. It defines what the project is, how it's structured, and the rules
to work by so every session stays aligned.

## What this project is

**Claude Profiles** — an Electron + React desktop app that runs several separate
**Claude Desktop logins** side by side (like browser profiles, but for Claude),
on macOS, Windows, and Linux. It operates on the user's **already-installed**
Claude; it never bundles or redistributes Anthropic's app, and never touches the
user's conversations.

## Repository layout

- `engine/` — plain Node, all cross-platform logic, **no Electron/React imports**.
  - `instances.js` — the store: `~/.claude-profiles/profiles.json` CRUD + durable icon files.
  - `platform.js` — detect the installed Claude app + its data dir, per OS.
  - `launch.js` — launch a profile (or focus it if already running); post-launch crash probe.
  - `detail.js` — live pid / uptime / memory, bring-to-front, stop, reveal.
  - `custom.js` — Custom mode: macOS app clone (rename + icon + re-sign); Windows/Linux shortcuts.
  - `index.js` — the public engine API called over IPC.
  - `log.js` — logger (writes to `~/.claude-profiles/logs/` and, in dev, `.cp-debug.log`).
- `electron/` — `main.js` (window, tray, IPC handlers), `preload.js` (exposes `window.api`).
- `src/` — React renderer: `App.jsx`, `styles.css`, `main.jsx`. **JSX, no TypeScript.**
- `tests/` — `node --test` unit tests (run under `CP_TEST` with a hermetic `HOME`).
- `tests-e2e/` — Playwright end-to-end test that boots the real Electron app.
- `build/` — app icon (`icon.png`). `docs/` — design + technical docs.
- `.github/workflows/` — `ci`, `security`, `codeql`, `release`.

## Core concepts

- **Two modes, chosen by the active tab** (no toggles):
  - **Quick Launch** — the real Claude app launched with its own `--user-data-dir`.
    Instant, auto-updates with Claude, shares the Dock icon.
  - **Custom** — a per-profile name + icon. macOS: a **cloned copy** of Claude.app;
    Windows/Linux: a shortcut / `.desktop` entry.
- **Isolation** is a separate `--user-data-dir` per profile (separate login/history).
- **Store**: `~/.claude-profiles/profiles.json`; picked images saved under `.../icons/`.
- **IPC**: `preload.js` exposes `window.api.*`; handlers are registered in
  `main.js` → `registerIpc()`. The renderer never imports Node/Electron directly.

## Hard rules — do / don't

- **Keep `engine/` free of Electron/React imports.** It must stay unit-testable on its own.
- **Never** redistribute Anthropic's Claude app; operate only on the installed copy.
- **Never** read, move, or modify a user's conversation transcripts.
- **macOS Custom clone — do NOT rename `CFBundleName`.** Electron derives the Helper
  app path from it (`<CFBundleName> Helper.app`), so renaming it makes the clone
  crash at launch with a fatal `Unable to find helper app`. Use **`CFBundleDisplayName`**
  for the Dock label instead. Re-sign clones with an entitlements file that keeps
  `com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, and
  `disable-library-validation`, or the clone traps in V8 at startup.
- **Distribution is unsigned** (`build.mac.identity: null`). Don't add signing that
  requires a paid Apple/Windows certificate unless the maintainer asks.
- The renderer runs in Electron — don't rely on browser storage for durable state;
  persist through the engine/store over IPC.

## Gotchas (learned the hard way — don't relearn them)

- **Main-process code does NOT hot-reload.** Changes to `electron/**` or `engine/**`
  only take effect after a full restart. In dev the app quits on window close and
  there is no tray, so `Ctrl+C` then `pnpm dev` reloads cleanly. (Only `src/**`
  hot-reloads via Vite.)
- **Keep `pnpm-lock.yaml` in sync with `package.json`.** CI installs with
  `--frozen-lockfile`; a stale lockfile fails every job. Run `pnpm install` after
  any dependency change and commit the updated lockfile.
- **Update `tests-e2e/app.spec.mjs` when you change add/edit UI or element classes.**
  It selects by `.add-modal`, placeholder text, `.card`, `.sheet2`, etc.
- Cloned apps prompt once for macOS Keychain access ("Claude Safe Storage") — expected.
- Don't commit build output: `release/`, `dist/`, `node_modules/`, `.cp-debug.log`.

## Commands

```bash
pnpm dev          # Vite + Electron, hot reload (renderer only)
pnpm build        # bundle the renderer into dist/
pnpm test         # unit tests
pnpm lint         # eslint
pnpm e2e          # Playwright end-to-end
pnpm format       # prettier
pnpm dist:mac     # → release/  (.dmg)   also dist:win / dist:linux
```

## CI gates (must pass before merge to `main`)

`lint` · `test` · `build` (macOS/Windows/Linux) · `e2e` (xvfb) · CodeQL ·
gitleaks (secret scan) · dependency audit (`pnpm audit --prod`).

## Releasing

Push a version tag and `.github/workflows/release.yml` builds and publishes the
`.dmg` / `.exe` / `.AppImage` / `.deb` to GitHub Releases:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Docs split

- `README.md` — **end users only**: what it is + simple install steps. No dev commands.
- `CONTRIBUTING.md` — developers: setup, scripts, building installers, releasing, guidelines.
- `docs/DESIGN.md`, `docs/TECHNICAL.md` — deeper design and per-OS implementation.

## Working style

- React functional components + hooks; JSX (no TS); keep dependencies minimal.
- Small, focused PRs; say what changed, how it was tested, and on which OS.
- When you fix a non-obvious bug, add a note here or a regression test so it
  doesn't come back.
