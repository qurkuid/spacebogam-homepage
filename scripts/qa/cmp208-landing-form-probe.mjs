#!/usr/bin/env node
// CMP-208 랜딩 이탈(방문→10초 참여 63.9% 손실)과 폼 도달 경로 실측.
// 라이브 spacebogam.kr 을 헤드리스 크롬으로 구동해서
//   (1) 모바일 로딩 성능 / 렌더 / 콘솔 오류
//   (2) 인스타그램 인앱 브라우저 UA 동등성
//   (3) CTA -> 폼 도달 -> 제출 직전까지의 경로
//   (4) 광고 차단기 환경에서 폼이 뜨는지
// 를 확인한다.
//
// 운영 오염 방지: 퍼널 ingest POST 와 상담 제출 POST 는 전부 abort 한다.
// 제출은 "요청이 올바른 payload 로 나갔는가" 까지만 판정한다.
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
// CMP-267: utm_source=meta 라 표식이 없으면 유료 Meta 유입으로 오인된다. qaEntryUrl 이 is_test=1 을 강제한다.
// (ingest 는 아래 BLOCK_POST 로도 막지만, abort 가 깨지는 날을 대비한 이중 방어다.)
const HOME = qaEntryUrl('https://spacebogam.kr/', 'utm_source=meta&utm_medium=paid_social&utm_campaign=cmp208_probe');

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_INAPP = UA_MOBILE + ' Instagram 340.0.0.20.107 (iPhone14,3; iOS 17_5; ko_KR; ko-KR; scale=3.00; 1170x2532; 600487835)';
// 대표적인 차단 목록 패턴. 광고 차단기가 실제로 끊는 호스트만 흉내낸다.
const ADBLOCK = [/googletagmanager\.com/, /google-analytics\.com/, /connect\.facebook\.net/, /facebook\.com\/tr/, /analytics/];

const BLOCK_POST = [/\/api\/marketing\/funnel-events/, /\/api\/consultation\/submit/];

function nowIso(){ return new Date().toISOString(); }

async function newPage(browser, {ua, adblock = false, throttle = true}){
  const page = await browser.newPage();
  await page.setUserAgent(ua);
  await page.setViewport({width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCache');
  if (throttle) {
    // Slow 4G 근사: 광고 유입 모바일의 현실적인 하한.
    await client.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8
    });
  }
  await page.evaluateOnNewDocument(() => {
    window.__lcp = 0; window.__errors = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime);
      }).observe({type: 'largest-contentful-paint', buffered: true});
    } catch (error) { /* 미지원 브라우저는 0 으로 둔다 */ }
    window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  });

  const net = {bytes: 0, requests: 0, failed: [], blockedPosts: [], submits: []};
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    try {
      const url = request.url();
      if (BLOCK_POST.some((r) => r.test(url)) && request.method() === 'POST') {
        net.blockedPosts.push(url);
        if (/consultation\/submit/.test(url)) net.submits.push({url, body: request.postData()});
        return request.abort();
      }
      if (adblock && ADBLOCK.some((r) => r.test(url))) return request.abort();
      return request.continue();
    } catch (error) { /* 이미 처리된 요청 */ }
  });
  page.on('requestfailed', (r) => {
    const url = r.url();
    if (BLOCK_POST.some((x) => x.test(url))) return;
    if (adblock && ADBLOCK.some((x) => x.test(url))) return;
    net.failed.push(url + ' :: ' + (r.failure() && r.failure().errorText));
  });
  page.on('response', async (r) => {
    net.requests += 1;
    try { const b = await r.buffer(); net.bytes += b.length; } catch (error) { /* 본문 없는 응답 */ }
  });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  return {page, net, consoleErrors};
}

