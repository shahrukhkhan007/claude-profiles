# Claude Profiles

[![CI](https://github.com/shahrukhkhan007/claude-profiles/actions/workflows/ci.yml/badge.svg)](https://github.com/shahrukhkhan007/claude-profiles/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Run several separate **Claude Desktop logins** side by side on one machine — like
browser profiles, but for Claude. Add a profile, give it a name (and an icon),
and launch it. Your work and personal logins stay signed in at the same time.

> **Status:** early work in progress. The engine and app shell run today;
> custom icons and managed updates are on the roadmap below.

## Two ways to run a profile

The app has two tabs — the tab you're in decides how the profile is created, so
there are no confusing toggles:

- **Quick Launch** — the lightweight way. Each profile is the normal Claude app
  pointed at its own data folder. Instant, and it auto-updates with Claude. On
  macOS these share the same Dock icon.
- **Custom** — each profile gets its **own name and icon** in the Dock. On macOS
  this is a renamed copy of Claude (so the icon can differ); on Windows and Linux
  it's just a shortcut, so custom icons and auto-update both work with no
  trade-off.

## Requirements

- [Claude Desktop](https://claude.ai/download) installed
- Node.js 20+ and npm

## Quick start

```bash
npm install
npm run dev
```

This launches the app (Electron) with the React UI. `npm run build` bundles the
UI; packaged installers come later via `electron-builder`.

## How it works

Each profile is just Claude launched with its own `--user-data-dir`, so it keeps
a separate login, history, and settings. The app records your profiles in
`~/.claude-profiles/profiles.json` and reads live status (running / stopped)
from the OS. It never touches your conversations or your main Claude data.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full design and
[`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the per-OS implementation details.

## Roadmap

1. **Engine + shell** — detect Claude, add / launch / list / remove profiles. ✅ in progress
2. **Custom tab** — per-profile name + icon (macOS clone, Windows/Linux shortcuts).
3. **Profile detail** — created, last launched, uptime, live memory; bring-to-front & reveal.
4. **Managed updates** — detect a new Claude version, one-click rebuild that keeps the icon & account.
5. **Menu-bar / tray** — quick-launch any profile from the top bar.
6. **Packaging & release** — signed installers for macOS, Windows, Linux.

## A note on safety

Claude Profiles operates only on **your already-installed Claude** — it never
bundles or redistributes Anthropic's app. It reads your local files and creates
separate data folders; it never modifies your conversations.

## License

[MIT](LICENSE)
