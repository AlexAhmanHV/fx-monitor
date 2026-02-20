import { formatPct } from '../lib/format';
import type { SnapshotSummary } from '../types';

type SnapshotPanelProps = {
  summary: SnapshotSummary;
  labels: {
    title: string;
    trend30: string;
    volRegime: string;
    observations: string;
    regimeLow: string;
    regimeNormal: string;
    regimeHigh: string;
  };
};

function regimeLabel(regime: SnapshotSummary['volatilityRegime'], labels: SnapshotPanelProps['labels']): string {
  if (regime === 'low') return labels.regimeLow;
  if (regime === 'high') return labels.regimeHigh;
  return labels.regimeNormal;
}

export default function SnapshotPanel({ summary, labels }: SnapshotPanelProps) {
  return (
    <section className="snapshot card">
      <header className="card-header">
        <h2>{labels.title}</h2>
      </header>
      <div className="snapshot-grid">
        <article className="snapshot-item">
          <span>{labels.trend30}</span>
          <strong>{formatPct(summary.trend30dPct)}</strong>
        </article>
        <article className="snapshot-item">
          <span>{labels.volRegime}</span>
          <strong className={`regime-${summary.volatilityRegime}`}>{regimeLabel(summary.volatilityRegime, labels)}</strong>
        </article>
        <article className="snapshot-item">
          <span>{labels.observations}</span>
          <strong>{summary.observations}</strong>
        </article>
      </div>
    </section>
  );
}
