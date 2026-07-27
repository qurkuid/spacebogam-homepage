#!/usr/bin/env node
// CMP-73 홈 헤드라인 A/B 운영 런타임 QA.
// 실 배포 사이트(spacebogam.kr)를 헤드리스 크롬으로 구동해 다음을 검증한다.
//   1) 신규 세션 100개 A/B 분포 40~60
//   2) 동일 세션 새로고침 / 상담 이동 / 복귀 후 변형 고정
//   3) 1440x900, 390x844에서 H1 외 DOM/CTA/스타일 불변
//   4) page_view / engaged_session / consultation_click 페이로드의 실험 ID·변형 일치
//   5) 상담 링크에 experiment_id / experiment_variant / UTM 유지
//
// 운영 퍼널 데이터 오염을 막기 위해 ingest 요청은 가로채서 payload 만 기록하고 abort 한다.
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME = '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.CMP73_ORIGIN || 'https://spacebogam.kr';
const INGEST = 'intm.kr/api/marketing/funnel-events';
const UTM = 'utm_source=cmp73&utm_medium=qa&utm_campaign=headline_v1_runtime&utm_content=qa_probe';
const SESSION_COUNT = Number(process.env.CMP73_SESSIONS || 100);
const EXPERIMENT_ID = 'homepage_headline_v1';

const results = {};
const fail = [];
const ok = (name, pass, detail) => {
  results[name] = { pass, detail };
  if (!pass) fail.push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const newContext = () =>
  browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext();

// ingest payload 수집.
// keepalive:true fetch 는 puppeteer 의 req.postData() 로 본문을 읽을 수 없어서(빈 값 반환),
// 페이지 컨텍스트에서 window.fetch 를 감싸 본문을 직접 기록한다.
// 동시에 200 을 흉내 낸 응답을 돌려주어 운영 퍼널 오염과 재시도를 모두 막는다.
async function instrument(page, { blockAssets = false, rollbackFlag = null } = {}) {
  await page.evaluateOnNewDocument((ingest) => {
    window.__cmp73Sent = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes(ingest)) {
        try {
          window.__cmp73Sent.push(JSON.parse(init?.body || '{}'));
        } catch {
          window.__cmp73Sent.push({ parseError: String(init?.body).slice(0, 200) });
        }
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      }
      return realFetch(input, init);
    };
  }, INGEST);

  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    // 전역 롤백 플래그(단일 파일 배포)를 그대로 재현한다.
    if (rollbackFlag && url.includes('/assets/site-tracking.js')) {
      const res = await fetch(url);
      const body = (await res.text()).replace(
        /var GLOBAL_EXPERIMENT_VARIANT = '';/,
        `var GLOBAL_EXPERIMENT_VARIANT = '${rollbackFlag}';`
      );
      return req.respond({ status: 200, contentType: 'application/javascript', body });
    }
    if (blockAssets && ['image', 'font', 'media'].includes(req.resourceType())) return req.abort();
    req.continue();
  });
}

const collected = (page) => page.evaluate(() => window.__cmp73Sent || []);

const variantOf = (page) =>
  page.evaluate(() => ({
    stored: sessionStorage.getItem('spacebogam_homepage_headline_v1_variant'),
    h1: (document.querySelector('main .hero h1')?.textContent || '').replace(/\s+/g, ' ').trim(),
  }));

