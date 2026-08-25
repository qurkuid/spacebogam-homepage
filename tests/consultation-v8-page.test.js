const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const consultation = fs.readFileSync(path.join(root, 'consultation/index.html'), 'utf8');
const apply = fs.readFileSync(path.join(root, 'consultation/apply/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/preview-v8.css'), 'utf8');

for (const [name, html] of [['consultation', consultation], ['apply', apply]]) {
  test(`${name} uses the same compact V8 form shell`, () => {
    assert.match(html, /assets\/preview-v8\.css/);
    assert.doesNotMatch(html, /assets\/page\.css/);
    assert.match(html, /class="v8-header"/);
    assert.match(html, /우리 집 조건부터,<br>함께 확인합니다/);
    assert.match(html, /id="consult-form-root"/);
    assert.match(html, /assets\/consultation-form\.js/);
    assert.match(html, /href="#consult-form-root"/);
    assert.doesNotMatch(html, /href="\/consultation\/apply\//, '페이지 안 CTA가 다른 URL로 이동하면 안 된다');
    assert.doesNotMatch(html, /광고 각도|mm-angle|대표 사례|진행 방식|접수 후 진행/);
    assert.doesNotMatch(html, /상업공간|상가|사무실/);
  });

  test(`${name} exposes one subordinate phone inquiry and no phone-consultation claim`, () => {
    assert.equal((html.match(/href="tel:050713881252"/g) || []).length, 1);
    assert.match(html, />전화 문의 1551-0163</);
    assert.doesNotMatch(html, /전화 상담|순차적으로 연락/);
    assert.match(html, /data-no-auto-cta="true"/);
  });
}

test('canonical indexing strategy keeps consultation primary and apply noindex', () => {
  assert.match(consultation, /<meta name="robots" content="index,follow/);
  assert.match(consultation, /canonical" href="https:\/\/spacebogam\.kr\/consultation\/"/);
  assert.match(apply, /<meta name="robots" content="noindex,follow">/);
  assert.match(apply, /canonical" href="https:\/\/spacebogam\.kr\/consultation\/apply\/"/);
});

test('V8 visual contract covers shell, form, focus and mobile-first in-page handoff', () => {
  assert.match(css, /--paper:#f6f3ed;--ink:#1e1d1a;--line:#d9d4ca/);
  assert.match(css, /\.v8-apply-intro h1\{[^}]*font-weight:400/);
  assert.match(css, /\.cf-input\{[^}]*border-radius:0/);
  assert.match(css, /\.cf-submit\{[^}]*border-radius:0[^}]*background:var\(--ink\)/);
  assert.match(css, /\.cf-input:focus\{[^}]*outline:2px solid var\(--ink\)/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.v8-apply-intro\{position:static;padding:32px 20px 30px/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.v8-form-section\{padding:36px 20px 0/);
  const formRules = css.split('\n').filter((line) => /\.(v8-apply|v8-form|cf-)/.test(line)).join('\n');
  assert.doesNotMatch(formRules, /box-shadow|gradient/);
});
