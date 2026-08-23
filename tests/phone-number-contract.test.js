// 전화번호 이원 계약 — 2026-08-23 확정.
// 표시(DISPLAY): 사람 눈에 보이는 모든 표기(본문·버튼 라벨·aria-label·JSON-LD telephone·문서)는
//   대표번호 1551-0163 하나만 쓴다.
// 발신(DIAL): 실제 클릭·발신·문자 타깃(tel:/sms: href, JS 동적 주입, 생성 템플릿)은
//   추적용 안심번호 050713881252 정규형 하나만 쓴다.
// 금지: 안심번호를 하이픈 표기로 화면에 노출하는 것, 대표번호를 tel:/sms: 발신 타깃으로 쓰는 것.
//   두 금지 문자열은 이 파일이 자기 자신도 검사하므로(아래 두 번째 테스트) 주석에도 literal 로 적지 않는다.
//   literal 로 적으면 이 테스트가 영구 실패한다 — 실제로 2026-08-23 커밋 08abea0 이후 그 상태였다.
// 생성 스크립트(scripts_case_builder.py, scripts/g4/build_g5_pages.py) 템플릿도 같은 계약에
// 묶여 있어 재생성이 계약을 깨뜨릴 수 없다. Meta 계정 측 번호 정리는 이 저장소 밖에서 처리한다.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

const DISPLAY_PHONE = '1551-0163';
const DIAL_PHONE = '050713881252';
// 금지 문자열을 리터럴로 두면 이 파일 자신이 검사에 걸리므로 조합해서 만든다.
const DIAL_DISPLAY_FORBIDDEN = ['0507', '1388', '1252'].join('-'); // 화면 표기 금지
const DISPLAY_CANONICAL = DISPLAY_PHONE.split('-').join(''); // 15510163 — 발신 타깃 금지
const FORBIDDEN_HREFS = [
  'tel:' + DISPLAY_CANONICAL,
  'sms:' + DISPLAY_CANONICAL,
  'tel:' + DISPLAY_PHONE,
  'sms:' + DISPLAY_PHONE,
];

const BINARY_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.pdf']);

function trackedTextFiles() {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean).filter((rel) => !BINARY_EXT.has(path.extname(rel).toLowerCase()));
}

test('모든 비테스트 tel:/sms: 타깃은 발신번호 050713881252 하나뿐이다', () => {
  const offenders = [];
  for (const rel of trackedTextFiles()) {
    if (rel.startsWith('tests/')) continue; // 테스트 목킹은 아래 금지 패턴 검사로만 잡는다
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const m of text.matchAll(/(?:tel|sms):[0-9+-]{6,}/g)) {
      if (m[0] !== `tel:${DIAL_PHONE}` && m[0] !== `sms:${DIAL_PHONE}`) {
        offenders.push(`${rel}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('표시번호로 발신하는 href와 안심번호 화면 표기는 어디에도 없다 (테스트 포함)', () => {
  const offenders = [];
  for (const rel of trackedTextFiles()) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const href of FORBIDDEN_HREFS) {
      if (text.includes(href)) offenders.push(`${rel}: ${href}`);
    }
    if (text.includes(DIAL_DISPLAY_FORBIDDEN)) offenders.push(`${rel}: ${DIAL_DISPLAY_FORBIDDEN} (표기 금지)`);
  }
  assert.deepEqual(offenders, []);
});

test('JSON-LD telephone은 표시번호 1551-0163만 쓴다', () => {
  const offenders = [];
  for (const rel of trackedTextFiles()) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const m of text.matchAll(/"telephone"\s*:\s*"([^"]*)"/g)) {
      if (m[1] !== DISPLAY_PHONE) offenders.push(`${rel}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('상업 랜딩은 5개 배치 전부 발신번호로 링크하고 표시번호를 노출한다', () => {
  const html = fs.readFileSync(path.join(root, 'commercial', 'call', 'index.html'), 'utf8');
  for (const location of [
    'commercial_call_header',
    'commercial_call_hero',
    'commercial_call_hero_sms',
    'commercial_call_sms',
    'commercial_call_sticky',
  ]) {
    const re = new RegExp(`data-cta-location="${location}" href="(?:tel|sms):${DIAL_PHONE}"`);
    assert.match(html, re, location);
  }
  // 표시 번호: 헤더·히어로·푸터·스티키
  assert.ok((html.match(new RegExp(DISPLAY_PHONE, 'g')) || []).length >= 4, 'display number missing');
  assert.ok(!html.includes(DIAL_DISPLAY_FORBIDDEN));
});

test('동적 주입(site-tracking.js)과 생성 스크립트 템플릿도 이원 계약을 따른다', () => {
  for (const rel of ['assets/site-tracking.js', 'scripts_case_builder.py', 'scripts/g4/build_g5_pages.py']) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(text.includes(`tel:${DIAL_PHONE}`), `${rel}: tel:${DIAL_PHONE} 없음`);
    for (const href of FORBIDDEN_HREFS) assert.ok(!text.includes(href), `${rel}: ${href}`);
    assert.ok(!text.includes(DIAL_DISPLAY_FORBIDDEN), rel);
  }
  // 주입 링크의 접근성 라벨은 표시번호를 읽어준다.
  const tracking = fs.readFileSync(path.join(root, 'assets', 'site-tracking.js'), 'utf8');
  assert.match(tracking, new RegExp(`aria-label', '[^']*${DISPLAY_PHONE}`), 'aria-label 표시번호 누락');
});

test('PRODUCT.md는 표시·발신 두 번호를 모두 문서화한다', () => {
  const product = fs.readFileSync(path.join(root, 'PRODUCT.md'), 'utf8');
  assert.ok(product.includes(DISPLAY_PHONE), 'PRODUCT.md 표시번호 문서화 누락');
  assert.ok(product.includes(DIAL_PHONE), 'PRODUCT.md 발신번호 문서화 누락');
});
