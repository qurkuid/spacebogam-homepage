// CMP-1312 상업 랜딩 재포지셔닝 회귀 — 전화는 대면상담으로 가는 1차 경로다.
// 퍼널: 광고 → 랜딩 → 전화 사전 확인 → 대면상담 예약 → 현장 확인 → 견적·제안.
// 잠그는 것: office/shop 훅, 대면상담 카피, 옛 "전화 상담 완결" 주장 제거,
// tel:/phone_click 배선 보존, 콜백 폼 API 계약 불변.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'commercial/call/index.html'), 'utf8');
const callSource = fs.readFileSync(path.join(root, 'assets/commercial-call.js'), 'utf8');
const callbackSource = fs.readFileSync(path.join(root, 'assets/commercial-call-callback.js'), 'utf8');

const PHONE_HREF = 'tel:050713881252';

class StubNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this._text = '';
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
  }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get innerHTML() { return ''; }
  set innerHTML(value) {
    if (value === '') { this.children = []; this._text = ''; }
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.has(key) ? this.attributes.get(key) : null; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  click() { (this.listeners.get('click') || []).forEach((fn) => fn()); }
}

function link(href, ctaLocation) {
  const node = new StubNode('a');
  node.setAttribute('href', href);
  node.setAttribute('data-cta-location', ctaLocation);
  return node;
}

function runCommercialCall({ search = '' } = {}) {
  const byId = {};
  for (const id of ['cc-eyebrow', 'cc-headline', 'cc-lead', 'cc-why-title', 'cc-why-cards', 'cc-ask-title', 'cc-asklist']) {
    byId[id] = new StubNode(id === 'cc-headline' ? 'h1' : 'div');
  }
  const telLinks = [
    link(PHONE_HREF, 'commercial_call_header'),
    link(PHONE_HREF, 'commercial_call_hero'),
    link(PHONE_HREF, 'commercial_call_sticky'),
  ];
  const smsLinks = [link('sms:050713881252', 'commercial_call_sms')];
  const fbqCalls = [];
  const funnelSends = [];
  const doc = {
    readyState: 'complete',
    title: '',
    body: new StubNode('body'),
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => new StubNode(tag),
    createTextNode: (text) => ({ tagName: '#text', textContent: String(text) }),
    querySelectorAll: (selector) => {
      if (selector.includes('tel:')) return telLinks;
      if (selector.includes('sms:')) return smsLinks;
      return [];
    },
    addEventListener: () => {},
  };
  const sandbox = {
    URLSearchParams, Array, Object, String, JSON, Math,
    document: doc,
    location: { search, pathname: '/commercial/call/' },
  };
  sandbox.window = sandbox;
  sandbox.window.fbq = (...args) => fbqCalls.push(args);
  sandbox.window.spacebogamFunnel = { send: (name, payload) => funnelSends.push({ name, payload }) };
  vm.runInNewContext(callSource, sandbox, { filename: 'commercial-call.js' });
  return { byId, doc, telLinks, smsLinks, fbqCalls, funnelSends };
}

function headlineLines(node) {
  return node.children.filter((c) => c.tagName === '#text').map((c) => c.textContent);
}

test('office is the default variant and renders the office relocation/expansion hook', () => {
  const { byId, doc } = runCommercialCall();
  assert.deepEqual(headlineLines(byId['cc-headline']), ['직원이 늘었는데,', '사무실은 그대로인가요?']);
  assert.match(byId['cc-lead'].textContent, /이전·확장/);
  assert.match(byId['cc-lead'].textContent, /대면상담 일정을 잡아드립니다/);
  assert.equal(doc.body.getAttribute('data-commercial-vertical'), 'office');
  assert.equal(doc.title, '부산 사무실 인테리어 상담 예약 | 공간보감');
  assert.match(byId['cc-ask-title'].textContent, /전화에서 이 4가지만 확인하면 대면상담을 잡을 수 있습니다/);
});

