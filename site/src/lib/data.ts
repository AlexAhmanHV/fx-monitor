import type { FxSeriesFile, ManifestFile } from '../types';

function isValidSeriesPoint(value: unknown): value is { date: string; rate: number } {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return typeof point.date === 'string' && typeof point.rate === 'number' && point.rate > 0;
}

function assertManifest(json: unknown): asserts json is ManifestFile {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid manifest payload.');
  }

  const payload = json as Record<string, unknown>;
  if (!Array.isArray(payload.pairs)) {
    throw new Error('Manifest missing pairs array.');
  }

  for (const item of payload.pairs) {
    if (!item || typeof item !== 'object') throw new Error('Manifest pair is invalid.');
    const pair = item as Record<string, unknown>;
    if (typeof pair.pair !== 'string' || typeof pair.file !== 'string') {
      throw new Error('Manifest pair has invalid shape.');
    }
  }
}

function assertSeriesFile(json: unknown): asserts json is FxSeriesFile {
  if (!json || typeof json !== 'object') throw new Error('Invalid data file payload.');
  const payload = json as Record<string, unknown>;
  if (typeof payload.pair !== 'string' || !Array.isArray(payload.series)) {
    throw new Error('Data file is missing pair or series.');
  }
  if (!payload.series.every(isValidSeriesPoint)) {
    throw new Error('Data file contains invalid series points.');
  }
}

export async function fetchManifest(): Promise<ManifestFile> {
  const res = await fetch('/data/manifest.json', { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Could not load manifest (${res.status}).`);
  const json = (await res.json()) as unknown;
  assertManifest(json);
  return json;
}

export async function fetchSeries(fileName: string): Promise<FxSeriesFile> {
  const res = await fetch(`/data/${fileName}`, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Could not load series (${res.status}).`);
  const json = (await res.json()) as unknown;
  assertSeriesFile(json);
  return json;
}
