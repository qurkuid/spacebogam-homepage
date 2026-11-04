import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const evidence = resolve(process.env.EVIDENCE_DIR || 'artifacts/portfolio-gallery-20261104/qa');
await mkdir(evidence, { recursive: true });
let server;
let origin = process.env.BASE_URL;
if (!origin) {
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['ops/spacebogam-serve.js'], {
    env: { ...process.env, ROOT: resolve('.'), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Preview exited'); })]);
}
const snapshots = [];
try {
  await withTestBrowser(async (context, selection) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/portfolio.html#project-list');
    await page.screenshot({ path: join(evidence, `initial-${selection.browser}.png`) });
    await page.locator('.pf-browse-tools').waitFor();
    const visible = () => page.locator('.v8-grid > article:visible').count();
    const projects = () => page.locator('.v8-grid > article:visible [data-project]').evaluateAll(links => links.map(link => link.dataset.project));
    const toggle = name => page.getByRole('checkbox', { name, exact: true }).press('Space');
    const reset = async () => {
      await page.getByRole('button', { name: '초기화', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#portfolio-result').textContent === '전체 15개 현장');
      assert.equal(await visible(), 15);
    };
    assert.equal(await visible(), 15);
    assert.equal(await page.locator('#lifestyle-case-guide').count(), 0);
    const mega = page.locator('article:has([data-project="mega-centum-49py"])');
    assert.match(await mega.innerText(), /1억원 이상/);
    assert.match(await mega.innerText(), /샤시 포함 · 시스템에어컨 4대 · 확장 6개/);
    await page.getByRole('searchbox').fill('사직 ３２');
    assert.deepEqual(await projects(), ['sajik-32py']);
    await page.getByRole('searchbox').press('Enter');
    assert.deepEqual(await projects(), ['sajik-32py']);
    await reset();
    for (const [value, count] of [['20', 1], ['30', 6], ['40', 4], ['50', 4]]) {
      await page.getByRole('combobox', { name: '평형', exact: true }).selectOption(value);
      assert.equal(await visible(), count, `area ${value}`);
    }
    await reset();
    for (const [value, count] of [['7000', 5], ['8000', 3], ['10000', 1], ['unknown', 10]]) {
      await page.getByRole('combobox', { name: '공개 금액대' }).selectOption(value);
      assert.equal(await visible(), count, `budget ${value}`);
    }
    await reset();
    await toggle('아이 있는 집');
    await toggle('우드');
    assert.deepEqual(await projects(), ['mega-centum-49py', 'sajik-ssangyong', 'guseo-ssangyong']);
    await page.getByRole('combobox', { name: '평형', exact: true }).selectOption('40');
    assert.deepEqual(await projects(), ['mega-centum-49py', 'sajik-ssangyong']);
    await page.getByRole('combobox', { name: '공개 금액대' }).selectOption('10000');
    assert.deepEqual(await projects(), ['mega-centum-49py']);
    await toggle('핑크');
    assert.equal(await visible(), 0);
    assert(await page.locator('.v8-empty').isVisible());
    assert.equal(await page.locator('#portfolio-result').textContent(), '15개 중 0개 현장');
    await reset();
    await toggle('샤시');
    assert.deepEqual(await projects(), ['mega-centum-49py', 'yeonji-yurim-30py']);
    await reset();
    await page.getByRole('searchbox').fill('샤시');
    assert.deepEqual(await projects(), ['mega-centum-49py', 'yeonji-yurim-30py']);
    await reset();
    await page.getByRole('searchbox').fill('zz-no-project');
    assert.equal(await visible(), 0);
    await page.getByRole('searchbox').fill('');
    assert.equal(await visible(), 15);
    assert(await page.getByRole('button', { name: '초기화' }).isDisabled());
    for (const width of [360, 390, 768, 980, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/portfolio.html');
      await page.locator('.pf-browse-tools').waitFor();
      assert.equal(await page.locator('.pf-browse-tools').getAttribute('open'), width <= 680 ? null : '');
      assert.equal(await page.locator('.pf-tags').getAttribute('open'), width <= 680 ? null : '');
      await page.evaluate(async () => {
        for (const img of document.querySelectorAll('.v8-grid img')) {
          img.loading = 'eager';
          await img.decode();
        }
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });
      const styles = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        font: getComputedStyle(document.body).fontFamily,
        weight: getComputedStyle(document.querySelector('h1')).fontWeight,
        imageCount: [...document.querySelectorAll('.v8-grid img')].filter(img => img.complete && img.naturalWidth > 0).length,
        columns: getComputedStyle(document.querySelector('.v8-grid')).gridTemplateColumns.split(' ').length,
        galleryTop: document.querySelector('.v8-grid').getBoundingClientRect().top,
        imageRatio: (() => { const rect = document.querySelector('.v8-grid img').getBoundingClientRect(); return rect.width / rect.height; })(),
      }));
      assert.equal(styles.overflow, false, `overflow at ${width}`);
      assert.equal(styles.background, 'rgb(246, 243, 237)');
      assert.match(styles.font, /^Suit/);
      assert.equal(styles.weight, '400');
      assert.equal(styles.imageCount, 15);
      assert(Math.abs(styles.imageRatio - 1.45) < 0.01, `image ratio at ${width}`);
      assert.equal(styles.columns, width <= 680 ? 1 : 2);
      await page.screenshot({ path: join(evidence, `gallery-${width}.png`), fullPage: true });
      if ([390, 1440].includes(width)) await page.screenshot({ path: join(evidence, `viewport-${width}.png`) });
      snapshots.push({ browser: selection.browser, width, ...styles });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/portfolio.html');
    await page.locator('.pf-browse-tools > summary').click();
    await page.locator('.pf-tags summary').click();
    await toggle('TV 없는 거실');
    await page.screenshot({ path: join(evidence, 'filtered-390.png'), fullPage: true });
    assert.equal(await visible(), 2);
    await reset();
    for (const width of [360, 390, 768, 980, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin + '/portfolio.html?qa_test=1');
      for (const room of ['거실', '주방', '침실', '욕실', '현관·복도', '기타공간']) {
        const button = page.locator('.pf-rooms').getByRole('button', { name: room, exact: true });
        assert((await button.boundingBox()).height >= 44);
        await button.click();
        assert.equal(new URL(page.url()).searchParams.get('room'), room);
        assert.equal(new URL(page.url()).searchParams.get('qa_test'), '1');
        const matching = await page.locator('.v8-grid > article:visible').evaluateAll((cards, room) => cards.every(card => {
          const photo = JSON.parse(card.dataset.roomPhotos)[room];
          return card.querySelector('img').getAttribute('src') === photo.src
            && card.querySelector('img').getAttribute('alt') === photo.alt
            && new URL(card.querySelector('a').href).searchParams.get('room') === room;
        }), room);
        assert(matching && await visible() > 0, room);
      }
      await page.locator('.pf-rooms').getByRole('button', { name: '주방', exact: true }).click();
      if (width <= 680) await page.locator('.pf-browse-tools > summary').click();
      await page.getByRole('combobox', { name: '공개 금액대' }).selectOption('10000');
      assert.deepEqual(await projects(), ['mega-centum-49py']);
      await mega.locator('img').evaluate(img => img.decode());
      await page.screenshot({ path: join(evidence, `room-kitchen-${width}.png`) });
      await mega.locator('a').click();
      await page.locator('.pd-rooms [aria-pressed="true"]').waitFor();
      assert.equal(await page.locator('.pd-rooms [aria-pressed="true"]').getAttribute('data-room'), '주방');
      assert.equal(await page.locator('.case-gallery figure:visible').evaluateAll(items => items.every(item => item.dataset.room === '주방')), true);
      assert.equal(await page.locator('.pd-back').first().evaluate(link => new URL(link.href).searchParams.get('room')), '주방');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.deepEqual(errors, []);
    const touchContext = await context.browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    try {
      await touchContext.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
      const touchPage = await touchContext.newPage();
      await touchPage.goto(origin + '/portfolio.html');
      await touchPage.locator('.pf-rooms').getByRole('button', { name: '욕실', exact: true }).tap();
      const firstCard = touchPage.locator('.v8-grid > article:visible').first();
      await firstCard.locator('img').evaluate(img => img.decode());
      assert.match(await firstCard.locator('img').evaluate(img => img.currentSrc), /-(720|1280)\.webp$/);
      await firstCard.locator('a').tap();
      await touchPage.locator('.pd-rooms').waitFor();
      assert.equal(await touchPage.locator('.pd-rooms [aria-pressed="true"]').getAttribute('data-room'), '욕실');
      await touchPage.locator('.case-gallery figure:visible a').first().tap();
      assert(await touchPage.locator('dialog[open]').isVisible());
      await touchPage.locator('.lb-next').tap();
      await touchPage.locator('.lb-slide img').evaluate(img => img.decode());
      await touchPage.locator('.lb-close').tap();
      await touchPage.waitForFunction(() => !document.querySelector('dialog').classList.contains('open'));
      await touchPage.screenshot({ path: join(evidence, 'touch-bathroom-dpr2.png') });
    } finally { await touchContext.close(); }
    const noJS = await context.browser().newContext({ javaScriptEnabled: false });
    try {
      await noJS.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
      const staticPage = await noJS.newPage();
      await staticPage.goto(origin + '/portfolio.html');
      assert.equal(await staticPage.locator('.v8-grid > article:visible').count(), 15);
      assert(await staticPage.locator('#portfolio-filters').isHidden());
    } finally { await noJS.close(); }
  });
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ origin, passed: true, snapshots, checks: ['15 projects/schema preserved', 'search/NFKC/multiple terms', 'area/budget', 'AND tags', 'combined filters', 'zero results', 'reset', 'keyboard', '15 images', 'no-JS', 'responsive brand styles', 'no runtime errors'] }, null, 2));
  console.log(JSON.stringify({ passed: true, origin, evidence, snapshots }, null, 2));
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({
    message: error.message,
    primary: error.primaryError?.stack || error.stack,
    fallback: error.fallbackOutcome?.error?.stack || error.fallbackOutcome?.status,
  }, null, 2));
  throw error;
} finally {
  if (server) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
}
