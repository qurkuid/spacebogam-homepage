import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDocuments } from './brand-evidence-check.mjs';

const article = (slug, title, py, budget, photos) =>
  '<article><a href="case-' + slug + '.html"><h2>' + title +
  '</h2><p>부산 · ' + py + '평 · 사진 ' + photos +
  '장</p><p class="pf-budget">' + budget + '</p></a></article>';
const docs = () => ({
  portfolio: article('geoje', '거제유림아시아드', 47, '금액대 별도 문의', 8) +
    article('oryukdo', '오륙도 SK뷰 59평', 59, '금액대 별도 문의', 27),
  sitemap: '<loc>https://spacebogam.kr/case-geoje.html</loc><loc>https://spacebogam.kr/case-oryukdo.html</loc>',
  home: '<meta content="2개 실제 시공사례와 완성 사진 35장">',
  living40: '<a class="card portfolio-card" data-tags="p40" href="case-geoje.html">보기</a>',
  living50: '<a class="card portfolio-card" data-tags="p50" href="case-oryukdo.html">보기</a>',
  guide: '<a href="living-40py.html"><span>거제</span></a>'
});

test('verified evidence is accepted', () => {
  const r = auditDocuments(docs());
  assert.equal(r.ok, true);
  assert.equal(r.summary.photos, 35);
});
test('wrong 40py case and unsupported budget are rejected', () => {
  const d = docs();
  d.living40 = '<a class="card portfolio-card" href="case-oryukdo.html">보기</a>';
  d.guide = '<a href="living-40py.html"><u>오륙도 SK뷰 59평</u> 1억 전후</a>';
  const r = auditDocuments(d);
  assert.equal(r.ok, false);
  assert(r.errors.some(e => e.includes('LIVING_40_WRONG_AREA')));
  assert(r.errors.some(e => e.includes('GUIDE_UNVERIFIED_BUDGET')));
});
test('sitemap omissions and homepage count mismatch are rejected', () => {
  const d = docs();
  d.sitemap = '<loc>https://spacebogam.kr/case-geoje.html</loc>';
  d.home = '1개 실제 시공사례와 완성 사진 8장';
  const r = auditDocuments(d);
  assert(r.errors.some(e => e.includes('SITEMAP_MISSING')));
  assert(r.errors.some(e => e.includes('HOME_COUNT')));
});
