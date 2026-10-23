const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const slug='case-oryukdo-sk-view.html';
test('Oryukdo repeated official size evidence cannot regress to the unsupported raw label or budget',()=>{
 const html=read(slug),evidence=JSON.parse(read('data/cases/blog-oryukdo-evidence-20261023.json'));
 assert.equal(evidence.publicSize,'59평');assert.equal(evidence.sizeEvidence.length,2);assert.equal(evidence.photoIdentity.matchingActivePortfolioOriginalNames,29);
 assert.ok(!/49평|40평|1억|별도의 글 기록 없이/.test(html));
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(schema['@type'],'Article');assert.ok(schema.headline.includes('59평'));assert.equal(schema.image.length,27);assert.equal(schema.hasPart.length,7);
 const gallery=html.split('class="case-gallery"')[1].split('</section>')[0];assert.equal((gallery.match(/<figcaption>/g)||[]).length,27);
 assert.equal(evidence.photoIdentity.legacyGalleryRetained,23);assert.equal(evidence.addedPhotos.length,4);
 for(const p of evidence.addedPhotos){assert.ok(fs.existsSync(path.join(root,p.asset)));assert.ok(p.originalStem.startsWith('BAE'));}
 for(const id of evidence.sourceIds)assert.ok(html.includes('https://blog.naver.com/baek1985/'+id));
 assert.ok(html.includes('제작 결과로 단정하지 않았습니다'));
});
test('Oryukdo size classification agrees across public entry points',()=>{
 const forty=read('living-40py.html'),fifty=read('living-50py.html'),portfolio=read('portfolio.html'),cost=read('guide-apartment-cost.html');
 const cardPattern=/<a class="card portfolio-card"[^>]*href="case-oryukdo-sk-view\.html"/g;
 assert.equal((forty.match(cardPattern)||[]).length,0);assert.equal((fifty.match(cardPattern)||[]).length,1);
 assert.ok(portfolio.includes('59평 · 사진 27장'));assert.ok(!cost.includes('<u>오륙도'));assert.ok(cost.includes('확인되지 않은 해당 사례 금액을 제외'));
});
