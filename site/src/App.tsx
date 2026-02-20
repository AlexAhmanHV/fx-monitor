import { useEffect, useMemo, useState } from 'react';
import ChartPanel from './components/ChartPanel';
import DrawdownChart from './components/DrawdownChart';
import KpiCard from './components/KpiCard';
import ReturnsHistogramChart from './components/ReturnsHistogramChart';
import RollingVolChart from './components/RollingVolChart';
import SnapshotPanel from './components/SnapshotPanel';
import {
  buildDrawdownSeries,
  buildEventMarkers,
  buildReturnsHistogram,
  buildRollingVolatilitySeries,
  buildSnapshotSummary,
  buildVolatilityRegimeBands,
} from './lib/analytics';
import { calculateKpis, filterSeriesByRange } from './lib/calc';
import { fetchManifest, fetchSeries } from './lib/data';
import { formatDate, formatPct, formatRate, formatUtc } from './lib/format';
import { translations, type Locale } from './lib/i18n';
import type { FxSeriesFile, ManifestFile, RangeOption } from './types';

type Theme = 'dark' | 'light';

const RANGE_VALUES: RangeOption[] = ['30D', '90D', '365D', 'ALL'];

function rangeLabel(range: RangeOption, locale: Locale): string {
  if (range === 'ALL') {
    return locale === 'sv' ? 'Alla' : 'All';
  }
  const map = locale === 'sv' ? { '30D': '30 dagar', '90D': '90 dagar', '365D': '365 dagar' } : { '30D': '30 days', '90D': '90 days', '365D': '365 days' };
  return map[range];
}

