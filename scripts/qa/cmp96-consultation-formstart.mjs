// CMP-96: 상담 폼(intm.kr/consultation/ggbg) 까지 이어지는 전체 여정에서
// form_start 이벤트의 계약 적합성(실험 ID/변형 전달, HTTP 202)을 확인한다. 제출은 하지 않는다.
// 사용: node scripts/qa/cmp96-consultation-formstart.mjs <출력디렉터리>
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { writeFileSync } from 'node:fs';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.argv[2] || '.';
const MATCH = 'intm.kr/api/marketing/funnel-events';
const UTM = 'utm_source=qa_cmp96&utm_medium=formstart&utm_campaign=cmp96_20260728_form';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function journey(browser, variant) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const events = [];
  const consoleMsgs = [];
  page.on('request', (req) => {
    if (req.url().includes(MATCH) && req.method() === 'POST') {
      let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch { b = { __raw: req.postData() }; }
      events.push({ name: b?.eventName ?? null, keys: Object.keys(b || {}), payload: b, status: null, origin: new URL(req.frame()?.url() || page.url()).host });
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes(MATCH) && res.request().method() === 'POST') {
      const t = events.find((e) => e.status === null);
      if (t) { t.status = res.status(); try { t.body = (await res.text()).slice(0, 160); } catch {} }
    }
  });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 240)}`); });

  await page.goto(`https://spacebogam.kr/?${UTM}&experiment_force=${variant}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1000);
  // 홈 → /consultation/
  await page.evaluate(() => document.querySelector('a[href*="/consultation/"]').click());
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(1500);
  // /consultation/ → intm.kr/consultation/ggbg (site-tracking.js 가 런타임에 실험 파라미터를 붙인다)
  const outbound = await page.evaluate(() => {
    const a = document.querySelector('a[href^="https://intm.kr/consultation/ggbg"]');
    if (!a) return null;
    const href = a.getAttribute('href');
    a.click();
    return href;
  });
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(2500);
  const formUrl = page.url();

  // form_start 트리거: 첫 입력 필드에 포커스 + 타이핑 (제출 없음)
  const field = await page.$('input:not([type=hidden]), textarea');
  if (field) { await field.click(); await field.type('QA'); }
  await sleep(4000);

  await page.screenshot({ path: `${OUT}/cmp96-form-${variant}.png` });
  await ctx.close();
  return { variant, outbound, formUrl, events, consoleMsgs };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const results = [];
for (const v of ['A', 'B']) {
  const r = await journey(browser, v);
  results.push(r);
  console.log(`\n=== force=${v} ===`);
  console.log(`outbound href: ${r.outbound}`);
  console.log(`form url: ${r.formUrl}`);
  for (const e of r.events) {
    console.log(`  ${String(e.name).padEnd(20)} HTTP ${e.status}  exp=${e.payload?.experimentId}/${e.payload?.experimentVariant}  keys=${e.keys.join(',')}`);
  }
  console.log(`  console errors/warnings: ${r.consoleMsgs.length}`);
  r.consoleMsgs.forEach((m) => console.log(`    ${m}`));
}
await browser.close();
writeFileSync(`${OUT}/cmp96-formstart-raw.json`, JSON.stringify(results, null, 2));
console.log(`\nraw -> ${OUT}/cmp96-formstart-raw.json`);
