const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'funnel-tracking.js'),
  'utf8',
);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function createHarness({ search = '?is_test=1', deniedStorage = false } = {}) {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const requests = [];
  const sections = [];
  const anchors = [];
  const observers = [];

  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }

  class FakeElement {
    constructor(tagName, options = {}) {
      this.tagName = tagName.toUpperCase();
      this.id = options.id || '';
      this.dataset = options.dataset || {};
      this.parentElement = options.parent || null;
      this.textContent = options.textContent || '';
      this.value = options.value || '';
      this.open = !!options.open;
      this.attributes = { ...(options.attributes || {}) };
      this.className = options.className || '';
    }

    getAttribute(name) { return this.attributes[name] || null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }

    closest(selector) {
      let node = this;
      while (node) {
        const tag = node.tagName.toLowerCase();
        if (selector === 'form' && tag === 'form') return node;
        if (selector === 'details' && tag === 'details') return node;
        if (selector === '[data-v8-event]' && node.dataset.v8Event) return node;
        if (selector === 'a[href]' && tag === 'a' && node.getAttribute('href')) return node;
        if (selector === '[data-track-section], section, article, main') {
          if (node.dataset.trackSection || ['section', 'article', 'main'].includes(tag)) return node;
        }
        if (selector === 'a[href], button, summary, [role="button"]') {
          if ((tag === 'a' && node.getAttribute('href')) || tag === 'button' || tag === 'summary' || node.attributes.role === 'button') return node;
        }
        node = node.parentElement;
      }
      return null;
    }
  }

  const document = {
    title: '공간보감 테스트',
    readyState: 'complete',
    visibilityState: 'visible',
    referrer: '',
    cookie: '',
    body: { classList: { add() {} } },
    documentElement: { scrollHeight: 2000 },
    querySelectorAll(selector) {
      if (selector === 'a[href]') return anchors;
      if (selector === 'main section, main > article, body > section, [data-track-section]') return sections;
      return [];
    },
    querySelector() { return null; },
    addEventListener(name, listener) {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(listener);
    },
  };

  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = [];
      observers.push(this);
    }
    observe(target) { this.targets.push(target); }
    trigger(entries) { this.callback(entries); }
  }

  const location = {
    pathname: '/guide/',
    search,
    hostname: 'spacebogam.kr',
    href: `https://spacebogam.kr/guide/${search}`,
  };
  const sandbox = {
    URL,
    URLSearchParams,
    Uint8Array,
    Uint32Array,
    Date: FakeDate,
    JSON,
    Math,
    Promise,
    Array,
    Object,
    String,
    Boolean,
    Element: FakeElement,
    location,
    document,
    fetch(_url, options) {
      requests.push({ payload: JSON.parse(options.body), options });
      return Promise.resolve({ ok: true });
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, due: now + Number(delay || 0) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return 0; },
    clearInterval() {},
    addEventListener(name, listener) {
      if (!windowListeners.has(name)) windowListeners.set(name, []);
      windowListeners.get(name).push(listener);
    },
    innerWidth: 1200,
    innerHeight: 800,
    scrollY: 0,
    crypto: {
      randomUUID() { return `event-${Math.random()}`; },
    },
    IntersectionObserver: FakeIntersectionObserver,
  };
  sandbox.window = sandbox;
  if (deniedStorage) {
    Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('denied'); } });
    Object.defineProperty(sandbox, 'sessionStorage', { get() { throw new Error('denied'); } });
  } else {
    sandbox.localStorage = memoryStorage();
    sandbox.sessionStorage = memoryStorage({
      spacebogam_funnel_engaged_sent: 'true',
    });
  }

  function dispatchDocument(name, event = {}) {
    for (const listener of documentListeners.get(name) || []) listener(event);
  }
  function dispatchWindow(name, event = {}) {
    for (const listener of windowListeners.get(name) || []) listener(event);
  }
  function advance(milliseconds) {
    const target = now + milliseconds;
    let count = 0;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!next) break;
      if (++count > 1000) throw new Error('timer loop');
      const [id, timer] = next;
      timers.delete(id);
      now = timer.due;
      timer.callback();
    }
    now = target;
  }
  function setVisibility(value) {
    document.visibilityState = value;
    dispatchDocument('visibilitychange');
  }

  return {
    FakeElement,
    anchors,
    sections,
    requests,
    observers,
    run() { vm.runInNewContext(source, sandbox, { filename: 'funnel-tracking.js' }); },
    advance,
    setVisibility,
    click(target) { dispatchDocument('click', { target }); },
    dispatchWindow,
  };
}

function events(harness, name) {
  return harness.requests.filter(({ payload }) => payload.eventName === name);
}

