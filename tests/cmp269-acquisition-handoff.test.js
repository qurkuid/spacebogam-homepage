/**
 * CMP-269/CMP-200 — paid acquisition survives the full local consultation
 * journey without recursively growing CTA URLs.
 *
 * Every fetch is intercepted. The form submission assertion inspects the
 * outgoing JSON payload only; no production request or real consultation is
 * made.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const siteSource = fs.readFileSync(path.join(root, 'assets/site-tracking.js'), 'utf8');
const funnelSource = fs.readFileSync(path.join(root, 'assets/funnel-tracking.js'), 'utf8');
const formSource = fs.readFileSync(path.join(root, 'assets/consultation-form.js'), 'utf8');
const applySource = fs.readFileSync(path.join(root, 'consultation/apply/index.html'), 'utf8');

const ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
const FIRST_TOUCH_ATTRIBUTION_KEY = 'spacebogam_funnel_first_touch_attribution';
const JOURNEY_KEY = 'spacebogam_funnel_journey';
const ACQUISITION = {
  utm_source: 'meta',
  utm_medium: 'paid_social',
  utm_campaign: 'cmp269_paid',
  utm_content: 'home_b_hero',
  utm_term: 'busan interior',
  gclid: 'gclid-269',
  gbraid: 'gbraid-269',
  wbraid: 'wbraid-269',
  fbclid: 'fbclid-269',
  msclkid: 'msclkid-269',
  n_keyword: '부산인테리어',
  n_query: '부산 인테리어',
  n_campaign_type: '파워링크',
  n_ad_group: '부산',
  n_keyword_id: 'naver-keyword-269',
  utm_id: 'meta-campaign-269',
  campaign_id: 'campaign-269',
  adset_id: 'adset-269',
  ad_id: 'ad-269',
  asset_id: 'asset-269',
};
const ACQUISITION_KEYS = Object.keys(ACQUISITION);

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    values,
  };
}

function query(values) {
  return new URLSearchParams(values).toString();
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle(count = 8) {
  for (let i = 0; i < count; i += 1) await tick();
}

async function trackerPage({
  pathname,
  search = '',
  anchorHref,
  localStorage,
  sessionStorage,
  referrer = 'https://search.example/paid-entry',
}) {
  const dom = new JSDOM(
    `<!doctype html><html><head><title>QA</title></head><body>` +
      `<a id="consult" class="button" href="${anchorHref}">상담 신청</a></body></html>`,
    {
      url: `https://spacebogam.kr${pathname}${search}`,
      referrer,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  );
  const { window } = dom;
  Object.defineProperty(window, 'localStorage', { value: localStorage });
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorage });

  const fetches = [];
  window.fetch = (url, init) => {
    fetches.push({ url: String(url), init });
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) });
  };
  window.eval(siteSource);
  window.eval(funnelSource);
  await settle();

  const anchor = window.document.querySelector('#consult');
  anchor.addEventListener('click', (event) => event.preventDefault());
  return { dom, window, anchor, fetches, href: anchor.getAttribute('href') };
}

async function paidLanding() {
  const localStorage = storage();
  const sessionStorage = storage();
  const landing = await trackerPage({
    pathname: '/',
    search: `?${query(ACQUISITION)}`,
    anchorHref: '/consultation/',
    localStorage,
    sessionStorage,
  });
  return { localStorage, sessionStorage, landing };
}

function assertAcquisition(url, message) {
  for (const [key, value] of Object.entries(ACQUISITION)) {
    assert.equal(url.searchParams.get(key), value, `${message}: ${key}`);
  }
}

async function submitStoredForm(localStorage, sessionStorage, search = '?source_page=%2Fconsultation%2F') {
  const dom = new JSDOM(applySource.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url: `https://spacebogam.kr/consultation/apply/${search}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  Object.defineProperty(window, 'localStorage', { value: localStorage });
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorage });

  const calls = { questions: 0, funnel: [], submit: [] };
  window.fetch = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (String(url).includes('/api/consultation/questions')) {
      calls.questions += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          questions: [
            {
              id: 13,
              question: '성함을 알려주세요.',
              questionType: 'short_answer',
              options: null,
              isRequired: true,
            },
          ],
        }),
      });
    }
    if (String(url).includes('/api/marketing/funnel-events')) {
      calls.funnel.push(body);
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) });
    }
    if (String(url).includes('/api/consultation/submit')) {
      calls.submit.push(body);
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          success: true,
          consultReqId: 269,
          leadEventId: body.marketingAttribution.sbSubmitEventId,
        }),
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  window.fbq = () => {};
  window.gtag = () => {};
  window.eval(formSource);
  await settle(12);

  window.document.querySelector('[name="q13"]').value = 'CMP-269 스텁';
  window.document.querySelector('#cf-consent-input').checked = true;
  window.document.querySelector('form').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  );
  await settle(12);
  return { dom, calls };
}

test('full acquisition snapshot stores and relays UTM, click, platform, and Naver ids', async () => {
  const { localStorage, landing } = await paidLanding();
  const stored = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY));

  assert.ok(stored.expiresAt > Date.now());
  assert.deepEqual(stored.values, ACQUISITION);
  assertAcquisition(new URL(landing.href), 'home → consultation relay');
  assert.ok(landing.fetches.length > 0, 'tracker fetches must be intercepted by the stub');
  landing.dom.window.close();
});

test('paid attribution survives home → consultation → apply with queryless later pages and reaches form payload', async () => {
  const { localStorage, sessionStorage, landing } = await paidLanding();
  const consultation = await trackerPage({
    pathname: '/consultation/',
    anchorHref: '/consultation/apply/?ref=spacebogam_consultation',
    localStorage,
    sessionStorage,
  });

  const storedAfterSecondHop = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY));
  assert.deepEqual(storedAfterSecondHop.values, ACQUISITION);
  assertAcquisition(new URL(consultation.href), 'consultation → apply relay');

  const { dom, calls } = await submitStoredForm(localStorage, sessionStorage);
  assert.equal(calls.questions, 1);
  assert.equal(calls.submit.length, 1, 'the stubbed submit payload should be captured once');
  const attribution = calls.submit[0].marketingAttribution;
  for (const [key, value] of Object.entries(ACQUISITION)) {
    assert.equal(attribution[key], value, `form payload: ${key}`);
  }
  assert.equal(attribution.source_page, '/consultation/');
  assert.equal(attribution.landing_page, `https://spacebogam.kr/?${query(ACQUISITION)}`);
  assert.equal(attribution.referrer, 'https://search.example/paid-entry');

  landing.dom.window.close();
  consultation.dom.window.close();
  dom.window.close();
});

test('self-referral cannot overwrite paid storage or blend its static channel fields', async () => {
  const { localStorage, sessionStorage, landing } = await paidLanding();
  const paidSnapshot = localStorage.getItem(ATTRIBUTION_KEY);
  const selfReferral = await trackerPage({
    pathname: '/consultation/',
    search: '?utm_source=spacebogam.kr&utm_medium=consultation_page&utm_campaign=spacebogam_site',
    anchorHref:
      'https://intm.kr/consultation/ggbg?utm_source=spacebogam.kr' +
      '&utm_medium=consultation_page&utm_campaign=spacebogam_site',
    localStorage,
    sessionStorage,
  });

  assert.equal(localStorage.getItem(ATTRIBUTION_KEY), paidSnapshot);
  const decorated = new URL(selfReferral.href);
  assertAcquisition(decorated, 'self-referral relay');
  assert.equal(decorated.searchParams.get('utm_medium'), ACQUISITION.utm_medium);
  assert.equal(decorated.searchParams.get('utm_campaign'), ACQUISITION.utm_campaign);
  assert.notEqual(decorated.searchParams.get('utm_medium'), 'consultation_page');
  assert.notEqual(decorated.searchParams.get('utm_campaign'), 'spacebogam_site');

  landing.dom.window.close();
  selfReferral.dom.window.close();
});

test('self-hop submission uses one paid first-touch snapshot for every acquisition field', async () => {
  const paidFirstTouch = {
    ...ACQUISITION,
    utm_source: 'meta',
    utm_medium: 'paid_social',
    utm_campaign: 'paid-first',
    fbclid: 'first-click',
    campaign_id: 'first-campaign',
  };
  const selfHop = Object.fromEntries(
    ACQUISITION_KEYS.map((key) => [key, `self-hop-${key}`]),
  );
  Object.assign(selfHop, {
    utm_source: 'spacebogam.kr',
    utm_medium: 'consultation_page',
    utm_campaign: 'spacebogam_site',
    fbclid: 'self-hop-click',
    campaign_id: 'self-hop-campaign',
  });
  const localStorage = storage({
    [FIRST_TOUCH_ATTRIBUTION_KEY]: JSON.stringify({
      values: paidFirstTouch,
      expiresAt: Date.now() + 60_000,
    }),
  });
  const sessionStorage = storage();

  const { dom, calls } = await submitStoredForm(
    localStorage,
    sessionStorage,
    `?source_page=%2Fconsultation%2F&${query(selfHop)}`,
  );

  assert.equal(calls.submit.length, 1, 'the stubbed submit payload should be captured once');
  const submittedAcquisition = Object.fromEntries(
    ACQUISITION_KEYS.map((key) => [key, calls.submit[0].marketingAttribution[key]]),
  );
  assert.deepEqual(submittedAcquisition, paidFirstTouch);

  dom.window.close();
});

test('same-origin and legacy cross-domain decoration stays bounded across repeated hops', async () => {
  const { localStorage, sessionStorage, landing } = await paidLanding();
  const recursive =
    `?landing_page=${encodeURIComponent('https://spacebogam.kr/?landing_page=' + 'x'.repeat(4000))}` +
    `&source_page=${encodeURIComponent('https://spacebogam.kr/consultation/?source_page=' + 'y'.repeat(4000))}`;
  const local = await trackerPage({
    pathname: '/consultation/',
    anchorHref: `/consultation/apply/${recursive}`,
    localStorage,
    sessionStorage,
  });

  const localLengths = [local.anchor.getAttribute('href').length];
  for (let i = 0; i < 8; i += 1) {
    local.anchor.dispatchEvent(new local.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    localLengths.push(local.anchor.getAttribute('href').length);
  }
  const localUrl = new URL(local.anchor.getAttribute('href'));
  assert.equal(localUrl.searchParams.get('landing_page'), null);
  assert.equal(localUrl.searchParams.get('referrer'), null);
  assert.equal(localUrl.searchParams.get('source_page'), '/consultation/');
  assert.equal(new Set(localLengths).size, 1, 'same-origin URL must not grow when redecorated');
  assert.ok(localLengths[0] < 2000, `same-origin URL unexpectedly long: ${localLengths[0]}`);

  const legacy = await trackerPage({
    pathname: '/consultation/',
    anchorHref:
      `https://intm.kr/consultation/ggbg${recursive}` +
      '&utm_source=spacebogam.kr&utm_medium=consultation_page&utm_campaign=spacebogam_site',
    localStorage,
    sessionStorage,
  });
  const legacyLengths = [legacy.anchor.getAttribute('href').length];
  for (let i = 0; i < 8; i += 1) {
    legacy.anchor.dispatchEvent(new legacy.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    legacyLengths.push(legacy.anchor.getAttribute('href').length);
  }
  const legacyUrl = new URL(legacy.anchor.getAttribute('href'));
  assertAcquisition(legacyUrl, 'legacy cross-domain relay');
  assert.equal(legacyUrl.searchParams.get('source_page'), '/consultation/');
  assert.equal(legacyUrl.searchParams.get('landing_page'), `https://spacebogam.kr/?${query(ACQUISITION)}`);
  assert.equal(legacyUrl.searchParams.get('referrer'), 'https://search.example/paid-entry');
  assert.ok(legacyUrl.searchParams.get('sbClientId'));
  assert.ok(legacyUrl.searchParams.get('sbSessionId'));
  assert.equal(new Set(legacyLengths).size, 1, 'legacy URL must not grow when redecorated');
  assert.ok(legacyLengths[0] < 3000, `legacy URL unexpectedly long: ${legacyLengths[0]}`);

  const journey = JSON.parse(sessionStorage.getItem(JOURNEY_KEY));
  assert.ok(journey.landing_page.length <= 1000);
  landing.dom.window.close();
  local.dom.window.close();
  legacy.dom.window.close();
});
