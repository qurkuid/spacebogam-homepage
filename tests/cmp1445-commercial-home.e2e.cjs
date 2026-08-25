const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const puppeteer = require('puppeteer');

const baseUrl = (process.env.CMP1445_HOME_E2E_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const liveSubmit = process.env.CMP1445_HOME_E2E_LIVE_SUBMIT === '1';
const qaSecret = process.env.CONSULTATION_QA_HMAC_SECRET || '';
const qaName = process.env.CMP1445_QA_NAME || '[QA] CMP-1445';
const qaPhone = process.env.CMP1445_QA_PHONE || '010-0000-0000';
if (liveSubmit && (qaSecret.length < 32 || !process.env.CMP1445_QA_NAME || !process.env.CMP1445_QA_PHONE)) {
  throw new Error('Live QA requires CONSULTATION_QA_HMAC_SECRET, CMP1445_QA_NAME, and CMP1445_QA_PHONE');
}
const query = new URLSearchParams({
  type: 'commercial', vertical: 'office', utm_source: 'meta', utm_campaign: 'cmp1445_qa',
  utm_content: 'office_creative', utm_term: 'office_interior', campaign_id: 'campaign-test',
  adset_id: 'adset-test', ad_id: 'ad-test', is_test: '1',
});

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    let submittedPayload;
    page.on('request', (request) => {
      if (request.url().includes('/api/consultation/submit') && request.method() === 'OPTIONS') {
        if (liveSubmit) {
          request.continue();
          return;
        }
        request.respond({ status: 204, headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type',
        }});
        return;
      }
      if (request.url().includes('/api/consultation/submit') && request.method() === 'POST') {
        submittedPayload = JSON.parse(request.postData() || '{}');
        if (liveSubmit) {
          const timestamp = String(Date.now());
          const signature = createHmac('sha256', qaSecret)
            .update(`${timestamp}.${submittedPayload.marketingAttribution.sbSubmitEventId}`)
            .digest('hex');
          request.continue({ headers: {
            ...request.headers(),
            'x-spacebogam-qa-timestamp': timestamp,
            'x-spacebogam-qa-signature': signature,
          }});
          return;
        }
        setTimeout(() => request.respond({
          status: 201,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ success: true, consultReqId: 1445, leadEventId: submittedPayload.marketingAttribution.sbSubmitEventId }),
        }), 800);
        return;
      }
      if (request.url().includes('/api/marketing/funnel-events')) {
        if (liveSubmit) {
          request.continue();
          return;
        }
        request.respond({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
        return;
      }
      request.continue();
    });

    await page.goto(`${baseUrl}/consultation/?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[name="qname"]');
    assert.equal(await page.title(), '부산 상업공간 인테리어 상담 신청 | 공간보감');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));

    let keyboardReachedForm = false;
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.getAttribute('name') === 'qname')) {
        keyboardReachedForm = true;
        break;
      }
    }
    assert.ok(keyboardReachedForm, '상업 폼 첫 입력은 키보드로 도달 가능해야 한다');

    await page.type('[name="qname"]', qaName);
    await page.type('[name="qphone"]', qaPhone);
    await page.select('[name="qvertical"]', 'office');
    await page.type('[name="qaddress"]', '부산 테스트구 테스트로');
    await page.type('[name="qarea"]', '40');
    await page.select('[name="qcurrentState"]', 'vacant');
    await page.$eval('[name="qopenDate"]', (element) => { element.value = '2026-12-31'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.select('[name="qbudget"]', '50_100m');
    await page.select('[name="qcallbackTime"]', 'weekday_pm');
    await page.click('#cf-consent-input');
    await page.click('button.cf-submit');
    assert.equal(await page.$eval('button.cf-submit', (element) => element.disabled), true);
    await page.waitForFunction(() => window.dataLayer?.some((item) => item.event === 'form_submit'));

    assert.equal(submittedPayload.type, 'commercial');
    assert.equal(submittedPayload.marketingAttribution.utm_source, 'meta');
    assert.equal(submittedPayload.marketingAttribution.campaign_id, 'campaign-test');
    assert.equal(submittedPayload.marketingAttribution.adset_id, 'adset-test');
    assert.equal(submittedPayload.marketingAttribution.ad_id, 'ad-test');
    assert.ok(await page.evaluate(() => window.dataLayer.some((item) => item.event === 'form_start')));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
