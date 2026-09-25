# Claude Profiles — Design

Run several separate Claude Desktop logins on one machine, each a **profile** with
its own history and (optionally) its own name and icon.

## The model: two tabs, no toggles

The tab you're in decides how a profile is made:

| | Quick Launch (Simple) | Custom |
|---|---|---|
| Dock / taskbar icon | shared Claude icon (macOS) | your own icon + name |
| Auto-update | automatic | managed by the app (macOS) |
| Under the hood | Claude + a separate `--user-data-dir` | a renamed copy (macOS) / shortcut (Win, Linux) |

The custom trade-off (clone can't auto-update itself) is **macOS-only** — on
Windows and Linux a custom profile is just a shortcut, so icon *and* auto-update
both work.

## Screens

- **Profile list** — name, icon, running/stopped, Launch / Front, Remove.
- **Add** — name + (Custom) icon: preset color or an uploaded logo/photo.
- **Profile detail** — created, last launched, uptime, live memory, data folder;
  Bring to front, Reveal in file manager, Change icon, Remove.
- **Managed update (Custom, macOS)** — when Claude updates, a one-click rebuild
  re-clones from the new version and re-applies the saved icon and name; the
  account and sessions are untouched.
- **Menu-bar / tray** — quick-launch any profile from the top bar (also Windows
  tray, Linux indicator).

## Data model — `~/.claude-profiles/profiles.json`

```jsonc
{
  "version": 1,
  "instances": [
    {
      "id": "a1b2c3",
      "name": "Work",
      "mode": "custom",          // "simple" | "custom"
      "color": "blue",
      "iconPath": "…/work.png",  // custom image, re-applied after an update
      "dataDir": "…/Claude-Work",
      "bundlePath": "…/Claude Work.app",  // macOS custom only
      "createdAt": "…",
      "lastLaunchedAt": "…",
      "launches": 37
    }
  ]
}
```

Storing `iconPath` is what lets a macOS rebuild re-skin the fresh clone
automatically — the user never re-applies an icon by hand.

## Guardrails

- Operates only on the user's installed Claude — never redistributes it.
- Never reads, moves, or modifies conversation transcripts.
- No network of its own; never touches login credentials.
