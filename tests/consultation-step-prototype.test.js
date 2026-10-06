const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const canvasScales = [];

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
  }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { this.listeners.click?.({ preventDefault() {} }); }
  input(value) { this.value = value; this.listeners.input?.({}); }
  change(value) { if (this.type === 'checkbox') this.checked = value; else this.value = value; this.listeners.change?.({}); }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.({}); }
  focus() { this.focused = true; }
  getContext() { return { fillRect() {}, translate() {}, scale(x, y) { canvasScales.push([x, y]); }, drawImage() {} }; }
  toBlob(callback, type) { callback(new Blob(['flipped-image'], { type })); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const fieldset = selector.match(/^\[data-question-id="([^"]+)"\]$/);
    const match = node => fieldset ? node.attributes['data-question-id'] === fieldset[1]
      : selector === '[aria-invalid]' ? 'aria-invalid' in node.attributes
      : selector.startsWith('#') ? node.id === selector.slice(1)
      : /^[a-z0-9,]+$/.test(selector) ? selector.split(',').includes(node.tag)
      : selector === '.input-row input' ? node.tag === 'input' && node.parent?.className === 'input-row'
        : node.className.split(' ').includes(selector.slice(1));
    const result = [];
    const visit = node => node.children.forEach(child => { if (match(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
}


const root = path.join(__dirname, '../reports/consultation-step-prototype-20260928');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function storage() { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
function harness({ session = storage(), fetch, search = '?is_test=1&utm_campaign=grouped_qa' } = {}) {
  const nodes = Object.fromEntries(['stage','next','back','skip','restart','progress-fill'].map(id => [id, new Element()]));
  const progress = new Element();
  const context = { document: {
    getElementById: id => nodes[id], querySelector: selector => selector === '.progress' ? progress : null,
    createElement: tag => new Element(tag), createTextNode: value => Object.assign(new Element('#text'), { textContent: value }), head: new Element('head')
  }, window: { SB_APT_INDEX: [], SB_APT_DONGS: {qa:['111동']}, scrolls: [], scrollTo(value) { this.scrolls.push(value); }, addEventListener() {} }, location: { search, pathname: '/consultation/', href: 'http://localhost/consultation/?is_test=1' },
    innerWidth: 390, sessionStorage: session, localStorage: storage(), URLSearchParams, Blob, FormData, AbortController,
    setTimeout, clearTimeout, fetch, crypto: require('node:crypto').webcrypto,
    createImageBitmap: async () => ({ width: 100, height: 80, close() {} }),
    URL: { createObjectURL: file => 'blob:test/' + file.name, revokeObjectURL() {} }
  };
  vm.runInNewContext(read('consultation-questions.js'), context);
  const source = read('flow.js').replace(/\}\)\(\);\s*$/, `window.test = {
    answers: () => answers, current: () => current, questions: questionList, group: groupQuestions,
    payload: submissionPayload, render, validate: questionError, save: saveDraft,
    plan: openPlanPreview, image: imageForSubmission, dong: renderDong, submit: submitConsultation, pending: () => pendingBody
  };})();`);
  vm.runInNewContext(source, context);
  const api = context.window.test;
  const stage = nodes.stage;
  const all = predicate => { const found = []; const visit = node => { if (predicate(node)) found.push(node); node.children.forEach(visit); }; visit(stage); return found; };
  return { context, nodes, api, all, stage, next: () => nodes.next.click(), title: () => stage.children[1].textContent,
    input: (id, value) => { const field = all(node => node.id === 'answer-' + id)[0]; assert.ok(field, 'input ' + id); field.type === 'select' || field.tag === 'select' ? field.change(value) : field.input(value); },
    button: text => { const button = all(node => node.tag === 'button' && (node.textContent === text || node.children.some(child => child.textContent === text)))[0]; assert.ok(button, text); button.click(); },
    error: () => stage.querySelector('#form-error')?.textContent
  };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function fillCore(h) {
  h.next(); assert.equal(h.api.current(), 'contact');
  const first = Array.from(h.api.group(), q => String(q.id));
  assert.deepEqual(first, ['13','10','15','8']);
  h.input('13','테스트'); h.input('10','010-0000-0000'); h.input('15','부산광역시 연제구 해맞이로 23');
  h.next(); assert.equal(h.api.current(), 'planning');
  h.input('5','2099-11-15'); h.input('21','5천만~6천만원');
  h.button('오후 (12시~18시)');
  assert.equal(h.api.current(), 'planning', '답변 후 자동으로 화면을 넘기지 않는다');
  h.input('33','2099-11-16');
  h.button('13:00');
  h.next(); assert.equal(h.api.current(), 'planReview');
  assert.equal(h.nodes.next.disabled, true, '도면을 저장해야 한다');
}
function savePlan(h) {
  const file = Object.assign(new Blob(['qa-image'], { type: 'image/png' }), { name: 'qa-plan.png' });
  h.api.plan({ source: 'upload', file, name: file.name, url: 'blob:test/qa-plan.png', mime: file.type });
  h.button('도면이 맞아요 · 저장하기');
  assert.equal(h.api.current(), 'planReview', '도면 저장 후 같은 화면의 선택 질문을 계속 작성할 수 있다');
  h.next();
  assert.equal(h.api.current(), 'summary');
}
async function run() {
  const mobile = harness();
  mobile.next(); mobile.next();
  assert.ok(mobile.stage.querySelector('#answer-13').focused, '필수 누락 시 실제 입력란에 포커스');
  assert.match(mobile.stage.querySelector('.field-error').textContent, /성함/);
  mobile.input('13', '모바일');
  assert.equal(mobile.stage.querySelector('.field-error'), null, '입력 후 오류 설명 제거');
  mobile.stage.querySelector('#answer-13').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.ok(mobile.stage.querySelector('#answer-10').focused, '키보드 다음 입력 이동');
  const familySession = storage();
  const family = harness({ session:familySession }); fillCore(family);
  family.all(node => node.tag === 'select' && node.children.some(option => option.value === '1인 거주'))[0].change('1인 거주');
  assert.equal(harness({ session:familySession }).api.answers().responses['26'], '1인 거주', '가족 선택 직후 새로고침해도 저장 유지');
  const uploadedDraft = harness(); fillCore(uploadedDraft); savePlan(uploadedDraft);
  Object.assign(uploadedDraft.api.answers().planAttachment, { file:null, filePath:'/api/uploads/consultations/qa.png', flipX:true });
  uploadedDraft.api.render();
  assert.equal(uploadedDraft.stage.querySelector('.summary-plan').src, 'https://intm.kr/api/uploads/consultations/qa.png');
  uploadedDraft.button('도면 다시 확인·반전 수정');
  assert.equal(uploadedDraft.stage.querySelector('.plan-large').style.transform, 'none', '이미 반전된 저장 이미지에 중복 반전하지 않는다');
  assert.ok(uploadedDraft.all(node => node.textContent === '좌우 반전')[0].disabled, '원본 없는 반전 수정은 재업로드 안내');
  uploadedDraft.button('도면이 맞아요 · 저장하기');
  assert.equal(uploadedDraft.api.answers().planAttachment.filePath, '/api/uploads/consultations/qa.png');
  const controls = harness(); fillCore(controls);
  const scrollCount = controls.context.window.scrolls.length;
  controls.api.render();
  assert.equal(controls.context.window.scrolls.length, scrollCount, '같은 화면 재표시 시 스크롤 유지');
  controls.nodes.back.click();
  assert.equal(controls.context.window.scrolls.length, scrollCount + 1, '화면 이동 시 상단부터 표시');
  const choice = controls.all(node => node.tag === 'button' && node.children.some(child => child.textContent === '거실'))[0];
  choice.click(); choice.click();
  assert.ok(controls.all(node => node === choice).length, '선택해도 버튼 DOM과 포커스 유지');
  assert.equal(choice.getAttribute('aria-pressed'), 'false', '같은 복수 선택을 다시 누르면 해제');
  controls.next();
  controls.api.plan({ source:'catalog', row:['검증 단지','qa','주소','64㎡','fph/qa.jpg','plan-qa'], name:'검증 도면', url:'qa.jpg', mime:'image/jpeg' });
  controls.button('확대 +'); controls.button('확대 +');
  assert.equal(controls.stage.querySelector('.plan-zoom-label').textContent, '200%');
  assert.equal(controls.stage.querySelector('.plan-zoom-canvas').style.width, '200%');
  controls.button('확대 +'); controls.button('확대 +');
  assert.equal(controls.stage.querySelector('.plan-zoom-label').textContent, '300%');
  assert.ok(controls.all(node => node.textContent === '확대 +')[0].disabled, '최대 확대 범위에서 비활성');
  controls.button('전체 보기');
  assert.equal(controls.stage.querySelector('.plan-zoom-label').textContent, '100%');
  controls.button('좌우 반전'); controls.button('닫기 ×');
  assert.equal(controls.api.answers().planAttachment, undefined, '취소한 반전은 저장하지 않는다');
  controls.api.plan({ source:'catalog', row:['검증 단지','qa','주소','64㎡','fph/qa.jpg','plan-qa'], name:'검증 도면', url:'qa.jpg', mime:'image/jpeg' });
  controls.button('좌우 반전'); controls.button('상하 반전'); controls.button('도면이 맞아요 · 저장하기');
  assert.equal(controls.api.current(), 'planReview');
  assert.ok(controls.api.answers().planAttachment.flipX && controls.api.answers().planAttachment.flipY);
  controls.next(); controls.button('도면 다시 확인·반전 수정');
  controls.button('도면이 맞아요 · 저장하기');
  assert.equal(controls.api.answers().planAttachment.planId, 'plan-qa', '최종 확인에서 재저장해도 도면 ID 유지');
  assert.equal(controls.api.answers().planAttachment.apartmentId, 'qa');
  controls.api.answers().planAttachment.filePath = '/api/uploads/consultations/qa.png';
  controls.button('도면 다시 확인·반전 수정'); controls.button('도면이 맞아요 · 저장하기');
  assert.equal(controls.api.answers().planAttachment.filePath, '/api/uploads/consultations/qa.png', '수정하지 않은 도면은 기존 업로드 경로 유지');
  controls.button('도면 다시 확인·반전 수정'); controls.button('좌우 반전'); controls.button('도면이 맞아요 · 저장하기');
  assert.equal(controls.api.answers().planAttachment.filePath, null, '반전 변경 시 새 이미지 업로드 필요');
  controls.button('도면 다시 확인·반전 수정');
  controls.stage.querySelector('.plan-large').listeners.error();
  assert.equal(controls.stage.querySelector('.plan-save').disabled, true, '보이지 않는 이미지 저장 차단');
  controls.button('닫기 ×');
  const uploadCheck = harness(); fillCore(uploadCheck);
  const uploadInput = uploadCheck.stage.querySelector('.plan-upload');
  for (const file of [{ type:'application/pdf', size:100 }, { type:'image/png', size:16 * 1024 * 1024 }]) {
    uploadInput.files = [file]; uploadInput.listeners.change();
    assert.match(uploadCheck.error(), /15MB/);
    assert.equal(uploadCheck.stage.querySelector('.plan-dialog'), null, '지원하지 않는 파일은 저장 화면을 열지 않는다');
  }
  await controls.api.image({source:'upload', file:new Blob(['qa'],{type:'image/png'}), flipX:true, flipY:true});
  assert.deepEqual(canvasScales.at(-1), [-1,-1], '실제 제출 이미지에 두 방향 반전 적용');
  const h = harness();
  const integratedIds=['contact','planning','planReview'].flatMap(key=>Array.from(h.api.group(key),q=>String(q.id))).sort();
  const originalIds=Array.from(h.api.questions().filter(q=>!q.showIf),q=>String(q.id)).sort();
  assert.deepEqual(integratedIds,originalIds,'기존 질문을 누락이나 중복 없이 세 화면에 통합한다');
  h.next(); h.next(); assert.equal(h.api.current(), 'contact'); assert.match(h.error(), /성함/);
  h.input('13','테스트'); h.input('10','123'); h.input('15','부산 연제구'); h.next();
  assert.match(h.error(), /휴대전화/);
  h.input('10','010-0000-0000'); h.next();
  assert.equal(h.api.current(), 'planning'); h.next(); assert.match(h.error(), /시공 희망/);
  h.input('5','2099-11-15'); h.input('21','5천만~6천만원'); h.button('오후 (12시~18시)');
  h.input('33','2099-11-16'); h.next(); assert.match(h.error(), /날짜와 시간/);
  assert.ok(h.stage.querySelector('.schedule-time').focused, '시간 누락은 실제 선택 버튼으로 이동');
  assert.ok(h.all(node => node.attributes['aria-invalid'] === 'true' && node.focused).length, '필수 선택 오류에 포커스를 연결한다');
  h.button('13:00'); h.next(); assert.equal(h.api.current(),'planReview');
  h.next(); assert.equal(h.api.current(),'planReview'); assert.match(h.error(), /도면/);
  assert.equal(h.all(node => /도면 없이/.test(node.textContent)).length, 0, '필수 도면 우회 없음');
  h.nodes.back.click(); assert.equal(h.api.current(),'planning'); assert.equal(h.api.answers().responses['17'][0], '오후 (12시~18시)');
  h.nodes.back.click(); assert.equal(h.api.current(),'contact'); assert.equal(h.all(node => node.id === 'answer-13')[0].value,'테스트');
  h.next(); assert.equal(h.api.current(),'planning');
  assert.ok(h.api.group().length >= 5);
  h.button('네, 설치할 계획이에요');
  assert.ok(h.api.group().some(q => q.id === 'system_ac_count'));
  h.input('system_ac_count','1.5'); h.next(); assert.match(h.error(), /정수/);
  h.button('설치하지 않아요'); assert.equal(h.api.answers().responses.system_ac_count, undefined);
  h.button('네, 확장할 계획이에요');
  assert.ok(h.api.group().some(q => q.id === 'expansion_spaces'));
  h.button('거실'); h.next(); assert.equal(h.api.current(),'planReview');
  assert.ok(h.api.group().length >= 5);
  h.input('7','거실 수납 공간을 넉넉하게 만들어 주세요.');
  h.api.answers().apartmentSelected=['검증단지','qa'];
  h.api.dong();
  h.all(node=>node.className==='dong-select')[0].change('111동');
  assert.equal(h.api.answers().dong,'111동');
  assert.equal(h.all(node=>/추가 정보를 입력|필수 정보만으로/.test(node.textContent)).length,0);
  savePlan(h);
  h.next(); assert.match(h.error(), /동의/);
  const payload = h.api.payload('/api/uploads/consultations/qa.png');
  assert.equal(payload.type,'residential'); assert.equal(payload.filePath,'/api/uploads/consultations/qa.png');
  assert.equal(payload.marketingAttribution.form_contract,'grouped_v2');
  assert.equal(payload.marketingAttribution.is_test,'true');
  assert.equal(payload.marketingAttribution.utm_campaign,'grouped_qa');
  for (const id of ['13','10','15','5','17','21','33','34']) assert.ok(payload.answers[id], '필수 답변 저장 ' + id);
  assert.match(payload.answers['7'], /발코니 확장|거실 수납/);
  assert.equal(h.api.validate({ id: 5, questionType: 'date', isRequired:true }), '');
  h.api.answers().responses['5']='미정';
  assert.match(h.api.validate({ id:5, questionType:'date', isRequired:true }), /날짜/);
  h.api.answers().responses['5']='2026-02-30';
  assert.match(h.api.validate({ id:5, questionType:'date', isRequired:true }), /날짜/);
  // A selection without optional answers still submits the full required contract.
  const calls = [];
  const mockFetch = async (url, options = {}) => {
    if (String(url).includes('/questions')) return { ok: true, json: async () => ({ questions: [] }) };
    if (String(url).includes('/funnel-events')) return { ok:true };
    calls.push({ url, ...options });
    if (String(url).endsWith('/upload')) return { ok:true,status:200,json:async () => ({ success:true,filePath:'/api/uploads/consultations/qa.png' }) };
    return { ok:true,status:200,json:async () => ({ success:true,consultReqId:999,leadEventId:'qa-event' }) };
  };
  const minimal = harness({ fetch:mockFetch }); fillCore(minimal); savePlan(minimal);
  minimal.stage.querySelector('.consent').querySelector('input').change(true);
  minimal.next(); await settle();
  assert.equal(minimal.api.current(),'success');
  const sent=JSON.parse(calls.find(item => String(item.url).includes('/submit')).body);
  assert.equal(sent.answers['34'],'13:00'); assert.equal(sent.answers['17'],'오후 (12시~18시)');
  assert.ok(calls.find(item=>String(item.url).endsWith('/upload')).body instanceof FormData);
  assert.equal(calls.filter(item=>String(item.url).includes('/submit')).length,1);
  minimal.next(); assert.equal(calls.filter(item=>String(item.url).includes('/submit')).length,1);
  // Draft reload keeps typed fields and asks for an unuploaded local file again.
  const session = storage(); const draft = harness({ session }); fillCore(draft);
  savePlan(draft); draft.api.save();
  const restored=harness({session}); assert.equal(restored.api.current(),'planReview');
  assert.equal(restored.api.answers().responses['13'],'테스트'); assert.equal(restored.api.answers().responses['34'],'13:00');
  // An uncertain send retries exactly the same request and conversion identity.
  let attempts=0; const retryCalls=[];
  const retry=harness({fetch:async (url,options={})=>{
    if(String(url).includes('/submit')) {retryCalls.push(options.body); if(attempts++===0) throw new Error('lost response');}
    return mockFetch(url,options);
  }});
  fillCore(retry); savePlan(retry);
  retry.stage.querySelector('.consent').querySelector('input').change(true); retry.next(); await settle();
  assert.equal(retry.api.current(),'summary'); assert.match(retry.error(), /중복으로/);
  retry.next(); await settle(); assert.equal(retry.api.current(),'success'); assert.equal(retryCalls[0],retryCalls[1]);
  // Commercial grouping uses its original fields and transmits the new required dates and plan.
  const commercial=harness(); commercial.api.answers().type='상업 공간'; commercial.next();
  commercial.input('name','테스트');commercial.input('phone','010-0000-0000');commercial.input('address','부산 연제구');commercial.next();
  for (const [id,value] of [['constructionDate','2099-11-15'],['consultationDate','2099-11-16'],['consultationTime','13:00'],['budget','50_100m'],['callbackTime','weekday_pm']]) commercial.input(id,value);
  commercial.next();savePlan(commercial);
  const c=commercial.api.payload('/api/uploads/consultations/qa.png');
  assert.equal(c.type,'commercial');assert.equal(c.filePath,'/api/uploads/consultations/qa.png');
  assert.equal(c.commercialLead.consultationTime,'13:00');assert.equal(c.commercialLead.constructionDate,'2099-11-15');
  assert.equal(c.commercialLead.callbackTime,'weekday_pm');
  // Changing the space keeps common contact details, but invalidates the old plan.
  const changed=harness(); fillCore(changed); savePlan(changed);
  changed.nodes.back.click(); changed.nodes.back.click(); changed.nodes.back.click();
  assert.equal(changed.api.current(),'contact');
  const typeSelect=changed.all(node => node.tag==='select' && node.children.some(option => option.value==='상업 공간'))[0];
  typeSelect.change('상업 공간');
  assert.equal(changed.api.answers().responses.name,'테스트');
  assert.equal(changed.api.answers().responses.phone,'010-0000-0000');
  assert.match(changed.api.answers().responses.address,/해맞이로/);
  assert.equal(changed.api.answers().planAttachment,undefined);
  changed.all(node => node.tag==='select' && node.children.some(option => option.value==='상업 공간'))[0].change('주거 공간');
  assert.equal(changed.api.answers().responses['13'],'테스트');
  changed.api.answers().planAttachment={source:'catalog',url:'qa.png'};
  changed.all(node => node.tag==='select' && node.children.some(option => option.value==='주택·빌라·기타'))[0].change('주택·빌라·기타');
  assert.equal(changed.api.answers().planAttachment,undefined);
  changed.api.answers().planAttachment={source:'catalog',url:'qa.png'};
  changed.input('15','부산광역시 동래구');
  assert.equal(changed.api.answers().planAttachment,undefined);
  // Hidden branch values cannot reach commercial storage after the parent changes.
  commercial.nodes.back.click(); commercial.nodes.back.click();
  commercial.button('임대 계약 완료'); commercial.input('handoverDate','2099-11-10');
  commercial.button('계약 협의 중');
  assert.equal(commercial.api.answers().responses.handoverDate,undefined);
  commercial.api.answers().responses.handoverDate='2099-11-10';
  assert.equal(commercial.api.payload('qa.png').commercialLead.handoverDate,undefined);
  // An explicit commercial link wins over a residential draft, except an unresolved send.
  const typedSession=storage(); const typed=harness({session:typedSession}); typed.next();typed.input('13','임시');typed.api.save();
  const linked=harness({session:typedSession,search:'?type=commercial&is_test=1'});
  assert.equal(linked.api.answers().type,'상업 공간');
  // Old additional screens restore into the integrated screens with answers intact.
  for (const [oldStep,newStep] of [['additional','planning'],['optionalWork','planning'],['optionalLife','planReview']]) {
    const oldSession=storage();
    oldSession.setItem('spacebogam.consultationDraft.v2',JSON.stringify({version:2,updatedAt:Date.now(),answers:{type:'주거 공간',housing:'아파트',responses:{'13':'기존','7':'요청사항 유지'}},current:oldStep,trail:[]}));
    const migrated=harness({session:oldSession});
    assert.equal(migrated.api.current(),newStep);
    assert.equal(migrated.api.answers().responses['7'],'요청사항 유지');
  }
  const legacySession=storage();
  const oldBody=JSON.stringify({type:'residential',answers:{'13':'기존'},companyId:'test'});
  legacySession.setItem('spacebogam.consultationDraft.v1',JSON.stringify({version:1,updatedAt:Date.now(),answers:{type:'주거 공간',housing:'아파트',responses:{'13':'기존'},consent:true},current:'summary',pendingBody:oldBody,eventIds:{lead_submit_success:'old-event'}}));
  const legacyCalls=[];
  const legacy=harness({session:legacySession,fetch:async (url,options={})=>{if(String(url).includes('/submit'))legacyCalls.push(options.body);return mockFetch(url,options);}});
  assert.equal(legacy.api.current(),'summary');legacy.next();await settle();
  assert.equal(legacyCalls[0],oldBody);assert.equal(legacy.api.current(),'success');
  console.log('grouped consultation: required fields, optional branches, plan upload, payload, drafts and idempotent retry passed');
}
run().catch(error => { console.error(error); process.exitCode=1; });
