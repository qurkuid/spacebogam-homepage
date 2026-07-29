// CMP-96/CMP-144: 상담 폼까지 이어지는 전체 여정에서 form_start 이벤트의 계약 적합성
// (실험 ID/변형 계승, HTTP 202)을 확인한다. 제출은 하지 않는다.
//
// CMP-249 (2026-07-29): 여정 경로 갱신. CMP-173 으로 상담 폼이
//   intm.kr/consultation/ggbg  ->  spacebogam.kr/consultation/apply/  로 이동했다.
// 이전 판(구 URL 하드코딩 + origin=intm.kr 필터)은 새 경로의 이벤트를 구조적으로 보지 못해
// 실험 귀속이 정상인데도 항상 FAIL 을 뱉었다. 판정은 host 가 아니라 pathname 으로 한다.
// 사용: node scripts/qa/cmp96-consultation-formstart.mjs <출력디렉터리>
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { writeFileSync } from 'node:fs';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.argv[2] || '.';
// 폼이 spacebogam.kr 로 옮겨간 뒤에도 수집 엔드포인트는 intm.kr 그대로다(교차 출처 POST).
const MATCH = 'intm.kr/api/marketing/funnel-events';
const FORM_PATH = '/consultation/apply';
const UTM = 'utm_source=qa_cmp249&utm_medium=formstart&utm_campaign=cmp249_formstart_recheck';
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
      const frameUrl = new URL(req.frame()?.url() || page.url());
      events.push({ id: b?.eventId ?? null, name: b?.eventName ?? null, keys: Object.keys(b || {}), payload: b, status: null, origin: frameUrl.host, path: frameUrl.pathname });
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes(MATCH) && res.request().method() === 'POST') {
      // eventId 로 요청·응답을 짝짓는다. 예전처럼 "첫 미결 이벤트"로 짝지으면 동시 전송 시
      // 짝이 어긋나 정상 202 가 HTTP null 로 보이고, 이는 미전송으로 오독된다.
      let id = null; try { id = JSON.parse(res.request().postData() || 'null')?.eventId ?? null; } catch {}
      const t = events.find((e) => (id ? e.id === id : e.status === null));
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
  // /consultation/ → /consultation/apply/ (site-tracking.js 가 런타임에 실험 파라미터를 붙인다)
  const outbound = await page.evaluate((formPath) => {
    const a = [...document.querySelectorAll('a[href]')].find((el) =>
      new URL(el.getAttribute('href'), location.href).pathname.startsWith(formPath),
    );
    if (!a) return null;
    const href = a.getAttribute('href');
    a.click();
    return href;
  }, FORM_PATH);
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
    console.log(`  ${String(e.name).padEnd(20)} HTTP ${e.status}  ${String(e.origin + e.path).padEnd(34)} exp=${e.payload?.experimentId}/${e.payload?.experimentVariant} page=${JSON.stringify(e.payload?.pageVariant)}  keys=${e.keys.join(',')}`);
  }
  console.log(`  console errors/warnings: ${r.consoleMsgs.length}`);
  r.consoleMsgs.forEach((m) => console.log(`    ${m}`));

  // CMP-144 재검증 판정 (산출물 4). 홈 세션의 실험 3필드가 상담 폼까지 그대로 계승되어야 한다.
  const triple = (e) => [e?.payload?.experimentId, e?.payload?.experimentVariant, e?.payload?.pageVariant];
  const home = r.events.find((e) => e.path === '/');
  const formEvents = r.events.filter(
    (e) => e.path?.startsWith(FORM_PATH) && ['lead_form_view', 'lead_form_start'].includes(e.name),
  );
  const expected = triple(home);
  console.log(`  -- 판정 (기대=홈 ${JSON.stringify(expected)}) --`);
  // 여정 자체가 끊긴 경우와 귀속 결함을 구분한다. 이 구분이 없어 CMP-249 오판이 났다.
  if (!r.outbound || !r.formUrl.includes(FORM_PATH)) {
    console.log(`    BLOCKED: 상담 폼(${FORM_PATH}) 에 도달하지 못했습니다 — 여정 경로가 또 바뀌었을 수 있습니다.`);
    console.log('    이것은 실험 귀속 결함이 아닙니다. 먼저 현재 상담 여정을 확인하고 이 스크립트를 갱신하십시오.');
  } else if (!home) console.log('    FAIL: 홈 기준 이벤트 없음 — 판정 불가');
  else if (expected.some((v) => !v)) console.log(`    FAIL: 홈 기준값 자체가 비어 있음 ${JSON.stringify(expected)}`);
  else if (formEvents.length === 0) console.log('    FAIL: lead_form_view/lead_form_start 미발생 — 판정 불가');
  for (const e of formEvents) {
    const got = triple(e);
    const match = JSON.stringify(got) === JSON.stringify(expected);
    console.log(`    ${match ? 'PASS' : 'FAIL'} ${e.name}: ${JSON.stringify(got)}${match ? '' : ` != ${JSON.stringify(expected)}`}`);
  }
}
await browser.close();
writeFileSync(`${OUT}/cmp96-formstart-raw.json`, JSON.stringify(results, null, 2));
console.log(`\nraw -> ${OUT}/cmp96-formstart-raw.json`);
