# Security Policy

## Reporting a vulnerability

If you find a security issue, please report it privately via GitHub's "Report a
vulnerability" (Security Advisories) rather than opening a public issue.

## Scope and design

Claude Profiles runs locally and:

- operates only on the user's **already-installed** Claude app (it never
  downloads or redistributes it),
- reads local files and creates separate data folders, but never reads, moves,
  or modifies conversation transcripts,
- makes no network requests of its own and never touches login credentials.

The Electron shell runs with `contextIsolation: true` and `nodeIntegration:
false`; all privileged work happens in the main process behind a small,
validated IPC surface.
