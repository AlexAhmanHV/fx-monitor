# Frontend Tests + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated test coverage to the `site/` React frontend (currently zero tests) and a CI workflow that gates every PR/push on lint, typecheck, test, and build for both the frontend and the existing Python pipeline.

**Architecture:** Vitest (reusing the existing Vite config) + jsdom + React Testing Library for the frontend test suite. Chart-wrapping components are tested by mocking `react-chartjs-2`'s exports, so no canvas polyfill is needed. A new `.github/workflows/ci.yml` runs a `site` job (npm lint/typecheck/test/build) and a `pipeline` job (ruff/pytest) on every PR and push to `main`, independent of the existing `update-data.yml` cron workflow.

**Tech Stack:** Vitest ^3, jsdom ^25, @testing-library/react ^16, @testing-library/jest-dom ^6, @vitest/coverage-v8 ^3 (existing: React 18.3, TypeScript 5.7, Vite 6, Chart.js 4 / react-chartjs-2 5).

## Global Constraints

- No coverage-percentage gate in CI — tests must pass, coverage is informational only (`npm run test:coverage`, run manually).
- Test files are co-located next to the source file they cover (`Foo.ts` → `Foo.test.ts`), matching Vitest's default discovery glob.
- The implementation under test already exists and is not changing. Each step below is "write test → run it → confirm it passes" rather than the fail-first TDD ritual, since there is no new production behavior being driven out. If a test fails unexpectedly against the existing implementation, stop and report it — do not silently change production code to make a test pass without understanding why.
- Chart.js/react-chartjs-2 components are tested by mocking `react-chartjs-2`'s `Line`/`Bar` exports with a stub that records props — never add a canvas polyfill package, it's unnecessary given this approach.
- All new npm devDependencies go in `site/package.json`; the Python pipeline's dependencies (`pipeline/requirements.txt`) are untouched by this plan.

---

### Task 1: Test tooling setup + `lib/calc.ts` coverage

**Files:**
- Modify: `site/vite.config.ts`
- Create: `site/src/test/setup.ts`
- Modify: `site/package.json`
- Create: `site/src/lib/calc.test.ts`

**Interfaces:**
- Consumes: `filterSeriesByRange(series: FxPoint[], range: RangeOption): FxPoint[]` and `calculateKpis(fullSeries: FxPoint[], selectedSeries: FxPoint[]): KpiMetrics` from `site/src/lib/calc.ts` (existing, unchanged). `FxPoint`, `RangeOption` from `site/src/types.ts` (existing, unchanged).
- Produces: working Vitest harness (`npm run test` in `site/`) that every later task's test files rely on. `npm run test:watch` and `npm run test:coverage` scripts.

- [ ] **Step 1: Add test scripts to `site/package.json`**

