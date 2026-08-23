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
