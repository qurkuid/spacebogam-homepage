const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'consultation/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/preview-v8.css'), 'utf8');

function matches(pattern) {
  return html.match(pattern) || [];
}

test('consultation is a compact V8 residential conversion page', () => {
  assert.match(html, /assets\/preview-v8\.css/);
  assert.doesNotMatch(html, /assets\/page\.css/);
  assert.match(html, /class="v8-header"/);
  assert.match(html, /우리 집 조건부터,<br>함께 확인합니다/);
  assert.match(html, /구조·설비·생활 동선/);
  assert.match(html, /주거 인테리어 상담/);
  assert.doesNotMatch(html, /상업공간|상가|사무실/);
  assert.doesNotMatch(html, /포트폴리오 보기|견적 준비|대표 사례|진행 방식/);
});

test('one dominant apply CTA and one subordinate phone inquiry are exposed', () => {
  const applyLinks = matches(/href="\/consultation\/apply\/\?ref=[^"]+"/g);
  const phoneLinks = matches(/href="tel:050713881252"/g);
  assert.equal(applyLinks.length, 1);
  assert.equal(phoneLinks.length, 1);
  assert.match(html, />상담 신청서 작성 /);
  assert.match(html, />전화 문의 1551-0163</);
  assert.doesNotMatch(html, /전화 상담|phone-cta-panel|spacebogam-mobile-actions/);
  assert.match(html, /data-no-auto-cta="true"/);
});

test('the three reassurance lines set expectations without a long content funnel', () => {
  const reassurance = html.match(/<ul class="v8-consult-assurance"[\s\S]*?<\/ul>/);
  assert.ok(reassurance);
  assert.equal((reassurance[0].match(/<li>/g) || []).length, 3);
  assert.match(reassurance[0], /준비한 자료가 없어도/);
  assert.match(reassurance[0], /상담 신청만으로 계약이 진행되지는 않습니다/);
  assert.match(reassurance[0], /유료 현장실측/);
  assert.match(reassurance[0], /본계약 시 공사비에서 차감/);
  assert.equal(matches(/<main[\s\S]*?<section\b/g).length, 1);
});

test('existing attribution and click tracking contracts remain loaded', () => {
  assert.match(html, /assets\/site-tracking\.js/);
  assert.match(html, /data-cta-location="consultation_v8_hero"/);
  assert.match(html, /data-cta-location="consultation_v8_phone_inquiry"/);
  assert.match(html, /href="\/consultation\/apply\/\?ref=spacebogam_consultation"/);
});

test('V8 visual truth and mobile-first CTA rules are present', () => {
  assert.match(css, /--paper:#f6f3ed;--ink:#1e1d1a;--line:#d9d4ca/);
  assert.match(css, /\.v8-header\{height:74px/);
  assert.match(css, /\.v8-consult-hero h1\{[^}]*font-weight:400/);
  assert.match(css, /\.v8-button-primary\{[^}]*border:1px solid var\(--ink\)/);
  const consultationRules = css
    .split('\n')
    .filter((line) => /\.(v8-consult|v8-button-primary|v8-section-label|v8-phone-note|v8-footer)/.test(line))
    .join('\n');
  assert.doesNotMatch(consultationRules, /border-radius|box-shadow|gradient/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.v8-button-primary\{width:100%;min-height:54px/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.v8-consult-hero-copy\{min-height:calc\(100svh - 60px\)/);
});
