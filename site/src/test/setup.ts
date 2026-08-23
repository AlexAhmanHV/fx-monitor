import '@testing-library/jest-dom/vitest';

// Ensure localStorage is available in jsdom environment
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    Object.keys(storage).forEach((key) => {
      delete storage[key];
    });
  },
  length: 0,
  key: (index: number) => Object.keys(storage)[index] || null,
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
