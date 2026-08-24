# Pipeline Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one currency pair's fetch failure not take down the other five, and give the live site a visible signal of pipeline health without anyone needing to check GitHub Actions history.

**Architecture:** `fetch_fx.py` gains per-pair error isolation and writes a new `status.json` alongside the existing data files, every run, regardless of outcome. `update-data.yml` is restructured so a failed fetch still gets committed (partial data + status) before the workflow ultimately reports failure (preserving the existing GitHub failure-email behavior). The frontend gains a small footer badge that reads `status.json` and renders nothing if it's unavailable — it never blocks the rest of the app.

**Tech Stack:** No new dependencies. Existing Python `logging`/`dataclasses` idioms, existing Vitest/RTL test patterns, existing CSS custom-property color scheme.

## Global Constraints

- No new external notification channel (Slack, email service, webhook) — GitHub's built-in scheduled-workflow failure email is confirmed working and stays as-is.
- `fetchStatus()` on the frontend must never throw — on any failure (network error, non-OK response, malformed payload) it resolves to `null`, and the UI simply doesn't render the badge. This is different from `fetchManifest`/`fetchSeries`, which do throw and block the app — status is decoration, not a dependency.
- A pair's JSON data file is only overwritten when that pair's fetch succeeds this run — a failing pair keeps serving its last successful data untouched.
- `manifest.json` is unaffected by per-pair failures — it's always (re)written at the end of `main()`, same as before this plan.
- `main()` returns exit code `0` only when `status.json`'s top-level `status` is `"ok"`; otherwise `1`.
- Status badge colors reuse the existing regime-color palette already in `site/src/styles.css` (`#2e9f7d` low/ok, `#c48f1d` normal/partial, `#dc5f4b` high/failed) rather than introducing new arbitrary colors.

---

### Task 1: Per-pair resilience + `status.json` in `fetch_fx.py`

**Files:**
- Modify: `pipeline/fetch_fx.py`
- Modify: `pipeline/tests/test_fetch_fx.py`

**Interfaces:**
- Produces: `build_status_payload(pair_results: list[dict[str, Any]], generated_utc: str) -> dict[str, Any]` — a pure, unit-testable function. `pair_results` entries are either `{"pair": str, "status": "ok", "points": int}` or `{"pair": str, "status": "error", "message": str}`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing/new tests first**

Add to `pipeline/tests/test_fetch_fx.py` (the file currently has one test, `test_parse_and_validate_series_smoke` — keep it, add these below it):

```python
from pipeline.fetch_fx import build_status_payload, parse_series, validate_series


def test_parse_and_validate_series_smoke() -> None:
    rows = [
        {"TIME_PERIOD": "2026-02-18", "OBS_VALUE": "11.1234"},
        {"TIME_PERIOD": "2026-02-19", "OBS_VALUE": "11.2234"},
        {"TIME_PERIOD": "2026-02-20", "OBS_VALUE": "11.3234"},
    ]

    series = parse_series(rows, "EUR/SEK")

    assert len(series) == 3
    assert all(item["rate"] > 0 for item in series)
    assert series[0]["date"] == "2026-02-18"

    validate_series(series, "EUR/SEK")


def test_build_status_payload_all_ok() -> None:
    pair_results = [
        {"pair": "EUR/SEK", "status": "ok", "points": 100},
        {"pair": "EUR/USD", "status": "ok", "points": 100},
    ]

    payload = build_status_payload(pair_results, "2026-08-24T04:30:00Z")

    assert payload == {
        "generated_utc": "2026-08-24T04:30:00Z",
        "status": "ok",
        "pairs": pair_results,
    }


def test_build_status_payload_partial_failure() -> None:
    pair_results = [
        {"pair": "EUR/SEK", "status": "ok", "points": 100},
        {"pair": "EUR/JPY", "status": "error", "message": "boom"},
    ]

    payload = build_status_payload(pair_results, "2026-08-24T04:30:00Z")

    assert payload["status"] == "partial"


def test_build_status_payload_total_failure() -> None:
    pair_results = [
        {"pair": "EUR/SEK", "status": "error", "message": "boom"},
        {"pair": "EUR/JPY", "status": "error", "message": "boom"},
    ]

    payload = build_status_payload(pair_results, "2026-08-24T04:30:00Z")

    assert payload["status"] == "failed"
```

