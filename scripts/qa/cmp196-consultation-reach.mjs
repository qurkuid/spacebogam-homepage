#!/usr/bin/env node
import assert from 'node:assert/strict';
import { withTestBrowser } from '/Users/changseok/.codex/browser-testing.mjs';
import { announceTarget } from './lib/qa-target.mjs';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';

const base = announceTarget('consultation reach');
const origin = new URL(base).origin;
const campaign = 'qa_consultation_direct';
await withTestBrowser(async (context, selection) => {
  const boardRequests = [];
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/consultation-board|\/consultation\/(list|board-access)/.test(url.pathname)) boardRequests.push(url.pathname);
    if (request.method() !== 'GET' || url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(qaEntryUrl(base + '/', { utm_campaign: campaign }), { waitUntil: 'domcontentloaded' });
    await page.locator('.v8-home-primary-cta').click();
    await page.locator('#stage #space-type-residential').waitFor();
    assert.equal(new URL(page.url()).pathname, '/consultation/');
    assert.equal(await page.locator('#stage #space-type-residential').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('iframe[title*="상담"], #consultation-table').count(), 0);
    assert.ok(await page.evaluate(() => document.querySelector('#stage').getBoundingClientRect().top < innerHeight));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  for (const path of ['/consultation/', '/consultation/apply/']) {
    const url = qaEntryUrl(base + path, { type: 'commercial', utm_campaign: campaign });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#stage #space-type-commercial[aria-pressed="true"]').waitFor();
    assert.equal(page.url(), url);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://spacebogam.kr/consultation/');
  }
  assert.deepEqual(boardRequests, []);
  assert.deepEqual(errors, []);
  console.log('PASS: home CTA, mobile and desktop form, commercial query and existing link', selection.kind ?? '');
});
