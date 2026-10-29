import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const root = resolve('.');
const live = process.env.COMMON_INTAKE_LIVE === '1';
const out = resolve('artifacts/common-two-page-20261029', live ? 'live-qa' : 'qa');
const origin = 'https://spacebogam.kr';
const flowPath = '/reports/consultation-step-prototype-20260928/flow.js';
const localFlow = await readFile(resolve(root, '.' + flowPath));
const localFlowHash = createHash('sha256').update(localFlow).digest('hex');
const today = dateFromNow(0);
const constructionDate = dateFromNow(30);
const openDate = dateFromNow(90);
const handoverDate = dateFromNow(14);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function dateFromNow(offset) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
}

await mkdir(out, { recursive: true });

await withTestBrowser(async (context, selection) => {
  context.setDefaultTimeout(9000);
  const pageErrors = [];
  const blockedWrites = [];
  const submissions = [];
  const flowHashes = [];
  const hashReads = [];
  const checks = [];
  let submitMode = 'success';

  if (live) {
    context.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === origin && url.pathname === flowPath) {
        hashReads.push(response.body().then(body => {
          flowHashes.push(createHash('sha256').update(body).digest('hex'));
        }));
      }
    });
  }

  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === 'https://intm.kr' && url.pathname === '/api/consultation/submit') {
      const body = request.postDataJSON();
      submissions.push(body);
      if (submitMode === 'missing-id') await new Promise(resolve => setTimeout(resolve, 400));
      const responseBody = submitMode === 'missing-id'
        ? { success: true }
        : { success: true, consultReqId: 987654, leadEventId: body.marketingAttribution.sbSubmitEventId };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseBody) });
    }

    if (request.method() !== 'GET') {
      blockedWrites.push({ method: request.method(), url: url.href });
      return route.abort();
    }

    if (url.href === 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js') {
      return route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: "window.kakao=window.kakao||{};window.kakao.Postcode=function(options){window.__postcode=options;this.embed=function(host){host.textContent='주소 검색 테스트';options.onresize({height:420});};};",
      });
    }

    if (url.origin === 'https://intm.kr' && url.pathname === '/api/consultation/questions') {
      return route.fulfill({ contentType: 'application/json', body: '{"questions":[]}' });
    }

    if (url.origin === origin && url.pathname === '/api/apartments/dataset') {
      return route.fulfill({ contentType: 'application/json', body: '{"cols":[],"rows":[]}' });
    }

    if (url.origin !== origin) return route.abort();
    if (live) return route.continue();

    const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + '/')) return route.fulfill({ status: 404, body: '' });
    try {
      return route.fulfill({ contentType: mime[extname(file)] || 'application/octet-stream', body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });

  async function open(type, width, suffix = '', { testMode = true } = {}) {
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    const response = await page.goto(`${origin}/consultation/?type=${type}&utm_campaign=common_two_page_qa${testMode ? '&is_test=1' : ''}${suffix}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    await page.locator('#space-type-residential').waitFor();
    await page.locator('#answer-13').waitFor();
    assert.match(await page.locator('.step-meta').innerText(), /1\s*\/\s*2/);
    assert.equal(await page.locator('script[src*="flow-commercial.js"]').count(), 0, 'legacy commercial flow must not load');
    assert.equal(await page.locator('script[src*="/flow.js"]').count(), 1, 'unified flow must load');
    assert.equal(await page.locator(type === 'commercial' ? '#space-type-commercial' : '#space-type-residential').getAttribute('aria-pressed'), 'true');
    await assertLayout(page);
    return page;
  }

  async function selectAddress(page, detail = '2층 201호') {
    const base = page.locator('#answer-15');
    assert(await base.evaluate(element => element.readOnly), 'base address must be search-only');
    await page.getByRole('button', { name: '주소 검색', exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__postcode));
    await page.evaluate(() => window.__postcode.oncomplete({ address: '부산광역시 해운대구 좌동순환로 457' }));
    assert.equal(await base.inputValue(), '부산광역시 해운대구 좌동순환로 457');
    await page.locator('#answer-8').fill(detail);
  }

  async function fillShared(page, { type, date = constructionDate, state = 'vacant', name = '공통 신청자', area = type === 'commercial' ? '35' : '34.5' } = {}) {
    await page.locator(type === 'commercial' ? '#space-type-commercial' : '#space-type-residential').click();
    await page.locator('#answer-13').fill(name);
    await page.locator('#answer-10').fill('010-0000-0000');
    await selectAddress(page);
    const areaUnit = page.locator('#area-unit');
    await areaUnit.waitFor();
    assert.equal(await areaUnit.evaluate(element => element.tagName), 'FIELDSET');
    assert.equal(await page.locator('#area-unit-pyeong').getAttribute('value'), 'pyeong');
    assert.equal(await page.locator('#area-unit-sqm').getAttribute('value'), 'sqm');
    assert(await page.locator('#area-unit-pyeong').isChecked(), 'pyeong is the default unit');
    assert.equal(await page.locator('#area-unit-sqm').isChecked(), false);
    if (type === 'commercial') {
      await page.locator('#answer-area').fill(area);
      assert.equal(await page.locator('#answer-4').count(), 0);
    } else {
      const apartmentArea = page.locator('#apartment-area');
      await apartmentArea.waitFor();
      await apartmentArea.selectOption('other');
      await page.locator('#answer-4').fill(area);
  await page.locator('#answer-4-confirm').click();
      assert.equal(await page.locator('#answer-area').count(), 0);
    }
    const dateInput = page.locator('#answer-5');
    assert.equal(await dateInput.getAttribute('type'), 'date');
    assert.equal(await dateInput.getAttribute('min'), today);
    assert.equal(await dateInput.getAttribute('required'), null, 'construction date remains optional');
    if (date) await dateInput.fill(date);
    await page.locator('#answer-currentState').selectOption(state);
  }

  async function advanceToSecond(page) {
    await page.locator('#next').click();
    await page.locator('.step-meta').filter({ hasText: /2\s*\/\s*2/ }).waitFor();
    assert(await page.locator('.consent input').isVisible(), 'consent must be on page 2');
    await assertLayout(page);
  }

  async function fillResidentialSecond(page, { branches = true } = {}) {
    for (const id of ['21', '12', 'expansion', 'system_ac', 'sash', '18', '31', '35', '7']) {
      assert.equal(await page.locator(`[data-question-id="${id}"]`).count(), 1, 'residential question is present: ' + id);
    }
    assert.equal(await page.locator('[data-question-id="4"],[data-question-id="5"],[data-question-id="currentState"],#answer-4,#apartment-area,#area-unit').count(), 0, 'shared residential fields must not repeat on page 2');
    await page.locator('#answer-21').selectOption({ label: '아직 정하지 않았어요' });
    await page.getByRole('button', { name: '거실', exact: true }).click();
    assert.deepEqual(await page.locator('.work-checklist button span:last-child').allTextContents(), ['전체 리모델링','현관','거실','주방','공용 욕실','안방 욕실','안방','각 방']);
    if (branches) {
      await page.locator('[data-question-id="expansion"]').getByRole('button', { name: '네, 확장할 계획이에요', exact: true }).click();
      assert.equal(await page.locator('[data-question-id="expansion_spaces"]').count(), 1);
      await page.locator('[data-question-id="expansion_spaces"]').getByRole('button', { name: '거실', exact: true }).click();
      await page.locator('[data-question-id="system_ac"]').getByRole('button', { name: '네, 설치할 계획이에요', exact: true }).click();
      await page.locator('#answer-system_ac_count').fill('3');
      await page.locator('[data-question-id="sash"]').getByRole('button', { name: '네, 교체할 계획이에요', exact: true }).click();
    }
    await page.locator('#answer-7').fill('수납과 동선을 충분히 상담하고 싶습니다.');
    await page.locator('.consent input').check();
  }

  async function fillCommercialSecond(page) {
    for (const id of ['vertical', 'openDate', 'budget', 'callbackTime', 'requestNote', 'leaseStatus', 'workScope', 'previousUse', 'permitStatus', 'drawingStatus', 'facilityNeeds']) {
      assert.equal(await page.locator(`[data-question-id="${id}"]`).count(), 1, 'commercial question is present: ' + id);
    }
    assert.equal(await page.locator('[data-question-id="name"],[data-question-id="phone"],[data-question-id="address"],[data-question-id="area"],[data-question-id="currentState"],#answer-area,#area-unit').count(), 0, 'shared commercial fields must not repeat on page 2');
    await page.locator('#answer-vertical').selectOption('shop');
    await page.locator('#answer-openDate').fill(openDate);
    await page.locator('#answer-budget').selectOption('50_100m');
    await page.locator('#answer-callbackTime').selectOption('weekday_pm');
    await page.locator('#answer-requestNote').fill('브랜드 동선과 진열 효율을 함께 상담하고 싶습니다.');
    await page.locator('[data-question-id="leaseStatus"]').getByRole('button', { name: '임대 계약 완료', exact: true }).click();
    assert.equal(await page.locator('[data-question-id="handoverDate"]').count(), 1, 'handover date must appear for completed leases');
    await page.locator('#answer-handoverDate').fill(handoverDate);
    await page.locator('[data-question-id="workScope"]').getByRole('button', { name: '전체 공사', exact: true }).click();
    await page.locator('#answer-previousUse').fill('의류 매장');
    await page.locator('[data-question-id="permitStatus"]').getByRole('button', { name: '아직 확인 전', exact: true }).click();
    await page.locator('[data-question-id="drawingStatus"]').getByRole('button', { name: '도면이 없어요', exact: true }).click();
    await page.locator('[data-question-id="facilityNeeds"]').getByRole('button', { name: '아직 몰라요', exact: true }).click();
    await page.locator('.consent input').check();
  }

  async function assertLayout(page) {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page must not overflow horizontally');
    for (const selector of ['#next', '#stage input:not([type=checkbox]):not([type=radio])', '#stage select']) {
      for (const element of await page.locator(selector).all()) {
        if (await element.isVisible()) assert((await element.boundingBox()).height >= 40, selector + ' must remain usable');
      }
    }
  }

  async function screenshot(page, type, step, width) {
    await page.locator('#stage').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, `${type}-page${step}-${width}.png`), fullPage: false });
  }

  async function submit(page) {
    const before = submissions.length;
    await page.locator('#next').click();
    await page.getByText('접수번호 · 987654', { exact: true }).waitFor();
    assert.equal(submissions.length, before + 1, 'one mocked submission expected');
    return submissions.at(-1);
  }

  for (const width of [320, 390, 1440]) {
    for (const type of ['residential', 'commercial']) {
      const page = await open(type, width, `&case=${type}_${width}`);
      await fillShared(page, { type, name: type === 'commercial' ? '상가 신청자' : '주거 신청자' });
      if (width === 390) {
        await page.locator('#area-unit-sqm').check();
        assert(await page.locator('#area-unit-sqm').isChecked());
        assert.equal(await page.locator('#area-unit-pyeong').isChecked(), false);
        const displayed = Number(await page.locator(type === 'commercial' ? '#answer-area' : '#answer-4').inputValue());
        const expected = Number(type === 'commercial' ? '35' : '34.5') * 3.305785;
        assert(Math.abs(displayed - expected) < 0.0001, 'area unit changes only the displayed first-page value');
      }
      await screenshot(page, type, 1, width);
      await advanceToSecond(page);
      if (type === 'residential') await fillResidentialSecond(page);
      else await fillCommercialSecond(page);
      await screenshot(page, type, 2, width);
      const body = await submit(page);

      if (type === 'residential') {
        assert.equal(body.type, 'residential');
        assert.equal(body.answers['13'], '주거 신청자');
        assert.equal(body.answers['10'], '010-0000-0000');
        assert.equal(body.answers['15'], '부산광역시 해운대구 좌동순환로 457');
        assert.equal(body.answers['8'], '2층 201호');
        assert.equal(body.answers['5'], constructionDate);
        assert.equal(body.answers['4'], '34.5');
        assert.deepEqual(body.answers['12'], ['거실']);
        assert.match(body.answers['7'], /공실 여부·현장 상태:\s*공실/);
        assert.match(body.answers['7'], /시스템에어컨 대수:\s*3/);
        assert.equal(body.consent, true);
        assert.equal(body.marketingAttribution.form_contract, 'residential_two_page_v1');
        assert.equal(Object.hasOwn(body, 'commercialLead'), false);
      } else {
        assert.equal(body.type, 'commercial');
        assert.equal(body.filePath, null);
        assert.equal(body.commercialLead.name, '상가 신청자');
        assert.equal(body.commercialLead.phone, '010-0000-0000');
        assert.equal(body.commercialLead.address, '부산광역시 해운대구 좌동순환로 457 2층 201호');
        assert.equal(body.commercialLead.currentState, 'vacant');
        assert.equal(body.commercialLead.constructionDate, constructionDate);
        assert.equal(body.commercialLead.vertical, 'shop');
        assert.equal(body.commercialLead.area, '35');
        assert.equal(body.commercialLead.openDate, openDate);
        assert.equal(body.commercialLead.handoverDate, handoverDate);
        assert.deepEqual(body.commercialLead.facilityNeeds, ['unknown']);
        assert.equal(body.commercialLead.consent, true);
        assert.equal(body.marketingAttribution.form_contract, undefined);
        assert.deepEqual(Object.keys(body.answers), ['9999']);
      }
      checks.push({ type, width, pages: 2, success: true, submission: 'intercepted' });
      await page.close();
    }
  }

  const testBypass = await open('residential', 390, '&case=test_bypass');
  await testBypass.locator('#answer-10').fill('123');
  assert.equal(await testBypass.locator('#answer-currentState').inputValue(), '');
  await testBypass.locator('#next').click();
  await testBypass.locator('.step-meta').filter({ hasText: /2\s*\/\s*2/ }).waitFor();
  await testBypass.close();

  const validation = await open('residential', 390, '&case=optional_validation', { testMode: false });
  await fillShared(validation, { type: 'residential', date: '' });
  await validation.locator('#answer-currentState').selectOption('');
  await validation.locator('#next').click();
  assert(await validation.locator('#answer-13').isVisible(), 'required vacancy state must block page 1');
  await validation.locator('#answer-currentState').selectOption('occupied');
  await validation.locator('#answer-10').fill('010');
  await validation.locator('#next').click();
  assert(await validation.locator('#answer-10').isVisible(), 'partial phone number must be rejected');
  await validation.locator('#answer-10').fill('010-0000-0000');
  await validation.locator('#answer-5').fill('2000-01-01');
  await validation.locator('#next').click();
  assert(await validation.locator('#answer-5').isVisible(), 'past construction date must be rejected when provided');
  await validation.locator('#answer-5').fill('');
  await advanceToSecond(validation);
  await validation.close();

  const switcher = await open('residential', 390, '&case=type_switch');
  await fillShared(switcher, { type: 'residential', name: '전환 보존 신청자', state: 'occupied' });
  await switcher.locator('#answer-4').fill('42');
  await switcher.locator('#answer-4-confirm').click();
  await advanceToSecond(switcher);
  await switcher.locator('#answer-21').selectOption({ label: '아직 정하지 않았어요' });
  await switcher.getByRole('button', { name: '주방', exact: true }).click();
  await switcher.locator('#back').click();
  await switcher.locator('#space-type-commercial').click();
  assert.equal(new URL(switcher.url()).searchParams.get('type'), 'commercial');
  for (const [selector, value] of [['#answer-13', '전환 보존 신청자'], ['#answer-10', '010-0000-0000'], ['#answer-8', '2층 201호'], ['#answer-5', constructionDate]]) {
    assert.equal(await switcher.locator(selector).inputValue(), value, 'shared value survives type switch: ' + selector);
  }
  assert.equal(await switcher.locator('#answer-currentState').inputValue(), 'occupied');
  await switcher.locator('#answer-area').fill('55');
  await advanceToSecond(switcher);
  await switcher.locator('#answer-vertical').selectOption('office');
  await switcher.locator('#back').click();
  await switcher.locator('#space-type-residential').click();
  assert.equal(await switcher.locator('#answer-4').inputValue(), '42', 'residential response survives round-trip switch');
  await advanceToSecond(switcher);
  await switcher.locator('#back').click();
  await switcher.locator('#space-type-commercial').click();
  await switcher.reload({ waitUntil: 'domcontentloaded' });
  await switcher.locator('#space-type-commercial').waitFor();
  assert.equal(new URL(switcher.url()).searchParams.get('type'), 'commercial');
  assert.equal(await switcher.locator('#space-type-commercial').getAttribute('aria-pressed'), 'true');
  assert.equal(await switcher.locator('#answer-13').inputValue(), '전환 보존 신청자');
  assert.equal(await switcher.locator('#answer-area').inputValue(), '55');
  await advanceToSecond(switcher);
  assert.equal(await switcher.locator('#answer-vertical').inputValue(), 'office', 'commercial response survives reload');
  await switcher.close();

  const conditional = await open('commercial', 390, '&case=handover_branch');
  await fillShared(conditional, { type: 'commercial' });
  await advanceToSecond(conditional);
  await conditional.locator('[data-question-id="leaseStatus"]').getByRole('button', { name: '임대 계약 완료', exact: true }).click();
  assert.equal(await conditional.locator('[data-question-id="handoverDate"]').count(), 1);
  await conditional.locator('[data-question-id="leaseStatus"]').getByRole('button', { name: '현장 검토 중', exact: true }).click();
  assert.equal(await conditional.locator('[data-question-id="handoverDate"]').count(), 0, 'handover date hides outside completed lease states');
  await conditional.close();

  const branches = await open('residential', 390, '&case=residential_branches');
  await fillShared(branches, { type: 'residential' });
  await advanceToSecond(branches);
  await branches.locator('[data-question-id="expansion"]').getByRole('button', { name: '네, 확장할 계획이에요', exact: true }).click();
  await branches.locator('[data-question-id="system_ac"]').getByRole('button', { name: '네, 설치할 계획이에요', exact: true }).click();
  assert.equal(await branches.locator('[data-question-id="expansion_spaces"]').count(), 1);
  assert.equal(await branches.locator('#answer-system_ac_count').count(), 1);
  await branches.locator('[data-question-id="expansion"]').getByRole('button', { name: '확장하지 않아요', exact: true }).click();
  await branches.locator('[data-question-id="system_ac"]').getByRole('button', { name: '설치하지 않아요', exact: true }).click();
  assert.equal(await branches.locator('[data-question-id="expansion_spaces"]').count(), 0);
  assert.equal(await branches.locator('#answer-system_ac_count').count(), 0);
  await branches.close();

  const preferences = await open('residential', 390, '&case=weekday_preferences');
  await fillShared(preferences, { type: 'residential' });
  await advanceToSecond(preferences);
  await fillResidentialSecond(preferences, { branches: false });
  assert.equal(await preferences.locator('.schedule-time').count(), 0);
  assert.equal(await preferences.locator('#answer-33,.calendar').count(), 0);
  for (const id of ['17','38','22','25','26','27','32','33','34']) {
    assert.equal(await preferences.locator(`[data-question-id="${id}"]`).count(), 0);
  }
  await preferences.getByRole('button', { name: '월요일', exact: true }).click();
  const beforePartial = submissions.length;
  await preferences.locator('#next').click();
  assert.equal(submissions.length, beforePartial, 'weekday without time must not submit');
  assert.match(await preferences.locator('#form-error').innerText(), /오전 또는 오후/);
  assert.equal(await preferences.evaluate(() => document.activeElement.textContent), '오전');
  const monday = preferences.locator('[data-weekday="월요일"]');
  assert.deepEqual(await monday.locator('.schedule-time').allTextContents(), ['오전', '오후']);
  await monday.getByRole('button', { name: '오전', exact: true }).click();
  await preferences.getByRole('button', { name: '화요일', exact: true }).click();
  await preferences.locator('[data-weekday="화요일"]').getByRole('button', { name: '오후', exact: true }).click();
  await preferences.locator('[data-question-id="31"]').getByRole('button', { name: '전문가 조언 위주', exact: true }).click();
  await preferences.locator('[data-question-id="35"]').getByRole('button', { name: 'AI 검색', exact: true }).click();
  await preferences.locator('[data-question-id="35"]').getByRole('button', { name: '기타', exact: true }).click();
  await preferences.reload({ waitUntil: 'domcontentloaded' });
  await preferences.locator('[data-weekday="화요일"]').waitFor();
  assert.equal(await preferences.locator('[data-weekday="월요일"]').count(), 0);
  assert.equal(await preferences.getByRole('button', { name: '월요일', exact: true }).getAttribute('aria-pressed'), 'false');
  assert.equal(await preferences.locator('[data-weekday="화요일"]').getByRole('button', { name: '오후', exact: true }).getAttribute('aria-pressed'), 'true');
  const preferenceBody = await submit(preferences);
  assert.equal(preferenceBody.answers['18'], '화요일');
  assert.equal(preferenceBody.answers['17'], '오후');
  assert.equal(preferenceBody.answers['31'], '전문가 조언 위주');
  assert.equal(preferenceBody.answers['35'], 'AI 검색, 기타');
  assert.match(preferenceBody.answers['7'], /화요일 오후/);
  await preferences.close();

  const customBudget = await open('commercial', 390, '&case=custom_budget');
  await fillShared(customBudget, { type: 'commercial' });
  await advanceToSecond(customBudget);
  await fillCommercialSecond(customBudget);
  await customBudget.locator('#answer-budget').selectOption('기타(직접입력)');
  await customBudget.locator('#next').click();
  assert(await customBudget.locator('#answer-budget-custom').isVisible(), 'custom budget requires a value');
  await customBudget.locator('#answer-budget-custom').fill('3,500만원');
  await customBudget.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await customBudget.locator('#answer-budget').inputValue(), '기타(직접입력)');
  assert.equal(await customBudget.locator('#answer-budget-custom').inputValue(), '3,500만원');
  const customBody = await submit(customBudget);
  assert.equal(customBody.commercialLead.budget, '3,500만원');
  await customBudget.close();

  const retry = await open('residential', 390, '&case=retry');
  await fillShared(retry, { type: 'residential' });
  await advanceToSecond(retry);
  await fillResidentialSecond(retry, { branches: false });
  submitMode = 'missing-id';
  await retry.locator('#next').click();
  assert(await retry.locator('#answer-21').isDisabled(), 'inputs lock while submission is pending');
  await retry.getByRole('button', { name: /접수 결과 다시 확인/ }).waitFor();
  assert(await retry.locator('#answer-21').isDisabled(), 'inputs stay locked during uncertain retry');
  const firstRetryBody = submissions.at(-1);
  submitMode = 'success';
  await retry.locator('#next').click();
  await retry.getByText('접수번호 · 987654', { exact: true }).waitFor();
  assert.deepEqual(submissions.at(-1), firstRetryBody, 'uncertain retry must reuse the exact request body');
  await retry.close();

  await Promise.all(hashReads);
  if (live) {
    assert(flowHashes.length > 0, 'live flow response must be observed');
    assert(flowHashes.every(hash => hash === localFlowHash), 'live flow must match the current local flow hash');
  }
  assert.deepEqual(pageErrors, []);
  assert.equal(blockedWrites.some(write => /consultation\/submit|upload/.test(write.url)), false, 'no real submission or upload may escape interception');

  const residentialPayload = submissions.find(body => body.type === 'residential');
  const commercialPayload = submissions.find(body => body.type === 'commercial');
  await writeFile(resolve(out, 'residential-payload.json'), JSON.stringify(residentialPayload, null, 2));
  await writeFile(resolve(out, 'commercial-payload.json'), JSON.stringify(commercialPayload, null, 2));
  const result = {
    live,
    browser: selection.browser,
    localFlowHash,
    flowHashes,
    checks,
    typeSwitchAndReload: true,
    optionalDateValidation: true,
    areaUnitDisplayAndPyeongPayload: true,
    conditionalBranches: true,
    uncertainRetry: true,
    actualSubmissions: 0,
    mockedSubmissions: submissions.length,
    blockedExternalWrites: blockedWrites.length,
  };
  await writeFile(resolve(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
});
