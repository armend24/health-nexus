'use strict';

const JSDOMEnvironment = require('jest-environment-jsdom').default;

/**
 * jsdom environment with Node's Response (and other globals) on window
 * so TanStack Router redirects work in tests (Node 18+).
 */
class JSDOMWithGlobals extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);
    const g = this.global;
    if (typeof global.Response !== 'undefined')
      g.Response = global.Response;
    if (typeof global.ResizeObserver === 'undefined') {
      g.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (typeof g.matchMedia !== 'function') {
      g.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
        media: '',
        onchange: null,
      });
    }
  }
}

module.exports = JSDOMWithGlobals;