async function measureHome(browser, label, opts){
  const {page, net, consoleErrors} = await newPage(browser, opts);
  const t0 = Date.now();
  const response = await page.goto(HOME, {waitUntil: 'load', timeout: 60000});
  const loadMs = Date.now() - t0;
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
    const cta = Array.from(document.querySelectorAll('a[href]')).filter((a) => /consultation|상담/.test(a.href + a.textContent));
    const firstCta = cta[0];
    const rect = firstCta ? firstCta.getBoundingClientRect() : null;
    return {
      status: document.readyState,
      ttfb: Math.round(nav.responseStart || 0),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEvent: Math.round(nav.loadEventEnd || 0),
      fcp: Math.round(fcp),
      lcp: Math.round(window.__lcp || 0),
      title: document.title,
      heroText: (document.querySelector('h1, .hero h2, header h2') || {}).textContent?.trim().slice(0, 60) || '(없음)',
      bodyChars: document.body.innerText.replace(/\s+/g, ' ').trim().length,
      ctaCount: cta.length,
      firstCtaText: firstCta ? firstCta.textContent.trim().slice(0, 30) : null,
      firstCtaAboveFold: rect ? rect.top < window.innerHeight : null,
      firstCtaTop: rect ? Math.round(rect.top) : null,
      viewportH: window.innerHeight,
      docHeight: document.documentElement.scrollHeight,
      trackerLoaded: typeof window.__spacebogamFunnel !== 'undefined' || Boolean(document.querySelector('script[src*="funnel-tracking"]')),
      jsErrors: window.__errors.slice(0, 5)
    };
  });
  // 10초 시점의 시각 상태 = "10초 이상 참여" 판정 시점과 같은 순간.
  await new Promise((r) => setTimeout(r, 10500));
  const at10s = await page.evaluate(() => ({
    lcp: Math.round(window.__lcp || 0),
    visible: document.visibilityState,
    imagesLoaded: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length,
    imagesTotal: document.images.length
  }));
  const shot = `${process.env.PAPERCLIP_RUN_SCRATCH_DIR}/cmp208-${label}.png`;
  await page.screenshot({path: shot});
  const out = {label, httpStatus: response.status(), loadMs, ...metrics, at10s,
    bytesKB: Math.round(net.bytes / 1024), requests: net.requests,
    failedRequests: net.failed.slice(0, 8), consoleErrors: consoleErrors.slice(0, 5),
    blockedIngest: net.blockedPosts.length, screenshot: shot};
  await page.close();
  return out;
}

