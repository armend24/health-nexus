/** Jest setup: extends matchers (e.g. toBeInTheDocument). */
import '@testing-library/jest-dom';
// Augments @jest/globals Matchers — required when tests import from @jest/globals
import '@testing-library/jest-dom/jest-globals';
import { TextDecoder, TextEncoder } from 'util';

// Required by TanStack Router in jsdom.
(
  global as unknown as {
    TextEncoder: typeof TextEncoder;
  }
).TextEncoder = TextEncoder;
(
  global as unknown as {
    TextDecoder: typeof TextDecoder;
  }
).TextDecoder = TextDecoder;

// TanStack Router redirect uses the Response Web API; expose it in jsdom (Node 18+ has it).
if (typeof globalThis.Response !== 'undefined') {
  const ResponseConstructor = globalThis.Response;
  (
    global as unknown as {
      Response: typeof ResponseConstructor;
    }
  ).Response = ResponseConstructor;
  if (
    typeof (global as unknown as { window?: unknown }).window !==
    'undefined'
  ) {
    (
      (global as unknown as { window: unknown })
        .window as unknown as {
        Response: typeof ResponseConstructor;
      }
    ).Response = ResponseConstructor;
  }
}

// Recharts and other libs use ResizeObserver; jsdom does not provide it.
const ResizeObserverMock = class ResizeObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
};
(global as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverMock;
if (
  typeof (global as unknown as { window?: unknown }).window !==
  'undefined'
) {
  (
    (global as unknown as { window: unknown }).window as unknown as {
      ResizeObserver: unknown;
    }
  ).ResizeObserver = ResizeObserverMock;
}

// Sidebar and use-mobile hook use window.matchMedia; jsdom does not provide it.
const matchMediaMock = () => ({
  matches: false,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  media: '',
  onchange: null,
});
(
  global as unknown as {
    matchMedia: () => ReturnType<typeof matchMediaMock>;
  }
).matchMedia = matchMediaMock;
if (
  typeof (global as unknown as { window?: unknown }).window !==
  'undefined'
) {
  (
    (
      global as unknown as {
        window: { matchMedia: () => unknown };
      }
    ).window as unknown as {
      matchMedia: () => unknown;
    }
  ).matchMedia = matchMediaMock;
}
