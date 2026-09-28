const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const consultation = fs.readFileSync(path.join(root, 'consultation/index.html'), 'utf8');
const apply = fs.readFileSync(path.join(root, 'consultation/apply/index.html'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'reports/consultation-step-prototype-20260928/flow.js'), 'utf8');

test('primary consultation route renders the operational staged form', () => {
  assert.match(consultation, /id="stage"/);
  assert.match(consultation, /id="progress-fill"/);
  assert.match(consultation, /id="next"/);
  assert.match(consultation, /id="skip"/);
  assert.match(consultation, /consultation-step-prototype-20260928\/flow\.js/);
  assert.match(consultation, /consultation-step-prototype-20260928\/consultation-questions\.js/);
  assert.match(consultation, /assets\/site-tracking\.js/);
  assert.match(consultation, /href="tel:050713881252"/);
  assert.doesNotMatch(consultation, /실제 접수되지 않습니다|디자인 가안/);
  assert.match(flow, /api\/consultation\/submit/);
  assert.match(flow, /api\/consultation\/upload/);
  assert.match(flow, /sbSubmitEventId/);
});

test('apply route passes its query and hash to the primary form', () => {
  assert.match(apply, /location\.replace\('\/consultation\/' \+ location\.search \+ location\.hash\)/);
  assert.match(apply, /href="tel:050713881252"/);
});

test('canonical indexing keeps consultation primary and apply noindex', () => {
  assert.match(consultation, /<meta name="robots" content="index,follow/);
  assert.match(consultation, /canonical" href="https:\/\/spacebogam\.kr\/consultation\/"/);
  assert.match(apply, /<meta name="robots" content="noindex,follow">/);
  assert.match(apply, /canonical" href="https:\/\/spacebogam\.kr\/consultation\/"/);
});

test('staged form remains keyboard accessible and mobile responsive', () => {
  assert.match(consultation, /class="v8-skip" href="#stage"/);
  assert.match(consultation, /\.v8-skip:focus\{top:12px\}/);
  assert.match(consultation, /@media\(max-width:800px\)/);
  assert.match(consultation, /@media\(max-width:560px\)/);
  assert.match(consultation, /button:focus-visible/);
});
