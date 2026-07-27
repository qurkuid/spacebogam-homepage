#!/usr/bin/env node
/**
 * CMP-137 — CMP-98 정상 저장 회귀 검증용 실제 브라우저 제출 플로우.
 *
 * 홈 노출 → 상담 CTA 클릭 → 카테고리별 폼 진행 → 제출 까지를 한 세션에서 수행하고,
 * 완료 조건 판정에 필요한 세션 ID / 변형 / 네트워크 기록을 남긴다.
 *
 * 사용:
 *   VARIANT=A DRY_RUN=1 node scripts/qa/cmp137-consultation-submit-flow.mjs
 *   VARIANT=A            node scripts/qa/cmp137-consultation-submit-flow.mjs   # 실제 저장
 *
 * DRY_RUN=1 이면 폼을 끝까지 채우되 제출 버튼을 누르지 않는다.
 * 픽스처는 전부 `[QA]` 접두어 비식별 값이며 연락처는 도달 불가 더미다(CMP-139 승인 범위).
 */
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME =
  '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const VARIANT = (process.env.VARIANT || 'A').toUpperCase();
const DRY_RUN = process.env.DRY_RUN === '1';
const HOME = `https://spacebogam.kr/?experiment_force=${VARIANT}`;

const FIXTURE = {
  name: `[QA]테스트${VARIANT}`,
  tel: '01000000000',
  text: `[QA] CMP-137 회귀검증`,
  textarea: `[QA] CMP-137 회귀 검증용 테스트 저장입니다. 실제 상담 아님.`,
  date: '2026-08-31',
  number: '34',
  // 공공건물 주소만 사용한다 — 개인 주소를 운영 DB에 남기지 않기 위함.
  address: '부산광역시청',
};

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

// 퍼널 ingest 와 상담 저장 요청을 모두 기록한다.
const netlog = [];
page.on('response', async (res) => {
  const url = res.url();
  if (/funnel-events|consultation|api\//.test(url) && res.request().method() !== 'GET') {
    let body = '';
    try {
      body = (await res.text()).slice(0, 300);
    } catch {}
    netlog.push({ method: res.request().method(), url, status: res.status(), body });
    log(`  [net] ${res.request().method()} ${res.status()} ${url}`);
  }
});

// ---- 1. 홈 노출: 세션 ID / 변형 확정 -------------------------------------
log(`\n=== [1] 홈 진입 (variant=${VARIANT}) ===`);
await page.goto(HOME, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1500);

const session = await page.evaluate(() => ({
  sessionId: sessionStorage.getItem('spacebogam_funnel_session_id'),
  variant: sessionStorage.getItem('spacebogam_homepage_headline_v1_variant'),
}));
log(`  sessionId = ${session.sessionId}`);
log(`  variant   = ${session.variant}`);
if (session.variant !== VARIANT) {
  log(`  !! 변형 불일치: 기대 ${VARIANT}, 실제 ${session.variant}`);
}

// engaged_session (10초) 발생을 위해 체류
log('  10초 이상 체류 중...');
await sleep(11000);

// ---- 2. 상담 CTA 클릭 ----------------------------------------------------
log(`\n=== [2] 상담 CTA 클릭 ===`);
const ctaHref = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href]')].find((x) =>
    /consultation/.test(x.getAttribute('href') || '')
  );
  return a ? a.href : null;
});
log(`  CTA href = ${ctaHref}`);

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
  page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href]')].find((x) =>
      /consultation/.test(x.getAttribute('href') || '')
    );
    a.click();
  }),
]);
let landedUrl = page.url();
log(`  도착 URL = ${landedUrl}`);

// 홈 CTA 는 안내 페이지(spacebogam.kr/consultation/)로 가고,
// 실제 상담 폼은 거기서 한 번 더 intm.kr/consultation/ggbg 로 넘어간다.
if (!/intm\.kr\/consultation\/ggbg/.test(landedUrl)) {
  log('  안내 페이지 감지 → "상담 신청서 작성" 링크로 폼 페이지 이동');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href]')].find((x) =>
        /intm\.kr\/consultation\/ggbg/.test(x.href)
      );
      a.click();
    }),
  ]);
  landedUrl = page.url();
  log(`  폼 페이지 URL = ${landedUrl}`);
}
await page.waitForSelector('#consultation-form', { timeout: 30000 });
const q = new URL(landedUrl).searchParams;
const carried = {
  sbSessionId: q.get('sbSessionId'),
  experiment_id: q.get('experiment_id'),
  experiment_variant: q.get('experiment_variant'),
};
log(`  전달된 파라미터 = ${JSON.stringify(carried)}`);

