const assert = require('node:assert/strict');
const puppeteer = require('../../../intm-cmp244/node_modules/puppeteer');

(async () => {
  const base = process.env.CMP846_BASE_URL || 'http://127.0.0.1:8766/';
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  const routes = [
    '', 'portfolio.html', 'case-daewoo-ian-35py.html', 'blog.html',
    'blog/224195906561-화명동-대우이안-35평-인테리어-구축-아파트-변수를.html',
    'blog/224254948259-부산-화명동-대우이안-35평-화이트-앤-우드.html',
  ];

  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(base) ? request.continue() : request.abort());
  for (const width of [1440, 360]) {
    await page.setViewport({width, height: 800, deviceScaleFactor: 1});
    for (const route of routes) {
      await page.goto(base + route, {waitUntil: 'domcontentloaded'});
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        forbidden: document.querySelectorAll('.spacebogam-mobile-actions,.spacebogam-header-call,.spacebogam-header-kakao,a[href^="tel:"],a[href*="kakao.com"],form').length,
      }));
      assert.equal(state.overflow, false, `${width} ${route}: horizontal overflow`);
      assert.equal(state.forbidden, 0, `${width} ${route}: forbidden CTA/form`);
    }
  }

  await page.setViewport({width: 1440, height: 900});
  for (const [route, selector, event] of [
    ['', '[data-conversion-event="home_blog_story_open"]', 'home_blog_story_open'],
    ['portfolio.html', '[data-conversion-event="portfolio_related_story_open"]', 'portfolio_related_story_open'],
    ['case-daewoo-ian-35py.html', '[data-conversion-event="case_related_story_open"]', 'case_related_story_open'],
    ['blog.html', '[data-conversion-event="blog_case_open"]', 'blog_case_open'],
    [routes[4], '[data-conversion-event="blog_naver_source_open"]', 'blog_naver_source_open'],
  ]) {
    await page.goto(base + route, {waitUntil: 'domcontentloaded'});
    await page.$eval(selector, link => link.addEventListener('click', click => click.preventDefault()));
    await page.click(selector);
    const hit = await page.evaluate(name => (window.dataLayer || []).find(item => item.event === name), event);
    assert.ok(hit, `${event}: missing`);
    for (const key of ['page_path', 'link_url', 'story_id', 'case_id', 'placement', 'device_class']) assert.ok(Object.hasOwn(hit, key), `${event}: ${key}`);
  }

  console.log('CMP-846 RUNTIME PASS: 12 renders, overflow 0, forbidden CTA/form 0, 5 event samples complete');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
