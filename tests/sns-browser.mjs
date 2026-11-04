import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';

const root = resolve('.');
const out = resolve('artifacts/footer-sns-20261104/qa');
await mkdir(out, { recursive: true });
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const origin = process.env.SNS_BASE_URL || `http://127.0.0.1:${port}`;
let server;
if (!process.env.SNS_BASE_URL) {
  server = spawn(process.execPath, ['ops/spacebogam-serve.js'], { env: { ...process.env, ROOT: root, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await once(server.stdout, 'data');
}
const evidence = [];
try {
  await withTestBrowser(async (context, selection) => {
    let mode = process.env.SNS_BASE_URL ? 'live' : 'ready';
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === '/api/social-feed' && mode !== 'live') return route.fulfill({ json: { instagram: {
          status: mode, posts: mode === 'ready' ? [{ caption: '<script>fixture</script> 실제 게시물 캡션', image: 'https://scontent.cdninstagram.com/test.jpg', url: 'https://www.instagram.com/p/Test1/' }] : []
        } } });
        if (route.request().method() !== 'GET') return route.abort();
        return route.continue();
      }
      if (url.href === 'https://scontent.cdninstagram.com/test.jpg') return route.fulfill({ contentType: 'image/jpeg', body: await readFile(resolve('assets/portfolio/mega-centum-49py.jpg')) });
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/sns/?is_test=1');
      await page.waitForFunction(() => !document.querySelector('#instagram-status').textContent.includes('불러오고'));
      assert.equal(await page.locator('#blog .sns-card').count(), 6);
      assert.match(await page.locator('footer').innerText(), /부산진2022-02-07/);
      assert.match(await page.locator('footer').innerText(), /625-43-01028/);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://spacebogam.kr/sns/');
      const styles = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, background: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily, weight: getComputedStyle(document.querySelector('h1')).fontWeight }));
      assert.equal(styles.overflow, false, `overflow at ${width}`);
      assert.equal(styles.background, 'rgb(246, 243, 237)');
      assert.match(styles.font, /^Suit/); assert.equal(styles.weight, '400');
      for (const image of await page.locator('#blog img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(img => img.decode()); }
      for (const link of await page.locator('#blog .sns-card').all()) {
        assert.match(await link.getAttribute('href'), /^https:\/\/blog.naver.com\/baek1985\/\d+$/);
        assert.equal(await link.getAttribute('target'), '_blank');
      }
      if (mode === 'ready') {
        assert.equal(await page.locator('#instagram-posts .sns-card').count(), 1);
        assert.equal(await page.locator('#instagram-posts script').count(), 0);
        assert.match(await page.locator('#instagram-posts').innerText(), /<script>fixture<\/script>/);
      }
      await page.screenshot({ path: `${out}/${mode}-${width}.png`, fullPage: true });
      evidence.push({ width, mode, browser: selection.browser, ...styles });
    }
    if (mode !== 'live') {
      mode = 'unavailable';
      await page.goto(origin + '/sns/?is_test=1');
      await page.getByRole('status').filter({ hasText: '연결하고 있습니다' }).waitFor();
      assert.equal(await page.locator('#instagram-posts .sns-card').count(), 0);
      assert.equal(await page.getByRole('link', { name: '@ggbg.official ↗' }).getAttribute('href'), 'https://www.instagram.com/ggbg.official/');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/?is_test=1');
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.locator('header nav').getByRole('link', { name: 'SNS', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/sns/');
    assert.match(await page.locator('footer').innerText(), /대표 백창석/);
    assert.deepEqual(errors, []);
  });
  await writeFile(`${out}/evidence${process.env.SNS_BASE_URL ? '-live' : ''}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: 'passed', scenarios: evidence.length, evidence: out }));
} finally { if (server) { const stopped = once(server, 'exit'); server.kill(); await stopped; } }
