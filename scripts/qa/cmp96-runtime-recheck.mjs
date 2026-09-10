// CMP-96 재검증: CMP-141 수정 후 운영 런타임 이벤트 품질 QA
// 주의: 이 프로브는 ingest 를 가로막지 않으므로 실행할 때마다 운영 퍼널에 이벤트를 남긴다.
//       CMP-267 이후 유입 URL 에 is_test=1 이 강제되어 그 이벤트는 is_test=t 로 저장된다.
// 사용: node scripts/qa/cmp96-runtime-recheck.mjs <출력디렉터리>
//   BASE_URL=http://127.0.0.1:3023 node scripts/qa/cmp96-runtime-recheck.mjs   # 커밋 전 preview 검증
//   BASE_URL 미지정 시 기본값 https://spacebogam.kr (배포 후 검증)
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { writeFileSync } from 'node:fs';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';
import { announceTarget } from './lib/qa-target.mjs';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.argv[2] || '.';
const BASE_URL = announceTarget('CMP96');
const ENDPOINT_MATCH = 'intm.kr/api/marketing/funnel-events';
const UTM = 'utm_source=qa_cmp96&utm_medium=runtime_recheck&utm_campaign=cmp96_20260728&utm_content=post_cmp141';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSession(browser, variant, viewport, label) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);

  const events = [];
  const consoleMsgs = [];
  const pageErrors = [];

  page.on('request', (req) => {
    if (req.url().includes(ENDPOINT_MATCH) && req.method() === 'POST') {
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = { __unparsed: req.postData() }; }
      events.push({ name: body?.eventName ?? null, payload: body, status: null });
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes(ENDPOINT_MATCH) && res.request().method() === 'POST') {
      const pending = events.filter((e) => e.status === null);
      const target = pending[0];
      if (target) {
        target.status = res.status();
        try { target.responseBody = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      }
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

  const url = qaEntryUrl(`${BASE_URL}/`, `${UTM}&experiment_force=${variant}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const h1 = await page.$eval('h1', (el) => el.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const storedVariant = await page.evaluate(() =>
    sessionStorage.getItem('spacebogam_homepage_headline_v1_variant'));

  // scroll_50 트리거
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  await sleep(1500);
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({ path: `${OUT}/cmp96-${label}-${viewport.width}x${viewport.height}.png` });

  // engaged_session 은 10초 체류 후
  await sleep(12000);

  // consultation_click: 상담 CTA 앵커 클릭 (이동 없이 이벤트만 관찰하려 새 탭 방지)
  const ctaHref = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href*="consultation"]'))[0];
    if (!a) return null;
    a.click();
    return a.getAttribute('href');
  });
  await sleep(3000);

  const finalUrl = page.url();
  await ctx.close();
  return { label, variant, viewport: `${viewport.width}x${viewport.height}`, url, h1, storedVariant, ctaHref, finalUrl, events, consoleMsgs, pageErrors };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const results = [];
for (const [variant, vp, label] of [
  ['A', { width: 1440, height: 900 }, 'A-desktop'],
  ['B', { width: 1440, height: 900 }, 'B-desktop'],
  ['A', { width: 390, height: 844 }, 'A-mobile'],
  ['B', { width: 390, height: 844 }, 'B-mobile'],
]) {
  const r = await runSession(browser, variant, vp, label);
  results.push(r);
  console.log(`\n=== ${label} (force=${variant}) ===`);
  console.log(`H1: ${r.h1}`);
  console.log(`stored variant: ${r.storedVariant}`);
  console.log(`CTA href: ${r.ctaHref}`);
  console.log(`final URL: ${r.finalUrl}`);
  for (const e of r.events) {
    console.log(`  ${String(e.name).padEnd(20)} HTTP ${e.status}  exp=${e.payload?.experimentId}/${e.payload?.experimentVariant}  utm_source=${e.payload?.utmSource ?? e.payload?.utm?.source ?? '-'}  ${e.responseBody ?? ''}`);
  }
  console.log(`  console errors/warnings: ${r.consoleMsgs.length}`);
  r.consoleMsgs.forEach((m) => console.log(`    ${m}`));
  console.log(`  page errors: ${r.pageErrors.length}`);
  r.pageErrors.forEach((m) => console.log(`    ${m}`));
}
await browser.close();
writeFileSync(`${OUT}/cmp96-recheck-raw.json`, JSON.stringify(results, null, 2));
console.log(`\nraw -> ${OUT}/cmp96-recheck-raw.json`);
