import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const root = resolve('.');
const origin = 'https://spacebogam.kr';
const out = resolve('artifacts/consultation-apartment-area-20261029');
const loadingOut = resolve('artifacts/consultation-loading-inline-20261029');
const mime = {
  '.css': 'text/css; charset=utf-8', '.gif': 'image/gif', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const image = name => `https://otondo-cdn.s3.ap-northeast-2.amazonaws.com/media/apartments-plans/${name}.webp`;
const dataset = {
  cols: ['apartmentName', 'apartmentId', 'roadAddress', 'legacyAddress', 'type', 'planPic', 'planId'],
  rows: [
    ['테스트센트럴', 'apt_ok_2026', '부산광역시 해운대구 테스트로 1', '부산 해운대구 테스트동 1', '84A㎡', image('test-84a'), 'plan_84a'],
    ['오류테스트아파트', 'apt_error_2026', '부산광역시 수영구 오류로 2', '부산 수영구 오류동 2', '59㎡', image('error-59'), 'plan_error'],
    ['다중센트럴A', 'apt_multi_a', '부산광역시 수영구 다중로 2', '부산 수영구 다중동 2', '59A㎡', image('multi-59a'), 'plan_multi_a'],
    ['다중센트럴B', 'apt_multi_b', '부산광역시 수영구 다중로 2', '부산 수영구 다중동 2', '74B㎡', image('multi-74b'), 'plan_multi_b'],
    ['지연센트럴', 'apt_delay', '부산광역시 동래구 지연로 3', '부산 동래구 지연동 3', '84C㎡', image('delay-84c'), 'plan_delay'],
  ],
};
const planData = {
  apt_ok_2026: [
    { type: '84A㎡', planPic: image('test-84a'), planId: 'plan_84a' },
    { type: '102B㎡', planPic: image('test-102b'), planId: 'plan_102b' },
  ],
  apt_multi_a: [{ type: '59A㎡', planPic: image('multi-59a'), planId: 'plan_multi_a' }],
  apt_multi_b: [{ type: '74B㎡', planPic: image('multi-74b'), planId: 'plan_multi_b' }],
  apt_delay: [{ type: '84C㎡', planPic: image('delay-84c'), planId: 'plan_delay' }],
};

await mkdir(out, { recursive: true });
await mkdir(loadingOut, { recursive: true });

await withTestBrowser(async (context, selection) => {
  context.setDefaultTimeout(9000);
  const pageErrors = [];
  const blockedWrites = [];
  const submissions = [];
  const planRequests = [];
  let delayNextSuccessfulPlanRequest = false;
  let failSuccessfulPlans = false;
  let releaseFirstPlans;
  let delayNextDataset = false;
  let releaseDataset;

  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'https://intm.kr' && url.pathname === '/api/consultation/submit') {
      const body = request.postDataJSON(); submissions.push(body);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, consultReqId: 987654, leadEventId: body.marketingAttribution.sbSubmitEventId }) });
    }
    if (request.method() !== 'GET') {
      blockedWrites.push({ method: request.method(), url: url.href }); return route.abort();
    }
    if (url.href === 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js') {
      return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: "window.kakao=window.kakao||{};window.kakao.Postcode=function(options){window.__postcode=options;this.embed=function(host){host.textContent='주소 검색 테스트';options.onresize({height:420});};};" });
    }
    if (url.origin === 'https://intm.kr' && url.pathname === '/api/consultation/questions') {
      return route.fulfill({ contentType: 'application/json', body: '{"questions":[]}' });
    }
    if (url.origin === origin && url.pathname === '/api/apartments/dataset') {
      if (delayNextDataset) {
        delayNextDataset = false;
        await new Promise(resolve => { releaseDataset = resolve; });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(dataset) });
    }
    const match = url.origin === origin && url.pathname.match(/^\/api\/apartments\/([^/]+)\/plans$/);
    if (match) {
      const id = decodeURIComponent(match[1]); planRequests.push(id);
      if (id === 'apt_error_2026' || id === 'apt_ok_2026' && failSuccessfulPlans) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"temporary"}' });
      }
      if (id === 'apt_ok_2026' && delayNextSuccessfulPlanRequest) {
        delayNextSuccessfulPlanRequest = false;
        await new Promise(resolve => { releaseFirstPlans = resolve; });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: planData[id] || [] }) });
    }
    if (url.origin !== origin) return route.abort();
    const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + '/')) return route.fulfill({ status: 404, body: '' });
    try { return route.fulfill({ contentType: mime[extname(file)] || 'application/octet-stream', body: await readFile(file) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });

  async function open(type = 'residential', { testMode = true, caseName = type, width = 320 } = {}) {
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/consultation/?type=${type}&utm_campaign=apartment_area_qa&case=${caseName}${testMode ? '&is_test=1' : ''}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#answer-13').waitFor();
    return page;
  }

  async function expectAreaUnit(page, value) {
    const fieldset = page.locator('#area-unit');
    await fieldset.waitFor();
    assert.equal(await fieldset.evaluate(element => element.tagName), 'FIELDSET');
    assert.equal(await page.locator('#area-unit-pyeong').getAttribute('value'), 'pyeong');
    assert.equal(await page.locator('#area-unit-sqm').getAttribute('value'), 'sqm');
    assert(await page.locator(`#area-unit-${value}`).isChecked(), `${value} unit must be checked`);
    assert.equal(await page.locator(`#area-unit-${value === 'pyeong' ? 'sqm' : 'pyeong'}`).isChecked(), false);
  }

  async function expectApartmentIdle(page) {
    const panel = page.locator('.apartment-area');
    assert.equal(await panel.getAttribute('aria-busy'), 'false');
    assert.equal(await panel.locator('.apartment-status.is-loading .loading-spinner').count(), 0);
  }

  async function expectApartmentLoading(page) {
    const panel = page.locator('.apartment-area');
    assert.equal(await panel.getAttribute('aria-busy'), 'true');
    await panel.locator('.apartment-status.is-loading .loading-spinner').waitFor();
  }

  async function chooseAddress(page, address) {
    await page.getByRole('button', { name: '주소 검색', exact: true }).click();
    await page.waitForFunction(() => Boolean(window.__postcode));
    await page.evaluate(value => window.__postcode.oncomplete({ address: value }), address);
  }

  async function fillIdentity(page) {
    await page.locator('#answer-13').fill('주소 평형 테스트');
    await page.locator('#answer-10').fill('010-0000-0000');
    await page.locator('#answer-currentState').selectOption('vacant');
  }

  const bypass = await open('residential', { caseName: 'test_bypass' });
  assert.equal(await bypass.locator('#answer-currentState').inputValue(), '');
  await bypass.locator('#answer-10').fill('123');
  await bypass.locator('#next').click();
  await bypass.locator('#answer-21').waitFor();
  const bypassSubmissions = submissions.length;
  await bypass.locator('#next').click();
  await bypass.locator('#answer-13').waitFor();
  assert.equal(submissions.length, bypassSubmissions, 'planning submit returns to invalid test contact data without POST');
  await bypass.close();

  const production = await open('residential', { testMode: false, caseName: 'production_guard' });
  await production.locator('#next').click();
  assert(await production.locator('#answer-13').isVisible(), 'production rejects an empty first page');
  await production.locator('#answer-13').fill('실전 검증');
  await production.locator('#answer-10').fill('123');
  await chooseAddress(production, '부산광역시 해운대구 테스트로 1');
  await production.locator('#answer-currentState').selectOption('vacant');
  await production.locator('#next').click();
  assert(await production.locator('#answer-10').isVisible(), 'production rejects an invalid phone number');
  await production.close();

  const delayed = await open('residential', { caseName: 'delayed_address_match' });
  await fillIdentity(delayed);
  delayNextDataset = true;
  const datasetRequest = delayed.waitForRequest(request => new URL(request.url()).pathname === '/api/apartments/dataset');
  await chooseAddress(delayed, '부산광역시 동래구 지연로 3');
  await datasetRequest;
  assert.equal(typeof releaseDataset, 'function');
  await expectApartmentLoading(delayed);
  const datasetSpinner = delayed.locator('.apartment-status.is-loading .loading-spinner');
  assert.equal(await datasetSpinner.evaluate(element => getComputedStyle(element).animationName), 'apartment-loading');
  await delayed.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await datasetSpinner.evaluate(element => getComputedStyle(element).animationName), 'none');
  await delayed.emulateMedia({ reducedMotion: 'no-preference' });
  await delayed.screenshot({ path: resolve(loadingOut, 'dataset-loading-320.png'), fullPage: false });
  await delayed.locator('#apartment-area').selectOption('other');
  await delayed.locator('#answer-4').fill('41');
  releaseDataset();
  await delayed.locator('.apartment-area [role="status"]').filter({ hasText: '주소에서 아파트를 찾았어요. 등록된 평형 중 선택해 주세요.' }).waitFor();
  await expectApartmentIdle(delayed);
  assert.equal(await delayed.locator('#apartment-area').inputValue(), 'other', 'automatic address match preserves manual area entered while dataset loads');
  assert.equal(await delayed.locator('#answer-4').inputValue(), '41');
  assert.equal(await delayed.locator('#answer-4').getAttribute('data-unconfirmed'), 'true');
  await delayed.locator('#answer-4-confirm').click();
  assert(await delayed.locator('#answer-4').isVisible());
  await chooseAddress(delayed, '부산광역시 금정구 없는로 99');
  await delayed.locator('.apartment-area [role="status"]').filter({ hasText: '이 주소에 등록된 아파트를 찾지 못했어요' }).waitFor();
  await expectApartmentIdle(delayed);
  assert.equal(await delayed.locator('#answer-4').inputValue(), '', 'actual address change clears manual area');
  await delayed.close();

  const page = await open('residential', { caseName: 'auto_apartment', testMode: false });
  await fillIdentity(page);
  assert.equal(await page.locator('#apartment-search').count(), 0, 'apartment text search is removed');
  await expectAreaUnit(page, 'pyeong');
  assert.equal(await page.locator('#apartment-area').inputValue(), 'other');
  assert(await page.locator('#answer-4').isVisible());
  delayNextSuccessfulPlanRequest = true;
  releaseFirstPlans = undefined;
  await chooseAddress(page, '부산광역시 해운대구 테스트로 1');

  const area = page.locator('#apartment-area');
  const status = page.locator('.apartment-area [role="status"]');
  await status.filter({ hasText: '주소에서 찾은 아파트의 평형을 불러오고 있어요' }).waitFor();
  await expectApartmentLoading(page);
  await page.screenshot({ path: resolve(loadingOut, 'plans-loading-320.png'), fullPage: false });
  assert.equal(await page.locator('.search-result').count(), 0, 'one matching complex is selected automatically');
  assert.equal(await area.isEnabled(), true);
  assert.equal(await area.locator('option[value="other"]').count(), 1);
  assert.equal(typeof releaseFirstPlans, 'function'); releaseFirstPlans();
  await status.filter({ hasText: '주소에서 아파트를 찾았어요. 등록된 평형 중 선택해 주세요.' }).waitFor();
  await expectApartmentIdle(page);
  const option84 = area.locator('option[value="84A㎡"]');
  await option84.waitFor({ state: 'attached' });
  assert.match(await option84.innerText(), /약\s*25\.4평/); assert.match(await option84.innerText(), /84A㎡/);
  await area.selectOption('84A㎡');
  assert.equal(await area.inputValue(), '84A㎡');
  assert.equal(await isVisible(page.locator('#answer-4')), false);
  assert.equal(await page.locator('#answer-4').inputValue(), '25.4');
  assert.equal(await page.locator('#area-unit').isVisible(), false, 'unit radios are only shown for manual area');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#apartment-area')?.value === '84A㎡');
  assert.equal(await isVisible(page.locator('#answer-4')), false);
  failSuccessfulPlans = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.apartment-area [role="status"]').filter({ hasText: '평형을 불러오지 못했어요' }).waitFor();
  await expectApartmentIdle(page);
  await page.screenshot({ path: resolve(loadingOut, 'plans-error-320.png'), fullPage: false });
  const savedArea = page.locator('#apartment-area');
  assert.equal(await savedArea.inputValue(), '84A㎡');
  assert.match(await savedArea.locator('option[value="84A㎡"]').innerText(), /약\s*25\.4평.*84A㎡.*저장한 선택/);
  assert.equal(await page.locator('#answer-4').inputValue(), '25.4');
  assert.equal(await page.locator('#area-unit').isVisible(), false, 'unit radios are only shown for manual area');
  assert.equal(await isVisible(page.locator('#answer-4')), false);
  failSuccessfulPlans = false;

  await chooseAddress(page, '부산광역시 금정구 없는로 99');
  await page.locator('.apartment-area [role="status"]').filter({ hasText: '이 주소에 등록된 아파트를 찾지 못했어요' }).waitFor();
  await expectApartmentIdle(page);
  assert.notEqual(await page.locator('#apartment-area').inputValue(), '84A㎡');
  assert.equal(await page.locator('#apartment-area option[value="84A㎡"]').count(), 0);
  await page.locator('#apartment-area').selectOption('other');
  assert.equal(await page.locator('#answer-4').inputValue(), '', 'address change clears the previous area');
  await page.locator('#answer-4').fill('12e+abc.5x.7');
  assert.equal(await page.locator('#answer-4').inputValue(), '12.57', 'manual field strips nonnumeric characters');
  await page.locator('#answer-4').fill('9'.repeat(400));
  await page.locator('#answer-4-confirm').click();
  assert.equal(await page.locator('#answer-4').getAttribute('aria-invalid'), 'true', 'nonfinite numeric input must be rejected');
  await page.locator('#answer-4').fill('0');
  await page.locator('#answer-4-confirm').click();
  assert.equal(await page.locator('#answer-4').getAttribute('aria-invalid'), 'true');
  await page.locator('#answer-4').fill('33');
  await page.locator('#next').click();
  assert(await page.locator('#answer-4').isVisible(), 'unconfirmed manual input cannot advance');
  assert.equal(await page.locator('#answer-4').getAttribute('data-unconfirmed'), 'true');
  await page.locator('#answer-4-confirm').click();
  await page.locator('#area-unit-sqm').check();
  await expectAreaUnit(page, 'sqm');
  assert(Math.abs(Number(await page.locator('#answer-4').inputValue()) - 109.0909) < 0.0001, 'manual area is displayed in square meters');
  await assertNoOverflow(page);

  await page.locator('#next').click();
  await page.locator('#answer-21').waitFor();
  assert.equal(await page.locator('#answer-4,#answer-area,#area-unit,#apartment-area').count(), 0, 'area fields do not repeat on page 2');
  await page.locator('#answer-21').selectOption({ label: '아직 정하지 않았어요' });
  await page.getByRole('button', { name: '주방', exact: true }).click();
  const schedule = page.locator('[data-question-id="18"]');
  await schedule.getByRole('button', { name: '월요일', exact: true }).click();
  await schedule.locator('[data-weekday="월요일"]').getByRole('button', { name: '오전', exact: true }).click();
  await schedule.getByRole('button', { name: '화요일', exact: true }).click();
  assert.equal(await schedule.getByRole('button', { name: '월요일', exact: true }).getAttribute('aria-pressed'), 'false');
  assert.equal(await schedule.locator('[data-weekday="월요일"]').count(), 0);
  assert.equal(await schedule.locator('[data-weekday="화요일"] .schedule-time[aria-pressed="true"]').count(), 0);
  await schedule.locator('[data-weekday="화요일"]').getByRole('button', { name: '오후', exact: true }).click();
  await page.locator('.consent input').check();
  await page.screenshot({ path: resolve(out, 'mobile-address-area-and-single-weekday.png'), fullPage: true });
  await page.locator('#next').click();
  await page.getByText('접수번호 · 987654', { exact: true }).waitFor();
  assert.equal(submissions.at(-1).answers['4'], '33', 'backend keeps residential area in pyeong while UI displays square meters');
  await page.close();

  const multiple = await open('residential', { caseName: 'multiple_apartments' });
  await chooseAddress(multiple, '부산광역시 수영구 다중로 2');
  await multiple.locator('.search-result').filter({ hasText: '다중센트럴A' }).waitFor();
  assert.equal(await multiple.locator('.search-result').count(), 2);
  await multiple.locator('.search-result').filter({ hasText: '다중센트럴B' }).click();
  await multiple.locator('.apartment-area [role="status"]').filter({ hasText: '주소에서 아파트를 찾았어요. 등록된 평형 중 선택해 주세요.' }).waitFor();
  assert.equal(await multiple.locator('#apartment-area option[value="74B㎡"]').count(), 1);
  await assertNoOverflow(multiple); await multiple.close();

  const commercial = await open('commercial', { caseName: 'commercial_manual_area' });
  assert.equal(await commercial.locator('#apartment-area,#apartment-search,#answer-4').count(), 0);
  assert(await commercial.locator('#answer-area').isVisible());
  await expectAreaUnit(commercial, 'pyeong');
  await commercial.locator('#answer-area').fill('35');
  await commercial.locator('#area-unit-pyeong').focus();
  await commercial.locator('#area-unit-pyeong').press('ArrowRight');
  await expectAreaUnit(commercial, 'sqm');
  assert(Math.abs(Number(await commercial.locator('#answer-area').inputValue()) - 115.7025) < 0.0001);
  await commercial.locator('#area-unit-sqm').press('ArrowLeft');
  await expectAreaUnit(commercial, 'pyeong');
  assert.equal(await commercial.locator('#answer-area').inputValue(), '35');
  await assertNoOverflow(commercial); await commercial.close();

  for (const width of [320, 390, 1440]) {
    const layout = await open('residential', { caseName: `inline_area_${width}`, width });
    await chooseAddress(layout, '부산광역시 해운대구 테스트로 1');
    await layout.locator('.apartment-name').filter({ hasText: '테스트센트럴' }).waitFor();
    const row = layout.locator('.apartment-selection-row');
    assert.equal(await row.locator('#answer-8').count(), 0, 'detail address stays below apartment selection');
    assert.equal(await row.locator('#apartment-area').count(), 1);
    const nameBox = await layout.locator('.apartment-name').boundingBox();
    const areaBox = await layout.locator('#apartment-area').boundingBox();
    const detailBox = await layout.locator('#answer-8').boundingBox();
    assert(nameBox && areaBox && detailBox);
    assert(Math.abs(nameBox.y - areaBox.y) <= 1, `apartment name and area align at ${width}px`);
    assert(detailBox.y > areaBox.y + areaBox.height);
    await assertNoOverflow(layout);
    await layout.screenshot({ path: resolve(loadingOut, `detail-area-inline-${width}.png`), fullPage: false });
    await layout.close();
  }

  assert.deepEqual(pageErrors, []);
  assert(planRequests.includes('apt_ok_2026') && planRequests.includes('apt_multi_b'));
  assert.equal(blockedWrites.some(write => /consultation\/submit|upload/.test(write.url)), false);
  const result = {
    browser: selection.browser, datasetRows: dataset.rows.length, planRequests,
    addressAutoSelection: true, multipleAddressSelection: true, databaseArea: '84A㎡',
    draftRestored: true, draftRestoredAfterPlansFailure: true, addressChangeReset: true, delayedDatasetKeepsManualArea: true,
    unitDisplayConversion: true, backendPyeong: submissions.at(-1).answers['4'],
    testModeBypass: true, testModeInvalidPlanningReturnsContactWithoutPost: true, productionGuard: true, commercialManualArea: true,
    singleWeekday: true, responsiveInlineArea: [320, 390, 1440], loadingStates: ['dataset', 'plans', 'error'],
    mobileOverflow: false, actualSubmissions: 0, mockedSubmissions: submissions.length,
  };
  await writeFile(resolve(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));

  async function assertNoOverflow(target) {
    assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile page must not overflow horizontally');
  }
  async function isVisible(locator) { return locator.isVisible().catch(() => false); }
});
