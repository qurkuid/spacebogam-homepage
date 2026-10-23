const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'customer-account/index.html'), 'utf8');

test('native membership guide distinguishes signup, optional profile and consultation', () => {
  for (const text of ['가입과 로그인은 앱에서 진행합니다', '회원가입은 상담 신청과 별개입니다', '상담을 신청하거나 공사 계약을 하지 않아도', '제공하지 않아도 회원가입·로그인이 가능합니다', '만 14세 이상', '본인이 확인·수정한 뒤 접수', '기존 고객이나 프로젝트를 자동으로 합치지 않습니다', '메뉴 → 계정 삭제 → 계정 탈퇴']) {
    assert.ok(source.includes(text), text);
  }
  assert.equal((source.match(/선택 · 제공 기능 준비 중/g) || []).length, 2);
  assert.equal((source.match(/회원프로필 등록·관리, 상담 입력란 자동 입력/g) || []).length, 2);
  assert.doesNotMatch(source, /<input\b|<form\b|<dialog\b/);
});

test('membership installation guide links to a real preview APK without claiming store release', () => {
  assert.match(source, /data-membership-apk href="https:\/\/expo\.dev\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk"/);
  assert.doesNotMatch(source, /__MEMBERSHIP_APK_URL__/);
  assert.ok(source.includes('Android 설치용 사전 배포본'));
  assert.ok(source.includes('실제 기기 검증 완료를 뜻하지 않습니다'));
  assert.ok(source.includes('iPhone 설치는 아직 제공하지 않습니다'));
});

test('public customer terms expose the native membership guide on both routes', () => {
  const terms = fs.readFileSync(path.join(root, 'customer-terms.html'), 'utf8');
  assert.equal(terms, fs.readFileSync(path.join(root, 'customer-terms/index.html'), 'utf8'));
  assert.match(terms, /href="\/customer-account\/"/);
  assert.match(source, /href="\/privacy\/"/);
  assert.match(source, /href="\/customer-terms\/"/);
});
