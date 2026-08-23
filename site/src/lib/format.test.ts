import { describe, expect, it } from 'vitest';
import { formatDate, formatPct, formatRate, formatUtc } from './format';

describe('formatPct', () => {
  it('returns "N/A" for null', () => {
    expect(formatPct(null)).toBe('N/A');
  });

  it('returns "N/A" for NaN', () => {
    expect(formatPct(Number.NaN)).toBe('N/A');
  });

  it('prefixes non-negative values with a plus sign', () => {
    expect(formatPct(5.1234)).toBe('+5.12%');
    expect(formatPct(0)).toBe('+0.00%');
  });

  it('does not add a sign for negative values (toFixed already includes the minus)', () => {
    expect(formatPct(-3.456)).toBe('-3.46%');
  });
});

describe('formatRate', () => {
  it('returns "N/A" for null', () => {
    expect(formatRate(null)).toBe('N/A');
  });

  it('returns "N/A" for NaN', () => {
    expect(formatRate(Number.NaN)).toBe('N/A');
  });

  it('formats to 4 decimal places', () => {
    expect(formatRate(1.23456)).toBe('1.2346');
    expect(formatRate(-1.23456)).toBe('-1.2346');
  });
});

describe('formatDate / formatUtc', () => {
  it('pass the input string through unchanged', () => {
    expect(formatDate('2024-01-01')).toBe('2024-01-01');
    expect(formatUtc('2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
  });
});