async function formPath(browser, label, opts){
  const {page, net, consoleErrors} = await newPage(browser, opts);
  await page.goto(HOME, {waitUntil: 'load', timeout: 60000});
  const cta = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href]')).find((x) => /consultation/.test(x.href));
    return a ? a.href : null;
  });
  if (!cta) { await page.close(); return {label, error: 'CTA 링크 없음'}; }
  const t0 = Date.now();
  await page.goto(cta, {waitUntil: 'load', timeout: 60000});
  // /consultation/ 은 폼이 아니라 중간 안내 페이지다. 신청서 링크를 한 번 더 눌러야 폼이 나온다.
  const hops = [cta];
  let formRendered = false;
  for (let hop = 0; hop < 2 && !formRendered; hop += 1) {
    try {
      await page.waitForFunction(() => document.querySelectorAll('input, select, textarea').length >= 2, {timeout: 12000});
      formRendered = true;
      break;
    } catch (error) { /* 다음 홉으로 */ }
    const next = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href], button')).find((x) => /신청서|신청하기|apply/.test(x.textContent + (x.href || '')));
      if (!a) return null;
      if (a.tagName === 'A') return a.href;
      a.click();
      return 'clicked';
    });
    if (!next) break;
    hops.push(next);
    if (next !== 'clicked') await page.goto(next, {waitUntil: 'load', timeout: 60000}).catch(() => {});
  }
  const formMs = Date.now() - t0;
  const state = await page.evaluate(() => ({
    url: location.href,
    fields: Array.from(document.querySelectorAll('input, select, textarea')).map((f) => ({
      name: f.name || f.id || '', type: f.type || f.tagName.toLowerCase(), required: f.required
    })),
    submitBtn: (() => { const b = document.querySelector('button[type=submit], .cf-submit, form button'); return b ? b.textContent.trim().slice(0, 30) : null; })(),
    errorBox: (() => { const e = document.querySelector('.cf-error, .cf-message, [class*=error]'); return e ? e.textContent.trim().slice(0, 120) : null; })(),
    visibleText: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 200)
  }));

  let submitAttempt = null;
  if (formRendered) {
    submitAttempt = await page.evaluate(() => {
      const fill = (f, v) => { f.value = v; f.dispatchEvent(new Event('input', {bubbles: true})); f.dispatchEvent(new Event('change', {bubbles: true})); };
      const fields = Array.from(document.querySelectorAll('input, select, textarea'));
      fields.forEach((f) => {
        if (f.type === 'file' || f.disabled) return; // 파일 입력은 스크립트로 값을 넣을 수 없다
        if (f.type === 'radio' || f.type === 'checkbox') { if (!f.checked) f.click(); return; }
        if (f.tagName === 'SELECT') { if (f.options.length > 1) { f.selectedIndex = 1; f.dispatchEvent(new Event('change', {bubbles: true})); } return; }
        if (/tel|phone|연락/i.test(f.name + f.id + (f.placeholder || ''))) return fill(f, '01000000000');
        if (f.type === 'email') return fill(f, 'cmp208probe@example.com');
        return fill(f, 'CMP-208 probe');
      });
      const btn = document.querySelector('button[type=submit], .cf-submit, form button');
      if (btn) btn.click();
      return {clicked: Boolean(btn), fieldCount: fields.length};
    });
    await new Promise((r) => setTimeout(r, 3000));
  }
  const after = await page.evaluate(() => ({
    message: (document.querySelector('.cf-error, .cf-message, [class*=message]') || {}).textContent?.trim().slice(0, 160) || null
  }));
  const shot = `${process.env.PAPERCLIP_RUN_SCRATCH_DIR}/cmp208-${label}.png`;
  await page.screenshot({path: shot});
  const out = {label, ctaHref: cta, hops, formRendered, formMs, ...state, submitAttempt,
    submitRequests: net.submits.map((s) => ({url: s.url, bodyPreview: (s.body || '').slice(0, 400)})),
    afterSubmit: after, failedRequests: net.failed.slice(0, 8), consoleErrors: consoleErrors.slice(0, 5), screenshot: shot};
  await page.close();
  return out;
}

// 한 시나리오가 늦어져도 앞선 실측이 사라지지 않도록 끝나는 대로 파일에 남긴다.
import fs from 'node:fs';
const OUT = process.env.PAPERCLIP_RUN_SCRATCH_DIR;
const only = process.argv[2] || 'all';
const browser = await puppeteer.launch({executablePath: CHROME, headless: true, args: ['--no-sandbox'], protocolTimeout: 180000});
const plan = [
  ['home-mobile', measureHome, {ua: UA_MOBILE}],
  ['home-inapp-instagram', measureHome, {ua: UA_INAPP}],
  ['home-adblock', measureHome, {ua: UA_MOBILE, adblock: true}],
  ['form-mobile', formPath, {ua: UA_MOBILE}],
  ['form-inapp-instagram', formPath, {ua: UA_INAPP}],
  ['form-adblock', formPath, {ua: UA_MOBILE, adblock: true}]
].filter(([label]) => only === 'all' || label.startsWith(only));
for (const [label, fn, opts] of plan) {
  let result;
  try { result = await fn(browser, label, opts); }
  catch (error) { result = {label, crashed: String(error && error.message).slice(0, 300)}; }
  fs.writeFileSync(`${OUT}/cmp208-${label}.json`, JSON.stringify({at: nowIso(), ...result}, null, 2));
  console.log('[done]', label);
}
await browser.close();
