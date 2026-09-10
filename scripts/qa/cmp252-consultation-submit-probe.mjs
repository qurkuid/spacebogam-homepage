#!/usr/bin/env node
/**
 * CMP-252 — 운영 상담 폼의 모바일/Meta 인앱 브라우저 제출 회귀 프로브.
 *
 * 실제 고객 여정(홈 → 상담 안내 → 상담 신청서)을 따라가며 다음을 증명한다.
 *  1. 빈 제출의 사용자 오류 메시지와 첫 누락 필드 초점
 *  2. 운영 질문 API가 내려준 모든 필수 항목을 채운 뒤 제출 API 성공
 *  3. lead_form_view → lead_form_start → lead_submit_success 이벤트 순서
 *
 * 운영 DB에 저장되는 테스트 상담은 `is_test=1`, `[QA]` 접두어, 도달 불가 전화번호,
 * 공공기관 주소만 사용한다. 실제 상담이나 개인정보를 사용하지 않는다.
 */
import fs from 'node:fs';
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';

const CHROME =
  '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.env.PAPERCLIP_RUN_SCRATCH_DIR;
if (!OUT) throw new Error('PAPERCLIP_RUN_SCRATCH_DIR is required');

const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_INSTAGRAM =
  UA_MOBILE +
  ' Instagram 340.0.0.20.107 (iPhone14,3; iOS 17_5; ko_KR; ko-KR; scale=3.00; 1170x2532; 600487835)';
const HOME = qaEntryUrl(
  'https://spacebogam.kr/',
  'utm_source=codex_qa&utm_medium=verification&utm_campaign=cmp252_submit_probe'
);
const scenario = process.env.SCENARIO === 'mobile' ? 'mobile' : 'instagram-inapp';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
  protocolTimeout: 180000,
});
const page = await browser.newPage();
await page.setUserAgent(scenario === 'mobile' ? UA_MOBILE : UA_INSTAGRAM);
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const consoleErrors = [];
const requests = [];
const funnelEvents = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
});
page.on('request', (request) => {
  if (!/\/api\/(?:consultation\/submit|marketing\/funnel-events)/.test(request.url())) return;
  if (/funnel-events/.test(request.url())) {
    try {
      const body = JSON.parse(request.postData() || '{}');
      const events = Array.isArray(body.events) ? body.events : [body];
      events.forEach((event) => {
        if (event?.eventName) {
          funnelEvents.push({
            eventName: event.eventName,
            eventId: event.eventId,
            isTest: event.isTest,
          });
        }
      });
    } catch {}
  }
});
page.on('response', async (response) => {
  if (!/\/api\/(?:consultation\/submit|marketing\/funnel-events)/.test(response.url())) return;
  let body = '';
  try {
    body = (await response.text()).slice(0, 500);
  } catch {}
  requests.push({
    method: response.request().method(),
    url: response.url(),
    status: response.status(),
    body,
  });
});

async function clickFirstLink(pattern) {
  const href = await page.evaluate((source) => {
    const regex = new RegExp(source);
    const link = [...document.querySelectorAll('a[href]')].find((candidate) =>
      regex.test((candidate.textContent || '') + ' ' + candidate.href)
    );
    return link?.href || null;
  }, pattern.source);
  if (!href) throw new Error(`link not found: ${pattern}`);
  await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });
  return href;
}

await page.goto(HOME, { waitUntil: 'networkidle2', timeout: 60000 });
const homeUrl = page.url();
const consultationHref = await clickFirstLink(/consultation|상담/);
const consultationUrl = page.url();
const applyHref = await clickFirstLink(/consultation\/apply|신청서 작성|상담 신청하기/);
await page.waitForSelector('#consult-form-root form', { timeout: 30000 });
const applyUrl = page.url();

await page.screenshot({
  path: `${OUT}/cmp252-${scenario}-form-initial.png`,
  fullPage: true,
});

// 먼저 빈 제출을 눌러 사용자가 실제로 보는 차단 피드백을 기록한다.
await page.click('.cf-submit');
await new Promise((resolve) => setTimeout(resolve, 300));
const emptyValidation = await page.evaluate(() => ({
  message: document.querySelector('.cf-status')?.textContent?.trim() || '',
  focusedName: document.activeElement?.getAttribute('name') || '',
  fieldCount: document.querySelectorAll('.cf-field').length,
  requiredCount: document.querySelectorAll('.cf-required').length,
  optionalCollapsed: !document.querySelector('.cf-optional')?.open,
}));
await page.screenshot({
  path: `${OUT}/cmp252-${scenario}-validation.png`,
  fullPage: true,
});

// 운영 질문의 필수 여부를 DOM 라벨의 별표로 판별한다. 고객 개인정보 대신 QA 픽스처만 쓴다.
const fillResult = await page.evaluate(() => {
  const setValue = (field, value) => {
    const prototype =
      field.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : field.tagName === 'SELECT'
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(field, value);
    else field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const filled = [];
  document.querySelectorAll('.cf-field').forEach((wrap) => {
    if (!wrap.querySelector('.cf-required')) return;
    const fields = [...wrap.querySelectorAll('input, select, textarea')];
    const first = fields[0];
    if (!first) return;
    if (first.type === 'radio' || first.type === 'checkbox') {
      first.click();
      filled.push(first.name);
      return;
    }
    if (first.tagName === 'SELECT') {
      const option = [...first.options].find((candidate) => candidate.value);
      if (option) setValue(first, option.value);
      filled.push(first.name);
      return;
    }
    const question = wrap.querySelector('label')?.textContent || '';
    let value = '[QA] CMP-252 제출 회귀검증';
    if (first.type === 'tel') value = '01000000000';
    else if (first.type === 'password') value = 'qa252test';
    else if (first.type === 'number') value = '34';
    else if (first.type === 'date') value = '2026-08-31';
    else if (/주소/.test(question)) value = '부산광역시 연제구 중앙대로 1001';
    else if (/성함|이름/.test(question)) value = '[QA]CMP252';
    setValue(first, value);
    filled.push(first.name);
  });
  const consent = document.querySelector('#cf-consent-input');
  if (consent && !consent.checked) consent.click();
  return {
    filled,
    consent: Boolean(consent?.checked),
    sessionId: sessionStorage.getItem('spacebogam_funnel_session_id'),
    isTestSession: sessionStorage.getItem('spacebogam_funnel_is_test'),
  };
});

await page.screenshot({
  path: `${OUT}/cmp252-${scenario}-ready.png`,
  fullPage: true,
});
await page.click('.cf-submit');
await page.waitForFunction(
  () =>
    Boolean(document.querySelector('.cf-success')) ||
    Boolean(document.querySelector('.cf-status-error')?.textContent),
  { timeout: 30000 }
);
await new Promise((resolve) => setTimeout(resolve, 1200));

const finalState = await page.evaluate(() => ({
  success: Boolean(document.querySelector('.cf-success')),
  successText: document.querySelector('.cf-success')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  errorText: document.querySelector('.cf-status-error')?.textContent?.replace(/\s+/g, ' ').trim() || '',
}));
await page.screenshot({
  path: `${OUT}/cmp252-${scenario}-result.png`,
  fullPage: true,
});

const report = {
  observedAt: new Date().toISOString(),
  scenario,
  journey: { homeUrl, consultationHref, consultationUrl, applyHref, applyUrl },
  emptyValidation,
  fillResult,
  finalState,
  funnelEvents,
  requests,
  consoleErrors,
};
fs.writeFileSync(
  `${OUT}/cmp252-${scenario}-result.json`,
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));

await browser.close();
if (!finalState.success) process.exitCode = 1;