test('shop variant renders the approved revenue-delay hook with a matching commercial-risk lead', () => {
  const { byId, doc } = runCommercialCall({ search: '?vertical=shop' });
  assert.deepEqual(headlineLines(byId['cc-headline']), ['공사가 하루 늦어지면,', '매출도 하루 늦게 시작됩니다.']);
  assert.doesNotMatch(byId['cc-lead'].textContent, /임대료는 계속 나갑니다/);
  assert.match(byId['cc-lead'].textContent, /업종, 전용면적, 오픈 희망일/);
  assert.match(byId['cc-lead'].textContent, /대면상담 일정을 잡아드립니다/);
  assert.equal(doc.body.getAttribute('data-commercial-vertical'), 'shop');
  assert.equal(doc.title, '부산 카페·매장 인테리어 상담 예약 | 공간보감');
  assert.match(byId['cc-ask-title'].textContent, /전화에서 이 3가지 큰 틀만 확인하면 대면상담을 잡을 수 있습니다/);
});

test('utm_content vertical prefix still switches the variant', () => {
  const { doc, byId } = runCommercialCall({ search: '?utm_content=shop__a1_condition' });
  assert.equal(doc.body.getAttribute('data-commercial-vertical'), 'shop');
  assert.deepEqual(headlineLines(byId['cc-headline']), ['공사가 하루 늦어지면,', '매출도 하루 늦게 시작됩니다.']);
});

test('four Meta creative keys keep each ad hook on the landing hero', () => {
  const cases = [
    ['office_a', 'office', ['입주일은 정해졌는데,', '공사 계획은 아직인가요?']],
    ['office_b', 'office', ['직원이 늘었는데,', '사무실은 그대로인가요?']],
    ['shop_a', 'shop', ['공사가 하루 늦어지면,', '매출도 하루 늦게 시작됩니다.']],
    ['shop_b', 'shop', ['예쁜 매장보다 먼저,', '설비와 운영 동선입니다.']],
  ];
  for (const [creative, vertical, hook] of cases) {
    const { doc, byId } = runCommercialCall({ search: `?vertical=${vertical}&utm_content=${creative}` });
    assert.equal(doc.body.getAttribute('data-commercial-creative'), creative);
    assert.deepEqual(headlineLines(byId['cc-headline']), hook);
    assert.match(byId['cc-lead'].textContent, /대면상담 일정을 잡아드립니다/);
  }
});

// 실제 Meta 광고 URL에는 QA 전용 `vertical=` 파라미터가 없다. 업종은 utm_content 소재
// 라벨에서만 읽히므로, 소재 키 단독으로도 업종이 갈려야 한다. 이게 깨지면 shop 광고가
// 사무실 랜딩으로 떨어지고 phone_click 의 vertical 집계까지 office 로 오염된다.
test('creative key alone routes the vertical without the QA-only vertical param', () => {
  const cases = [
    ['office_a', 'office', ['입주일은 정해졌는데,', '공사 계획은 아직인가요?']],
    ['office_b', 'office', ['직원이 늘었는데,', '사무실은 그대로인가요?']],
    ['shop_a', 'shop', ['공사가 하루 늦어지면,', '매출도 하루 늦게 시작됩니다.']],
    ['shop_b', 'shop', ['예쁜 매장보다 먼저,', '설비와 운영 동선입니다.']],
  ];
  for (const [creative, vertical, hook] of cases) {
    const { doc, byId } = runCommercialCall({ search: `?utm_content=${creative}` });
    assert.equal(doc.body.getAttribute('data-commercial-vertical'), vertical);
    assert.equal(doc.body.getAttribute('data-commercial-creative'), creative);
    assert.deepEqual(headlineLines(byId['cc-headline']), hook);
  }
});

