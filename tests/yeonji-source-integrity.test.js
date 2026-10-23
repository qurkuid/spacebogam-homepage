const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('Yeonji publishes verified official photos and excludes mismatched raw rows',()=>{
 const slug='case-yeonji-yurim-norwegian-forest.html',html=read(slug);
 const evidence=JSON.parse(read('data/cases/blog-yeonji-evidence-20261023.json'));
 assert.equal(evidence.publicArea,'30평대');
 assert.equal(evidence.excludedIntmPhotos,14);assert.equal(evidence.matchedIntmPhotos,0);
 assert.equal(evidence.photos.length,12);assert.equal(evidence.beforePhotos.length,4);
 for(const photo of [...evidence.photos,...evidence.beforePhotos]){
  assert.equal(photo.sourceId,'224227103387');
  assert.ok(fs.existsSync(path.join(root,photo.asset)));assert.ok(html.includes(photo.asset));
 }
 const article=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'][0];
 assert.equal(article.hasPart.length,7);assert.equal(article.image.length,12);
 assert.ok(html.includes('하부장과 키큰장'));assert.ok(html.includes('9mm 문선'));
 assert.ok(!/30평형|4주|Basic|LG|현대|INTM|e432fad9/.test(html));
 assert.ok(read('living-30py.html').includes(slug));assert.ok(read('sitemap.xml').includes(slug));
});
