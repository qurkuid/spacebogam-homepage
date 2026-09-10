const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');
const siteSource = fs.readFileSync(path.join(root, 'assets/site-tracking.js'), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}

function runFunnel({
  pathname = '/consultation/',
  search = '',
  globalVariant = '',
  localValues = {},
  sessionValues = {},
  randomUint32 = 0,
} = {}) {
  const requests = [];
  const localStorage = storage(localValues);
  const sessionStorage = storage(sessionValues);
  const cryptoCalls = [];
  const location = {
    pathname,
    search,
    hostname: 'spacebogam.kr',
    href: `https://spacebogam.kr${pathname}${search}`,
  };
  const sandbox = {
    URL,
    URLSearchParams,
    Uint8Array,
    Uint32Array,
    Element: class Element {},
    Date,
    JSON,
    Math,
    Promise,
    Array,
    Object,
    String,
    Boolean,
    location,
    localStorage,
    sessionStorage,
    fetch: (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true });
    },
    document: {
      title: '테스트',
      readyState: 'complete',
      visibilityState: 'hidden',
      documentElement: { scrollHeight: 1000 },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 1200;
  sandbox.window.scrollY = 0;
  sandbox.window.setTimeout = () => 1;
  sandbox.window.addEventListener = () => {};
  sandbox.window.__spacebogamHomepageHeadlineVariant = globalVariant;
  sandbox.window.crypto = {
    getRandomValues(values) {
      cryptoCalls.push(values.length);
      if (values instanceof Uint32Array) values[0] = randomUint32;
      else values.fill(7);
      return values;
    },
  };

  vm.runInNewContext(funnelSource, sandbox, { filename: 'funnel-tracking.js' });
  return { requests, localStorage, sessionStorage, cryptoCalls };
}

test('arbitrary success query parameters never emit consultation_submit', () => {
  const queries = [
    '?success=not-saved&experiment_id=homepage_headline_v1&experiment_variant=A',
    '?consultation_submit=true&experiment_id=homepage_headline_v1&experiment_variant=B',
    '?submit_success=1',
    '?submitted=1',
    '?complete=1',
  ];

  for (const search of queries) {
    const { requests } = runFunnel({ search });
    assert.equal(requests.filter((request) => request.eventName === 'consultation_submit').length, 0, search);
  }
});

test('refreshing an arbitrary success URL still emits zero consultation submits', () => {
  const first = runFunnel({ search: '?success=not-saved&experiment_variant=A' });
  const second = runFunnel({
    search: '?success=not-saved&experiment_variant=A',
    sessionValues: Object.fromEntries(first.sessionStorage.values),
  });

  assert.equal(
    [...first.requests, ...second.requests].filter((request) => request.eventName === 'consultation_submit').length,
    0,
  );
});

test('assignment uses the contract key and crypto.getRandomValues when available', () => {
  const { requests, sessionStorage, cryptoCalls } = runFunnel({
    pathname: '/',
    randomUint32: 0xffffffff,
  });

  assert.equal(sessionStorage.getItem('spacebogam_homepage_headline_v1_variant'), 'B');
  assert.equal(sessionStorage.getItem('spacebogam_funnel_experiment_homepage_headline_v1'), null);
  assert.ok(cryptoCalls.includes(1), 'assignment should request a Uint32 random value');
  assert.ok(cryptoCalls.includes(16), 'UUID fallback should request 16 random bytes');
  assert.equal(requests[0].experimentVariant, 'B');
});

test('global rollback wins over query, local override, and stored assignment', () => {
  const { requests, sessionStorage } = runFunnel({
    pathname: '/',
    search: '?experiment_variant=B&experiment_force=B',
    globalVariant: 'A',
    localValues: { spacebogam_headline_v1_force_variant: 'B' },
    sessionValues: { spacebogam_homepage_headline_v1_variant: 'B' },
  });

  assert.equal(sessionStorage.getItem('spacebogam_homepage_headline_v1_variant'), 'A');
  assert.equal(requests[0].experimentVariant, 'A');
});

test('site loader exposes one global rollback flag before loading funnel tracking', () => {
  // Value-agnostic on purpose: '' is 50:50, 'A' is the emergency rollback. Pinning
  // the literal here would make the rollback this flag exists for fail the suite.
  const flagDeclaration = siteSource.search(/var GLOBAL_EXPERIMENT_VARIANT = '[AB]?';/);
  const flagExport = siteSource.indexOf('window.__spacebogamHomepageHeadlineVariant = GLOBAL_EXPERIMENT_VARIANT;');
  // CMP-255: src 에 캐시 버스팅 해시(?v=…)가 붙으므로 리터럴 대신 패턴으로 찾는다.
  const funnelLoad = siteSource.search(/funnelScript\.src = '\/assets\/funnel-tracking\.js(\?v=[0-9a-f]+)?';/);

  assert.ok(flagDeclaration >= 0);
  assert.ok(flagExport > flagDeclaration);
  assert.ok(funnelLoad > flagExport);
  assert.equal((siteSource.match(/var GLOBAL_EXPERIMENT_VARIANT =/g) || []).length, 1);
});

test('client bundle contains no consultation-submit emitter or success-query recognizer', () => {
  assert.doesNotMatch(funnelSource, /send\(['"]consultation_submit['"]/);
  assert.doesNotMatch(funnelSource, /params\.has\(['"]success['"]\)/);
  assert.doesNotMatch(funnelSource, /params\.has\(['"]submit_success['"]\)/);
});