Note: this replaces the file's only import line (`from pipeline.fetch_fx import parse_series, validate_series`) with the one shown above (adds `build_status_payload`).

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `python -m pytest pipeline/tests -v`
Expected: `test_build_status_payload_all_ok`, `test_build_status_payload_partial_failure`, `test_build_status_payload_total_failure` all `ERROR` (import error — `build_status_payload` doesn't exist yet). `test_parse_and_validate_series_smoke` still passes.

- [ ] **Step 3: Implement `build_status_payload` and per-pair resilience in `pipeline/fetch_fx.py`**

Add this function after `validate_series` and before `write_json`:

```python
def build_status_payload(
    pair_results: list[dict[str, Any]], generated_utc: str
) -> dict[str, Any]:
    statuses = {result["status"] for result in pair_results}
    if statuses <= {"ok"}:
        overall = "ok"
    elif "ok" in statuses:
        overall = "partial"
    else:
        overall = "failed"

    return {
        "generated_utc": generated_utc,
        "status": overall,
        "pairs": pair_results,
    }
```

Replace the body of `main()` (currently the `with requests.Session() as client:` loop through the end of the function) with:

```python
    pair_results: list[dict[str, Any]] = []

    with requests.Session() as client:
        for pair_config in PAIR_CONFIGS:
            try:
                rows = fetch_csv_rows(client, pair_config, args.start_period)
                series = parse_series(rows, pair_config.pair)
                validate_series(series, pair_config.pair)

                payload = {
                    "pair": pair_config.pair,
                    "source": "ECB",
                    "generated_utc": generated_utc,
                    "series": series,
                }
                write_json(output_dir / pair_config.file_name, payload)
                logging.info("Wrote %s (%d points)", pair_config.file_name, len(series))
                pair_results.append(
                    {"pair": pair_config.pair, "status": "ok", "points": len(series)}
                )
            except Exception as exc:
                logging.error("Failed to update %s: %s", pair_config.pair, exc)
                pair_results.append(
                    {"pair": pair_config.pair, "status": "error", "message": str(exc)}
                )

    status_payload = build_status_payload(pair_results, generated_utc)
    write_json(output_dir / "status.json", status_payload)
    logging.info("Wrote status.json (overall status: %s)", status_payload["status"])

    manifest_payload = {
        "source": "ECB",
        "generated_utc": generated_utc,
        "pairs": [
            {
                "pair": pair_config.pair,
                "file": pair_config.file_name,
                "series_key": pair_config.series_key,
            }
            for pair_config in PAIR_CONFIGS
        ],
    }
    write_json(output_dir / "manifest.json", manifest_payload)
    logging.info("Wrote manifest.json")

    return 0 if status_payload["status"] == "ok" else 1
```

The `except Exception as exc:` is a deliberate broad catch at a per-pair boundary — the whole point is that one pair's unexpected failure (network, parsing, validation, anything) must not stop the others from being processed. This is not a bare `except:` (which `ruff`'s `E722` rule would flag) — it names `Exception` explicitly and re-logs it, so `ruff check` should stay clean.

- [ ] **Step 4: Auto-format and run the tests to confirm they pass**

