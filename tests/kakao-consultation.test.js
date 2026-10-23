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

test('phone validation accepts Korean mobile formats only', () => {
  assert.equal(moduleApi.isValidPhone('010-1234-5678'), true);
  assert.equal(moduleApi.isValidPhone('01012345678'), true);
  assert.equal(moduleApi.isValidPhone('051-123-4567'), false);
});

test('Kakao entry starts authorization directly without a separate consent control', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'assets/kakao-consultation.js'), 'utf8');
  assert.doesNotMatch(source, /data-kakao-account-consent|data-kakao-consent-dialog|form\.elements\.consent/);
  assert.match(source, /startButton\.addEventListener\('click', startKakao\)/);
  assert.match(source, /requestJson\(START_ENDPOINT, \{ channel: 'consultation', consent: true \}\)/);
});

test('Kakao only fills the existing questionnaire and never creates a parallel form', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'assets/kakao-consultation.js'), 'utf8');
  assert.match(source, /SB_CONSULTATION.applyKakaoProfile/);
  assert.match(source, /root.open\('about:blank'/);
  assert.match(source, /new root.BroadcastChannel\('spacebogam.kakao.'/);
  assert.doesNotMatch(source, /innerHTML|data-kakao-form|type: 'intake'|SUBMIT_ENDPOINT|buildSubmission|기존 자세한 상담/);
  assert.doesNotMatch(source, /(?:sessionStorage|localStorage)\.setItem\([^)]*(?:profile|name|phone)/);
});

test('a hidden Kakao entry does not initialize authentication or callback handling', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'assets/kakao-consultation.js'), 'utf8');
  let lookedUp = false;
  vm.runInNewContext(source, { window: { document: { getElementById() {
    lookedUp = true;
    return { hidden: true, querySelector() { throw new Error('hidden entry must stay inactive'); } };
  } } } });
  assert.equal(lookedUp, true);
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

test('released entry contains only the Kakao start button', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'consultation/index.html'), 'utf8');
  assert.match(html, /id="stage"/);
  assert.match(html, /flow\.js\?v=[a-f0-9]{12}/);
  assert.match(html, /id="kakao-quick-consultation"/);
  const entry = html.match(/<section class="kakao-quick kakao-quick--entry"[\s\S]*?<\/section>/)[0];
  assert.match(entry, /aria-label="카카오 상담 신청">/);
  assert.doesNotMatch(entry, /\shidden(?:[\s>])/);
  assert.match(entry, /data-kakao-start><svg[^>]+aria-hidden="true"/);
  assert.doesNotMatch(entry, /<h2|<a|<dialog|<input|data-kakao-account-consent|KAKAO QUICK CONSULTATION/);
  assert.equal(entry.replace(/<[^>]+>/g, '').trim(), '카카오로 빠르게 상담신청하기');
  assert.doesNotMatch(html, /subject/);
});

function loginHarness(options = {}) {
  const channels = [], windows = [], requests = [], values = new Map();
  let listener, applied;
  const button = { dataset: {}, disabled: false, setAttribute() {}, querySelector() { return {}; }, addEventListener(_event, fn) { listener = fn; } };
  const status = { dataset: {}, textContent: '' };
  const storage = () => ({ getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  const root = {
    document: { getElementById: () => ({ querySelector: selector => selector === '[data-kakao-start]' ? button : status }) },
    sessionStorage: storage(), location: { search: '' },
    SB_CONSULTATION: { applyKakaoProfile(profile, grant) { applied = { profile, grant }; } },
    open() {
      if (options.blocked) return null;
      const popup = { sessionStorage: storage(), location: { replace(url) { popup.url = url; } }, close() { popup.closed = true; } };
      windows.push(popup); return popup;
    },
    BroadcastChannel: options.unsupported ? undefined : class {
      constructor(name) { this.name = name; channels.push(this); }
      close() { this.closed = true; }
    },
    setTimeout: () => 1, clearTimeout() {},
    async fetch(url, request) {
      requests.push({ url, body: JSON.parse(request.body) });
      return { ok: true, json: async () => ({ authorizationUrl: 'https://intm.kr/api/customer/auth/kakao/authorize?flow=flow-12345678', flow: 'flow-12345678', codeVerifier: 'v'.repeat(43) }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'assets/kakao-consultation.js'), 'utf8'), { window: root, URL, URLSearchParams });
  return { root, button, status, channels, windows, requests, values, click: () => listener(), applied: () => applied };
}

test('login popup fills the existing questionnaire, clears verifier storage, and permits an immediate retry', async () => {
  const app = loginHarness();
  await app.click();
  assert.equal(app.button.disabled, false, 'closing the popup must not lock the button for ten minutes');
  assert.equal(app.windows.length, 1);
  assert.match(app.windows[0].url, /^https:\/\/intm.kr/);
  await app.click();
  assert.equal(app.channels[0].closed, true, 'a retry stops listening to the previous flow');
  assert.equal(app.windows.length, 2);
  app.channels[1].onmessage({ data: { success: true, consultationGrant: 'signed-grant', profile: { name: '검증고객', phone: '01012345678' } } });
  assert.equal(app.applied().profile.name, '검증고객');
  assert.equal(app.applied().grant, 'signed-grant');
  assert.equal(app.channels[1].closed, true);
  assert.equal(app.values.size, 0);
  assert.equal(app.requests.every(request => request.url.endsWith('/kakao/start')), true, 'no consultation is submitted by the Kakao button');
});

test('blocked popups and unsupported messaging preserve manual input without making requests', async () => {
  for (const options of [{ blocked: true }, { unsupported: true }]) {
    const app = loginHarness(options);
    await app.click();
    assert.equal(app.requests.length, 0);
    assert.equal(app.button.disabled, false);
    assert.match(app.status.textContent, /직접 입력/);
  }
});