In the `"scripts"` object, add after `"lint": "eslint ."`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
```

(`devDependencies` is handled by Step 2 below — `npm install --save-dev` writes those entries itself, so they aren't hand-edited here.)

- [ ] **Step 2: Install test dependencies**

Run: `cd site && npm install vitest@^3.0.5 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @vitest/coverage-v8@^3.0.5 --save-dev`

Expected: `package.json`'s `devDependencies` gains all five packages (alphabetically re-sorted by npm) and `package-lock.json` updates, no errors.

- [ ] **Step 3: Switch `site/vite.config.ts` to Vitest's config helper**

Replace the entire file content:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

(`vitest/config` re-exports Vite's `defineConfig` with the `test` field typed — this is the standard way to share one config file between Vite and Vitest.)

- [ ] **Step 4: Create the test setup file**

Create `site/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write `site/src/lib/calc.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { calculateKpis, filterSeriesByRange } from './calc';
import type { FxPoint } from '../types';

function makeDailySeries(
  count: number,
  startDate: string,
  rateFn: (i: number) => number,
): FxPoint[] {
  const points: FxPoint[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    points.push({ date: cursor.toISOString().slice(0, 10), rate: rateFn(i) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

describe('filterSeriesByRange', () => {
  it('returns an empty array unchanged', () => {
    expect(filterSeriesByRange([], '30D')).toEqual([]);
  });

  it('returns the full series for range "ALL"', () => {
    const series = makeDailySeries(5, '2024-01-01', (i) => i + 1);
    expect(filterSeriesByRange(series, 'ALL')).toEqual(series);
  });

  it('keeps every point when the series is shorter than the range', () => {
    const series = makeDailySeries(5, '2024-01-01', (i) => i + 1);
    expect(filterSeriesByRange(series, '30D')).toHaveLength(5);
  });

  it('keeps only points within the last 30 days of a longer series', () => {
    const series = makeDailySeries(40, '2024-01-01', (i) => i + 1);
    const filtered = filterSeriesByRange(series, '30D');
    expect(filtered).toHaveLength(31);
    expect(filtered[0].date).toBe('2024-01-10');
    expect(filtered[filtered.length - 1].date).toBe('2024-02-09');
  });
});

describe('calculateKpis', () => {
  it('returns all nulls for an empty series', () => {
    expect(calculateKpis([], [])).toEqual({
      latest: null,
      change1d: null,
      change1w: null,
      change1m: null,
      ma30: null,
      vol30LogReturnPct: null,
      min: null,
      max: null,
    });
  });

  it('handles a single-point series (no history to diff against)', () => {
    const single = makeDailySeries(1, '2024-01-01', () => 10);
    expect(calculateKpis(single, single)).toEqual({
      latest: 10,
      change1d: null,
      change1w: null,
      change1m: null,
      ma30: 10,
      vol30LogReturnPct: null,
      min: 10,
      max: 10,
    });
  });

  it('computes KPIs for a 35-day series with a known linear trend', () => {
    const series = makeDailySeries(35, '2024-01-01', (i) => 100 + i);
    const result = calculateKpis(series, series);

    expect(result.latest).toBe(134);
    expect(result.change1d).toBeCloseTo(0.7518797, 6);
    expect(result.change1w).toBeCloseTo(5.5118110, 6);
    expect(result.change1m).toBeCloseTo(28.8461538, 6);
    expect(result.ma30).toBeCloseTo(119.5, 6);
    expect(result.vol30LogReturnPct).toBeCloseTo(0.0628994, 6);
    expect(result.min).toBe(100);
    expect(result.max).toBe(134);
  });
});
```

- [ ] **Step 6: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, 7 tests passing (4 in `filterSeriesByRange`, 3 in `calculateKpis`). All green, no failures.

- [ ] **Step 7: Commit**

```bash
git add site/package.json site/package-lock.json site/vite.config.ts site/src/test/setup.ts site/src/lib/calc.test.ts
git commit -m "test: set up Vitest and add lib/calc.ts coverage"
```

---

### Task 2: `lib/analytics.ts` coverage

**Files:**
- Create: `site/src/lib/analytics.test.ts`

