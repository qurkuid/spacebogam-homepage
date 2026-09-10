const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function runFunnel({ scrollHeight = 2000 } = {}) {
  const requests = [];
  const windowListeners = {};
  const location = {
    pathname: '/',
    search: '',
    hostname: 'spacebogam.kr',
    href: 'https://spacebogam.kr/',
  };
  const sandbox = {
    URL, URLSearchParams, Uint8Array, Uint32Array,
    Element: class Element {},
    Date, JSON, Math, Promise, Array, Object, String, Boolean,
    location,
    localStorage: storage(),
    sessionStorage: storage(),
    fetch: (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true });
    },
    document: {
      title: 'test',
      readyState: 'complete',
      visibilityState: 'hidden',
      documentElement: { scrollHeight },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 1200;
  sandbox.window.innerHeight = 1000;
  sandbox.window.scrollY = 0;
  sandbox.window.setTimeout = () => 1;
  sandbox.window.addEventListener = (type, handler) => {
    (windowListeners[type] = windowListeners[type] || []).push(handler);
  };
  sandbox.window.crypto = {
    getRandomValues(values) { values.fill(7); return values; },
  };

  vm.runInNewContext(funnelSource, sandbox, { filename: 'funnel-tracking.js' });

  function fireScroll(scrollY) {
    sandbox.window.scrollY = scrollY;
    (windowListeners.scroll || []).forEach((handler) => handler());
  }

  return { requests, fireScroll };
}

test('scroll depth fires 25/50/75/100 once each, in order, as the user scrolls down', () => {
  const { requests, fireScroll } = runFunnel();
  // scrollable range = scrollHeight(2000) - innerHeight(1000) = 1000
  fireScroll(100); // 10%
  fireScroll(300); // 30%
  fireScroll(600); // 60%
  fireScroll(800); // 80%
  fireScroll(1000); // 100%
  fireScroll(1000); // repeat at bottom must not resend

  const scrollDepths = requests
    .filter((r) => typeof r.scrollDepth === 'number')
    .map((r) => r.scrollDepth);

  assert.deepEqual(scrollDepths, [25, 50, 75, 100]);
  requests
    .filter((r) => typeof r.scrollDepth === 'number')
    .forEach((r) => assert.equal(r.eventName, 'scroll_50'));
});

test('a single jump straight to the bottom still fires all four thresholds once', () => {
  const { requests, fireScroll } = runFunnel();
  fireScroll(1000);

  const scrollDepths = requests
    .filter((r) => typeof r.scrollDepth === 'number')
    .map((r) => r.scrollDepth);

  assert.deepEqual(scrollDepths, [25, 50, 75, 100]);
});

test('a non-scrollable page (no overflow) never emits a scroll depth event', () => {
  const { requests, fireScroll } = runFunnel({ scrollHeight: 1000 });
  fireScroll(0);
  assert.equal(requests.filter((r) => typeof r.scrollDepth === 'number').length, 0);
});