Run: `python -m black pipeline`
Expected: reformats `fetch_fx.py`/`test_fetch_fx.py` if needed (don't hand-tune formatting — let `black` own it).

Run: `python -m black --check pipeline`
Expected: `All done!` — no files need reformatting (confirms the auto-format above was idempotent).

Run: `python -m ruff check pipeline`
Expected: `All checks passed!`

Run: `python -m pytest pipeline/tests -v`
Expected: all 4 tests pass (the original smoke test plus the three new `build_status_payload` tests).

- [ ] **Step 5: Manual smoke test against the real ECB API**

Run: `python pipeline/fetch_fx.py --output-dir /tmp/fx-smoke-test --start-period 2026-01-01`
Expected: exits 0, logs "Wrote status.json (overall status: ok)" and "Wrote manifest.json". Inspect `/tmp/fx-smoke-test/status.json` — it should show `"status": "ok"` and all 6 pairs with `"status": "ok"` and a `points` count.

This confirms the real, unmocked ECB API integration still works end-to-end — the unit tests above only cover `build_status_payload` in isolation, not the live network path.

- [ ] **Step 6: Commit**

```bash
git add pipeline/fetch_fx.py pipeline/tests/test_fetch_fx.py
git commit -m "feat: per-pair error isolation and status.json in fetch_fx.py"
```

---

### Task 2: `update-data.yml` — commit partial results, then re-fail

**Files:**
- Modify: `.github/workflows/update-data.yml`

**Interfaces:**
- Consumes: Task 1's `fetch_fx.py` exit-code contract (0 = full success, 1 = partial or total failure).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the workflow**

Current relevant section:

```yaml
      - name: Fetch latest ECB FX data
        run: |
          python pipeline/fetch_fx.py --output-dir site/public/data --start-period 2015-01-01

      - name: Commit and push if data changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add site/public/data/*.json
          if git diff --staged --quiet; then
            echo "No data changes to commit."
          else
            git commit -m "chore(data): update ECB FX data"
            git push
          fi
```

Replace with:

```yaml
      - name: Fetch latest ECB FX data
        id: fetch
        continue-on-error: true
        run: |
          python pipeline/fetch_fx.py --output-dir site/public/data --start-period 2015-01-01

      - name: Commit and push if data changed
        if: always()
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add site/public/data/*.json
          if git diff --staged --quiet; then
            echo "No data changes to commit."
          else
            git commit -m "chore(data): update ECB FX data"
            git push
          fi

      - name: Fail the run if the fetch step failed
        if: steps.fetch.outcome == 'failure'
        run: |
          echo "Data fetch failed or partially failed — see the 'Fetch latest ECB FX data' step above."
          exit 1
```

`continue-on-error: true` on the fetch step means a non-zero exit from `fetch_fx.py` no longer aborts the job immediately — the commit step (which now has `if: always()`) still runs and pushes whatever `status.json`/data files did get written. The final step then re-fails the overall workflow run *after* that commit, based on the fetch step's recorded `outcome`, so GitHub's existing "email the owner when a scheduled workflow fails" behavior still fires — just after salvaging what could be salvaged, instead of before.

- [ ] **Step 2: Validate the YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/update-data.yml'))"`
Expected: no output, no error.

- [ ] **Step 3: Confirm the rest of the file is untouched**

Run: `git diff .github/workflows/update-data.yml`
Expected: the diff shows only the three changes above (new `id`/`continue-on-error` on the fetch step, new `if: always()` on the commit step, one new step appended at the end). The `on:`, `permissions:`, checkout/setup-python/install/lint/test steps must be byte-for-byte unchanged.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "ci: commit partial pipeline results before re-failing on fetch errors"
```

---

### Task 3: Frontend types + `fetchStatus()`

**Files:**
- Modify: `site/src/types.ts`
- Modify: `site/src/lib/data.ts`
- Modify: `site/src/lib/data.test.ts`

**Interfaces:**
- Produces: `PairStatus` and `PipelineStatus` types from `types.ts`; `fetchStatus(): Promise<PipelineStatus | null>` from `data.ts` — used by Task 4 (test fixtures) and Task 5 (`App.tsx` wiring).
- Consumes: nothing from other tasks.

- [ ] **Step 1: Add types to `site/src/types.ts`**

Add at the end of the file (after the existing `RangeOption` type):

```ts

export type PairStatus =
  | { pair: string; status: 'ok'; points: number }
  | { pair: string; status: 'error'; message: string };

export type PipelineStatus = {
  generated_utc: string;
  status: 'ok' | 'partial' | 'failed';
  pairs: PairStatus[];
};
```

- [ ] **Step 2: Add `fetchStatus()` to `site/src/lib/data.ts`**

Add this import to the top of the file (replacing the existing `import type { FxSeriesFile, ManifestFile } from '../types';`):

```ts
import type { FxSeriesFile, ManifestFile, PairStatus, PipelineStatus } from '../types';
```

Add these two functions after `assertSeriesFile` and before `fetchManifest`:

```ts
function isValidPairStatus(value: unknown): value is PairStatus {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.pair !== 'string') return false;
  if (item.status === 'ok') return typeof item.points === 'number';
  if (item.status === 'error') return typeof item.message === 'string';
  return false;
}

function assertPipelineStatus(json: unknown): asserts json is PipelineStatus {
  if (!json || typeof json !== 'object') throw new Error('Invalid status payload.');
  const payload = json as Record<string, unknown>;
  if (payload.status !== 'ok' && payload.status !== 'partial' && payload.status !== 'failed') {
    throw new Error('Status payload has an invalid status value.');
  }
  if (!Array.isArray(payload.pairs) || !payload.pairs.every(isValidPairStatus)) {
    throw new Error('Status payload has an invalid pairs array.');
  }
}
```

Add this function at the end of the file (after `fetchSeries`):

```ts