function parseInitialState(manifest: ManifestFile) {
  const params = new URLSearchParams(window.location.search);
  const allowed = new Set(manifest.pairs.map((item) => item.file));

  const primaryCandidate = params.get('pair') ?? manifest.pairs[0].file;
  const primaryFile = allowed.has(primaryCandidate) ? primaryCandidate : manifest.pairs[0].file;

  const rangeCandidate = params.get('range');
  const range = RANGE_VALUES.includes(rangeCandidate as RangeOption)
    ? (rangeCandidate as RangeOption)
    : '90D';

  const compareMode = params.get('mode') === 'compare';
  const compareRaw = params.get('compare')?.split(',') ?? [];
  const comparisonFiles = compareRaw
    .filter((file) => allowed.has(file) && file !== primaryFile)
    .slice(0, 2);

  return { primaryFile, range, compareMode, comparisonFiles };
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(
    (() => {
      const raw = localStorage.getItem('fx_monitor_locale');
      return raw === 'sv' ? 'sv' : 'en';
    })(),
  );
  const [theme, setTheme] = useState<Theme>(
    (() => {
      const raw = localStorage.getItem('fx_monitor_theme');
      return raw === 'light' ? 'light' : 'dark';
    })(),
  );
  const [manifest, setManifest] = useState<ManifestFile | null>(null);
  const [seriesCache, setSeriesCache] = useState<Record<string, FxSeriesFile>>({});
  const [primaryFile, setPrimaryFile] = useState<string>('');
  const [comparisonFiles, setComparisonFiles] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [range, setRange] = useState<RangeOption>('90D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = translations[locale];
  const liveDemoUrl = import.meta.env.VITE_LIVE_DEMO_URL ?? window.location.origin;
  const sourceCodeUrl = import.meta.env.VITE_SOURCE_CODE_URL ?? 'https://github.com/';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fx_monitor_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('fx_monitor_locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const loadManifest = async () => {
      try {
        setLoading(true);
        setError(null);
        const manifestData = await fetchManifest();
        if (!manifestData.pairs.length) {
          throw new Error('Manifest is empty.');
        }

        const initial = parseInitialState(manifestData);
        setManifest(manifestData);
        setPrimaryFile(initial.primaryFile);
        setComparisonFiles(initial.comparisonFiles);
        setCompareMode(initial.compareMode);
        setRange(initial.range);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error while loading manifest.');
      } finally {
        setLoading(false);
      }
    };

    void loadManifest();
  }, []);

  const requestedFiles = useMemo(() => {
    if (!primaryFile) return [];
    return [primaryFile, ...comparisonFiles];
  }, [primaryFile, comparisonFiles]);

  useEffect(() => {
    const missing = requestedFiles.filter((file) => !seriesCache[file]);
    if (!missing.length) {
      return;
    }

    const loadMissingSeries = async () => {
      try {
        setLoading(true);
        setError(null);
        const loaded = await Promise.all(
          missing.map(async (file) => ({ file, payload: await fetchSeries(file) })),
        );

        setSeriesCache((current) => {
          const next = { ...current };
          for (const item of loaded) {
            next[item.file] = item.payload;
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error while loading series.');
      } finally {
        setLoading(false);
      }
    };

    void loadMissingSeries();
  }, [requestedFiles, seriesCache]);

  useEffect(() => {
    if (!primaryFile) {
      return;
    }

    const params = new URLSearchParams();
    params.set('pair', primaryFile);
    params.set('range', range);
    if (compareMode) {
      params.set('mode', 'compare');
      if (comparisonFiles.length) {
        params.set('compare', comparisonFiles.join(','));
      }
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  }, [primaryFile, comparisonFiles, compareMode, range]);

  const primarySeriesFile = primaryFile ? seriesCache[primaryFile] : undefined;

  const chartSeries = useMemo(() => {
    if (!manifest || !primarySeriesFile) {
      return [];
    }

    const activeFiles = compareMode ? [primaryFile, ...comparisonFiles] : [primaryFile];

    return activeFiles
      .map((file) => {
        const payload = seriesCache[file];
        if (!payload) return null;
        return {
          pair: payload.pair,
          data: filterSeriesByRange(payload.series, range),
        };
      })
      .filter((item): item is { pair: string; data: FxSeriesFile['series'] } => item !== null);
  }, [manifest, primarySeriesFile, compareMode, primaryFile, comparisonFiles, seriesCache, range]);

  const primaryFilteredSeries = useMemo(() => {
    if (!primarySeriesFile) return [];
    return filterSeriesByRange(primarySeriesFile.series, range);
  }, [primarySeriesFile, range]);

  const kpis = useMemo(() => {
    if (!primarySeriesFile) {
      return calculateKpis([], []);
    }
    return calculateKpis(primarySeriesFile.series, primaryFilteredSeries);
  }, [primarySeriesFile, primaryFilteredSeries]);

  const rollingVolSeries = useMemo(
    () => buildRollingVolatilitySeries(primaryFilteredSeries, 30),
    [primaryFilteredSeries],
  );
  const drawdownSeries = useMemo(
    () => buildDrawdownSeries(primaryFilteredSeries),
    [primaryFilteredSeries],
  );
  const returnsHistogram = useMemo(
    () => buildReturnsHistogram(primaryFilteredSeries, 16),
    [primaryFilteredSeries],
  );
  const regimeBands = useMemo(
    () => buildVolatilityRegimeBands(rollingVolSeries),
    [rollingVolSeries],
  );
  const eventMarkers = useMemo(
    () => buildEventMarkers(primaryFilteredSeries, compareMode),
    [primaryFilteredSeries, compareMode],
  );
  const snapshotSummary = useMemo(
    () => buildSnapshotSummary(primaryFilteredSeries, rollingVolSeries),
    [primaryFilteredSeries, rollingVolSeries],
  );

  const toggleComparisonFile = (file: string) => {
    setComparisonFiles((current) => {
      if (current.includes(file)) {
        return current.filter((item) => item !== file);
      }
      if (current.length >= 2) {
        return current;
      }
      return [...current, file];
    });
  };

  if (loading && !primarySeriesFile) {
    return (
      <main className="page">
        <p className="state">{t.loading}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <p className="state error">{error}</p>
      </main>
    );
  }

  if (!manifest || !primarySeriesFile) {
    return (
      <main className="page">
        <p className="state error">{t.noData}</p>
      </main>
    );
  }

  const lastDate = primaryFilteredSeries[primaryFilteredSeries.length - 1]?.date ?? 'N/A';

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">{t.projectPage}</p>
            <h1>{t.title}</h1>
          </div>
          <div className="toolbar">
            <label className="toggle-group">
              <span>{t.langLabel}</span>
              <div className="segmented">
                <button type="button" className={locale === 'sv' ? 'active' : ''} onClick={() => setLocale('sv')}>SV</button>
                <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
              </div>
            </label>
            <label className="toggle-group">
              <span>{t.themeLabel}</span>
              <div className="segmented">
                <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>{t.dark}</button>
                <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>{t.light}</button>
              </div>
            </label>
          </div>
        </div>
        <p className="subtitle">{t.subtitle}</p>
        <div className="hero-actions">
          <a className="btn btn-primary" href={liveDemoUrl} target="_blank" rel="noreferrer">
            {t.liveDemo}
          </a>
          <a className="btn btn-ghost" href={sourceCodeUrl} target="_blank" rel="noreferrer">
            {t.sourceCodeCta}
          </a>
        </div>
      </section>

      <section className="controls card">
        <label>
          {t.primaryPair}
          <select
            value={primaryFile}
            onChange={(event) => {
              const nextPrimary = event.target.value;
              setPrimaryFile(nextPrimary);
              setComparisonFiles((current) => current.filter((file) => file !== nextPrimary));
            }}
            aria-label={t.primaryPair}
          >
            {manifest.pairs.map((item) => (
              <option key={item.file} value={item.file}>
                {item.pair}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t.dateRange}
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as RangeOption)}
            aria-label={t.dateRange}
          >
            {RANGE_VALUES.map((item) => (
              <option key={item} value={item}>
                {rangeLabel(item, locale)}
              </option>
            ))}
          </select>
        </label>

        <div className="as-of">
          <span>{t.asOf}</span>
          <strong>{formatDate(lastDate)}</strong>
        </div>
      </section>

      <section className="compare card">
        <label className="compare-toggle">
          <input
            type="checkbox"
            checked={compareMode}
            onChange={(event) => setCompareMode(event.target.checked)}
          />
          <span>{t.compareMode} ({t.compareHint})</span>
        </label>

        {compareMode ? (
          <div className="compare-grid">
            {manifest.pairs
              .filter((item) => item.file !== primaryFile)
              .map((item) => {
                const checked = comparisonFiles.includes(item.file);
                const disableUnchecked = !checked && comparisonFiles.length >= 2;
                return (
                  <label key={item.file} className="compare-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disableUnchecked}
                      onChange={() => toggleComparisonFile(item.file)}
                    />
                    <span>{item.pair}</span>
                  </label>
                );
              })}
          </div>
        ) : null}
      </section>

      <section className="kpi-grid">
        <KpiCard label={t.latestRate} value={formatRate(kpis.latest)} hint={primarySeriesFile.pair} />
        <KpiCard label="1D" value={formatPct(kpis.change1d)} hint={t.pctChange} />
        <KpiCard label="1W" value={formatPct(kpis.change1w)} hint={t.pctChange} />
        <KpiCard label="1M" value={formatPct(kpis.change1m)} hint={t.pctChange} />
        <KpiCard label={t.ma30} value={formatRate(kpis.ma30)} hint={t.ma30Hint} />
        <KpiCard label={t.vol30} value={formatPct(kpis.vol30LogReturnPct)} hint={t.volHint} />
        <KpiCard label={t.min} value={formatRate(kpis.min)} hint={t.selectedRange} />
        <KpiCard label={t.max} value={formatRate(kpis.max)} hint={t.selectedRange} />
      </section>

      <SnapshotPanel
        summary={snapshotSummary}
        labels={{
          title: t.snapshotTitle,
          trend30: t.trend30,
          volRegime: t.volRegime,
          observations: t.observations,
          regimeLow: t.regimeLow,
          regimeNormal: t.regimeNormal,
          regimeHigh: t.regimeHigh,
        }}
      />

      <ChartPanel
        series={chartSeries}
        normalized={compareMode}
        labels={{ rateHistory: t.rateHistory, relativePerformance: t.relativePerformance }}
        regimeBands={regimeBands}
        eventMarkers={eventMarkers}
      />

      <section className="analytics-grid">
        <RollingVolChart data={rollingVolSeries} title={t.rollingVol} />
        <DrawdownChart data={drawdownSeries} title={t.drawdown} />
        <ReturnsHistogramChart data={returnsHistogram} title={t.returnsHistogram} />
      </section>

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
    </main>
  );
}
