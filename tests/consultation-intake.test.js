const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Element } = require('./helpers/consultation-dom');
const sourceRoot = path.join(__dirname, '../reports/consultation-step-prototype-20260928');
const storage = () => { const values = new Map(); return { getItem:key=>values.get(key)||null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) }; };
function harness(search = '', sessionQa = false) {
  const nodes = Object.fromEntries(['stage','next','back','skip','restart','progress-fill'].map(id=>[id,new Element()]));
  const progress = new Element(), script = new Element('script');
  const document = { getElementById:id=>nodes[id], querySelector:selector=>selector==='.progress'?progress:selector.includes('script')?script:null,
    createElement:tag=>new Element(tag),createTextNode:value=>Object.assign(new Element('#text'),{textContent:value}),head:new Element('head') };
  const ads=[],events=[],requests=[],timers=new Map();let mode='success',timerId=0;
  const sessionStorage=storage();if(sessionQa)sessionStorage.setItem('spacebogam_funnel_is_test','true');
  const context={document,window:{SB_APT_INDEX:[],wcs:{trans:value=>ads.push(['naver',value])}},location:{search,pathname:'/consultation/',href:'https://spacebogam.kr/consultation/'+search},
    innerWidth:375,localStorage:storage(),sessionStorage,URLSearchParams,AbortController,crypto:require('node:crypto').webcrypto,
    setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    gtag:(...args)=>events.push(args),fbq:(...args)=>ads.push(['meta',...args]),
    fetch:(url,options={})=>{
      if (!url.endsWith('/api/consultation/submit')) { requests.push({url,body:options.body});return Promise.resolve({ok:true,json:async()=>({questions:[]})}); }
      requests.push({url,body:options.body});
      if(mode==='pending')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('mock timeout'),{name:'AbortError'}))));
      return Promise.resolve({ok:mode==='success',status:mode==='success'?201:500,json:async()=>mode==='success'?{success:true,consultReqId:'MOCK-ONLY'}:{success:false,error:'must not leak private server text'}});
    }};
  for(const file of ['apt-busan-dongs.js','consultation-questions.js','flow.js'])vm.runInNewContext(fs.readFileSync(path.join(sourceRoot,file),'utf8'),context);
  return {nodes,context,ads,events,requests,timers,script,setMode:value=>{mode=value;}};
}
const flush=async()=>{for(let i=0;i<18;i++)await Promise.resolve();};
function fillMinimum(h,commercial=false) {
  const {nodes}=h;nodes.next.click();nodes.stage.querySelectorAll('.choice')[commercial?1:0].click();
  if(!commercial)nodes.stage.querySelectorAll('.choice')[1].click();
  for(const value of ['모의 신청자','01000000000','부산 모의주소 123']){nodes.stage.querySelector('.question-input').input(value);nodes.next.click();}
  assert.match(nodes.stage.children[1].textContent,/상담 준비/);
  nodes.stage.querySelector('.consent').querySelector('input').change(true);nodes.next.click();
  assert.match(nodes.stage.children[1].textContent,/입력 내용을 확인/);
}
test('minimum residential and commercial payloads contain only real basic answers and keep events valid',async()=>{
  for(const commercial of [false,true]){
    const h=harness();fillMinimum(h,commercial);h.nodes.next.click();h.nodes.next.click();await flush();
    const submits=h.requests.filter(r=>r.url.endsWith('/api/consultation/submit'));assert.equal(submits.length,1);
    const data=JSON.parse(submits[0].body);assert.equal(data.type,'intake');assert.equal(data.intake.spaceType,commercial?'commercial':'house');assert.equal(data.intake.consent,true);
    assert.equal(data.answers,undefined);assert.equal(data.commercialLead,undefined);
    assert.equal(h.ads.filter(e=>e[0]==='naver').length,1);assert.equal(h.context.window.wcs_add.wa,'s_7702568df18');
    assert.equal(h.ads.filter(e=>e[0]==='meta'&&e[2]==='Lead').length,1);
    assert.equal(h.events.filter(e=>e[1]==='lead_submit_success').length,1);
    assert.ok(h.events.some(e=>e[1]==='consult_complete_intro'));
    assert.ok(h.events.every(e=>/^[a-z][a-z0-9_]*$/.test(e[1])));
    assert.ok(!JSON.stringify(h.events).includes('모의 신청자'));assert.ok(!JSON.stringify(h.events).includes('01000000000'));
  }
});
test('query and persisted QA sessions exclude Naver, Meta and GA conversions',async()=>{
  for(const [query,session] of [['?is_test=true',false],['',true]]){
    const h=harness(query,session);fillMinimum(h);h.nodes.next.click();await flush();
    assert.equal(h.ads.length,0);assert.equal(h.events.filter(e=>e[1]==='lead_submit_success').length,0);
    assert.equal(JSON.parse(h.requests.find(r=>r.url.endsWith('/api/consultation/submit')).body).marketingAttribution.is_test,'true');
  }
});
test('response failure and timeout retain identical submission for a safe retry',async()=>{
  for(const mode of ['server','pending']){
    const h=harness();fillMinimum(h);h.setMode(mode);h.nodes.next.click();await flush();
    if(mode==='pending'){assert.equal(h.nodes.next.disabled,true);const timeout=[...h.timers.values()].find(t=>t.delay===30000);assert.ok(timeout);timeout.fn();await flush();}
    assert.equal(h.nodes.next.disabled,false);assert.equal(h.nodes.back.disabled,true);assert.match(h.nodes.next.textContent,/결과 다시 확인/);
    assert.ok(!h.nodes.stage.querySelector('.error').textContent.includes('private server'));
    h.setMode('success');h.nodes.next.click();await flush();const submits=h.requests.filter(r=>r.url.endsWith('/api/consultation/submit'));
    assert.equal(submits.length,2);assert.equal(submits[0].body,submits[1].body);assert.match(h.nodes.stage.children[1].textContent,/접수되었습니다/);
    assert.equal(h.events.filter(e=>e[1]==='consult_submit_failure').length,1);
  }
});
test('late Naver SDK sends once using the existing script',async()=>{
  const h=harness();delete h.context.window.wcs;fillMinimum(h);h.nodes.next.click();await flush();assert.equal(h.ads.some(e=>e[0]==='naver'),false);
  h.context.window.wcs={trans:value=>h.ads.push(['naver',value])};h.script.listeners.load();
  assert.equal(h.ads.filter(e=>e[0]==='naver').length,1);assert.equal(h.context.window.wcs_add.wa,'s_7702568df18');
});
