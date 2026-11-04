import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';
import { qaEntryUrl } from '../scripts/qa/lib/qa-entry-url.mjs';

const evidence = resolve(process.env.EVIDENCE_DIR || 'artifacts/portfolio-rooms-speed-20261104/loading');
await mkdir(evidence, { recursive: true });
let server;
let origin = process.env.BASE_URL;
if (!origin) {
  const reservation = createServer();
  await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise(done => reservation.close(done));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['ops/spacebogam-serve.js'], { env: { ...process.env, ROOT: resolve('.'), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('Preview exited'); })]);
}
const results = [];
try {
  await withTestBrowser(async (context, selection) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.testLCP = 0;
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.testLCP = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024, connectionType: 'cellular4g' });
    for (const pathname of ['/portfolio.html', '/case-mega-centum-49py.html', '/case-guseo-ssangyong-sweetdot-home.html', '/case-hwamyeong-kolong.html']) {
      const requests = new Set();
      const collect = request => { if (request.resourceType() === 'image' && request.url().includes('/assets/')) requests.add(new URL(request.url()).pathname); };
      page.on('request', collect);
      await page.goto(qaEntryUrl(origin + pathname), { waitUntil: 'domcontentloaded' });
      await page.locator('main img').first().evaluate(img => Promise.race([img.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('First photo decode timeout')), 20000))]));
      await page.waitForTimeout(1500);
      const metrics = await page.evaluate(() => ({
        lcp: window.testLCP,
        imageBytes: performance.getEntriesByType('resource').filter(entry => entry.initiatorType === 'img').reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        loadedImages: [...document.querySelectorAll('main img')].filter(img => img.complete && img.naturalWidth).length,
        firstPhoto: document.querySelector('main img').currentSrc,
      }));
      assert(metrics.loadedImages > 0);
      page.off('request', collect);
      const result = { pathname, browser: selection.browser, width: 390, ...metrics, requestedImages: requests.size, requests: [...requests] };
      results.push(result);
      console.log(JSON.stringify({ ...result, requests: undefined }));
      await page.screenshot({ path: join(evidence, pathname.replaceAll('/', '').replace('.html', '') + '.png') });
    }
  });
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ origin, network: '150ms latency / 1.6Mbps download', results }, null, 2));
} finally {
  if (server) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
}
