import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';
import { qaEntryUrl } from '../scripts/qa/lib/qa-entry-url.mjs';

const evidence = resolve(process.env.EVIDENCE_DIR || 'artifacts/content-first-screen-20261104/qa');
await mkdir(evidence, { recursive: true });
let origin = process.env.BASE_URL;
let server;
let temporary;
if (!origin) {
  temporary = await mkdtemp(join(tmpdir(), 'spacebogam-content-first-'));
  const fixture = { version: 1, reviews: [5, 1].map((rating, index) => ({
    id: randomUUID(), rating, title: index ? '마감 안내가 아쉬웠던 경험입니다' : '수납과 동선이 편리해졌습니다',
    body: '격리된 화면 검증용 후기입니다. 실제 고객의 후기가 아니며 운영 서비스에는 저장하지 않습니다.',
    nickname: '화면검증', space: 'apartment', experienceMonth: '2026-01', status: 'approved', customerId: 'fixture-'+index,
    createdAt: '2026-01-01T00:00:00.000Z', consentedAt: '2026-01-01T00:00:00.000Z', publishedAt: '2026-01-01T00:00:00.000Z',
    consentVersion: 'reviews-2026-11-04', idempotencyKey: randomUUID(), fingerprint: '0'.repeat(64)
  })) };
  await writeFile(join(temporary, 'reviews.json'), JSON.stringify(fixture), { mode: 0o600 });
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['ops/spacebogam-serve.js'], { env: { ...process.env, ROOT: resolve('.'), PORT: String(port), REVIEWS_FILE: join(temporary, 'reviews.json'), INTM_REVIEWS_ORIGIN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Preview exited'); })]);
}
try {
  await withTestBrowser(async (context, selection) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const snapshots = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const pathname of ['/reviews/', '/portfolio.html']) {
      for (const [width, height] of [[320, 568], [360, 640], [390, 844], [768, 1024], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        const response = await page.goto(qaEntryUrl(origin + pathname), { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        const selector = pathname === '/reviews/' ? '.rv-card h2, .rv-empty h2' : '.v8-grid > article:first-child h2';
        await page.locator(selector).first().waitFor();
        if (pathname === '/portfolio.html') await page.locator('.v8-grid img').first().evaluate(image => image.decode());
        const layout = await page.evaluate(selector => {
          const title = document.querySelector(selector);
          const box = title.getBoundingClientRect();
          const image = document.querySelector('.v8-grid img');
          const overlays = [...document.querySelectorAll('.spacebogam-mobile-actions, .sb-entry-dock')].filter(item => getComputedStyle(item).display !== 'none');
          const visibleBottom = Math.min(innerHeight, ...overlays.map(item => item.getBoundingClientRect().top));
          return { title: title.textContent.trim(), titleTop: box.top, titleBottom: box.bottom, imageTop: image?.getBoundingClientRect().top,
            imageLoaded: image ? image.complete && image.naturalWidth > 0 : undefined, visibleBottom, scrollY,
            overflow: document.documentElement.scrollWidth > innerWidth };
        }, selector);
        snapshots.push({ pathname, width, height, ...layout });
        await page.screenshot({ path: join(evidence, `${pathname.includes('reviews') ? 'reviews' : 'portfolio'}-${width}.png`) });
      }
    }
    await writeFile(join(evidence, 'layout.json'), JSON.stringify(snapshots, null, 2));
    for (const layout of snapshots) {
      assert.equal(layout.scrollY, 0);
      assert.equal(layout.overflow, false);
      if (layout.width <= 390) {
        if (layout.pathname === '/reviews/') assert(layout.titleBottom <= layout.visibleBottom, `review below fold: ${JSON.stringify(layout)}`);
        else assert(layout.imageLoaded && layout.imageTop <= 300 && layout.visibleBottom - layout.imageTop >= 100, `photo below fold: ${JSON.stringify(layout)}`);
      }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    for (const pathname of ['/reviews/', '/portfolio.html']) {
      await page.goto(qaEntryUrl(origin + pathname), { waitUntil: 'domcontentloaded' });
      const panel = page.locator(pathname === '/reviews/' ? '.rv-browse-tools' : '.pf-browse-tools');
      assert.equal(await panel.getAttribute('open'), null);
      await panel.locator(':scope > summary').press('Enter');
      assert.equal(await panel.getAttribute('open'), '');
      await panel.locator('input[type=search]').fill('존재하지않는검색어xyz');
      if (pathname === '/reviews/') {
        await panel.getByRole('button', { name: '찾아보기' }).click();
        await page.waitForURL(url => url.searchParams.has('q'), { waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('.rv-card').count(), 0);
        assert(await page.locator('.rv-empty').isVisible());
      } else {
        assert.equal(await page.locator('.v8-grid > article:visible').count(), 0);
        await panel.getByRole('button', { name: '초기화', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#portfolio-result').textContent === '전체 15개 현장');
        assert.equal(await page.locator('.v8-grid > article:visible').count(), 15);
      }
      await page.locator('.site-menu-toggle').click();
      assert(await page.locator('#site-navigation').isVisible());
      assert(await page.locator('body > header .v8-consult').isVisible());
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: 'passed', browser: selection.browser, snapshots, disclosure: true, filters: true, menu: true, runtimeErrors: errors }, null, 2));
    console.log(JSON.stringify({ status: 'passed', browser: selection.browser, checks: snapshots.length }));
  });
} catch (error) {
  const failure = { primary: error.primaryError?.stack || error.stack, fallback: error.fallbackOutcome?.error?.stack };
  await writeFile(join(evidence, 'failure.json'), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
