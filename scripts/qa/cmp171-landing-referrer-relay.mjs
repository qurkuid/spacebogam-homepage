#!/usr/bin/env node
// CMP-171/CMP-269 상담 링크 귀속 결손 QA.
// same-origin CTA 는 URL 재귀 성장을 막기 위해 landing_page/referrer 를 싣지 않고
// sessionStorage journey 로 보존한다. source_page 와 전체 acquisition relay,
// 반복 decoration 의 길이 안정성을 실제 Chromium 에서 확인한다.
// 로컬 정적 파일 외 모든 요청은 abort 해 운영 계측과 외부 네트워크를 막는다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ROOT = path.resolve(import.meta.dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/qa-referrer.html') {
    // 리퍼러가 붙은 유입을 재현하기 위한 QA 전용 진입 페이지.
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<a id="go" href="/?utm_source=instagram&utm_medium=social&utm_campaign=cmp171_qa">go</a>');
    return;
  }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (request) => {
  try {
    if (request.url().startsWith(origin + '/')) return request.continue();
    return request.abort();
  } catch (error) { /* 이미 처리된 요청은 무시한다 */ }
});

await page.goto(`${origin}/qa-referrer.html`, { waitUntil: 'domcontentloaded' });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
  page.click('#go'),
]);

const decorated = await page.evaluate(() => {
  const anchor = Array.from(document.querySelectorAll('a[href]'))
    .find((node) => /consultation/.test(node.getAttribute('href') || ''));
  if (!anchor) return null;
  anchor.addEventListener('click', (event) => event.preventDefault());
  const lengths = [anchor.getAttribute('href').length];
  for (let i = 0; i < 8; i += 1) {
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    lengths.push(anchor.getAttribute('href').length);
  }
  return {
    href: anchor.getAttribute('href'),
    lengths,
    journey: JSON.parse(sessionStorage.getItem('spacebogam_funnel_journey') || 'null'),
    attribution: JSON.parse(localStorage.getItem('spacebogam_funnel_attribution') || 'null'),
  };
});

await browser.close();
server.close();

if (!decorated) { console.error('FAIL: 상담 링크를 찾지 못했습니다.'); process.exit(1); }
const params = new URL(decorated.href, origin).searchParams;
const checks = {
  landing_page_omitted: params.get('landing_page') === null,
  referrer_omitted: params.get('referrer') === null,
  source_page: params.get('source_page'),
  utm_source: params.get('utm_source'),
  journey_landing_page: decorated.journey?.landing_page,
  journey_referrer: decorated.journey?.referrer,
  stored_utm_source: decorated.attribution?.values?.utm_source,
  sbClientId: params.get('sbClientId'),
  sbSessionId: params.get('sbSessionId'),
  stable_length: new Set(decorated.lengths).size === 1,
  url_length: decorated.href.length,
};
console.log(JSON.stringify(checks, null, 2));
const missing = [
  'landing_page_omitted', 'referrer_omitted', 'source_page', 'utm_source',
  'journey_landing_page', 'journey_referrer', 'stored_utm_source',
  'sbClientId', 'sbSessionId', 'stable_length',
]
  .filter((key) => !checks[key]);
if (missing.length) { console.error('FAIL 누락:', missing.join(', ')); process.exit(1); }
if (checks.source_page !== '/' || checks.url_length >= 2000) {
  console.error('FAIL URL 경계:', JSON.stringify({ source_page: checks.source_page, url_length: checks.url_length }));
  process.exit(1);
}
console.log('PASS');
