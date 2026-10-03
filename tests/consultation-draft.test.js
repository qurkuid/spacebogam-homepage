const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Element } = require('./helpers/consultation-dom');
const root = path.join(__dirname, '../reports/consultation-step-prototype-20260928');
const key = 'spacebogam.consultationDraft.v1';
function storage() { const values = new Map(); return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) }; }
function mount(session = storage(), local = storage()) {
  const nodes = Object.fromEntries(['stage','next','back','skip','restart','progress-fill'].map(id => [id, new Element()]));
  const progress = new Element();
  const document = { getElementById: id => nodes[id], querySelector: s => s === '.progress' ? progress : null, createElement: tag => new Element(tag), createTextNode: value => Object.assign(new Element('#text'), { textContent: value }), head: new Element('head') };
  const window = { SB_APT_INDEX: [] };
  const context = { document, window, location: { search:'?is_test=1', pathname:'/consultation/', href:'https://spacebogam.kr/consultation/?is_test=1' }, innerWidth:390, sessionStorage:session, localStorage:local, URLSearchParams, AbortController, setTimeout, clearTimeout, crypto:require('node:crypto').webcrypto, URL:{revokeObjectURL(){}} };
  for (const name of ['consultation-questions.js','flow.js']) vm.runInNewContext(fs.readFileSync(path.join(root,name),'utf8'),context);
  return { nodes, session, local, title: () => nodes.stage.children[1].textContent, input: () => nodes.stage.querySelector('.question-input'), start() { nodes.next.click(); nodes.stage.querySelectorAll('.choice')[0].click(); nodes.stage.querySelectorAll('.choice')[1].click(); } };
}
test('reload restores current input and previous answers from session draft', () => {
  const app=mount();app.start();app.input().input('QA draft');app.nodes.stage.listeners.input({});
  let reload=mount(app.session, app.local);assert.equal(reload.input().value,'QA draft');reload.nodes.next.click();reload.input().input('01000000000');reload.nodes.stage.listeners.input({});
  reload=mount(app.session, app.local);assert.equal(reload.input().value,'01000000000');reload.nodes.back.click();assert.equal(reload.input().value,'QA draft');assert.equal(app.local.getItem(key),null);
});
test('restart removes draft and returns to introduction', () => { const app=mount();app.start();assert.ok(app.session.getItem(key));app.nodes.restart.click();assert.equal(app.session.getItem(key),null);assert.match(app.title(),/공간보감에서는 이렇게 상담/); });
test('expired draft is discarded', () => { const app=mount();app.start();const draft=JSON.parse(app.session.getItem(key));draft.updatedAt=Date.now()-3*60*60*1000;app.session.setItem(key,JSON.stringify(draft));const reload=mount(app.session);assert.match(reload.title(),/공간보감에서는 이렇게 상담/);assert.equal(app.session.getItem(key),null); });
test('malformed or incompatible draft is discarded', () => { for(const value of ['{invalid',JSON.stringify({version:0}),JSON.stringify({version:1,updatedAt:Date.now(),answers:{responses:{}},current:'unknown'})]) { const session=storage();session.setItem(key,value);const app=mount(session);assert.match(app.title(),/공간보감에서는 이렇게 상담/);assert.equal(session.getItem(key),null); } });
test('pending request restores summary and freezes editing without submitting', () => { const app=mount();app.start();const draft=JSON.parse(app.session.getItem(key));draft.pendingBody=JSON.stringify({eventId:'QA-SAME-ID'});app.session.setItem(key,JSON.stringify(draft));const reload=mount(app.session);assert.match(reload.title(),/입력 내용을 확인/);assert.equal(reload.nodes.back.disabled,true);assert.equal(reload.nodes.restart.disabled,true);assert.equal(reload.nodes.next.disabled,false);assert.match(reload.nodes.next.textContent,/다시 확인/);assert.equal(JSON.parse(app.session.getItem(key)).pendingBody,draft.pendingBody); });
test('blocked storage still permits minimal intake', () => { const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};const app=mount(blocked,blocked);app.start();app.input().input('QA blocked');app.nodes.next.click();assert.match(app.title(),/연락처/); });
