import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';
import { qaEntryUrl } from '../scripts/qa/lib/qa-entry-url.mjs';
import { devices } from '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs';

const evidence = resolve(process.env.EVIDENCE_DIR || 'artifacts/mobile-navigation-20261104/qa');
await mkdir(evidence, { recursive: true });
let origin = process.env.BASE_URL;
let server;
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
try {
  await withTestBrowser(async (context, selection) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const checks = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const pathname of ['/', '/qna.html', '/reviews/', '/portfolio.html', '/guide-apartment-cost.html', '/insights/', '/qna/']) {
      await page.goto(qaEntryUrl(origin + pathname));
      const toggle = page.locator('.site-menu-toggle');
      const nav = page.locator('#site-navigation');
      const consultation = page.locator('body > header a').filter({ hasText: /^상담 신청$/ });
      for (const width of [320, 390, 768, 860, 861, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert(await consultation.isVisible(), `consultation visible: ${pathname} ${width}`);
        assert.match(await consultation.getAttribute('href'), /\/consultation\//);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow: ${pathname} ${width}`);
        if (width > 860) {
          assert(await toggle.isHidden());
          assert(await nav.isVisible());
        } else {
          assert(await toggle.isVisible());
          assert.equal(await toggle.getAttribute('aria-label'), '메뉴 열기');
          assert(await nav.isHidden());
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          assert(await nav.isVisible());
          assert.deepEqual((await nav.locator('a').allTextContents()).slice(0, 3), ['Q&A', '고객 후기', '포트폴리오']);
          assert.equal(await nav.locator('a').count(), 8);
          assert.equal(await nav.locator('a[href*="consultation"]').count(), 0);
          assert(await consultation.isVisible());
          await page.keyboard.press('Escape');
          assert(await nav.isHidden());
          assert(await toggle.evaluate(button => button === document.activeElement));
        }
        checks.push({ pathname, width });
      }
    }
    await page.goto(qaEntryUrl(origin + '/'));
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.locator('.site-menu-toggle');
    const nav = page.locator('#site-navigation');
    await page.screenshot({ path: join(evidence, 'mobile-closed.png') });
    await toggle.click();
    await page.screenshot({ path: join(evidence, 'mobile-open.png') });
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), 'Q&A');
    await page.keyboard.press('Enter');
    await page.waitForURL(url => url.pathname === '/qna.html');
    assert(await nav.isHidden());
    assert.equal(new URL(await nav.locator('[aria-current="page"]').getAttribute('href'), origin).pathname, '/qna.html');
    for (const href of ['/reviews/', '/portfolio.html']) {
      await toggle.click();
      await nav.locator(`a[href^="${href}"]`).click();
      await page.waitForURL(url => url.pathname === href);
      assert(await nav.isHidden());
    }
    await toggle.click();
    await page.locator('body > footer').click({ position: { x: 5, y: 5 } });
    assert(await nav.isHidden());
    await toggle.click();
    await page.locator('body > header .v8-consult').focus();
    await page.keyboard.press('Tab');
    assert(await nav.isHidden(), 'tabbing out closes dropdown');
    await toggle.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert(await nav.isVisible());
    await page.screenshot({ path: join(evidence, 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await nav.isHidden());
    const mobileChecks = [];
    for (const device of ['iPhone 13', 'Pixel 7']) {
      const mobile = await context.browser().newContext({ ...devices[device] });
      try {
        await mobile.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
        const touchPage = await mobile.newPage();
        touchPage.setDefaultTimeout(10000);
        touchPage.on('pageerror', error => errors.push(error.message));
        const navigationStatuses = [];
        touchPage.on('response', response => {
          if (response.request().isNavigationRequest() && response.frame() === touchPage.mainFrame()) navigationStatuses.push(response.status());
        });
        const button = touchPage.locator('.site-menu-toggle');
        const menu = touchPage.locator('#site-navigation');
        for (const href of ['/qna.html', '/reviews/', '/portfolio.html']) {
          const response = await touchPage.goto(qaEntryUrl(origin + '/'), { waitUntil: 'domcontentloaded' });
          assert.equal(response.status(), 200);
          await button.waitFor({ state: 'visible' });
          assert(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0));
          await button.tap();
          assert.equal(await button.getAttribute('aria-expanded'), 'true');
          assert(await menu.isVisible());
          if (href === '/qna.html') await touchPage.screenshot({ path: join(evidence, `${device.replaceAll(' ', '-')}-menu.png`) });
          await menu.locator(`a[href^="${href}"]`).tap();
          await touchPage.waitForURL(url => url.pathname === href);
          await button.waitFor({ state: 'visible' });
          assert(await menu.isHidden());
          await button.tap();
          assert(await menu.isVisible());
          await button.tap();
          assert(await menu.isHidden());
          assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          mobileChecks.push({ device, href, touchNavigation: true, closeReopen: true });
        }
        const consultation = touchPage.locator('body > header a').filter({ hasText: /^상담 신청$/ });
        assert(await consultation.isVisible());
        await consultation.tap();
        await touchPage.waitForURL(url => url.pathname === '/consultation/');
        assert(await touchPage.locator('main').isVisible());
        assert(navigationStatuses.every(status => status >= 200 && status < 400), `${device}: navigation HTTP ${navigationStatuses.join(',')}`);
        mobileChecks.push({ device, href: '/consultation/', separateConsultation: true, navigationStatuses });
      } finally { await mobile.close(); }
    }
    assert.deepEqual(errors, []);
    const result = { status: 'passed', browser: selection.browser, checks, mobileChecks, navigation: ['Q&A', '고객 후기', '포트폴리오'], keyboard: true, outsideClose: true, resize: true, runtimeErrors: errors };
    await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, browser: result.browser, checks: checks.length }));
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
}
