const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
  }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { this.listeners.click?.({ preventDefault() {} }); }
  input(value) { this.value = value; this.listeners.input?.({}); }
  change(value) { if (this.type === 'checkbox') this.checked = value; else this.value = value; this.listeners.change?.({}); }
  focus() { this.focused = true; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const fieldset = selector.match(/^\[data-question-id="([^"]+)"\]$/);
    const match = node => fieldset ? node.attributes['data-question-id'] === fieldset[1]
      : selector === '[aria-invalid]' ? 'aria-invalid' in node.attributes
        : selector.startsWith('#') ? node.id === selector.slice(1)
          : /^[a-z0-9,]+$/.test(selector) ? selector.split(',').includes(node.tag)
            : node.className.split(' ').includes(selector.slice(1));
    const result = [];
    const visit = node => node.children.forEach(child => { if (match(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
}

const root = path.join(__dirname, '../reports/consultation-step-prototype-20260928');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function harness({ search = '?type=commercial&vertical=shop&utm_source=meta&utm_campaign=shop_launch&adset_id=set-7&ad_id=ad-9', session = storage() } = {}) {
  const nodes = Object.fromEntries(['stage', 'next', 'back', 'skip', 'restart', 'progress-fill'].map(id => [id, new Element()]));
  const progress = new Element();
  const asideImage = new Element('img');
  const asideCopy = new Element('p');
  const location = { search, pathname: '/consultation/', href: 'http://localhost/consultation/' + search, protocol: 'http:' };
  const context = {
    document: {
      getElementById: id => nodes[id],
      querySelector: selector => selector === '.progress' ? progress : selector === '.aside img' ? asideImage : selector === '.aside-copy p:last-child' ? asideCopy : null,
      createElement: tag => new Element(tag),
      createTextNode: value => Object.assign(new Element('#text'), { textContent: value }),
      referrer: '', cookie: ''
    },
    window: { SB_APT_INDEX: [], SB_APT_DONGS: {}, location, scrollTo() {}, addEventListener() {} },
    location, innerWidth: 390, sessionStorage: session, localStorage: storage(), URLSearchParams,
    Blob, FormData, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto
  };
  vm.runInNewContext(read('consultation-questions.js'), context);
  const source = read('flow.js').replace(/\}\)\(\);\s*$/, `window.test = {
    answers: () => answers, current: () => current, index: () => questionIndex,
    questions: questionList, group: groupQuestions, validate: questionError, payload: submissionPayload, save: saveDraft
  };})();`);
  vm.runInNewContext(source, context);
  const all = predicate => {
    const found = [];
    const visit = node => { if (predicate(node)) found.push(node); node.children.forEach(visit); };
    visit(nodes.stage);
    return found;
  };
  return {
    nodes, api: context.window.test, session, asideImage, asideCopy,
    next: () => nodes.next.click(), restart: () => nodes.restart.click(),
    input(id, value) {
      const field = all(node => node.id === 'answer-' + id)[0];
      assert.ok(field, 'input ' + id);
      field.tag === 'select' ? field.change(value) : field.input(value);
    },
    button(label) {
      const button = all(node => node.tag === 'button' && node.children.some(child => child.textContent === label))[0];
      assert.ok(button, 'button ' + label);
      button.click();
    },
    select(option) {
      const select = all(node => node.tag === 'select' && node.children.some(child => child.value === option))[0];
      assert.ok(select, 'select ' + option);
      select.change(option);
    },
    text: () => all(() => true).map(node => node.textContent).join(' ')
  };
}

function fillCommonPage(h, name = '김상업') {
  h.input('13', name);
  h.input('10', '010-1234-5678');
  h.input('15', '부산 해운대구 후보지 검토 중');
  h.input('8', '2층 201호');
  h.input('area', '42');
  h.input('5', '2099-01-10');
  h.input('currentState', 'vacant');
}

function fillCommercialPage(h) {
  assert.equal(h.api.answers().responses.vertical, 'shop', '광고 vertical 기본값을 두 번째 페이지에서도 유지한다');
  h.button('임대 계약 완료');
  h.input('handoverDate', '2099-01-15');
  h.input('previousUse', '의류 매장');
  h.button('전체 공사');
  h.button('아직 몰라요');
  h.button('아직 확인 전');
  h.button('도면이 없어요');
  h.input('openDate', '2099-11-15');
  h.input('budget', '50_100m');
  h.input('callbackTime', 'weekday_pm');
  h.input('requestNote', '브랜드 동선과 진열 효율을 함께 상담하고 싶습니다');
}

const residential = harness({ search: '?type=residential&is_test=1' });
assert.equal(residential.api.current(), 'contact', '주거 유입은 승인된 두 페이지 플로우의 첫 화면을 유지한다');
assert.deepEqual(Array.from(residential.api.questions(), question => String(question.id)).slice(0, 3), ['13', '10', '15']);
assert.equal(residential.api.payload(null).marketingAttribution.form_contract, 'residential_two_page_v1', '주거 유입은 승인된 두 페이지 서버 계약을 사용한다');
assert.equal(residential.asideImage.hidden, false);
assert.match(residential.asideCopy.textContent, /어떤 집/);

const commercial = harness();
assert.equal(commercial.api.answers().type, '상업 공간');
assert.equal(commercial.api.answers().responses.vertical, 'shop', '광고 vertical을 안전한 허용값으로 미리 선택한다');
assert.equal(commercial.asideImage.hidden, true, '상업 상담에서 주거 포트폴리오 사진을 숨긴다');
assert.match(commercial.asideCopy.textContent, /일하고 운영할지/);
assert.deepEqual(Array.from(commercial.api.group('contact'), question => String(question.id)), ['13', '10', '15', 'area', '5', 'currentState']);
commercial.next();
assert.equal(commercial.api.current(), 'contact', '빈 공통 첫 페이지는 진행되지 않는다');
fillCommonPage(commercial);
commercial.next();
assert.equal(commercial.api.current(), 'planning', '상업 상담도 공통 첫 페이지 뒤 유형별 두 번째 페이지로 이동한다');
assert.deepEqual(Array.from(commercial.api.group('planning'), question => String(question.id)), [
  'vertical', 'leaseStatus', 'previousUse', 'workScope', 'facilityNeeds',
  'permitStatus', 'drawingStatus', 'openDate', 'budget', 'callbackTime', 'requestNote'
]);
assert.doesNotMatch(commercial.text(), /도면을 저장|도면 직접 업로드|없음 · 상담 시 확인/, '상업 두 번째 페이지에 주거 도면 절차가 섞이지 않는다');
fillCommercialPage(commercial);
assert.deepEqual(Array.from(commercial.api.group('planning'), question => String(question.id)), [
  'vertical', 'leaseStatus', 'handoverDate', 'previousUse', 'workScope', 'facilityNeeds',
  'permitStatus', 'drawingStatus', 'openDate', 'budget', 'callbackTime', 'requestNote'
], '임대 계약 완료 시 현장 인도일을 포함한다');
const payload = commercial.api.payload('/should-not-pass-through.png');
assert.equal(payload.type, 'commercial');
assert.equal(payload.filePath, null);
assert.equal(payload.commercialLead.vertical, 'shop');
assert.equal(payload.commercialLead.name, '김상업');
assert.equal(payload.commercialLead.phone, '010-1234-5678');
assert.equal(payload.commercialLead.address, '부산 해운대구 후보지 검토 중 2층 201호');
assert.equal(payload.commercialLead.constructionDate, '2099-01-10');
assert.equal(payload.commercialLead.currentState, 'vacant');
assert.equal(payload.commercialLead.handoverDate, '2099-01-15');
assert.deepEqual(Object.keys(payload.commercialLead).sort(), [
  'address', 'area', 'budget', 'callbackTime', 'consent', 'constructionDate', 'currentState', 'drawingStatus', 'facilityNeeds',
  'handoverDate', 'leaseStatus', 'name', 'openDate', 'permitStatus', 'phone', 'previousUse', 'requestNote', 'vertical', 'workScope'
].sort(), '서버 full commercial 필수 필드를 빠짐없이 보낸다');
assert.equal(payload.marketingAttribution.utm_source, 'meta');
assert.equal(payload.marketingAttribution.utm_campaign, 'shop_launch');
assert.equal(payload.marketingAttribution.adset_id, 'set-7');
assert.equal(payload.marketingAttribution.ad_id, 'ad-9');
assert.equal(payload.marketingAttribution.form_contract, undefined, '상업 요청은 도면을 요구하는 grouped_v2 서버 계약으로 보내지 않는다');
assert.equal(payload.metaMatching.consent, false);
assert.equal(payload.metaMatching.version, 'meta-contact-v1');

commercial.restart();
assert.equal(commercial.api.answers().type, '상업 공간');
assert.equal(commercial.api.answers().responses.vertical, 'shop', '처음부터 다시 시작해도 랜딩 업종을 유지한다');

const residentialDraft = JSON.stringify({
  version: 2, updatedAt: Date.now(), answers: { type: '주거 공간', housing: '아파트', responses: { 13: '기존 고객' } },
  current: 'contact', trail: [], questionIndex: 0
});
const collision = harness({ session: storage({ 'spacebogam.consultationDraft.v2': residentialDraft }) });
assert.equal(collision.api.answers().type, '상업 공간', '상업 직접 링크가 주거 초안에 오염되지 않는다');
assert.equal(collision.api.answers().responses.vertical, 'shop');

const legacyCommercialDraft = JSON.stringify({
  version: 2, updatedAt: Date.now(),
  answers: {
    type: '상업 공간', housing: '아파트', commercialAddressBase: '부산 수영구 광안해변로 10', commercialAddressDetail: '3층',
    responses: {
      name: '기존 상가 고객', phone: '010-9876-5432', address: '부산 수영구 광안해변로 10 3층',
      constructionDate: '2099-02-01', currentState: 'occupied', vertical: 'shop', area: '50', budget: '3,500만원'
    }
  },
  current: 'summary', trail: [{ key: 'question', index: 8 }], questionIndex: 8
});
const migrated = harness({ session: storage({ 'spacebogam.consultationDraft.v2': legacyCommercialDraft }) });
assert.equal(migrated.api.current(), 'planning', '기존 상업 순차 초안을 새 유형별 두 번째 페이지로 복원한다');
assert.equal(migrated.api.answers().responses['13'], '기존 상가 고객');
assert.equal(migrated.api.answers().responses['10'], '010-9876-5432');
assert.equal(migrated.api.answers().responses['15'], '부산 수영구 광안해변로 10');
assert.equal(migrated.api.answers().responses['8'], '3층');
assert.equal(migrated.api.answers().responses['5'], '2099-02-01');
assert.equal(migrated.api.answers().responses.currentState, 'occupied', '공통 현장 상태를 유지한다');
assert.equal(migrated.api.answers().responses.area, '50', '기존 상업 유형별 답변을 유지한다');
assert.equal(migrated.api.payload(null).commercialLead.address, '부산 수영구 광안해변로 10 3층');
assert.equal(migrated.nodes.stage.querySelector('#answer-budget').value, '기타(직접입력)');
assert.equal(migrated.nodes.stage.querySelector('#answer-budget-custom').value, '3,500만원');
assert.equal(migrated.api.payload(null).commercialLead.budget, '3,500만원');
migrated.input('budget-custom', '');
assert.ok(migrated.api.validate(migrated.api.group().find(q => q.id === 'budget')), '빈 직접입력 예산은 거절한다');
migrated.input('budget-custom', '4천만~5천만원');
assert.equal(migrated.api.payload(null).commercialLead.budget, '4천만~5천만원');


const draftSession = storage();
const first = harness({ session: draftSession });
fillCommonPage(first, '임시 저장 고객');
first.input('area', '44');
first.next();
first.api.save();
const restored = harness({ session: draftSession });
assert.equal(restored.api.current(), 'planning');
assert.equal(restored.api.answers().responses['13'], '임시 저장 고객', '공통 이름을 복원한다');
assert.equal(restored.api.answers().responses['15'], '부산 해운대구 후보지 검토 중', '공통 기본주소를 복원한다');
assert.equal(restored.api.answers().responses['8'], '2층 201호', '공통 상세주소를 복원한다');
assert.equal(restored.api.answers().responses['5'], '2099-01-10', '공통 공사 시작일을 복원한다');
assert.equal(restored.api.answers().responses.currentState, 'vacant', '공통 현장 상태를 복원한다');
assert.equal(restored.api.answers().responses.area, '44', '상업 두 번째 페이지 답변을 복원한다');

console.log('commercial sales handoff tests passed');
