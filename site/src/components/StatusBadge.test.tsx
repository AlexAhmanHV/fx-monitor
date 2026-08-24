import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge';
import type { PipelineStatus } from '../types';

const labels = {
  ok: 'Pipeline healthy',
  partial: 'Pipeline partially failed',
  failed: 'Pipeline failed',
};

describe('StatusBadge', () => {
  it('renders nothing when status is null', () => {
    const { container } = render(<StatusBadge status={null} labels={labels} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the ok label and a green dot when every pair succeeded', () => {
    const status: PipelineStatus = {
      generated_utc: '2026-08-24T04:30:00Z',
      status: 'ok',
      pairs: [{ pair: 'EUR/SEK', status: 'ok', points: 100 }],
    };
    render(<StatusBadge status={status} labels={labels} />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Pipeline healthy');
    expect(badge.querySelector('.status-dot')).toHaveAttribute('data-status', 'ok');
  });

  it('renders the partial label and lists failed pairs in the title', () => {
    const status: PipelineStatus = {
      generated_utc: '2026-08-24T04:30:00Z',
      status: 'partial',
      pairs: [
        { pair: 'EUR/SEK', status: 'ok', points: 100 },
        { pair: 'EUR/JPY', status: 'error', message: 'boom' },
      ],
    };
    render(<StatusBadge status={status} labels={labels} />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Pipeline partially failed');
    expect(badge).toHaveAttribute('title', 'Pipeline partially failed: EUR/JPY');
  });

  it('renders the failed label when every pair errored', () => {
    const status: PipelineStatus = {
      generated_utc: '2026-08-24T04:30:00Z',
      status: 'failed',
      pairs: [{ pair: 'EUR/SEK', status: 'error', message: 'boom' }],
    };
    render(<StatusBadge status={status} labels={labels} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Pipeline failed');
  });
});
