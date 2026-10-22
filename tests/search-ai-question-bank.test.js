const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const bank = JSON.parse(fs.readFileSync(path.join(root,'tests/search-ai-visibility-queries-20261023.json'),'utf8'));
const obs = JSON.parse(fs.readFileSync(path.join(root,'reports/search-ai-observations-20261023.json'),'utf8'));

test('benchmark keeps independent blind prompts separate from branded controls',()=>{
 assert.equal(bank.organicQueries.length,35);
 assert.equal(bank.aiPrompts.length,22);
 assert.equal(bank.organicQueries.filter(q=>q.focus==='neutral').length,31);
 assert.equal(bank.aiPrompts.filter(q=>q.focus==='neutral').length,20);
 const ids=[...bank.organicQueries,...bank.aiPrompts].map(q=>q.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const q of bank.organicQueries.filter(q=>q.focus==='neutral')) assert.doesNotMatch(q.query, /공간보감|디자인해랑/i, q.id);
 for(const q of bank.aiPrompts.filter(q=>q.focus==='neutral')) assert.doesNotMatch(q.prompt, /공간보감|디자인해랑/i, q.id);
});

test('observed search results are evidence limited and independent LLM outputs are explicitly unrun',()=>{
 assert.equal(obs.organic.length,35);
 const tested=obs.organic.filter(r=>r.status==='observed_web_sample');
 assert.equal(tested.length,13);
 assert.equal(tested.filter(x=>x.spacebogam_found).length,5);
 assert.equal(tested.filter(x=>x.haerang_found).length,1);
 assert.equal(tested.filter(x=>!x.spacebogam_found&&!x.haerang_found).length,7);
 for(const x of tested){
   assert.equal(x.focus,'neutral');
   assert.ok(Array.isArray(x.observed_url_samples));
 }
 assert.equal(obs.ai.length,22);
 for(const x of obs.ai){
   assert.equal(x.status,'not_run_external_ai');
   assert.deepEqual(x.modelOutputs,[]);
 }
 assert.match(obs.protocol, /NOT.*rank/i);
});
