#!/usr/bin/env node
// CMP-171 상담 링크 귀속 결손 QA.
// 로컬 정적 서버로 홈페이지를 띄우고, 상담 CTA 클릭 시 링크에
// landing_page / referrer / source_page 가 실리는지 확인한다.
// 운영 퍼널 오염을 막기 위해 ingest 요청은 abort 한다.
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
await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://localhost:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (request) => {
  try {
    if (request.url().includes('/api/marketing/funnel-events')) return request.abort();
    return request.continue();
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
  anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return anchor.getAttribute('href');
});

await browser.close();
server.close();

if (!decorated) { console.error('FAIL: 상담 링크를 찾지 못했습니다.'); process.exit(1); }
const params = new URL(decorated, origin).searchParams;
const checks = {
  landing_page: params.get('landing_page'),
  referrer: params.get('referrer'),
  source_page: params.get('source_page'),
  utm_source: params.get('utm_source'),
  sbClientId: params.get('sbClientId'),
  sbSessionId: params.get('sbSessionId'),
};
console.log(JSON.stringify(checks, null, 2));
const missing = ['landing_page', 'referrer', 'source_page', 'utm_source', 'sbClientId', 'sbSessionId']
  .filter((key) => !checks[key]);
if (missing.length) { console.error('FAIL 누락:', missing.join(', ')); process.exit(1); }
console.log('PASS');
