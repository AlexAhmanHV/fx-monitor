import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SnapshotPanel from './SnapshotPanel';
import type { SnapshotSummary } from '../types';

const labels = {
  title: 'Market snapshot',
  trend30: '30D trend',
  volRegime: 'Volatility regime',
  observations: 'Observations',
  regimeLow: 'Low',
  regimeNormal: 'Normal',
  regimeHigh: 'High',
};

function summary(overrides: Partial<SnapshotSummary>): SnapshotSummary {
  return {
    trend30dPct: 1.5,
    volatilityRegime: 'normal',
    observations: 100,
    latestDate: '2024-01-01',
    ...overrides,
  };
}

describe('SnapshotPanel', () => {
  it('renders the trend, regime label, and observation count', () => {
    render(<SnapshotPanel summary={summary({ volatilityRegime: 'normal' })} labels={labels} />);
    expect(screen.getByText('+1.50%')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('maps the "low" regime to its label', () => {
    render(<SnapshotPanel summary={summary({ volatilityRegime: 'low' })} labels={labels} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('maps the "high" regime to its label', () => {
    render(<SnapshotPanel summary={summary({ volatilityRegime: 'high' })} labels={labels} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
