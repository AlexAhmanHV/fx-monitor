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

  it('keeps only points within the last 90 or 365 days of a longer series', () => {
    const series400 = makeDailySeries(400, '2023-01-01', (i) => i + 1);
    const filtered90 = filterSeriesByRange(series400, '90D');
    expect(filtered90).toHaveLength(91);

    const filtered365 = filterSeriesByRange(series400, '365D');
    expect(filtered365).toHaveLength(366);
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

  it('finds the nearest earlier point across a banking-day gap for change1d', () => {
    const series: FxPoint[] = [
      { date: '2024-01-05', rate: 10 },
      { date: '2024-01-08', rate: 12 },
    ];
    const result = calculateKpis(series, series);

    expect(result.latest).toBe(12);
    expect(result.change1d).toBeCloseTo(20, 6);
    expect(result.change1w).toBeNull();
    expect(result.change1m).toBeNull();
    expect(result.ma30).toBeCloseTo(11, 6);
    expect(result.vol30LogReturnPct).toBe(0);
    expect(result.min).toBe(10);
    expect(result.max).toBe(12);
  });
});