// ---------- 1) 신규 세션 100개 분포 ----------
{
  const counts = { A: 0, B: 0, none: 0 };
  for (let i = 0; i < SESSION_COUNT; i++) {
    const ctx = await newContext();
    const page = await ctx.newPage();
    await instrument(page, { blockAssets: true });
    try {
      await page.goto(`${ORIGIN}/?${UTM}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const v = await variantOf(page);
      counts[v.stored === 'A' || v.stored === 'B' ? v.stored : 'none']++;
    } catch (e) {
      counts.none++;
    }
    await ctx.close();
  }
  const inRange = (n) => n >= 40 && n <= 60;
  ok(
    'distribution_100_sessions',
    counts.none === 0 && inRange(counts.A) && inRange(counts.B),
    `A=${counts.A} B=${counts.B} unassigned=${counts.none} (n=${SESSION_COUNT}, 허용 40~60)`
  );
}

// ---------- 2) 세션 고정성 ----------
{
  const ctx = await newContext();
  const page = await ctx.newPage();
  await instrument(page, { blockAssets: true });
  await page.goto(`${ORIGIN}/?${UTM}`, { waitUntil: 'domcontentloaded' });
  const first = await variantOf(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await variantOf(page);

  // 상담 페이지로 이동 후 복귀
  await page.goto(`${ORIGIN}/consultation/`, { waitUntil: 'domcontentloaded' });
  const onConsult = await page.evaluate(() =>
    sessionStorage.getItem('spacebogam_homepage_headline_v1_variant')
  );

  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  const back = await variantOf(page);

  const stable =
    first.stored && first.stored === afterReload.stored && first.stored === onConsult && first.stored === back.stored;
  ok(
    'session_stickiness',
    Boolean(stable),
    `assign=${first.stored} reload=${afterReload.stored} consultation=${onConsult} back=${back.stored}`
  );
  ok(
    'headline_matches_variant',
    (first.stored === 'B') === first.h1.startsWith('부산 프리미엄 아파트'),
    `variant=${first.stored} h1="${first.h1.slice(0, 40)}"`
  );
  await ctx.close();
}

// ---------- 3) 뷰포트별 DOM/CTA/스타일 불변 ----------
async function snapshot(variant, viewport) {
  const ctx = await newContext();
  const page = await ctx.newPage();
  await instrument(page);
  await page.setViewport(viewport);
  await page.goto(`${ORIGIN}/?experiment_force=${variant}&${UTM}`, { waitUntil: 'networkidle2', timeout: 45000 });
  const snap = await page.evaluate(() => {
    const h1 = document.querySelector('main .hero h1');
    const h1Text = (h1?.textContent || '').replace(/\s+/g, ' ').trim();
    // H1 은 실험 대상이므로 비교에서 제외한다.
    if (h1) h1.innerHTML = '__H1_PLACEHOLDER__';
    const anchors = [...document.querySelectorAll('a[href]')].map((a) =>
      `${(a.textContent || '').replace(/\s+/g, ' ').trim()}|${a.getAttribute('href')}`
    );
    const styleTargets = ['main .hero', 'main .hero h1', 'main .hero a', 'header', 'footer'];
    const styles = styleTargets.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return `${sel}|missing`;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return [
        sel,
        cs.display, cs.fontSize, cs.fontWeight, cs.color, cs.backgroundColor,
        cs.padding, cs.margin, cs.textAlign,
        Math.round(r.width), Math.round(r.height),
      ].join('|');
    });
    return {
      h1Text,
      html: document.body.innerHTML,
      anchors,
      styles,
      nodeCount: document.querySelectorAll('*').length,
    };
  });
  await ctx.close();
  // 세션별로 달라지는 값(uuid, sb 파라미터, 변형 파라미터)을 정규화한다.
  const norm = (s) =>
    s
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
      .replace(/(sbClientId|sbSessionId)=[^&"'\s]*/g, '$1=X')
      .replace(/experiment_variant=[AB]/g, 'experiment_variant=X')
      // page_variant 는 실험 귀속 태그이므로 A/B가 달라야 정상이다. 디자인 불변 비교에서 제외한다.
      .replace(/page_variant=(home_a_default|home_b_visit_stage_standard)/g, 'page_variant=X');
  return {
    h1Text: snap.h1Text,
    html: norm(snap.html),
    anchors: snap.anchors.map(norm),
    styles: snap.styles,
    nodeCount: snap.nodeCount,
  };
}

for (const [label, viewport] of [
  ['desktop_1440x900', { width: 1440, height: 900 }],
  ['mobile_390x844', { width: 390, height: 844, isMobile: true, hasTouch: true }],
]) {
  const a = await snapshot('A', viewport);
  const b = await snapshot('B', viewport);
  const htmlSame = a.html === b.html;
  const anchorsSame = JSON.stringify(a.anchors) === JSON.stringify(b.anchors);
  const stylesSame = JSON.stringify(a.styles) === JSON.stringify(b.styles);
  const h1Differs = a.h1Text !== b.h1Text;
  ok(
    `dom_invariant_${label}`,
    htmlSame && anchorsSame && stylesSame && h1Differs,
    `htmlSame=${htmlSame} ctaSame=${anchorsSame}(${a.anchors.length}개) styleSame=${stylesSame} h1Differs=${h1Differs} nodes=${a.nodeCount}/${b.nodeCount}`
  );
  if (!htmlSame) {
    const i = [...a.html].findIndex((c, idx) => c !== b.html[idx]);
    console.log(`      첫 차이 @${i}: A="${a.html.slice(i - 60, i + 60)}" / B="${b.html.slice(i - 60, i + 60)}"`);
  }
  if (!stylesSame) {
    a.styles.forEach((s, i) => s !== b.styles[i] && console.log(`      style diff: A=${s} / B=${b.styles[i]}`));
  }
}

// ---------- 4) 이벤트 페이로드 실험 귀속 ----------
for (const variant of ['A', 'B']) {
  const ctx = await newContext();
  const page = await ctx.newPage();
  await instrument(page);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}/?experiment_force=${variant}&${UTM}`, { waitUntil: 'networkidle2', timeout: 45000 });

  // engaged_session(10초) 대기
  await new Promise((r) => setTimeout(r, 12000));

  // 상담 CTA 클릭 — funnel 리스너(capture) 이후에 등록해 전송 후 네비게이션만 차단한다.
  const clicked = await page.evaluate(() => {
    document.addEventListener('click', (e) => e.preventDefault(), true);
    const a = [...document.querySelectorAll('a[href]')].find((el) => {
      try {
        const u = new URL(el.getAttribute('href'), location.href);
        return /consultation|상담/.test(u.pathname) || /intm\.kr/.test(u.hostname);
      } catch {
        return false;
      }
    });
    if (!a) return null;
    a.click();
    return a.getAttribute('href');
  });
  await new Promise((r) => setTimeout(r, 1500));

  const sent = await collected(page);
  const byName = (n) => sent.filter((e) => e.eventName === n);
  const wanted = ['page_view', 'engaged_session', 'consultation_click'];
  const missing = wanted.filter((n) => byName(n).length === 0);
  const mismatched = sent
    .filter((e) => wanted.includes(e.eventName))
    .filter((e) => e.experimentId !== EXPERIMENT_ID || e.experimentVariant !== variant)
    .map((e) => `${e.eventName}:${e.experimentId}/${e.experimentVariant}`);

  ok(
    `events_experiment_attribution_${variant}`,
    missing.length === 0 && mismatched.length === 0,
    `수집=${sent.map((e) => e.eventName).join(',')} 누락=[${missing}] 불일치=[${mismatched}]`
  );

  // 빈 배열에 .every() 를 걸면 무조건 통과하므로 표본 존재를 먼저 요구한다.
  const pv = byName('page_view');
  const utmOk =
    pv.length > 0 &&
    pv.every((e) => e.utmSource === 'cmp73' && e.utmMedium === 'qa' && e.utmCampaign === 'headline_v1_runtime');
  ok(
    `utm_preserved_${variant}`,
    utmOk,
    `page_view n=${pv.length} utm=${JSON.stringify(pv.map((e) => `${e.utmSource}/${e.utmMedium}/${e.utmCampaign}`))}`
  );

  const href = clicked || '';
  const linkOk =
    href.includes(`experiment_id=${EXPERIMENT_ID}`) &&
    href.includes(`experiment_variant=${variant}`) &&
    href.includes('utm_source=cmp73');
  ok(`consultation_link_params_${variant}`, linkOk, `href=${href.slice(0, 160)}`);

  // consultation_submit 은 CMP-98 이후 클라이언트에서 발생하지 않는다(의도된 설계).
  ok(
    `no_client_consultation_submit_${variant}`,
    byName('consultation_submit').length === 0,
    'CMP-98 가드 유지 — 제출 이벤트는 intm.kr 서버측 소관'
  );
  await ctx.close();
}

// ---------- 5) 전역 단일 롤백 (assets/site-tracking.js 한 파일 배포) ----------
{
  // GLOBAL_EXPERIMENT_VARIANT='A' 를 주입해 "한 파일 되돌리기" 배포를 그대로 재현한다.
  // localStorage 강제 키는 테스터 브라우저에만 적용되므로 전역 롤백 근거가 될 수 없다.
  const rolled = [];
  for (let i = 0; i < 20; i++) {
    const ctx = await newContext();
    const page = await ctx.newPage();
    await instrument(page, { blockAssets: true, rollbackFlag: 'A' });
    await page.goto(`${ORIGIN}/?${UTM}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    rolled.push(await variantOf(page));
    await ctx.close();
  }
  const allA = rolled.every((r) => r.stored === 'A' && !r.h1.startsWith('부산 프리미엄 아파트'));
  ok(
    'global_rollback_forces_A_100pct',
    allA,
    `신규 세션 ${rolled.length}개 variant=${[...new Set(rolled.map((r) => r.stored))].join(',')} (전역 플래그 주입)`
  );
}

await browser.close();
console.log(`\n=== CMP-73 런타임 QA: ${fail.length === 0 ? '전체 PASS' : `FAIL ${fail.length}건 → ${fail.join(', ')}`} ===`);
process.exit(fail.length === 0 ? 0 : 1);
