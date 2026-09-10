#!/usr/bin/env node
// CMP-1369 — 필수 항목 축소 전/후 상담 신청서 화면 캡처.
// before: 라이브 spacebogam.kr (배포 전 상태) / after: 로컬 작업 트리(CORS 때문에 질문 정의는 주입)
import { spawn } from 'node:child_process';
import puppeteer from '/Users/baegchangseog/.nvm/versions/node/v24.15.0/lib/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { qaEntryUrl } from './lib/qa-entry-url.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.QA_OUT || '/tmp';
const mode = process.argv[2] || 'after'; // before | after
const PORT = 3099;

const questionsJson = await fetch('https://intm.kr/api/consultation/questions').then(r => r.text());
let server = null;
if (mode === 'after') {
  server = spawn('node', ['/Volumes/DATABASE/spacebogam/serve.js', '/Users/baegchangseog/spacebogam-homepage', String(PORT)], {stdio: 'ignore'});
  await new Promise(r => setTimeout(r, 800));
}
const url = mode === 'before'
  ? qaEntryUrl('https://spacebogam.kr/consultation/apply/', 'utm_source=qa_cmp1369_shot')
  : `http://127.0.0.1:${PORT}/consultation/apply/`;

const browser = await puppeteer.launch({executablePath: CHROME, headless: 'new', args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
  await page.evaluateOnNewDocument((qj) => {
    const orig = window.fetch;
    window.fetch = function(input, init){
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/api\/consultation\/questions/.test(u)) {
        return Promise.resolve(new Response(qj, {status: 200, headers: {'Content-Type': 'application/json'}}));
      }
      if (/\/api\/consultation\/submit|\/api\/marketing\/funnel-events/.test(u)) {
        return Promise.resolve(new Response('{}', {status: 200}));
      }
      return orig.apply(this, arguments);
    };
  }, questionsJson);
  await page.goto(url, {waitUntil: 'networkidle2'});
  await page.waitForSelector('.cf-field', {timeout: 20000});
  await new Promise(r => setTimeout(r, 600));
  const info = await page.evaluate(() => ({
    stars: document.querySelectorAll('.cf-required').length,
    primary: document.querySelectorAll('.cf-group:not(details) .cf-field').length
  }));
  console.log(mode, JSON.stringify(info));
  const form = await page.$('.cf-form');
  await form.screenshot({path: `${OUT}/cmp1369-${mode}.png`});
  console.log('saved', `${OUT}/cmp1369-${mode}.png`);
} finally {
  await browser.close();
  if (server) server.kill();
}
