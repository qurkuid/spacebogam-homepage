const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../../../intm-cmp244/node_modules/puppeteer');

(async () => {
  const base = process.env.CMP803_BASE_URL || 'http://127.0.0.1:8765/';
  const output = process.env.CMP803_OUTPUT_DIR || 'artifacts/cmp803';
  fs.mkdirSync(output, {recursive: true});
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(base) ? request.continue() : request.abort());

  for (const [name, route, width, height] of [
    ['home-desktop', '', 1440, 900],
    ['portfolio-desktop', 'portfolio.html', 1440, 900],
    ['project-desktop', 'case-hwamyeong-kolong.html', 1440, 900],
    ['home-mobile-360', '', 360, 800],
    ['portfolio-mobile-360', 'portfolio.html', 360, 800],
    ['project-mobile-360', 'case-hwamyeong-kolong.html', 360, 800],
  ]) {
    await page.setViewport({width, height, deviceScaleFactor: 1});
    await page.goto(base + route, {waitUntil: 'domcontentloaded'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`${name}: horizontal overflow`);
    await page.screenshot({path: path.join(output, `${name}.png`), fullPage: true});
  }

  await page.setViewport({width: 1440, height: 900});
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  const home = await page.evaluate(() => ({
    font: document.fonts.check('16px Suit') && getComputedStyle(document.body).fontFamily.startsWith('Suit'),
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    robots: document.querySelector('meta[name="robots"]')?.content,
    mainLinks: document.querySelectorAll('main a').length,
    forms: document.forms.length,
    consults: document.querySelectorAll('header a[href*="/consultation/"]').length,
    stories: document.querySelectorAll('.v8-story').length,
    storyConsults: [...document.querySelectorAll('.v8-story a')].filter(link => new URL(link.href).pathname === '/consultation/').length,
    storyTitles: [...document.querySelectorAll('.v8-story h2')].map(title => title.textContent.replace(/\s+/g, ' ').trim()),
  }));
  await page.$eval('[data-v8-event="home_portfolio_cta_click"]', link => link.addEventListener('click', event => event.preventDefault()));
  await page.click('[data-v8-event="home_portfolio_cta_click"]');
  const homeEvents = await page.evaluate(() => (window.dataLayer || []).map(item => item.event).filter(Boolean));

  await page.goto(base + 'portfolio.html', {waitUntil: 'domcontentloaded'});
  const portfolio = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.v8-grid')).gridTemplateColumns.split(' ').length,
    firstPair: [...document.querySelectorAll('.v8-grid article a')].slice(0, 2).every(link => link.getAttribute('href') === 'case-hwamyeong-kolong.html'),
    cardConsults: document.querySelectorAll('.v8-grid a[href*="/consultation/"]').length,
  }));
  for (const selector of ['[data-v8-event="portfolio_project_open"]', '[data-v8-event="portfolio_consult_click"]']) {
    await page.$eval(selector, link => link.addEventListener('click', event => event.preventDefault()));
    await page.click(selector);
  }
  const events = await page.evaluate(() => (window.dataLayer || []).map(item => item.event).filter(Boolean));
  await page.click('[data-filter="house"]');
  const empty = await page.evaluate(() => !document.querySelector('.v8-empty').hidden);
  await page.setViewport({width: 360, height: 800});
  const mobileColumns = await page.$eval('.v8-grid', grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);

  const requiredEvents = ['home_portfolio_cta_click', 'portfolio_project_open', 'portfolio_consult_click'];
  if (!home.font || home.canonical !== 'https://spacebogam.kr/' || !home.robots.startsWith('index,follow') || home.mainLinks !== 4 || home.forms !== 0 || home.consults !== 1 ||
      home.stories !== 3 || home.storyConsults !== 3 ||
      !['보이지 않던 문제', '가능한 조건', '사는 방식을'].every(fragment => home.storyTitles.some(title => title.includes(fragment))) ||
      portfolio.columns !== 2 || !portfolio.firstPair || portfolio.cardConsults !== 0 || mobileColumns !== 1 || !empty ||
      !homeEvents.includes(requiredEvents[0]) || !requiredEvents.slice(1).every(event => events.includes(event))) {
    throw new Error(`CMP-803 check failed: ${JSON.stringify({home, portfolio, mobileColumns, empty, homeEvents, events})}`);
  }

  console.log('CMP-803 PASS: 6 renders, SUIT, SEO, V8 flow, filters and 3 conversion events');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
