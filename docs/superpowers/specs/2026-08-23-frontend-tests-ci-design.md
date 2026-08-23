# Frontend tests + CI — design

Sub-project 1 of 5 in the "make fx-monitor a stronger portfolio piece" initiative
(see conversation history; sub-projects 2–5 are security hardening, pipeline
observability, containerization/IaC, and a possible backend+DB, each planned
separately).

## Goal

The Python pipeline already has `pytest` + `ruff` and runs in CI
(`.github/workflows/update-data.yml`). The React frontend (`site/`) has zero
tests and no CI gate at all — a PR that breaks the build or ships a logic bug
in `lib/` currently has nothing stopping it. This closes that gap.

## Tooling

- **Vitest** as the test runner. No extra bundler config needed — the project
  already builds with Vite, so Vitest reuses `vite.config.ts`.
- **jsdom** as the test environment (added as a dev dependency, configured via
  `vite.config.ts` `test.environment`).
- **@testing-library/react** + **@testing-library/jest-dom** for component
  tests (render + assert on output).
- **Chart.js / react-chartjs-2 handling**: jsdom has no `<canvas>` 2D context,
  which Chart.js needs to actually draw. Rather than polyfilling canvas (slow,
  brittle, and tests rendering we don't own), tests for chart-wrapping
  components mock `react-chartjs-2`'s `<Line>` export with `vi.mock`, replacing
  it with a stub that records the props it receives. Assertions then check
  that *our* data-transformation code produced the right `labels`/`datasets`/
  colors — the actual charting library's rendering is out of scope, it's a
  third-party dependency we don't maintain.

## Test scope

Co-located `*.test.ts` / `*.test.tsx` files next to the source file they
cover (Vitest's default discovery pattern).

**`lib/calc.ts`**
- `filterSeriesByRange`: each `RangeOption` value, empty series, `'ALL'`
  passthrough
- `calculateKpis`: empty series → all-null result; single-point series;
  missing previous-day/week/month data (sparse series); normal case with
  known fixture data and hand-computed expected KPIs

**`lib/analytics.ts`** (all seven exports)
- `buildLogReturnSeries`, `buildRollingVolatilitySeries`, `buildDrawdownSeries`:
  empty input, single point, normal case
- `buildReturnsHistogram`: normal case, and the `min === max` branch
  (all-identical values → single bin)
- `buildVolatilityRegimeBands`: empty input, and a fixture that crosses all
  three regimes (low/normal/high) to verify band boundaries
- `buildEventMarkers`: event date present in series, event date absent
  (filtered out), normalized vs. raw value
- `buildSnapshotSummary`: empty series; normal case

**`lib/format.ts`**
- `formatPct`, `formatRate`: `null`, `NaN`, positive (has `+` sign), negative,
  zero
- `formatDate`, `formatUtc`: currently pass-through identity functions — a
  one-line test locks in that contract so a future implementation change is
  intentional, not accidental

**`lib/i18n.ts`**
- No transformation logic to test (it's a static lookup table), but add one
  regression test asserting `Object.keys(translations.en)` and
  `Object.keys(translations.sv)` are identical — this is the realistic bug
  here (a key added to one locale and forgotten in the other), and it's cheap
  to catch mechanically.

**`lib/data.ts`**
- `fetchManifest` / `fetchSeries`: mock global `fetch`. Cases: valid payload
  resolves; non-OK HTTP status throws; malformed JSON (missing `pairs`,
  non-array `series`, invalid point shape) throws via the `assert*` guards.

**Components**
- `KpiCard`: renders label/value, renders hint only when provided
- `SnapshotPanel`: renders all three metrics, regime label maps correctly for
  each of low/normal/high
- `ChartPanel`, `DrawdownChart`, `RollingVolChart`, `ReturnsHistogramChart`:
  mocked `react-chartjs-2` as described above; assert the transformed data
  reaching the chart is correct for a small fixture series
- `App.tsx`: one smoke test — mocks `lib/data.ts` fetchers to return fixture
  data, renders `<App />`, asserts it doesn't throw and key landmarks (e.g.
  the page title) appear

## CI workflow

New file `.github/workflows/ci.yml`, triggered on `pull_request` and `push`
to `main`. Two independent jobs:

- **`site`**: `actions/checkout` → `actions/setup-node` → `npm ci` (in
  `site/`) → `npm run lint` → `tsc --noEmit` → `npm run test` (Vitest, single
  run) → `npm run build`
- **`pipeline`**: `actions/checkout` → `actions/setup-python` → `pip install
  -r pipeline/requirements.txt` → `ruff check pipeline` → `pytest
  pipeline/tests`

`update-data.yml` is left unchanged. Its own lint+test step overlaps with the
`pipeline` job above, but the two workflows serve different purposes (PR
gatekeeping vs. daily data refresh) and the duplication is cheap to leave in
place rather than refactor into a shared reusable workflow — that refactor
isn't worth doing for two call sites.

No coverage threshold gate, per earlier decision — CI fails only on
lint/typecheck/test/build failure, not on coverage percentage.

## New npm scripts (`site/package.json`)

- `"test": "vitest run"` — single run, used by CI
- `"test:watch": "vitest"` — local development
- `"test:coverage": "vitest run --coverage"` — local/manual visibility into
  coverage %, not wired into CI as a gate

## Out of scope

- Coverage gate/threshold enforcement (explicitly declined)
- End-to-end/browser tests (Playwright etc.) — not discussed, would be a
  separate future addition
- Testing the Python pipeline further (already covered by existing
  `pipeline/tests`, untouched by this sub-project)
- Sub-projects 2–5 (security, observability, containerization/IaC, backend+DB)
