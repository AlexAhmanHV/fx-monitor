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