**Interfaces:**
- Consumes: all seven exports of `site/src/lib/analytics.ts` (existing, unchanged): `buildLogReturnSeries`, `buildRollingVolatilitySeries`, `buildDrawdownSeries`, `buildReturnsHistogram`, `buildVolatilityRegimeBands`, `buildEventMarkers`, `buildSnapshotSummary`. Types `FxPoint`, `MetricPoint` from `../types`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `site/src/lib/analytics.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildDrawdownSeries,
  buildEventMarkers,
  buildLogReturnSeries,
  buildReturnsHistogram,
  buildRollingVolatilitySeries,
  buildSnapshotSummary,
  buildVolatilityRegimeBands,
} from './analytics';
import type { FxPoint, MetricPoint } from '../types';

function fx(rates: number[], startDate = '2024-01-01'): FxPoint[] {
  const cursor = new Date(`${startDate}T00:00:00Z`);
  return rates.map((rate) => {
    const date = cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    return { date, rate };
  });
}

describe('buildLogReturnSeries', () => {
  it('returns one log-return point per consecutive pair', () => {
    const result = buildLogReturnSeries(fx([100, 110, 105, 115]));
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2024-01-02');
    expect(result[0].value).toBeCloseTo(9.5310180, 6);
    expect(result[1].value).toBeCloseTo(-4.6520016, 6);
    expect(result[2].value).toBeCloseTo(9.0971778, 6);
  });

  it('returns an empty array for a single-point series', () => {
    expect(buildLogReturnSeries(fx([100]))).toEqual([]);
  });
});

describe('buildRollingVolatilitySeries', () => {
  it('returns an empty array when there are fewer than 2 log returns', () => {
    expect(buildRollingVolatilitySeries([], 3)).toEqual([]);
    expect(buildRollingVolatilitySeries(fx([100]), 3)).toEqual([]);
  });

  it('computes a rolling standard deviation over the given window', () => {
    const result = buildRollingVolatilitySeries(fx([100, 102, 101, 103, 104, 102]), 3);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2024-01-04');
    expect(result[0].value).toBeCloseTo(1.7065506, 6);
    expect(result[1].value).toBeCloseTo(1.4987079, 6);
    expect(result[2].value).toBeCloseTo(2.0279926, 6);
  });
});

describe('buildDrawdownSeries', () => {
  it('returns an empty array for an empty series', () => {
    expect(buildDrawdownSeries([])).toEqual([]);
  });

  it('tracks percentage drop from the running peak', () => {
    const result = buildDrawdownSeries(fx([100, 105, 102, 110, 90, 95]));
    const values = result.map((p) => p.value);
    expect(values[0]).toBe(0);
    expect(values[1]).toBe(0);
    expect(values[2]).toBeCloseTo(-2.8571429, 6);
    expect(values[3]).toBe(0);
    expect(values[4]).toBeCloseTo(-18.1818182, 6);
    expect(values[5]).toBeCloseTo(-13.6363636, 6);
  });
});

describe('buildReturnsHistogram', () => {
  it('returns a single bin when every log return is identical', () => {
    expect(buildReturnsHistogram(fx([100, 100, 100]))).toEqual([{ label: '0.00%', count: 2 }]);
  });

  it('bins log returns across the observed range', () => {
    const result = buildReturnsHistogram(fx([100, 110, 105, 115, 108]), 4);
    expect(result).toEqual([
      { label: '-6.28..-2.33', count: 2 },
      { label: '-2.33..1.63', count: 0 },
      { label: '1.63..5.58', count: 0 },
      { label: '5.58..9.53', count: 2 },
    ]);
  });
});

describe('buildVolatilityRegimeBands', () => {
  it('returns an empty array for an empty series', () => {
    expect(buildVolatilityRegimeBands([])).toEqual([]);
  });

  it('groups consecutive points into low/normal/high regime bands', () => {
    const volSeries: MetricPoint[] = [1, 2, 5, 3, 8, 9, 2].map((value, i) => ({
      date: `2024-01-0${i + 1}`,
      value,
    }));

    expect(buildVolatilityRegimeBands(volSeries)).toEqual([
      { startDate: '2024-01-01', endDate: '2024-01-02', regime: 'low' },
      { startDate: '2024-01-03', endDate: '2024-01-03', regime: 'high' },
      { startDate: '2024-01-04', endDate: '2024-01-04', regime: 'normal' },
      { startDate: '2024-01-05', endDate: '2024-01-06', regime: 'high' },
      { startDate: '2024-01-07', endDate: '2024-01-07', regime: 'low' },
    ]);
  });
});

describe('buildEventMarkers', () => {
  it('returns an empty array for an empty series', () => {
    expect(buildEventMarkers([], false)).toEqual([]);
  });

  it('includes only events whose date is present in the series', () => {
    const series: FxPoint[] = [
      { date: '2025-12-01', rate: 50 },
      { date: '2025-12-12', rate: 110 },
    ];
    expect(buildEventMarkers(series, false)).toEqual([
      { date: '2025-12-12', label: 'US CPI', value: 110 },
    ]);
  });

  it('normalizes the value to index-100 base when normalized is true', () => {
    const series: FxPoint[] = [
      { date: '2025-12-01', rate: 50 },
      { date: '2025-12-12', rate: 110 },
    ];
    const result = buildEventMarkers(series, true);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-12-12');
    expect(result[0].value).toBeCloseTo(220, 5);
  });
});

describe('buildSnapshotSummary', () => {
  it('returns the empty-state summary for an empty series', () => {
    expect(buildSnapshotSummary([], [])).toEqual({
      trend30dPct: null,
      volatilityRegime: 'normal',
      observations: 0,
      latestDate: null,
    });
  });

  it('computes trend, regime, and observation count from the fixtures', () => {
    const series: FxPoint[] = [100, 102, 104, 103, 106].map((rate, i) => ({
      date: `2024-01-0${i + 1}`,
      rate,
    }));
    const volSeries: MetricPoint[] = [1, 2, 5, 3, 8].map((value, i) => ({
      date: `2024-01-0${i + 1}`,
      value,
    }));

    expect(buildSnapshotSummary(series, volSeries)).toEqual({
      trend30dPct: 6,
      volatilityRegime: 'high',
      observations: 5,
      latestDate: '2024-01-05',
    });
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all `analytics.test.ts` tests green in addition to Task 1's `calc.test.ts` tests.

- [ ] **Step 3: Commit**

```bash
git add site/src/lib/analytics.test.ts
git commit -m "test: add lib/analytics.ts coverage"
```

---

### Task 3: `lib/format.ts` + `lib/i18n.ts` coverage

**Files:**
- Create: `site/src/lib/format.test.ts`
- Create: `site/src/lib/i18n.test.ts`

**Interfaces:**
- Consumes: `formatPct`, `formatRate`, `formatDate`, `formatUtc` from `site/src/lib/format.ts` (existing, unchanged). `translations` from `site/src/lib/i18n.ts` (existing, unchanged).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `site/src/lib/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatDate, formatPct, formatRate, formatUtc } from './format';

