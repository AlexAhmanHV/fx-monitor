import { describe, expect, it } from 'vitest';
import { translations } from './i18n';

describe('translations', () => {
  it('defines the exact same set of keys for every locale', () => {
    const enKeys = Object.keys(translations.en).sort();
    const svKeys = Object.keys(translations.sv).sort();
    expect(svKeys).toEqual(enKeys);
  });

  it('has no empty string values in either locale', () => {
    for (const locale of ['en', 'sv'] as const) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value, `${locale}.${key} should not be empty`).not.toBe('');
      }
    }
  });
});
