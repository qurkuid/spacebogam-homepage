import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDocuments } from './brand-evidence-check.mjs';

// Synthetic published portfolio; includes the short "대우이안" guide alias for "화명 대우이안".
const article = (slug, title, py, budget, photos) =>
  '<article><a href="case-' + slug + '.html"><h2>' + title +
  '</h2><p>부산 · ' + py + '평 · 사진 ' + photos +
  '장</p><p class="pf-budget">' + budget + '</p></a></article>';
const guideLink = (band, text) => '<a href="living-' + band + 'py.html"><span>' + text + '</span></a>';
const docs = () => ({
  portfolio: [
    article('hwamyeong-24', '화명 코오롱하늘채2차', 24, '금액대 별도 문의', 4),
    article('daewoo', '화명 대우이안', 35, '7천만~1억대', 6),
    article('geoje', '거제유림아시아드', 47, '금액대 별도 문의', 8),
    article('mega', '메가센텀꿈에그린', 49, '1억원 이상', 5),
    article('oryukdo', '오륙도 SK뷰 59평', 59, '금액대 별도 문의', 27)
  ].join(''),
  sitemap: ['hwamyeong-24', 'daewoo', 'geoje', 'mega', 'oryukdo']
    .map(s => '<loc>https://spacebogam.kr/case-' + s + '.html</loc>').join(''),
  home: '<meta content="5개 실제 시공사례와 완성 사진 50장">',
  living40: '<a class="card portfolio-card" data-tags="p40" href="case-geoje.html">보기</a>',
  living50: '<a class="card portfolio-card" data-tags="p50" href="case-oryukdo.html">보기</a>',
  guide: [
    guideLink(20, '<u>화명 코오롱하늘채2차 24평</u> 금액대 별도 문의'),
    guideLink(30, '<u>대우이안 35평</u> 7천만~1억대'),
    guideLink(40, '<u>거제유림아시아드 47평</u> 금액대 별도 문의'),
    guideLink(50, '<u>오륙도 SK뷰 59평</u> 사례가 있습니다. 메가센텀 49평의 1억원 이상 금액은 인접 사례입니다.')
  ].join('')
});

test('verified case evidence and alias are accepted', () => {
  const r = auditDocuments(docs());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.summary.photos, 50);
  assert.equal(r.warnings.length, 0);
});
test('wrong 40py case and directly asserted unpublished budget are rejected', () => {
  const d = docs();
  d.living40 = '<a class="card portfolio-card" href="case-oryukdo.html">보기</a>';
  d.guide = d.guide.replace('<u>거제유림아시아드 47평</u> 금액대 별도 문의',
    '<u>오륙도 SK뷰 59평</u> 1억 전후');
  const r = auditDocuments(d);
  assert.equal(r.ok, false);
  assert(r.errors.some(e => e.includes('LIVING_40_WRONG_AREA')));
  assert(r.errors.some(e => e.includes('GUIDE_WRONG_AREA')));
  assert(r.errors.some(e => e.includes('GUIDE_UNVERIFIED_BUDGET')));
});
test('32py and 42py in the same apartment complex resolve by stated floor area', () => {
  const d = docs();
  d.portfolio += article('sajik32', '사직쌍용예가 1차 32평', 32, '금액대 별도 문의', 3);
  d.portfolio += article('sajik42', '사직쌍용예가 1차 42평', 42, '금액대 별도 문의', 4);
  d.sitemap += '<loc>https://spacebogam.kr/case-sajik32.html</loc>' +
    '<loc>https://spacebogam.kr/case-sajik42.html</loc>';
  d.home = '7개 실제 시공사례와 완성 사진 57장';
  d.guide = d.guide.replace('<u>거제유림아시아드 47평</u>',
    '<u>사직 쌍용예가 1차 42평</u>, <u>거제유림아시아드 47평</u>');
  const r = auditDocuments(d);
  assert.equal(r.ok, true, JSON.stringify(r));
});
test('a 49py case inside 50py guide must be rejected', () => {
  const d = docs();
  d.guide = d.guide.replace('<u>오륙도 SK뷰 59평</u>',
    '<u>메가센텀꿈에그린 49평</u>');
  const r = auditDocuments(d);
  assert(r.errors.some(e => e.includes('GUIDE_WRONG_AREA 50평')));
});
test('unparseable guide evidence cannot silently pass', () => {
  const d = docs();
  d.guide = d.guide.replace('<u>오륙도 SK뷰 59평</u>', '오륙도 SK뷰 59평');
  const r = auditDocuments(d);
  assert(r.errors.some(e => e.includes('GUIDE_CASES_NOT_PARSEABLE 50평')));
});
test('a later price comparison does not contaminate the unpublished 59py case', () => {
  const r = auditDocuments(docs());
  assert(!r.errors.some(e => e.includes('GUIDE_UNVERIFIED_BUDGET')));
});
test('sitemap omissions and homepage count mismatch are rejected', () => {
  const d = docs();
  d.sitemap = d.sitemap.replace('<loc>https://spacebogam.kr/case-geoje.html</loc>', '');
  d.home = '1개 실제 시공사례와 완성 사진 8장';
  const r = auditDocuments(d);
  assert(r.errors.some(e => e.includes('SITEMAP_MISSING')));
  assert(r.errors.some(e => e.includes('HOME_COUNT')));
});
