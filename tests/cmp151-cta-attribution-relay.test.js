const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const siteSource = fs.readFileSync(path.join(root, 'assets/site-tracking.js'), 'utf8');

// The CTA href hardcoded on /consultation/ — the one CMP-151 reported as
// overwriting paid attribution.
const CONSULT_CTA_HREF =
  'https://intm.kr/consultation/ggbg?utm_source=spacebogam.kr&utm_medium=consultation_page' +
  '&utm_campaign=spacebogam_site&ref=spacebogam_consultation';

function makeElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    dataset: {},
    className: attrs.className || '',
    textContent: attrs.textContent || '',
    id: attrs.id || '',
    children: [],
    parentNode: null,
    listeners: {},
    attrs: Object.assign({}, attrs),
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'href') this.href = String(value);
    },
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector() {
      return null;
    },
    classList: { contains: () => false },
  };
  if (attrs.href) el.href = attrs.href;
  return el;
}

function matches(el, selector) {
  const href = el.getAttribute('href') || '';
  let m = selector.match(/^a\[href\^="(.+)"\]$/);
  if (m) return el.tagName === 'A' && href.startsWith(m[1]);
  m = selector.match(/^a\[href\*="(.+)"\]$/);
  if (m) return el.tagName === 'A' && href.includes(m[1]);
  m = selector.match(/^\.([\w-]+)$/);
  if (m) return (el.className || '').split(/\s+/).includes(m[1]);
  return false;
}

// Runs assets/site-tracking.js against a stub DOM holding one consultation CTA,
// then returns the href that anchor was rewritten to.
function decoratedCtaHref({ search, href = CONSULT_CTA_HREF, pathname = '/consultation/' }) {
  const cta = makeElement('a', { href, className: 'button' });
  const anchors = [cta];

  const head = makeElement('head');
  const body = makeElement('body');
  const document = {
    readyState: 'complete',
    head,
    body,
    documentElement: makeElement('html'),
    createElement: (tag) => makeElement(tag),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll(selector) {
      const parts = selector.split(',').map((s) => s.trim());
      return anchors.filter((el) => parts.some((p) => matches(el, p)));
    },
    addEventListener: () => {},
  };

  const location = {
    href: `https://spacebogam.kr${pathname}${search}`,
    pathname,
    hostname: 'spacebogam.kr',
    search,
  };

  const store = () => {
    const values = new Map();
    return {
      getItem: (k) => (values.has(k) ? values.get(k) : null),
      setItem: (k, v) => values.set(k, String(v)),
      removeItem: (k) => values.delete(k),
    };
  };

  const sandbox = {
    document,
    location,
    URL,
    URLSearchParams,
    sessionStorage: store(),
    localStorage: store(),
    navigator: { userAgent: 'node-test' },
    crypto: { getRandomValues: (arr) => arr.fill(1) },
    setTimeout,
    console,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(siteSource, sandbox);

  return new URL(cta.getAttribute('href'));
}

test('paid landing params reach the intm.kr CTA, including platform ids', () => {
  const url = decoratedCtaHref({
    search:
      '?utm_source=meta&utm_medium=paid_social&utm_campaign=busan_interior_0728' +
      '&utm_id=120001&campaign_id=120001&adset_id=120002&ad_id=120003&asset_id=120004' +
      '&fbclid=IwAR_test',
  });

  assert.equal(url.origin + url.pathname, 'https://intm.kr/consultation/ggbg');
  const expected = {
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign: 'busan_interior_0728',
    utm_id: '120001',
    campaign_id: '120001',
    adset_id: '120002',
    ad_id: '120003',
    asset_id: '120004',
    fbclid: 'IwAR_test',
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(url.searchParams.get(key), value, `${key} must survive the CTA hop`);
  }
});

test('partial inbound attribution is not blended with the hardcoded CTA channel', () => {
  const url = decoratedCtaHref({ search: '?utm_source=meta&utm_campaign=busan_interior_0728' });

  assert.equal(url.searchParams.get('utm_source'), 'meta');
  assert.equal(url.searchParams.get('utm_campaign'), 'busan_interior_0728');
  // The stale hardcoded medium must be dropped rather than paired with utm_source=meta.
  assert.equal(url.searchParams.get('utm_medium'), null);
});

test('a click id alone still suppresses the hardcoded channel fallback', () => {
  const url = decoratedCtaHref({ search: '?fbclid=IwAR_test' });

  assert.equal(url.searchParams.get('fbclid'), 'IwAR_test');
  assert.equal(url.searchParams.get('utm_source'), null);
  assert.equal(url.searchParams.get('utm_medium'), null);
});

test('organic visits keep the hardcoded spacebogam fallback', () => {
  const url = decoratedCtaHref({ search: '' });

  assert.equal(url.searchParams.get('utm_source'), 'spacebogam.kr');
  assert.equal(url.searchParams.get('utm_medium'), 'consultation_page');
  assert.equal(url.searchParams.get('utm_campaign'), 'spacebogam_site');
});

test('CTA placement marker (ref) survives paid attribution', () => {
  const url = decoratedCtaHref({ search: '?utm_source=meta&utm_medium=paid_social' });

  assert.equal(url.searchParams.get('ref'), 'spacebogam_consultation');
});

test('is_test is relayed so QA traffic can be excluded downstream', () => {
  const url = decoratedCtaHref({ search: '?utm_source=meta&utm_medium=paid_social&is_test=true' });

  assert.equal(url.searchParams.get('is_test'), 'true');
});
