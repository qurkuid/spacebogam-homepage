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
  focus() {}
  getContext() { return { fillRect() {}, translate() {}, scale(x, y) { canvasScales.push([x, y]); }, drawImage() {} }; }
  toBlob(callback, type) { callback(new Blob(['flipped-image'], { type })); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const match = node => selector === 'input' ? node.tag === 'input'
      : selector === '.input-row input' ? node.tag === 'input' && node.parent?.className === 'input-row'
        : node.className === selector.slice(1);
    const result = [];
    const visit = node => node.children.forEach(child => { if (match(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
}

const root = path.join(__dirname, '../reports/consultation-step-prototype-20260928');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const nodes = Object.fromEntries(['stage', 'next', 'back', 'skip', 'restart', 'progress-fill'].map(id => [id, new Element()]));
const progress = new Element();
const document = {
  getElementById(id) { return nodes[id]; },
  querySelector(selector) { return selector === '.progress' ? progress : null; },
  createElement(tag) { return new Element(tag); },
  createTextNode(value) { const node = new Element('#text'); node.textContent = value; return node; },
  head: new Element('head')
};
const apartmentRows = [
  ['거제유림아시아드', '3FO4KH04F1JS', '부산시 연제구 해맞이로 23', '64㎡', 'fph/20230222/5ee2aded7d7eeeee.jpg'],
  ['도면없는단지', 'apt-missing', '부산시 수영구 광안동 100', '면적 미기재', '']
];
const stepEvents = [];
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const context = { document, window: { SB_APT_INDEX: apartmentRows }, location: { search: '', pathname: '/consultation/', href: 'https://spacebogam.kr/consultation/' }, innerWidth: 1200, localStorage: storage(), sessionStorage: storage(), gtag: (...args) => stepEvents.push(args), URLSearchParams, Blob, FormData, createImageBitmap: async () => ({ width: 100, height: 80, close() {} }), crypto: require('node:crypto').webcrypto, URL: {
  createObjectURL: file => 'blob:test/' + file.name,
  revokeObjectURL: () => {}
} };
vm.runInNewContext(read('apt-busan-dongs.js'), context);
vm.runInNewContext(read('consultation-questions.js'), context);
vm.runInNewContext(read('flow.js'), context);

const stage = () => nodes.stage;
const title = () => stage().children[1].textContent;
const next = () => nodes.next.click();
const choose = index => stage().querySelectorAll('.choice')[index].click();
const answer = value => (stage().querySelector('.question-input') || stage().querySelector('.input-row input')).input(value);
const result = () => stage().querySelector('.search-result').click();
const error = () => stage().querySelector('.error')?.textContent;
const summary = label => stage().querySelector('.summary').children.find(row => row.children[0].textContent === label)?.children[1].textContent;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const nextMonthWeekday = day => (new Date(new Date().getFullYear(), new Date().getMonth() + 1, day).getDay() + 6) % 7;
const pickNextMonthDay = day => {
  stage().querySelectorAll('.calendar-nav')[1].click();
  stage().querySelectorAll('.calendar-day').find(item => item.textContent === String(day)).click();
};

function restart() {
  nodes.restart.click();
  assert.match(title(), /공간보감에서는 이렇게 상담/);
  assert.equal(nodes.next.textContent, '상담 신청 시작하기 →');
  assert.equal(nodes.next.disabled, false);
  assert.equal(nodes.back.hidden, true);
  assert.equal(nodes.skip.hidden, true);
  const steps = stage().querySelector('.consult-process');
  assert.equal(steps.children.length, 2);
  assert.match(stage().children[2].textContent, /신청 후 담당자가 개인 휴대전화로 연락드려/);
  assert.match(steps.children[0].children[1].textContent, /기본 정보와 사무실 방문 일정을 확인/);
  assert.equal(steps.children[0].children[0].textContent, '방문 일정 확인 전화');
  assert.equal(steps.children[1].children[0].textContent, '사무실 방문 상담');
  next();
  assert.match(title(), /어떤 공간을 바꾸실 계획/);
  assert.equal(stage().children[0].textContent, '질문 01');
  assert.equal(progress.getAttribute('aria-valuenow'), '0');
}

async function startApartment(name) {
  restart();
  choose(0); assert.match(title(), /주거 공간/);
  choose(0); assert.match(title(), /아파트를 찾아/);
  answer(name); await settle(); result();
  assert.match(title(), /몇 동/);
}

function finishResidential({ needsAddress = false, autoArea = false, features = false, declineFeatures = false } = {}) {
  assert.match(title(), /성함/); answer('홍길동'); next();
  assert.match(title(), /연락처/); answer('010-1234-5678'); next();
  if (needsAddress) { assert.match(title(), /시공장소 주소/); answer('부산시 연제구 해맞이로 23'); next(); }
  else assert.doesNotMatch(title(), /시공장소 주소를 알려주세요/);
  assert.match(title(), /세부주소/); nodes.skip.click();
  if (autoArea) assert.doesNotMatch(title(), /공급평형/);
  else { assert.match(title(), /공급평형/); answer('32'); next(); }
  let optionalCount = 0;
  let scheduleCount = 0;
  const firstOptional = [];
  while (!/상담 준비/.test(title())) {
    assert.doesNotMatch(title(), /상담을 원하는 (?:요일|날짜|시간)/);
    assert.doesNotMatch(title(), /비밀번호/);
    if (features) assert.doesNotMatch(title(), /연락 가능한 시간대/);
    if (/방문 상담 희망 일정을 선택/.test(title())) scheduleCount++;
    if (firstOptional.length < 5 && !/시공 희망 시기/.test(title())) firstOptional.push(title());
    if (features && /예산 구간/.test(title())) {
      stage().querySelector('.question-input').change('4천만원 미만');
      assert.match(title(), /시공장소를 모두/);
    } else if (features && /시공장소를 모두/.test(title())) {
      assert.equal(stage().querySelectorAll('.choice').some(item => /확장|시스템에어컨/.test(item.children[1].textContent)), false);
      choose(0); assert.match(title(), /시공장소를 모두/); next();
    } else if (features && /발코니 확장 계획/.test(title())) {
      choose(0); assert.match(title(), /어느 공간을 확장/);
    } else if (features && /어느 공간을 확장/.test(title())) {
      choose(0); assert.match(title(), /어느 공간을 확장/); next();
    } else if (features && /시스템에어컨을 설치/.test(title())) {
      choose(0); assert.match(title(), /몇 대 설치/);
    } else if (features && /몇 대 설치/.test(title())) {
      assert.equal(nodes.skip.hidden, true);
      answer('1.5'); next(); assert.match(error(), /정수/);
      answer('3'); next();
      nodes.back.click(); assert.match(title(), /몇 대 설치/);
      nodes.back.click(); assert.match(title(), /시스템에어컨을 설치/);
      choose(1); assert.match(title(), /샤시를 교체/);
      nodes.back.click(); choose(0); assert.match(title(), /몇 대 설치/);
      assert.equal(stage().querySelector('.question-input').value, '');
      answer('3'); next();
    } else if (features && /샤시를 교체/.test(title())) {
      choose(0); assert.doesNotMatch(title(), /샤시를 교체/);
    } else if (features && /원하는 상담 시기는 언제인가요/.test(title())) {
      choose(0); assert.doesNotMatch(title(), /원하는 상담 시기는 언제인가요/);
    } else if (features && /방문 상담 희망 일정을 선택/.test(title())) {
      assert.ok(stage().querySelector('.schedule'));
      const weekdays = stage().querySelectorAll('.schedule-weekday');
      const match = nextMonthWeekday(15);
      weekdays[(match + 2) % 7].click();
      assert.match(title(), /방문 상담 희망 일정을 선택/);
      pickNextMonthDay(15);
      assert.match(title(), /방문 상담 희망 일정을 선택/);
      stage().querySelectorAll('.schedule-time')[1].click();
      assert.match(title(), /방문 상담 희망 일정을 선택/);
      next();
      assert.match(title(), /방문 상담 희망 일정을 선택/);
      assert.match(error(), /가능한 요일에 추가/);
      weekdays[match].click();
      next();
      nodes.back.click();
      assert.match(title(), /방문 상담 희망 일정을 선택/);
      assert.equal(stage().querySelectorAll('.schedule-weekday')[match].getAttribute('aria-pressed'), 'true');
      assert.equal(stage().querySelectorAll('.calendar-day').find(day => day.textContent === '15').getAttribute('aria-pressed'), 'true');
      assert.equal(stage().querySelectorAll('.schedule-time')[1].getAttribute('aria-pressed'), 'true');
      next();
    } else if (features && /시공 희망 시기|상담을 원하는 날짜/.test(title())) {
      const before = title();
      assert.equal(nodes.skip.hidden, true);
      assert.equal(nodes.next.disabled, true);
      next(); assert.equal(title(), before);
      assert.match(error(), /입력/);
      nodes.skip.click(); assert.equal(title(), before);
      const calendar = stage().querySelector('.calendar');
      assert.ok(calendar, before);
      assert.equal(calendar.querySelector('.calendar-weekdays').children.length, 7);
      const heading = calendar.querySelector('.calendar-month').textContent;
      calendar.querySelectorAll('.calendar-nav')[1].click();
      assert.notEqual(calendar.querySelector('.calendar-month').textContent, heading);
      calendar.querySelectorAll('.calendar-nav')[0].click();
      assert.equal(calendar.querySelector('.calendar-month').textContent, heading);
      if (new Date().getDate() > 1) {
        const past = calendar.querySelectorAll('.calendar-day').find(day => day.textContent === '1');
        assert.equal(past.disabled, true);
        past.click();
        assert.equal(title(), before);
      }
      pickNextMonthDay(15);
      assert.notEqual(title(), before);
      nodes.back.click();
      assert.equal(title(), before);
      assert.equal(stage().querySelectorAll('.calendar-day').find(day => day.textContent === '15').getAttribute('aria-pressed'), 'true');
      next();
    } else if (/시공 희망 시기/.test(title())) {
      assert.equal(nodes.skip.hidden, true);
      assert.equal(nodes.next.disabled, true);
      stage().querySelector('.manual-option').click();
      nodes.back.click();
      assert.equal(stage().querySelector('.manual-option').getAttribute('aria-pressed'), 'true');
      next();
    } else if (declineFeatures && /발코니 확장 계획/.test(title())) {
      choose(1); assert.match(title(), /시스템에어컨을 설치/);
    } else if (declineFeatures && /시스템에어컨을 설치/.test(title())) {
      choose(1); assert.match(title(), /샤시를 교체/);
    } else if (declineFeatures && /샤시를 교체/.test(title())) {
      choose(1); assert.doesNotMatch(title(), /샤시를 교체/);
    } else if (declineFeatures && /방문 상담 희망 일정을 선택/.test(title())) {
      const match = nextMonthWeekday(15);
      stage().querySelectorAll('.schedule-weekday')[match].click();
      pickNextMonthDay(15);
      stage().querySelectorAll('.schedule-time')[0].click();
      nodes.skip.click();
      nodes.back.click();
      assert.equal(stage().querySelectorAll('.schedule-weekday')[match].getAttribute('aria-pressed'), 'false');
      assert.equal(stage().querySelectorAll('.calendar-day').find(day => day.textContent === '15').getAttribute('aria-pressed'), 'false');
      assert.equal(stage().querySelectorAll('.schedule-time')[0].getAttribute('aria-pressed'), 'false');
      nodes.skip.click();
    } else if (declineFeatures && /연락 가능한 시간대/.test(title())) {
      choose(0);
      next();
    } else if (features && /가족 구성/.test(title())) {
      stage().querySelector('.question-input').change('부부 + 자녀');
      stage().querySelector('.pet-choice').querySelector('input').change(true);
      next();
    } else {
      assert.equal(nodes.skip.hidden, false, title());
      nodes.skip.click();
    }
    optionalCount++;
    assert.ok(optionalCount <= 28);
  }
  assert.ok(optionalCount >= 15);
  assert.equal(scheduleCount, 1);
  assert.deepEqual(firstOptional.map(value => value.match(/예산|시공장소|발코니 확장|어느 공간을 확장|시스템에어컨|샤시/)?.[0]),
    features ? ['예산', '시공장소', '발코니 확장', '어느 공간을 확장', '시스템에어컨'] : ['예산', '시공장소', '발코니 확장', '시스템에어컨', '샤시']);
  next(); assert.match(error(), /동의/);
  stage().querySelector('.consent').querySelector('input').change(true);
  next(); assert.match(title(), /입력 내용을 확인/);
  assert.match(stage().children[2].textContent, /신청 후 담당자가 개인 휴대전화로 연락드려/);
  assert.match(summary('시공 희망 시기'), features ? /^\d{4}-\d{2}-15$/ : /^미정$/);
}

async function run() {
  const snapshot = context.window.SB_CONSULTATION_QUESTIONS;
  assert.equal(snapshot.residential.length, 22);
  assert.equal(snapshot.commercial.length, 17);
  assert.deepEqual(Array.from(snapshot.residential.filter(q => q.isRequired), q => q.id), [13, 10, 15, 4]);
  assert.equal(stepEvents.filter(([, name, data]) => name === 'consult_view_intro' && data.step_id === 'intro').length, 1);
  assert.equal(stepEvents.filter(([, name]) => name === 'consult_view_type').length, 0);

  await startApartment('해맞이로');
  assert.equal(stepEvents.filter(([, name]) => name === 'consult_complete_intro').length, 1);
  assert.equal(stepEvents.filter(([, name, data]) => name === 'consult_complete_type' && data.step_id === 'type').length, 1);
  assert.deepEqual(Object.keys(stepEvents.find(([, name, data]) => name === 'consult_view_apartmentQuery' && data.step_id === 'apartmentQuery')[2]).sort(),
    ['form_id', 'journey_type', 'progress_percent', 'sb_session_id', 'send_to', 'step_id', 'step_number']);
  assert.equal(stepEvents.find(([, name]) => name === 'consult_view_apartmentQuery')[2].send_to, 'G-EJGXDD5C1T');
  assert.equal(stepEvents.find(([, name]) => name === 'consult_view_apartmentQuery')[2].sb_session_id,
    context.sessionStorage.getItem('spacebogam_funnel_session_id'));
  const select = stage().querySelector('.dong-select');
  assert.equal(select.children.length, 16);
  assert.equal(nodes.next.disabled, true);
  select.input('111동');
  select.change('111동');
  assert.match(title(), /도면을 확인/);
  const planViews = stepEvents.filter(([, name, data]) => name === 'consult_view_planReview' && data.step_id === 'planReview').length;
  nodes.back.click(); next();
  assert.equal(stepEvents.filter(([, name, data]) => name === 'consult_view_planReview' && data.step_id === 'planReview').length, planViews);
  await settle();
  stage().querySelector('.plan-card').click();
  const dialog = stage().querySelector('.plan-dialog');
  assert.equal(dialog.open, true);
  assert.match(dialog.querySelector('.plan-large').src, /\.jpg$/);
  dialog.querySelectorAll('.flip-button')[0].click();
  assert.equal(dialog.querySelector('.plan-large').style.transform, 'scale(-1,1)');
  dialog.querySelector('.plan-save').click();
  assert.match(title(), /성함/);
  nodes.back.click();
  assert.match(title(), /도면을 확인/);
  assert.match(stage().querySelector('.selected-apartment').textContent, /저장된 도면/);
  assert.match(stage().querySelector('.selected-apartment').textContent, /공급평형 약 19\.4평 자동 입력/);
  next();
  finishResidential({ autoArea: true, features: true });
  assert.equal(stepEvents.filter(([, name, data]) => name === 'consult_skip_q_8' && data.step_id === 'question_8').length, 1);
  assert.doesNotMatch(JSON.stringify(stepEvents), /홍길동|010-1234-5678|해맞이로 23/);
  assert.equal(summary('동'), '111동');
  assert.match(summary('도면'), /좌우 반전/);
  assert.equal(summary('시공장소 주소'), '부산시 연제구 해맞이로 23');
  assert.equal(summary('공급평형'), '19.4평 · 도면 표기 64㎡ (면적 종류 확인 필요)');
  assert.equal(summary('예산 구간을 선택해주세요'), '4천만원 미만');
  assert.equal(summary('시공장소를 모두 선택해 주세요.'), '현관');
  assert.equal(summary('발코니 확장 계획이 있나요?'), '네, 확장할 계획이에요');
  assert.equal(summary('어느 공간을 확장할 계획인가요? (복수 선택 가능)'), '거실');
  assert.equal(summary('시스템에어컨은 몇 대 설치할 계획인가요?'), '3대');
  assert.equal(summary('샤시를 교체할 계획인가요?'), '네, 교체할 계획이에요');
  assert.match(summary('시공 희망 시기'), /^\d{4}-\d{2}-15$/);
  const weekdays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
  const match = nextMonthWeekday(15);
  assert.equal(summary('상담을 원하는 요일을 선택해주세요.(복수선택 가능)'), weekdays[(match + 2) % 7] + ', ' + weekdays[match]);
  assert.match(summary('상담을 원하는 날짜를 선택해주세요'), /^\d{4}-\d{2}-15$/);
  assert.equal(summary('상담을 원하는 시간을 선택해주세요'), '11:00');
  assert.equal(summary('가족 구성을 선택해주세요'), '부부 + 자녀');
  assert.equal(summary('반려동물'), '함께 살아요');
  assert.equal(summary('원하는 상담 시기는 언제인가요?'), undefined);
  assert.equal(progress.getAttribute('aria-valuenow'), '100');
  let submittedPayload;
  let catalogImageFetched = false;
  let catalogImageUploaded = false;
  context.fetch = (url, options) => {
    if (url.startsWith('/api/consultation/plan-image?url=')) {
      catalogImageFetched = true;
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['catalog-image'], { type: 'image/jpeg' })) });
    }
    if (url === '/api/consultation/upload') {
      catalogImageUploaded = true;
      assert.equal(options.body.get('file').type, 'image/jpeg');
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, filePath: '/api/uploads/consultation/catalog.jpg' }) });
    }
    if (url.endsWith('/api/consultation/submit')) submittedPayload = JSON.parse(options.body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, consultReqId: 'test-residential', leadEventId: 'test-lead' }) });
  };
  next(); await new Promise(setImmediate);
  assert.match(title(), /방문 상담 예약 신청이 접수되었습니다/, error());
  assert.match(stage().children[2].textContent, /담당자가 개인 휴대전화로 연락드려 기본 정보와 사무실 방문 일정을 확인/);
  assert.match(stage().children[2].textContent, /신청 접수만으로 방문 예약이 확정되지는 않습니다/);
  assert.equal(stepEvents.filter(([, name, data]) => name === 'consult_complete_summary' && data.step_id === 'summary').length, 1);
  assert.equal(stepEvents.filter(([, name, data]) => name === 'consult_view_success' && data.step_id === 'success').length, 1);
  assert.equal(catalogImageFetched, true);
  assert.equal(catalogImageUploaded, true);
  assert.deepEqual(canvasScales.at(-1), [-1, 1]);
  assert.equal(submittedPayload.type, 'residential');
  assert.equal(submittedPayload.answers['9999'], 'true');
  assert.match(submittedPayload.answers['5'], /^\d{4}-\d{2}-15$/);
  assert.match(submittedPayload.answers['7'], /아파트: 거제유림아시아드 \/ 111동/);
  assert.match(submittedPayload.answers['7'], /좌우 반전/);
  assert.equal(submittedPayload.filePath, '/api/uploads/consultation/catalog.jpg');
  context.fetch = undefined;

  await startApartment('도면없는단지');
  answer('101동'); next(); await settle();
  assert.match(title(), /도면을 확인/);
  assert.equal(stage().querySelectorAll('.plan-card').length, 0);
  const upload = stage().querySelector('.plan-upload');
  upload.files = [{ name: '도면.txt', type: 'text/plain', size: 1024 }];
  upload.listeners.change();
  assert.match(error(), /JPG·PNG·WebP 이미지/);
  assert.equal(stage().querySelectorAll('.plan-dialog').length, 0);
  upload.files = [Object.assign(new Blob(['uploaded-image'], { type: 'image/png' }), { name: '우리집도면.png' })];
  upload.listeners.change();
  const uploaded = stage().querySelector('.plan-dialog');
  uploaded.querySelectorAll('.flip-button')[1].click();
  assert.equal(uploaded.querySelector('.plan-large').style.transform, 'scale(1,-1)');
  uploaded.querySelector('.plan-save').click();
  finishResidential({ declineFeatures: true });
  assert.match(summary('도면'), /우리집도면.png.*직접 업로드.*상하 반전/);
  assert.equal(stage().querySelector('.summary-plan').tag, 'img');
  assert.equal(stage().querySelector('.summary-plan').style.transform, 'scale(1,-1)');
  let prematureSubmits = 0;
  context.fetch = url => { if (url.endsWith('/api/consultation/submit')) prematureSubmits++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
  stage().querySelector('.summary-plan-button').click();
  assert.equal(stage().querySelector('.plan-large').tag, 'img');
  stage().querySelector('.plan-save').click();
  assert.match(title(), /입력 내용을 확인/);
  assert.equal(prematureSubmits, 0, 'saving the summary preview must not submit the consultation');
  assert.equal(summary('시공장소 주소'), '부산시 수영구 광안동 100');
  assert.equal(summary('시스템에어컨은 몇 대 설치할 계획인가요?'), undefined);
  assert.equal(summary('상담을 원하는 날짜를 선택해주세요'), undefined);
  assert.equal(summary('연락 가능한 시간대'), '오전 (9시~12시)');
  let uploadedImage;
  let uploadedPayload;
  context.fetch = (url, options) => {
    if (url === '/api/consultation/upload') {
      uploadedImage = options.body.get('file');
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, filePath: '/api/uploads/consultation/upload.jpg' }) });
    }
    if (url.endsWith('/api/consultation/submit')) uploadedPayload = JSON.parse(options.body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, consultReqId: 'test-upload', leadEventId: 'test-lead' }) });
  };
  next(); await new Promise(setImmediate);
  assert.match(title(), /접수되었습니다/);
  assert.equal(uploadedImage.type, 'image/jpeg');
  assert.equal(uploadedPayload.filePath, '/api/uploads/consultation/upload.jpg');
  assert.equal(uploadedPayload.answers['5'], '미정');
  context.fetch = undefined;

  await startApartment('도면없는단지');
  answer('101동'); next(); await settle();
  stage().querySelectorAll('.manual-option')[1].click();
  finishResidential();
  assert.match(summary('도면'), /없음/);
  assert.equal(summary('시공장소 주소'), '부산시 수영구 광안동 100');

  context.fetch = url => {
    if (url !== '/api/apartments/dataset') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      cols: ['apartmentName', 'apartmentId', 'roadAddress', 'legacyAddress', 'type', 'planPic', 'planId'],
      rows: [
        ['주소로찾은단지', 'apt-address', '부산시 수영구 광안동 100', '부산시 수영구 광안동 100', '64㎡', 'fph/20230222/address.jpg', 'plan-address'],
        ['옆건물', 'apt-neighbor', '부산시 수영구 광안동 101', '부산시 수영구 광안동 101', '64㎡', 'fph/20230222/neighbor.jpg', 'plan-neighbor']
      ]
    }) });
  };
  await startApartment('도면없는단지');
  answer('101동'); next(); await settle();
  assert.match(title(), /도면을 확인/);
  const addressSearch = stage().querySelector('.address-search');
  assert.equal(addressSearch.value, '부산시 수영구 광안동 100');
  addressSearch.input('부산시 수영구 광안동 102'); await settle();
  assert.equal(stage().querySelectorAll('.search-result').length, 0, 'a nearby building must not be offered');
  addressSearch.input('부산시 수영구 광안동 100'); await settle();
  assert.equal(stage().querySelectorAll('.search-result').length, 1);
  stage().querySelector('.search-result').click();
  assert.match(title(), /몇 동/);
  answer('102동'); next();
  assert.equal(stage().querySelectorAll('.plan-card').length, 1);
  stage().querySelector('.plan-card').click();
  stage().querySelector('.plan-save').click();
  finishResidential({ autoArea: true });
  assert.equal(summary('아파트'), '주소로찾은단지');
  assert.equal(summary('시공장소 주소'), '부산시 수영구 광안동 100');
  assert.match(summary('공급평형'), /^19\.4평/);

  restart();
  choose(0); choose(0);
  answer('검색에없는아파트'); await settle();
  stage().querySelector('.search-manual').click();
  answer('102동'); next(); await settle();
  const unmatchedAddress = stage().querySelector('.address-search');
  unmatchedAddress.input('부산시 수영구 광안동 100'); await settle();
  assert.equal(stage().querySelectorAll('.search-result').length, 1);
  stage().querySelector('.search-result').click();
  assert.match(title(), /몇 동/);
  answer('103동'); next();
  stage().querySelector('.plan-card').click();
  stage().querySelector('.plan-save').click();
  finishResidential({ autoArea: true });
  assert.equal(summary('아파트'), '주소로찾은단지');
  assert.equal(summary('동'), '103동');

  context.fetch = undefined;

  restart();
  choose(0); choose(0);
  answer('검색에없는아파트'); await settle();
  stage().querySelector('.search-manual').click();
  answer('102동'); next(); await settle();
  stage().querySelectorAll('.manual-option')[1].click();
  finishResidential({ needsAddress: true });
  assert.equal(summary('시공장소 주소'), '부산시 연제구 해맞이로 23');

  await startApartment('도면없는단지');
  answer('101동'); next(); await settle();
  const pdfUpload = stage().querySelector('.plan-upload');
  assert.equal(pdfUpload.accept, 'image/png,image/jpeg,image/webp');
  pdfUpload.files = [{ name: '평면도.pdf', type: 'application/pdf', size: 2048 }];
  pdfUpload.listeners.change();
  assert.match(error(), /JPG·PNG·WebP 이미지/);
  assert.equal(stage().querySelector('.plan-dialog'), null);

  restart();
  choose(1);
  assert.match(title(), /성명/);
  answer('   '); next(); assert.match(error(), /입력/);
  answer('김고객'); next(); answer('010-2222-3333'); next();
  let count = 2;
  while (!/상담 준비/.test(title())) {
    if (nodes.skip.hidden) {
      const calendar = stage().querySelector('.calendar');
      if (calendar) {
        pickNextMonthDay(15);
      } else if (stage().querySelector('.choice')) {
        choose(0);
        if (/설비 공사/.test(title())) next();
      } else {
        const input = stage().querySelector('.question-input');
        const value = input.tag === 'select' ? input.children[1].value
          : title().includes('주소') ? '부산 해운대구 우동 123'
            : title().includes('요청사항') ? '사무실 전체 인테리어 상담을 원합니다.'
              : title().includes('이전 용도') ? '사무실' : '20';
        if (input.tag === 'select') input.change(value); else { input.input(value); next(); }
      }
    } else nodes.skip.click();
    count++;
    assert.ok(count <= 18);
  }
  assert.equal(count, 17);
  stage().querySelector('.consent').querySelector('input').change(true); next();
  assert.equal(summary('업종·공간 유형을 선택해주세요.'), '사무실');
  assert.equal(summary('예산 구간을 선택해주세요.'), '3천만원 미만');
  assert.match(summary('오픈·입주 희망일'), /^\d{4}-\d{2}-15$/);
  assert.equal(summary('전용면적(평)'), '20평');
  submittedPayload = null;
  context.fetch = (url, options) => {
    if (url.endsWith('/api/consultation/submit')) submittedPayload = JSON.parse(options.body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, consultReqId: 'test-commercial', leadEventId: 'test-lead' }) });
  };
  next(); await settle(); await settle();
  assert.match(title(), /접수되었습니다/);
  assert.equal(submittedPayload.type, 'commercial');
  assert.equal(submittedPayload.commercialLead.consent, true);
  assert.equal(submittedPayload.commercialLead.leaseStatus, 'leased');
  assert.equal(submittedPayload.commercialLead.facilityNeeds[0], 'plumbing');
  context.fetch = undefined;

  restart();
  choose(0); choose(1);
  answer('홍길동'); next(); answer('010-1234-5678'); next();
  answer('부산시 연제구 해맞이로 23'); next(); nodes.skip.click(); answer('32'); next();
  assert.match(title(), /시공 희망 시기/);
  stage().querySelector('.manual-option').click();
  nodes.skip.click();
  assert.match(title(), /시공장소를 모두/);
  const scope = name => stage().querySelectorAll('.choice').find(option => option.children[1].textContent === name);
  scope('전체 수리').click();
  assert.equal(scope('전체 수리').getAttribute('aria-pressed'), 'true');
  scope('현관').click();
  assert.equal(scope('전체 수리').getAttribute('aria-pressed'), 'false');
  assert.equal(scope('현관').getAttribute('aria-pressed'), 'true');
  scope('전체 수리').click();
  assert.equal(scope('전체 수리').getAttribute('aria-pressed'), 'true');
  assert.equal(scope('현관').getAttribute('aria-pressed'), 'false');

  restart();
  choose(1);
  answer('김고객'); next(); answer('010-2222-3333'); next();
  stage().querySelector('.question-input').change('office');
  answer('부산 해운대구 우동 123'); next(); answer('20'); next();
  stage().querySelector('.question-input').change('vacant');
  assert.match(title(), /오픈·입주 희망일/);
  if (new Date().getDate() > 1) {
    const past = stage().querySelectorAll('.calendar-day').find(day => day.textContent === '1');
    assert.equal(past.disabled, true);
    past.click();
    assert.match(title(), /오픈·입주 희망일/);
  }
  assert.equal(stage().querySelector('.date-undecided'), null);
  pickNextMonthDay(15);
  assert.match(title(), /예산 구간/);

  context.window.location = { protocol: 'http:' };
  let requestedPlans = '';
  context.fetch = url => {
    requestedPlans = url;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [
      { type: '64㎡', planId: 'plan-64', planPic: 'https://fphimage-cos.kujiale.com/fph/20230222/5ee2aded7d7eeeee.jpg' },
      { type: '106A㎡', planId: 'plan-106', planPic: 'https://fphimage-cos.kujiale.com/fph/20230306/d9bc39b39048a997.jpg' }
    ] }) });
  };
  await startApartment('해맞이로');
  await settle(); await settle();
  stage().querySelector('.dong-select').change('111동');
  await settle(); await settle();
  assert.equal(requestedPlans, '/api/apartments/3FO4KH04F1JS/plans');
  assert.equal(stage().querySelectorAll('.plan-card').length, 2);
  assert.match(stage().querySelector('.plan-source').textContent, /여러 평형/);
  stage().querySelectorAll('.plan-card')[0].children[0].listeners.error();
  assert.equal(stage().querySelectorAll('.plan-card').length, 1);
  stage().querySelector('.plan-card').click();
  stage().querySelector('.plan-save').click();
  assert.match(title(), /성함/);
  nodes.back.click();
  assert.match(stage().querySelector('.selected-apartment').textContent, /공급평형 약 32\.1평 자동 입력/);

  context.fetch = () => new Promise(() => {});
  await startApartment('해맞이로');
  stage().querySelector('.dong-select').change('111동');
  assert.match(title(), /도면을 확인/);
  assert.equal(stage().querySelectorAll('.plan-card').length, 1);
  assert.equal(stage().querySelectorAll('.manual-option').length, 2);
  stage().querySelectorAll('.manual-option')[1].click();
  assert.match(title(), /성함/);
  answer('홍길동'); next(); answer('010-1234-5678'); next();
  assert.match(title(), /세부주소/); nodes.skip.click();
  assert.match(title(), /공급평형/);
  answer('32'); next();
  assert.match(title(), /시공 희망 시기/);
  stage().querySelector('.manual-option').click();
  assert.match(title(), /예산 구간/);
  const trackedCount = stepEvents.filter(([, name]) => name.startsWith('consult_')).length;
  context.sessionStorage.setItem('spacebogam_funnel_is_test', 'true');
  restart(); choose(0);
  assert.equal(stepEvents.filter(([, name]) => name.startsWith('consult_')).length, trackedCount);
  console.log('consultation prototype: plan, conditional questions, combined consultation schedule, calendars passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
