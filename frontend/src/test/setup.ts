import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; the kit's chart and broadcast stage use it for responsive sizing.
class RO { observe() {} unobserve() {} disconnect() {} }
if (typeof globalThis.ResizeObserver === 'undefined') (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
