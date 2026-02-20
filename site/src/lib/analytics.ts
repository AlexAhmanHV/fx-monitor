import type {
  EventMarker,
  FxPoint,
  HistogramBin,
  MetricPoint,
  RegimeBand,
  RegimeType,
  SnapshotSummary,
} from '../types';

const EVENT_CATALOG = [
  { date: '2025-12-12', label: 'US CPI' },
  { date: '2026-01-23', label: 'ECB Rate Decision' },
  { date: '2026-02-06', label: 'US NFP' },
];

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
}

function classifyVolRegime(value: number, lowThreshold: number, highThreshold: number): RegimeType {
  if (value <= lowThreshold) return 'low';
  if (value >= highThreshold) return 'high';
  return 'normal';
}

export function buildLogReturnSeries(series: FxPoint[]): MetricPoint[] {
  const output: MetricPoint[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].rate;
    const curr = series[i].rate;
    if (prev > 0 && curr > 0) {
      output.push({ date: series[i].date, value: Math.log(curr / prev) * 100 });
    }
  }
  return output;
}

export function buildRollingVolatilitySeries(series: FxPoint[], window = 30): MetricPoint[] {
  const returns = buildLogReturnSeries(series);
  if (returns.length < 2) {
    return [];
  }

  const output: MetricPoint[] = [];
  for (let i = window - 1; i < returns.length; i += 1) {
    const slice = returns.slice(i - window + 1, i + 1).map((point) => point.value / 100);
    output.push({
      date: returns[i].date,
      value: stdDev(slice) * 100,
    });
  }
  return output;
}

export function buildDrawdownSeries(series: FxPoint[]): MetricPoint[] {
  if (!series.length) {
    return [];
  }

  let runningPeak = series[0].rate;
  return series.map((point) => {
    if (point.rate > runningPeak) {
      runningPeak = point.rate;
    }
    const drawdown = ((point.rate - runningPeak) / runningPeak) * 100;
    return { date: point.date, value: drawdown };
  });
}

export function buildReturnsHistogram(series: FxPoint[], bins = 16): HistogramBin[] {
  const returns = buildLogReturnSeries(series).map((point) => point.value);
  if (!returns.length) {
    return [];
  }

  const min = Math.min(...returns);
  const max = Math.max(...returns);
  if (min === max) {
    return [{ label: `${min.toFixed(2)}%`, count: returns.length }];
  }

  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);

  for (const ret of returns) {
    const index = Math.min(bins - 1, Math.floor((ret - min) / width));
    counts[index] += 1;
  }

  return counts.map((count, idx) => {
    const start = min + idx * width;
    const end = start + width;
    return {
      label: `${start.toFixed(2)}..${end.toFixed(2)}`,
      count,
    };
  });
}

export function buildVolatilityRegimeBands(volSeries: MetricPoint[]): RegimeBand[] {
  if (!volSeries.length) return [];

  const values = volSeries.map((point) => point.value);
  const lowThreshold = percentile(values, 0.33);
  const highThreshold = percentile(values, 0.67);

  const bands: RegimeBand[] = [];
  let start = volSeries[0].date;
  let regime = classifyVolRegime(volSeries[0].value, lowThreshold, highThreshold);

  for (let i = 1; i < volSeries.length; i += 1) {
    const current = volSeries[i];
    const nextRegime = classifyVolRegime(current.value, lowThreshold, highThreshold);
    if (nextRegime !== regime) {
      bands.push({ startDate: start, endDate: volSeries[i - 1].date, regime });
      start = current.date;
      regime = nextRegime;
    }
  }

  bands.push({ startDate: start, endDate: volSeries[volSeries.length - 1].date, regime });
  return bands;
}

export function buildEventMarkers(series: FxPoint[], normalized: boolean): EventMarker[] {
  if (!series.length) return [];
  const dateToRate = new Map(series.map((point) => [point.date, point.rate]));
  const base = series[0].rate;

  return EVENT_CATALOG.map((event) => {
    const rate = dateToRate.get(event.date);
    if (typeof rate !== 'number') return null;
    return {
      date: event.date,
      label: event.label,
      value: normalized ? (rate / base) * 100 : rate,
    };
  }).filter((item): item is EventMarker => item !== null);
}

export function buildSnapshotSummary(series: FxPoint[], volSeries: MetricPoint[]): SnapshotSummary {
  if (!series.length) {
    return {
      trend30dPct: null,
      volatilityRegime: 'normal',
      observations: 0,
      latestDate: null,
    };
  }

  const latest = series[series.length - 1];
  const baseIdx = Math.max(0, series.length - 31);
  const start = series[baseIdx];
  const trend30dPct = start.rate > 0 ? ((latest.rate - start.rate) / start.rate) * 100 : null;

  const values = volSeries.map((point) => point.value);
  const lowThreshold = percentile(values, 0.33);
  const highThreshold = percentile(values, 0.67);
  const lastVol = volSeries[volSeries.length - 1]?.value ?? 0;

  return {
    trend30dPct,
    volatilityRegime: classifyVolRegime(lastVol, lowThreshold, highThreshold),
    observations: series.length,
    latestDate: latest.date,
  };
}
