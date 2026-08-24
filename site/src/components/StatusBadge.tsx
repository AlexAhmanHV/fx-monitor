import type { PipelineStatus } from '../types';

type StatusBadgeProps = {
  status: PipelineStatus | null;
  labels: {
    ok: string;
    partial: string;
    failed: string;
  };
};

export default function StatusBadge({ status, labels }: StatusBadgeProps) {
  if (!status) return null;

  const failedPairs = status.pairs
    .filter((item) => item.status === 'error')
    .map((item) => item.pair);

  const label =
    status.status === 'ok' ? labels.ok : status.status === 'partial' ? labels.partial : labels.failed;
  const title = failedPairs.length ? `${label}: ${failedPairs.join(', ')}` : label;

  return (
    <span className="status-badge" title={title} data-testid="status-badge">
      <span className="status-dot" data-status={status.status} />
      {label}
    </span>
  );
}
