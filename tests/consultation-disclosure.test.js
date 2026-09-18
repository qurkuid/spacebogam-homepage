// Static-only checks: no browser, network, or real consultation submission.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const policy = read('privacy.html');
const callback = read('assets/commercial-call-callback.js');
const form = read('assets/consultation-form.js');
const retention = '상담 종료 후 1년 또는 이용자의 삭제 요청 시까지 (둘 중 먼저 도래하는 시점)';

function row(type) {
  const match = policy.match(new RegExp('<tr data-form-type="' + type + '"><td>[^<]+</td><td>([^<]+)</td><td>([^<]+)</td></tr>'));
  assert.ok(match, type + ' disclosure row exists');
  return { required: match[1], optional: match[2] };
}

test('privacy routes remain equivalent and preserve existing retention and dates', () => {
  assert.equal(policy, read('privacy/index.html'));
  assert.ok(policy.includes('<td>' + retention + '</td>'));
  assert.match(policy, /시행일: 2026년 8월 5일 · 공고일: 2026년 7월 29일/);
  assert.match(policy, /계약 종료 후 관계 법령이 정하는 기간까지/);
  assert.match(policy, /유입 경로·접속 기록 등 자동 수집 정보<\/td><td>수집일로부터 1년/);
  assert.match(policy, /본 방침은 2026년 8월 5일부터 시행됩니다/);
});

test('callback consent quotes canonical retention, not destruction immediately after consultation', () => {
  assert.ok(callback.includes('보유 기간: ' + retention));
  assert.doesNotMatch(callback, /상담 종료 후 파기/);
  assert.match(callback, /privacyLink\.href = '\/privacy\/'/);
  assert.match(callback, /보유 기간의 예외 등 상세 내용/);
  assert.match(callback, /if \(!consentInput\.checked\)/);
});

test('policy replaces the false blanket optional-input claim with three form-specific disclosures', () => {
  assert.doesNotMatch(policy, /성함과 연락처를 제외한 항목은[\s\S]{0,40}선택 입력/);
  assert.equal((policy.match(/data-form-type=/g) || []).length, 3);
  assert.match(policy, /개인정보 수집·이용 동의가 별도로 필요/);
  assert.match(policy, /수집 항목이나 보유 기간을 새로 늘리는 내용이 아닙니다/);
});

test('residential disclosure names all four core required fields', () => {
  assert.equal(row('residential').required, '성함, 연락처, 시공 장소 주소, 공급 평형 (4개)');
  assert.match(row('residential').optional, /첨부 파일은 선택 입력/);
  const matchers = form.match(/var CORE_REQUIRED_MATCHERS = \[([\s\S]*?)\n  \];/);
  assert.ok(matchers);
  assert.equal((matchers[1].match(/function\(q\)/g) || []).length, 4);
  for (const field of ['성함|이름', '연락처', '주소', '평형|평수']) assert.ok(matchers[1].includes(field));
});

test('commercial disclosure covers the existing nine required fields and optional request note', () => {
  assert.equal(row('commercial').required, '성명, 연락처, 업종·공간 유형, 현장 지역·주소, 전용면적, 현재 현장 상태, 오픈·입주 희망일, 예산 구간, 연락 가능한 시간 (9개)');
  assert.equal(row('commercial').optional, '요청사항은 선택 입력입니다.');
  const schema = form.match(/var COMMERCIAL_QUESTIONS = \[([\s\S]*?)\n  \];/);
  assert.ok(schema);
  const fields = [...schema[1].matchAll(/\{id:'([^']+)', question:'[^']+', questionType:'[^']+', isRequired:(true|false)/g)];
  assert.deepEqual(fields.filter((m) => m[2] === 'true').map((m) => m[1]), ['name', 'phone', 'vertical', 'address', 'area', 'currentState', 'openDate', 'budget', 'callbackTime']);
  assert.deepEqual(fields.filter((m) => m[2] === 'false').map((m) => m[1]), ['requestNote']);
});

test('callback disclosure matches all six existing mandatory validations', () => {
  const required = '성함, 연락처, 현장 주소, 평수/면적, 계약 여부, 공사 시작일';
  assert.equal(row('commercial-callback').required, required + ' (6개)');
  assert.ok(callback.includes('필수 입력: ' + required + '.'));
  const submitHandler = callback.slice(callback.indexOf("form.addEventListener('submit'"));
  assert.deepEqual([...submitHandler.matchAll(/if \(!([a-zA-Z]+)\) \{/g)].map((m) => m[1]), ['name', 'phone', 'address', 'area', 'leaseStatus', 'constructionStartDate']);
  for (const input of ['nameInput', 'phoneInput', 'addressInput', 'areaInput', 'leaseStatusSelect', 'constructionStartDateInput']) {
    assert.ok(submitHandler.includes(input + ".setAttribute('aria-invalid', 'true')"));
  }
});

test('callback optional and preselected values are disclosed without claiming they are uncollected', () => {
  const optional = row('commercial-callback').optional;
  for (const label of ['통화 가능한 시간대', '오픈 희망일', '추가 요청사항']) {
    assert.ok(optional.includes(label));
    assert.ok(callback.includes(label));
  }
  for (const text of [optional, callback]) {
    assert.ok(text.includes('업종과 예산은 기본값이 선택되어 있으며 변경할 수 있'));
    assert.ok(text.includes('변경하지 않아도 해당 값이 전송됩니다'));
  }
  assert.match(callback, /verticalSelect\.value = commercialVertical\(\)/);
  assert.match(callback, /budgetSelect\.value = 'undecided'/);
  for (const payloadField of ['vertical: vertical', 'budget: budget', "callbackTime: checkedTime ? checkedTime.value : ''", 'openDate: openDateInput.value', 'requestNote: requestNoteInput.value.trim()']) {
    assert.ok(callback.includes(payloadField));
  }
});

test('policy collection inventory includes the existing commercial and callback fields', () => {
  const inventory = policy.slice(policy.indexOf('<h3>가.'), policy.indexOf('id="consultation-required-items"'));
  for (const label of ['전용면적', '업종·공간 유형', '현재 현장 상태', '계약 여부', '공사 시작일', '오픈·입주 희망일']) assert.ok(inventory.includes(label));
});

test('callback script cache version is the content SHA256 prefix', () => {
  const hash = crypto.createHash('sha256').update(callback).digest('hex').slice(0, 8);
  const reference = read('commercial/call/index.html').match(/\/assets\/commercial-call-callback\.js\?v=([^"']+)/);
  assert.ok(reference);
  assert.equal(reference[1], hash);
});
