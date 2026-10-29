const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const canvasScales = [];

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
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.({}); }
  focus() { this.focused = true; }
  getContext() { return { fillRect() {}, translate() {}, scale(x, y) { canvasScales.push([x, y]); }, drawImage() {} }; }
  toBlob(callback, type) { callback(new Blob(['flipped-image'], { type })); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const fieldset = selector.match(/^\[data-question-id="([^"]+)"\]$/);
    const match = node => fieldset ? node.attributes['data-question-id'] === fieldset[1]
      : selector === '[aria-invalid]' ? 'aria-invalid' in node.attributes
      : selector.startsWith('#') ? node.id === selector.slice(1)
      : /^[a-z0-9,]+$/.test(selector) ? selector.split(',').includes(node.tag)
      : selector === '.input-row input' ? node.tag === 'input' && node.parent?.className === 'input-row'
        : node.className.split(' ').includes(selector.slice(1));
    const result = [];
    const visit = node => node.children.forEach(child => { if (match(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
}


const root = path.join(__dirname, '../reports/consultation-step-prototype-20260928');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function storage() { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
function harness({ session = storage(), fetch, search = '?is_test=1&utm_campaign=grouped_qa', gtag } = {}) {
  const nodes = Object.fromEntries(['stage','next','back','skip','restart','progress-fill','kakao-quick-consultation'].map(id => [id, new Element()]));
  const progress = new Element();
  const context = { document: {
    getElementById: id => nodes[id], querySelector: selector => selector === '.progress' ? progress : null,
    createElement: tag => new Element(tag), createTextNode: value => Object.assign(new Element('#text'), { textContent: value }), head: new Element('head')
  }, window: { SB_APT_INDEX: [], SB_APT_DONGS: {qa:['111동']}, scrolls: [], scrollTo(value) { this.scrolls.push(value); }, addEventListener() {} }, location: { search, pathname: '/consultation/', href: 'http://localhost/consultation/?is_test=1' },
    innerWidth: 390, sessionStorage: session, localStorage: storage(), URLSearchParams, Blob, FormData, AbortController,
    setTimeout, clearTimeout, fetch, gtag, crypto: require('node:crypto').webcrypto,
    createImageBitmap: async () => ({ width: 100, height: 80, close() {} }),
    URL: { createObjectURL: file => 'blob:test/' + file.name, revokeObjectURL() {} }
  };
  vm.runInNewContext(read('consultation-questions.js'), context);
  const source = read('flow.js').replace(/\}\)\(\);\s*$/, `window.test = {
    answers: () => answers, current: () => current, index: () => questionIndex, questions: questionList, group: groupQuestions,
    payload: submissionPayload, render, validate: questionError, save: saveDraft,
    plan: openPlanPreview, image: imageForSubmission, dong: renderDong, submit: submitConsultation, pending: () => pendingBody
  };})();`);
  vm.runInNewContext(source, context);
  const api = context.window.test;
  const stage = nodes.stage;
  const all = predicate => { const found = []; const visit = node => { if (predicate(node)) found.push(node); node.children.forEach(visit); }; visit(stage); return found; };
  return { context, nodes, api, all, stage, next: () => nodes.next.click(), title: () => stage.children[1].textContent,
    input: (id, value) => { const field = all(node => node.id === 'answer-' + id)[0]; assert.ok(field, 'input ' + id); field.type === 'select' || field.tag === 'select' ? field.change(value) : field.input(value); },
    button: text => { const button = all(node => node.tag === 'button' && (node.textContent === text || node.children.some(child => child.textContent === text)))[0]; assert.ok(button, text); button.click(); },
    error: () => stage.querySelector('#form-error')?.textContent
  };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function fillResidential(h, { detail = '' } = {}) {
  assert.equal(h.api.current(), 'contact');
  assert.deepEqual(Array.from(h.api.group(), question => String(question.id)), ['13', '10', '15']);
  h.input('13', '테스트');
  h.input('10', '010-0000-0000');
  h.input('15', '부산광역시 연제구 해맞이로 23');
  if (detail) h.input('8', detail);
  h.next();
  assert.equal(h.api.current(), 'planning');
  assert.deepEqual(Array.from(h.api.group(), question => String(question.id)).slice(0, 3), ['4', '21', '12']);
  h.input('21', '5천만~6천만원');
  h.button('거실');
  h.button('샤시 교체');
}

async function run() {
  const trackingEvents = [];
  const tracking = harness({ search: '?is_test=1&site_source_name=instagram&placement=stories', fetch: async (url, options = {}) => {
    if (String(url).includes('/funnel-events')) trackingEvents.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({}) };
  }});
  await settle();
  const viewEvent = trackingEvents.find(event => event.eventName === 'lead_form_view');
  assert.equal(viewEvent.utmSource, 'instagram');
  assert.equal(viewEvent.placement, 'stories');
  tracking.next(); await settle();
  assert.ok(trackingEvents.some(event => event.eventName === 'lead_step_error' && event.ctaLocation === 'contact'));

  const apiMismatch = harness({ fetch: async url => String(url).includes('/questions')
    ? { ok: true, json: async () => ({ questions: [] }) }
    : { ok: true, status: 200, json: async () => ({}) } });
  await settle();
  assert.equal(apiMismatch.api.current(), 'contact');
  assert.ok(apiMismatch.stage.querySelector('#answer-13'), '빈 질문 API 응답이 고정 주거 스키마를 지우지 않는다');

  const mobile = harness();
  assert.equal(mobile.api.current(), 'contact', '주거 상담은 안내 화면 없이 첫 입력 화면에서 시작한다');
  assert.ok(mobile.stage.querySelector('#answer-13').focused, '모바일 첫 입력란 자동 포커스');
  mobile.next();
  assert.match(mobile.error(), /성함/);
  mobile.input('13', '모바일');
  mobile.stage.querySelector('#answer-13').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.ok(mobile.stage.querySelector('#answer-10').focused, '모바일 키보드 다음 입력 이동');
  fillResidential(harness(), { detail: '101동 1001호' });

  const restoredFields = harness();
  fillResidential(restoredFields);
  const exposed = new Set(restoredFields.api.group('contact').concat(restoredFields.api.group('planning')).map(q => String(q.id)));
  for (const question of restoredFields.api.questions()) {
    if (question.questionType === 'detailed_address' || question.showIf) continue;
    assert.ok(exposed.has(String(question.id)), '기존 문항 누락: ' + question.question);
  }
  const schedule = restoredFields.api.group().find(q => q.questionType === 'schedule');
  assert.equal(schedule.isRequired, false);
  assert.equal(restoredFields.api.validate(schedule), '', '방문 일정 미정은 제출을 막지 않는다');
  restoredFields.api.answers().responses['33'] = '2099-12-31';
  assert.ok(restoredFields.api.validate(schedule), '부분 방문 일정은 검증한다');
  restoredFields.api.answers().responses['34'] = '10:00';
  assert.equal(restoredFields.api.validate(schedule), '');
  delete restoredFields.api.answers().responses['33'];
  delete restoredFields.api.answers().responses['34'];
  const timeButton = restoredFields.stage.querySelector('.schedule-time');
  timeButton.click();
  assert.ok(restoredFields.api.validate(schedule));
  timeButton.click();
  assert.equal(restoredFields.api.validate(schedule), '', '선택한 방문 시간은 다시 눌러 해제한다');
  restoredFields.button('네, 확장할 계획이에요');
  assert.ok(restoredFields.stage.querySelector('[data-question-id="expansion_spaces"]'));
  restoredFields.button('거실');
  restoredFields.button('네, 설치할 계획이에요');
  assert.ok(restoredFields.stage.querySelector('#answer-system_ac_count'));
  restoredFields.input('system_ac_count', '0');
  assert.ok(restoredFields.api.validate(restoredFields.api.group().find(q => q.id === 'system_ac_count')));
  restoredFields.input('system_ac_count', '3');
  restoredFields.button('네, 교체할 계획이에요');
  restoredFields.input('7', '수납을 충분히 만들어 주세요.');
  const restoredPayload = restoredFields.api.payload(null);
  assert.match(restoredPayload.answers['7'], /시스템에어컨 대수: 3/);
  assert.match(restoredPayload.answers['7'], /샤시 교체: 네, 교체할 계획이에요/);
  restoredFields.button('설치하지 않아요');
  assert.equal(restoredFields.api.answers().responses.system_ac_count, undefined);
  assert.equal(restoredFields.stage.querySelector('#answer-system_ac_count'), null);

  const payloadHarness = harness();
  fillResidential(payloadHarness, { detail: '101동 1001호' });
  assert.deepEqual(Array.from(payloadHarness.api.group().find(question => String(question.id) === '12').options),
    ['전체 리모델링', '현관', '거실', '주방', '공용 욕실', '안방 욕실', '안방', '각 방', '발코니 확장', '샤시 교체', '시스템에어컨', '아직 미정']);
  payloadHarness.input('4', '34.5');
  payloadHarness.stage.querySelector('.consent').querySelector('input').change(true);
  const payload = payloadHarness.api.payload(null);
  assert.equal(payload.type, 'residential');
  assert.equal(payload.filePath, null);
  assert.equal(payload.consent, true);
  assert.equal(payload.marketingAttribution.form_contract, 'residential_two_page_v1');
  assert.equal(payload.answers['8'], '101동 1001호');
  assert.equal(payload.answers['4'], '34.5');
  const area = payloadHarness.api.group().find(q => String(q.id) === '4');
  assert.equal(area.isRequired, false);
  for (const value of ['0', '-1', 'abc']) {
    payloadHarness.input('4', value);
    assert.ok(payloadHarness.api.validate(area), 'invalid area: ' + value);
  }
  payloadHarness.input('4', '');
  assert.equal(payloadHarness.api.validate(area), '');
  assert.equal(payloadHarness.api.payload(null).answers['4'], undefined);
  assert.deepEqual(Array.from(payload.answers['12']), ['거실', '샤시 교체']);
  for (const id of ['13', '10', '15', '21', '12']) assert.ok(payload.answers[id], '필수 답변 저장 ' + id);
  for (const obsolete of ['5', '7', '17', '33', '34']) assert.equal(payload.answers[obsolete], undefined);

  const undecided = harness();
  undecided.input('13', '미정 고객'); undecided.input('10', '010-1111-2222'); undecided.input('15', '부산광역시 연제구'); undecided.next();
  undecided.input('21', '아직 정하지 않았어요'); undecided.button('아직 미정');
  assert.deepEqual(Array.from(undecided.api.answers().responses['12']), ['아직 미정']);
  undecided.button('거실');
  assert.deepEqual(Array.from(undecided.api.answers().responses['12']), ['거실'], '미정과 구체 항목은 동시에 저장하지 않는다');

  const calls = [];
  const funnelEvents = [];
  const mockFetch = async (url, options = {}) => {
    if (String(url).includes('/questions')) return { ok: true, json: async () => ({ questions: [] }) };
    if (String(url).includes('/funnel-events')) { funnelEvents.push(JSON.parse(options.body)); return { ok: true }; }
    calls.push({ url, ...options });
    return { ok: true, status: 200, json: async () => ({ success: true, consultReqId: 999, leadEventId: 'qa-event' }) };
  };
  const submit = harness({ fetch: mockFetch });
  submit.context.window.SB_CONSULTATION.applyKakaoProfile({ name: '카카오 고객', phone: '010-2222-3333' }, 'grant-token');
  assert.equal(submit.stage.querySelector('#answer-13').value, '카카오 고객');
  assert.equal(submit.stage.querySelector('#answer-10').value, '010-2222-3333');
  assert.equal(submit.nodes['kakao-quick-consultation'].hidden, false, '카카오 빠른 신청은 첫 화면에서 표시한다');
  submit.input('13', '직접 입력한 이름');
  submit.context.window.SB_CONSULTATION.applyKakaoProfile({ name: '덮어쓰면 안 됨', phone: '010-9999-9999' }, 'grant-token');
  assert.equal(submit.stage.querySelector('#answer-13').value, '직접 입력한 이름', '카카오 재적용은 입력값을 덮어쓰지 않는다');
  fillResidential(submit);
  submit.stage.querySelector('.consent').querySelector('input').change(true);
  submit.next(); await settle();
  assert.equal(submit.api.current(), 'success', '두 번째 입력 화면에서 바로 접수 완료한다');
  const submittedBody = JSON.parse(calls.find(call => String(call.url).includes('/submit')).body);
  assert.equal(submittedBody.kakaoGrant, 'grant-token');
  assert.equal(calls.filter(call => String(call.url).includes('/submit')).length, 1);
  assert.equal(calls.filter(call => String(call.url).endsWith('/upload')).length, 0, '두 페이지 계약은 도면 업로드를 요구하지 않는다');
  assert.ok(funnelEvents.some(event => event.eventName === 'lead_form_start'));
  assert.ok(funnelEvents.some(event => event.eventName === 'lead_step_complete' && event.ctaLocation === 'contact'));
  assert.ok(funnelEvents.some(event => event.eventName === 'lead_submit_attempt' && event.ctaLocation === 'planning'));

  const session = storage();
  const draft = harness({ session }); fillResidential(draft, { detail: '2층' }); draft.api.save();
  const restored = harness({ session });
  assert.equal(restored.api.current(), 'planning');
  assert.equal(restored.api.answers().responses['8'], '2층');
  restored.nodes.back.click();
  assert.equal(restored.api.current(), 'contact');
  assert.equal(restored.stage.querySelector('#answer-13').value, '테스트');

  const legacySession = storage();
  legacySession.setItem('spacebogam.consultationDraft.v2', JSON.stringify({
    version: 2, updatedAt: Date.now(), current: 'planning', trail: [{ key: 'contact', index: 0 }],
    answers: { type: '주거 공간', housing: '아파트', responses: { '12': ['전체 수리', '공용욕실', '안방욕실'] } }
  }));
  const legacy = harness({ session: legacySession });
  assert.deepEqual(Array.from(legacy.api.answers().responses['12']), ['전체 리모델링'], '기존 전체 수리 초안을 새 계약값으로 변환한다');
  legacy.api.answers().responses['12'] = ['공용욕실', '안방욕실']; legacy.api.save();
  const legacyBathrooms = harness({ session: legacySession });
  assert.deepEqual(Array.from(legacyBathrooms.api.answers().responses['12']), ['공용 욕실', '안방 욕실']);

  let attempts = 0;
  const retryBodies = [];
  const retry = harness({ fetch: async (url, options = {}) => {
    if (String(url).includes('/questions')) return { ok: true, json: async () => ({ questions: [] }) };
    if (String(url).includes('/funnel-events')) return { ok: true };
    if (String(url).includes('/submit')) {
      retryBodies.push(options.body);
      if (attempts++ === 0) throw new Error('lost response');
      return { ok: true, status: 200, json: async () => ({ success: true, consultReqId: 1000 }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }});
  fillResidential(retry);
  retry.stage.querySelector('.consent').querySelector('input').change(true);
  retry.next(); await settle();
  assert.equal(retry.api.current(), 'planning');
  assert.match(retry.error(), /중복으로/);
  retry.next(); await settle();
  assert.equal(retry.api.current(), 'success');
  assert.equal(retryBodies[0], retryBodies[1], '불확실한 응답 재시도는 동일 요청 본문을 사용한다');

  const missingId = harness({ fetch: async (url, options = {}) => {
    if (String(url).includes('/questions')) return { ok: true, json: async () => ({ questions: [] }) };
    if (String(url).includes('/funnel-events')) return { ok: true };
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  }});
  fillResidential(missingId);
  missingId.stage.querySelector('.consent').querySelector('input').change(true);
  missingId.next(); await settle();
  assert.equal(missingId.api.current(), 'planning', '유효한 접수번호가 없으면 완료 처리하지 않는다');
  assert.match(missingId.error(), /중복으로/);

  const gaEvents = [];
  const duplicate = harness({ search: '', gtag: (...args) => gaEvents.push(args), fetch: async (url) => {
    if (String(url).includes('/funnel-events')) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ success: true, consultReqId: 1001, leadEventId: 'duplicate-event', duplicate: true }) };
  }});
  fillResidential(duplicate);
  duplicate.stage.querySelector('.consent').querySelector('input').change(true);
  duplicate.next(); await settle();
  assert.equal(duplicate.api.current(), 'success');
  assert.equal(gaEvents.filter(args => args[0] === 'event' && args[1] === 'lead_submit_success').length, 0, '중복 응답은 GA 리드 성공을 다시 전송하지 않는다');

  const successGaEvents = [];
  const liveSuccess = harness({ search: '', gtag: (...args) => successGaEvents.push(args), fetch: async (url) => {
    if (String(url).includes('/funnel-events')) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ success: true, consultReqId: 1002, leadEventId: 'new-event' }) };
  }});
  fillResidential(liveSuccess);
  liveSuccess.stage.querySelector('.consent').querySelector('input').change(true);
  liveSuccess.next(); await settle();
  const leadSuccessEvents = successGaEvents.filter(args => args[0] === 'event' && args[1] === 'lead_submit_success');
  assert.equal(leadSuccessEvents.length, 1);
  assert.equal(leadSuccessEvents[0][2].event_scope, 'submission');
  assert.equal(leadSuccessEvents[0][2].event_id, 'new-event');

  const commercial = harness({ search: '?type=commercial&is_test=1' });
  assert.equal(commercial.api.current(), 'intro');
  commercial.next();
  const commercialValues = { name:'테스트', phone:'010-0000-0000', vertical:'shop', address:'부산 연제구 후보지', area:'35', currentState:'vacant', openDate:'2099-11-15', budget:'50_100m', callbackTime:'weekday_pm', requestNote:'브랜드 동선과 진열 효율을 함께 상담하고 싶습니다', previousUse:'의류 매장' };
  const commercialChoices = { leaseStatus:'현장 검토 중', workScope:'전체 공사', permitStatus:'아직 확인 전', drawingStatus:'도면이 없어요', facilityNeeds:'아직 몰라요' };
  while (commercial.api.current() === 'question') {
    const question = commercial.api.questions()[commercial.api.index()];
    if (Object.hasOwn(commercialValues, question.id)) commercial.input(question.id, commercialValues[question.id]);
    else commercial.button(commercialChoices[question.id]);
    commercial.next();
  }
  assert.equal(commercial.api.current(), 'summary');
  const commercialPayload = commercial.api.payload(null);
  assert.equal(commercialPayload.type, 'commercial');
  assert.equal(commercialPayload.marketingAttribution.form_contract, undefined);
  assert.equal(commercialPayload.commercialLead.vertical, 'shop');

  console.log('two-page residential consultation: fields, payload, direct submit, draft, retry and commercial preservation passed');
}
run().catch(error => { console.error(error); process.exitCode=1; });
