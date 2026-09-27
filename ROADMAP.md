# Claude Profiles — Engineering Roadmap

> **Living document.** This is the forward-looking plan: release-engineering
> process, branching strategy, and the feature / R&D pipeline. It is **not** a
> changelog — shipped work lives in the GitHub Releases page. Anything here is
> either *decided and planned* or *under investigation (a research spike)*.
>
> Status legend: `🟢 Decided` · `🟡 Proposed` · `🔬 Researching` · `🧊 Backlog`

---

## 1. Release Engineering

### 1.1 Branching strategy  🟡 Proposed

A three-tier model — short-lived feature branches integrate on `staging`, and
`main` is release-only:

| Branch        | Purpose                                             | Protected | CI on push/PR                     |
| ------------- | --------------------------------------------------- | --------- | --------------------------------- |
| `feature/*`   | One unit of work. Short-lived, deleted after merge. | no        | lint + unit + e2e (on PR)         |
| `staging`     | Integration / pre-release testing environment.      | yes       | full matrix build (3 OS) + e2e    |
| `main`        | Release line. Every merge here is a shippable state.| yes       | full matrix build + release gate  |

**Flow:** `feature/*` → PR → **`staging`** (validate here) → PR → **`main`** →
version bump + tagged release.

**Rule (per product owner):** a version update must *always* be a merge into
`main`. Nothing is versioned or released off `staging` or a feature branch.

**GitHub settings to apply (UI, one-time):**
- Protect `main` and `staging`: require PR, require status checks (CI) to pass,
  no direct pushes.
- Restrict who can merge to `main` (release approver).
- Auto-delete head branches after merge.

### 1.2 Environments  🟡 Proposed

- **Staging build** — unsigned installer artifacts produced from `staging` for
  smoke-testing on each OS before promoting to a release. (Candidate: a
  `staging`-triggered workflow uploading build artifacts, or a `*-rc` pre-release.)
- **Production / release** — signed-or-unsigned installers published to the
  GitHub Releases page from a `v*` tag on `main` (existing `release.yml`).

### 1.3 Versioning — decision pending  🟡 Proposed

The trigger is fixed: **version bumps happen on merge to `main`.** The *mechanism*
is open. Three candidates, to be decided later:

**Option A — `release-please` (recommended).**
A GitHub Action watches `main` and maintains a standing "release PR" that bumps
the version and writes the changelog from Conventional Commit messages
(`feat:`, `fix:`, `feat!:`). Merging that PR creates the `v*` tag, which fires
`release.yml`. So a version bump *is* one deliberate merge into `main` — exactly
the rule above. Low maintenance, automatic changelog, controllable version.
Cost: requires commit-message discipline (Conventional Commits).

**Option B — auto patch-bump on every merge to `main`.**
A workflow on `push: main` bumps the patch (optionally minor/major via a PR
label or `#minor` token), commits the bump, and tags. Simplest to reason about,
but *every* merge cuts a release — noisier, weaker control over the version line.

**Option C — manual tags (status quo).**
Maintainer runs `npm version` + `git push --tags` when they decide to release.
Maximum control, zero automation. This is what `release.yml` already consumes.

> **Decision:** _TBD._ Leaning Option A. See the Decision Log.

---

## 2. Feature Pipeline & Research Spikes

Ordered by product priority. Each spike has a problem statement, an initial
feasibility read, approaches to investigate, and open questions. Feasibility
notes are hypotheses to validate, not commitments.

### SPIKE-01 — "Vital-sign" heartbeat pulse for running profiles  🟡 Proposed · low risk

**What:** Replace/augment the static running indicator with a live
ventilator-/ECG-style heartbeat waveform that visibly *pulses* while a profile
is running — a moving vital-sign line, not just a dot.

**Feasibility:** High. Pure renderer work, no OS integration. The "running"
state already flows to the UI.

**Approaches to evaluate:**
- Inline **SVG ECG path** animated with `stroke-dashoffset` (a trace that sweeps
  left→right on a loop) — crisp, theme-able, cheap.
