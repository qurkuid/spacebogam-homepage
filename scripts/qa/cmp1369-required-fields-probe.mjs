#!/usr/bin/env node
// CMP-1369 — 상담 신청서 필수 항목 11 → 4 축소 검증.
//
// 작업 트리를 로컬 정적 서버로 띄우고 헤드리스 크롬으로 /consultation/apply/ 를 연다.
//   (1) 질문 28개가 그대로 렌더되는가 (질문을 지운 게 아니라 필수 표시만 뺐는가)
//   (2) '상담에 꼭 필요한 정보' 그룹에 정확히 4개(성함·연락처·주소·평형)만 있는가
//   (3) 그 4개만 채우고 제출했을 때 필수 누락 오류 없이 제출까지 가는가
//   (4) 나머지 24개는 접힘 영역에 남아 있는가
//
// 운영 오염 방지: 상담 제출 POST 와 퍼널 ingest POST 는 페이지 안에서 fetch 를 감싸
// 가로채고 실제로 intm.kr 에 보내지 않는다. 요청 인터셉션은 postData 를 비우는 전례가
// 있어 쓰지 않는다.
//
// 질문 조회 GET 은 로컬 오리진에서 CORS 로 막힌다(intm 은 https://spacebogam.kr 만 허용).
// 그래서 node 가 먼저 **실제 production 질문 정의**를 받아두고 페이지에는 그 바이트를
// 그대로 돌려준다. 검증 대상은 서버 응답이 아니라 그 응답을 받은 클라이언트 로직이다.
import { spawn } from 'node:child_process';
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = process.env.QA_ROOT || '/Users/baegchangseog/spacebogam-homepage';
const PORT = parseInt(process.env.QA_PORT || '3099', 10);
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn('node', ['/Volumes/DATABASE/spacebogam/serve.js', ROOT, String(PORT)], {stdio: 'inherit'});
await new Promise(r => setTimeout(r, 800));

const fail = [];
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail.push(label);
}

const questionsJson = await fetch('https://intm.kr/api/consultation/questions').then(r => r.text());
console.log(`production 질문 정의 ${JSON.parse(questionsJson).questions.length}개 확보`);

const browser = await puppeteer.launch({executablePath: CHROME, headless: 'new', args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 390, height: 844, isMobile: true, hasTouch: true});
  await page.evaluateOnNewDocument((questionsJson) => {
    window.__captured = [];
    const orig = window.fetch;
    window.fetch = function(input, init){
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/api\/consultation\/questions/.test(url)) {
        return Promise.resolve(new Response(questionsJson, {
          status: 200, headers: {'Content-Type': 'application/json'}
        }));
      }
      if (/\/api\/consultation\/submit|\/api\/marketing\/funnel-events/.test(url)) {
        window.__captured.push({url, body: (init && init.body) || null});
        return Promise.resolve(new Response(JSON.stringify({success: true, id: 0}), {
          status: 200, headers: {'Content-Type': 'application/json'}
        }));
      }
      return orig.apply(this, arguments);
    };
    // sendBeacon 도 같은 경로로 샌다.
    if (navigator.sendBeacon) {
      navigator.sendBeacon = function(url, data){ window.__captured.push({url, body: 'beacon'}); return true; };
    }
  }, questionsJson);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto(`${BASE}/consultation/apply/`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.cf-field', {timeout: 20000});

  const shape = await page.evaluate(() => {
    const text = el => (el ? el.textContent.trim() : '');
    const groups = Array.from(document.querySelectorAll('.cf-group'));
    const primary = groups.find(g => g.tagName !== 'DETAILS');
    const optional = document.querySelector('details.cf-optional');
    return {
      total: document.querySelectorAll('.cf-field').length,
      primaryLabels: Array.from(primary ? primary.querySelectorAll('.cf-label') : []).map(text),
      optionalCount: optional ? optional.querySelectorAll('.cf-field').length : 0,
      optionalOpen: optional ? optional.open : null,
      starCount: document.querySelectorAll('.cf-required').length,
      optionalSummary: text(optional && optional.querySelector('summary'))
    };
  });

  check('질문 28개 전부 렌더', shape.total === 28, `실제 ${shape.total}개`);
  check('필수 표시(*) 4개', shape.starCount === 4, `실제 ${shape.starCount}개`);
  check('필수 그룹 = 성함·연락처·주소·평형', shape.primaryLabels.length === 4 &&
    /성함/.test(shape.primaryLabels[0]) && /연락처/.test(shape.primaryLabels[1]) &&
    /주소/.test(shape.primaryLabels[2]) && !/세부/.test(shape.primaryLabels[2]) &&
    /평형/.test(shape.primaryLabels[3]), JSON.stringify(shape.primaryLabels));
  check('나머지 24개는 선택 영역에 남음', shape.optionalCount === 24 && shape.optionalOpen === false,
    `${shape.optionalCount}개, open=${shape.optionalOpen}`);

  // 필수 4개만 채우고 제출
  const filled = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('.cf-group'));
    const primary = groups.find(g => g.tagName !== 'DETAILS');
    const values = ['[QA] CMP-1369 필수축소검증', '010-0000-0000', '부산 북구 화명동 QA아파트', '34'];
    const inputs = Array.from(primary.querySelectorAll('input, select, textarea'));
    inputs.forEach((el, i) => {
      el.value = values[i];
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
    });
    document.getElementById('cf-consent-input').click();
    return inputs.map(el => el.name + '=' + el.value);
  });
  console.log('  채운 값:', filled.join(' | '));

  await page.click('.cf-submit');
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => ({
    status: (document.querySelector('.cf-status') || {}).textContent || '',
    fieldErrors: Array.from(document.querySelectorAll('.cf-field-error')).map(e => e.textContent),
    invalid: document.querySelectorAll('[aria-invalid="true"]').length,
    captured: window.__captured,
    success: !!document.querySelector('.cf-success, .cf-help')
  }));

  check('필수 누락 오류 없음', result.fieldErrors.length === 0 && result.invalid === 0,
    JSON.stringify(result.fieldErrors) + ` invalid=${result.invalid}`);

  const submit = (result.captured || []).find(c => /consultation\/submit/.test(c.url));
  check('제출 요청 발생(가로챔, 실제 전송 없음)', !!submit);
  if (submit && submit.body) {
    const payload = JSON.parse(submit.body);
    // 9999 는 질문이 아니라 개인정보 수집 동의 표식이다(서버가 별도로 걸러낸다).
    const keys = Object.keys(payload.answers || {}).filter(k => k !== '9999');
    check('answers 에 채운 4개만 포함', keys.length === 4 &&
      ['4', '10', '13', '15'].every(id => keys.includes(id)), keys.join(','));
    check('marketingAttribution 전달됨', !!payload.marketingAttribution &&
      Object.keys(payload.marketingAttribution).length > 0,
      Object.keys(payload.marketingAttribution || {}).join(','));
    check('companyId 전달됨', typeof payload.companyId === 'string' && payload.companyId.length === 36);
  }
  check('성공 화면 전환', result.success, result.status);
  check('JS 오류 0', errors.length === 0, errors.join(' / '));
} finally {
  await browser.close();
  server.kill();
}

console.log(fail.length ? `\n실패 ${fail.length}건: ${fail.join(', ')}` : '\n전부 통과');
process.exit(fail.length ? 1 : 0);