describe('formatPct', () => {
  it('returns "N/A" for null', () => {
    expect(formatPct(null)).toBe('N/A');
  });

  it('returns "N/A" for NaN', () => {
    expect(formatPct(Number.NaN)).toBe('N/A');
  });

  it('prefixes non-negative values with a plus sign', () => {
    expect(formatPct(5.1234)).toBe('+5.12%');
    expect(formatPct(0)).toBe('+0.00%');
  });

  it('does not add a sign for negative values (toFixed already includes the minus)', () => {
    expect(formatPct(-3.456)).toBe('-3.46%');
  });
});

describe('formatRate', () => {
  it('returns "N/A" for null', () => {
    expect(formatRate(null)).toBe('N/A');
  });

  it('returns "N/A" for NaN', () => {
    expect(formatRate(Number.NaN)).toBe('N/A');
  });

  it('formats to 4 decimal places', () => {
    expect(formatRate(1.23456)).toBe('1.2346');
    expect(formatRate(-1.23456)).toBe('-1.2346');
  });
});

describe('formatDate / formatUtc', () => {
  it('pass the input string through unchanged', () => {
    expect(formatDate('2024-01-01')).toBe('2024-01-01');
    expect(formatUtc('2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
  });
});
```

- [ ] **Step 2: Write `site/src/lib/i18n.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { translations } from './i18n';

describe('translations', () => {
  it('defines the exact same set of keys for every locale', () => {
    const enKeys = Object.keys(translations.en).sort();
    const svKeys = Object.keys(translations.sv).sort();
    expect(svKeys).toEqual(enKeys);
  });

  it('has no empty string values in either locale', () => {
    for (const locale of ['en', 'sv'] as const) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value, `${locale}.${key} should not be empty`).not.toBe('');
      }
    }
  });
});
```

- [ ] **Step 3: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1–3 green.

- [ ] **Step 4: Commit**

```bash
git add site/src/lib/format.test.ts site/src/lib/i18n.test.ts
git commit -m "test: add lib/format.ts and lib/i18n.ts coverage"
```

---

### Task 4: `lib/data.ts` coverage

**Files:**
- Create: `site/src/lib/data.test.ts`

**Interfaces:**
- Consumes: `fetchManifest(): Promise<ManifestFile>`, `fetchSeries(fileName: string): Promise<FxSeriesFile>` from `site/src/lib/data.ts` (existing, unchanged).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `site/src/lib/data.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManifest, fetchSeries } from './data';

