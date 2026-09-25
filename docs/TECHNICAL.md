# Claude Profiles — Technical (per-OS)

Every operation the app performs, and how it's done on each OS. These are the
OS-level mechanisms; the Electron main process drives them via `child_process`.

## Detection & setup

| Operation | macOS | Windows | Linux |
|---|---|---|---|
| Find Claude install | `/Applications/Claude.app` | `%LOCALAPPDATA%\Programs\Claude\Claude.exe` (+ MSIX `…\Packages\Claude_*`) | `claude` on PATH |
| Find data dir | `~/Library/Application Support/Claude` | `%APPDATA%\Claude` (MSIX: `…\Packages\Claude_*\LocalCache\Roaming\Claude`) | `~/.config/Claude` |
| Isolated profile dir | new folder + `--user-data-dir` | same | same |

## Launch, identity & icon

| Operation | macOS | Windows | Linux |
|---|---|---|---|
| Launch (Quick) | `open -n -a Claude --args --user-data-dir="<dir>"` | `Claude.exe --user-data-dir="<dir>"` | `claude --user-data-dir="<dir>"` |
| Create Custom | `cp -R` bundle → new app | `.lnk` shortcut (no clone) | `.desktop` file (no clone) |
| Unique identity | set `CFBundleIdentifier` → `lsregister -f` | distinct AppUserModelID | distinct `StartupWMClass` |
| Custom icon | write `icon.icns` + `CFBundleIconFile` | shortcut `IconLocation` (`.ico`) | `Icon=` in `.desktop` |

## Live status & navigation (profile detail)

| Operation | macOS | Windows | Linux |
|---|---|---|---|
| Running? | `pgrep -f "<dir>"` | `Win32_Process` CommandLine match | `pgrep -f "<dir>"` |
| Uptime | `ps -o etime= -p <pid>` | `(Get-Process).StartTime` | `ps -o etime=` |
| Live memory | `ps -o rss= -p <pid>` | `WorkingSet64` | `/proc/<pid>/status` VmRSS |
| Bring to front | `osascript … activate` | `SetForegroundWindow` | `wmctrl -x -a` |
| Reveal in files | `open -R "<path>"` | `explorer /select,"<path>"` | `xdg-open "<dir>"` |

## Update, tray, lifecycle

| Operation | macOS | Windows | Linux |
|---|---|---|---|
| Read version | `Info.plist` `CFBundleShortVersionString` | exe `VersionInfo` | `--version` |
| Update Custom | re-clone → re-plist → `lsregister` → re-apply icon | n/a (auto-updates) | n/a (auto-updates) |
| Tray / menu bar | `NSStatusItem` (Electron `Tray`) | `Shell_NotifyIcon` (Electron `Tray`) | `StatusNotifierItem` |
| Remove | delete clone + data dir | delete `.lnk` + data folder | delete `.desktop` + data folder |
| Signing note | clone breaks signature → Gatekeeper prompt; optional `codesign --force --deep -s -` | none | none |

**Takeaway:** only macOS clones the app and carries the signing / managed-update
cost. Windows and Linux are shortcuts, so they're lighter and auto-update works.
