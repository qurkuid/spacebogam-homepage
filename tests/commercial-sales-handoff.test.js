const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash12 = body => crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
const flow = read('reports/consultation-step-prototype-20260928/flow.js');
const questions = read('reports/consultation-step-prototype-20260928/consultation-questions.js');
const html = read('consultation/index.html');

test('commercial ad intent opens the matching consultation and survives restart', () => {
  assert.match(flow, /params\.get\('type'\) === 'commercial'/);
  assert.match(flow, /\['shop', 'office'\]\.includes\(params\.get\('vertical'\)\)/);
  assert.equal((flow.match(/applyEntryIntent\(\);/g) || []).length, 2);
  assert.match(flow, /answers\.type = '상업 공간';[\s\S]*answers\.responses\.vertical = requestedVertical;[\s\S]*current = nextQuestion\(0\);/);
});

test('commercial context and current production tracking safeguards stay present', () => {
  assert.match(flow, /asideImage\.hidden = commercial/);
  assert.match(flow, /어떤 공간에서 일하고 운영할지/);
  assert.match(flow, /function isTestTracking\(\)/);
  assert.match(flow, /function trackSubmission\(result\)/);
  assert.match(flow, /return \{ consent: false, version: 'meta-contact-v1' \}/);
  assert.doesNotMatch(flow, /광고 성과 측정을 위한 정보 제공|matching-email|fbq\('consent', 'grant'\)/);
});

test('candidate location copy and cache versions match served files', () => {
  assert.match(questions, /"question": "현장 후보 지역·주소를 알려주세요\."/);
  assert.match(questions, /"question": "예상 전용면적\(평\)을 알려주세요\."/);
  assert.match(html, new RegExp(`consultation-questions\\.js\\?v=${hash12(questions)}`));
  assert.match(html, new RegExp(`flow\\.js\\?v=${hash12(flow)}`));
});
