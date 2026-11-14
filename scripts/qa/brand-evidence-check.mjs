#!/usr/bin/env node
// Offline GitHub-source audit; does not measure public deployment, indexing or AI responses.
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const normalize = s => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/[\s·()]/g, '').toLowerCase();
const first = (s, re) => (s.match(re) || [])[1] || '';
const clean = s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function auditDocuments({ portfolio, sitemap, home, living40, living50, guide }) {
  const errors = [], warnings = [], cards = new Map();
  const articles = [...portfolio.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(m => m[0]);
  for (const article of articles) {
    const href = first(article, /\bhref="(case-[^"]+\.html)"/);
    const py = Number(first(article, /·\s*(\d{2})평/));
    const title = clean(first(article, /<h2[^>]*>([\s\S]*?)<\/h2>/));
    const budget = clean(first(article, /<p class="pf-budget">([\s\S]*?)<\/p>/));
    const photos = Number(first(article, /사진\s*(\d+)장/));
    if (!href || !py || !photos) errors.push('PORTFOLIO_INCOMPLETE ' + (href || '[unknown]'));
    else cards.set(href, { href, py, title, budget, photos });
  }
  if (cards.size !== articles.length || !cards.size) errors.push('PORTFOLIO_PARSE_FAILED');
  const photoTotal = [...cards.values()].reduce((sum, c) => sum + c.photos, 0);
  const siteLocs = new Set([...sitemap.matchAll(/<loc>\s*(https:\/\/spacebogam\.kr\/[^<]+?)\s*<\/loc>/g)].map(m => m[1]));
  for (const c of cards.values()) {
    if (!siteLocs.has('https://spacebogam.kr/' + c.href)) errors.push('SITEMAP_MISSING ' + c.href);
  }
  const homeClaims = [...home.matchAll(/(\d+)개 실제 시공사례와 완성 사진 (\d+)장|실제 시공 (\d+)개 현장\s*[·•]\s*완성 사진 (\d+)장/g)];
  for (const m of homeClaims) {
    const count = Number(m[1] || m[3]), photos = Number(m[2] || m[4]);
    if (count !== cards.size || photos !== photoTotal) {
      errors.push('HOME_COUNT ' + count + '개/' + photos + '장 vs portfolio ' + cards.size + '개/' + photoTotal + '장');
    }
  }
  if (!homeClaims.length) warnings.push('HOME_COUNT_NOT_DECLARED: 홈 사진 수가 다른 집계일 수 있어 비교하지 않음');
  for (const [band, html] of [[40, living40], [50, living50]]) {
    const primary = [...html.matchAll(/<a class="card portfolio-card"[^>]*href="(case-[^"]+\.html)"/g)];
    if (!primary.length) errors.push('LIVING_' + band + '_NO_PRIMARY_CASES');
    for (const m of primary) {
      const c = cards.get(m[1]);
      if (!c) errors.push('LIVING_' + band + '_UNKNOWN_CASE ' + m[1]);
      else if (c.py < band || c.py >= band + 10) errors.push('LIVING_' + band + '_WRONG_AREA ' + c.href + ': ' + c.py + '평');
    }
  }
  const sections = [...guide.matchAll(/<a href="living-(20|30|40|50)py\.html">([\s\S]*?)<\/a>/g)];
  for (const sec of sections) {
    const band = Number(sec[1]);
    const claims = [...sec[2].matchAll(/<u>([^<]+)<\/u>([^<]*?)(?=<u>|<\/span>|$)/g)];
    for (const m of claims) {
      const label = normalize(m[1]);
      const matches = [...cards.values()].filter(c => normalize(c.title).includes(label) || label.includes(normalize(c.title)));
      if (matches.length !== 1) {
        warnings.push('GUIDE_UNMATCHED_CASE ' + band + '평: ' + clean(m[1]));
        continue;
      }
      const c = matches[0];
      const inBand = band === 50 ? c.py >= 45 && c.py < 60 : c.py >= band && c.py < band + 10;
      if (!inBand) errors.push('GUIDE_WRONG_AREA ' + band + '평 목록에 ' + c.title + ' (' + c.py + '평)');
      const adjacentText = clean(m[2]).slice(0, 48);
      if (/별도\s*문의/.test(c.budget) && /(?:\d+천만|\d+억|\d+만\s*원)/.test(adjacentText)) {
        errors.push('GUIDE_UNVERIFIED_BUDGET ' + c.title + ': "' + c.budget + '" vs "' + adjacentText + '"');
      }
    }
  }
  return {
    ok: errors.length === 0,
    summary: { cases: cards.size, photos: photoTotal, homeClaims: homeClaims.length, guideSections: sections.length },
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)]
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootArg = process.argv.slice(2).find(a => !a.startsWith('--'));
  const root = rootArg ? resolve(rootArg) : ROOT;
  const read = filename => readFileSync(join(root, filename), 'utf8');
  const report = auditDocuments({
    portfolio: read('portfolio.html'), sitemap: read('sitemap.xml'), home: read('index.html'),
    living40: read('living-40py.html'), living50: read('living-50py.html'), guide: read('guide-apartment-cost.html')
  });
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('공간보감 소스 근거 검사: ' + (report.ok ? 'PASS' : 'FAIL') + ' / ' + report.summary.cases + '개 현장, ' + report.summary.photos + '장');
    for (const issue of report.errors) console.error('ERROR', issue);
    for (const warn of report.warnings) console.warn('WARN', warn);
  }
  if (!report.ok) process.exitCode = 1;
}
