import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManifest, fetchSeries, fetchStatus } from './data';

function mockFetchOnce(response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchManifest', () => {
  it('resolves with a valid manifest payload', async () => {
    const payload = {
      source: 'ECB',
      generated_utc: '2024-01-01T00:00:00Z',
      pairs: [{ pair: 'EUR/SEK', file: 'fx_EURSEK.json', series_key: 'EURSEK' }],
    };
    mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });
    await expect(fetchManifest()).resolves.toEqual(payload);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });
    await expect(fetchManifest()).rejects.toThrow('Could not load manifest (404).');
  });

  it('throws when the payload has no pairs array', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({}) });
    await expect(fetchManifest()).rejects.toThrow('Manifest missing pairs array.');
  });

  it('throws when a pair entry has an invalid shape', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({ pairs: [{ pair: 'EUR/SEK' }] }) });
    await expect(fetchManifest()).rejects.toThrow('Manifest pair has invalid shape.');
  });
});

describe('fetchSeries', () => {
  it('resolves with a valid series payload', async () => {
    const payload = {
      pair: 'EUR/SEK',
      source: 'ECB',
      generated_utc: '2024-01-01T00:00:00Z',
      series: [{ date: '2024-01-01', rate: 11.2 }],
    };
    mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });
    await expect(fetchSeries('fx_EURSEK.json')).resolves.toEqual(payload);
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
    await expect(fetchSeries('fx_EURSEK.json')).rejects.toThrow('Could not load series (500).');
  });

  it('throws when the payload is missing pair or series', async () => {
    mockFetchOnce({ ok: true, json: () => Promise.resolve({ pair: 'EUR/SEK' }) });
    await expect(fetchSeries('fx_EURSEK.json')).rejects.toThrow(
      'Data file is missing pair or series.',
    );
  });

  it('throws when a series point has an invalid shape', async () => {
    mockFetchOnce({
      ok: true,
      json: () =>
        Promise.resolve({ pair: 'EUR/SEK', series: [{ date: '2024-01-01', rate: -1 }] }),
    });
    await expect(fetchSeries('fx_EURSEK.json')).rejects.toThrow(
      'Data file contains invalid series points.',
    );
  });
});

describe('fetchStatus', () => {
  it('resolves with a valid status payload', async () => {
    const payload = {
      generated_utc: '2024-01-01T00:00:00Z',
      status: 'ok',
      pairs: [{ pair: 'EUR/SEK', status: 'ok', points: 100 }],
    };
    mockFetchOnce({ ok: true, json: () => Promise.resolve(payload) });
    await expect(fetchStatus()).resolves.toEqual(payload);
  });

  it('resolves with null when the HTTP response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when the payload has an invalid status value', async () => {
    mockFetchOnce({
      ok: true,
      json: () =>
        Promise.resolve({ generated_utc: '2024-01-01T00:00:00Z', status: 'weird', pairs: [] }),
    });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when a pair entry has an invalid shape', async () => {
    mockFetchOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          generated_utc: '2024-01-01T00:00:00Z',
          status: 'ok',
          pairs: [{ pair: 'EUR/SEK' }],
        }),
    });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when the payload is missing generated_utc', async () => {
    mockFetchOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'ok', pairs: [] }),
    });
    await expect(fetchStatus()).resolves.toBeNull();
  });

  it('resolves with null when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchStatus()).resolves.toBeNull();
  });
});
