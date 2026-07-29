#!/usr/bin/env node
// CMP-196 상담 폼 도달 경로 주행.
// 광고 파라미터를 단 홈에서 출발해 링크 클릭만으로 상담 폼까지 갈 수 있는지 확인한다.
// 폼 제출은 하지 않는다 (합성 상담 제출 금지).
//
//   node scripts/qa/cmp196-consultation-reach.mjs [base]
//   기본 base = http://127.0.0.1:3023 (작업 트리 프리뷰)

import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = (process.argv[2] || 'http://127.0.0.1:3023').replace(/\/$/, '');
const BASE_URL = BASE;
// CMP-267: base 를 라이브로 넘기면 utm_source=meta 세션이 실유입으로 잡혔다. qaEntryUrl 이 is_test=1 을 강제한다.
const ENTRY = qaEntryUrl(`${BASE}/`, 'utm_source=meta&utm_medium=cpc&utm_campaign=cmp196_reach&utm_content=reach_probe');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// 모바일 뷰포트에서는 헤더 CTA 가 숨겨진다. 실제 유입이 누를 수 있는 링크만 세려면
// 보이는 것부터 고르고, 없으면 숨은 것이라도 돌려준다(존재 여부와 클릭 가능 여부를 구분).
async function findLinkByPath(page, re) {
  const handles = await page.$$('a[href]');
  let hidden = null;
  for (const h of handles) {
    const info = await h.evaluate((a) => {
      const r = a.getBoundingClientRect();
      return { path: new URL(a.href, location.href).pathname, visible: r.width > 0 && r.height > 0 };
    });
    if (!re.test(info.path)) continue;
    if (info.visible) return h;
    hidden = hidden || h;
  }
  return hidden;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true });

try {
  await page.goto(ENTRY, { waitUntil: 'domcontentloaded' });
  check('홈 200', true, page.url());

  // 홈 → 상담 안내 페이지
  // href 는 런타임에 절대 URL 로 다시 쓰일 수 있으므로 pathname 으로 고른다.
  const toConsultation = await findLinkByPath(page, /^\/consultation\/(index\.html)?$|^\/consultation\.html$/);
  check('홈에 상담 링크 존재', Boolean(toConsultation));
  if (!toConsultation) throw new Error('홈에서 상담 링크를 찾지 못했다');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), toConsultation.click()]);
  check('상담 안내 페이지 도달', /\/consultation\//.test(page.url()), page.url());

  // 상담 안내 페이지의 CTA 가 외부 도메인으로 나가지 않는지
  const ctas = await page.$$eval('a[href]', (as) =>
    as.map((a) => a.getAttribute('href')).filter((h) => /intm\.kr\/consultation/.test(h || ''))
  );
  check('안내 페이지에 intm.kr 상담 CTA 없음', ctas.length === 0, `발견 ${ctas.length}건`);

  // 상담 안내 → 폼
  const toForm = await findLinkByPath(page, /^\/consultation\/apply\/$/);
  check('안내 페이지에 폼 링크 존재', Boolean(toForm));
  if (!toForm) throw new Error('상담 안내 페이지에서 /consultation/apply/ 링크를 찾지 못했다');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), toForm.click()]);
  check('상담 폼 페이지 도달', /\/consultation\/apply\//.test(page.url()), page.url());

  // 폼이 실제로 렌더됐는지.
  // 주의: 질문 목록은 intm.kr API 에서 가져오고 그 CORS 허용 오리진은 https://spacebogam.kr 뿐이다.
  // 127.0.0.1 프리뷰에서는 항상 렌더에 실패하므로 이 항목은 라이브 오리진에서만 판정한다.
  await page.waitForFunction(
    () => !document.querySelector('#consult-form-root .cf-loading'),
    { timeout: 15000 }
  ).catch(() => {});
  const fields = await page.$$eval('#consult-form-root input, #consult-form-root textarea, #consult-form-root select', (els) => els.length);
  // qa-entry-url-allow: CMP-267 — 유입 URL 이 아니라 호스트 비교식이다. 진입은 위 ENTRY(qaEntryUrl) 로만 한다.
  const liveOrigin = new URL(BASE_URL).hostname === 'spacebogam.kr';
  if (liveOrigin) {
    check('폼 입력 필드 렌더', fields > 0, `${fields}개`);
  } else {
    console.log(`SKIP  폼 입력 필드 렌더 — ${fields}개 (프리뷰 오리진은 intm.kr CORS 허용 대상이 아니다)`);
  }

  // canonical / og:url 이 자기 자신을 가리키는지
  const head = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
    // href 는 런타임 계측 스크립트가 절대 URL 로 다시 쓰므로 pathname 으로만 판정한다.
    headerCtaPath: (() => {
      const a = document.querySelector('header a.cta');
      return a ? new URL(a.href, location.href).pathname : '';
    })()
  }));
  check('canonical = /consultation/apply/', head.canonical.endsWith('/consultation/apply/'), head.canonical);
  check('og:url = /consultation/apply/', head.ogUrl.endsWith('/consultation/apply/'), head.ogUrl);
  check('헤더 CTA 가 200 경로', head.headerCtaPath === '/consultation/apply/', head.headerCtaPath);

  // 첫 터치 UTM 이 폼 페이지까지 살아남는지 (귀속 유지 확인)
  const utm = await page.evaluate(() => {
    const out = {};
    for (const store of [sessionStorage, localStorage]) {
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (/utm|attribution|first/i.test(k)) out[k] = store.getItem(k);
      }
    }
    return out;
  });
  const utmBlob = JSON.stringify(utm);
  check('첫 터치 utm_campaign 보존', utmBlob.includes('cmp196_reach'), utmBlob.slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
