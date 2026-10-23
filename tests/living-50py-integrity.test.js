const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('50py landing shows only actual 50-59py completed cases, and explains adjacent 49py separately', () => {
 const page=read('living-50py.html');
 const cards=[...page.matchAll(/<a class="card portfolio-card"[^>]*href="([^"]+)"[\s\S]*?<\/a>/g)].map(m=>({href:m[1],html:m[0]}));
 assert.equal(cards.length,3);
 const desired={
  'case-guseo-ssangyong-sweetdot-home.html':'50평',
  'case-guseo-ssangyong.html':'58평',
  'case-oryukdo-sk-view.html':'59평',
 };
 assert.deepEqual(cards.map(c=>c.href).sort(), Object.keys(desired).sort());
 for(const {href,html} of cards){
   assert.ok(html.includes(desired[href]),href);
   assert.ok(!html.includes('삼한골든뷰센트럴파크'),href);
   const caseHTML=read(href);
   assert.ok(caseHTML.includes(desired[href]),'Missing matching case detail '+href);
 }
 assert.ok(!page.includes('href="case-samhan-goldenview.html"'), '35py case must not be presented as 50py');
 assert.ok(page.includes('49평 해운대 리모델링도 함께 보기'), 'Near 50py only in separately marked reference');
 assert.ok(!cards.some(c=>c.href==='case-mega-centum-49py.html'));
 assert.ok(page.includes('실제 50평대')||page.includes('50평대 아파트 실제 시공 사례'));
});

test('size-corrected landing keeps search metadata, conversion tracking and canonicals',()=>{
 const html=read('living-50py.html');
 const doc=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(doc['@type'],'WebPage');
 assert.equal(doc.url,'https://spacebogam.kr/living-50py.html');
 assert.ok(doc.description.includes('구서 쌍용스윗닷홈 50평'));
 assert.match(html, /<link\b(?=[^>]*\brel="canonical")(?=[^>]*\bhref="https:\/\/spacebogam\.kr\/living-50py\.html")[^>]*>/);
 for(const value of ['GTM-PW8GLP8S','G-EJGXDD5C1T','512750840350337','/consultation/']) assert.ok(html.includes(value));
 const sitemap=read('sitemap.xml');
 const entry=[...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m=>m[1]).find(s=>s.includes('<loc>https://spacebogam.kr/living-50py.html</loc>'));
 assert.ok(entry && entry.includes('<lastmod>2026-10-23</lastmod>'));
});
