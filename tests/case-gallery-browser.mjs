import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { qaEntryUrl } from '../scripts/qa/lib/qa-entry-url.mjs';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const evidence = resolve(process.env.EVIDENCE_DIR || 'artifacts/portfolio-details-20261104/qa');
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
    const response = await context.request.get(origin + '/portfolio.html');
    const portfolioHTML = await response.text();
    const projects = [...portfolioHTML.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => ({
      path: match[0].match(/href="([^"]+)"/)[1],
      title: match[0].match(/<h2>([^<]+)<\/h2>/)[1],
      count: Number(match[0].match(/사진 (\d+)장/)[1]),
    }));
    assert.equal(projects.length, 15);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const project of projects) {
        await page.goto(qaEntryUrl(origin + '/' + project.path));
        assert.equal(await page.locator('h1').textContent(), project.title);
        assert.equal(await page.locator('[data-gallery-image]').count(), project.count);
        for (const name of ['현장 정보', '완성 사진', '이 현장으로 상담하기']) {
          assert.equal(await page.getByRole('heading', { name, exact: true }).count(), 1);
        }
        assert.equal(await page.locator('.pd-scope dt').count(), 3);
        assert(await page.locator('.pd-tags li').count() > 0);
        await page.locator('.pd-cover img').evaluate(async img => img.decode());
        await page.evaluate(() => document.fonts.ready);
        const styles = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          font: getComputedStyle(document.body).fontFamily,
          weight: getComputedStyle(document.querySelector('h1')).fontWeight,
          background: getComputedStyle(document.body).backgroundColor,
          columns: getComputedStyle(document.querySelector('.case-gallery')).columnCount,
          imageRatio: (() => { const img = document.querySelector('.pd-cover img'), r = img.getBoundingClientRect(); return Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight); })(),
        }));
        assert.equal(styles.overflow, false, project.path + width);
        assert.match(styles.font, /^Suit/);
        assert.equal(styles.weight, '400');
        assert.equal(styles.background, 'rgb(246, 243, 237)');
        assert.equal(Number(styles.columns), width === 390 ? 2 : 3);
        assert(styles.imageRatio < .01, project.path + ' cover ratio');
        const cover = page.locator('[data-gallery-image]').first();
        await cover.click();
        assert(await page.locator('dialog[open]').isVisible());
        assert.equal(await page.locator('.lb-count').textContent(), `1 / ${project.count}`);
        await page.locator('.lb-slide img').evaluate(async img => img.decode());
        await page.getByRole('button', { name: '이전 사진', exact: true }).click();
        assert.equal(await page.locator('.lb-count').textContent(), `${project.count} / ${project.count}`);
        await page.locator('.lb-slide img').evaluate(async img => img.decode());
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('.lb-count').textContent(), `1 / ${project.count}`);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert(await cover.evaluate(link => document.activeElement === link));
        await page.waitForFunction(() => document.body.style.overflow === '');
        await page.locator('a[href="#case-photos"]').click();
        const visiblePhotos = await page.locator('.case-gallery img').evaluateAll(async images => {
          const visible = images.filter(img => { const r = img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
          await Promise.all(visible.map(img => img.decode()));
          return visible.length;
        });
        assert(visiblePhotos > 0, project.path + ' gallery is visible after section navigation');
        if (project.path.includes('mega-centum')) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: join(evidence, `detail-${width}.png`) });
          await page.locator('a[href="#case-photos"]').click();
          await page.locator('.case-gallery img').evaluateAll(async images => { await Promise.all(images.filter(img => { const r = img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).map(img => img.decode())); });
          await page.screenshot({ path: join(evidence, `photos-${width}.png`) });
          await page.locator('[data-gallery-image]').nth(1).click();
          assert.equal(await page.locator('.lb-count').textContent(), `2 / ${project.count}`);
          for (let tab = 0; tab < 8; tab++) {
            await page.keyboard.press('Tab');
            assert(await page.evaluate(() => document.activeElement === document.body || document.querySelector('dialog').contains(document.activeElement)));
          }
          await page.locator('.lb-viewport').evaluate(viewport => {
            const touch = x => new Touch({ identifier: 1, target: viewport, clientX: x, clientY: 200 });
            viewport.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(300)] }));
            viewport.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(100)] }));
          });
          assert.equal(await page.locator('.lb-count').textContent(), `3 / ${project.count}`);
          if (width === 390) assert(await page.locator('.sb-entry-dock').evaluate(el => getComputedStyle(el).visibility === 'hidden'));
          await page.locator('.lb-slide img').evaluate(async img => img.decode());
          await page.screenshot({ path: join(evidence, `viewer-${width}.png`) });
          await page.getByRole('button', { name: '닫기', exact: true }).click();
        }
        if (project.path.includes('yeonji')) {
          assert.equal(await page.locator('#before-after .pd-pair').count(), 4);
          assert.equal(await page.locator('#before-after img').count(), 8);
          await page.locator('a[href="#before-after"]').click();
          await page.locator('#before-after img').evaluateAll(async images => { await Promise.all(images.filter(img => { const r = img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).map(img => img.decode())); });
          await page.screenshot({ path: join(evidence, `before-after-${width}.png`) });
        }
        snapshots.push({ browser: selection.browser, project: project.path, width, count: project.count, ...styles });
      }
    }
    assert.deepEqual(errors, []);
    const noJS = await context.browser().newContext({ javaScriptEnabled: false });
    try {
      await noJS.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
      const staticPage = await noJS.newPage();
      await staticPage.goto(qaEntryUrl(origin + '/case-mega-centum-49py.html'));
      assert.equal(await staticPage.locator('[data-gallery-image]').count(), 76);
      assert.equal(await staticPage.locator('dialog').count(), 0);
      assert.equal(await staticPage.locator('[data-gallery-image]').first().getAttribute('target'), '_blank');
    } finally { await noJS.close(); }
  });
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ origin, passed: true, snapshots, checks: ['15 pages, 2 widths', 'titles/sections/metadata', 'cover and last photos decode', 'native dialog focus/Esc/arrows/wrap/swipe', 'no-JS photo links', 'before-after pairs', 'no overflow/runtime errors', 'brand styles'] }, null, 2));
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
