import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withTestBrowser} from '/Users/changseok/.codex/browser-testing.mjs';
const base=process.env.CONSULTATION_ORIGIN||'http://127.0.0.1:4352';
const out='artifacts/consultation-occupancy-20261029/'+(base.startsWith('http:')?'local':'live');await mkdir(out,{recursive:true});
await withTestBrowser(async(context,selection)=>{
 const results=[];context.setDefaultTimeout(10000);
 await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
 for(const width of [390,881,1280]){
  const page=await context.newPage();await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/consultation/?is_test=1&type=residential');
  const state=()=>page.locator('#answer-currentState');const date=()=>page.locator('#answer-measurementAvailableDate');
  assert.deepEqual(await state().locator('option').allTextContents(),['선택해 주세요','공실','세입자 거주중(실측가능)','세입자 거주중(실측불가)','현재 거주중']);
  assert.equal(await date().count(),0);
  await state().selectOption('tenant_unmeasurable');assert(await date().isVisible());assert.equal(await date().getAttribute('type'),'date');assert(await date().getAttribute('min'));
  await date().fill('2030-01-15');await page.reload();assert.equal(await state().inputValue(),'tenant_unmeasurable');assert.equal(await date().inputValue(),'2030-01-15');
  await page.screenshot({path:out+'/'+width+'-residential.png',fullPage:true});
  await page.locator('#next').click();assert.equal(await date().count(),0,'date stays on page 1');await page.locator('#back').click();assert.equal(await date().inputValue(),'2030-01-15');
  for(const option of ['vacant','tenant_measurable','owner_occupied']){await state().selectOption(option);assert.equal(await date().count(),0);}
  await state().selectOption('tenant_unmeasurable');assert.equal(await date().inputValue(),'','hidden date is cleared');await date().fill('2030-01-15');
  await page.locator('#space-type-commercial').click();assert.equal(await date().count(),0);assert.deepEqual(await state().locator('option').allTextContents(),['선택해 주세요','공실이에요','거주·영업 중이에요','신축·무마감이에요','기존 인테리어 철거 예정이에요']);
  await state().selectOption('shell');await page.locator('#space-type-residential').click();assert.equal(await state().inputValue(),'');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  results.push({width,conditionalDate:true,draftRestoration:true,hiddenDateCleared:true,commercialPreserved:true,errors});await page.close();
 }
 await writeFile(out+'/result.json',JSON.stringify({browser:selection.browser,results},null,2));console.log(JSON.stringify({browser:selection.browser,origin:base,results}));
});
