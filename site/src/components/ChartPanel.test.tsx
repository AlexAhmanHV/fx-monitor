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
