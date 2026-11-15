const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../assets/funnel-tracking.js'),'utf8');
const start=source.indexOf('  function storedId('),end=source.indexOf('\n  //',start);
const fresh='a6e230e1-2e19-498f-bd93-88729191fb24',good='CF1FF804-EE31-470C-9790-6D5255E805A1';
const ctx={uuid:()=>fresh}; vm.runInNewContext(source.slice(start,end),ctx);
let passed=0;
for(const old of [null,'','bad-id','undefined','null','123',good]){let stored=old;const storage={getItem:()=>stored,setItem:(k,v)=>stored=v};assert.equal(ctx.storedId(storage,'key'),old===good?good:fresh);assert.equal(stored,old===good?good:fresh);passed++}
assert.equal(ctx.storedId(null,'k'),fresh);passed++;
assert.equal(ctx.storedId({getItem(){throw Error('blocked')}},'k'),fresh);passed++;
assert.equal(ctx.storedId({getItem:()=>null,setItem(){throw Error('blocked')}},'k'),fresh);passed++;
console.log('PASS',passed,'storage identity checks');
const flow=fs.readFileSync(require('path').join(__dirname,'../reports/consultation-step-prototype-20260928/flow.js'),'utf8');
const flowContext={id:()=>fresh,stored:(store,key)=>{try{return store.getItem(key)}catch{return null}}};
vm.runInNewContext(flow.slice(flow.indexOf('  function savedId('),flow.indexOf('  const clientId =')),flowContext);
for(const old of [null,'','bad-id','undefined','null','123',good]){let value=old;const storage={getItem:()=>value,setItem:(_k,v)=>value=v};assert.equal(flowContext.savedId(storage,'key'),old===good?good:fresh);assert.equal(value,old===good?good:fresh);}
assert.equal(flowContext.savedId({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},'key'),fresh);
console.log('PASS 8 form storage identity checks');