// ---- 3. 카테고리별 폼 채우기 --------------------------------------------
log(`\n=== [3] 폼 진행 ===`);
const filled = [];
for (let round = 1; round <= 20; round += 1) {
  const step = await page.evaluate((fx) => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const form = document.querySelector('#consultation-form');
    const heading = (form.innerText.match(/CATEGORY (0\d) \/ 06\n([^\n]+)/) || []);
    const setNative = (el, value) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const done = [];
    const groups = new Set();
    form.querySelectorAll('[id^="question_"]').forEach((el) => {
      if (!vis(el)) return;
      const t = (el.type || '').toLowerCase();
      if (el.tagName === 'TEXTAREA') {
        setNative(el, fx.textarea);
        done.push(`${el.id}=textarea`);
      } else if (el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.value);
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          done.push(`${el.id}=select:${opt.text.slice(0, 20)}`);
        }
      } else if (t === 'radio' || t === 'checkbox') {
        const key = el.name || el.id;
        if (groups.has(key)) return;
        groups.add(key);
        if (!el.checked) el.click();
        done.push(`${el.id}=${t}`);
      } else if (t === 'tel') {
        setNative(el, fx.tel);
        done.push(`${el.id}=tel`);
      } else if (t === 'date') {
        setNative(el, fx.date);
        done.push(`${el.id}=date`);
      } else if (t === 'number') {
        setNative(el, fx.number);
        done.push(`${el.id}=number`);
      } else if (t === 'text') {
        const isName = /성함|이름/.test(form.innerText.slice(0, 4000)) && el.id === 'question_13';
        setNative(el, isName ? fx.name : fx.text);
        done.push(`${el.id}=text`);
      }
    });
    // 라디오/체크박스가 question_ id 없이 렌더되는 경우 보완
    return {
      category: heading[1] || '?',
      title: heading[2] || '?',
      filled: done,
      progress: (form.innerText.match(/필수 (\d+)\/(\d+)/) || []).slice(1).join('/'),
    };
  }, FIXTURE);

  // 주소 필드는 readonly 이고 Daum 우편번호 iframe 으로만 채워진다.
  const needsAddress = await page.evaluate(() => {
    const a = document.querySelector('#question_15');
    return !!(a && (a.offsetParent || a.getClientRects().length) && a.readOnly && !a.value);
  });
  if (needsAddress) {
    log('  주소 위젯 감지 → 우편번호 검색으로 공개 주소 선택');
    await page.evaluate(() =>
      [...document.querySelectorAll('#consultation-form button')]
        .find((b) => /검색/.test(b.textContent))
        .click()
    );
    await sleep(3000);
    const frame = page
      .frames()
      .find((f) => /daum|postcode/i.test(f.url()));
    if (frame) {
      // 보이는 검색 입력창에 질의를 넣고 .btn_search 로 조회한다.
      await frame.waitForSelector('.btn_search', { timeout: 15000 });
      await frame.evaluate((query) => {
        const input = [...document.querySelectorAll('input')].find(
          (e) => e.type !== 'hidden' && (e.offsetParent || e.getClientRects().length)
        );
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
          ).set;
          setter.call(input, query);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        document.querySelector('.btn_search')?.click();
      }, FIXTURE.address);
      await sleep(3000);
      // 첫 번째 검색 결과(도로명 주소) 선택
      const picked = await frame.evaluate(() => {
        const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
        const link = [...document.querySelectorAll('a')].find(
          (a) => vis(a) && /[시도].*[구군시].*\d/.test(a.textContent || '')
        );
        if (link) {
          link.click();
          return (link.textContent || '').trim().slice(0, 60);
        }
        return null;
      });
      log(`  검색 결과 선택 = ${picked || '(없음)'}`);
      await sleep(2500);
    } else {
      log('  !! 우편번호 iframe 을 찾지 못함');
    }
    const addrVal = await page.evaluate(() => document.querySelector('#question_15')?.value || '');
    log(`  주소 입력 결과 = "${addrVal}"`);
    continue; // 같은 카테고리를 다시 돌며 나머지 필드를 채운다
  }

  log(`  [round ${round}] CATEGORY ${step.category} ${step.title} — 채움: ${step.filled.join(', ') || '(없음)'} | 필수진행 ${step.progress}`);
  filled.push(step);
  await sleep(500);

  const advanced = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const btn = [...document.querySelectorAll('#consultation-form button')].find(
      (b) => /다음 카테고리/.test(b.textContent) && vis(b) && !b.disabled
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  await sleep(1200);
  if (!advanced) {
    log('  다음 카테고리 버튼 없음 → 마지막 단계로 판단');
    break;
  }
  const cur = await page.evaluate(
    () => (document.querySelector('#consultation-form').innerText.match(/CATEGORY (0\d)/) || [])[1]
  );
  if (cur === '06') {
    // 마지막 카테고리도 채운다
    const last = await page.evaluate(() => 1);
    void last;
  }
}

// 개인정보 동의
await page.evaluate(() => {
  const c = document.querySelector('#privacy_agreement');
  if (c && !c.checked) c.click();
});
const readiness = await page.evaluate(() => {
  const form = document.querySelector('#consultation-form');
  return {
    required: (form.innerText.match(/필수 (\d+)\/(\d+)/) || []).slice(1).join('/'),
    privacy: !!document.querySelector('#privacy_agreement')?.checked,
    submitDisabled: !![...form.querySelectorAll('button')].find((b) => b.type === 'submit')?.disabled,
  };
});
log(`\n=== [4] 제출 직전 상태 === ${JSON.stringify(readiness)}`);

// ---- 5. 제출 ------------------------------------------------------------
let submitResult = 'SKIPPED (DRY_RUN)';
if (DRY_RUN) {
  log('\n=== [5] DRY_RUN — 제출하지 않고 종료 ===');
} else {
  log('\n=== [5] 제출 실행 ===');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#consultation-form button')].find(
      (x) => x.type === 'submit'
    );
    b.click();
  });
  await sleep(8000);
  submitResult = await page.evaluate(() => document.body.innerText.slice(0, 400));
  log(`  제출 후 화면(앞 400자):\n${submitResult}`);
  log(`  제출 후 URL = ${page.url ? '' : ''}`);
}

log(`\n=== 요약 ===`);
log(
  JSON.stringify(
    {
      variant: VARIANT,
      dryRun: DRY_RUN,
      sessionId: session.sessionId,
      storedVariant: session.variant,
      landedUrl,
      carried,
      readiness,
      netlog,
    },
    null,
    1
  )
);

await browser.close();
