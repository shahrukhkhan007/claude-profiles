# Architecture

How Claude Profiles is put together, and exactly what it does to your machine.
Every diagram below is Mermaid and renders on GitHub.

**Legend** — throughout: 🟢 **created/written** by the app · 🔵 **read** by the
app · 🔴 **removed** on delete. The app never modifies your installed Claude.

---

## 1. High-level architecture

Three layers: a sandboxed React UI, the Electron main process that owns the
windows/tray and brokers IPC, and a **pure-Node engine** (no Electron or React
imports) that does the real work against the OS.

```mermaid
flowchart LR
  subgraph R["Renderer — sandboxed (src/)"]
    UI["React UI — App.jsx\ntabs · modal · detail · settings"]
  end
  subgraph P["Preload bridge (electron/preload.js)"]
    API["window.api\n(contextBridge)"]
  end
  subgraph M["Main process (electron/main.js)"]
    IPC["IPC handlers"]
    TRAY["Menu-bar tray + menu"]
    WIN["BrowserWindow + Dock icon"]
  end
  subgraph E["Engine — pure Node (engine/)"]
    IDX["index.js (facade)"]
    INST["instances.js (store)"]
    LAUNCH["launch.js"]
    CUSTOM["custom.js (clones)"]
    DETAIL["detail.js (live stats)"]
    SET["settings.js"]
    PLAT["platform.js"]
    LOG["log.js"]
  end
  subgraph OS["Operating system"]
    FS["Filesystem"]
    CLAUDE["Installed Claude.app"]
    LS["Launch Services / Dock"]
    PROC["Process table"]
  end

  UI -->|"invoke()"| API -->|"ipcRenderer.invoke"| IPC
  IPC --> IDX
  IDX --> INST & LAUNCH & CUSTOM & DETAIL & SET & PLAT & LOG
  TRAY --> IDX
  INST --> FS
  SET --> FS
  LOG --> FS
  CUSTOM --> FS & CLAUDE & LS
  LAUNCH --> CLAUDE & PROC
  DETAIL --> PROC
  PLAT --> CLAUDE
```

**Why the split?** The engine has zero Electron/React dependencies, so it's
unit-testable in plain Node and could power a CLI later. The renderer can only
reach the OS through the narrow `window.api` surface the preload exposes.

---

## 2. Engine modules

```mermaid
flowchart TD
  IDX["index.js\npublic API used over IPC"]
  IDX --> INST["instances.js\nCRUD store · data dirs · icon persistence"]
  IDX --> LAUNCH["launch.js\nspawn / open · isRunning"]
  IDX --> CUSTOM["custom.js\nmacOS clone · win .lnk · linux .desktop"]
  IDX --> DETAIL["detail.js\nuptime · memory · stop · bring-to-front"]
  IDX --> SET["settings.js\napp-level settings"]
  IDX --> PLAT["platform.js\nlocate installed Claude"]
  CUSTOM --> LOG["log.js\nfile + repo debug log"]
  LAUNCH --> INST
  DETAIL --> INST
```

---

## 3. Data model (the "schema")

State is small JSON files, not a database. Two files under `~/.claude-profiles/`.

```mermaid
erDiagram
  PROFILES_STORE ||--o{ INSTANCE : contains
  PROFILES_STORE {
    int version
  }
  INSTANCE {
    string id PK
    string name
    string mode "simple | custom"
    string color "preset or #hex"
    string iconData "base64 preview (nullable)"
    string iconPath "durable icon file (nullable)"
    string dataDir "per-profile Claude data"
    string bundlePath "custom clone path (mac)"
    string bundleId "custom bundle id (mac)"
    string launcherPath "win .lnk / linux .desktop"
    string createdAt
    string lastLaunchedAt
    int launches
    string buildError "nullable"
  }
  SETTINGS {
    string trayGlyph "auto | light | dark"
    string onboardingSeenVersion
  }
```

- `profiles.json` = `{ version, instances: Instance[] }`
- `settings.json` = the `SETTINGS` object (read by the tray in the main process)

---

## 4. On-disk footprint — what it picks up and what it drops

```mermaid
flowchart TB
  APP["Claude Profiles"]

  subgraph CFG["~/.claude-profiles/  🟢"]
    STORE["profiles.json  🟢"]
    SETF["settings.json  🟢"]
    ICONS["icons/&lt;id&gt;.png  🟢"]
    LOGS["logs/claude-profiles.log  🟢"]
  end

  subgraph DATA["Per-profile Claude data  🟢 (🔴 on remove)"]
    MAC["macOS: ~/Library/Application Support/Claude-&lt;slug&gt;"]
    WIN["Windows: %APPDATA%/Claude-&lt;slug&gt;"]
    LIN["Linux: ~/.config/Claude-&lt;slug&gt;"]
  end

  subgraph LAUNCHERS["Per-profile launchers  🟢 (🔴 on remove)"]
    CLONE["macOS custom: /Applications/Claude &lt;name&gt;.app  (a full clone)"]
    LNK["Windows: ~/Desktop/Claude &lt;name&gt;.lnk"]
    DESK["Linux: ~/.local/share/applications/claude-&lt;slug&gt;.desktop"]
  end

  READ["Installed Claude.app  🔵 read-only (never modified)"]

  APP --> CFG
  APP --> DATA
  APP --> LAUNCHERS
  APP -. reads .-> READ
  CLONE -. copied from .-> READ
```

