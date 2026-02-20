export type FxPoint = {
  date: string;
  rate: number;
};

export type MetricPoint = {
  date: string;
  value: number;
};

export type HistogramBin = {
  label: string;
  count: number;
};

export type RegimeType = 'low' | 'normal' | 'high';

export type RegimeBand = {
  startDate: string;
  endDate: string;
  regime: RegimeType;
};

export type EventMarker = {
  date: string;
  label: string;
  value: number;
};

export type SnapshotSummary = {
  trend30dPct: number | null;
  volatilityRegime: RegimeType;
  observations: number;
  latestDate: string | null;
};

export type FxSeriesFile = {
  pair: string;
  source: string;
  generated_utc: string;
  series: FxPoint[];
};

export type ManifestItem = {
  pair: string;
  file: string;
  series_key: string;
};

export type ManifestFile = {
  source: string;
  generated_utc: string;
  pairs: ManifestItem[];
};

export type RangeOption = '30D' | '90D' | '365D' | 'ALL';
