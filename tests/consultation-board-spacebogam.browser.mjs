import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const origin = 'https://spacebogam.kr';
const live = process.env.BOARD_LIVE === '1';
const candidate = new Map([
 ['/consultation/', ['consultation/index.html', 'text/html; charset=utf-8']],
 ['/consultation/apply/', ['consultation/apply/index.html', 'text/html; charset=utf-8']],
 ['/assets/consultation-board.js', ['assets/consultation-board.js', 'text/javascript']],
 ['/assets/consultation-board.css', ['assets/consultation-board.css', 'text/css']],
]);
await withTestBrowser(async (context, selection) => {
 let mode = 'list';
 let permission = 'denied';
 let writes = 0;
 await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() !== 'GET') { writes++; return route.abort(); }
  if (url.origin === 'https://intm.kr' && url.pathname === '/api/consultation/list') {
   if (mode === 'error') return route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': origin }, json: { error: 'fixture' } });
   const second = url.searchParams.get('page') === '2';
   return route.fulfill({ headers: { 'Access-Control-Allow-Origin': origin }, json: { consultRequests: mode === 'empty' ? [] : [{ id: 1, name: '김*수', phone: '010-XXXX-1234', buildingName: second ? '다음 아파트' : '<script>샘플 아파트</script>', createdAt: '2026-11-03T16:00:00Z' }], hasMore: mode === 'list' && !second } });
  }
  if (url.origin === 'https://intm.kr' && url.pathname === '/consultation/board-access') {
   return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><script>const p=new URLSearchParams(location.search);window.opener.postMessage({type:'spacebogam-consultation-access',channel:p.get('channel'),status:'${permission}'},'https://spacebogam.kr');${permission === 'allowed' ? "location.replace('/consultation/detail?id=1');" : 'window.close();'}</script>` });
  }
  if (url.origin === 'https://intm.kr' && url.pathname === '/consultation/detail') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="ko"><body><h1>관리자 상담 상세</h1></body></html>' });
  if (url.origin !== origin) return route.abort();
  if (!live && candidate.has(url.pathname)) {
   const [file, contentType] = candidate.get(url.pathname);
   return route.fulfill({ contentType, body: await readFile(file) });
  }
  return route.continue();
 });
 const page = await context.newPage();
 page.setDefaultTimeout(15000);
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 for (const width of [360, 390, 1280]) {
  console.log('viewport', width);
  mode = 'list'; permission = 'denied';
  await page.setViewportSize({ width, height: 900 });
  await page.goto(origin + '/consultation/?utm_source=board-test', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '김*수 상담 내용 보기', exact: true }).waitFor();
  assert.deepEqual(await page.locator('th').allTextContents(), ['신청날짜', '이름', '전화번호', '아파트이름']);
  assert.ok((await page.locator('tbody').innerText()).includes('2026. 11. 04.'));
  assert.equal(await page.locator('tbody script').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: '김*수 상담 내용 보기', exact: true }).click();
  await page.getByRole('alertdialog').waitFor();
  assert.equal(await page.getByRole('heading', { name: '권한 없음', exact: true }).count(), 1);
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByText('다음 아파트', { exact: true }).waitFor();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await page.getByRole('button', { name: '김*수 상담 내용 보기', exact: true }).waitFor();
  permission = 'allowed';
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '김*수 상담 내용 보기', exact: true }).click();
  const popup = await popupPromise;
  popup.setDefaultTimeout(15000);
  await popup.waitForURL('**/consultation/detail?id=1', { waitUntil: 'domcontentloaded' });
  await popup.getByRole('heading', { name: '관리자 상담 상세' }).waitFor();
  assert.equal(await page.locator('#board-notice').evaluate(element => element.open), false);
  await popup.close();
  await page.locator('main [data-consultation-apply]').click();
  assert.equal(new URL(page.url()).pathname, '/consultation/');
  await page.locator('#board-application').waitFor({ state: 'visible' });
  const form = page.frameLocator('#board-application-frame');
  await form.locator('#space-type-residential').waitFor();
  await page.waitForFunction(() => document.getElementById('board-application-status').hidden);
  assert.equal(await form.locator('#next').count(), 1);
  assert.equal(await page.locator('.board-lock').count(), 1);
  assert.equal(await page.locator('.board-phone').innerText(), '010-XXXX-1234');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await form.locator('#answer-13').fill('브라우저 확인');
  await page.locator('#board-application-close').click();
  await page.locator('#board-application').waitFor({ state: 'hidden' });
  await page.locator('main [data-consultation-apply]').click();
  await form.locator('#space-type-residential').waitFor();
  assert.equal(await form.locator('#answer-13').inputValue(), '브라우저 확인');
  await page.waitForFunction(() => { const f = document.getElementById('board-application-frame'); return f.contentDocument.body.scrollHeight <= f.contentWindow.innerHeight + 10; });
  await page.screenshot({ path: '/tmp/consultation-inline-' + width + '.png', fullPage: true });
  await page.locator('#board-application-close').click();
 }
 mode = 'empty';
 await page.reload({ waitUntil: 'domcontentloaded' });
 await page.getByText('상담 신청 내역이 없습니다.', { exact: true }).waitFor();
 mode = 'error';
 await page.reload({ waitUntil: 'domcontentloaded' });
 await page.getByRole('button', { name: '다시 시도' }).waitFor();
 mode = 'list';
 await page.getByRole('button', { name: '다시 시도' }).click();
 await page.getByRole('button', { name: '김*수 상담 내용 보기', exact: true }).waitFor();
 await page.goto(origin + '/consultation/?kakao=error&flow=fixture', { waitUntil: 'domcontentloaded' });
 await page.waitForURL(url => url.pathname === '/consultation/apply/', { waitUntil: 'domcontentloaded' });
 await page.locator('#stage').waitFor();
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({ browser: selection.browser, target: origin, mode: live ? 'live' : 'candidate', mobileAndDesktop: 'passed', columns: 4, permissions: 'allowed-and-denied', originalForm: 'passed', paginationEmptyErrorRetry: 'passed', realSubmissions: 0, blockedNonGet: writes }));
});
