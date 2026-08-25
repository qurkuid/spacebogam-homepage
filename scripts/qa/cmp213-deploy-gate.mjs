#!/usr/bin/env node
// CMP-213 배포 게이트 — "로컬에서 검증했다는 산문"이 아니라 숫자 기준으로 PASS/FAIL을 낸다.
//
// 왜: CMP-213 배포 승인 요청이 "자동화 기준 설계 전 배포 보류"로 반려됐다. 반려 전까지는
// 배포 승인 요청 자체가 "배포 후에만 검증 가능한 수치(모바일 LCP)를 배포 전에 믿어달라"는
// 요청이었다. 이 스크립트는 배포 직후 실제 라이브를 실측해 수용 기준을 기계적으로 판정하고,
// bin/deploy-and-verify.sh 가 FAIL 시 자동 롤백을 걸 수 있게 exit code 로 결과를 낸다.
//
// 측정 항목 (CMP-213 수용 기준과 1:1 대응):
//   1. 모바일 LCP < 4000ms (slow-4G 근사, CMP-208 프로브와 동일 네트워크 조건)
//   2. GA4 page_view 히트 발생 (지연 태그 주입이 계측을 죽이지 않았는지)
//   3. 퍼널 ingest(/api/marketing/funnel-events) 가 2xx 로 나감 (동일 이유)
//   4. CTA 클릭 -> 폼 렌더 홉 <= 2
//
// is_test=1 을 강제해 실유입 지표를 오염시키지 않는다(scripts/qa/lib/qa-entry-url.mjs, CMP-267 규약).
// 퍼널 POST 는 cmp208 프로브와 달리 막지 않는다 — 계측이 실제로 나가는지가 이 게이트의 목적이다.
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';

const ORIGIN = process.argv.find((a) => a.startsWith('--origin='))?.slice('--origin='.length) || 'https://spacebogam.kr';
const OUT_JSON = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length) || null;
const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const HOME = qaEntryUrl(ORIGIN + '/', 'utm_source=meta&utm_medium=paid_social&utm_campaign=cmp213_deploy_gate');
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const THRESHOLDS = { lcpMs: 4000, maxHops: 2 };

function nowIso(){ return new Date().toISOString(); }

async function run(){
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setUserAgent(UA_MOBILE);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCache');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8,
  });
  await page.evaluateOnNewDocument(() => {
    window.__lcp = 0;
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime); })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (error) { /* 미지원 브라우저는 0 으로 둔다 */ }
  });

  const net = { ga4Hit: false, funnelIngest: null };
  await page.setRequestInterception(true);
  page.on('request', (request) => { try { request.continue(); } catch (error) { /* 이미 처리된 요청 */ } });
  page.on('response', (response) => {
    const url = response.url();
    if (/analytics\.google\.com\/g\/collect/.test(url) && /(?:^|[?&])en=page_view/.test(url)) net.ga4Hit = true;
    if (/\/api\/marketing\/funnel-events/.test(url)) net.funnelIngest = response.status();
  });

  const t0 = Date.now();
  await page.goto(HOME, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000)); // 지연 태그(load+1.5s)가 뜰 시간을 준다
  const lcp = await page.evaluate(() => Math.round(window.__lcp || 0));
  const loadMs = Date.now() - t0;

  const cta = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href]')).find((x) => /consultation/.test(x.href));
    return a ? a.href : null;
  });

  let hops = 0;
  let formRendered = false;
  if (cta) {
    hops = 1;
    await page.goto(cta, { waitUntil: 'load', timeout: 60000 });
    for (let hop = 0; hop < 2 && !formRendered; hop += 1) {
      try {
        await page.waitForFunction(() => document.querySelectorAll('input, select, textarea').length >= 2, { timeout: 8000 });
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
      hops += 1;
      if (next !== 'clicked') await page.goto(next, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    }
  }
  await new Promise((r) => setTimeout(r, 1000)); // 퍼널 ingest 응답 도착 대기

  await browser.close();

  const checks = [
    { name: 'mobile_lcp_ms', value: lcp, pass: lcp > 0 && lcp < THRESHOLDS.lcpMs, detail: `< ${THRESHOLDS.lcpMs}ms 기준, 실측 ${lcp}ms` },
    { name: 'ga4_page_view_hit', value: net.ga4Hit, pass: net.ga4Hit === true, detail: '지연 태그 주입 후 GA4 page_view 히트 발생 여부' },
    { name: 'funnel_ingest_2xx', value: net.funnelIngest, pass: typeof net.funnelIngest === 'number' && net.funnelIngest >= 200 && net.funnelIngest < 300, detail: `/api/marketing/funnel-events 응답 코드 (null=요청 자체가 안 나감)` },
    { name: 'cta_to_form_hops', value: hops, pass: cta !== null && formRendered && hops <= THRESHOLDS.maxHops, detail: `<= ${THRESHOLDS.maxHops}홉 기준, 실측 ${hops}홉 (CTA 없으면 자동 FAIL)` },
  ];

  const allPass = checks.every((c) => c.pass);
  const result = { at: nowIso(), origin: ORIGIN, loadMs, verdict: allPass ? 'PASS' : 'FAIL', checks };

  console.log(`\nCMP-213 배포 게이트 — ${result.verdict}\n`);
  for (const c of checks) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name} = ${JSON.stringify(c.value)}  (${c.detail})`);
  }
  console.log('');

  if (OUT_JSON) {
    const fs = await import('node:fs');
    fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
    console.log(`결과 저장: ${OUT_JSON}`);
  }

  process.exit(allPass ? 0 : 1);
}

run().catch((error) => {
  console.error('[CMP-213 deploy gate] 실행 실패:', error);
  process.exit(2);
});
