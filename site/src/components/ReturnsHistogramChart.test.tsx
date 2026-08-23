import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReturnsHistogramChart from './ReturnsHistogramChart';

vi.mock('react-chartjs-2', () => ({
  Bar: (props: Record<string, unknown>) => (
    <div data-testid="bar-chart" data-props={JSON.stringify(props)} />
  ),
}));

describe('ReturnsHistogramChart', () => {
  it('renders the title and wires bin labels/counts into the chart dataset', () => {
    render(
      <ReturnsHistogramChart
        data={[
          { label: '-1.00..0.00', count: 3 },
          { label: '0.00..1.00', count: 5 },
        ]}
        title="Daily log returns histogram"
      />,
    );

    expect(screen.getByText('Daily log returns histogram')).toBeInTheDocument();
    const props = JSON.parse(screen.getByTestId('bar-chart').getAttribute('data-props') as string);
    expect(props.data.labels).toEqual(['-1.00..0.00', '0.00..1.00']);
    expect(props.data.datasets[0]).toMatchObject({
      label: 'Daily log returns histogram',
      data: [3, 5],
      backgroundColor: 'rgba(90, 179, 255, 0.45)',
    });
  });
});
