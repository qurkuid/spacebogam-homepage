// CMP-1315 리뷰 반려 2건 재검증:
//  1) phone_click(내부 funnel + Meta Pixel)이 세션당 1회로 제한되는지
//  2) 업종 판정축이 payload 키가 아니라 utm_content 접두사로 실제 전달되는지
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');
const commercialCallSource = fs.readFileSync(path.join(root, 'assets/commercial-call.js'), 'utf8');

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

function makeAnchor(ElementClass, { href, ctaLocation = '', text = '전화 상담' }) {
  const anchor = Object.create(ElementClass.prototype);
  anchor.dataset = ctaLocation ? { ctaLocation } : {};
  anchor.className = '';
  anchor.textContent = text;
  anchor.getAttribute = (name) => (name === 'href' ? href : null);
  anchor.closest = () => anchor;
  return anchor;
}

function runFunnel({ pathname = '/commercial/call/', search = '', sessionValues = {}, localValues = {} } = {}) {
  const requests = [];
  const clickHandlers = [];
  const localStorage = storage(localValues);
  const sessionStorage = storage(sessionValues);
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
      addEventListener: (type, handler) => {
        if (type === 'click') clickHandlers.push(handler);
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 375; // mobile: tel CTA 대상
  sandbox.window.scrollY = 0;
  sandbox.window.setTimeout = () => 1;
  sandbox.window.setInterval = () => 1;
  sandbox.window.clearInterval = () => {};
  sandbox.window.addEventListener = () => {};
  sandbox.window.crypto = {
    getRandomValues(values) {
      values.fill(7);
      return values;
    },
  };

  vm.runInNewContext(funnelSource, sandbox, { filename: 'funnel-tracking.js' });

  function clickTel(href, ctaLocation) {
    const anchor = makeAnchor(sandbox.Element, { href, ctaLocation });
    clickHandlers.forEach((handler) => handler({ target: anchor }));
  }

  return { requests, sessionStorage, clickTel };
}

test('phone_click: 같은 세션에서 CTA 3개(header/hero/sticky)를 눌러도 1건만 전송', () => {
  const { requests, clickTel } = runFunnel({ search: '?utm_content=shop__a1_condition' });

  clickTel('tel:050713881252', 'header_phone');
  clickTel('tel:050713881252', 'hero_phone');
  clickTel('tel:050713881252', 'sticky_phone');

  const phoneClicks = requests.filter((r) => r.eventName === 'phone_click');
  assert.equal(phoneClicks.length, 1, 'phone_click은 세션당 1회여야 한다');
  assert.equal(phoneClicks[0].ctaLocation, 'header_phone', '첫 클릭만 전송돼야 한다');
});

test('phone_click: 세션이 바뀌면(sessionStorage 비었으면) 다시 1회 전송된다', () => {
  const first = runFunnel({ search: '?utm_content=office__b2' });
  first.clickTel('tel:050713881252', 'header_phone');
  assert.equal(first.requests.filter((r) => r.eventName === 'phone_click').length, 1);

  const second = runFunnel({ search: '?utm_content=office__b2' }); // 새 세션, sessionStorage 초기화
  second.clickTel('tel:050713881252', 'header_phone');
  assert.equal(second.requests.filter((r) => r.eventName === 'phone_click').length, 1);
});

test('phone_click payload: vertical 키는 없고 utmContent 필드에 업종 접두사가 그대로 실린다 (strict 스키마 보존)', () => {
  const { requests, clickTel } = runFunnel({ search: '?utm_content=shop__a1_condition&utm_source=meta&utm_medium=cpc' });
  clickTel('tel:050713881252', 'header_phone');

  const [payload] = requests.filter((r) => r.eventName === 'phone_click');
  assert.ok(payload, 'phone_click 이벤트가 전송돼야 한다');
  assert.equal(payload.utmContent, 'shop__a1_condition');
  assert.equal(payload.vertical, undefined, 'strict 스키마 위반을 막기 위해 vertical 키를 추가하면 안 된다');
  assert.deepEqual(
    Object.keys(payload).filter((key) => key === 'commercialVertical' || key === 'vertical'),
    [],
  );
});

function runCommercialCall({ search }) {
  const pixelCalls = [];
  const clickHandlers = { tel: [], sms: [] };
  const bodyAttrs = {};
  const telLink = {
    getAttribute: (name) => (name === 'data-cta-location' ? 'header_phone' : name === 'href' ? 'tel:050713881252' : null),
    addEventListener: (type, handler) => {
      if (type === 'click') clickHandlers.tel.push(handler);
    },
  };
  const sandbox = {
    URLSearchParams,
    location: { search, pathname: '/commercial/call/' },
    document: {
      body: {
        setAttribute: (key, value) => {
          bodyAttrs[key] = value;
        },
        getAttribute: (key) => bodyAttrs[key],
      },
      title: '',
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: (selector) => (selector.indexOf('tel:') !== -1 ? [telLink] : []),
      addEventListener: () => {},
    },
    window: {},
  };
  sandbox.window = sandbox;
  sandbox.window.sessionStorage = storage();
  sandbox.window.fbq = (...args) => pixelCalls.push(args);

  vm.runInNewContext(commercialCallSource, sandbox, { filename: 'commercial-call.js' });

  function clickTel() {
    clickHandlers.tel.forEach((handler) => handler());
  }

  return { pixelCalls, clickTel, bodyAttrs };
}

test('commercial-call.js: utm_content=shop__... 이면 data-commercial-vertical=shop으로 판정된다', () => {
  const { bodyAttrs } = runCommercialCall({ search: '?utm_content=shop__a1_condition' });
  assert.equal(bodyAttrs['data-commercial-vertical'], 'shop');
});

test('commercial-call.js: Meta Pixel phone_click도 세션당 1회만 발화한다', () => {
  const { pixelCalls, clickTel } = runCommercialCall({ search: '?utm_content=shop__a1_condition' });

  clickTel();
  clickTel();
  clickTel();

  assert.equal(pixelCalls.length, 1, 'fbq trackCustom phone_click은 세션당 1회여야 한다');
  assert.equal(pixelCalls[0][1], 'phone_click');
  assert.equal(pixelCalls[0][2].vertical, 'shop');
});

test('commercial-call.js: 정식 상담 CTA는 현재 UTM·광고 ID와 업종을 보존한다', () => {
  assert.match(commercialCallSource, /new URLSearchParams\(location\.search\)/);
  assert.match(commercialCallSource, /target\.searchParams\.set\('type', 'commercial'\)/);
  assert.match(commercialCallSource, /target\.searchParams\.set\('vertical', key\)/);
  assert.match(commercialCallSource, /target\.searchParams\.set\('channel', 'commercial_landing'\)/);
});
