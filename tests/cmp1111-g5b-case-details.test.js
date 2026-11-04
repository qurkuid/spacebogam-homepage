const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'g4-private');

// CMP-1111 (G5b): the 7 remaining published case studies, extracted from the
// live case-*.html into the G4 .detail/.gallery/.related template.
const CASES = [
  { source: 'case-daewoo-ian-35py.html', g4: 'daewoo-ian-35py.html' },
  { source: 'case-geoje-hyundai-hometown.html', g4: 'geoje-hyundai-hometown.html' },
  { source: 'case-guseo-ssangyong.html', g4: 'guseo-ssangyong.html' },
  { source: 'case-hwamyeong-kolong.html', g4: 'hwamyeong-kolong.html' },
  { source: 'case-hwamyeong-lottecastle.html', g4: 'hwamyeong-lottecastle.html' },
  { source: 'case-oryukdo-sk-view.html', g4: 'oryukdo-sk-view.html' },
  { source: 'case-samhan-goldenview.html', g4: 'samhan-goldenview.html' },
];

function resolveLocalTarget(target) {
  // mirrors the live-site root-relative convention used across g4-private
  // (see tests/cmp1095-g5-rollout.test.js): a leading "/" means repo root.
  return target.startsWith('/') ? path.join(root, target) : path.resolve(dir, target);
}

test('every new G5b case-detail page is private, tracked once, and reuses the .detail template', () => {
  for (const { g4 } of CASES) {
    const html = fs.readFileSync(path.join(dir, g4), 'utf8');
    assert.match(html, /noindex,nofollow,noarchive/, g4);
    assert.equal((html.match(/g4-tracking\.js/g) || []).length, 1, g4);
    assert.equal((html.match(/<main class="detail">/g) || []).length, 1, g4);
    assert.equal((html.match(/class="gallery"/g) || []).length, 1, g4);
  }
});

test('every local link/asset on the new case-detail pages resolves', () => {
  for (const { g4 } of CASES) {
    const html = fs.readFileSync(path.join(dir, g4), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = match[1].split(/[?#]/)[0];
      if (!target || target.startsWith('http') || target.startsWith('tel:')) continue;
      assert.ok(fs.existsSync(resolveLocalTarget(target)), `${g4}: missing ${target}`);
    }
  }
});

test('case-detail title/gallery images are pulled from the live case page, not invented', () => {
  for (const { source, g4 } of CASES) {
    const sourceHtml = fs.readFileSync(path.join(root, source), 'utf8');
    const g4Html = fs.readFileSync(path.join(dir, g4), 'utf8');

    const h1Match = sourceHtml.match(/<main[\s\S]*?<h1>([\s\S]*?)<\/h1>/);
    assert.ok(h1Match, `${source}: no h1 in source`);
    assert.ok(g4Html.includes(h1Match[1].trim()), `${g4}: h1 not carried over from ${source}`);

    const sourceImageIds = [...sourceHtml.matchAll(/assets\/case\/([0-9a-f-]{36}\/[0-9a-f-]{36})\.(?:jpg|webp|png)/g)].map(m => m[1]);
    const g4ImageIds = [...g4Html.matchAll(/assets\/case\/([0-9a-f-]{36}\/[0-9a-f-]{36})\.(?:jpg|webp|png)/g)].map(m => m[1]);
    assert.ok(g4ImageIds.length > 0, `${g4}: no gallery images extracted`);
    for (const id of g4ImageIds) {
      assert.ok(sourceImageIds.includes(id), `${g4}: gallery image ${id} not present in ${source}`);
    }
  }
});

test('portfolio.html routes all 9 real case cards to internal G4 detail pages, none to the live site', () => {
  const html = fs.readFileSync(path.join(dir, 'portfolio.html'), 'utf8');
  const section = html.match(/<h2>공개 사례 9건<\/h2>([\s\S]*?)<\/section>/);
  assert.ok(section, 'portfolio.html: missing the 9-case section');
  const hrefs = [...section[1].matchAll(/class="card" href="([^"]+)"/g)].map(m => m[1]);
  assert.equal(hrefs.length, 9, 'portfolio.html: expected 9 case cards');
  for (const href of hrefs) {
    assert.ok(!href.startsWith('../case-'), `portfolio.html: ${href} still points at the live case page`);
    assert.ok(fs.existsSync(path.resolve(dir, href.split(/[?#]/)[0])), `portfolio.html: ${href} does not resolve`);
  }
});
