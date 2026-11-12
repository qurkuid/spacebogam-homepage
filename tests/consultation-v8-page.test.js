const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const consultation = fs.readFileSync(path.join(root, 'consultation/index.html'), 'utf8');
const apply = fs.readFileSync(path.join(root, 'consultation/apply/index.html'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'reports/consultation-step-prototype-20260928/flow.js'), 'utf8');

test('apply route preserves the operational staged form', () => {
  assert.match(apply, /id="stage"/);
  assert.match(apply, /id="progress-fill"/);
  assert.match(apply, /id="next"/);
  assert.match(apply, /id="skip"/);
  assert.match(apply, /consultation-step-prototype-20260928\/flow\.js/);
  assert.match(apply, /consultation-step-prototype-20260928\/consultation-questions\.js/);
  assert.match(apply, /assets\/site-tracking\.js/);
  assert.match(apply, /href="tel:050713881252"/);
  assert.doesNotMatch(apply, /실제 접수되지 않습니다|디자인 가안/);
  assert.match(flow, /api\/consultation\/submit/);
  assert.match(flow, /api\/consultation\/upload/);
  assert.match(flow, /sbSubmitEventId/);
});

test('primary consultation route shows the private-detail board and apply link', () => {
  assert.match(consultation, /상담 신청 게시판/);
  for (const label of ['신청날짜', '이름', '전화번호', '아파트이름']) assert.match(consultation, new RegExp('>' + label + '</th>'));
  assert.match(consultation, /href="\/consultation\/apply\/"/);
  assert.match(consultation, /id="board-application-frame"/);
  assert.match(consultation, /aria-controls="board-application"/);
  assert.match(consultation, /role="alertdialog"/);
  assert.match(consultation, /상담 내용을 볼 권한이 없습니다/);
  assert.match(consultation, /consultation-board\.js/);
  assert.doesNotMatch(consultation, /id="stage"/);
  assert.doesNotMatch(apply, /location\.replace\('\/consultation\/'/);
});

test('board and apply have separate canonical paths and avoid indexing applicant data', () => {
  assert.match(consultation, /<meta name="robots" content="noindex,follow/);
  assert.match(consultation, /canonical" href="https:\/\/spacebogam\.kr\/consultation\/"/);
  assert.match(apply, /<meta name="robots" content="noindex,follow">/);
  assert.match(apply, /canonical" href="https:\/\/spacebogam\.kr\/consultation\/apply\/"/);
});

test('board sends one canonical GA4 page view without URL parameters or referrer details', () => {
  assert.equal((consultation.match(/googletagmanager\.com\/gtag\/js\?id=G-EJGXDD5C1T/g) || []).length, 1);
  assert.equal((consultation.match(/gtag\('config','G-EJGXDD5C1T'/g) || []).length, 1);
  assert.match(consultation, /page_location:'https:\/\/spacebogam\.kr\/consultation\/'/);
  assert.match(consultation, /page_path:'\/consultation\/'/);
  assert.match(consultation, /spacebogamGa4ReferrerUrl\.origin\+\(spacebogamGa4ReferrerUrl\.hostname===location\.hostname\?spacebogamGa4ReferrerUrl\.pathname:'\/'\)/);
  assert.ok(consultation.indexOf("location.replace('/consultation/apply/'") < consultation.indexOf('googletagmanager.com/gtag/js'));
  assert.doesNotMatch(consultation, /GTM-PW8GLP8S/);
});

test('staged form remains keyboard accessible and mobile responsive', () => {
  assert.match(apply, /class="v8-skip" href="#stage"/);
  assert.match(apply, /\.v8-skip:focus\{top:12px\}/);
  assert.match(apply, /@media\(max-width:800px\)/);
  assert.match(apply, /@media\(max-width:560px\)/);
  assert.match(apply, /button:focus-visible/);
});
