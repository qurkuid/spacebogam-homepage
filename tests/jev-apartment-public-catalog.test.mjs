import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createIsolatedCatalogServer } from '../artifacts/consultation-jev-data-20261029/jev-candidate/isolated-runner.mjs';
import { publicApartmentCatalogLimits } from '../artifacts/consultation-jev-data-20261029/jev-candidate/public-apartment-catalog.mjs';

async function fixture(handler) {
  const calls = [];
  const server = createIsolatedCatalogServer({ fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { calls, origin, close: async () => { server.close(); await once(server, 'close'); } };
}

const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

test('public dataset strips every non-public apartment field and sends no request credentials', async t => {
  const app = await fixture(() => json({
    cols: ['apartmentName','apartmentId','roadAddress','legacyAddress','planPic','customerId','privateNote'],
    rows: [['테스트아파트','APT_1234','부산 해운대구 테스트로 1','부산 해운대구 테스트동 1','secret.webp',991,'customer memo']],
  }));
  t.after(app.close);
  const response = await fetch(app.origin + '/api/public/apartments/dataset', { headers: { Cookie: 'caller=secret', Authorization: 'Bearer caller-secret' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(await response.json(), {
    source: 'jev-public-apartment-catalog',
    cols: ['apartmentName','apartmentId','roadAddress','legacyAddress'],
    rows: [['테스트아파트','APT_1234','부산 해운대구 테스트로 1','부산 해운대구 테스트동 1']],
  });
  assert.equal(app.calls[0].url, 'https://apt.intm.kr/api/apartments/dataset');
  assert.equal(app.calls[0].options.method, 'GET');
  assert.equal(app.calls[0].options.redirect, 'error');
  assert.equal(app.calls[0].options.headers, undefined);
  assert(app.calls[0].options.signal instanceof AbortSignal);
});

test('public plans returns only type, planId, and name', async t => {
  const app = await fixture(() => json({ code: 'OK', data: [{
    type: '84A㎡', planId: 'PLAN_84A', name: '84A 기본형', planPic: 'secret.webp', vector: { rooms: [] }, customerId: 12,
  }] }));
  t.after(app.close);
  const response = await fetch(app.origin + '/api/public/apartments/APT_1234/plans');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { source: 'jev-public-apartment-catalog', code: 'OK', data: [{ type: '84A㎡', planId: 'PLAN_84A', name: '84A 기본형' }] });
  assert.equal(app.calls[0].url, 'https://apt.intm.kr/api/apartments/APT_1234/plans');
  assert.equal(app.calls[0].options.headers, undefined);
});

test('only the two public GET routes bypass authentication', async t => {
  const app = await fixture(() => { throw new Error('must not fetch'); });
  t.after(app.close);
  assert.equal((await fetch(app.origin + '/api/consultation/apartments')).status, 401);
  assert.equal((await fetch(app.origin + '/api/consultation/customers')).status, 401);
  const post = await fetch(app.origin + '/api/public/apartments/dataset', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  assert.equal((await fetch(app.origin + '/api/public/apartments/x/plans')).status, 400);
  assert.equal((await fetch(app.origin + '/api/public/apartments/APT.1234/plans')).status, 400);
  assert.equal(app.calls.length, 0);
});

test('redirect, upstream error, malformed response, and oversized response fail closed', async t => {
  const modes = [
    () => { throw new TypeError('redirect mode is set to error'); },
    () => new Response('{"error":"upstream"}', { status: 503 }),
    () => json({ cols: ['apartmentName'], rows: [] }),
    () => new Response('{}', { status: 200, headers: { 'content-length': String(publicApartmentCatalogLimits.maxResponseBytes + 1) } }),
  ];
  for (const handler of modes) {
    const app = await fixture(handler);
    const response = await fetch(app.origin + '/api/public/apartments/dataset');
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: '공개 아파트 목록을 불러오지 못했습니다.' });
    await app.close();
  }
});

test('catalog security limits are fixed', () => {
  assert.deepEqual(publicApartmentCatalogLimits, {
    maxResponseBytes: 12 * 1024 * 1024,
    timeoutMs: 30_000,
    upstreamOrigin: 'https://apt.intm.kr',
  });
});
