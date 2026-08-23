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
