export function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  return value.toFixed(4);
}

export function formatDate(isoDate: string): string {
  return isoDate;
}

export function formatUtc(isoUtc: string): string {
  return isoUtc;
}
