/**
 * CMP-225 — 상단 퍼널 이벤트가 검증 세션 표식을 실어 보내는지 지킨다.
 *
 * CMP-27 PR #28 은 서버측 빌더 2개만 고쳐서 consultation_submit·lead_* 만 걸렀다.
 * funnel-tracking.js 는 세션 표식을 아웃바운드 링크의 n=1 에만 쓰고 send() 페이로드에는
 * 넣지 않아, QA 세션의 page_view·scroll_50·*_click 이 실유입으로 집계됐다
 * (2026-07-28 실측: qa_cmp27 캠페인이 visits 4 로 잡힘).
 *
 * 수신 스키마(intm funnelEventInputSchema)는 .strict() 이고 isTest 를 boolean 으로 받는다.
 * snake_case 별칭을 섞으면 전량 400 이 된다(CMP-141). 그래서 키 이름까지 못박아 둔다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');

function storage() {
  const values = new Map();
  return {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}

/** 주어진 쿼리로 트래커를 구동하고 실제로 POST 된 페이로드를 모아 돌려준다. */
function postedPayloads(search, options = {}) {
  const sent = [];
  const location = {
    pathname: '/',
    search,
    hostname: 'spacebogam.kr',
    href: `https://spacebogam.kr/${search}`,
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
    sessionStorage: options.sessionStorage || storage(),
    fetch: (_url, init) => {
      sent.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true });
    },
    document: {
      title: '테스트',
      readyState: 'complete',
      visibilityState: 'visible',
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
  sandbox.window.crypto = {
    getRandomValues(values) {
      if (values instanceof Uint32Array) values[0] = 0;
      else values.fill(7);
      return values;
    },
  };

  vm.runInNewContext(funnelSource, sandbox, { filename: 'funnel-tracking.js' });
  return sent;
}

test('검증 세션의 page_view 는 isTest=true 로 전송된다', () => {
  const sent = postedPayloads('?is_test=1&utm_source=qa_cmp27');
  const pageView = sent.find((p) => p.eventName === 'page_view');
  assert.ok(pageView, 'page_view 가 전송되지 않았다');
  assert.equal(pageView.isTest, true);
});

test('실유입 세션은 isTest=false 로 전송된다', () => {
  const sent = postedPayloads('?utm_source=meta&utm_medium=paid_social');
  const pageView = sent.find((p) => p.eventName === 'page_view');
  assert.ok(pageView, 'page_view 가 전송되지 않았다');
  assert.equal(pageView.isTest, false);
});

test('표식은 camelCase isTest 이고 boolean 이다 — 수신 스키마가 strict 다', () => {
  const [payload] = postedPayloads('?is_test=1');
  assert.ok(payload, '이벤트가 전송되지 않았다');
  assert.equal(typeof payload.isTest, 'boolean');
  assert.ok(!('is_test' in payload), 'snake_case 별칭은 전량 400 을 부른다 (CMP-141)');
});

test('is_test=y 도 검증 세션으로 인정한다 — consultation-form.js 와 목록이 같아야 한다', () => {
  const formSource = fs.readFileSync(path.join(root, 'assets/consultation-form.js'), 'utf8');
  const listOf = (source) => {
    const match = source.match(/var TEST_TRUTHY = (\[[^\]]*\]);/);
    assert.ok(match, 'TEST_TRUTHY 목록을 찾지 못했다');
    return JSON.parse(match[1].replace(/'/g, '"'));
  };
  assert.deepEqual(listOf(funnelSource).slice().sort(), listOf(formSource).slice().sort());

  const [payload] = postedPayloads('?is_test=y');
  assert.equal(payload.isTest, true);
});

test('표식은 쿼리 없는 후속 페이지뷰까지 세션 내내 따라간다', () => {
  const shared = storage();
  postedPayloads('?is_test=1', { sessionStorage: shared });
  const [next] = postedPayloads('', { sessionStorage: shared });
  assert.equal(next.isTest, true);
});