export async function fetchStatus(): Promise<PipelineStatus | null> {
  try {
    const res = await fetch('/data/status.json', { cache: 'force-cache' });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    assertPipelineStatus(json);
    return json;
  } catch {
    return null;
  }
}
```

Unlike `fetchManifest`/`fetchSeries`, `fetchStatus` never throws — every failure path (non-OK response, malformed JSON, invalid shape, network error) resolves to `null` instead. This is deliberate: status is a decorative footer badge, not something the app depends on to function.

- [ ] **Step 3: Add tests to `site/src/lib/data.test.ts`**

Update the import line at the top from:

```ts
import { fetchManifest, fetchSeries } from './data';
```

to:

```ts
import { fetchManifest, fetchSeries, fetchStatus } from './data';
```

Add this `describe` block at the end of the file (after the `fetchSeries` block):

```ts

describe('fetchStatus', () => {
  it('resolves with a valid status payload', async () => {
    const payload = {
      generated_utc: '2024-01-01T00:00:00Z',
      status: 'ok',
      pairs: [{ pair: 'EUR/SEK', status: 'ok', points: 100 }],
    };
    mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });
    await expect(fetchStatus()).resolves.toEqual(payload);
  });

  it('resolves with null when the HTTP response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when the payload has an invalid status value', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({ status: 'weird', pairs: [] }) });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when a pair entry has an invalid shape', async () => {
    mockFetchOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok', pairs: [{ pair: 'EUR/SEK' }] }),
    });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchStatus()).resolves.toBeNull();
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all existing tests plus the 5 new `fetchStatus` tests green (62 total: 57 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add site/src/types.ts site/src/lib/data.ts site/src/lib/data.test.ts
git commit -m "feat: add PipelineStatus type and fetchStatus() data loader"
```

---

### Task 4: `StatusBadge` component

**Files:**
- Create: `site/src/components/StatusBadge.tsx`
- Create: `site/src/components/StatusBadge.test.tsx`
- Modify: `site/src/styles.css`

**Interfaces:**
- Consumes: `PipelineStatus` type from `site/src/types.ts` (Task 3).
- Produces: `StatusBadge` default export, props `{ status: PipelineStatus | null; labels: { ok: string; partial: string; failed: string } }` — consumed by Task 5's `App.tsx` wiring.

- [ ] **Step 1: Write `site/src/components/StatusBadge.tsx`**

```tsx
import type { PipelineStatus } from '../types';

type StatusBadgeProps = {
  status: PipelineStatus | null;
  labels: {
    ok: string;
    partial: string;
    failed: string;
  };
};

export default function StatusBadge({ status, labels }: StatusBadgeProps) {
  if (!status) return null;

  const failedPairs = status.pairs
    .filter((item) => item.status === 'error')
    .map((item) => item.pair);

  const label =
    status.status === 'ok' ? labels.ok : status.status === 'partial' ? labels.partial : labels.failed;
  const title = failedPairs.length ? `${label}: ${failedPairs.join(', ')}` : label;

  return (
    <span className="status-badge" title={title} data-testid="status-badge">
      <span className="status-dot" data-status={status.status} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Add CSS to `site/src/styles.css`**

Insert after the existing `.footer a { color: var(--accent); }` rule (and before `.state`):

```css

.status-badge {
  display: inline-flex;
  align-items: center;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.35rem;
  vertical-align: middle;
}

.status-dot[data-status='ok'] {
  background-color: #2e9f7d;
}

.status-dot[data-status='partial'] {
  background-color: #c48f1d;
}

.status-dot[data-status='failed'] {
  background-color: #dc5f4b;
}
```

These reuse the exact colors already used for `.regime-low`/`.regime-normal`/`.regime-high` — no new arbitrary colors.

- [ ] **Step 3: Write `site/src/components/StatusBadge.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge';
import type { PipelineStatus } from '../types';

const labels = {
  ok: 'Pipeline healthy',
  partial: 'Pipeline partially failed',
  failed: 'Pipeline failed',
};

describe('StatusBadge', () => {
  it('renders nothing when status is null', () => {
    const { container } = render(<StatusBadge status={null} labels={labels} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the ok label and a green dot when every pair succeeded', () => {
    const status: PipelineStatus = {
      generated_utc: '2026-08-24T04:30:00Z',
      status: 'ok',
      pairs: [{ pair: 'EUR/SEK', status: 'ok', points: 100 }],
    };
    render(<StatusBadge status={status} labels={labels} />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Pipeline healthy');
    expect(badge.querySelector('.status-dot')).toHaveAttribute('data-status', 'ok');
  });

  it('renders the partial label and lists failed pairs in the title', () => {
    const status: PipelineStatus = {
      generated_utc: '2026-08-24T04:30:00Z',
      status: 'partial',
      pairs: [
        { pair: 'EUR/SEK', status: 'ok', points: 100 },
        { pair: 'EUR/JPY', status: 'error', message: 'boom' },
      ],
    };
    render(<StatusBadge status={status} labels={labels} />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Pipeline partially failed');
    expect(badge).toHaveAttribute('title', 'Pipeline partially failed: EUR/JPY');
  });

  it('renders the failed label when every pair errored', () => {
    const status: PipelineStatus = {
      generated_utc: '2026-08-24T04:30:00Z',
      status: 'failed',
      pairs: [{ pair: 'EUR/SEK', status: 'error', message: 'boom' }],
    };
    render(<StatusBadge status={status} labels={labels} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Pipeline failed');
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1-4 green (66 total: 62 from Task 3 + 4 new `StatusBadge` tests).

- [ ] **Step 5: Commit**

```bash
git add site/src/components/StatusBadge.tsx site/src/components/StatusBadge.test.tsx site/src/styles.css
git commit -m "feat: add StatusBadge component"
```

---

### Task 5: Wire the status badge into `App.tsx`

**Files:**
- Modify: `site/src/lib/i18n.ts`
- Modify: `site/src/App.tsx`
- Modify: `site/src/App.test.tsx`

**Interfaces:**
- Consumes: `fetchStatus` from `site/src/lib/data.ts` (Task 3), `StatusBadge` from `site/src/components/StatusBadge.tsx` (Task 4).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Add i18n keys to `site/src/lib/i18n.ts`**

Add three keys to the `Translation` type, after the existing `createdBy: string;` line:

```ts
  createdBy: string;
  statusOk: string;
  statusPartial: string;
  statusFailed: string;
};
```

Add the `en` values after the existing `createdBy: 'Created by',` line:

```ts
    createdBy: 'Created by',
    statusOk: 'Data pipeline healthy',
    statusPartial: 'Data pipeline partially failed',
    statusFailed: 'Data pipeline failed',
  },
```

Add the `sv` values after the existing `createdBy: 'Skapad av',` line:

```ts
    createdBy: 'Skapad av',
    statusOk: 'Datapipeline OK',
    statusPartial: 'Datapipeline delvis fel',
    statusFailed: 'Datapipeline fel',
  },
};
```

- [ ] **Step 2: Wire it into `site/src/App.tsx`**

Update the imports at the top of the file:

```ts
import StatusBadge from './components/StatusBadge';
```

Add this as a new line directly after the existing `import SnapshotPanel from './components/SnapshotPanel';` line — `StatusBadge` sorts after `SnapshotPanel` alphabetically, and it's the last of the `./components/*` imports.

```ts
import { fetchManifest, fetchSeries, fetchStatus } from './lib/data';
```

(replaces the existing `fetchManifest, fetchSeries` import line)

```ts
import type { FxSeriesFile, ManifestFile, PipelineStatus, RangeOption } from './types';
```

(replaces the existing type-only import line)

Add a new state declaration, next to the existing `const [error, setError] = useState<string | null>(null);` line:

```ts
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
```

Add a new effect, next to the other `useEffect` calls (position doesn't matter functionally since it's independent of the others — place it right after the locale-sync effect and before the manifest-loading effect):

```ts
  useEffect(() => {
    void fetchStatus().then(setStatus);
  }, []);
```

Update the footer JSX — current:

```tsx
      <footer className="footer">
        <span>{t.lastUpdated}: {formatUtc(primarySeriesFile.generated_utc)}</span>
        <span>
          {t.source}:{' '}
          <a href="https://data.ecb.europa.eu" target="_blank" rel="noreferrer">
            European Central Bank (ECB)
          </a>
        </span>
        <span>
          {t.createdBy}:{' '}
          <a href="https://alexahman.se" target="_blank" rel="noreferrer">
            AlexAhman.se
          </a>
        </span>
      </footer>
```

New:

```tsx
      <footer className="footer">
        <span>{t.lastUpdated}: {formatUtc(primarySeriesFile.generated_utc)}</span>
        <StatusBadge
          status={status}
          labels={{ ok: t.statusOk, partial: t.statusPartial, failed: t.statusFailed }}
        />
        <span>
          {t.source}:{' '}
          <a href="https://data.ecb.europa.eu" target="_blank" rel="noreferrer">
            European Central Bank (ECB)
          </a>
        </span>
        <span>
          {t.createdBy}:{' '}
          <a href="https://alexahman.se" target="_blank" rel="noreferrer">
            AlexAhman.se
          </a>
        </span>
      </footer>
```

- [ ] **Step 3: Update `site/src/App.test.tsx`**

This test file uses `vi.mock('./lib/data')` (automock) — every export of `./lib/data`, including the new `fetchStatus`, becomes a `vi.fn()` that resolves to `undefined` by default, NOT a resolved promise wrapping `undefined`. Since `App.tsx` now calls `fetchStatus().then(setStatus)`, if `fetchStatus` isn't given an explicit `mockResolvedValue`, calling `.then()` on `undefined` throws inside the component and both existing tests will fail with a confusing error — not a missing-badge assertion failure. `fetchStatus` MUST be mocked in `beforeEach` for every test, exactly like `fetchManifest`/`fetchSeries` already are.

Update the import line from:

```ts
import { fetchManifest, fetchSeries } from './lib/data';
```

to:

```ts
import { fetchManifest, fetchSeries, fetchStatus } from './lib/data';
```

Add a status fixture near the existing `manifest`/`seriesFile` fixtures:

```ts
const statusPayload = {
  generated_utc: '2024-01-01T00:00:00Z',
  status: 'ok',
  pairs: [{ pair: 'EUR/SEK', status: 'ok', points: 2 }],
};
```

Update the `beforeEach` block from:

```ts
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(fetchSeries).mockResolvedValue(seriesFile);
});
```

to:

```ts
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(fetchSeries).mockResolvedValue(seriesFile);
  vi.mocked(fetchStatus).mockResolvedValue(statusPayload);
});
```

Update the first test to also assert the badge renders — current:

```ts
  it('loads the manifest and series, then renders the dashboard shell', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('FX Monitor');
    expect(screen.getByTestId('chart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('drawdown-chart')).toBeInTheDocument();
    expect(screen.getByTestId('rolling-vol-chart')).toBeInTheDocument();
    expect(screen.getByTestId('returns-histogram-chart')).toBeInTheDocument();
    // 'EUR/SEK' also appears in the pair <option>, so scope to the KPI hint specifically.
    expect(screen.getByText('EUR/SEK', { selector: '.kpi-hint' })).toBeInTheDocument();
  });
```

New:

```ts
  it('loads the manifest and series, then renders the dashboard shell', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('FX Monitor');
    expect(screen.getByTestId('chart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('drawdown-chart')).toBeInTheDocument();
    expect(screen.getByTestId('rolling-vol-chart')).toBeInTheDocument();
    expect(screen.getByTestId('returns-histogram-chart')).toBeInTheDocument();
    // 'EUR/SEK' also appears in the pair <option>, so scope to the KPI hint specifically.
    expect(screen.getByText('EUR/SEK', { selector: '.kpi-hint' })).toBeInTheDocument();
    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Data pipeline healthy');
  });
```

The second test (`'shows an error state when the manifest fails to load'`) needs no changes — it already benefits from `fetchStatus` being mocked in `beforeEach` regardless of what that test asserts.

- [ ] **Step 4: Run the full local verification**

Run: `cd site && npm run lint && npx tsc --noEmit && npm run test && npm run build`
Expected: lint clean, no type errors, all 66 tests passing (unchanged count from Task 4 — this task adds one assertion to an existing test, not a new test case), production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/i18n.ts site/src/App.tsx site/src/App.test.tsx
git commit -m "feat: wire StatusBadge into App footer"
```

---

## Post-plan state

After Task 5: a single currency pair's fetch failure no longer takes down the other five — the pipeline logs the failure, keeps that pair's last-good data file untouched, and still updates everything else. Every run writes `status.json` regardless of outcome, and `update-data.yml` commits and pushes whatever succeeded before re-failing the workflow run (preserving the existing GitHub failure-email behavior). The live site shows a small footer badge reflecting pipeline health, which quietly does nothing if `status.json` is ever unavailable.