| Path | When | Lifecycle |
|---|---|---|
| `~/.claude-profiles/profiles.json` | first run | app-managed |
| `~/.claude-profiles/settings.json` | on settings change | app-managed |
| `~/.claude-profiles/icons/<id>.<ext>` | when a profile has an image | removed on delete |
| `~/.claude-profiles/logs/…` | always | app-managed |
| `…/Claude-<slug>` (data dir) | on first launch of a profile | **removed on delete** |
| `/Applications/Claude <name>.app` | custom profile create (macOS) | **removed on delete** |
| `~/Desktop/Claude <name>.lnk` | custom profile (Windows) | removed on delete |
| `~/.local/share/applications/claude-<slug>.desktop` | custom profile (Linux) | removed on delete |
| Installed `Claude.app` | read only | never changed |

---

## 5. Creating a custom profile (macOS clone)

The interesting part: giving a profile its own Dock identity means handing macOS
a *distinct app bundle*, because macOS keys "is this a separate app?" off the
bundle and its identifier, and draws the Dock icon from the bundle's `.icns`.

```mermaid
sequenceDiagram
  participant U as User (UI)
  participant PRE as preload (window.api)
  participant MAIN as main.js (IPC)
  participant ENG as engine.addInstance
  participant ST as instances.js
  participant CU as custom.js
  participant OS as macOS

  U->>PRE: add({name, mode:"custom", image})
  PRE->>MAIN: ipc "instances:add"
  MAIN->>ENG: addInstance(data)
  ENG->>ST: store.add(data)
  ST->>OS: 🟢 write icons/<id>.png + reserve data dir
  ENG->>CU: custom.create(inst)
  CU->>OS: 🔵 read /Applications/Claude.app
  CU->>OS: 🟢 cp -R  ->  Claude <name>.app
  CU->>OS: set CFBundleIdentifier (unique) + CFBundleDisplayName
  CU->>OS: sips + iconutil  ->  AppIcon.icns (your image)
  CU->>OS: codesign (ad-hoc, JIT entitlements)
  CU->>OS: lsregister -f  (register with Launch Services)
  CU-->>ENG: {bundlePath, bundleId}
  ENG->>ST: store.update(id, …)
  ENG-->>U: profile ready
```

> `CFBundleName` is deliberately left unchanged — Electron derives its helper
> app path from it (`<CFBundleName> Helper.app`), so renaming it makes the clone
> crash at launch. The Dock label uses `CFBundleDisplayName` instead.

Windows and Linux don't clone: they write a shortcut / `.desktop` entry that
points at the installed Claude with `--user-data-dir=<dataDir>` and a custom icon.

---

## 6. Launching a profile

```mermaid
flowchart TD
  L["launch(id)"] --> MODE{mode?}
  MODE -->|simple / Quick Launch| Q["open -n Claude.app\n--args --user-data-dir=&lt;dataDir&gt;"]
  MODE -->|custom| C["open -n  Claude &lt;name&gt;.app\n(its own data dir baked in)"]
  Q --> RUN["separate Claude process\n(isolated login + history)"]
  C --> RUN
  RUN --> PGREP["isRunning: pgrep -f -- &lt;dataDir&gt;"]
```

Isolation comes entirely from a distinct `--user-data-dir`: separate login,
history, and settings per profile. "Running" is detected by matching that data
dir in the process table.

---

## 7. Removing a profile (full teardown)

```mermaid
sequenceDiagram
  participant U as User (UI)
  participant ENG as engine.removeInstance
  participant CU as custom.js (macOS)
  participant ST as instances.js
  participant OS as macOS

  U->>ENG: remove(id)  (after confirm)
  ENG->>CU: custom.remove(inst)
  CU->>OS: pkill -f -- <dataDir>   (quit running clone)
  CU->>OS: lsregister -u <bundle>  (unregister)
  CU->>OS: 🔴 rm -rf <bundle>
  CU->>OS: killall Dock            (refresh icon)
  ENG->>ST: store.remove(id)
  ST->>OS: 🔴 rm -rf <dataDir>  +  rm icons/<id>.*
  ENG-->>U: gone — no trace
```

A clone you manually *pinned* to the Dock leaves a user-level pin macOS keeps
even after the app is gone — that one is removed by hand.

---

## 8. Boundaries at a glance

- **Renderer** can't touch the OS directly — only via `window.api`.
- **Main** owns windows, the tray, and IPC; it never does filesystem work itself.
- **Engine** is the only layer that touches the disk, Claude.app, Launch
  Services, and processes — and it's pure Node, so it's fully unit-tested.
- The installed **Claude.app is read-only** to this app; profiles are built
  *around* it, never by modifying it.
