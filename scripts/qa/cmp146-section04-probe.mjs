#!/usr/bin/env node
/**
 * CMP-146 진단용 — 상담 폼 카테고리 04 에서 진행이 멈추는 원인 확인.
 * 폼 페이지로 바로 들어가 각 섹션을 채우고, 다음 카테고리 클릭 후 남는
 * `필수 항목입니다.` 오류를 질문 단위로 덤프한다. 제출은 하지 않는다.
 */
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME =
  '/Users/baegchangseog/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  let real;
  let wrapped;
  Object.defineProperty(window, 'daum', {
    configurable: true,
    get() {
      if (!real) return real;
      return new Proxy(real, {
        get(target, prop, receiver) {
          if (prop !== 'Postcode') return Reflect.get(target, prop, receiver);
          const Orig = Reflect.get(target, prop, receiver);
          if (typeof Orig !== 'function') return Orig;
          if (!wrapped || wrapped.__orig !== Orig) {
            const Wrapper = function (options) {
              window.__qaPostcodeComplete = options && options.oncomplete;
              return new Orig(options);
            };
            Wrapper.__orig = Orig;
            Wrapper.prototype = Orig.prototype;
            wrapped = Wrapper;
          }
          return wrapped;
        },
      });
    },
    set(value) { real = value; },
  });
});
await page.goto('https://intm.kr/consultation/ggbg', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#consultation-form', { timeout: 30000 });

for (let round = 1; round <= 8; round += 1) {
  const dump = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const form = document.querySelector('#consultation-form');
    const section = document.querySelector('[data-consultation-section]') || form;
    const blocks = [...section.querySelectorAll('div')].filter(
      (d) => /필수/.test(d.textContent || '') && d.querySelectorAll('div').length < 6
    );
    return {
      category: (form.innerText.match(/CATEGORY (0\d) \/ 06\n([^\n]+)/) || []).slice(1).join(' '),
      progress: (form.innerText.match(/필수 (\d+)\/(\d+)/) || []).slice(1).join('/'),
      // 섹션 안에서 보이는 컨트롤을 타입까지 함께 나열한다.
      controls: [...section.querySelectorAll('input,select,textarea')]
        .filter(vis)
        .map((e) => `${e.id || e.name || e.tagName}:${(e.type || e.tagName).toLowerCase()}:${
          e.type === 'checkbox' || e.type === 'radio' ? e.checked : JSON.stringify((e.value || '').slice(0, 24))
        }`),
      errors: [...section.querySelectorAll('*')]
        .filter((e) => e.children.length === 0 && /필수 항목입니다/.test(e.textContent || ''))
        .map((e) => {
          const block = e.closest('[data-question-id]') || e.parentElement?.parentElement;
          return (block?.innerText || '').replace(/\s+/g, ' ').slice(0, 90);
        }),
      blockCount: blocks.length,
    };
  });
  console.log(`\n[round ${round}] ${dump.category} | 필수 ${dump.progress}`);
  console.log(`  controls: ${dump.controls.join('  ')}`);
  if (dump.errors.length) console.log(`  ERRORS: ${JSON.stringify(dump.errors, null, 1)}`);

  // 이 섹션의 모든 컨트롤을 채운다(주소 제외 — 진단 목적상 04 도달이 핵심).
  await page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const setNative = (el, value) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const section = document.querySelector('[data-consultation-section]') || document;
    const seen = new Set();
    section.querySelectorAll('input,select,textarea').forEach((el) => {
      if (!vis(el) || el.readOnly) return;
      const t = (el.type || el.tagName).toLowerCase();
      if (t === 'radio' || t === 'checkbox') {
        const key = el.name || el.closest('[data-question-id]')?.dataset.questionId || el.id.replace(/_option_\d+$/, '');
        if (seen.has(key)) return;
        seen.add(key);
        if (!el.checked) el.click();
      } else if (el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.value);
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
      } else if (t === 'date') setNative(el, '2026-08-31');
      else if (t === 'number') setNative(el, '34');
      else if (t === 'tel') setNative(el, '01000000000');
      else if (t === 'text' || el.tagName === 'TEXTAREA') setNative(el, '[QA] 진단');
    });
  });
  await sleep(900);

  // 주소 필드가 비어 있으면 우편번호 위젯 oncomplete 훅으로 채운다.
  const needsAddress = await page.evaluate(() => {
    const a = document.querySelector('#question_15');
    return !!(a && (a.offsetParent || a.getClientRects().length) && !a.value);
  });
  if (needsAddress) {
    await page.evaluate(() =>
      [...document.querySelectorAll('#consultation-form button')].find((b) => /검색/.test(b.textContent))?.click()
    );
    await page.waitForFunction(() => typeof window.__qaPostcodeComplete === 'function', { timeout: 20000 });
    await page.evaluate(() =>
      window.__qaPostcodeComplete({ address: '부산광역시 연제구 중앙대로 1001', buildingName: '[QA] 부산광역시청' })
    );
    await sleep(1000);
  }

  const moved = await page.evaluate(() => {
    const before = (document.querySelector('#consultation-form').innerText.match(/CATEGORY (0\d)/) || [])[1];
    const btn = [...document.querySelectorAll('#consultation-form button')].find(
      (b) => /다음 카테고리/.test(b.textContent) && !b.disabled
    );
    if (!btn) return 'NO_BUTTON';
    btn.click();
    return before;
  });
  await sleep(1200);
  const after = await page.evaluate(
    () => (document.querySelector('#consultation-form').innerText.match(/CATEGORY (0\d)/) || [])[1]
  );
  console.log(`  next: ${moved} -> ${after}`);
  if (moved === 'NO_BUTTON' || (moved === after && round > 1)) {
    const stuck = await page.evaluate(() => {
      const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
      const section = document.querySelector('[data-consultation-section]') || document;
      return {
        text: section.innerText.replace(/\n{2,}/g, '\n').slice(0, 900),
        controls: [...section.querySelectorAll('input,select,textarea')].map(
          (e) => `${e.id}:${(e.type || e.tagName).toLowerCase()}:${
            e.type === 'checkbox' || e.type === 'radio' ? e.checked : JSON.stringify(e.value)
          }:vis=${vis(e)}`
        ),
      };
    });
    console.log(`\n=== 정지 상태 ===\n${stuck.text}\n--- controls ---\n${stuck.controls.join('\n')}`);
    break;
  }
}

await browser.close();