- Or a small `<canvas>` drawing a scrolling waveform for a more "monitor" feel.
- Respect `prefers-reduced-motion`; pause the animation when the profile is idle
  and when the window is hidden (avoid wasted repaints).

**Open questions:** one shared waveform vs. per-profile? Does amplitude/rate
carry meaning (e.g. tied to SPIKE-03 activity) or is it purely decorative?

### SPIKE-02 — Per-profile usage & rate-limit visibility  🔬 Researching · feasibility unknown

**What:** On each profile in the list, surface that account's current usage
against Claude's limits — the rolling **5-hour window** and the **weekly** cap —
so the user can see, per profile, how much headroom is left. (Direct response to
user feedback.)

**Feasibility:** Unknown — this is the real R&D. Usage/limit state is
account-level and lives server-side; there is no documented public API for it,
and each profile is an isolated Claude Desktop data dir.

**Approaches to investigate (in order of preference):**
1. **Supported surface first** — check whether Claude Desktop or the Claude API
   exposes any usage/limit endpoint or local cache we can read *with the user's
   own session*, for their own account.
2. **Local data-dir inspection** — each profile runs with its own
   `--user-data-dir`; investigate whether usage state is cached there (IndexedDB
   / LevelDB / config) in a readable form. **Fragile**: undocumented internals
   that can break on any Claude update.
3. **Manual/derived fallback** — if nothing readable exists, let the user log
   their own reset times, or infer nothing and drop the feature.

**Hard constraints:** read-only, the user's *own* accounts only; never scrape or
automate in a way that violates Claude's Terms; degrade gracefully and never
present guessed numbers as authoritative. If only fragile internals work, gate
it behind an explicit opt-in and document the breakage risk.

**Open questions:** does the desktop app persist limit state locally at all? How
current would it be (only refreshed when that profile is open)? Cross-platform
parity of whatever store we find?

### SPIKE-03 — Live session-activity tracking  🔬 Researching · feasibility unknown

**What:** Beyond "is the profile launched," show whether that Claude instance is
*actively doing something* — a session generating/working in the foreground or
background — e.g. a "working…" badge per profile.

**Feasibility:** Unknown / partial. "Process is running" is already solved.
"Is it actively working" is the R&D.

**Signals to investigate:**
- **Process/resource heuristic** — sample the instance's CPU/network; sustained
  activity ≈ generating. Cheap and OS-level, but only a coarse proxy (false
  positives from background sync).
- **Local state watching** — watch that profile's data dir for conversation/DB
  writes as a "recent activity" signal. More specific, but relies on
  undocumented storage that can change.
- **Window/title or accessibility hints** — inspect the instance's window state
  where the OS allows it.

**Hard constraints:** same as SPIKE-02 — read-only, own instances, no
ToS-violating introspection, graceful degradation. Prefer the coarse
process-level signal (robust) over deep internal parsing (fragile) unless the
extra fidelity proves worth the maintenance cost.

**Open questions:** what does "working" mean to the user (any open session vs.
actively streaming a response)? Acceptable latency of the indicator? How much
CPU can the poller itself use before it's self-defeating?

---

## 3. Backlog  🧊

_Unscheduled ideas captured so they aren't lost. Promote to Section 2 when picked up._

- **Brand motion on the launch tabs** — subtle animation of the coral octopus
  woven into the Quick Launch / Custom views (idle wiggle, arm drift, or a
  reaction on launch). Distinct from SPIKE-01's vital-sign pulse; this is
  ambient brand delight. _Owner is still shaping the idea._
- **Splash + first-run onboarding** — DONE (splash on every launch; 3-step tour
  shown once per app version via `settings.onboardingSeenVersion`).

---

## 4. Decision Log

Append-only. Record each decision with date + rationale so future contributors
know *why*, not just *what*.

| Date       | Decision                                            | Rationale / notes            |
| ---------- | --------------------------------------------------- | ---------------------------- |
| 2026-09-27 | Roadmap established; branching + versioning options captured, versioning mechanism left open (leaning `release-please`). | Product owner wants versioning decided later; all options recorded. |
