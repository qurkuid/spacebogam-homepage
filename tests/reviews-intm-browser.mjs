import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {withTestBrowser} from '/Users/changseok/.codex/browser-testing.mjs';
const evidence=resolve('artifacts/customer-reviews-20261104/intm-qa');await mkdir(evidence,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'reviews-intm-browser-'));
const tokenFile=join(temp,'token');await writeFile(tokenFile,'a'.repeat(64),{mode:0o600});
const id=randomUUID();let submissions=0;
const review={id,kind:'customer_review',status:'approved',rating:4,title:'검증용 현장 사진 첨부 후기',body:'이 글은 임시 브라우저 검증 데이터입니다. 운영 사이트와 고객 데이터에는 저장하지 않습니다.',nickname:'검증용별명',space:'apartment',experienceMonth:'2026-10',publishedAt:'2026-11-04T00:00:00.000Z',customerId:'fixture-opaque',sourceLabel:'고객 작성 · 문장 정리',editedByOperator:true,images:Array.from({length:4},(_,n)=>({url:`https://intm.kr/api/uploads/review-fixture-${n}.png`,alt:`검증 사진 ${n+1}`}))};
const upstream=createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET')return res.end(JSON.stringify({version:2,reviews:[review]}));
 assert.equal(req.headers.origin,'https://spacebogam.kr');assert.equal(req.headers.authorization,`Bearer ${'a'.repeat(64)}`);let text='';for await(const c of req)text+=c;
 const body=JSON.parse(text);assert.equal(body.rating,2);assert(body.body.includes('임시'));
 submissions++;res.statusCode=201;res.end(JSON.stringify({id:randomUUID(),status:'received'}));
});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(done=>reservation.close(done));
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['ops/spacebogam-serve.js'],{env:{...process.env,ROOT:resolve('.'),PORT:String(port),REVIEWS_FILE:join(temp,'reviews.json'),REVIEWS_PUBLIC_ORIGIN:origin,INTM_REVIEWS_ORIGIN:`http://127.0.0.1:${upstream.address().port}`,INTM_REVIEWS_TOKEN_FILE:tokenFile},stdio:['ignore','pipe','pipe']});
try{
 await once(server.stdout,'data');
 await withTestBrowser(async(context,selection)=>{
  const startCount=submissions;
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith('https://intm.kr/api/uploads/review-fixture-'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
   return new URL(url).origin===origin?route.continue():route.abort();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [360,390,768,1440]){
   await page.setViewportSize({width,height:900});await page.goto(`${origin}/reviews/${id}/`);
   assert.equal(await page.locator('.rv-images img').count(),4);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${evidence}/photos-${width}.png`,fullPage:true});
  }
  await page.goto(origin+'/reviews/');assert.equal(await page.locator('.rv-card .rv-images img').count(),1);
  await page.getByRole('link',{name:'나의 경험 남기기'}).click();
  await page.getByRole('radio',{name:'2점 · 아쉬웠어요',exact:true}).check();
  await page.locator('[name=nickname]').fill('검증별명');await page.locator('#review-form [name=space]').selectOption('apartment');
  await page.locator('[name=experienceMonth]').fill('2026-10');await page.locator('[name=title]').fill('임시 브라우저 접수 검증');
  await page.locator('[name=body]').fill('임시 검증용 접수입니다. 실제 고객 후기를 대신하지 않으며 종료 후 모두 제거됩니다.');
  await page.locator('[name=consent]').check();await page.locator('#review-submit').click();await page.getByRole('status').filter({hasText:'후기가 접수되었습니다'}).waitFor();
  assert.equal(submissions,startCount+1);assert.deepEqual(errors,[]);
  const result={browser:selection.browser,widths:[360,390,768,1440],photos:4,previewPhotos:1,intmProxySubmission:'passed',realCustomerWrites:0,runtimeErrors:errors};
  await writeFile(`${evidence}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 });
}finally{
 const stopped=once(server,'exit');server.kill();await stopped;upstream.closeAllConnections();await new Promise(done=>upstream.close(done));await rm(temp,{recursive:true,force:true});
}
