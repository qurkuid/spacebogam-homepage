const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const forbidden = /공간보감 사무실 방문 상담 예약|사무실 방문 상담 신청|상담은 공간보감 사무실 방문을 기본|방문 상담 예약 신청|방문 일정 전화 문의/;
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html')).concat([
  'consultation/index.html', 'commercial/call/index.html', 'assets/site-tracking.js',
  'assets/consultation-form.js', 'assets/commercial-call.js',
  'reports/consultation-step-prototype-20260928/flow.js'
])) {
  const source = read(name);
  assert.doesNotMatch(source, forbidden, name);
  for (const match of source.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(match[1]);
}
assert.match(read('index.html'), /home_hero_consult_cta_click">우리 집 조건 상담하기/);
assert.doesNotMatch(read('consultation/index.html'), /id="visit-intro"/);
assert.match(read('reports/consultation-step-prototype-20260928/flow.js'), /success: \{ title: '상담 신청이 접수되었습니다'/);
console.log('Consultation copy restored across public pages, shared buttons and completion screens.');
