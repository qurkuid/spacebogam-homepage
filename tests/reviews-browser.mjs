import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const root = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'spacebogam-review-browser-'));
const evidence = resolve('artifacts/customer-reviews-20261104/qa');
await mkdir(evidence, { recursive: true });
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, ROOT: root, REVIEWS_FILE: join(temporary, 'reviews.json'), REVIEWS_PUBLIC_ORIGIN: origin, PORT: String(port) };
let server = spawn(process.execPath, ['ops/spacebogam-serve.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = '';
server.stderr.on('data', chunk => { errors += chunk; });
const snapshots = [];
let attempt = 0;
function moderate(id, customer) {
  const result = spawnSync(process.execPath, ['ops/spacebogam-reviews.js', 'approve', id, '--customer', customer], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error(errors || 'Preview did not start'); })]);
  await withTestBrowser(async (context, selection) => {
    if (attempt++) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
      await rm(env.REVIEWS_FILE, { force: true });
      server = spawn(process.execPath, ['ops/spacebogam-serve.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      server.stderr.on('data', chunk => { errors += chunk; });
      await once(server.stdout, 'data');
    }
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(origin + '/reviews/');
    assert.equal((await page.locator('.rv-stat strong').allTextContents())[0], '0');
    assert.equal(await page.locator('.rv-card').count(), 0);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const styles = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        font: getComputedStyle(document.body).fontFamily,
        headingWeight: getComputedStyle(document.querySelector('h1')).fontWeight
      }));
      assert.equal(styles.overflow, false, `overflow at ${width}`);
      assert.equal(styles.background, 'rgb(246, 243, 237)');
      assert.match(styles.font, /^Suit/);
      assert.equal(styles.headingWeight, '400');
      await page.screenshot({ path: join(evidence, `empty-${width}.png`), fullPage: true });
      snapshots.push({ width, ...styles });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: '나의 경험 남기기' }).click();
    await page.locator('#review-writing[open]').waitFor();
    assert.equal(await page.locator('#review-writing').getAttribute('open'), '');
    await page.getByRole('radio', { name: '5점 · 매우 좋았어요', exact: true }).check();
    assert.match(await page.locator('#rating-description').innerText(), /^5점/);
    await page.locator('[name=nickname]').fill('테스트별명');
    await page.locator('#review-form [name=space]').selectOption('apartment');
    await page.locator('[name=experienceMonth]').fill('2026-01');
    await page.locator('[name=title]').fill('수납을 바꾼 뒤 달라진 생활');
    await page.locator('[name=body]').fill('테스트 전용 후기입니다. 수납 동선을 정리한 뒤 생활하면서 편리했던 점을 적습니다.');
    await page.locator('[name=consent]').check();
    assert.equal(await page.locator('#review-character-count').textContent(), String((await page.locator('[name=body]').inputValue()).length));
    await page.screenshot({ path: join(evidence, 'writer-390.png'), fullPage: true });
    const receiptPromise = page.waitForResponse(response => response.url() === origin + '/api/reviews' && response.request().method() === 'POST');
    await page.locator('#review-submit').click();
    const receiptResponse = await receiptPromise;
    assert.equal(receiptResponse.status(), 201);
    const receipt = await receiptResponse.json();
    await page.getByRole('status').filter({ hasText: '후기가 접수되었습니다' }).waitFor();
    assert(await page.locator('#review-form').isHidden());
    let listing = await (await fetch(origin + '/api/reviews')).json();
    assert.equal(listing.stats.reviewCount, 0, 'pending submission must not change published stats');
    moderate(receipt.id, 'fixture-customer-a');
    for (const [rating, title, customer, space] of [
      [3, '전체적으로 무난했던 공사 경험', 'fixture-customer-a', 'apartment'],
      [1, '마감 & 일정에 "아쉬움"이 남았어요', 'fixture-customer-b', 'house']
    ]) {
      const response = await fetch(origin + '/api/reviews', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ rating, title, nickname: '임시작성자', body: '테스트 전용 후기입니다. 일정 안내와 마감에서 개선되었으면 하는 점을 구체적으로 적습니다.', space, experienceMonth: '2026-02', consent: true, consentVersion: 'reviews-2026-11-04', website: '' }) });
      assert.equal(response.status, 201);
      moderate((await response.json()).id, customer);
    }
    listing = await (await fetch(origin + '/api/reviews')).json();
    assert.equal(listing.stats.reviewCount, 3);
    assert.equal(listing.stats.customerCount, 2);
    assert.equal(listing.stats.averageRating, 3);
    assert.equal(listing.stats.totalRating, 9);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/reviews/');
      assert.equal(await page.locator('.rv-card').count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: join(evidence, `populated-${width}.png`), fullPage: true });
    }
    await page.locator('.rv-tools [name=rating]').selectOption('1');
    await page.getByRole('button', { name: '찾아보기' }).click();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('.rv-card').count(), 1, 'rating filter result count');
    assert.match(await page.locator('.rv-card').innerText(), /아쉬움/);
    assert.deepEqual((await page.locator('.rv-stat strong').allTextContents()).slice(0, 2), ['2', '3']);
    await page.locator('.rv-card h2 a').click();
    await page.locator('.rv-detail').waitFor();
    assert(await page.locator('.rv-detail').isVisible());
    assert(await page.locator('.rv-intro').isHidden());
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), origin + new URL(page.url()).pathname);
    assert.match(await page.title(), /아쉬움/);
    await page.screenshot({ path: join(evidence, 'detail-1440.png'), fullPage: true });
    const source = await (await fetch(page.url())).text();
    assert(source.includes('마감 &amp; 일정에 &quot;아쉬움&quot;이 남았어요'), 'content is server rendered and escaped');
    await page.goto(origin + '/reviews/');
    await page.locator('.rv-tools [name=q]').fill('수납');
    await page.getByRole('button', { name: '찾아보기' }).click();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('.rv-card').count(), 1, 'text search result count');
    await page.goto(origin + '/reviews/?sort=lowest');
    assert.match(await page.locator('.rv-card').first().innerText(), /아쉬움/);
    await page.goto(origin + '/reviews/?q=존재하지않는검색어');
    assert.equal(await page.locator('.rv-card').count(), 0);
    assert(await page.locator('.rv-empty').isVisible());
    assert.deepEqual(runtimeErrors, []);
    const sitemap = await (await fetch(origin + '/reviews/sitemap.xml')).text();
    assert(sitemap.includes(receipt.id));
    await writeFile(join(evidence, 'browser-result.json'), JSON.stringify({ browser: selection.browser, snapshots, storedReviews: 3, distinctCustomers: 2, averageRating: 3, totalRating: 9, pendingExcluded: true, lowRatingVisible: true, serverRendered: true, realCustomerSubmissions: 0, runtimeErrors }, null, 2));
    console.log(JSON.stringify({ browser: selection.browser, widths: snapshots.map(item => item.width), realCustomerSubmissions: 0, result: 'passed' }));
  });
  const store = JSON.parse(await readFile(env.REVIEWS_FILE, 'utf8'));
  assert.equal(store.reviews.length, 3);
} catch (error) {
  console.error(JSON.stringify({ primary: error.primaryError?.stack || error.stack, fallback: error.fallbackOutcome?.error?.stack, serverErrors: errors }));
  throw error;
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}