// 정본 UTM 스펙이 규정한 업종 파라미터도 읽어야 office/shop 분리 집계가 성립한다.
test('commercial_vertical param switches the variant', () => {
  const { doc, byId } = runCommercialCall({ search: '?commercial_vertical=shop' });
  assert.equal(doc.body.getAttribute('data-commercial-vertical'), 'shop');
  assert.deepEqual(headlineLines(byId['cc-headline']), ['공사가 하루 늦어지면,', '매출도 하루 늦게 시작됩니다.']);
});

// vertical 집계 오염 회귀: shop 소재 클릭은 shop 으로 보고돼야 한다.
test('phone_click from a shop creative reports the shop vertical', () => {
  const { telLinks, fbqCalls } = runCommercialCall({ search: '?utm_content=shop_a' });
  telLinks[1].click();
  const [, eventName, payload] = fbqCalls[0];
  assert.equal(eventName, 'phone_click');
  assert.equal(payload.vertical, 'shop');
});

// 소재 라벨 표기는 운영 중에 바뀐다(사진형 v5 처럼 버전 접두어가 붙는다). 업종 토큰이
// 라벨 어디에 있든 읽어야 한다 — 못 읽으면 조용히 office 로 떨어져 집계가 오염된다.
test('vertical is read from any segment of the creative label', () => {
  const cases = [
    ['v5_shop_a', 'shop'],
    ['shop__a1_condition', 'shop'],
    ['meta-v5-shop-b', 'shop'],
    ['v5_office_a', 'office'],
  ];
  for (const [content, vertical] of cases) {
    const { doc } = runCommercialCall({ search: `?utm_content=${content}` });
    assert.equal(doc.body.getAttribute('data-commercial-vertical'), vertical, content);
  }
});

// 업종 토큰이 없는 라벨은 기존대로 office 기본값으로 떨어진다(무관한 캠페인 오분류 방지).
test('a label with no vertical token falls back to office', () => {
  const { doc } = runCommercialCall({ search: '?utm_content=ig-202608-basement-r1' });
  assert.equal(doc.body.getAttribute('data-commercial-vertical'), 'office');
});

test('clinic stays disabled and falls back to office', () => {
  const { doc } = runCommercialCall({ search: '?vertical=clinic' });
  assert.equal(doc.body.getAttribute('data-commercial-vertical'), 'office');
});

test('tel click still fires the Meta Pixel phone_click with the active vertical', () => {
  const { telLinks, fbqCalls } = runCommercialCall({ search: '?vertical=shop' });
  telLinks[1].click();
  assert.equal(fbqCalls.length, 1);
  const [method, eventName, payload] = fbqCalls[0];
  assert.equal(method, 'trackCustom');
  assert.equal(eventName, 'phone_click');
  assert.equal(payload.vertical, 'shop');
  assert.equal(payload.cta_location, 'commercial_call_hero');
  assert.equal(payload.phone_target, '050713881252');
});

test('sms callback click still reports commercial_callback_click to the funnel collector', () => {
  const { smsLinks, funnelSends } = runCommercialCall();
  smsLinks[0].click();
  // vm 컨텍스트에서 만든 객체는 프로토타입 realm이 달라 deepStrictEqual이 안 된다.
  assert.equal(funnelSends.length, 1);
  assert.equal(funnelSends[0].name, 'commercial_callback_click');
  assert.equal(funnelSends[0].payload.ctaLocation, 'commercial_call_sms');
});

test('landing HTML frames the call as the first step toward an in-person consultation', () => {
  assert.match(html, /<h1 id="cc-headline">직원이 늘었는데,<br>사무실은 그대로인가요\?<\/h1>/);
  assert.match(html, /전화 사전 확인/);
  assert.match(html, /대면상담 예약<\/strong>/);
  assert.match(html, /현장 확인 · 견적 제안/);
  assert.match(html, /전화로 대면상담 예약하기/);
  assert.match(html, /대면상담 예약 안내입니다/);
  // 콜백은 대면상담 일정을 잡기 위한 보조 경로로 안내한다.
  assert.match(html, /콜백을 요청하시면 대면상담 일정을 대신 잡아드립니다/);
});

