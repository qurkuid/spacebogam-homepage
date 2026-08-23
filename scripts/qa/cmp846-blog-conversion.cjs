const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const image = 'assets/case/67ed99a1-dbdd-43c9-84f2-d79a1210bb39/fcfd69ba-c04a-494a-a369-e602e5bc9f7f.jpg';
const stories = [
  '224195906561-화명동-대우이안-35평-인테리어-구축-아파트-변수를',
  '224254948259-부산-화명동-대우이안-35평-화이트-앤-우드',
];
const pages = ['index.html', 'portfolio.html', 'case-daewoo-ian-35py.html', 'blog.html', ...stories.map(id => `blog/${id}.html`)];

for (const file of pages) {
  const html = read(file);
  assert.match(html, /<link rel="canonical" href="https:\/\/spacebogam\.kr\//, `${file}: canonical`);
  assert.match(html, /<meta name="robots" content="index,follow/, `${file}: robots`);
  if (file !== 'index.html') assert.match(html, /data-no-auto-cta="true"/, `${file}: automatic CTA opt-out`);
  for (const raw of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(raw[1]);
}

const home = read('index.html');
assert.equal((home.match(/class="v8-story"/g) || []).length, 3, 'home: approved three-story flow');
assert.equal((home.match(/href="https:\/\/blog\.naver\.com\/baek1985\//g) || []).length, 3, 'home: three approved source links');
assert.equal((home.match(/href="\/consultation\//g) || []).length, 2, 'home: header plus final consultation CTA');
assert.match(home, /class="v8-story-consult" href="\/consultation\//, 'home: final story consultation CTA');

const portfolio = read('portfolio.html');
assert.match(portfolio, /portfolio_related_story_open/, 'portfolio: related story');
assert.match(portfolio, /portfolio_project_open/, 'portfolio: existing event preserved');
assert.match(portfolio, /portfolio_consult_click/, 'portfolio: existing consult event preserved');

const casePage = read('case-daewoo-ian-35py.html');
assert.equal((casePage.match(/case_related_story_open/g) || []).length, 1, 'case: one related story');
assert.doesNotMatch(casePage, /phone-cta-panel|spacebogam-mobile-actions/, 'case: no phone/sticky CTA markup');
assert.match(casePage, /"isRelatedTo":/, 'case: structured relation');

const list = read('blog.html');
assert.equal((list.match(/blog_case_open/g) || []).length, 2, 'blog list: mapped case links');
assert.equal((list.match(/blog_consult_click/g) || []).length, 2, 'blog list: header plus one body consultation');
assert.match(list, /"@type":"ItemList"/, 'blog list: ItemList');
for (const story of stories) assert.match(list, new RegExp(image), `${story}: approved list image`);

for (const story of stories) {
  const html = read(`blog/${story}.html`);
  const json = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1])).find(item => item['@type'] === 'BlogPosting');
  assert.ok(json?.headline && json?.datePublished && json?.image && json?.author && json?.mainEntityOfPage, `${story}: BlogPosting fields`);
  // qa-entry-url-allow: JSON-LD image 절대경로 비교용 문자열이다. 유입 URL 이 아니라 표식 대상이 아니다.
  assert.equal(json.image, `https://spacebogam.kr/${image}`, `${story}: approved structured image`);
  assert.equal((html.match(/blog_case_open/g) || []).length, 1, `${story}: one case link`);
  assert.equal((html.match(/blog_consult_click/g) || []).length, 2, `${story}: header plus one body consultation`);
  assert.doesNotMatch(html, new RegExp(`/assets/blog/${story}-`), `${story}: unapproved images removed`);
}

const tracking = read('assets/blog-conversion.js');
for (const field of ['page_path', 'link_url', 'story_id', 'case_id', 'placement', 'device_class']) assert.match(tracking, new RegExp(`${field}:`), `tracking: ${field}`);
const sitemap = read('sitemap.xml');
for (const story of stories) {
  assert.equal((sitemap.match(new RegExp(story, 'g')) || []).length, 1, `${story}: one sitemap URL`);
  assert.match(sitemap, new RegExp(`${story}\\.html</loc>\\s*<lastmod>2026-08-01</lastmod>`), `${story}: sitemap refreshed`);
}

assert.match(read('index.html'), /home_portfolio_cta_click/, 'home: existing event preserved');
console.log('CMP-846 PASS: approved links, CTA bounds, events, SEO and rollback invariants');
