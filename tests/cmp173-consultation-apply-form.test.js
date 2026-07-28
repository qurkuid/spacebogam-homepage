/**
 * CMP-173 — spacebogam.kr 도메인 안에서 완결되는 상담 폼의 계약 검증.
 *
 * 실제 제출은 하지 않는다. intm 상담 API 는 성공 시 고객에게 알림톡을 실발송하므로
 * 합성 제출이 금지돼 있다. 대신 submit 요청을 가로채 서버로 나갈 payload 를 그대로
 * 검사한다 — 확인하려는 것이 payload 이지 서버 저장이 아니기 때문이다.
 *
 * 실행: node --test tests/cmp173-consultation-apply-form.test.js
 *   (jsdom 필요: NODE_PATH 로 jsdom 설치 위치를 잡아 실행한다.)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const formSource = fs.readFileSync(path.join(root, 'assets/consultation-form.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(root, 'consultation/apply/index.html'), 'utf8');

// 실제 https://intm.kr/api/consultation/questions 응답에서 추린 대표 표본.
// 타입별로 하나씩은 남겨 렌더링 분기를 전부 지나가게 한다.
const QUESTIONS = [
  { id: 13, question: '성함을 알려주세요.', questionType: 'short_answer', options: null, isRequired: true },
  { id: 10, question: '연락처를 알려주세요.', questionType: 'phonenumber', options: null, isRequired: true },
  { id: 15, question: '시공장소 주소를 알려주세요.', questionType: 'address', options: null, isRequired: true },
  { id: 8, question: '시공장소 세부주소를 알려주세요.', questionType: 'detailed_address', options: null, isRequired: true },
  { id: 4, question: '공급평형을 알려주세요.', questionType: 'number', options: null, isRequired: true },
  { id: 16, question: '비밀번호를 입력하세요.(수정시 사용)', questionType: 'password', options: null, isRequired: true },
  { id: 12, question: '시공장소를 모두 선택해 주세요.', questionType: 'multiple_choice', options: ['거실', '주방'], isRequired: true },
  { id: 21, question: '예산 구간을 선택해주세요', questionType: 'select', options: ['5천만원', '1억 이상'], isRequired: true },
  { id: 33, question: '상담을 원하는 날짜를 선택해주세요', questionType: 'date', options: null, isRequired: true },
  { id: 34, question: '상담을 원하는 시간을 선택해주세요', questionType: 'single_choice', options: ['10:00', '14:00'], isRequired: true },
  { id: 7, question: '기타 요청사항이 있으시면 알려주세요.', questionType: 'text', options: null, isRequired: false },
  { id: 25, question: '선호하는 인테리어 스타일을 선택해주세요', questionType: 'multiple_choice', options: ['모던', '북유럽'], isRequired: false },
];

const LANDING_QUERY =
  '?utm_source=meta&utm_medium=paid_social&utm_campaign=busan_remodeling' +
  '&utm_id=CMP173&campaign_id=111&adset_id=222&ad_id=333&asset_id=444&is_test=1';

function bootstrap({ search = '', submitResponse } = {}) {
  const dom = new JSDOM(pageSource.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url: 'https://spacebogam.kr/consultation/apply/' + search,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  const calls = { funnel: [], submit: [], pixel: [], gtag: [], questions: 0 };

  window.fetch = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (String(url).includes('/api/consultation/questions')) {
      calls.questions += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, questions: QUESTIONS }),
      });
    }
    if (String(url).includes('/api/marketing/funnel-events')) {
      calls.funnel.push(body);
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) });
    }
    if (String(url).includes('/api/consultation/submit')) {
      calls.submit.push(body);
      const response = submitResponse || {
        ok: true,
        status: 201,
        payload: { success: true, consultReqId: 9999, leadEventId: body.marketingAttribution.sbSubmitEventId },
      };
      return Promise.resolve({
        ok: response.ok,
        status: response.status,
        json: () => Promise.resolve(response.payload),
      });
    }
    throw new Error('예상치 못한 요청: ' + url);
  };

  window.fbq = (...args) => calls.pixel.push(args);
  window.gtag = (...args) => calls.gtag.push(args);

  window.eval(formSource);
  return { window, calls, document: window.document };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() {
  for (let i = 0; i < 12; i += 1) await tick();
}

function fillRequired(document) {
  document.querySelector('[name="q13"]').value = '홍길동';
  document.querySelector('[name="q10"]').value = '010-1234-5678';
  document.querySelector('[name="q15"]').value = '부산 북구 화명동';
  document.querySelector('[name="q8"]').value = '101동 1001호';
  document.querySelector('[name="q4"]').value = '34';
  document.querySelector('[name="q16"]').value = 'pw1234';
  document.querySelector('#q12_0').checked = true;
  document.querySelector('[name="q21"]').value = '1억 이상';
  document.querySelector('[name="q33"]').value = '2026-08-10';
  document.querySelector('#q34_1').checked = true;
  document.querySelector('#cf-consent-input').checked = true;
}

test('질문 API 응답을 타입별 입력 위젯으로 렌더한다', async () => {
  const { document, calls } = bootstrap();
  await settle();

  assert.equal(calls.questions, 1);
  assert.equal(document.querySelector('[name="q10"]').type, 'tel');
  assert.equal(document.querySelector('[name="q16"]').type, 'password');
  assert.equal(document.querySelector('[name="q33"]').type, 'date');
  assert.equal(document.querySelector('[name="q4"]').type, 'number');
  assert.equal(document.querySelector('[name="q7"]').tagName, 'TEXTAREA');
  assert.equal(document.querySelector('[name="q21"]').tagName, 'SELECT');
  assert.equal(document.querySelector('#q12_0').type, 'checkbox');
  assert.equal(document.querySelector('#q34_0').type, 'radio');
});

test('선택 항목은 접어두되 버리지 않는다 — CRM 필드가 사라지면 안 된다', async () => {
  const { document } = bootstrap();
  await settle();

  const optional = document.querySelector('details.cf-optional');
  assert.ok(optional, '선택 입력 그룹이 있어야 한다');
  assert.equal(optional.open, false, '기본은 접힌 상태여야 한다');
  assert.ok(optional.querySelector('[name="q7"]'), '선택 질문도 폼에 존재해야 한다');
  assert.ok(optional.querySelector('#q25_0'));
});

test('필수 항목이 비면 제출하지 않고 그 항목을 지목한다', async () => {
  const { document, calls } = bootstrap();
  await settle();

  document.querySelector('#cf-consent-input').checked = true;
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.equal(calls.submit.length, 0, '검증 실패 시 서버로 나가면 안 된다');
  assert.match(document.querySelector('.cf-status').textContent, /성함/);
});

test('동의 없이는 제출하지 않는다', async () => {
  const { document, calls } = bootstrap();
  await settle();

  fillRequired(document);
  document.querySelector('#cf-consent-input').checked = false;
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.equal(calls.submit.length, 0);
  assert.match(document.querySelector('.cf-status').textContent, /동의/);
});

test('제출 payload 가 intm 계약과 플랫폼 식별자·is_test 를 그대로 지킨다', async () => {
  const { document, calls } = bootstrap({ search: LANDING_QUERY });
  await settle();

  fillRequired(document);
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.equal(calls.submit.length, 1);
  const payload = calls.submit[0];

  // 서버는 슬러그를 받지 않는다. UUID 가 아니면 500 이다.
  assert.equal(payload.companyId, '4206bdfd-b51d-4433-9f8e-c854131948cc');
  assert.equal(payload.filePath, null);

  // 답변은 질문 id 문자열 키 + 문자열 값, 복수선택은 ', ' 결합.
  assert.equal(payload.answers['13'], '홍길동');
  assert.equal(payload.answers['12'], '거실');
  assert.equal(payload.answers['34'], '14:00');
  assert.equal(payload.answers['9999'], 'true', '개인정보 동의는 고정 id 9999 로 실린다');
  assert.equal(payload.answers['7'], undefined, '빈 선택 항목은 보내지 않는다');

  const attribution = payload.marketingAttribution;
  assert.equal(attribution.utm_id, 'CMP173');
  assert.equal(attribution.campaign_id, '111');
  assert.equal(attribution.adset_id, '222');
  assert.equal(attribution.ad_id, '333');
  assert.equal(attribution.asset_id, '444');
  assert.equal(attribution.utm_source, 'meta');
  assert.equal(attribution.utm_medium, 'paid_social');
  assert.equal(attribution.utm_campaign, 'busan_remodeling');
  // 서버는 'true' / '' 로만 좁힌다. 원본 '1' 을 그대로 보내면 필터가 갈린다.
  assert.equal(attribution.is_test, 'true');
  assert.equal(attribution.form_path, '/consultation/apply/');
  assert.match(attribution.sbSubmitEventId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(attribution.sbClientId, /^[0-9a-f-]{36}$/);
  assert.match(attribution.sbSessionId, /^[0-9a-f-]{36}$/);

  // 허용목록 밖 키를 섞으면 서버가 조용히 버린다 — 보내는 쪽에서 이미 없어야 한다.
  const ALLOWED = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
    'n_keyword', 'n_query', 'n_campaign_type', 'n_ad_group', 'n_keyword_id',
    'source_page', 'landing_page', 'referrer', 'form_path', 'device_type', 'submitted_at',
    'sbClientId', 'sbSessionId', 'sbSubmitEventId',
    'experiment_id', 'experiment_variant', 'page_variant',
    'utm_id', 'campaign_id', 'adset_id', 'ad_id', 'asset_id', 'is_test',
  ]);
  for (const key of Object.keys(attribution)) {
    assert.ok(ALLOWED.has(key), '서버 허용목록에 없는 키: ' + key);
  }
});

test('Pixel Lead 의 eventID 와 서버가 돌려준 leadEventId 가 같은 값이다', async () => {
  const { document, calls } = bootstrap({ search: LANDING_QUERY });
  await settle();

  fillRequired(document);
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  const sent = calls.submit[0].marketingAttribution.sbSubmitEventId;
  const lead = calls.pixel.find((call) => call[0] === 'track' && call[1] === 'Lead');
  assert.ok(lead, 'Lead 이벤트가 발화해야 한다');
  assert.equal(lead[3].eventID, sent, '브라우저와 서버가 같은 event_id 를 써야 중복 제거된다');
  assert.equal(lead[2].currency, 'KRW');
});

test('서버가 다른 event_id 를 파생하면 서버 값을 따른다', async () => {
  const derived = '11111111-2222-4333-8444-555555555555';
  const { document, calls } = bootstrap({
    submitResponse: { ok: true, status: 201, payload: { success: true, consultReqId: 1, leadEventId: derived } },
  });
  await settle();

  fillRequired(document);
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  const lead = calls.pixel.find((call) => call[0] === 'track' && call[1] === 'Lead');
  assert.equal(lead[3].eventID, derived);
});

test('퍼널 이벤트는 view → start → submit_success 순으로 strict 스키마에 맞춰 나간다', async () => {
  const { document, calls } = bootstrap({ search: LANDING_QUERY });
  await settle();

  document.querySelector('[name="q13"]').value = '홍길동';
  document.querySelector('[name="q13"]').dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  await settle();

  fillRequired(document);
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  const names = calls.funnel.map((event) => event.eventName);
  assert.deepEqual(names, ['lead_form_view', 'lead_form_start', 'lead_submit_success']);

  const submitEvent = calls.funnel[2];
  assert.equal(submitEvent.isTest, true, 'QA 유입이 실적으로 집계되면 안 된다');
  assert.equal(submitEvent.utmSource, 'meta');
  assert.equal(submitEvent.clientId, calls.submit[0].marketingAttribution.sbClientId,
    'funnel-tracking.js 와 같은 clientId 를 써야 클릭과 상담 건이 이어진다');
  // 수신 스키마는 .strict() — snake_case 별칭이 섞이면 전량 400 이 된다(CMP-141).
  for (const key of Object.keys(submitEvent)) {
    assert.ok(!key.includes('_'), 'snake_case 키가 섞였다: ' + key);
  }
});

test('lead_submit_success 의 eventId 가 sbSubmitEventId 와 같아야 원장에서 중복 제거된다', async () => {
  // 서버 recordSubmittedLead 가 sbSubmitEventId 로 이미 한 행을 쓴다. 클라이언트가 다른
  // id 로 같은 이벤트를 또 보내면 ON CONFLICT 에 걸리지 않아 lead 단계가 2배로 잡힌다.
  const { document, calls } = bootstrap();
  await settle();

  fillRequired(document);
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  const submitEvent = calls.funnel.find((event) => event.eventName === 'lead_submit_success');
  assert.equal(submitEvent.eventId, calls.submit[0].marketingAttribution.sbSubmitEventId);

  // 나머지 lead 단계도 세션 내에서 고정이어야 새로고침이 중복 집계되지 않는다.
  const view = calls.funnel.find((event) => event.eventName === 'lead_form_view');
  assert.match(view.eventId, /^[0-9a-f-]{36}$/);
  assert.notEqual(view.eventId, submitEvent.eventId);
});

test('제출 실패 시 성공 화면을 그리지 않고 Lead 도 발화하지 않는다', async () => {
  const { document, calls } = bootstrap({
    submitResponse: { ok: false, status: 500, payload: { success: false, error: '저장 실패' } },
  });
  await settle();

  fillRequired(document);
  document.querySelector('form').dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.equal(document.querySelector('.cf-success'), null);
  assert.ok(!calls.pixel.some((call) => call[1] === 'Lead'), '실패했는데 Lead 가 나가면 전환이 부풀려진다');
  assert.match(document.querySelector('.cf-status').textContent, /실패/);
  assert.equal(document.querySelector('.cf-submit').disabled, false, '재시도할 수 있어야 한다');
});

test('질문을 못 불러오면 기존 intm 신청서로 빠져나갈 길을 준다', async () => {
  const dom = new JSDOM(pageSource.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url: 'https://spacebogam.kr/consultation/apply/',
    runScripts: 'outside-only',
  });
  dom.window.fetch = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
  dom.window.eval(formSource);
  await settle();

  const fallback = dom.window.document.querySelector('.cf-error-box a');
  assert.ok(fallback);
  assert.match(fallback.href, /^https:\/\/intm\.kr\/consultation\/ggbg\?/);
});

test('site-tracking / funnel-tracking 이 신규 폼 경로를 상담 링크로 인식한다', () => {
  const siteSource = fs.readFileSync(path.join(root, 'assets/site-tracking.js'), 'utf8');
  const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');
  // 인식하지 못하면 랜딩 URL 의 플랫폼 식별자가 폼으로 릴레이되지 않는다.
  assert.match(siteSource, /LOCAL_CONSULTATION_PATHS[\s\S]{0,200}'\/consultation\/apply\/'/);
  assert.match(funnelSource, /CONSULTATION_PATHS[\s\S]{0,200}'\/consultation\/apply\/'/);
});
