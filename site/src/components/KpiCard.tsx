type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export default function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <article className="kpi-card">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {hint ? <span className="kpi-hint">{hint}</span> : null}
    </article>
  );
}
