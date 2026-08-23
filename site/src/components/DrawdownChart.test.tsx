import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DrawdownChart from './DrawdownChart';

vi.mock('react-chartjs-2', () => ({
  Line: (props: Record<string, unknown>) => (
    <div data-testid="line-chart" data-props={JSON.stringify(props)} />
  ),
}));

describe('DrawdownChart', () => {
  it('renders the title and wires data/value into the chart dataset', () => {
    render(
      <DrawdownChart
        data={[
          { date: '2024-01-01', value: -2.5 },
          { date: '2024-01-02', value: -5 },
        ]}
        title="Drawdown"
      />,
    );

    expect(screen.getByText('Drawdown')).toBeInTheDocument();
    const props = JSON.parse(screen.getByTestId('line-chart').getAttribute('data-props') as string);
    expect(props.data.labels).toEqual(['2024-01-01', '2024-01-02']);
    expect(props.data.datasets[0]).toMatchObject({
      label: 'Drawdown',
      data: [-2.5, -5],
      borderColor: '#ff9f6e',
    });
  });
});