function mockFetchOnce(response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchManifest', () => {
  it('resolves with a valid manifest payload', async () => {
    const payload = {
      source: 'ECB',
      generated_utc: '2024-01-01T00:00:00Z',
      pairs: [{ pair: 'EUR/SEK', file: 'fx_EURSEK.json', series_key: 'EURSEK' }],
    };
    mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });
    await expect(fetchManifest()).resolves.toEqual(payload);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });
    await expect(fetchManifest()).rejects.toThrow('Could not load manifest (404).');
  });

  it('throws when the payload has no pairs array', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({}) });
    await expect(fetchManifest()).rejects.toThrow('Manifest missing pairs array.');
  });

  it('throws when a pair entry has an invalid shape', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({ pairs: [{ pair: 'EUR/SEK' }] }) });
    await expect(fetchManifest()).rejects.toThrow('Manifest pair has invalid shape.');
  });
});

describe('fetchSeries', () => {
  it('resolves with a valid series payload', async () => {
    const payload = {
      pair: 'EUR/SEK',
      source: 'ECB',
      generated_utc: '2024-01-01T00:00:00Z',
      series: [{ date: '2024-01-01', rate: 11.2 }],
    };
    mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });
    await expect(fetchSeries('fx_EURSEK.json')).resolves.toEqual(payload);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(fetchSeries('fx_EURSEK.json')).rejects.toThrow('Could not load series (500).');
  });

  it('throws when the payload is missing pair or series', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({ pair: 'EUR/SEK' }) });
    await expect(fetchSeries('fx_EURSEK.json')).rejects.toThrow(
      'Data file is missing pair or series.',
    );
  });

  it('throws when a series point has an invalid shape', async () => {
    mockFetchOnce({
      ok: true,
      json: () =>
        Promise.resolve({ pair: 'EUR/SEK', series: [{ date: '2024-01-01', rate: -1 }] }),
    });
    await expect(fetchSeries('fx_EURSEK.json')).rejects.toThrow(
      'Data file contains invalid series points.',
    );
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1–4 green.

- [ ] **Step 3: Commit**

```bash
git add site/src/lib/data.test.ts
git commit -m "test: add lib/data.ts coverage"
```

---

### Task 5: `KpiCard` + `SnapshotPanel` component coverage

**Files:**
- Create: `site/src/components/KpiCard.test.tsx`
- Create: `site/src/components/SnapshotPanel.test.tsx`

**Interfaces:**
- Consumes: `KpiCard` (props `{ label: string; value: string; hint?: string }`) and `SnapshotPanel` (props `{ summary: SnapshotSummary; labels: {...} }`) from `site/src/components/KpiCard.tsx` / `SnapshotPanel.tsx` (existing, unchanged).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `site/src/components/KpiCard.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KpiCard from './KpiCard';

describe('KpiCard', () => {
  it('renders the label and value', () => {
    render(<KpiCard label="Latest rate" value="11.2345" />);
    expect(screen.getByText('Latest rate')).toBeInTheDocument();
    expect(screen.getByText('11.2345')).toBeInTheDocument();
  });

  it('renders the hint when provided', () => {
    render(<KpiCard label="MA30" value="11.10" hint="30-day moving average" />);
    expect(screen.getByText('30-day moving average')).toBeInTheDocument();
  });

  it('omits the hint element when not provided', () => {
    const { container } = render(<KpiCard label="Min" value="10.0" />);
    expect(container.querySelector('.kpi-hint')).toBeNull();
  });
});
```

- [ ] **Step 2: Write `site/src/components/SnapshotPanel.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SnapshotPanel from './SnapshotPanel';
import type { SnapshotSummary } from '../types';

const labels = {
  title: 'Market snapshot',
  trend30: '30D trend',
  volRegime: 'Volatility regime',
  observations: 'Observations',
  regimeLow: 'Low',
  regimeNormal: 'Normal',
  regimeHigh: 'High',
};

function summary(overrides: Partial<SnapshotSummary>): SnapshotSummary {
  return {
    trend30dPct: 1.5,
    volatilityRegime: 'normal',
    observations: 100,
    latestDate: '2024-01-01',
    ...overrides,
  };
}

describe('SnapshotPanel', () => {
  it('renders the trend, regime label, and observation count', () => {
    render(<SnapshotPanel summary={summary({ volatilityRegime: 'normal' })} labels={labels} />);
    expect(screen.getByText('+1.50%')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('maps the "low" regime to its label', () => {
    render(<SnapshotPanel summary={summary({ volatilityRegime: 'low' })} labels={labels} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('maps the "high" regime to its label', () => {
    render(<SnapshotPanel summary={summary({ volatilityRegime: 'high' })} labels={labels} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1–5 green.

- [ ] **Step 4: Commit**

```bash
git add site/src/components/KpiCard.test.tsx site/src/components/SnapshotPanel.test.tsx
git commit -m "test: add KpiCard and SnapshotPanel component coverage"
```

---

### Task 6: `ChartPanel` component coverage

**Files:**
- Create: `site/src/components/ChartPanel.test.tsx`

**Interfaces:**
- Consumes: `ChartPanel` (props `{ series, normalized, labels, regimeBands, eventMarkers }`) from `site/src/components/ChartPanel.tsx` (existing, unchanged).
- Produces: the `react-chartjs-2` mocking pattern used again in Task 7.

- [ ] **Step 1: Write `site/src/components/ChartPanel.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChartPanel from './ChartPanel';

vi.mock('react-chartjs-2', () => ({
  Line: (props: Record<string, unknown>) => (
    <div data-testid="line-chart" data-props={JSON.stringify(props)} />
  ),
}));

function getChartProps() {
  const el = screen.getByTestId('line-chart');
  return JSON.parse(el.getAttribute('data-props') as string);
}

const labels = { rateHistory: 'Rate history', relativePerformance: 'Relative performance' };

describe('ChartPanel', () => {
  it('renders raw rates for a single series when not normalized', () => {
    render(
      <ChartPanel
        series={[
          {
            pair: 'EUR/SEK',
            data: [
              { date: '2024-01-01', rate: 10 },
              { date: '2024-01-02', rate: 11 },
            ],
          },
        ]}
        normalized={false}
        labels={labels}
        regimeBands={[]}
        eventMarkers={[]}
      />,
    );

    expect(screen.getByText('Rate history')).toBeInTheDocument();
    const props = getChartProps();
    expect(props.data.labels).toEqual(['2024-01-01', '2024-01-02']);
    expect(props.data.datasets[0].label).toBe('EUR/SEK');
    expect(props.data.datasets[0].data).toEqual([10, 11]);
    expect(props.data.datasets[0].borderColor).toBe('#5ab3ff');
  });

  it('normalizes each series to base-100 and cycles colors when normalized', () => {
    render(
      <ChartPanel
        series={[
          {
            pair: 'A',
            data: [
              { date: '2024-01-01', rate: 10 },
              { date: '2024-01-02', rate: 20 },
            ],
          },
          {
            pair: 'B',
            data: [
              { date: '2024-01-01', rate: 5 },
              { date: '2024-01-02', rate: 6 },
            ],
          },
        ]}
        normalized
        labels={labels}
        regimeBands={[]}
        eventMarkers={[]}
      />,
    );

    expect(screen.getByText('Relative performance')).toBeInTheDocument();
    const props = getChartProps();
    expect(props.data.datasets[0]).toMatchObject({ label: 'A (index)', data: [100, 200] });
    expect(props.data.datasets[1]).toMatchObject({ label: 'B (index)', data: [100, 120] });
  });

  it('adds an Events dataset positioned at the matching dates', () => {
    render(
      <ChartPanel
        series={[
          {
            pair: 'EUR/SEK',
            data: [
              { date: '2024-01-01', rate: 10 },
              { date: '2024-01-02', rate: 11 },
            ],
          },
        ]}
        normalized={false}
        labels={labels}
        regimeBands={[]}
        eventMarkers={[{ date: '2024-01-01', label: 'Event X', value: 99 }]}
      />,
    );

    const props = getChartProps();
    const eventsDataset = props.data.datasets.find(
      (d: { label: string }) => d.label === 'Events',
    );
    expect(eventsDataset.data).toEqual([99, null]);
  });

  it('wires the regime-band plugin through to the chart', () => {
    render(
      <ChartPanel
        series={[{ pair: 'EUR/SEK', data: [{ date: '2024-01-01', rate: 10 }] }]}
        normalized={false}
        labels={labels}
        regimeBands={[{ startDate: '2024-01-01', endDate: '2024-01-01', regime: 'low' }]}
        eventMarkers={[]}
      />,
    );

    const props = getChartProps();
    expect(props.plugins[0].id).toBe('regimeBands');
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1–6 green.

- [ ] **Step 3: Commit**

```bash
git add site/src/components/ChartPanel.test.tsx
git commit -m "test: add ChartPanel component coverage"
```

---

### Task 7: `DrawdownChart` + `RollingVolChart` + `ReturnsHistogramChart` coverage

**Files:**
- Create: `site/src/components/DrawdownChart.test.tsx`
- Create: `site/src/components/RollingVolChart.test.tsx`
- Create: `site/src/components/ReturnsHistogramChart.test.tsx`

**Interfaces:**
- Consumes: `DrawdownChart` / `RollingVolChart` (props `{ data: MetricPoint[]; title: string }`), `ReturnsHistogramChart` (props `{ data: HistogramBin[]; title: string }`) — all existing, unchanged.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `site/src/components/DrawdownChart.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DrawdownChart from './DrawdownChart';

vi.mock('react-chartjs-2', () => ({
  Line: (props: Record<string, unknown>) => (
    <div data-testid="line-chart" data-props={JSON.stringify(props)} />
  ),
}));

describe('DrawdownChart', () => {
  it('renders the title and wires data/value into the chart dataset', () => {
    render(
      <DrawdownChart
        data={[
          { date: '2024-01-01', value: -2.5 },
          { date: '2024-01-02', value: -5 },
        ]}
        title="Drawdown"
      />,
    );

    expect(screen.getByText('Drawdown')).toBeInTheDocument();
    const props = JSON.parse(screen.getByTestId('line-chart').getAttribute('data-props') as string);
    expect(props.data.labels).toEqual(['2024-01-01', '2024-01-02']);
    expect(props.data.datasets[0]).toMatchObject({
      label: 'Drawdown',
      data: [-2.5, -5],
      borderColor: '#ff9f6e',
    });
  });
});
```

- [ ] **Step 2: Write `site/src/components/RollingVolChart.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RollingVolChart from './RollingVolChart';

vi.mock('react-chartjs-2', () => ({
  Line: (props: Record<string, unknown>) => (
    <div data-testid="line-chart" data-props={JSON.stringify(props)} />
  ),
}));

describe('RollingVolChart', () => {
  it('renders the title and wires data/value into the chart dataset', () => {
    render(
      <RollingVolChart
        data={[
          { date: '2024-01-01', value: 1.2 },
          { date: '2024-01-02', value: 1.8 },
        ]}
        title="Rolling volatility (30D)"
      />,
    );

    expect(screen.getByText('Rolling volatility (30D)')).toBeInTheDocument();
    const props = JSON.parse(screen.getByTestId('line-chart').getAttribute('data-props') as string);
    expect(props.data.labels).toEqual(['2024-01-01', '2024-01-02']);
    expect(props.data.datasets[0]).toMatchObject({
      label: 'Rolling volatility (30D)',
      data: [1.2, 1.8],
      borderColor: '#78f3da',
    });
  });
});
```

- [ ] **Step 3: Write `site/src/components/ReturnsHistogramChart.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReturnsHistogramChart from './ReturnsHistogramChart';

vi.mock('react-chartjs-2', () => ({
  Bar: (props: Record<string, unknown>) => (
    <div data-testid="bar-chart" data-props={JSON.stringify(props)} />
  ),
}));

describe('ReturnsHistogramChart', () => {
  it('renders the title and wires bin labels/counts into the chart dataset', () => {
    render(
      <ReturnsHistogramChart
        data={[
          { label: '-1.00..0.00', count: 3 },
          { label: '0.00..1.00', count: 5 },
        ]}
        title="Daily log returns histogram"
      />,
    );

    expect(screen.getByText('Daily log returns histogram')).toBeInTheDocument();
    const props = JSON.parse(screen.getByTestId('bar-chart').getAttribute('data-props') as string);
    expect(props.data.labels).toEqual(['-1.00..0.00', '0.00..1.00']);
    expect(props.data.datasets[0]).toMatchObject({
      label: 'Daily log returns histogram',
      data: [3, 5],
      backgroundColor: 'rgba(90, 179, 255, 0.45)',
    });
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1–7 green.

- [ ] **Step 5: Commit**

```bash
git add site/src/components/DrawdownChart.test.tsx site/src/components/RollingVolChart.test.tsx site/src/components/ReturnsHistogramChart.test.tsx
git commit -m "test: add DrawdownChart, RollingVolChart, ReturnsHistogramChart coverage"
```

---

### Task 8: `App.tsx` smoke test

**Files:**
- Create: `site/src/App.test.tsx`

**Interfaces:**
- Consumes: `App` (default export, no props) from `site/src/App.tsx` (existing, unchanged). Mocks `fetchManifest`/`fetchSeries` from `./lib/data` and the four chart components (`ChartPanel`, `DrawdownChart`, `RollingVolChart`, `ReturnsHistogramChart`) to keep the test focused on data flow rather than re-testing chart rendering (already covered in Tasks 6–7).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `site/src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { fetchManifest, fetchSeries } from './lib/data';

vi.mock('./lib/data');
vi.mock('./components/ChartPanel', () => ({ default: () => <div data-testid="chart-panel" /> }));
vi.mock('./components/DrawdownChart', () => ({
  default: () => <div data-testid="drawdown-chart" />,
}));
vi.mock('./components/RollingVolChart', () => ({
  default: () => <div data-testid="rolling-vol-chart" />,
}));
vi.mock('./components/ReturnsHistogramChart', () => ({
  default: () => <div data-testid="returns-histogram-chart" />,
}));

const manifest = {
  source: 'ECB',
  generated_utc: '2024-01-01T00:00:00Z',
  pairs: [{ pair: 'EUR/SEK', file: 'fx_EURSEK.json', series_key: 'EURSEK' }],
};

const seriesFile = {
  pair: 'EUR/SEK',
  source: 'ECB',
  generated_utc: '2024-01-01T00:00:00Z',
  series: [
    { date: '2024-01-01', rate: 11.2 },
    { date: '2024-01-02', rate: 11.3 },
  ],
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.mocked(fetchManifest).mockResolvedValue(manifest);
  vi.mocked(fetchSeries).mockResolvedValue(seriesFile);
});

describe('App', () => {
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

  it('shows an error state when the manifest fails to load', async () => {
    vi.mocked(fetchManifest).mockRejectedValue(new Error('network down'));
    render(<App />);
    expect(await screen.findByText('network down')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `cd site && npm run test`
Expected: `PASS`, all tests from Tasks 1–8 green.

- [ ] **Step 3: Commit**

```bash
git add site/src/App.test.tsx
git commit -m "test: add App.tsx smoke test"
```

---

### Task 9: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `site/package.json` scripts (`lint`, `test`, `build`) from Task 1; `pipeline/requirements.txt`, `pipeline/tests/` (existing, unchanged).
- Produces: nothing consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  site:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: site/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build

  pipeline:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r pipeline/requirements.txt

      - name: Lint
        run: python -m ruff check pipeline

      - name: Test
        run: python -m pytest pipeline/tests
```

- [ ] **Step 2: Run the full local verification the CI workflow will run**

Run: `cd site && npm run lint && npx tsc --noEmit && npm run test && npm run build`
Expected: all four commands exit 0, in order — lint clean, no type errors, all tests pass, production build succeeds.

Run: `python -m ruff check pipeline && python -m pytest pipeline/tests`
Expected: both exit 0 (this should already pass, since it's unchanged from before this plan — confirms the plan didn't accidentally touch pipeline files).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add PR/push workflow for site lint+typecheck+test+build and pipeline lint+test"
```

- [ ] **Step 4: Push and confirm the workflow runs**

Run: `git push`
Then open the repo's Actions tab on GitHub and confirm the new "CI" workflow triggers on the push and both `site` and `pipeline` jobs go green. If either job fails, read its log — do not modify the workflow to "make it pass" without first understanding whether the failure is a real problem (e.g. a lint rule the local environment didn't catch, a Node/Python version mismatch) versus a workflow authoring mistake.

---

## Post-plan state

After Task 9: `site/` has full test coverage matching the design spec (`docs/superpowers/specs/2026-08-23-frontend-tests-ci-design.md`), `npm run test` / `test:watch` / `test:coverage` all work locally, and every PR/push to `main` is gated by a 2-job CI workflow covering both the frontend and the Python pipeline. No coverage threshold is enforced, per the approved design.
