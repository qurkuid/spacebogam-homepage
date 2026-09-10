/**
 * CMP-191 — 검증 세션 표식이 도메인 경계를 넘어가는지 지킨다.
 *
 * spacebogam.kr 은 `is_test`, intm.kr 은 `n` 을 읽는다. 이름이 달라서 QA 세션이
 * 상담 페이지로 넘어가는 순간 표식을 잃고 실유입으로 집계됐다(2026-07-28 실측:
 * lead_form_start 27 세션 중 26 건이 QA, 그중 17 건이 표식 없이 기록).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');

const CTA_HREF = 'https://intm.kr/consultation/ggbg';

function storage() {
  const values = new Map();
  return {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}

function decoratedCtaHref(search) {
  const attributes = new Map([['href', CTA_HREF]]);
  const cta = {
    tagName: 'A',
    getAttribute: (k) => (attributes.has(k) ? attributes.get(k) : null),
    setAttribute: (k, v) => attributes.set(k, String(v)),
    closest: () => null,
    dataset: {},
    textContent: '무료 상담 신청',
    className: 'button',
  };

  const location = {
    pathname: '/consultation/',
    search,
    hostname: 'spacebogam.kr',
    href: `https://spacebogam.kr/consultation/${search}`,
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
    localStorage: storage(),
    sessionStorage: storage(),
    fetch: () => Promise.resolve({ ok: true }),
    document: {
      title: '테스트',
      readyState: 'complete',
      visibilityState: 'hidden',
      documentElement: { scrollHeight: 1000 },
      querySelectorAll: (selector) => (selector === 'a[href]' ? [cta] : []),
      querySelector: () => null,
      addEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 1200;
  sandbox.window.scrollY = 0;
  sandbox.window.setTimeout = () => 1;
  sandbox.window.addEventListener = () => {};
  sandbox.window.crypto = {
    getRandomValues(values) {
      if (values instanceof Uint32Array) values[0] = 0;
      else values.fill(7);
      return values;
    },
  };

  vm.runInNewContext(funnelSource, sandbox, { filename: 'funnel-tracking.js' });
  return new URL(cta.getAttribute('href'));
}

test('QA 세션은 intm 이 읽는 n=1 로 상담 링크에 표식을 넘긴다', () => {
  const url = decoratedCtaHref('?is_test=1');
  assert.equal(url.origin + url.pathname, 'https://intm.kr/consultation/ggbg');
  assert.equal(url.searchParams.get('n'), '1');
});

test('실유입 세션에는 검증 표식이 붙지 않는다', () => {
  const url = decoratedCtaHref('?utm_source=meta&utm_medium=paid_social');
  assert.equal(url.searchParams.get('n'), null);
});
