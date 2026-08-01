const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'g4-private/g4-tracking.js'), 'utf8');

function store(values = {}) {
  const data = new Map(Object.entries(values));
  return {getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)), data};
}

function run(search, localStorage = store()) {
  let click;
  const link = {href: 'https://spacebogam.kr/g4-private/sajik-42.html', dataset: {event: 'portfolio_project_open', placement: 'portfolio_grid', cta: 'view_case'}};
  const body = {dataset: {page: 'portfolio', creative: 'g4_editorial_web_v1', promise: 'living_before_decoration', landing: 'g4_private_home'}};
  const sandbox = {
    URL, URLSearchParams, Date, Math, Object, JSON, Promise,
    location: {search, pathname: '/g4-private/index.html', href: 'https://spacebogam.kr/g4-private/index.html' + search},
    localStorage, sessionStorage: store(), dataLayer: [],
    crypto: {randomUUID: () => 'event-id'}, IntersectionObserver: undefined,
    document: {body, querySelector: () => null, addEventListener: (_name, handler) => { click = handler; }},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  click({target: {closest: () => link}});
  return {events: sandbox.dataLayer, localStorage, link};
}

test('first UTM survives navigation and one click emits one anonymous event', () => {
  const first = run('?utm_source=meta&utm_medium=paid_social&utm_campaign=g4_case_proof_paid&utm_content=case_proof_static_v1&is_test=1');
  const second = run('?utm_source=internal&utm_campaign=overwrite_attempt', first.localStorage);

  assert.equal(first.events.filter(event => event.event === 'portfolio_project_open').length, 1);
  assert.equal(first.events[1].utm_campaign, 'g4_case_proof_paid');
  assert.equal(first.events[1].is_test, true);
  assert.equal(second.events[0].utm_source, 'meta');
  assert.equal(second.link.href, 'https://spacebogam.kr/g4-private/sajik-42.html');
  for (const event of first.events) assert.deepEqual(Object.keys(event).filter(key => /name|phone|address|email|message/i.test(key)), []);
});

test('actual lead remains gated by the shared consultation success response', () => {
  const consultation = fs.readFileSync(path.join(root, 'assets/consultation-form.js'), 'utf8');
  assert.match(consultation, /if \(!response\.ok\) throw new Error/);
  assert.ok(consultation.indexOf("trackGtag('lead_submit_success'") > consultation.indexOf('submitSucceeded = true'));
  assert.equal((source.match(/lead_submit_success/g) || []).length, 0, 'preview clicks must never emit leads');
});

test('all requested paths and private-page safety markers are wired', () => {
  const pages = ['index.html', 'sajik-42.html', 'sajik-32.html', 'mega-49.html', 'geoje-47.html', 'about.html']
    .map(name => fs.readFileSync(path.join(root, 'g4-private', name), 'utf8'));
  const cases = pages.slice(1, 5);
  const joined = pages.join('\n');

  for (const event of ['portfolio_project_open', 'case_gallery_open', 'case_related_story_open', 'phone_click', 'consultation_click']) {
    assert.match(joined, new RegExp(`data-event="${event}"`));
  }
  for (const page of pages) {
    assert.match(page, /noindex,nofollow,noarchive/);
    assert.equal((page.match(/g4-tracking\.js/g) || []).length, 1);
  }
  for (const page of cases) assert.ok((page.match(/data-event="case_gallery_open"/g) || []).length >= 2);
});

test('every local image, script, stylesheet, and navigation target exists', () => {
  const directory = path.join(root, 'g4-private');
  for (const name of ['index.html', 'sajik-42.html', 'sajik-32.html', 'mega-49.html', 'geoje-47.html', 'about.html']) {
    const html = fs.readFileSync(path.join(directory, name), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = match[1].split(/[?#]/)[0];
      if (!target || target.startsWith('http') || target.startsWith('tel:')) continue;
      assert.ok(fs.existsSync(path.resolve(directory, target)), `${name}: missing ${target}`);
    }
  }
});
