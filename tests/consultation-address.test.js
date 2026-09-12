const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'consultation-form.js'), 'utf8');

function balancedFrom(start) {
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unbalanced function');
}

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  return balancedFrom(start);
}

function submitHandlerSource() {
  const marker = "form.addEventListener('submit', function(event)";
  const start = source.indexOf('function(event)', source.indexOf(marker));
  assert.notEqual(start, -1, 'submit handler not found');
  return balancedFrom(start);
}

class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.attributes = {};
    this.hidden = false;
    this.classList = { add() {}, remove() {} };
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    child.parentNode = this;
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatchEvent(event) { event.target = this; (this.listeners[event.type] || (() => {}))(event); return true; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click')); }
  scrollIntoView() { this.scrolled = true; }
  querySelector() { return null; }
}

class Event {
  constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); }
}

function addressHarness() {
  const scripts = [];
  const detail = new Node('input');
  const context = {
    Event,
    Promise,
    clearTimeout,
    setTimeout,
    window: {},
    root: { querySelector: (selector) => selector === '[autocomplete="address-line2"]' ? detail : null },
    document: {
      createElement: (tag) => new Node(tag),
      head: { appendChild: (script) => scripts.push(script) },
    },
  };
  vm.createContext(context);
  vm.runInContext(`
    ${functionSource('element')}
    var postcodeScript;
    ${functionSource('loadPostcode')}
    ${functionSource('addAddressSearch')}
  `, context);

  const wrap = new Node();
  const input = new Node('input');
  input.id = 'q15';
  wrap.appendChild(input);
  context.addAddressSearch(wrap, input);
  return {
    context, detail, input, scripts,
    search: wrap.children[0],
    panel: wrap.children[1],
    close: wrap.children[1].children[0],
    host: wrap.children[1].children[1],
    notice: wrap.children[3],
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('주소 입력칸을 누르면 검색이 열리고 다시 눌러도 닫히지 않는다', async () => {
  const h = addressHarness();
  let opened = 0;
  h.context.window.kakao = { Postcode: function() { this.embed = () => { opened += 1; }; } };
  h.input.click();
  await settle();
  assert.equal(h.panel.hidden, false);
  assert.equal(opened, 1);
  h.input.click();
  await settle();
  assert.equal(h.panel.hidden, false);
  assert.equal(opened, 1);
  h.close.click();
  h.input.click();
  await settle();
  assert.equal(h.panel.hidden, false);
  assert.equal(opened, 2);
});

test('기본 주소는 읽기 전용이고 상세주소는 직접 입력할 수 있다', () => {
  const context = {
    document: { createElement: (tag) => new Node(tag) },
    INPUT_TYPE_BY_QUESTION_TYPE: {},
    optionsOf: () => [],
    addAddressSearch() {},
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('element')}\n${functionSource('buildField')}`, context);
  const address = context.buildField({ id: 15, question: '주소', questionType: 'address' });
  const detail = context.buildField({ id: 8, question: '상세주소', questionType: 'detailed_address' });
  assert.equal(address.children[1].readOnly, true);
  assert.equal(address.children[1].autocomplete, 'off');
  assert.equal(Boolean(detail.children[1].readOnly), false);
  assert.equal(detail.children[1].autocomplete, 'address-line2');
});

test('주소 SDK 로드 실패 뒤 다시 시도해 검색기를 연다', async () => {
  // Given
  const h = addressHarness();

  // When
  h.search.dispatchEvent(new Event('click'));
  assert.equal(h.scripts.length, 1);
  h.scripts[0].onerror();
  await settle();
  h.search.dispatchEvent(new Event('click'));

  let postcodeOptions;
  h.context.window.kakao = { Postcode: function(options) { postcodeOptions = options; this.embed = (host) => { host.embedded = true; }; } };
  h.scripts[1].onload();
  await settle();

  // Then
  assert.equal(h.scripts.length, 2, '실패한 Promise를 재사용하면 안 된다');
  assert.equal(h.panel.hidden, false);
  assert.equal(h.host.embedded, true);
  assert.equal(typeof postcodeOptions.oncomplete, 'function');
});

test('주소 선택은 기존 답변 input을 채우고 이벤트를 발화한 뒤 상세주소로 이동한다', async () => {
  // Given
  const h = addressHarness();
  const events = [];
  h.input.addEventListener('input', (event) => events.push(event.type));
  h.input.addEventListener('change', (event) => events.push(event.type));
  let postcodeOptions;
  h.context.window.kakao = { Postcode: function(options) { postcodeOptions = options; this.embed = () => {}; } };

  // When
  h.search.dispatchEvent(new Event('click'));
  await settle();
  postcodeOptions.oncomplete({ address: '부산광역시 북구 금곡대로 123', apartment: 'Y', buildingName: '공간아파트' });

  // Then
  assert.equal(h.input.value, '부산광역시 북구 금곡대로 123 (공간아파트)');
  assert.deepEqual(events, ['input', 'change']);
  assert.equal(h.panel.hidden, true);
  assert.equal(h.detail.focused, true);
});

test('SDK 로딩 중 닫으면 로드 완료 뒤 검색기가 다시 열리지 않는다', async () => {
  // Given
  const h = addressHarness();
  let constructed = 0;

  // When
  h.search.dispatchEvent(new Event('click'));
  h.close.dispatchEvent(new Event('click'));
  h.context.window.kakao = { Postcode: function() { constructed += 1; this.embed = () => {}; } };
  h.scripts[0].onload();
  await settle();

  // Then
  assert.equal(h.panel.hidden, true);
  assert.equal(h.search.getAttribute('aria-expanded'), 'false');
  assert.equal(constructed, 0);
});

test('주소 통합 뒤에도 상담 제출 payload의 answers 계약을 유지한다', async () => {
  // Given
  let request;
  const context = {
    CONSENT_ANSWER_ID: '9999',
    COMPANY_ID: 'company-id',
    SUBMIT_URL: 'https://intm.kr/api/consultation/submit',
    COMMERCIAL_QUESTIONS: [],
    submitting: false,
    leadType: 'residential',
    questions: [
      { id: 15, question: '주소', questionType: 'address', isRequired: true },
      { id: 8, question: '상세주소', questionType: 'detailed_address', isRequired: false },
    ],
    answersById: { 15: '부산광역시 북구 금곡대로 123', 8: '101동 1001호' },
    readAnswer(question) { return this.answersById[question.id]; },
    clearQuestionError() {},
    renderQuestionError() {},
    trackGtag() {},
    questionTrackingDetail() {},
    element() { return new Node(); },
    marketingAttribution() { return { sbSubmitEventId: 'event-id' }; },
    renderSuccess() {},
    consent: new Node('input'),
    consentWrap: new Node(),
    status: new Node('p'),
    submit: new Node('button'),
    fetch(url, init) {
      request = { url, body: JSON.parse(init.body) };
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ success: true }) });
    },
  };
  context.consent.checked = true;
  context.readAnswer = context.readAnswer.bind(context);
  vm.createContext(context);
  vm.runInContext(`submitHandler = ${submitHandlerSource()}`, context);

  // When
  context.submitHandler({ preventDefault() {} });
  await settle();

  // Then
  assert.equal(request.url, context.SUBMIT_URL);
  assert.deepEqual(request.body.answers, {
    8: '101동 1001호',
    15: '부산광역시 북구 금곡대로 123',
    9999: 'true',
  });
  assert.deepEqual(Object.keys(request.body).sort(), [
    'answers', 'commercialLead', 'companyId', 'filePath', 'marketingAttribution', 'type',
  ]);
});