test('old telephone-specialist claims are gone from the landing and the variant script', () => {
  assert.doesNotMatch(html, /통화 한 번으로/);
  assert.doesNotMatch(html, /5~10분/);
  assert.doesNotMatch(html, /전화로 조건 확인하기/);
  assert.doesNotMatch(html, /전화로 편하게 말씀해주세요/);
  assert.doesNotMatch(callSource, /전화 상담 \| 공간보감/);
  assert.doesNotMatch(callSource, /통화에서 함께 확인합니다/);
});

test('tel wiring, tracking markers, and callback mount survive the copy change', () => {
  const telHrefs = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
  assert.equal(telHrefs.length, 3, 'header/hero/sticky tel links');
  assert.ok(telHrefs.every((num) => num === '050713881252'));
  assert.equal((html.match(/data-v8-event="phone_click"/g) || []).length, 3);
  for (const cta of ['commercial_call_header', 'commercial_call_hero', 'commercial_call_sticky', 'commercial_call_hero_sms', 'commercial_call_sms']) {
    assert.ok(html.includes(`data-cta-location="${cta}"`), cta);
  }
  for (const marker of ['funnel-tracking.js', 'commercial-call.js', 'commercial-call-callback.js', '512750840350337', 'GTM-PW8GLP8S', 'data-spacebogam-naver-wcs', 'id="cc-callback-root"']) {
    assert.ok(html.includes(marker), marker);
  }
  assert.match(html, /noindex,nofollow/);
});

test('callback form sends the explicit minimal commercial contract without adding UX fields', () => {
  assert.match(callbackSource, /\/api\/consultation\/submit/);
  assert.match(callbackSource, /COMPANY_ID = '4206bdfd-b51d-4433-9f8e-c854131948cc'/);
  assert.match(callbackSource, /NAME_QUESTION_ID = '13'/);
  assert.match(callbackSource, /PHONE_QUESTION_ID = '10'/);
  assert.match(callbackSource, /CALLBACK_TIME_QUESTION_ID = '17'/);
  assert.match(callbackSource, /CONSENT_ANSWER_ID = '9999'/);
  assert.match(callbackSource, /type: 'commercial_callback'/);
  assert.match(callbackSource, /commercialCallback: \{/);
  for (const field of ['name', 'phone', 'vertical', 'callbackTime', 'consent']) {
    assert.match(callbackSource, new RegExp(`\\b${field}:`), field);
  }
  assert.match(callbackSource, /params\.get\('vertical'\).*params\.get\('commercial_vertical'\)/);
  assert.match(callbackSource, /CALLBACK_VERTICALS = \['office', 'shop'\]/);
  assert.doesNotMatch(callbackSource, /marketingAttribution\.channel\s*=/);
  assert.equal((callbackSource.match(/document\.createElement\('input'\)/g) || []).length, 4, '이름/전화/시간 radio/동의 외 UX 필드 추가 금지');
  // 이벤트명은 DB CHECK enum에 있는 3개만 쓴다 — 새 이름은 400이 난다.
  for (const name of ['lead_form_view', 'lead_form_start', 'lead_submit_success']) {
    assert.ok(callbackSource.includes(`'${name}'`), name);
  }
  const eventLiterals = [...callbackSource.matchAll(/sendFunnelEvent\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(eventLiterals)].sort(), ['lead_form_start', 'lead_form_view', 'lead_submit_success']);
  for (const key of ['sbClientId', 'sbSessionId', 'sbSubmitEventId', 'marketingAttribution', 'companyId']) {
    assert.ok(callbackSource.includes(key), key);
  }
  // 고객 대면 카피는 대면상담 프레임이다.
  assert.match(callbackSource, /대면상담 일정을 함께 잡아드립니다/);
  assert.match(callbackSource, /콜백으로 대면상담 잡기/);
});
