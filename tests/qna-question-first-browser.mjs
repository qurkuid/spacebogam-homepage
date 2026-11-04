import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';
import { qaEntryUrl } from '../scripts/qa/lib/qa-entry-url.mjs';

const evidence = resolve(process.env.EVIDENCE_DIR || 'artifacts/qna-question-first-20261104/qa');
await mkdir(evidence, { recursive: true });
let origin = process.env.BASE_URL;
let server;
if (!origin) {
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['ops/spacebogam-serve.js'], { env: { ...process.env, ROOT: resolve('.'), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    for (const [width, height] of [[320, 568], [360, 640], [390, 844], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      const response = await page.goto(qaEntryUrl(origin + '/qna.html'));
      assert.equal(response.status(), 200);
      const layout = await page.evaluate(() => {
        const questions = [...document.querySelectorAll('.faq-item summary')];
        const actions = document.querySelector('.spacebogam-mobile-actions');
        const visibleBottom = actions && getComputedStyle(actions).display !== 'none' ? actions.getBoundingClientRect().top : innerHeight;
        return { visibleBottom, firstQuestionTop: questions[0].getBoundingClientRect().top, visibleQuestions: questions.filter(item => { const box = item.getBoundingClientRect(); return box.top >= 0 && box.bottom <= visibleBottom; }).length, scrollY, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      snapshots.push({ width, height, ...layout });
      await page.screenshot({ path: join(evidence, `first-screen-${width}.png`) });
      await writeFile(join(evidence, 'layout.json'), JSON.stringify(snapshots, null, 2));
      assert.equal(layout.scrollY, 0);
      assert(layout.firstQuestionTop <= 300, `first question below 300px: ${JSON.stringify(layout)}`);
      assert(layout.visibleQuestions >= 3, `fewer than 3 initial questions: ${JSON.stringify(layout)}`);
      assert.equal(layout.overflow, false);
    }
    const content = await page.evaluate(() => {
      const schema = [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => JSON.parse(script.textContent)).find(item => item['@type'] === 'FAQPage');
      return { schema: schema.mainEntity, questions: [...document.querySelectorAll('.faq-item')].map(item => ({ name: item.querySelector('summary').textContent.trim(), answer: item.querySelector('.faq-answer').textContent.trim() })) };
    });
    assert.equal(content.questions.length, 37);
    for (const question of content.questions) assert.equal(question.answer, content.schema.find(item => item.name === question.name)?.acceptedAnswer.text);
    const first = page.locator('.faq-item').first();
    await first.locator('summary').press('Enter');
    assert.equal(await first.getAttribute('open'), '');
    await first.locator('summary').press('Enter');
    assert.equal(await first.getAttribute('open'), null);
    const search = page.locator('#faq-search');
    await search.fill('실측');
    assert(await page.locator('[data-faq-count]').isVisible());
    assert(await page.locator('.faq-item:visible').count() > 0);
    await search.fill('질문없음xyz');
    assert(await page.locator('[data-faq-empty]').isVisible());
    await page.locator('.faq-search [data-faq-reset]').click();
    assert.equal(await page.locator('.faq-item:visible').count(), 37);
    assert(await page.locator('[data-faq-count]').isHidden());
    await page.locator('.faq-stage-nav a[href="#aftercare"]').click();
    assert.equal(new URL(page.url()).hash, '#aftercare');
    await page.goto(qaEntryUrl(origin + '/qna.html#q-07'));
    assert.equal(await page.locator('#q-07').getAttribute('open'), '');
    assert.deepEqual(errors, []);
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: 'passed', browser: selection.browser, snapshots, questionsPreserved: 37, answersMatchSchema: true, search: true, keyboard: true, anchorLinks: true, runtimeErrors: errors }, null, 2));
    console.log(JSON.stringify({ status: 'passed', browser: selection.browser, snapshots }));
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