test('section exposure requires one visible second, pauses while hidden, and deduplicates', () => {
  const harness = createHarness();
  const section = new harness.FakeElement('section', { id: 'commercial-proof' });
  const tallSection = new harness.FakeElement('section', { id: 'commercial-long-copy' });
  harness.sections.push(section, tallSection);
  harness.run();

  assert.ok(harness.observers[0].options.threshold.includes(0.01));

  harness.observers[0].trigger([{
    target: section,
    isIntersecting: true,
    intersectionRatio: 0.3,
    intersectionRect: { height: 120 },
  }]);
  harness.advance(500);
  harness.setVisibility('hidden');
  harness.advance(1500);
  assert.equal(events(harness, 'content_view').length, 0);

  harness.setVisibility('visible');
  harness.advance(1000);
  harness.observers[0].trigger([{
    target: section,
    isIntersecting: true,
    intersectionRatio: 1,
    intersectionRect: { height: 500 },
  }]);
  harness.observers[0].trigger([{
    target: tallSection,
    isIntersecting: true,
    intersectionRatio: 0.02,
    intersectionRect: { height: 160 },
  }]);
  harness.advance(2000);

  const views = events(harness, 'content_view');
  assert.equal(views.length, 2);
  assert.equal(views[0].payload.ctaLocation, 'commercial-proof');
  assert.equal(views[0].payload.ctaText, 'section_view');
  assert.equal(views[1].payload.ctaLocation, 'commercial-long-copy');
});

test('generic navigation, buttons, and FAQ opens use fixed privacy-safe categories', () => {
  const harness = createHarness();
  const section = new harness.FakeElement('section', { id: 'decision-guide' });
  const link = new harness.FakeElement('a', {
    parent: section,
    textContent: '홍길동 secret@example.com',
    attributes: { href: '/commercial/office?email=secret@example.com#private' },
  });
  const button = new harness.FakeElement('button', {
    parent: section,
    id: 'show-cost-example',
    textContent: '010-1234-5678',
    value: 'private-value',
  });
  const details = new harness.FakeElement('details', { parent: section, id: 'faq-cost' });
  const summary = new harness.FakeElement('summary', { parent: details, textContent: '개인 질문' });
  const consultation = new harness.FakeElement('a', {
    parent: section,
    textContent: '상담 신청',
    attributes: { href: '/consultation/' },
  });
  const specializedV8 = new harness.FakeElement('a', {
    parent: section,
    dataset: { v8Event: 'home_portfolio_cta_click' },
    attributes: { href: '/process/' },
  });
  harness.sections.push(section);
  harness.anchors.push(link, consultation, specializedV8);
  harness.run();

  harness.click(link);
  harness.click(button);
  harness.click(summary);
  harness.click(consultation);
  harness.click(specializedV8);

  const clicks = events(harness, 'content_click').map(({ payload }) => payload);
  assert.deepEqual(clicks.map(({ ctaText }) => ctaText), ['internal_link', 'button_click', 'faq_open']);
  assert.deepEqual(clicks.map(({ ctaLocation }) => ctaLocation), [
    '/commercial/office',
    'show-cost-example',
    'faq-cost',
  ]);
  assert.equal(events(harness, 'consultation_click').length, 1);
  assert.equal(events(harness, 'consultation_click')[0].payload.ctaText, 'consultation_cta');
  const serialized = JSON.stringify([
    ...clicks,
    events(harness, 'consultation_click')[0].payload,
  ]);
  assert.doesNotMatch(serialized, /secret|010-1234-5678|private-value|홍길동|email=/);
});

test('engagement milestones count visible time and lifecycle exit flushes once per transition', () => {
  const harness = createHarness();
  harness.run();

  harness.advance(5000);
  harness.setVisibility('hidden');
  harness.dispatchWindow('pagehide', { persisted: true });
  harness.advance(20000);
  assert.deepEqual(events(harness, 'page_engagement').map(({ payload }) => payload.engagedSeconds), [5]);
  assert.equal(events(harness, 'page_exit').length, 1);

  harness.setVisibility('visible');
  harness.dispatchWindow('pageshow', { persisted: true });
  harness.advance(10000);
  harness.setVisibility('hidden');
  harness.dispatchWindow('pagehide', { persisted: false });

  assert.deepEqual(events(harness, 'page_engagement').map(({ payload }) => payload.engagedSeconds), [5, 15]);
  const exits = events(harness, 'page_exit');
  assert.equal(exits.length, 2);
  assert.ok(exits.every(({ options }) => options.keepalive === true));

  harness.setVisibility('visible');
  harness.advance(45000);
  assert.deepEqual(events(harness, 'page_engagement').map(({ payload }) => payload.engagedSeconds), [
    5, 15, 30, 60,
  ]);
});

test('denied storage still initializes and attribution excludes unrelated query values', () => {
  const harness = createHarness({
    deniedStorage: true,
    search: '?is_test=1&placement=Feed&site_source_name=fb&email=secret@example.com',
  });
  const consultation = new harness.FakeElement('a', {
    attributes: { href: '/consultation/' },
  });
  harness.anchors.push(consultation);
  harness.run();

  const pageView = events(harness, 'page_view')[0];
  assert.ok(pageView);
  assert.equal(pageView.payload.isTest, true);
  assert.equal(pageView.payload.placement, 'Feed');
  assert.equal(pageView.payload.utmSource, 'fb');
  assert.doesNotMatch(JSON.stringify(pageView.payload), /secret@example\.com|email=/);
  const decorated = new URL(consultation.getAttribute('href'));
  assert.equal(decorated.searchParams.get('placement'), 'Feed');
  assert.equal(decorated.searchParams.get('site_source_name'), 'fb');
  assert.equal(decorated.searchParams.has('email'), false);
});
