'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');
const { createReviewsHandler } = require('../ops/spacebogam-reviews');

const serverFile = path.resolve('ops/spacebogam-serve.js');
const cliFile = path.resolve('ops/spacebogam-reviews.js');

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function request(port, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function startServer(root, store, port) {
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverFile, root, String(port)], {
    env: { ...process.env, ROOT: root, PORT: String(port), REVIEWS_FILE: store, REVIEWS_PUBLIC_ORIGIN: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  await once(child.stdout, 'data');
  return {
    child, origin,
    stderr: () => stderr,
    async stop() { child.kill(); await once(child, 'exit'); },
  };
}

function payload(overrides = {}) {
  return {
    rating: 5,
    title: '생활이 편해진 집이에요',
    body: '수납과 동선을 함께 정리해서 실제로 살아보니 훨씬 편해졌습니다.',
    nickname: '해운대고객',
    space: 'apartment',
    experienceMonth: '2026-10',
    consent: true,
    consentVersion: 'reviews-2026-11-04',
    website: '',
    ...overrides,
  };
}

async function submit(server, port, value, key = crypto.randomUUID(), headers = {}) {
  return request(port, '/api/reviews', {
    method: 'POST',
    headers: { Origin: server.origin, 'Content-Type': 'application/json', 'Idempotency-Key': key, ...headers },
    body: JSON.stringify(value),
  });
}

const crypto = require('node:crypto');

test('review API persists pending submissions and publishes only operator-approved reviews', { timeout: 30000 }, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'spacebogam-reviews-'));
  const root = path.join(base, 'public', 'current');
  const store = path.join(base, 'private', 'reviews.json');
  fs.mkdirSync(path.join(root, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>');
  fs.copyFileSync(path.resolve('reviews/index.html'), path.join(root, 'reviews/index.html'));
  assert.throws(() => createReviewsHandler({ root, reviewsFile: path.join(root, 'reviews-data.json') }), /outside public root/);
  const port = await freePort();
  let server = await startServer(root, store, port);
  t.after(async () => {
    if (server.child.exitCode === null) await server.stop();
    fs.rmSync(base, { recursive: true, force: true });
  });

  await t.test('strict request boundary and validation', async () => {
    for (const alias of ['/reviews?rating=5', '/reviews/index.html?q=%EC%A7%91']) {
      const redirected = await request(port, alias);
      assert.equal(redirected.status, 308);
      assert.equal(redirected.headers.location, `/reviews/${alias.slice(alias.indexOf('?'))}`);
    }
    const headAlias = await request(port, '/reviews', { method: 'HEAD' });
    assert.equal(headAlias.status, 308);
    assert.equal(headAlias.text, '');
    const forbidden = await request(port, '/api/reviews', { method: 'POST', headers: { Origin: 'https://evil.example', Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(payload()) });
    assert.equal(forbidden.status, 403);
    assert.equal((await request(port, '/api/reviews', { method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'text/plain', 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })).status, 415);
    assert.equal((await submit(server, port, payload({ rating: 6 }))).status, 400);
    assert.equal((await submit(server, port, payload({ title: '<b>광고</b>' }))).status, 400);
    assert.equal((await submit(server, port, payload({ experienceMonth: '2099-01' }))).status, 400);
    assert.equal((await submit(server, port, payload({ experienceMonth: '1899-12' }))).status, 400);
    assert.equal((await submit(server, port, payload({ consent: false }))).status, 400);
    assert.equal((await submit(server, port, payload({ consentVersion: 'old-version' }))).status, 400);
    assert.equal((await submit(server, port, payload({ website: 'bot' }))).status, 400);
    const oversizedBody = 'x'.repeat(17 * 1024);
    const large = await request(port, '/api/reviews', { method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'Content-Length': String(Buffer.byteLength(oversizedBody)) }, body: oversizedBody });
    assert.equal(large.status, 413);
  });

  let firstId;
  let secondId;
  await t.test('pending, idempotency, moderation and restart persistence', async () => {
    const key = crypto.randomUUID();
    const first = await submit(server, port, payload(), key);
    assert.equal(first.status, 201);
    firstId = JSON.parse(first.text).id;
    assert.equal(JSON.parse(first.text).status, 'received');
    assert.match(firstId, /^[0-9a-f-]{36}$/);
    const duplicate = await submit(server, port, payload(), key);
    assert.equal(duplicate.status, 200);
    assert.equal(JSON.parse(duplicate.text).id, firstId);
    assert.equal(JSON.parse(duplicate.text).status, 'received');
    assert.equal((await submit(server, port, payload({ title: '서로 다른 후기 제목입니다' }), key)).status, 409);
    secondId = JSON.parse((await submit(server, port, payload({ rating: 3, title: '아쉬움도 있었지만 편해졌어요', nickname: '동래고객', space: 'house' }))).text).id;

    let listing = JSON.parse((await request(port, '/api/reviews')).text);
    assert.equal(listing.stats.reviewCount, 0);
    assert.equal(listing.reviews.length, 0);
    const pendingDetail = await request(port, `/reviews/${firstId}/`);
    assert.equal(pendingDetail.status, 404);
    assert.match(pendingDetail.text, /name="robots" content="noindex,nofollow"/);
    assert.ok(!(await request(port, '/reviews/sitemap.xml')).text.includes(firstId));

    const env = { ...process.env, ROOT: root, REVIEWS_FILE: store };
    execFileSync(process.execPath, [cliFile, 'approve', firstId, '--customer', 'customer-a'], { env });
    execFileSync(process.execPath, [cliFile, 'approve', secondId, '--customer', 'customer-a'], { env });
    const firstPublishedAt = JSON.parse(fs.readFileSync(store, 'utf8')).reviews.find(review => review.id === firstId).publishedAt;
    execFileSync(process.execPath, [cliFile, 'approve', firstId, '--customer', 'customer-a'], { env });
    const idempotentlyApproved = JSON.parse(fs.readFileSync(store, 'utf8')).reviews.find(review => review.id === firstId);
    assert.equal(idempotentlyApproved.publishedAt, firstPublishedAt);
    assert.throws(() => execFileSync(process.execPath, [cliFile, 'approve', firstId, '--customer', 'customer-b'], { env, stdio: 'pipe' }));
    assert.equal(JSON.parse(fs.readFileSync(store, 'utf8')).reviews.find(review => review.id === firstId).customerId, 'customer-a');
    await server.stop();
    server = await startServer(root, store, port);

    listing = JSON.parse((await request(port, '/api/reviews')).text);
    assert.deepEqual(listing.stats, { reviewCount: 2, customerCount: 1, totalRating: 8, averageRating: 4, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } });
    assert.equal(listing.reviews.length, 2);
    assert.ok(listing.reviews.every(review => !('customerId' in review) && !('status' in review) && !('idempotencyKey' in review)));
    const detail = await request(port, `/reviews/${firstId}/`);
    assert.equal(detail.status, 200);
    assert.ok(detail.text.includes(`<link rel="canonical" href="${server.origin}/reviews/${firstId}/">`));
    assert.match(detail.text, /name="robots" content="index,follow,max-snippet:-1"/);
    assert.ok(!detail.text.includes('customer-a'));
    assert.ok((await request(port, '/reviews/sitemap.xml')).text.includes(firstId));
    assert.ok(execFileSync(process.execPath, [cliFile, 'list'], { env, encoding: 'utf8' }).includes(firstId));
    const shown = JSON.parse(execFileSync(process.execPath, [cliFile, 'show', firstId], { env, encoding: 'utf8' }));
    assert.equal(shown.body, payload().body);
    assert.equal(shown.status, 'approved');
    assert.ok(shown.createdAt);
    assert.ok(!('customerId' in shown) && !('idempotencyKey' in shown) && !('fingerprint' in shown) && !('consentVersion' in shown) && !('consentedAt' in shown));
    const privateRecord = JSON.parse(fs.readFileSync(store, 'utf8')).reviews.find(review => review.id === firstId);
    assert.equal(privateRecord.consentVersion, 'reviews-2026-11-04');
    assert.equal(privateRecord.consentedAt, privateRecord.createdAt);
  });

  await t.test('filtering, sorting, truthful SSR and private-data escaping', async () => {
    const filtered = JSON.parse((await request(port, '/api/reviews?rating=3&space=house&q=%EC%95%84%EC%89%AC%EC%9B%80&sort=lowest&page=999')).text);
    assert.equal(filtered.pagination.page, 1);
    assert.equal(filtered.pagination.total, 1);
    assert.equal(filtered.reviews[0].id, secondId);
    assert.equal(filtered.stats.reviewCount, 2, 'filters do not alter aggregate statistics');

    const data = JSON.parse(fs.readFileSync(store, 'utf8'));
    data.reviews.push({ id: crypto.randomUUID(), rating: 1, title: '<script>alert(1)</script>', body: '나쁜 점 & 좋은 점을 모두 남겼습니다.', nickname: '<관리자>', space: 'commercial', experienceMonth: '2026-01', status: 'approved', customerId: 'private-customer', createdAt: '2026-10-31T00:00:00.000Z', consentedAt: '2026-10-31T00:00:00.000Z', consentVersion: 'reviews-2026-11-04', idempotencyKey: crypto.randomUUID(), fingerprint: 'a'.repeat(64), publishedAt: '2026-11-01T00:00:00.000Z' });
    fs.writeFileSync(store, JSON.stringify(data));
    const page = await request(port, '/reviews/');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!page.text.includes('<script>alert(1)</script>'));
    assert.ok(!page.text.includes('private-customer'));
    assert.ok(page.text.includes('공개된 후기 기준 · 전체 시공 고객 수가 아닙니다.'));
    assert.ok(!page.text.includes(',<a href="/reviews/'), 'pagination output has no array commas');
    assert.equal((await request(port, '/reviews/', { method: 'HEAD' })).text, '');
  });

  await t.test('rate limit uses socket peer unless an explicit proxy is trusted', async () => {
    await server.stop();
    server = await startServer(root, store, port);
    for (let index = 0; index < 5; index++) assert.equal((await submit(server, port, payload({ title: `추가 후기 제목 ${index}번입니다`, nickname: `고객${index}번` }))).status, 201);
    assert.equal((await submit(server, port, payload({ title: '제한을 넘긴 후기 제목입니다', nickname: '제한고객' }))).status, 429);
  });

  await t.test('corrupt data fails closed and never reports fictional zero statistics', async () => {
    fs.writeFileSync(store, '{broken');
    const api = await request(port, '/api/reviews');
    assert.equal(api.status, 503);
    assert.ok(!api.text.includes('reviewCount'));
    const page = await request(port, '/reviews/');
    assert.equal(page.status, 503);
    assert.ok(!page.text.includes('후기 남긴 고객'));
    const baseReview = { id: crypto.randomUUID(), rating: 5, title: '구조 검증용 후기입니다', body: '저장 행의 구조가 손상되면 통계를 만들지 않아야 합니다.', nickname: '검증고객', space: 'apartment', experienceMonth: '2026-01', status: 'approved', customerId: 'customer-structure', createdAt: '2026-10-31T00:00:00.000Z', consentedAt: '2026-10-31T00:00:00.000Z', consentVersion: 'reviews-2026-11-04', idempotencyKey: crypto.randomUUID(), fingerprint: 'b'.repeat(64), publishedAt: '2026-11-01T00:00:00.000Z' };
    for (const broken of [
      { ...baseReview, rating: 6 },
      { ...baseReview, publishedAt: undefined },
      { ...baseReview, customerId: undefined },
      { ...baseReview, createdAt: 'not-a-date' },
    ]) {
      const raw = JSON.stringify({ version: 1, reviews: [broken] });
      fs.writeFileSync(store, raw);
      assert.equal((await request(port, '/api/reviews')).status, 503);
      assert.equal(fs.readFileSync(store, 'utf8'), raw, 'failed reads never overwrite malformed data');
    }
  });

  await t.test('store stays outside the public release and consent withdrawal deletes permanently', async () => {
    assert.ok(!path.resolve(store).startsWith(path.resolve(root) + path.sep));
    assert.equal((await request(port, '/../private/reviews.json')).status, 403);
    const safe = { version: 1, reviews: [{ id: firstId, rating: 5, title: '삭제할 후기입니다', body: '삭제 요청을 확인하기 위한 충분히 긴 후기 내용입니다.', nickname: '삭제고객', space: 'apartment', experienceMonth: '2026-01', status: 'approved', customerId: 'customer-a', createdAt: '2026-10-31T00:00:00.000Z', consentedAt: '2026-10-31T00:00:00.000Z', consentVersion: 'reviews-2026-11-04', idempotencyKey: crypto.randomUUID(), fingerprint: 'c'.repeat(64), publishedAt: '2026-11-01T00:00:00.000Z' }] };
    fs.writeFileSync(store, JSON.stringify(safe));
    execFileSync(process.execPath, [cliFile, 'delete', firstId], { env: { ...process.env, ROOT: root, REVIEWS_FILE: store } });
    assert.equal(JSON.parse(fs.readFileSync(store, 'utf8')).reviews.length, 0);
  });
});
