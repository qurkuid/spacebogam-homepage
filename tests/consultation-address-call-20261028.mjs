import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {withTestBrowser} from '/Users/changseok/.codex/browser-testing.mjs';
const root=resolve('artifacts/consultation-address-search-only-20261028');
const candidate=resolve(process.env.CONSULTATION_CANDIDATE_ROOT||root+'/candidate');
const live=process.env.CONSULTATION_LIVE==='1';
const realSdk=process.env.CONSULTATION_REAL_SDK==='1';
const origin='https://spacebogam.kr';
await mkdir(root+'/qa',{recursive:true});
await withTestBrowser(async(context,selection)=>{
 const writes=[];const failedRequests=[];let failSdk=false;
 context.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()!=='GET'){writes.push(url.href);return route.abort();}
  if(url.href==='https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'){
   if(realSdk)return route.continue();
   if(failSdk)return route.abort();
   return route.fulfill({contentType:'text/javascript',body:`window.kakao=window.kakao||{};window.kakao.Postcode=function(options){window.__postcode=options;this.embed=function(host){host.textContent='주소 검색 테스트';options.onresize({height:480});};};`});
  }
  if(url.origin!==origin){
   if(realSdk&&/(^|\.)(kakao\.com|kakaocdn\.net|daum\.net|daumcdn\.net)$/.test(url.hostname))return route.continue();
   return route.abort();
  }
  const path=url.pathname==='/consultation/'?'consultation/index.html':url.pathname.slice(1);
  if(!live&&['consultation/index.html','assets/consultation-help.css','reports/consultation-step-prototype-20260928/flow.js'].includes(path)){
   let body=await readFile(candidate+'/'+path,'utf8');
   if(path.endsWith('flow.js'))body=body.replace(/\}\)\(\);\s*$/,"window.__addressPayload=()=>submissionPayload(null);})();");
   return route.fulfill({body,contentType:extname(path)==='.html'?'text/html':extname(path)==='.css'?'text/css':'text/javascript'});
  }
  return route.continue();
 });
 const results=[];
 for(const width of realSdk?[390]:[390,1440]){
  const page=await context.newPage();await page.setViewportSize({width,height:844});
  await page.goto(origin+'/consultation/?is_test=1&utm_campaign=qa_address_call');
  const noExposedNumber=async()=>{
   assert(!/1551[-\s]?0163|0507[-\s]?1388[-\s]?1252/.test(await page.locator('body').innerText()));
   const labels=await page.locator('[aria-label]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')).join(' '));
   assert(!/1551|0507/.test(labels));
   for(const link of await page.locator('a[href^="tel:"]').all())assert.equal(await link.getAttribute('href'),'tel:050713881252');
  };
  await noExposedNumber();
  await page.locator('#stage button').filter({hasText:'상업 공간'}).click();
  await page.locator('#stage input:not(#commercial-address-detail)').fill('주소 검색 검증');await page.locator('#next').click();
  await page.locator('#stage input:not(#commercial-address-detail)').fill('010-0000-0000');await page.locator('#next').click();
  await page.locator('#stage select').selectOption('shop');
  await page.locator('.commercial-address-search').waitFor();
  const base=page.locator('#stage input:not(#commercial-address-detail)');
  assert(await base.evaluate(e=>e.readOnly));
  await base.focus();await page.keyboard.insertText('직접 입력 시도');
  assert.equal(await base.inputValue(),'');
  assert(await page.locator('#next').isDisabled());
  assert(await page.locator('#commercial-address-detail').isDisabled());
  const search=page.locator('.commercial-address-search');
  if(!realSdk){
   failSdk=true;await base.click();
   await page.getByRole('status').filter({hasText:'잠시 후 다시 검색'}).waitFor();
   assert.equal(await base.inputValue(),'');
   assert(await page.locator('#next').isDisabled());
   failSdk=false;
  }
  await search.click();
  if(realSdk){
   const frame=page.frame({url:/^https:\/\/postcode\.map\.kakao\.com\/search/}) || await page.waitForEvent('framenavigated',{predicate:f=>/^https:\/\/postcode\.map\.kakao\.com\/search/.test(f.url()),timeout:15000});
   try { await frame.locator('input:visible').first().waitFor({timeout:12000}); } catch(error) {
    await page.screenshot({path:root+'/qa/sdk-failure-'+selection.browser+'.png',fullPage:true});
    await writeFile(root+'/qa/sdk-failure-'+selection.browser+'.json',JSON.stringify({frames:page.frames().map(f=>f.url()),body:await page.locator('body').innerText(),failedRequests,writes},null,2));
    throw error;
   }
   await frame.locator('input:visible').first().fill('좌동순환로 457');
   await frame.locator('input:visible').first().press('Enter');
   await frame.getByText('부산 해운대구 좌동순환로 457', {exact:false}).first().waitFor({timeout:15000});
   await page.locator('.commercial-address-host').scrollIntoViewIfNeeded();
   await frame.locator('body').screenshot({path:root+'/qa/real-sdk-results.png'});
   await page.screenshot({path:root+'/qa/real-sdk-search.png',fullPage:false});
   await frame.getByText('부산 해운대구 좌동순환로 457 (백송오피스텔)',{exact:false}).first().click();
   await page.locator('#commercial-address-panel').waitFor({state:'hidden'});
   assert((await page.locator('#stage input:not(#commercial-address-detail)').inputValue()).includes('좌동순환로 457'));
   assert(await page.locator('#commercial-address-detail').evaluate(e=>e===document.activeElement));
   assert(await page.locator('#next').isEnabled());
   await page.screenshot({path:root+'/qa/real-sdk-selected.png',fullPage:true});
   results.push({width,realSdkLoaded:true,searchEntered:true,realAddressSelected:true});
  }else{
   await page.waitForFunction(()=>!!window.__postcode);
   assert.equal(await search.getAttribute('aria-expanded'),'true');
   assert(await page.evaluate(()=>window.__postcode.hideMapBtn&&window.__postcode.hideEngBtn));
   await page.evaluate(()=>window.__postcode.oncomplete({address:'부산광역시 해운대구 좌동순환로 457'}));
   assert.equal(await page.locator('#stage input:not(#commercial-address-detail)').inputValue(),'부산광역시 해운대구 좌동순환로 457');
   assert(await page.locator('#commercial-address-detail').evaluate(e=>e===document.activeElement));
   await page.locator('#commercial-address-detail').fill('2층 201호');
   if(!live)assert.equal(await page.evaluate(()=>window.__addressPayload().commercialLead.address),'부산광역시 해운대구 좌동순환로 457 2층 201호');
   assert.equal(await search.getAttribute('aria-expanded'),'false');
   assert(await page.locator('#next').isEnabled());
   await page.screenshot({path:root+`/qa/${live?'live':'preview'}-${width}.png`,fullPage:true});
   await page.locator('#next').click();await page.locator('#back').click();
   assert.equal(await page.locator('#stage input:not(#commercial-address-detail)').inputValue(),'부산광역시 해운대구 좌동순환로 457');
   assert.equal(await page.locator('#commercial-address-detail').inputValue(),'2층 201호');
   await search.click();await page.locator('#commercial-address-panel').waitFor({state:'visible'});
   await page.getByRole('button',{name:'주소 검색 닫기'}).click();
   assert(await search.evaluate(e=>e===document.activeElement));
   await page.evaluate(()=>{window.__postcode=null;});
   await search.click();await page.waitForFunction(()=>!!window.__postcode);
   await page.evaluate(()=>window.__postcode.oncomplete({address:'부산광역시 연제구 해맞이로 23'}));
   assert.equal(await page.locator('#commercial-address-detail').inputValue(),'');
   assert(await page.locator('#next').isEnabled());
   if(!live)assert.equal(await page.evaluate(()=>window.__addressPayload().commercialLead.address),'부산광역시 연제구 해맞이로 23');
   await noExposedNumber();
   assert(await page.locator('#consultation-help').isVisible());
   results.push({width,noExposedNumber:true,phoneTargetCorrect:true,searchOnly:true,sdkFailureAndRetry:true,addressSelection:true,detailAutofocus:true,detailPreserved:true,detailInPayload:!live,backPreservesAnswer:true,closeRestoresFocus:true});
  }
  await page.close();
 }
 assert(!writes.some(url=>url.includes('/api/consultation/submit')));
 const result={mode:live?'public':'intercepted-preview',realSdk,browser:selection.browser,results,realSubmissions:0};
 await writeFile(root+`/qa/${realSdk?'real-sdk':live?'live':'preview'}-result.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
});
