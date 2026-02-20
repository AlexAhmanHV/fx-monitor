import type { FxPoint, RangeOption } from '../types';

export type KpiMetrics = {
  latest: number | null;
  change1d: number | null;
  change1w: number | null;
  change1m: number | null;
  ma30: number | null;
  vol30LogReturnPct: number | null;
  min: number | null;
  max: number | null;
};

function pctChange(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}

function findPreviousByDays(series: FxPoint[], daysBack: number): FxPoint | null {
  if (series.length === 0) return null;
  const latestDate = new Date(series[series.length - 1].date);
  latestDate.setUTCDate(latestDate.getUTCDate() - daysBack);
  const target = latestDate.toISOString().slice(0, 10);

  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].date <= target) {
      return series[i];
    }
  }
  return null;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function filterSeriesByRange(series: FxPoint[], range: RangeOption): FxPoint[] {
  if (range === 'ALL' || series.length === 0) return series;
  const days = range === '30D' ? 30 : range === '90D' ? 90 : 365;
  const latest = new Date(series[series.length - 1].date);
  latest.setUTCDate(latest.getUTCDate() - days);
  const threshold = latest.toISOString().slice(0, 10);
  return series.filter((point) => point.date >= threshold);
}

export function calculateKpis(fullSeries: FxPoint[], selectedSeries: FxPoint[]): KpiMetrics {
  if (selectedSeries.length === 0 || fullSeries.length === 0) {
    return {
      latest: null,
      change1d: null,
      change1w: null,
      change1m: null,
      ma30: null,
      vol30LogReturnPct: null,
      min: null,
      max: null,
    };
  }

  const latest = selectedSeries[selectedSeries.length - 1].rate;
  const prev1d = findPreviousByDays(fullSeries, 1);
  const prev1w = findPreviousByDays(fullSeries, 7);
  const prev1m = findPreviousByDays(fullSeries, 30);

  const trailing30 = fullSeries.slice(-30);
  const ma30 = trailing30.length
    ? trailing30.reduce((acc, point) => acc + point.rate, 0) / trailing30.length
    : null;

  const trailing31 = fullSeries.slice(-31);
  const logReturns: number[] = [];
  for (let i = 1; i < trailing31.length; i += 1) {
    const prev = trailing31[i - 1].rate;
    const curr = trailing31[i].rate;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  const vol30LogReturnPct = logReturns.length ? stdDev(logReturns) * 100 : null;

  const rates = selectedSeries.map((p) => p.rate);

  return {
    latest,
    change1d: prev1d ? pctChange(latest, prev1d.rate) : null,
    change1w: prev1w ? pctChange(latest, prev1w.rate) : null,
    change1m: prev1m ? pctChange(latest, prev1m.rate) : null,
    ma30,
    vol30LogReturnPct,
    min: Math.min(...rates),
    max: Math.max(...rates),
  };
}
