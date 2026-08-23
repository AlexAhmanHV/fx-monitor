import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KpiCard from './KpiCard';

describe('KpiCard', () => {
  it('renders the label and value', () => {
    render(<KpiCard label="Latest rate" value="11.2345" />);
    expect(screen.getByText('Latest rate')).toBeInTheDocument();
    expect(screen.getByText('11.2345')).toBeInTheDocument();
  });

  it('renders the hint when provided', () => {
    render(<KpiCard label="MA30" value="11.10" hint="30-day moving average" />);
    expect(screen.getByText('30-day moving average')).toBeInTheDocument();
  });

  it('omits the hint element when not provided', () => {
    const { container } = render(<KpiCard label="Min" value="10.0" />);
    expect(container.querySelector('.kpi-hint')).toBeNull();
  });
});
