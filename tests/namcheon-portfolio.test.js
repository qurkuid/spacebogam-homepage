const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const slug='case-namcheon-exllu-56py.html';
test('portfolio visible project/photo counts and schema stay consistent with actual cards',()=>{
 const html=read('portfolio.html');
 const list=html.split('id="project-list"')[1].split('</section>')[0];
 const cards=[...list.matchAll(/<article\b/g)].length;
 const photos=[...list.matchAll(/사진 (\d+)장/g)].reduce((n,m)=>n+Number(m[1]),0);
 assert.ok(html.includes(`${cards}개 현장 · ${photos}장의 완성 사진`));
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(schema.mainEntity.numberOfItems,cards);assert.equal(schema.mainEntity.itemListElement.length,cards);
 assert.equal(schema.mainEntity.itemListElement.filter(x=>x.url==='https://spacebogam.kr/'+slug).length,1);
});
test('new case has real local gallery assets and source-backed historical specifications',()=>{
 const html=read(slug);const source=JSON.parse(read('data/cases/blog-namcheon-evidence-20261023.json'));
 assert.equal(source.sourceId,'223827060300');assert.equal(source.sections.length,7);assert.equal(source.photos.length,12);
 const section=html.match(/<div class="case-gallery">([\s\S]*?)<\/div>/);assert.ok(section,'gallery');
 const paths=[...section[1].matchAll(/<a href="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(paths).size,12);
 for(const p of paths)assert.ok(fs.existsSync(path.join(root,p.replace(/^\//,''))),p);
 assert.ok(html.includes('5m'));assert.ok(html.includes('마블러스 젠'));assert.ok(html.includes('디아망 회벽'));
 assert.ok(!html.includes('빛이 충분하지 않은 복도'),'do not turn general corridor advice into this site condition');
 assert.ok(html.includes('https://blog.naver.com/baek1985/'+source.sourceId));
 const canonical=html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);assert.equal(canonical?.[1],'https://spacebogam.kr/'+slug);
});
