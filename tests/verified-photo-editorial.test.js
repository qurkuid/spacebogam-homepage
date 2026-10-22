const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/cases/verified-photo-stories-20261023.json'), 'utf8'));
const pages = source.stories;
const expectedCount = {
  'case-mega-centum-49py.html': 74,
  'case-sajik-32py.html': 55,
  'case-guseo-ssangyong-sweetdot-home.html': 162,
  'case-geoje-yurim-asiad-47py.html': 130,
  'case-sajik-lottecastle-the-classic.html': 13,
  'case-daewoo-ian-35py.html': 50,
  'case-guseo-ssangyong.html': 29,
  'case-oryukdo-sk-view.html': 23,
  'case-samhan-goldenview.html': 19,
  'case-geoje-hyundai-hometown.html': 17,
  'case-hwamyeong-lottecastle.html': 32,
};
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const decode = (s) => s.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');

test('all 33 curated images are pre-existing actual project photos with meaningful alt and captions', () => {
  assert.equal(Object.keys(pages).length, 11);
  for (const [page, info] of Object.entries(pages)) {
    assert.equal(info.photos.length, 3, page);
    const content = fs.readFileSync(path.join(root, page), 'utf8');
    const gallery = content.split('<section class="case-shots" id="case-photos">')[1];
    assert.ok(gallery, 'missing gallery ' + page);
    for (const p of info.photos) {
      assert.ok(p.alt.length > 25 && p.alt.length <= 150);
      assert.ok(p.caption.length >= 30);
      for (const key of ['full', 'thumbnail']) {
        assert.ok(fs.existsSync(path.join(root, p[key].replace(/^\//, ''))), page + ' missing ' + key);
      }
      assert.ok(gallery.includes('href="' + p.full + '"'), page);
      assert.ok(gallery.includes('src="' + p.thumbnail + '"'), page);
      const start = gallery.indexOf('href="' + p.full + '"');
      const tagStart = gallery.indexOf('<img ', start);
      const tagEnd = gallery.indexOf('>', tagStart);
      const imageTag = gallery.slice(tagStart, tagEnd+1);
      assert.equal(decode((imageTag.match(/alt="([^"]*)"/)||[])[1]), p.alt, 'wrong gallery alt: ' + page);
    }
  }
});

test('photo stories are visually adjacent to complete galleries and existing business conversion markers survive', () => {
  for (const [page, info] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/class="sb-case-scenes"/g) || []).length, 1, page);
    assert.equal((html.match(/class="sb-case-scene"/g) || []).length, 3, page);
    assert.ok(html.indexOf('class="sb-case-scenes"') < html.indexOf('<section class="case-shots" id="case-photos">'), page);
    assert.match(html, /assets\/case-photo-editorial\.css\?v=20261023/);
    assert.match(html, /기존 완공 사진 중 대표 장면/);
    assert.match(html, /GTM-PW8GLP8S/);
    assert.match(html, /G-EJGXDD5C1T/);
    assert.match(html, /\/consultation\/\?type=residential/);
    const gallery = html.split('<section class="case-shots" id="case-photos">')[1]?.split('</div></div></section>')[0];
    assert.equal((gallery.match(/<a href=/g)||[]).length, expectedCount[page], page + ' must preserve original number of photos');
    for (const photo of info.photos) {
      assert.ok(html.includes(photo.caption), page + ' caption');
      assert.ok(html.includes('alt="' + photo.alt + '"'), page + ' photo alt');
    }
  }
});

test('image sitemap contains exactly the 33 new original files without removing existing pages', () => {
  assert.ok(sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
  assert.equal((sitemap.match(/<loc>/g)||[]).length, 134, 'site URL preservation');
  assert.equal((sitemap.match(/<image:loc>/g)||[]).length, 38, 'five existing diagrams plus 33 photo originals');
  for (const [page, info] of Object.entries(pages)) {
    const location = '<loc>https://spacebogam.kr/' + page + '</loc>';
    const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m=>m[1]).filter(b=>b.includes(location));
    assert.equal(blocks.length, 1, page);
    assert.ok(blocks[0].includes('<lastmod>2026-10-23</lastmod>'), page);
    for (const photo of info.photos){
      const url = '<image:loc>https://spacebogam.kr' + photo.full + '</image:loc>';
      assert.ok(blocks[0].includes(url), page);
    }
  }
});
