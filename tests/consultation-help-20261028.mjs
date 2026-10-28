import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {withTestBrowser} from '/Users/changseok/.codex/browser-testing.mjs';
const root=resolve('artifacts/consultation-help-20261028');
const live=process.env.CONSULTATION_LIVE==='1';
const candidate=resolve(process.env.CONSULTATION_CANDIDATE_ROOT||root+'/candidate');
const origin='https://spacebogam.kr';
await mkdir(root+'/qa',{recursive:true});
await withTestBrowser(async(context,selection)=>{
 const writes=[];
 const snapshots=[];
 await context.route('**/*',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(request.method()!=='GET') {
   writes.push({url:request.url(),method:request.method()});
   // No production submission: only the test-instrumented preview can return a receipt.
   if(!live && url.pathname==='/api/consultation/submit')return route.fulfill({json:{success:true,consultReqId:987654}});
   return route.abort();
  }
  if(url.origin!==origin)return route.abort();
  if(!live){
   const path=url.pathname==='/consultation/'?'consultation/index.html':url.pathname.slice(1);
   if(['consultation/index.html','assets/consultation-help.css','reports/consultation-step-prototype-20260928/flow.js'].includes(path)){
    let body=await readFile(candidate+'/'+path,'utf8');
    if(path.endsWith('flow.js'))body=body.replace(/\}\)\(\);\s*$/,"window.__consultationTest={summary(){answers.consent=true;current='summary';render();}};})();");
    return route.fulfill({body,contentType:extname(path)==='.html'?'text/html':extname(path)==='.css'?'text/css':'text/javascript'});
   }
  }
  return route.continue();
 });
 for(const width of [360,390,1440]){
  const page=await context.newPage();await page.setViewportSize({width,height:844});
  await page.goto(origin+'/consultation/?is_test=1&utm_campaign=qa_consultation_help');
  const help=page.locator('#consultation-help');await help.waitFor({state:'visible'});
  const channel=new URL(await help.getAttribute('href'));
  assert.equal(channel.hostname,'pf.kakao.com');assert.equal(channel.pathname,'/_UEUBn/chat');
  assert.equal(await help.getAttribute('target'),'_blank');
  const box=await help.boundingBox();assert(box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=width);
  assert(await help.locator('svg').isVisible());
  await page.screenshot({path:root+`/qa/${live?'live':'preview'}-${width}.png`,fullPage:true});
  await page.locator('#stage button').filter({hasText:'상업 공간'}).click();
  const first=page.locator('#stage input,#stage textarea').first();
  assert(await first.evaluate(el=>el===document.activeElement));
  await page.keyboard.insertText('포커스 테스트');
  await page.locator('#next').click();
  assert(await page.locator('#stage input').first().evaluate(el=>el===document.activeElement));
  assert(await help.isVisible());
  await page.locator('#back').click();
  assert(await first.evaluate(el=>el===document.activeElement));
  assert.equal(await first.inputValue(),'포커스 테스트');
  if(!live){
   // Model the visual viewport change; desktop emulation cannot show a native phone keyboard.
   await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:400});window.visualViewport.dispatchEvent(new Event('resize'));});
   assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--consult-keyboard-inset')), '444px');
   await page.evaluate(()=>window.__consultationTest.summary());
   assert(await help.isVisible());
   await page.locator('#next').click();
   await help.waitFor({state:'hidden'});
   assert((await page.locator('#stage').innerText()).includes('987654'));
   await page.locator('#restart').click();assert(await help.isVisible());
  }
  snapshots.push({width,forwardFocus:true,backFocus:true,helpVisible:true,completionHidden:!live,keyboardHardwareVerified:false});
  await page.close();
 }
 if(live)assert(writes.every(r=>!r.url.includes('/api/consultation/submit')));
 const result={mode:live?'public':'intercepted-preview',browser:selection.browser,snapshots,realSubmissions:0};
 await writeFile(root+`/qa/${live?'live':'preview'}-result.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
});
