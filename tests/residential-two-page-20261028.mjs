import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const root = resolve('.');
const live = process.env.RESIDENTIAL_AREA_LIVE === '1';
const out = resolve('artifacts/residential-restore-20261029/' + (live ? 'live-qa' : 'qa'));
await mkdir(out, { recursive: true });
const origin = 'https://spacebogam.kr';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

await withTestBrowser(async (context, selection) => {
  context.setDefaultTimeout(7000);
  const pageErrors = [];
  const flowHashes = [];
  const hashReads = [];
  const expectedFlowHash = createHash('sha256').update(await readFile('reports/consultation-step-prototype-20260928/flow.js')).digest('hex');
  if (live) context.on('response', response => {
    if (new URL(response.url()).pathname === '/reports/consultation-step-prototype-20260928/flow.js') {
      hashReads.push(response.body().then(body => flowHashes.push(createHash('sha256').update(body).digest('hex'))));
    }
  });
  const submissions = [];
  const unexpectedWrites = [];
  let submitMode = 'success';
  let failSdk = false;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.href === 'https://intm.kr/api/consultation/submit') {
      const body = request.postDataJSON();
      submissions.push(body);
      return route.fulfill({ status: submitMode === 'invalid' ? 400 : 200, contentType: 'application/json', body: JSON.stringify(
        submitMode === 'missing-id' ? { success: true } : submitMode === 'invalid' ? { success: false, error: '입력 확인' }
          : { success: true, consultReqId: 987654, leadEventId: body.marketingAttribution.sbSubmitEventId },
      ) });
    }
    if (request.method() !== 'GET') {
      unexpectedWrites.push(url.pathname);
      return route.abort();
    }
    if (url.href === 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js') {
      if (failSdk) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: "window.kakao={Postcode:function(options){window.__postcode=options;this.embed=function(host){host.textContent='주소 검색 테스트';options.onresize({height:400});};}};" });
    }
    if (url.origin === 'https://intm.kr' && url.pathname === '/api/consultation/questions') {
      return route.fulfill({ contentType: 'application/json', body: '{"questions":[]}' });
    }
    if (url.origin !== origin) return route.abort();
    if (live) return route.continue();
    const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    try {
      const baselineAssets = {
        '/reports/consultation-step-prototype-20260928/consultation-questions.js': 'consultation-questions.js',
        '/assets/kakao-consultation.js': 'kakao-consultation.js',
      };
      const body = await readFile(baselineAssets[pathname] ? resolve(root, 'artifacts/residential-two-page-20261028/production-baseline', baselineAssets[pathname]) : resolve(root, '.' + pathname));
      return route.fulfill({ contentType: mime[extname(pathname)] || 'application/octet-stream', body });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });

  const results = [];
  async function open(width, extra = '') {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 844 });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin + (width === 360 ? '/consultation/apply/' : '/consultation/') + '?is_test=1&utm_campaign=two_page_qa' + extra);
    await page.locator('#answer-13').waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('body').innerText()); console.log(await page.locator('input').evaluateAll(xs=>xs.map(x=>({id:x.id,hidden:x.hidden}))));throw e;});
    return page;
  }
  async function address(page, retry = false) {
    const base = page.locator('#answer-15');
    assert(await base.evaluate(e => e.readOnly), 'address must be selected by search');
    const search = page.getByRole('button', { name: '주소 검색', exact: true });
    if (retry) {
      failSdk = true;
      await search.click();
      await page.getByRole('status').filter({ hasText: '잠시 후 다시 검색' }).waitFor();
      failSdk = false;
    }
    await search.click();
    await page.waitForFunction(() => !!window.__postcode);
    await page.evaluate(() => window.__postcode.oncomplete({ address: '부산광역시 해운대구 좌동순환로 457' }));
    assert.equal(await base.inputValue(), '부산광역시 해운대구 좌동순환로 457');
    const detailLabel = page.getByText('상세주소 · 선택 입력', {exact:true});
    assert((await detailLabel.boundingBox()).height > 10, 'detail address label must be visually readable');
  }
  async function fillContact(page) {
    await page.locator('#answer-13').fill('가상 신청자');
    await page.locator('#answer-10').fill('010-0000-0000');
    await address(page);
    await page.locator('#answer-8').fill('가상 상세주소');
  }
  async function plan(page, restore = true) {
    await page.locator('#next').click();
    await page.locator('#answer-21').waitFor();
    assert.match(await page.locator('.step-meta').innerText(), /2\s*\/\s*2/);
    await page.locator('#answer-4').fill('34.5');
    await page.locator('#answer-21').selectOption({ label: '아직 정하지 않았어요' });
    await page.getByRole('button', { name: '아직 미정', exact: true }).click();
    await page.getByRole('button', { name: '주방', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '아직 미정', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: '시스템에어컨', exact: true }).click();
    for (const id of ['expansion', 'system_ac', 'sash', '5', '38', '17', '18', '22', '25', '26', '27', '32', '31', '35', '7']) {
      assert.equal(await page.locator('[data-question-id="' + id + '"]').count(), 1, 'existing question restored: ' + id);
    }
    if (restore) {
      await page.locator('[data-question-id="expansion"]').getByRole('button', {name:'네, 확장할 계획이에요',exact:true}).click();
      await page.locator('[data-question-id="expansion_spaces"]').getByRole('button', {name:'거실',exact:true}).click();
      await page.locator('[data-question-id="system_ac"]').getByRole('button', {name:'네, 설치할 계획이에요',exact:true}).click();
      await page.locator('#answer-system_ac_count').fill('3');
      await page.locator('[data-question-id="sash"]').getByRole('button', {name:'네, 교체할 계획이에요',exact:true}).click();
      await page.locator('[data-question-id="25"]').getByRole('button', {name:'내추럴',exact:true}).click();
      await page.locator('[data-question-id="26"] select').selectOption({label:'부부 + 자녀'});
      await page.locator('.pet-choice input').check();
      await page.locator('#answer-7').fill('수납을 충분히 만들어 주세요.');
    }
    const sentBeforeConsent = submissions.length;
    await page.locator('#next').click();
    assert.equal(submissions.length, sentBeforeConsent, 'consent is required on second page');
    assert(await page.locator('#answer-21').isVisible());
    await page.locator('.consent input').check();
  }
  async function noOverflow(page) {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    for (const selector of ['#next', '#stage input:not([type=checkbox])', '#stage select']) {
      for (const element of await page.locator(selector).all()) {
        if (await element.isVisible()) assert((await element.boundingBox()).height >= 44, selector + ' touch height');
      }
    }
  }

  for (const width of [320, 360, 390, 768, 1440]) {
    const page = await open(width);
    assert.match(await page.locator('.step-meta').innerText(), /1\s*\/\s*2/);
    assert.equal(await page.locator('input[type=file],input[type=date],.contact-types').count(), 0);
    await page.locator('#next').click();
    assert(await page.locator('#answer-13').isVisible(), 'empty first page cannot advance');
    await page.locator('#answer-13').fill('가상 신청자');
    await page.locator('#answer-10').fill('123');
    await address(page, width === 320);
    await page.locator('#next').click();
    assert(await page.locator('#answer-10').isVisible(), 'invalid phone cannot advance');
    await page.locator('#answer-10').fill('010-0000-0000');
    await page.locator('#answer-8').fill('가상 상세주소');
    await noOverflow(page);
    await page.screenshot({ path: `${out}/contact-${width}.png`, fullPage: true });
    await plan(page);
    await noOverflow(page);
    await page.screenshot({ path: `${out}/planning-${width}.png`, fullPage: true });
    await page.locator('#back').click();
    assert.equal(await page.locator('#answer-8').inputValue(), '가상 상세주소');
    await page.locator('#next').click();
    assert.equal(await page.locator('#answer-system_ac_count').inputValue(), '3');
    assert.equal(await page.locator('#answer-4').inputValue(), '34.5');
    assert.equal(await page.locator('#answer-21').inputValue(), '아직 정하지 않았어요');
    await page.reload();
    await page.locator('#answer-21').waitFor();
    assert.equal(await page.locator('#answer-system_ac_count').inputValue(), '3');
    assert.equal(await page.locator('#answer-4').inputValue(), '34.5');
    assert.equal(await page.locator('#answer-21').inputValue(), '아직 정하지 않았어요');
    await page.locator('.consent input').check();
    await page.locator('#next').click();
    await page.getByText('접수번호 · 987654', { exact: true }).waitFor();
    const body = submissions.at(-1);
    assert.equal(body.marketingAttribution.form_contract, 'residential_two_page_v1');
    assert.equal(body.marketingAttribution.utm_campaign, 'two_page_qa');
    assert.equal(body.answers['4'], '34.5');
    assert.equal(body.answers['26'], '부부 + 자녀');
    assert.equal(body.answers['25'], '내추럴');
    for (const phrase of ['수납을 충분히', '시스템에어컨 대수: 3', '확장 공간: 거실', '샤시 교체: 네, 교체할 계획이에요', '반려동물: 있음']) assert(body.answers['7'].includes(phrase), phrase);
    assert.equal(body.answers['13'], '가상 신청자');
    assert.equal(body.answers['8'], '가상 상세주소');
    assert.equal(body.consent, true);
    assert.deepEqual(body.answers['12'], ['주방', '시스템에어컨']);
    assert.equal(body.filePath, null);
    assert(!Object.hasOwn(body.answers, '5'), 'no fabricated construction date');
    assert(!Object.hasOwn(body.answers, '33'), 'no fabricated appointment');
    results.push({ width, pages: 2, success: true, contactValidation: true, backAndReload: true, overflow: false });
    await page.close();
  }

  const retry = await open(390);
  await fillContact(retry); await plan(retry, false);
  submitMode = 'missing-id';
  await retry.locator('#next').click();
  await retry.getByRole('button', { name: /접수 결과 다시 확인/ }).waitFor();
  const first = submissions.at(-1);
  assert.equal(await retry.getByText('접수번호 · 발급 완료', { exact: true }).count(), 0);
  submitMode = 'success';
  await retry.locator('#next').click();
  await retry.getByText('접수번호 · 987654', { exact: true }).waitFor();
  assert.deepEqual(submissions.at(-1), first, 'uncertain retry must reuse same event id and answers');
  await retry.close();

  const branches = await open(390);
  await fillContact(branches); await plan(branches);
  await branches.locator('[data-question-id="system_ac"]').getByRole('button', {name:'설치하지 않아요',exact:true}).click();
  assert.equal(await branches.locator('#answer-system_ac_count').count(), 0);
  await branches.locator('[data-question-id="expansion"]').getByRole('button', {name:'확장하지 않아요',exact:true}).click();
  assert.equal(await branches.locator('[data-question-id="expansion_spaces"]').count(), 0);
  const time = branches.getByRole('button', {name:'10:00',exact:true});
  await time.click();
  assert.equal(await time.getAttribute('aria-pressed'), 'true');
  await time.click();
  assert.equal(await time.getAttribute('aria-pressed'), 'false');
  await branches.locator('#next').click();
  await branches.getByText('접수번호 · 987654', {exact:true}).waitFor();
  assert(!submissions.at(-1).answers['7'].includes('시스템에어컨 대수:'));
  assert(!submissions.at(-1).answers['7'].includes('확장 공간:'));
  await branches.close();

  const commercial = await context.newPage();
  await commercial.setViewportSize({width:390,height:844});
  await commercial.goto(origin + '/consultation/?type=commercial&vertical=shop&is_test=1');
  await commercial.locator('#stage input[type=text]').waitFor();
  assert.equal(await commercial.locator('body').getAttribute('data-residential-two-page'), null);
  assert.equal(await commercial.locator('script[src*="flow-commercial.js"]').count(), 1);
  assert.equal(await commercial.locator('.step-meta').innerText(), '질문 01');
  await commercial.close();

  // The fixture intercepts every request; no production form submission or upload is sent.
  assert(!unexpectedWrites.some(path => /upload/.test(path)));
  assert.deepEqual(pageErrors, []);
  await Promise.all(hashReads);
  if (live) { assert(flowHashes.length > 0); assert(flowHashes.every(hash => hash === expectedFlowHash)); }
  await writeFile(`${out}/sample-payload.json`, JSON.stringify(submissions[0], null, 2));
  const result = { live, flowHashes, browser: selection.browser, results, uncertainRetry: true, actualSubmissions: 0, mockedSubmissions: submissions.length };
  await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
});
