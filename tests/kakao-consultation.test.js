const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const moduleApi = require('../assets/kakao-consultation.js');

test('OAuth URLs allow only the exact INTM first hop or Kakao authorization endpoint', () => {
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://intm.kr/api/customer/auth/kakao/authorize?flow=f-123'), true);
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://kauth.kakao.com/oauth/authorize?client_id=x'), true);
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://intm.kr/api/customer/auth/kakao/complete?flow=f-123'), false);
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://user@intm.kr/api/customer/auth/kakao/authorize?flow=f-123'), false);
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://intm.kr:444/api/customer/auth/kakao/authorize?flow=f-123'), false);
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://kauth.kakao.com.evil.example/oauth/authorize'), false);
  assert.equal(moduleApi.isSafeAuthorizationUrl('https://kauth.kakao.com/other'), false);
  assert.equal(moduleApi.isSafeAuthorizationUrl('http://kauth.kakao.com/oauth/authorize'), false);
});

test('callback requires exact flow match and an unexpired verifier tuple', () => {
  const now = Date.now();
  const initiation = { flow: 'flow-12345678', codeVerifier: 'v'.repeat(43), expiresAt: now + 60_000 };
  assert.equal(moduleApi.callbackMatches({ flow: 'flow-12345678', kakao: 'success' }, initiation, now), true);
  assert.equal(moduleApi.callbackMatches({ flow: 'flow-other123', kakao: 'success' }, initiation, now), false);
  assert.equal(moduleApi.callbackMatches({ flow: 'flow-12345678', kakao: 'success' }, { ...initiation, expiresAt: now - 1 }, now), false);
});

test('intake payload uses the signed grant and preserves one caller-provided event id', () => {
  const payload = moduleApi.buildSubmission({
    intake: { name: '박기범', phone: '010-1234-5678', address: '부산 해운대구', spaceType: 'apartment' },
    kakaoGrant: 'signed-grant',
    marketingAttribution: { utm_source: 'test' },
    eventId: '3de2461b-591a-4639-940f-8f4712874661',
    isTest: true
  });
  assert.deepEqual(payload, {
    type: 'intake',
    intake: { name: '박기범', phone: '010-1234-5678', address: '부산 해운대구', spaceType: 'apartment', consent: true },
    companyId: '4206bdfd-b51d-4433-9f8e-c854131948cc',
    kakaoGrant: 'signed-grant',
    marketingAttribution: {
      utm_source: 'test',
      sbSubmitEventId: '3de2461b-591a-4639-940f-8f4712874661',
      is_test: 'true'
    }
  });
});

test('phone validation accepts Korean mobile formats only', () => {
  assert.equal(moduleApi.isValidPhone('010-1234-5678'), true);
  assert.equal(moduleApi.isValidPhone('01012345678'), true);
  assert.equal(moduleApi.isValidPhone('051-123-4567'), false);
});

test('OAuth start requires explicit account consent and sends the consent intent', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'assets/kakao-consultation.js'), 'utf8');
  assert.match(source, /data-kakao-account-consent/);
  assert.match(source, /if \(!consent \|\| !consent\.checked\)/);
  assert.match(source, /requestJson\(START_ENDPOINT, \{ channel: 'consultation', consent: true \}\)/);
});

test('callback scrubber runs before trackers and removes only OAuth callback parameters', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'consultation/index.html'), 'utf8');
  const marker = 'data-kakao-callback-scrubber';
  const scrubStart = html.indexOf(marker);
  const gtmStart = html.indexOf('Google Tag Manager');
  assert.ok(scrubStart > 0 && scrubStart < gtmStart, 'callback scrubber must precede GTM');

  const scriptMatch = html.match(/<script data-kakao-callback-scrubber>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'scrubber script is present');
  const saved = new Map();
  let replacement = '';
  const sandbox = {
    location: { href: 'https://spacebogam.kr/consultation/?flow=f-12345678&kakao=success&utm_source=qa#form' },
    history: { replaceState(_state, _title, url) { replacement = url; } },
    sessionStorage: { setItem(key, value) { saved.set(key, value); } },
    URL
  };
  vm.runInNewContext(scriptMatch[1], sandbox);
  assert.equal(replacement, '/consultation/?utm_source=qa#form');
  assert.deepEqual(JSON.parse(saved.get('spacebogam.kakao.consultation.callback.v1')), {
    flow: 'f-12345678', kakao: 'success'
  });
});

test('page preserves the detailed consultation flow and provides explicit Kakao privacy copy', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'consultation/index.html'), 'utf8');
  assert.match(html, /id="stage"/);
  assert.match(html, /flow\.js\?v=d61432472658/);
  assert.match(html, /id="kakao-quick-consultation"/);
  assert.match(html, /data-kakao-account-consent/);
  assert.ok(html.indexOf('data-kakao-account-consent') < html.indexOf('data-kakao-start'), 'account consent must precede OAuth start');
  assert.match(html, /카카오 회원 식별자와 닉네임.*INTM/s);
  assert.match(html, /고객 계정을 만들고 로그인과 상담 신청을 연결/);
  assert.match(html, /카카오 프로필 이메일은 로그인 확인에 사용하지만 영구 저장하지 않습니다/);
  assert.doesNotMatch(html, /subject/);
  assert.match(html, /기존 자세한 상담 신청/);
});
