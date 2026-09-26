# Contributing

Thanks for your interest in Claude Profiles!

## Getting started

```bash
npm install
npm run dev
```

- The **engine** (`engine/`) is plain Node with no UI — the cross-platform logic
  lives here and is the easiest place to start.
- The **app shell** is Electron (`electron/`) plus a React renderer (`src/`).

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

Tests run against an isolated temp `HOME` and a `CP_TEST` mode, so they never launch the real Claude app. Run `pnpm format` (Prettier) before committing.
