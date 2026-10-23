// Static-only policy checks: no browser, network, Kakao consent, or customer data submission.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const policy = read('privacy.html');
const terms = read('customer-terms.html');

test('customer terms routes are equivalent and publish the Kakao Sync canonical URL', () => {
  assert.equal(terms, read('customer-terms/index.html'));
  assert.match(terms, /<link rel="canonical" href="https:\/\/spacebogam\.kr\/customer-terms\/"/);
  assert.match(terms, /시행일: 2026년 10월 23일/);
});

test('customer terms describe the persistent account without granting unlinked project access', () => {
  for (const label of ['상담과 문의 내역', '프로젝트, 견적, 일정', '현장 사진·자료', '회원 탈퇴']) {
    assert.ok(terms.includes(label), label);
  }
  assert.match(terms, /고객계정이 만들어졌다는 사실만으로 기존 프로젝트, 견적, 일정, 사진 또는 다른 고객의 정보에 접근할 권리가 생기지 않습니다/);
  assert.match(terms, /이름·이메일·전화번호가 같다는 이유만으로 기존 고객계정을 자동으로 합치지 않습니다/);
  assert.match(terms, /제공하지 않아도 고객계정에 가입할 수 있으며 기존 회원의 이름·연락처는 자동 변경하지 않습니다/);
  assert.match(terms, /만 14세 미만 아동은 고객계정에 가입할 수 없습니다/);
  assert.match(terms, /고객계정 탈퇴는 회사 서비스에 즉시 반영됩니다/);
  assert.match(terms, /외부 연결 해제 처리 중에도 탈퇴한 고객계정이 다시 활성화되지는 않습니다/);
  assert.match(terms, /광고성 정보 수신이나 광고 성과 측정 선택 동의는 이 약관 가입의 필수 조건이 아닙니다/);
  assert.match(terms, /인테리어 공사 계약의 범위, 금액, 일정, 하자보수 등 개별 계약 조건을 정하지 않습니다/);
  assert.match(terms, /href="tel:15510163">1551-0163<\/a>/);
});

test('Kakao consent describes the existing questionnaire without a separate application form', () => {
  const consent = policy.slice(
    policy.indexOf('id="kakao-quick-consultation-consent"'),
    policy.indexOf('<h3>다. 서비스 이용 과정'),
  );
  assert.ok(consent.length > 0);
  assert.match(consent, /위 주거·상업 상담 신청서에 안내된 항목/);
  assert.match(consent, /별도 신청서를 만들지 않습니다/);
  assert.match(policy, /별도 신청 항목 없음/);
  assert.match(consent, /상담 종료 후 1년 또는 이용자의 삭제 요청 시까지 중 먼저 도래하는 시점/);
  assert.match(consent, /광고성 정보 수신이나 광고 성과 측정 선택 동의가 포함되지 않습니다/);
  assert.match(consent, /같은 상담 신청서/);
  assert.doesNotMatch(consent, /카카오 닉네임[^<]*수집|카카오 이메일[^<]*수집|카카오 전화번호[^<]*수집/);
});

test('customer Kakao policy minimizes callback profile data and discloses cleanup timing without an exact 24 hour promise', () => {
  assert.match(policy, /공통 로그인 설정에 따라 이메일 동의 항목이 표시될 수 있으나, 고객 경로에서는 이메일 조회 API를 호출하지 않으며 이메일을 수집·저장하거나 고객 매칭에 사용하지 않습니다/);
  assert.match(policy, /카카오 프로필 닉네임도 조회·저장하지 않습니다/);
  assert.match(policy, /개인정보 동의항목 심사가 승인되고 이용자가 제공에 선택 동의한 경우에만 카카오계정의 이름과 전화번호를 받아 신규 회원가입과 고객계정 관리에 이용하고 상담 입력란에 자동으로 채웁니다/);
  assert.match(policy, /신규 회원에게 제공된 이름·전화번호는 고객 회원프로필에 저장하지만, 기존 회원의 이름·연락처는 자동으로 덮어쓰지 않습니다/);
  assert.match(policy, /카카오계정의 이름·전화번호 제공은 선택 사항이며 제공하지 않아도 고객계정에 가입할 수 있습니다/);
  assert.match(policy, /상담 접수에는 이름과 연락처가 필수이므로 자동 입력되지 않은 경우 직접 입력해야 하며, 어느 경우에도 동일하게 신청할 수 있습니다/);
  assert.match(policy, /접수 전에 자동 입력값을 확인·수정할 수 있습니다/);
  assert.match(policy, /상담 접수 시 최종 확인된 이름·연락처는 회원프로필과 별도의 상담정보로 저장합니다/);
  assert.match(policy, /카카오에서 선택 제공받아 신규 회원프로필에 저장한 이름·전화번호<\/td><td>회원 탈퇴 또는 이용계약 종료 시까지/);
  assert.match(policy, /회사 범위와 카카오 회원 식별자의 연결만으로 고객 계정을 매칭/);
  assert.match(policy, /카카오 연결 해제 완료 시 작업 기록과 회원 식별자를 삭제/);
  assert.match(policy, /자동 재시도가 끝날 때까지 완료되지 않은 경우 운영자가 처리 완료를 확인한 뒤 삭제/);
  assert.match(policy, /직원 로그인 보호를 위해 최소 연결 해제 정보를 보관하고 정기적으로 재평가/);
  assert.match(terms, /직원 이용이 끝나면 연결 해제를 진행합니다/);
  assert.match(policy, /연결 해제 후 1일이 지난 뒤 정기 정리 작업에서 파기/);
  assert.match(policy, /공급자 연결 해제 작업이 진행 중이면 해당 작업 완료 후 다음 정리 작업에서 파기/);
  assert.match(policy, /정리 작업은 통상 15분 주기로 실행/);
  assert.match(policy, /10분의 인증 유효기간이 끝난 뒤 1일이 지난 흐름을 정기 정리 작업에서 파기/);
  assert.match(policy, /완료된 흐름의 임시 회원 식별 정보와 이름·전화번호 임시 사본은 완료 처리 시 제거/);
  assert.doesNotMatch(policy, /24시간 이내[^<]*파기|정확히 24시간[^<]*파기/);
});

test('new Kakao flow is disclosed as a first-time feature without changing existing consultation choices', () => {
  assert.match(policy, /공개할 당시 아직 제공하지 않은 카카오 고객계정·빠른 상담 기능/);
  assert.match(policy, /기능을 이용하기 전에 카카오 연결 화면에서 관련 약관과 개인정보 수집·이용 동의를 받습니다/);
  assert.match(policy, /기존 일반 상담과 광고 성과 측정 선택 동의의 조건은 이번 추가 안내로 변경되지 않습니다/);
});
